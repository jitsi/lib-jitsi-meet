import { $msg } from 'strophe.js';

import * as MediaType from '../../service/RTC/MediaType';
import XMPPEvents from '../../service/xmpp/XMPPEvents';

/**
 * The AVModeration logic.
 */
export default class AVModeration {

    /**
     * Constructs AV moderation room.
     *
     * @param {ChatRoom} room the main room.
     */
    constructor(room) {
        this.xmpp = room.xmpp;

        this.mainRoom = room;

        this.enabled = false;
        this.whitelistAudio = [];
        this.whitelistVideo = [];

        this.xmpp.addListener(XMPPEvents.AV_MODERATION_RECEIVED, this._onMessage.bind(this));
    }

    /**
     * Whether AV moderation is supported on backend.
     *
     * @returns {boolean} whether AV moderation is supported on backend.
     */
    isSupported() {
        return Boolean(this.xmpp.avModerationComponentAddress);
    }

    /**
     * Enables or disables AV Moderation by sending a msg with command to the component.
     */
    enable(state) {
        if (!this.isSupported() || !this.mainRoom.isModerator()) {
            return;
        }

        if (state === this.enabled) {
            return;
        }

        // send the enable/disable message
        const msg = $msg({ to: this.xmpp.avModerationComponentAddress });

        msg.c('av_moderation', { enable: state }).up();

        this.xmpp.connection.send(msg);
    }

    /**
     * Approves that a participant can unmute by sending a msg with its jid to the component.
     */
    approve(mediaType, jid) {
        if (!this.isSupported() || !this.mainRoom.isModerator()) {
            return;
        }

        // send a message to whitelist the jid and approve it to unmute
        const msg = $msg({ to: this.xmpp.avModerationComponentAddress });

        msg.c('av_moderation', {
            mediaType,
            jidToWhitelist: jid }).up();

        this.xmpp.connection.send(msg);
    }

    /**
     * Receives av_moderation parsed messages as json.
     * @param obj the parsed json content of the message to process.
     * @private
     */
    _onMessage(obj) {
        const newWhitelists = obj.whitelists;

        if (newWhitelists) {
            const fireEventApprovedJids = (mediaType, oldList, newList) => {
                newList.filter(x => !oldList.includes(x))
                    .forEach(jid => this.xmpp.eventEmitter
                        .emit(XMPPEvents.AV_MODERATION_PARTICIPANT_APPROVED, mediaType, jid));
            };

            if (newWhitelists[MediaType.AUDIO]) {
                fireEventApprovedJids(MediaType.AUDIO, this.whitelistAudio, newWhitelists[MediaType.AUDIO]);
            }

            if (newWhitelists[MediaType.VIDEO]) {
                fireEventApprovedJids(MediaType.VIDEO, this.whitelistVideo, newWhitelists[MediaType.VIDEO]);
            }
        } else if (this.enabled !== obj.enabled) {
            this.enabled = obj.enabled;

            this.xmpp.eventEmitter.emit(XMPPEvents.AV_MODERATION_CHANGED, this.enabled);
        } else if (obj.approved) {
            this.xmpp.eventEmitter.emit(XMPPEvents.AV_MODERATION_APPROVED, obj.mediaType);
        }
    }
}
