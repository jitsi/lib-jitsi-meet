
import Listenable from '../../modules/util/Listenable';

/**
 * An object that carries the info about specific media type advertised by
 * participant in the signaling channel.
 * @typedef {Object} PeerMediaInfo
 * @property {boolean} muted indicates if the media is currently muted
 * @property {VideoType|undefined} videoType the type of the video if applicable
 */

/**
 * Interface used to expose the information carried over the signaling channel
 * which is not available to the RTC module in the media SDP.
 *
 * @interface SignalingLayer
 */
export default class SignalingLayer extends Listenable {

    /**
     * Obtains the endpoint ID for given SSRC.
     * @param {number} ssrc the SSRC number.
     * @return {string|null} the endpoint ID for given media SSRC.
     */
    getSSRCOwner(ssrc) { // eslint-disable-line no-unused-vars
        throw new Error('not implemented');
    }

    /**
     * Obtains the info about given media advertised in the MUC presence of
     * the participant identified by the given MUC JID.
     * @param {string} owner the MUC jid of the participant for whom
     * {@link PeerMediaInfo} will be obtained.
     * @param {MediaType} mediaType the type of the media for which presence
     * info will be obtained.
     * @return {PeerMediaInfo|null} presenceInfo an object with media presence
     * info or <tt>null</tt> either if there is no presence available for given
     * JID or if the media type given is invalid.
     */
    getPeerMediaInfo(owner, mediaType) { // eslint-disable-line no-unused-vars
        throw new Error('not implemented');
    }
}
