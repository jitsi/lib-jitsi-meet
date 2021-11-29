/* global module */
/**
 * Enumeration of the media direction types.
 * @type {{INACTIVE: string, RECVONLY: string, SENDONLY: string, SENDRECV: string}}
 */
const MediaDirection = {
    /**
     * Media is send and receive is suspended.
     */
    INACTIVE: 'inactive',

    /**
     * Media is only received from remote peer.
     */
    RECVONLY: 'recvonly',

    /**
     * Media is only sent to the remote peer.
     */
    SENDONLY: 'sendonly',

    /**
     * Media is sent and received.
     */
    SENDRECV: 'sendrecv'
};

module.exports = MediaDirection;
