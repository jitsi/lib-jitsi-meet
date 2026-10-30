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
 * The fields of the transport, candidate-pair and candidate stats used to find and rate the selected pair.
 */
export interface IIceStatsEntry extends ITransportCandidateInfo {
    currentRoundTripTime?: number;
    id: string;
    localCandidateId?: string;
    nominated?: boolean;
    protocol?: string;
    remoteCandidateId?: string;
    selected?: boolean;
    selectedCandidatePairId?: string;
    state?: string;
    type: string;
}

/**
 * The candidate pair selected by ICE and its local and remote candidates.
 */
export interface ISelectedCandidatePairStats {
    local?: IIceStatsEntry;
    pair: IIceStatsEntry;
    remote?: IIceStatsEntry;
}

/**
 * Finds the candidate pair selected by ICE. The transport stats point at it, Firefox doesn't expose them and flags
 * the pair instead.
 *
 * @param {RTCStatsReport} stats - The PeerConnection stats.
 * @returns {Optional<ISelectedCandidatePairStats>} The selected pair, or undefined if ICE hasn't selected one.
 */
export function getSelectedCandidatePair(stats: RTCStatsReport): Optional<ISelectedCandidatePairStats> {
    const reports = new Map<string, IIceStatsEntry>();

    stats.forEach((report: IIceStatsEntry) => reports.set(report.id, report));

    const entries = Array.from(reports.values());
    const transport = entries.find(report => report.type === 'transport' && report.selectedCandidatePairId);
    const pair = transport
        ? reports.get(transport.selectedCandidatePairId)
        : entries.find(report => report.type === 'candidate-pair'
            && (report.selected || (report.nominated && report.state === 'succeeded')));

    if (!pair) {
        return undefined;
    }

    return {
        local: reports.get(pair.localCandidateId),
        pair,
        remote: reports.get(pair.remoteCandidateId)
    };
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
