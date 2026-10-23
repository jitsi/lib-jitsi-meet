import { getLogger } from '@jitsi/logger';

import {
    ICandidateCounts,
    IIceServerError,
    IMediaConnectivity,
    ISelectedCandidatePair,
    MediaConnectivityReason,
    MediaConnectivityStatus
} from '../../service/connectivity/MediaConnectivity';

const logger = getLogger('connectivity:MediaConnectivityMonitor');

/**
 * How long ICE may stay in 'checking' before the session is reported at risk.
 */
export const DEFAULT_CHECKING_TIMEOUT = 5000;

const MAX_ICE_SERVER_ERRORS = 10;

/**
 * The fields of the transport, candidate-pair and candidate stats read by the monitor.
 */
interface IStatsEntry {
    candidateType?: string;
    currentRoundTripTime?: number;
    id: string;
    localCandidateId?: string;
    nominated?: boolean;
    protocol?: string;
    relayProtocol?: string;
    remoteCandidateId?: string;
    selected?: boolean;
    selectedCandidatePairId?: string;
    state?: string;
    type: string;
}

/**
 * Options for {@link MediaConnectivityMonitor}.
 */
export interface IMediaConnectivityMonitorOptions {
    checkingTimeout?: number;
    getStats: () => Promise<RTCStatsReport>;
    iceServers?: RTCIceServer[];
    isP2P: boolean;
    onChange: (connectivity: IMediaConnectivity) => void;
}

/**
 * Flattens the ICE server URLs.
 *
 * @param {RTCIceServer[]} iceServers - The ICE servers.
 * @returns {string[]}
 */
function getIceServerUrls(iceServers: RTCIceServer[] = []): string[] {
    return iceServers.flatMap(server => (Array.isArray(server.urls) ? server.urls : [ server.urls ]))
        .filter(url => typeof url === 'string')
        .map(url => url.toLowerCase());
}

/**
 * Falls back to the SDP attribute on browsers that don't expose RTCIceCandidate.type.
 *
 * @param {RTCIceCandidate} candidate - The candidate.
 * @returns {string|undefined}
 */
function getCandidateType(candidate: RTCIceCandidate): Optional<string> {
    return candidate.type ?? candidate.candidate?.match(/ typ (\w+)/)?.[1];
}

/**
 * Assesses the expected media quality of one media session from its ICE establishment: the local candidates that
 * were gathered, STUN/TURN errors, the progress of ICE checking and the candidate pair that ICE selected. The
 * assessment ends once ICE connects for the first time.
 */
export default class MediaConnectivityMonitor {
    private _candidates: ICandidateCounts;
    private _checkingTimeout: number;
    private _checkingTimer?: number;
    private _disposed: boolean;
    private _done: boolean;
    private _expectsRelay: boolean;
    private _expectsServerReflexive: boolean;
    private _getStats: () => Promise<RTCStatsReport>;
    private _iceServerErrors: IIceServerError[];
    private _isP2P: boolean;
    private _onChange: (connectivity: IMediaConnectivity) => void;
    private _reasons: MediaConnectivityReason[];
    private _selectedPair?: ISelectedCandidatePair;
    private _status?: MediaConnectivityStatus;

    /**
     * Creates a new monitor.
     *
     * @param {IMediaConnectivityMonitorOptions} options - The options.
     */
    constructor(options: IMediaConnectivityMonitorOptions) {
        const urls = getIceServerUrls(options.iceServers);

        this._candidates = { host: 0, prflx: 0, relay: 0, srflx: 0 };
        this._checkingTimeout = options.checkingTimeout ?? DEFAULT_CHECKING_TIMEOUT;
        this._disposed = false;
        this._done = false;

        // A TURN server also returns the server reflexive address on allocation.
        this._expectsRelay = urls.some(url => url.startsWith('turn:') || url.startsWith('turns:'));
        this._expectsServerReflexive = urls.some(url => url.startsWith('stun:') || url.startsWith('turn:'));
        this._getStats = options.getStats;
        this._iceServerErrors = [];
        this._isP2P = options.isP2P;
        this._onChange = options.onChange;
        this._reasons = [];
    }

