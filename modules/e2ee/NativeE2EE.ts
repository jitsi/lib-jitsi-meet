import FeatureFlags from '../flags/FeatureFlags';
import Deferred from '../util/Deferred';

import NativeManagedConference from './NativeManagedConference';
import NativeManagedKeyContext from './NativeManagedKeyContext';

/** Native platform operations supplied before conference construction. */
export interface INativeE2EEProvider {
    RTCPeerConnection: typeof RTCPeerConnection & { isNativeManagedE2EESupported: () => boolean; };
    crypto: {
        importKey: (bytes: ArrayBuffer | Uint8Array) => Promise<any>;
        ratchet: (material: any) => Promise<ArrayBuffer>;
    };
    nativeModule: Record<string, (...args: any[]) => any>;
    platform: 'ios' | 'android';
}

let provider: INativeE2EEProvider;

/** Register native platform dependencies, never application-supplied media keys. */
export function registerNativeE2EE(value: INativeE2EEProvider): void {
    const methods = [ 'jitsiE2EEConferenceCreate', 'jitsiE2EEConferenceSetKey',
        'jitsiE2EEConferenceRemoveParticipant', 'jitsiE2EEConferenceClose',
        'jitsiE2EEBindReceiver', 'jitsiE2EEVerifySender', 'jitsiE2EERetirePeer', 'jitsiE2EERatchet' ];

    if (![ 'ios', 'android' ].includes(value?.platform) || !value.RTCPeerConnection?.isNativeManagedE2EESupported?.()
            || methods.some(name => typeof value.nativeModule?.[name] !== 'function')
            || typeof value.crypto?.importKey !== 'function' || typeof value.crypto?.ratchet !== 'function') {
        throw new Error('Native managed E2EE provider unavailable');
    }
    if (provider && (provider.RTCPeerConnection !== value.RTCPeerConnection
            || provider.nativeModule !== value.nativeModule || provider.crypto !== value.crypto)) {
        throw new Error('Native managed E2EE provider already registered');
    }
    provider = Object.freeze({
        ...value,
        crypto: value.crypto
    });
}

/** Return the registered native HKDF operations, without exposing media keys. */
export function getNativeE2EECrypto() {
    return provider && window.RTCPeerConnection === provider.RTCPeerConnection ? provider.crypto : undefined;
}

/** Require explicit managed mode and compatible effective feature flags. */
export function isNativeE2EESupported(config) {
    return config?.e2ee?.nativeManaged === true && Boolean(provider)
        && window.RTCPeerConnection === provider.RTCPeerConnection
        && provider.RTCPeerConnection.isNativeManagedE2EESupported()
        && !config.e2ee.externallyManagedKey && !config.e2ee.disabled
        && !config.testing?.disableE2EE && !FeatureFlags.isSsrcRewritingSupported()
        && !FeatureFlags.isRunInLiteModeEnabled();
}

/** Track original asynchronous callbacks without replacing the conference or its events. */
export class NativeE2EELifecycle {
    context: any;
    closed: boolean;
    pending: Map<Promise<unknown>, string>;
    listeners: Array<() => void>;

    /** Initialize owned state and validate the required platform dependencies. */
    constructor(context) {
        this.context = context;
        this.closed = false;
        this.pending = new Map();
        this.listeners = [];
    }

    /** Observe an original callback and retain it until its asynchronous continuation settles. */
    run(callback, args = [], participant?: string) {
        if (this.closed || this.context.closed || this.context.removed.has(participant)) {
            return Promise.resolve();
        }
        let result;

        try {
            result = callback(...args);
        } catch (error) {
            result = Promise.reject(error);
        }
        const promise = Promise.resolve(result);

        this.pending.set(promise, participant);
        promise.catch(error => {
            if (!this.closed && !this.context.closed && !this.context.removed.has(participant)) {
                this.context.fail(error);
            }
        }).finally(() => this.pending.delete(promise));

        return promise;
    }

    /** Subscribe to actual conference events through the native terminal gate. */
    listen(emitter, event, callback, allowRemoved = false) {
        const listener = (...args) => this.run(callback, args,
            allowRemoved ? undefined : typeof args[0] === 'string' ? args[0] : args[0]?.getId?.());

        emitter.on(event, listener);
        this.listeners.push(() => emitter.off(event, listener));
    }

    /** Remove subscriptions synchronously before draining outstanding callbacks. */
    stop() {
        this.closed = true;
        this.listeners.splice(0).forEach(remove => remove());
    }

    /** Wait for outstanding original callbacks, optionally restricted to one participant. */
    async drain(participant?: string) {
        let promises;

        do {
            promises = [ ...this.pending ].filter(([ , id ]) => participant === undefined || id === participant)
                .map(([ promise ]) => promise);
            await Promise.allSettled(promises);
        } while ([ ...this.pending ].some(([ , id ]) => participant === undefined || id === participant));
    }
}

