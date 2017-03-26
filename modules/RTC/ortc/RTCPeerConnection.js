import { getLogger } from 'jitsi-meet-logger';
import yaeti from 'yaeti';

const logger = getLogger(__filename);

/**
 * RTCPeerConnection shim for ORTC based endpoints (such as Edge).
 */
export default class ortcRTCPeerConnection extends yaeti.EventTarget {
    /**
     * Constructor.
     *
     * @param {object} pcConfig WebRTC 'PeerConnection' configuration object.
     */
    constructor(pcConfig) {
        super();

        logger.debug('constructor() [pcConfig:%o]', pcConfig);
    }

    /**
     * [close description]
     * @return {[type]} [description]
     */
    close() {
        logger.debug('close()');
    }

    /**
     * [createOffer description]
     * @param  {[type]} desc [description]
     * @return {[type]}      [description]
     */
    createOffer(desc) {
        logger.debug('createOffer() [desc:%s]', desc);
    }

    /**
     * [createAnswer description]
     * @param  {[type]} desc [description]
     * @return {[type]}      [description]
     */
    createAnswer(desc) {
        logger.debug('createAnswer() [desc:%s]', desc);
    }

    /**
     * [setLocalDescription description]
     * @param {[type]} desc [description]
     */
    setLocalDescription(desc) {
        logger.debug('setLocalDescription() [desc:%s]', desc);
    }

    /**
     * [setRemoteDescription description]
     * @param {[type]} desc [description]
     */
    setRemoteDescription(desc) {
        logger.debug('setRemoteDescription() [desc:%s]', desc);
    }

    /**
     * [addIceCandidate description]
     * @param {[type]} candidate [description]
     */
    addIceCandidate(candidate) {
        logger.debug('addIceCandidate() [candidate:%o]', candidate);
    }

    /**
     * [addStream description]
     * @param {[type]} stream [description]
     */
    addStream(stream) {
        logger.debug('addStream() [stream:%o]', stream);
    }

    /**
     * [removeStream description]
     * @param  {[type]} stream [description]
     * @return {[type]}        [description]
     */
    removeStream(stream) {
        logger.debug('removeStream() [stream:%o]', stream);
    }

    /**
     * [createDataChannel description]
     * @return {[type]} [description]
     */
    createDataChannel() {
        logger.debug('createDataChannel()');
    }

    /**
     * [getStats description]
     * @return {[type]} [description]
     */
    getStats() {
        // TODO
    }
}
