import { nextTick } from '../util/TestUtils';

import runIceConnectivityCheck, { DEFAULT_ICE_CHECK_TIMEOUT, IIceConnectivityResult } from './IceConnectivityCheck';

const ICE_SERVERS = [
    { credential: 'secret', urls: [ 'turn:turnrelay.example.com:443?transport=udp' ], username: 'user' }
];

class FakePeerConnection {
    static instances: FakePeerConnection[] = [];

    addedCandidates: RTCIceCandidateInit[] = [];
    closed = false;
    config: RTCConfiguration;
    connectionState: RTCPeerConnectionState = 'new';
    onconnectionstatechange?: () => void;
    onicecandidate?: (event: { candidate: Nullable<{ candidate: string; }>; }) => void;
    stats: RTCStatsReport = new Map() as unknown as RTCStatsReport;

    constructor(config: RTCConfiguration) {
        this.config = config;
        FakePeerConnection.instances.push(this);
    }

    addIceCandidate(candidate: RTCIceCandidateInit) {
        this.addedCandidates.push(candidate);

        return Promise.resolve();
    }

    close() {
        this.closed = true;
    }

    createAnswer() {
        return Promise.resolve({ sdp: 'answer', type: 'answer' });
    }

    createDataChannel() {
        return {};
    }

    createOffer() {
        return Promise.resolve({ sdp: 'offer', type: 'offer' });
    }

    emitCandidate(type: string) {
        this.onicecandidate?.({ candidate: { candidate: `candidate:1 1 udp 1 10.0.0.1 5000 typ ${type} generation 0` } });
    }

    getStats() {
        return Promise.resolve(this.stats);
    }

    setLocalDescription() {
        return Promise.resolve();
    }

    setRemoteDescription() {
        return Promise.resolve();
    }

    setState(state: RTCPeerConnectionState) {
        this.connectionState = state;
        this.onconnectionstatechange?.();
    }
}

/**
 * The stats of a connection that selected a relay candidate allocated over the given transport.
 */
function relayStats(relayProtocol: string): RTCStatsReport {
    const entries = [
        { candidateType: 'relay', id: 'L1', relayProtocol, type: 'local-candidate' },
        { candidateType: 'relay', id: 'R1', type: 'remote-candidate' },
        { id: 'CP1', localCandidateId: 'L1', remoteCandidateId: 'R1', type: 'candidate-pair' },
        { id: 'T1', selectedCandidatePairId: 'CP1', type: 'transport' }
    ];

    return new Map(entries.map(entry => [ entry.id, entry ])) as unknown as RTCStatsReport;
}

describe('runIceConnectivityCheck', () => {
    let originalPeerConnection: typeof RTCPeerConnection;

    /**
     * Starts a check and waits until it is waiting for the connection.
     */
    async function start(timeout?: number) {
        const result = runIceConnectivityCheck(ICE_SERVERS, timeout);

        for (let i = 0; i < 10 && !FakePeerConnection.instances[0]?.onconnectionstatechange; i++) {
            await nextTick();
        }

        return {
            answerer: FakePeerConnection.instances[1],
            offerer: FakePeerConnection.instances[0],
            result
        };
    }

    beforeEach(() => {
        jasmine.clock().install();
        FakePeerConnection.instances = [];
        originalPeerConnection = window.RTCPeerConnection;
        window.RTCPeerConnection = FakePeerConnection as unknown as typeof RTCPeerConnection;
    });

    afterEach(() => {
        window.RTCPeerConnection = originalPeerConnection;
        jasmine.clock().uninstall();
    });

    it('connects through a TURN server over UDP', async () => {
        const { answerer, offerer, result } = await start();

        offerer.stats = relayStats('udp');
        offerer.setState('connected');

        const { connected, relayProtocol }: IIceConnectivityResult = await result;

        expect(connected).toBe(true);
        expect(relayProtocol).toBe('udp');
        expect(offerer.config.iceServers).toEqual(ICE_SERVERS);
        expect(offerer.closed && answerer.closed).toBe(true);
    });

    it('reports TCP when ICE falls back to it', async () => {
        const { offerer, result } = await start();

        offerer.stats = relayStats('tcp');
        offerer.setState('connected');

        expect((await result).relayProtocol).toBe('tcp');
    });

    it('passes only the relay candidates to the other connection', async () => {
        const { answerer, offerer, result } = await start();

        offerer.emitCandidate('host');
        offerer.emitCandidate('srflx');
        offerer.emitCandidate('relay');
        answerer.emitCandidate('relay');
        offerer.setState('failed');
        await result;

        expect(answerer.addedCandidates.length).toBe(1);
        expect(answerer.addedCandidates[0].candidate).toContain('typ relay');
        expect(offerer.addedCandidates.length).toBe(1);
    });

    it('fails when ICE fails', async () => {
        const { answerer, offerer, result } = await start();

        offerer.setState('failed');

        expect(await result).toEqual(jasmine.objectContaining({ connected: false }));
        expect((await result).relayProtocol).toBeUndefined();
        expect(offerer.closed && answerer.closed).toBe(true);
    });

    it('fails when the connection takes longer than the timeout', async () => {
        const { answerer, offerer, result } = await start();

        jasmine.clock().tick(DEFAULT_ICE_CHECK_TIMEOUT);

        expect((await result).connected).toBe(false);
        expect(offerer.closed && answerer.closed).toBe(true);
    });

    it('uses the given timeout', async () => {
        const { offerer, result } = await start(2000);

        jasmine.clock().tick(2000);
        offerer.setState('connected');

        expect((await result).connected).toBe(false);
    });

    it('fails without throwing when the connections cannot be set up', async () => {
        const original = FakePeerConnection.prototype.createOffer;

        FakePeerConnection.prototype.createOffer = () => Promise.reject(new Error('no offer'));

        try {
            const result = await runIceConnectivityCheck(ICE_SERVERS);

            expect(result.connected).toBe(false);
            expect(FakePeerConnection.instances.every(pc => pc.closed)).toBe(true);
        } finally {
            FakePeerConnection.prototype.createOffer = original;
        }
    });
});
