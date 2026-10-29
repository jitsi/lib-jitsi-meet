import {
    getSelectedCandidatePair,
    getTransportCost,
    IIceStatsEntry,
    ITransportCandidateInfo,
    TransportCost
} from './TransportCost';

describe('getSelectedCandidatePair', () => {
    const LOCAL = { candidateType: 'relay', id: 'L1', relayProtocol: 'tcp', type: 'local-candidate' };
    const REMOTE = { candidateType: 'host', id: 'R1', type: 'remote-candidate' };

    function report(...entries: IIceStatsEntry[]): RTCStatsReport {
        return new Map(entries.map(entry => [ entry.id, entry ])) as unknown as RTCStatsReport;
    }

    function pair(id: string, fields: Partial<IIceStatsEntry> = {}): IIceStatsEntry {
        return { id, localCandidateId: 'L1', remoteCandidateId: 'R1', type: 'candidate-pair', ...fields };
    }

    it('follows the transport to the selected pair over other nominated pairs', () => {
        const selected = pair('CP2');

        expect(getSelectedCandidatePair(report(
            LOCAL,
            REMOTE,
            pair('CP1', { nominated: true, state: 'succeeded' }),
            selected,
            { id: 'T1', selectedCandidatePairId: 'CP2', type: 'transport' }
        ))).toEqual({ local: LOCAL, pair: selected, remote: REMOTE });
    });

    it('takes the pair Firefox flags as selected when there are no transport stats', () => {
        const selected = pair('CP1', { selected: true });

        expect(getSelectedCandidatePair(report(LOCAL, REMOTE, selected))?.pair).toBe(selected);
    });

    it('returns undefined before ICE selects a pair', () => {
        expect(getSelectedCandidatePair(report(LOCAL, REMOTE, pair('CP1', { state: 'in-progress' }))))
            .toBeUndefined();
    });
});

describe('getTransportCost', () => {
    const { DIRECT, RELAY_TCP, RELAY_UDP } = TransportCost;
    const URL = 'turnrelay.example.net:443';

    // A relay's own protocol is 'udp' even for a TCP or TLS allocation, since the leg towards the peer is UDP
    // either way. Only relayProtocol, or failing that the gathering URL, distinguishes them.
    const cases: [string, Optional<ITransportCandidateInfo>, Nullable<TransportCost>][] = [
        [ 'no candidate', undefined, null ],
        [ 'a host candidate', { candidateType: 'host' }, DIRECT ],
        [ 'a srflx candidate', { candidateType: 'srflx' }, DIRECT ],
        [ 'a prflx candidate', { candidateType: 'prflx' }, DIRECT ],
        [ 'a udp relay', { candidateType: 'relay', relayProtocol: 'udp' }, RELAY_UDP ],
        [ 'a tcp relay', { candidateType: 'relay', relayProtocol: 'tcp' }, RELAY_TCP ],
        [ 'a tls relay', { candidateType: 'relay', relayProtocol: 'tls' }, RELAY_TCP ],
        [ 'a tls relay whose peer leg is udp',
            { candidateType: 'relay', relayProtocol: 'tls', url: `turns:${URL}?transport=tcp` }, RELAY_TCP ],
        [ 'a transport=tcp url with no relayProtocol',
            { candidateType: 'relay', url: `turn:${URL}?transport=tcp` }, RELAY_TCP ],
        [ 'a turns: url with no relayProtocol', { candidateType: 'relay', url: `turns:${URL}` }, RELAY_TCP ],
        [ 'a transport=udp url with no relayProtocol',
            { candidateType: 'relay', url: `turn:${URL}?transport=udp` }, null ],
        [ 'a relay with neither relayProtocol nor url', { candidateType: 'relay' }, null ]
    ];

    cases.forEach(([ name, candidate, expected ]) => {
        it(`resolves ${name} to ${expected}`, () => {
            expect(getTransportCost(candidate)).toBe(expected);
        });
    });
});
