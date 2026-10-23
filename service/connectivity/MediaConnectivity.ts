/**
 * The expected media quality of a media session, assessed from its ICE establishment.
 */
export enum MediaConnectivityStatus {

    /**
     * Not connected yet and the signals so far predict that ICE will be slow or will fail.
     */
    AT_RISK = 'at-risk',

    /**
     * Connected, but over TCP (TURN/TCP, TURN/TLS or ICE-TCP). Head-of-line blocking makes audio and video lag
     * and stutter under packet loss.
     */
    DEGRADED = 'degraded',

    /**
     * ICE failed. No media flows until a restart succeeds.
     */
    FAILED = 'failed',

    /**
     * Connected over UDP, directly or through a TURN/UDP relay.
     */
    GOOD = 'good'
}

/**
 * The reasons behind a {@link MediaConnectivityStatus}.
 */
export enum MediaConnectivityReason {

    /**
     * ICE is still checking after the configured timeout.
     */
    CHECKING_TIMEOUT = 'checking-timeout',

    /**
     * ICE moved to failed.
     */
    ICE_FAILED = 'ice-failed',

    /**
     * Gathering produced no server reflexive candidate although STUN or TURN servers were configured, which
     * means that UDP traffic to them is blocked.
     */
    NO_SERVER_REFLEXIVE = 'no-server-reflexive',

    /**
     * The selected candidate pair uses TCP.
     */
    TCP_TRANSPORT = 'tcp-transport',

    /**
     * Gathering produced no relay candidate although TURN servers were configured.
     */
    TURN_UNREACHABLE = 'turn-unreachable'
}

/**
 * The number of local candidates gathered, per candidate type.
 */
export interface ICandidateCounts {
    host: number;
    prflx: number;
    relay: number;
    srflx: number;
}

/**
 * A STUN/TURN server error reported through 'icecandidateerror'.
 */
export interface IIceServerError {
    errorCode: number;
    url: string;
}

/**
 * The candidate pair selected by ICE.
 */
export interface ISelectedCandidatePair {
    localType?: string;
    protocol?: string;
    relayProtocol?: string;
    remoteType?: string;
    rtt?: number;
}

/**
 * The connectivity assessment of a media session.
 */
export interface IMediaConnectivity {
    candidates: ICandidateCounts;
    iceServerErrors: IIceServerError[];
    p2p: boolean;
    reasons: MediaConnectivityReason[];
    selectedPair?: ISelectedCandidatePair;
    status: MediaConnectivityStatus;
}