/** One native store shared by all real JVB/P2P sessions of a JitsiConference. */
export class NativeManagedE2EEContext extends NativeManagedKeyContext {
    owner: NativeManagedConference;
    conference: any;
    localId: string;
    ready: Deferred<void>;
    localReady: boolean;
    retiredPeers: number;
    createdPeers: number;
    nativeErrors: number;
    rejectedOperations: number;
    observations: Map<string, any>;
    attachments: Map<any, any>;
    bindingClaims: WeakMap<object, any>;
    disposal: {
        callbacksDrained: boolean;
        debouncesCancelled: boolean;
        keysCleared: boolean;
        nativeContexts: number;
        sessionsFreed: boolean;
    };

    /** Initialize owned state and validate the required platform dependencies. */
    constructor(conference, onError) {
        if (!isNativeE2EESupported(conference.options.config)) {
            throw new Error('Requested native managed E2EE is unsupported');
        }
        const localId = conference.myUserId();
        const owner = new NativeManagedConference(provider.RTCPeerConnection, provider.nativeModule, localId);

        super({
            bridge: owner.bridge,
            onError
        });
        this.owner = owner;
        this.conference = conference;
        this.localId = localId;
        this.ready = new Deferred<void>();
        this.ready.catch(() => undefined);
        this.localReady = false;
        this.retiredPeers = 0;
        this.createdPeers = 0;
        this.nativeErrors = 0;
        this.rejectedOperations = 0;
        this.observations = new Map();
        this.attachments = new Map();
        this.bindingClaims = new WeakMap();
        this.disposal = {
            callbacksDrained: false,
            debouncesCancelled: false,
            keysCleared: false,
            nativeContexts: 1,
            sessionsFreed: false
        };
        this._observation(localId);
    }

    /** Return counters for one private owner without copying its media key. */
    _observation(id) {
        if (!this.observations.has(id)) {
            this.observations.set(id, {
                keyAcknowledged: false,
                keyEvents: 0,
                keyUpdates: 0,
                lastKeyIndex: null,
                nativeRemovalAcknowledged: false,
                receiverAcknowledgments: {
                    audio: 0,
                    video: 0
                },
                senderAcknowledgments: {
                    audio: 0,
                    video: 0
                }
            });
        }

        return this.observations.get(id);
    }

    /** Reject changes to the actual conference local participant identity. */
    _assertIdentity() {
        if (this.closed || this.conference.myUserId() !== this.localId) {
            const error = new Error('Native conference ownership changed');

            this.fail(error);
            throw error;
        }
    }

    /** Create an independently drainable handler event scope. */
    createLifecycle() {
        return new NativeE2EELifecycle(this);
    }

    /** Attach protection at construction and gate SDP on the acknowledged local key. */
    createPeerConnection(PeerConnection, configuration) {
        this._assertIdentity();
        if (PeerConnection !== provider.RTCPeerConnection) {
            const error = new Error('Native peer constructor changed');

            this.fail(error);
            throw error;
        }
        const peerConnection = this.owner.createPeerConnection(configuration);

        this.createdPeers++;

        return {
            peerConnection,
            ready: this.ready.promise.then(() => this.flush())
        };
    }

    /** Retire one native PC while retaining the shared conference key store. */
    async closePeerConnection(peer) {
        for (const [ endpoint ] of this.attachments) {
            if (endpoint._peerConnectionId === peer._pcId) {
                this.attachments.delete(endpoint);
            }
        }
        if (this.owner.closed) {
            return this.owner.closing;
        }
        try {
            if (await this.owner.retirePeerConnection(peer)) {
                this.retiredPeers++;
            }
        } catch (error) {
            this.fail(error);
            throw error;
        }
    }

    /** Snapshot automatic key material and observe the native acknowledgment. */
    override setKey(id, key, index) {
        if (this.closed || this.removed.has(id)) {
            return Promise.resolve(false);
        }
        const observation = this._observation(id);

        observation.keyEvents++;
        const result = super.setKey(id, key, index).then(accepted => {
            if (accepted && !this.closed && !this.removed.has(id)) {
                observation.keyUpdates++;
                observation.lastKeyIndex = index;
                observation.keyAcknowledged = Boolean(key);
                if (id === this.localId && key) {
                    this.localReady = true;
                    this.ready.resolve();
                }
            }

            return accepted;
        });

        result.catch(() => undefined);

        return result;
    }

