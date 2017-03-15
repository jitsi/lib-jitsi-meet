/* global __filename */

import { getLogger } from 'jitsi-meet-logger';
import * as MediaType from '../../service/RTC/MediaType';
import * as SignalingEvents from '../../service/RTC/SignalingEvents';
import SignalingLayer from '../../service/RTC/SignalingLayer';

const logger = getLogger(__filename);

/**
 * Default XMPP implementation of the {@link SignalingLayer} interface. Obtains
 * the data from the MUC presence.
 */
export default class SignalingLayerImpl extends SignalingLayer {
    /**
     * Creates new instance.
     */
    constructor() {
        super();

        /**
         * A map that stores SSRCs of remote streams. And is used only locally
         * We store the mapping when jingle is received, and later is used
         * onaddstream webrtc event where we have only the ssrc
         * FIXME: This map got filled and never cleaned and can grow during long
         * conference
         * @type {{}} maps SSRC number to jid
         */
        this.ssrcOwners = {};

        /**
         *
         * @type {ChatRoom|null}
         */
        this.chatRoom = null;
    }

    /**
     * Sets the <tt>ChatRoom</tt> instance used and binds presence listeners.
     * @param {ChatRoom} room
     */
    setChatRoom(room) {
        const oldChatRoom = this.chatRoom;

        this.chatRoom = room;
        if (oldChatRoom) {
            // FIXME ChatRoom removes all listeners, will not be capable of
            // working with multiple listeners per type (multiple JingleSessions
            // required for P2P).
            oldChatRoom.removePresenceListener(
                'audiomuted', this._audioMuteHandler);
            oldChatRoom.removePresenceListener(
                'videomuted', this._videoMuteHandler);
            oldChatRoom.removePresenceListener(
                'videoType', this._videoTypeHandler);
        }
        if (room) {
            // SignalingEvents
            this._audioMuteHandler = function(node, from) {
                this.eventEmitter.emit(
                    SignalingEvents.PEER_MUTED_CHANGED,
                    from, MediaType.AUDIO, node.value === 'true');
            }.bind(this);
            room.addPresenceListener('audiomuted', this._audioMuteHandler);

            this._videoMuteHandler = function(node, from) {
                this.eventEmitter.emit(
                    SignalingEvents.PEER_MUTED_CHANGED,
                    from, MediaType.VIDEO, node.value === 'true');
            }.bind(this);
            room.addPresenceListener('videomuted', this._videoMuteHandler);

            this._videoTypeHandler = function(node, from) {
                this.eventEmitter.emit(
                    SignalingEvents.PEER_VIDEO_TYPE_CHANGED,
                    from, node.value);
            }.bind(this);
            room.addPresenceListener('videoType', this._videoTypeHandler);
        }
    }

    /**
     * @inheritDoc
     */
    getPeerMediaInfo(owner, mediaType) {
        if (this.chatRoom) {
            return this.chatRoom.getMediaPresenceInfo(owner, mediaType);
        }
        logger.error('Requested peer media info, before room was set');
    }

    /**
     * @inheritDoc
     */
    getSSRCOwner(ssrc) {
        return this.ssrcOwners[ssrc];
    }

    /**
     * Set an SSRC owner.
     * @param {string} ssrc an SSRC to be owned
     * @param {string} endpointId owner's ID (MUC nickname)
     */
    setSSRCOwner(ssrc, endpointId) {
        this.ssrcOwners[ssrc] = endpointId;
    }
}
