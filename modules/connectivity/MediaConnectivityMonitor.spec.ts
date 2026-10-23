import {
    IMediaConnectivity,
    MediaConnectivityReason,
    MediaConnectivityStatus
} from '../../service/connectivity/MediaConnectivity';
import { nextTick } from '../util/TestUtils';

import MediaConnectivityMonitor, { DEFAULT_CHECKING_TIMEOUT } from './MediaConnectivityMonitor';

const TURN_SERVERS: RTCIceServer[] = [
    { urls: 'turns:turnrelay.example.com:443?transport=tcp' },
    { urls: [ 'turn:turnrelay.example.com:443?transport=udp' ] }
];

function candidate(type: string): RTCIceCandidate {
    return {
        candidate: `candidate:1 1 udp 2122260223 10.0.0.1 54321 typ ${type} generation 0`,
        type
    } as RTCIceCandidate;
}

/**
 * Chrome points the transport stats at the selected pair, Firefox flags the pair itself (withTransport=false).
 */
function connectedStats(
        local: { candidateType: string; protocol: string; relayProtocol?: string; },
        withTransport = true): RTCStatsReport {
    const entries = [
        { id: 'L1', type: 'local-candidate', ...local },
        { candidateType: 'host', id: 'R1', type: 'remote-candidate' },
        {
            currentRoundTripTime: 0.0425,
            id: 'CP1',
            localCandidateId: 'L1',
            remoteCandidateId: 'R1',
            selected: !withTransport,
            type: 'candidate-pair'
        }
    ];

    withTransport && entries.push({ id: 'T1', selectedCandidatePairId: 'CP1', type: 'transport' } as never);

    return new Map(entries.map(entry => [ entry.id, entry ])) as unknown as RTCStatsReport;
}

