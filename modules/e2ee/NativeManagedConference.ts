// Experimental RN conference owner. Dependencies are passed explicitly so the
// same lifecycle boundary can be tested without starting React Native.
/** Own native conference state without retaining a JavaScript key ring. */
export default class NativeManagedConference {
    PeerConnection: any;
    native: any;
    participant: string;
    id: string;
    peers: Map<number, any>;
    retiredEndpoints: WeakSet<object>;
    closed: boolean;
    closing: Promise<boolean>;
    bridge: any;

    /** Initialize owned state and validate the required platform dependencies. */
    constructor(PeerConnection, native, participant) {
        const methods = [ 'jitsiE2EEConferenceCreate', 'jitsiE2EEConferenceSetKey',
            'jitsiE2EEConferenceRemoveParticipant', 'jitsiE2EEConferenceClose',
            'jitsiE2EEBindReceiver', 'jitsiE2EEVerifySender', 'jitsiE2EERetirePeer', 'jitsiE2EERatchet' ];

        if (!PeerConnection.isNativeManagedE2EESupported?.()
                || methods.some(name => typeof native?.[name] !== 'function')) {
            throw new Error('Native managed E2EE is unavailable');
        }
        if (typeof participant !== 'string' || !participant) {
            throw new TypeError('Missing local participant');
        }
        this.PeerConnection = PeerConnection;
        this.native = native;
        this.participant = participant;
        this.id = native.jitsiE2EEConferenceCreate(participant);
        if (typeof this.id !== 'string' || !this.id) {
            throw new Error('Native conference creation failed');
        }
        this.peers = new Map();
        this.retiredEndpoints = new WeakSet();
        this.closed = false;
        this.closing = null;
        this.bridge = {
            bindReceiver: (receiver, id) => this.endpointOperation(receiver, 'getReceivers',
                peer => native.jitsiE2EEBindReceiver(this.id, peer._pcId, receiver._id, id)),
            close: () => this.close(),
            removeParticipant: async id => {
                if (this.closed) {
                    return false;
                }

                return await native.jitsiE2EEConferenceRemoveParticipant(this.id, id) === true;
            },
            setKey: async (id, material, index) => {
                if (this.closed) {
                    return false;
                }
                const bytes = material ? Array.from(material) : null;

                try {
                    return await native.jitsiE2EEConferenceSetKey(this.id, id, bytes, index) === true;
                } finally {
                    bytes?.fill(0);
                }
            },
            verifySender: (sender, kind, id) => this.endpointOperation(sender, 'getSenders',
                peer => native.jitsiE2EEVerifySender(this.id, peer._pcId, sender._id, kind, id))
        };
    }

    /** Attach protection at construction and gate SDP on the acknowledged local key. */
    createPeerConnection(configuration = {}) {
        if (this.closed) {
            throw new Error('Native conference closed');
        }
        const peer = new this.PeerConnection({
            ...configuration,
            jitsiE2EE: true,
            jitsiE2EEConference: this.id
        });

        if (this.peers.has(peer._pcId)) {
            peer.close();
            throw new Error('Duplicate native connection ID');
        }
        this.peers.set(peer._pcId, peer);

        return peer;
    }

    /** Require exact endpoint object ownership and ignore only explicitly retired objects. */
    async endpointOperation(endpoint, collection, operation) {
        if (this.closed) {
            return false;
        }
        const peer = this.peers.get(endpoint?._peerConnectionId);

        if (!peer?.[collection]().includes(endpoint)) {
            // Ignore only objects that belonged to a connection we explicitly
            // retired. A forged ID, foreign object, or ordinary PC is still rejected.
            return Boolean(endpoint) && this.retiredEndpoints.has(endpoint);
        }
        try {
            const accepted = await operation(peer);

            return this.peers.get(peer._pcId) === peer ? accepted === true : true;
        } catch (error) {
            if (this.peers.get(peer._pcId) !== peer) {
                return true;
            }
            throw error;
        }
    }

    /** Invalidate one PC immediately and await native retirement before closing it. */
    async retirePeerConnection(peer) {
        if (this.peers.get(peer?._pcId) !== peer) {
            return false;
        }
        for (const endpoint of [ ...peer.getSenders(), ...peer.getReceivers() ]) {
            this.retiredEndpoints.add(endpoint);
        }

        // Invalidate callbacks synchronously, before the native close can settle.
        this.peers.delete(peer._pcId);
        try {
            if (await this.native.jitsiE2EERetirePeer(this.id, peer._pcId) !== true) {
                throw new Error('Native connection retirement rejected');
            }

            return true;
        } catch (error) {
            await this.close();
            throw error;
        } finally {
            peer.close();
        }
    }

    /** Revoke the store and close every owned connection exactly once. */
    close() {
        if (this.closed) {
            return this.closing;
        }
        this.closed = true;
        const peers = [ ...this.peers.values() ];

        this.peers.clear();
        try {
            this.closing = Promise.resolve(this.native.jitsiE2EEConferenceClose(this.id));
        } catch (error) {
            this.closing = Promise.reject(error);
        }

        // Attempt every PC close even if a bridge call throws. Native conference
        // revocation was requested first; no sender/receiver can revive that store.
        const failures = [];

        for (const peer of peers) {
            try {
                peer.close();
            } catch (error) {
                failures.push(error);
            }
        }
        this.closing = this.closing.then(accepted => {
            if (accepted !== true || failures.length) {
                throw new Error('Native conference cleanup failed');
            }

            return true;
        });

        return this.closing;
    }
}