    /**
     * Reasons derived from the gathered candidates.
     *
     * @returns {MediaConnectivityReason[]}
     */
    private _candidateReasons(): MediaConnectivityReason[] {
        const reasons = [];

        // Without a server reflexive or a relay candidate the remote side can only be reached over host candidates.
        if (this._candidates.srflx === 0 && this._candidates.relay === 0) {
            this._expectsServerReflexive && reasons.push(MediaConnectivityReason.NO_SERVER_REFLEXIVE);
            this._expectsRelay && reasons.push(MediaConnectivityReason.TURN_UNREACHABLE);
        }

        return reasons;
    }

    /**
     * Clears the checking timer.
     *
     * @returns {void}
     */
    private _clearCheckingTimer(): void {
        if (this._checkingTimer !== undefined) {
            window.clearTimeout(this._checkingTimer);
            this._checkingTimer = undefined;
        }
    }

    /**
     * Whether the assessment has ended.
     *
     * @returns {boolean}
     */
    private _isFinal(): boolean {
        return this._disposed || this._done;
    }

    /**
     * Reports the session at risk when ICE is still checking after the timeout.
     *
     * @returns {void}
     */
    private _onCheckingTimeout(): void {
        this._checkingTimer = undefined;

        // An ICE restart goes through checking again, don't hide the failure behind a milder status.
        if (this._isFinal() || this._status === MediaConnectivityStatus.FAILED) {
            return;
        }

        this._update(
            MediaConnectivityStatus.AT_RISK,
            [ MediaConnectivityReason.CHECKING_TIMEOUT, ...this._candidateReasons() ]);
    }

    /**
     * Ends the assessment with the quality of the selected candidate pair.
     *
     * @returns {void}
     */
    private _onConnected(): void {
        this._clearCheckingTimer();
        this._done = true;

        this._getStats()
            .then(stats => this._readSelectedPair(stats))
            .catch(error => {
                logger.warn(`Failed to read the selected candidate pair: ${error}`);
            })
            .then(() => {
                if (this._disposed) {
                    return;
                }

                const { localType, protocol, relayProtocol } = this._selectedPair ?? {};
                const isTcp = protocol === 'tcp'
                    || (localType === 'relay' && (relayProtocol === 'tcp' || relayProtocol === 'tls'));

                if (isTcp) {
                    this._update(MediaConnectivityStatus.DEGRADED, [ MediaConnectivityReason.TCP_TRANSPORT ]);
                } else {
                    this._update(MediaConnectivityStatus.GOOD, []);
                }
            });
    }

    /**
     * Reports the session at risk when gathering produced only host candidates.
     *
     * @returns {void}
     */
    private _onGatheringComplete(): void {
        const reasons = this._candidateReasons();

        // P2P peers can still reach each other over host candidates on the same network.
        if (this._isP2P || !reasons.length || this._status === MediaConnectivityStatus.FAILED) {
            return;
        }

        this._update(MediaConnectivityStatus.AT_RISK, reasons);
    }

    /**
     * Reads the selected candidate pair from the stats.
     *
     * @param {RTCStatsReport} stats - The PeerConnection stats.
     * @returns {void}
     */
    private _readSelectedPair(stats: RTCStatsReport): void {
        const reports = new Map<string, IStatsEntry>();

        stats.forEach((report: IStatsEntry) => reports.set(report.id, report));

        const entries = Array.from(reports.values());
        const transport = entries.find(report => report.type === 'transport' && report.selectedCandidatePairId);

        // Firefox doesn't expose the transport stats but flags the pair instead.
        const pair = transport
            ? reports.get(transport.selectedCandidatePairId)
            : entries.find(report => report.type === 'candidate-pair'
                && (report.selected || (report.nominated && report.state === 'succeeded')));

        if (!pair) {
            return;
        }

        const local = reports.get(pair.localCandidateId);
        const remote = reports.get(pair.remoteCandidateId);

        this._selectedPair = {
            localType: local?.candidateType,
            protocol: local?.protocol,
            relayProtocol: local?.relayProtocol,
            remoteType: remote?.candidateType,
            rtt: typeof pair.currentRoundTripTime === 'number'
                ? Math.round(pair.currentRoundTripTime * 1000) : undefined
        };
    }