describe('MediaConnectivityMonitor', () => {
    let changes: IMediaConnectivity[];
    let stats: Promise<RTCStatsReport>;

    function createMonitor(options: { checkingTimeout?: number; iceServers?: RTCIceServer[]; isP2P?: boolean; } = {}) {
        return new MediaConnectivityMonitor({
            checkingTimeout: options.checkingTimeout,
            getStats: () => stats,
            iceServers: 'iceServers' in options ? options.iceServers : TURN_SERVERS,
            isP2P: options.isP2P ?? false,
            onChange: connectivity => changes.push(connectivity)
        });
    }

    beforeEach(() => {
        jasmine.clock().install();
        changes = [];
        stats = Promise.resolve(connectedStats({ candidateType: 'srflx', protocol: 'udp' }));
    });

    afterEach(() => {
        jasmine.clock().uninstall();
    });

    it('reports at risk when the bridge session gathers only host candidates', () => {
        const monitor = createMonitor();

        monitor.onLocalCandidate(candidate('host'));
        monitor.onLocalCandidate(candidate('host'));
        monitor.onLocalCandidate(null);

        expect(changes.length).toBe(1);
        expect(changes[0].status).toBe(MediaConnectivityStatus.AT_RISK);
        expect(changes[0].reasons).toEqual([
            MediaConnectivityReason.NO_SERVER_REFLEXIVE,
            MediaConnectivityReason.TURN_UNREACHABLE
        ]);
        expect(changes[0].candidates).toEqual({ host: 2, prflx: 0, relay: 0, srflx: 0 });
    });

    it('stays silent when gathering produced a server reflexive candidate', () => {
        const monitor = createMonitor();

        monitor.onLocalCandidate(candidate('host'));
        monitor.onLocalCandidate(candidate('srflx'));
        monitor.onLocalCandidate(null);

        expect(changes.length).toBe(0);
        expect(monitor.getConnectivity()).toBeUndefined();
    });

    it('doesn\'t predict from host candidates for P2P sessions', () => {
        const monitor = createMonitor({ isP2P: true });

        monitor.onLocalCandidate(candidate('host'));
        monitor.onLocalCandidate(null);

        expect(changes.length).toBe(0);
    });

    it('doesn\'t predict from host candidates without ICE servers', () => {
        const monitor = createMonitor({ iceServers: undefined });

        monitor.onLocalCandidate(candidate('host'));
        monitor.onLocalCandidate(null);

        expect(changes.length).toBe(0);
    });

    it('parses the candidate type from the SDP attribute', () => {
        const monitor = createMonitor();

        monitor.onLocalCandidate({ candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ srflx' } as RTCIceCandidate);
        monitor.onLocalCandidate(null);

        expect(changes.length).toBe(0);
    });

    it('reports at risk when ICE is still checking after the timeout', () => {
        const monitor = createMonitor();

        monitor.onLocalCandidate(candidate('srflx'));
        monitor.onIceConnectionStateChange('checking');
        jasmine.clock().tick(DEFAULT_CHECKING_TIMEOUT - 1);
        expect(changes.length).toBe(0);

        jasmine.clock().tick(1);
        expect(changes.length).toBe(1);
        expect(changes[0].status).toBe(MediaConnectivityStatus.AT_RISK);
        expect(changes[0].reasons).toEqual([ MediaConnectivityReason.CHECKING_TIMEOUT ]);
    });

    it('keeps failed through a restart and reports good once it connects', async () => {
        const monitor = createMonitor();

        monitor.onLocalCandidate(candidate('host'));
        monitor.onIceConnectionStateChange('checking');
        monitor.onIceConnectionStateChange('failed');

        expect(changes[changes.length - 1].status).toBe(MediaConnectivityStatus.FAILED);
        expect(changes[changes.length - 1].reasons).toEqual([
            MediaConnectivityReason.ICE_FAILED,
            MediaConnectivityReason.NO_SERVER_REFLEXIVE,
            MediaConnectivityReason.TURN_UNREACHABLE
        ]);

        const failedCount = changes.length;

        monitor.onIceConnectionStateChange('checking');
        jasmine.clock().tick(DEFAULT_CHECKING_TIMEOUT);
        expect(changes.length).toBe(failedCount);

        monitor.onIceConnectionStateChange('connected');
        await nextTick();

        expect(changes[changes.length - 1].status).toBe(MediaConnectivityStatus.GOOD);
    });

    it('reports failed for a PeerConnection failure', () => {
        const monitor = createMonitor();

        monitor.onLocalCandidate(candidate('srflx'));
        monitor.onIceFailed();

        expect(changes.length).toBe(1);
        expect(changes[0].status).toBe(MediaConnectivityStatus.FAILED);
        expect(changes[0].reasons).toEqual([ MediaConnectivityReason.ICE_FAILED ]);
    });

    it('reports good with the selected pair when connected over UDP', async () => {
        const monitor = createMonitor();

        monitor.onIceConnectionStateChange('checking');
        monitor.onIceConnectionStateChange('connected');
        await nextTick();

        expect(changes.length).toBe(1);
        expect(changes[0].status).toBe(MediaConnectivityStatus.GOOD);
        expect(changes[0].reasons).toEqual([]);
        expect(changes[0].selectedPair).toEqual({
            localType: 'srflx',
            protocol: 'udp',
            relayProtocol: undefined,
            remoteType: 'host',
            rtt: 43
        });

        jasmine.clock().tick(DEFAULT_CHECKING_TIMEOUT);
        expect(changes.length).toBe(1);
    });

    it('reports degraded when connected through a TURN/TCP or TURN/TLS relay', async () => {
        for (const relayProtocol of [ 'tcp', 'tls' ]) {
            stats = Promise.resolve(connectedStats({ candidateType: 'relay', protocol: 'udp', relayProtocol }));
            changes = [];

            createMonitor().onIceConnectionStateChange('connected');
            await nextTick();

            expect(changes[0].status).toBe(MediaConnectivityStatus.DEGRADED);
            expect(changes[0].reasons).toEqual([ MediaConnectivityReason.TCP_TRANSPORT ]);
        }
    });

    it('adds the checking timeout to the gathering reasons, then reports good', async () => {
        const monitor = createMonitor({ checkingTimeout: 1000 });

        monitor.onLocalCandidate(candidate('host'));
        monitor.onLocalCandidate(candidate('toString'));
        monitor.onLocalCandidate(null);
        monitor.onLocalCandidate(null);
        monitor.onIceConnectionStateChange('checking');
        jasmine.clock().tick(500);

        // Neither restarts the timer.
        monitor.onIceConnectionStateChange('disconnected');
        monitor.onIceConnectionStateChange('checking');
        jasmine.clock().tick(500);

        monitor.onIceConnectionStateChange('connected');
        await nextTick();

        const { CHECKING_TIMEOUT, NO_SERVER_REFLEXIVE, TURN_UNREACHABLE } = MediaConnectivityReason;

        expect(changes.map(c => [ c.status, c.reasons ])).toEqual([
            [ MediaConnectivityStatus.AT_RISK, [ NO_SERVER_REFLEXIVE, TURN_UNREACHABLE ] ],
            [ MediaConnectivityStatus.AT_RISK, [ CHECKING_TIMEOUT, NO_SERVER_REFLEXIVE, TURN_UNREACHABLE ] ],
            [ MediaConnectivityStatus.GOOD, [] ]
        ]);
        expect(changes[0].candidates).toEqual({ host: 1, prflx: 0, relay: 0, srflx: 0 });
    });

    it('expects only a relay candidate from a TURN/TLS-only server list', () => {
        createMonitor({ iceServers: [ TURN_SERVERS[0] ] }).onLocalCandidate(null);

        expect(changes[0].reasons).toEqual([ MediaConnectivityReason.TURN_UNREACHABLE ]);
    });

    it('caps the STUN/TURN errors and ignores events once connected', async () => {
        const monitor = createMonitor();
        const error = (url: string) => ({ errorCode: 701, url }) as RTCPeerConnectionIceErrorEvent;

        for (let i = 0; i < 12; i++) {
            monitor.onCandidateError(error(`turn:turn${i}.example.com`));
        }
        monitor.onIceConnectionStateChange('failed');

        // Gathering ending after the failure doesn't downgrade it.
        monitor.onLocalCandidate(null);
        monitor.onIceConnectionStateChange('connected');
        await nextTick();

        monitor.onCandidateError(error('turn:late.example.com'));
        monitor.onLocalCandidate(candidate('srflx'));
        monitor.onIceFailed();

        expect(changes.map(c => c.status)).toEqual([ MediaConnectivityStatus.FAILED, MediaConnectivityStatus.GOOD ]);
        expect(changes[0].iceServerErrors.length).toBe(10);
        expect(monitor.getConnectivity()?.iceServerErrors.length).toBe(10);
        expect(monitor.getConnectivity()?.candidates.srflx).toBe(0);
    });

    it('drops the connected assessment when disposed before the stats are read', async () => {
        const monitor = createMonitor();

        monitor.onIceConnectionStateChange('connected');
        monitor.dispose();
        await nextTick();

        expect(changes.length).toBe(0);
    });

    it('reads the selected pair flagged by Firefox', async () => {
        stats = Promise.resolve(connectedStats({ candidateType: 'host', protocol: 'tcp' }, false));

        const monitor = createMonitor();

        monitor.onIceConnectionStateChange('completed');
        await nextTick();

        expect(changes[0].status).toBe(MediaConnectivityStatus.DEGRADED);
        expect(changes[0].selectedPair?.localType).toBe('host');
    });

    it('reports good when the stats can\'t be read', async () => {
        stats = Promise.reject(new Error('closed'));

        const monitor = createMonitor();

        monitor.onIceConnectionStateChange('connected');
        await nextTick();

        expect(changes[0].status).toBe(MediaConnectivityStatus.GOOD);
        expect(changes[0].selectedPair).toBeUndefined();
    });

    it('keeps distinct STUN/TURN errors', () => {
        const monitor = createMonitor();
        const error = { errorCode: 701, url: 'turns:turnrelay.example.com:443?transport=tcp' };

        monitor.onCandidateError(error as RTCPeerConnectionIceErrorEvent);
        monitor.onCandidateError(error as RTCPeerConnectionIceErrorEvent);
        monitor.onCandidateError({ ...error, errorCode: 401 } as RTCPeerConnectionIceErrorEvent);
        monitor.onLocalCandidate(null);

        expect(changes[0].iceServerErrors).toEqual([
            { errorCode: 701, url: error.url },
            { errorCode: 401, url: error.url }
        ]);
    });

    it('stops reporting once disposed', async () => {
        const monitor = createMonitor();

        monitor.onIceConnectionStateChange('checking');
        monitor.dispose();
        jasmine.clock().tick(DEFAULT_CHECKING_TIMEOUT);
        monitor.onIceConnectionStateChange('connected');
        await nextTick();

        expect(changes.length).toBe(0);
    });
});
