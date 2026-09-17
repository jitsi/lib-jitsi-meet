import { getTransportCost, ITransportCandidateInfo, TransportCost } from './TransportCost';

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
