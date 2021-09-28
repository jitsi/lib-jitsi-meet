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

        this._moderationEnabledByType = {
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

        if (state === this._moderationEnabledByType[mediaType]) {
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
     * Rejects that a participant can unmute by sending a msg with its jid to the component.
     */
    reject(mediaType, jid) {
        if (!this.isSupported() || !this._mainRoom.isModerator()) {
            logger.error(`Cannot reject in AV moderation supported:${this.isSupported()},
                moderator:${this._mainRoom.isModerator()}`);

            return;
        }

        // send a message to remove from whitelist the jid and reject it to unmute
        const msg = $msg({ to: this._xmpp.avModerationComponentAddress });

        msg.c('av_moderation', {
            mediaType,
            jidToBlacklist: jid
        }).up();

        this._xmpp.connection.send(msg);
    }

    /**
     * Receives av_moderation parsed messages as json.
     * @param obj the parsed json content of the message to process.
     * @private
     */
    _onMessage(obj) {
        const { removed, mediaType: media, enabled, approved, actor, whitelists: newWhitelists } = obj;

        if (newWhitelists) {
            const oldList = media === MediaType.AUDIO
                ? this._whitelistAudio
                : this._whitelistVideo;
            const newList = Array.isArray(newWhitelists[media]) ? newWhitelists[media] : [];

            if (removed) {
                oldList.filter(x => !newList.includes(x))
                    .forEach(jid => this._xmpp.eventEmitter
                        .emit(XMPPEvents.AV_MODERATION_PARTICIPANT_REJECTED, media, jid));
            } else {
                newList.filter(x => !oldList.includes(x))
                    .forEach(jid => this._xmpp.eventEmitter
                        .emit(XMPPEvents.AV_MODERATION_PARTICIPANT_APPROVED, media, jid));
            }

            if (media === MediaType.AUDIO) {
                this._whitelistAudio = newList;
            } else {
                this._whitelistVideo = newList;
            }
        } else if (enabled !== undefined && this._moderationEnabledByType[media] !== enabled) {
            this._moderationEnabledByType[media] = enabled;

            this._xmpp.eventEmitter.emit(XMPPEvents.AV_MODERATION_CHANGED, enabled, media, actor);
        } else if (approved) {
            const event = removed ? XMPPEvents.AV_MODERATION_REJECTED : XMPPEvents.AV_MODERATION_APPROVED;

            this._xmpp.eventEmitter.emit(event, media);
        }
    }
}
