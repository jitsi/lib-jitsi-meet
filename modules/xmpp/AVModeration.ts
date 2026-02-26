import { getLogger } from '@jitsi/logger';
import { $msg } from 'strophe.js';

import { MediaType } from '../../service/RTC/MediaType';
import { XMPPEvents } from '../../service/xmpp/XMPPEvents';

import ChatRoom from './ChatRoom';
import XMPP from './xmpp';

const logger = getLogger('xmpp:AVModeration');

export interface IModerationEnabledByType {
    audio: boolean;
    desktop: boolean;
    video: boolean;
}

export interface IMessageObject {
    actor: string;
    approved: boolean;
    enabled: boolean;
    mediaType: MediaType;
    removed: boolean;
    whitelists: { audio: string[]; video: string[]; };
}

/**
 * The AVModeration logic.
 */
export default class AVModeration {
    private _xmpp: XMPP;
    private _mainRoom: ChatRoom;
    private _moderationEnabledByType: IModerationEnabledByType;
    private _whitelistAudio: string[];
    private _whitelistDesktop: string[];
    private _whitelistVideo: string[];

    /**
     * Constructs AV moderation room.
     *
     * @param {ChatRoom} room the main room.
     */
    constructor(room: ChatRoom) {
        this._xmpp = room.xmpp;

        this._mainRoom = room;

        this._moderationEnabledByType = {
            [MediaType.AUDIO]: false,
            [MediaType.DESKTOP]: false,
            [MediaType.VIDEO]: false
        };

        this._whitelistAudio = [];
        this._whitelistDesktop = [];
        this._whitelistVideo = [];

        this._onMessage = this._onMessage.bind(this);
        this._xmpp.addListener(XMPPEvents.AV_MODERATION_RECEIVED, this._onMessage);
    }

    /**
     * Stops listening for events.
     */
    dispose() {
        this._xmpp.removeListener(XMPPEvents.AV_MODERATION_RECEIVED, this._onMessage);
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
    enable(state: boolean, mediaType: MediaType) {
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
    approve(mediaType: MediaType, jid: string) {
        if (!this.isSupported() || !this._mainRoom.isModerator()) {
            logger.error(`Cannot approve in AV moderation supported:${this.isSupported()},
                moderator:${this._mainRoom.isModerator()}`);

            return;
        }

        // send a message to whitelist the jid and approve it to unmute
        const msg = $msg({ to: this._xmpp.avModerationComponentAddress });

        msg.c('av_moderation', {
            jidToWhitelist: jid,
            mediaType
        }).up();

        this._xmpp.connection.send(msg);
    }

    /**
     * Rejects that a participant can unmute by sending a msg with its jid to the component.
     */
    reject(mediaType: MediaType, jid: string) {
        if (!this.isSupported() || !this._mainRoom.isModerator()) {
            logger.error(`Cannot reject in AV moderation supported:${this.isSupported()},
                moderator:${this._mainRoom.isModerator()}`);

            return;
        }

        // send a message to remove from whitelist the jid and reject it to unmute
        const msg = $msg({ to: this._xmpp.avModerationComponentAddress });

        msg.c('av_moderation', {
            jidToBlacklist: jid,
            mediaType
        }).up();

        this._xmpp.connection.send(msg);
    }

    /**
     * Receives av_moderation parsed messages as json.
     * @param obj the parsed json content of the message to process.
     * @private
     */
    _onMessage(obj: IMessageObject) {
        const { removed, mediaType: media, enabled, approved, actor, whitelists: newWhitelists } = obj;

        if (newWhitelists) {
            let oldList;

            switch (media) {
            case MediaType.AUDIO:
                oldList = this._whitelistAudio;
                break;
            case MediaType.DESKTOP:
                oldList = this._whitelistDesktop;
                break;
            case MediaType.VIDEO:
                oldList = this._whitelistVideo;
                break;
            default:
                logger.error(`Unknown media type: ${media}`);

                return;
            }
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

            switch (media) {
            case MediaType.AUDIO:
                this._whitelistAudio = newList;
                break;
            case MediaType.DESKTOP:
                this._whitelistDesktop = newList;
                break;
            case MediaType.VIDEO:
                this._whitelistVideo = newList;
                break;
            }
        } else if (enabled !== undefined && this._moderationEnabledByType[media] !== enabled) {
            this._moderationEnabledByType[media] = enabled;

            this._xmpp.eventEmitter.emit(XMPPEvents.AV_MODERATION_CHANGED, enabled, media, actor);
        } else if (removed) {
            this._xmpp.eventEmitter.emit(XMPPEvents.AV_MODERATION_REJECTED, media);
        } else if (approved) {
            this._xmpp.eventEmitter.emit(XMPPEvents.AV_MODERATION_APPROVED, media);
        }
    }
}
