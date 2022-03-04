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

//export const INACTIVE = MediaDirection.INACTIVE;
//export const RECVONLY = MediaDirection.RECVONLY;
//export const SENDONLY = MediaDirection.SENDONLY;
//export const SENDRECV = MediaDirection.SENDRECV;

// TODO: this was a pre-ES6 module using module.exports = MediaDirection which doesn't translate well
// it is used in a number of places and should be updated to use the named export

//export default MediaDirection;
