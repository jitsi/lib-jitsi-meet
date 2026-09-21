/**
 * Cost of a selected ICE candidate pair, ordered worst-last so two paths can be compared.
 */
export enum TransportCost {
    DIRECT = 0,
    RELAY_UDP = 1,
    RELAY_TCP = 2
}

export interface ITransportCandidateInfo {
    candidateType?: string;
    relayProtocol?: string;
    url?: string;
}

/**
 * Derives the transport cost of a selected pair from its local candidate. Only relayProtocol describes the client to
 * TURN leg; the candidate's own protocol reads 'udp' for a TCP or TLS allocation too. Safari does not always report
 * it, so the gathering URL is used as a fallback.
 *
 * @param {ITransportCandidateInfo} localCandidate - The local candidate of the selected pair.
 * @returns {Nullable<TransportCost>} The cost, or null when it cannot be determined.
 */
export function getTransportCost(localCandidate?: ITransportCandidateInfo): Nullable<TransportCost> {
    if (!localCandidate) {
        return null;
    }

    if (localCandidate.candidateType !== 'relay') {
        return TransportCost.DIRECT;
    }

    const { relayProtocol, url } = localCandidate;
    const resolved = relayProtocol
        ?? (typeof url === 'string' && (/transport=tcp/i.test(url) || url.startsWith('turns:')) ? 'tcp' : undefined);

    if (!resolved) {
        return null;
    }

    return resolved === 'udp' ? TransportCost.RELAY_UDP : TransportCost.RELAY_TCP;
}
