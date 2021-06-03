import { getLogger } from 'jitsi-meet-logger';
import { $msg } from 'strophe.js';

import * as MediaType from '../../service/RTC/MediaType';
import XMPPEvents from '../../service/xmpp/XMPPEvents';

const logger = getLogger(__filename);

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
        this._xmpp = room.xmpp;

        this._mainRoom = room;

        this._momderationEnabledByType = {
            [MediaType.AUDIO]: false,
            [MediaType.VIDEO]: false
        };

        this._whitelistAudio = [];
        this._whitelistVideo = [];

        this._xmpp.addListener(XMPPEvents.AV_MODERATION_RECEIVED, this._onMessage.bind(this));
    }

    /**
     * Whether AV moderation is supported on backend.
     *
     * @returns {boolean} whether AV moderation is supported on backend.
     */
    isSupported() {
        return Boolean(this._xmpp.avModerationComponentAddress);
    }

    /**
     * Enables or disables AV Moderation by sending a msg with command to the component.
     */
    enable(state, mediaType) {
        if (!this.isSupported() || !this._mainRoom.isModerator()) {
            logger.error(`Cannot enable:${state} AV moderation supported:${this.isSupported()}, 
                moderator:${this._mainRoom.isModerator()}`);

            return;
        }

        if (state === this._momderationEnabledByType[mediaType]) {
            logger.warn(`Moderation already in state:${state} for mediaType:${mediaType}`);

            return;
        }

        // send the enable/disable message
        const msg = $msg({ to: this._xmpp.avModerationComponentAddress });

        msg.c('av_moderation', {
            enable: state,
            mediaType
        }).up();

        this._xmpp.connection.send(msg);
    }

    /**
     * Approves that a participant can unmute by sending a msg with its jid to the component.
     */
    approve(mediaType, jid) {
        if (!this.isSupported() || !this._mainRoom.isModerator()) {
            logger.error(`Cannot approve in AV moderation supported:${this.isSupported()}, 
                moderator:${this._mainRoom.isModerator()}`);

            return;
        }

        // send a message to whitelist the jid and approve it to unmute
        const msg = $msg({ to: this._xmpp.avModerationComponentAddress });

        msg.c('av_moderation', {
            mediaType,
            jidToWhitelist: jid }).up();

        this._xmpp.connection.send(msg);
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
                    .forEach(jid => this._xmpp.eventEmitter
                        .emit(XMPPEvents.AV_MODERATION_PARTICIPANT_APPROVED, mediaType, jid));
            };

            if (newWhitelists[MediaType.AUDIO]) {
                fireEventApprovedJids(MediaType.AUDIO, this._whitelistAudio, newWhitelists[MediaType.AUDIO]);
            }

            if (newWhitelists[MediaType.VIDEO]) {
                fireEventApprovedJids(MediaType.VIDEO, this._whitelistVideo, newWhitelists[MediaType.VIDEO]);
            }
        } else if (obj.enabled !== undefined && this._momderationEnabledByType[obj.mediaType] !== obj.enabled) {
            this._momderationEnabledByType[obj.mediaType] = obj.enabled;

            this._xmpp.eventEmitter.emit(XMPPEvents.AV_MODERATION_CHANGED, obj.enabled, obj.mediaType, obj.actor);
        } else if (obj.approved) {
            this._xmpp.eventEmitter.emit(XMPPEvents.AV_MODERATION_APPROVED, obj.mediaType);
        }
    }
}