    /**
     * Updates the assessment and notifies the listener when it changed.
     *
     * @param {MediaConnectivityStatus} status - The new status.
     * @param {MediaConnectivityReason[]} reasons - The reasons for the status.
     * @returns {void}
     */
    private _update(status: MediaConnectivityStatus, reasons: MediaConnectivityReason[]): void {
        if (status === this._status && reasons.join() === this._reasons.join()) {
            return;
        }

        this._status = status;
        this._reasons = reasons;

        const connectivity = this.getConnectivity();

        logger.info(`${this._isP2P ? 'P2P' : 'JVB'} media connectivity: ${JSON.stringify(connectivity)}`);
        this._onChange(connectivity);
    }

    /**
     * Stops the monitor.
     *
     * @returns {void}
     */
    dispose(): void {
        this._disposed = true;
        this._clearCheckingTimer();
    }

    /**
     * Returns the current assessment, or undefined if nothing has been assessed yet.
     *
     * @returns {IMediaConnectivity|undefined}
     */
    getConnectivity(): Optional<IMediaConnectivity> {
        if (!this._status) {
            return undefined;
        }

        return {
            candidates: { ...this._candidates },
            iceServerErrors: [ ...this._iceServerErrors ],
            p2p: this._isP2P,
            reasons: [ ...this._reasons ],
            selectedPair: this._selectedPair ? { ...this._selectedPair } : undefined,
            status: this._status
        };
    }

    /**
     * Records a STUN/TURN server error.
     *
     * @param {RTCPeerConnectionIceErrorEvent} event - The 'icecandidateerror' event.
     * @returns {void}
     */
    onCandidateError(event: RTCPeerConnectionIceErrorEvent): void {
        const { errorCode, url } = event;

        if (this._isFinal() || !url || this._iceServerErrors.length >= MAX_ICE_SERVER_ERRORS) {
            return;
        }

        // Chrome reports one error per local interface, keep only distinct ones.
        if (!this._iceServerErrors.some(e => e.url === url && e.errorCode === errorCode)) {
            this._iceServerErrors.push({ errorCode, url });
        }
    }

    /**
     * Handles a change of the ICE connection state.
     *
     * @param {RTCIceConnectionState} state - The new ICE connection state.
     * @returns {void}
     */
    onIceConnectionStateChange(state: RTCIceConnectionState): void {
        if (this._isFinal()) {
            return;
        }

        switch (state) {
        case 'checking':
            if (this._checkingTimer === undefined) {
                this._checkingTimer = window.setTimeout(() => this._onCheckingTimeout(), this._checkingTimeout);
            }
            break;
        case 'connected':
        case 'completed':
            this._onConnected();
            break;
        case 'failed':
            this.onIceFailed();
            break;
        }
    }

    /**
     * Handles an ICE failure, including the PeerConnection failures Chrome doesn't reflect in the ICE state.
     *
     * @returns {void}
     */
    onIceFailed(): void {
        if (this._isFinal()) {
            return;
        }

        this._clearCheckingTimer();
        this._update(MediaConnectivityStatus.FAILED, [ MediaConnectivityReason.ICE_FAILED, ...this._candidateReasons() ]);
    }

    /**
     * Records a gathered local candidate, a null candidate marks the end of gathering.
     *
     * @param {RTCIceCandidate|null} candidate - The candidate.
     * @returns {void}
     */
    onLocalCandidate(candidate: Nullable<RTCIceCandidate>): void {
        if (this._isFinal()) {
            return;
        }

        if (!candidate) {
            this._onGatheringComplete();

            return;
        }

        const type = getCandidateType(candidate);

        if (type && Object.prototype.hasOwnProperty.call(this._candidates, type)) {
            this._candidates[type as keyof ICandidateCounts]++;
        }
    }
}
