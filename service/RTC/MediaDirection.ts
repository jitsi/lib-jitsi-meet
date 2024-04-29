/**
 * Enumeration of the media direction types.
 * https://www.w3.org/TR/webrtc/#dom-rtcrtptransceiverdirection
 */
export enum MediaDirection {
    /**
     * Media is send and receive is suspended.
     */
    INACTIVE = 'inactive',

    /**
     * Media is only received from remote peer.
     */
    RECVONLY = 'recvonly',

    /**
     * Media is only sent to the remote peer.
     */
    SENDONLY = 'sendonly',

    /**
     * Media is sent and received.
     */
    SENDRECV = 'sendrecv',

    /**
     * Media will neither be sent or received.
     */
    STOPPED = 'stopped'
}