    /** Reserve exact endpoint ownership and observe its native binding acknowledgment. */
    _bind(endpoint, kind, id, sender) {
        if (this.closed || this.removed.has(id)) {
            return Promise.resolve(false);
        }
        const existing = this.bindingClaims.get(endpoint);

        if (existing && (existing.id !== id || existing.kind !== kind || existing.sender !== sender)) {
            this.fail(new Error('Native endpoint ownership changed'));

            return Promise.resolve(false);
        }
        if (sender && id !== this.localId) {
            this.fail(new Error('Native sender owner mismatch'));

            return Promise.resolve(false);
        }
        if (!endpoint || ![ 'audio', 'video' ].includes(kind) || typeof id !== 'string' || !id) {
            this.fail(new Error('Invalid native endpoint binding'));

            return Promise.resolve(false);
        }
        this.bindingClaims.set(endpoint, {
            id,
            kind,
            sender
        });
        const result = (sender ? super.handleSender(endpoint, kind, id)
            : super.handleReceiver(endpoint, kind, id)).then(accepted => {
            if (accepted && !this.closed && !this.removed.has(id) && this.owner.peers.has(endpoint._peerConnectionId)) {
                this.attachments.set(endpoint, {
                    id,
                    kind,
                    sender
                });
                this._observation(id)[sender ? 'senderAcknowledgments' : 'receiverAcknowledgments'][kind]++;
            }

            return accepted;
        });

        result.catch(() => undefined);

        return result;
    }

    /** Retire a removed source attachment without removing its participant key. */
    releaseReceiver(receiver) {
        this.attachments.delete(receiver);
    }

    /** Verify that a sender belongs to this protected conference and local owner. */
    override handleSender(sender, kind, id) {
        return this._bind(sender, kind, id, true);
    }

    /** Bind an exact native receiver to its authenticated signaling owner. */
    override handleReceiver(receiver, kind, id) {
        return this._bind(receiver, kind, id, false);
    }

    /** Tombstone one departed participant before dispatching native key removal. */
    override cleanup(id) {
        const result = super.cleanup(id).then(accepted => {
            if (accepted) {
                this._observation(id).nativeRemovalAcknowledged = true;
            }

            return accepted;
        });

        for (const [ endpoint, value ] of this.attachments) {
            if (value.id === id) {
                this.attachments.delete(endpoint);
            }
        }
        const observation = this._observation(id);

        observation.keyAcknowledged = false;
        result.catch(() => undefined);

        return result;
    }

    /** Terminally close the owner and notify the required error observer once. */
    override fail(error) {
        if (!this.failure) {
            this.nativeErrors++;
            this.rejectedOperations++;
        }

        return super.fail(error);
    }

    /** Revoke the whole native conference before waiting for queued operations. */
    override cleanupAll() {
        this.localReady = false;
        this.ready?.reject(new Error('Native conference closed'));
        this.attachments?.clear();
        for (const observation of this.observations?.values() || []) {
            observation.keyAcknowledged = false;
        }

        return super.cleanupAll();
    }

    /** Project acknowledgment evidence without returning identities or key material. */
    snapshot(id?: string) {
        if (id !== undefined) {
            const value = this.observations.get(id);

            if (!value) {
                return null;
            }
            const activeAttachments = {
                audio: 0,
                video: 0
            };

            for (const attachment of this.attachments.values()) {
                if (attachment.id === id && !attachment.sender) {
                    activeAttachments[attachment.kind]++;
                }
            }

            return {
                ...value,
                activeAttachments,
                closed: this.closed,
                receiverAcknowledgments: {
                    ...value.receiverAcknowledgments
                },
                removed: this.removed.has(id),
                senderAcknowledgments: {
                    ...value.senderAcknowledgments
                }
            };
        }
        const local = this.observations.get(this.localId);
        const remote = [ ...this.observations ].filter(([ participant ]) => participant !== this.localId)
            .map(([ , value ]) => value);
        const total = field => {
            return {
                local: local[field],
                remote: remote.reduce((sum, value) => sum + value[field], 0)
            };
        };

        const activeRemote = [ ...this.observations.keys() ].filter(participant =>
            participant !== this.localId && !this.removed.has(participant));
        const sourceBound = !this.closed && activeRemote.length > 0 && activeRemote.every(participant => {
            const { activeAttachments } = this.snapshot(participant);

            return activeAttachments.audio > 0 && activeAttachments.video > 0;
        });

        return {
            allPeersProtected: this.createdPeers > 0,
            closed: this.closed,
            createdPeers: this.createdPeers,
            keyEvents: total('keyEvents'),
            keyUpdates: total('keyUpdates'),
            localKeyAcknowledged: local.keyAcknowledged,
            localKeyIndex: local.lastKeyIndex,
            nativeErrors: this.nativeErrors,
            nativeManaged: true,
            peerCount: this.owner.peers.size,
            protectedPeers: this.owner.peers.size,
            protectionBeforePeerConnection: this.createdPeers > 0,
            ready: this.localReady && !this.closed,
            receiverAcknowledgments: {
                audio: remote.reduce((sum, value) => sum + value.receiverAcknowledgments.audio, 0),
                video: remote.reduce((sum, value) => sum + value.receiverAcknowledgments.video, 0)
            },
            rejectedOperations: this.rejectedOperations,
            retiredPeers: this.retiredPeers,
            senderAcknowledgments: {
                ...local.senderAcknowledgments
            },
            sourceBound,
            ...this.disposal
        };
    }
}
