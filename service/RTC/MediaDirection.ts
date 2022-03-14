/**
 * Enumeration of the media direction types.
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
    SENDRECV = 'sendrecv'
};
