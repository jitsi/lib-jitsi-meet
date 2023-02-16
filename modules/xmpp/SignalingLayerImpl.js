import { getLogger } from '@jitsi/logger';
import { Strophe } from 'strophe.js';

import { MediaType } from '../../service/RTC/MediaType';
import * as SignalingEvents from '../../service/RTC/SignalingEvents';
import SignalingLayer, { getMediaTypeFromSourceName } from '../../service/RTC/SignalingLayer';
import { VideoType } from '../../service/RTC/VideoType';
import { XMPPEvents } from '../../service/xmpp/XMPPEvents';
import FeatureFlags from '../flags/FeatureFlags';

import { filterNodeFromPresenceJSON } from './ChatRoom';

const logger = getLogger(__filename);

export const SOURCE_INFO_PRESENCE_ELEMENT = 'SourceInfo';

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
         * @type {Map<number, string>} maps SSRC number to jid
         */
        this.ssrcOwners = new Map();

        /**
         *
         * @type {ChatRoom|null}
         */
        this.chatRoom = null;

        /**
         * @type {Map<SourceName, SourceInfo>}
         * @private
         */
        this._localSourceState = { };

        /**
         * @type {Map<EndpointId, Map<SourceName, SourceInfo>>}
         * @private
         */
        this._remoteSourceState = { };

        /**
         * A map that stores the source name of a track identified by it's ssrc.
         * We store the mapping when jingle is received, and later is used
         * onaddstream webrtc event where we have only the ssrc
         * FIXME: This map got filled and never cleaned and can grow during long
         * conference
         * @type {Map<number, string>} maps SSRC number to source name
         */
        this._sourceNames = new Map();
    }

    /**
     * Adds <SourceInfo> element to the local presence.
     *
     * @returns {void}
     * @private
     */
    _addLocalSourceInfoToPresence() {
        if (this.chatRoom) {
            return this.chatRoom.addOrReplaceInPresence(
                SOURCE_INFO_PRESENCE_ELEMENT,
                { value: JSON.stringify(this._localSourceState) });
        }

        return false;
    }

    /**
     * Binds event listeners to the chat room instance.
     * @param {ChatRoom} room
     * @private
     * @returns {void}
     */
    _bindChatRoomEventHandlers(room) {
        // Add handlers for 'audiomuted', 'videomuted' and 'videoType' fields in presence in order to support interop
        // with very old versions of mobile clients and jigasi that do not support source-name signaling.
        const emitAudioMutedEvent = (endpointId, muted) => {
            this.eventEmitter.emit(
                SignalingEvents.PEER_MUTED_CHANGED,
                endpointId,
                MediaType.AUDIO,
                muted);
        };

        this._audioMuteHandler = (node, from) => {
            if (!this._doesEndpointSendNewSourceInfo(from)) {
                emitAudioMutedEvent(from, node.value === 'true');
            }
        };
        room.addPresenceListener('audiomuted', this._audioMuteHandler);

        const emitVideoMutedEvent = (endpointId, muted) => {
            this.eventEmitter.emit(
                SignalingEvents.PEER_MUTED_CHANGED,
                endpointId,
                MediaType.VIDEO,
                muted);
        };

        this._videoMuteHandler = (node, from) => {
            if (!this._doesEndpointSendNewSourceInfo(from)) {
                emitVideoMutedEvent(from, node.value === 'true');
            }
        };
        room.addPresenceListener('videomuted', this._videoMuteHandler);

        const emitVideoTypeEvent = (endpointId, videoType) => {
            this.eventEmitter.emit(
                SignalingEvents.PEER_VIDEO_TYPE_CHANGED,
                endpointId, videoType);
        };

        this._videoTypeHandler = (node, from) => {
            if (!this._doesEndpointSendNewSourceInfo(from)) {
                emitVideoTypeEvent(from, node.value);
            }
        };
        room.addPresenceListener('videoType', this._videoTypeHandler);

        // Add handlers for presence in the new format.
        this._sourceInfoHandler = (node, mucNick) => {
            const endpointId = mucNick;
            const { value } = node;
            const sourceInfoJSON = JSON.parse(value);
            const emitEventsFromHere = this._doesEndpointSendNewSourceInfo(endpointId);
            const endpointSourceState
                = this._remoteSourceState[endpointId] || (this._remoteSourceState[endpointId] = {});

            for (const sourceName of Object.keys(sourceInfoJSON)) {
                let sourceChanged = false;
                const mediaType = getMediaTypeFromSourceName(sourceName);
                const newMutedState = Boolean(sourceInfoJSON[sourceName].muted);
                const oldSourceState = endpointSourceState[sourceName]
                    || (endpointSourceState[sourceName] = { sourceName });

                if (oldSourceState.muted !== newMutedState) {
                    sourceChanged = true;
                    oldSourceState.muted = newMutedState;
                    if (emitEventsFromHere && !this._localSourceState[sourceName]) {
                        this.eventEmitter.emit(SignalingEvents.SOURCE_MUTED_CHANGED, sourceName, newMutedState);
                    }
                }

                // Assume a default videoType of 'camera' for video sources.
                const newVideoType = mediaType === MediaType.VIDEO
                    ? sourceInfoJSON[sourceName].videoType ?? VideoType.CAMERA
                    : undefined;

                if (oldSourceState.videoType !== newVideoType) {
                    oldSourceState.videoType = newVideoType;
                    sourceChanged = true;

                    // Since having a mix of eps that do/don't support multi-stream in the same call is supported, emit
                    // SOURCE_VIDEO_TYPE_CHANGED event when the remote source changes videoType.
                    if (emitEventsFromHere && !this._localSourceState[sourceName]) {
                        this.eventEmitter.emit(SignalingEvents.SOURCE_VIDEO_TYPE_CHANGED, sourceName, newVideoType);
                    }
                }

                if (sourceChanged && FeatureFlags.isSsrcRewritingSupported()) {
                    this.eventEmitter.emit(
                        SignalingEvents.SOURCE_UPDATED,
                        sourceName,
                        mucNick,
                        newMutedState,
                        newVideoType);
                }
            }

            // Cleanup removed source names
            const newSourceNames = Object.keys(sourceInfoJSON);

            for (const sourceName of Object.keys(endpointSourceState)) {
                if (newSourceNames.indexOf(sourceName) === -1) {
                    delete endpointSourceState[sourceName];
                }
            }
        };
        room.addPresenceListener('SourceInfo', this._sourceInfoHandler);

        // Cleanup when participant leaves
        this._memberLeftHandler = jid => {
            const endpointId = Strophe.getResourceFromJid(jid);

            delete this._remoteSourceState[endpointId];

            for (const [ key, value ] of this.ssrcOwners.entries()) {
                if (value === endpointId) {
                    delete this._sourceNames[key];
                }
            }
        };
        room.addEventListener(XMPPEvents.MUC_MEMBER_LEFT, this._memberLeftHandler);
    }

    /**
     * Check is given endpoint has advertised <SourceInfo/> in it's presence which means that the source name signaling
     * is used by this endpoint.
     *
     * @param {EndpointId} endpointId
     * @returns {boolean}
     */
    _doesEndpointSendNewSourceInfo(endpointId) {
        const presence = this.chatRoom?.getLastPresence(endpointId);

        return Boolean(presence && presence.find(node => node.tagName === SOURCE_INFO_PRESENCE_ELEMENT));
    }

    /**
     * Logs a debug or error message to console depending on whether SSRC rewriting is enabled or not.
     * Owner changes are permitted only when SSRC rewriting is enabled.
     *
     * @param {string} message - The message to be logged.
     * @returns {void}
     */
    _logOwnerChangedMessage(message) {
        if (FeatureFlags.isSsrcRewritingSupported()) {
            logger.debug(message);
        } else {
            logger.error(message);
        }
    }

    /**
     * @inheritDoc
     */
    getPeerMediaInfo(owner, mediaType, sourceName) {
        const legacyGetPeerMediaInfo = () => {
            if (this.chatRoom) {
                return this.chatRoom.getMediaPresenceInfo(owner, mediaType);
            }
            logger.warn('Requested peer media info, before room was set');
        };

        const lastPresence = this.chatRoom?.getLastPresence(owner);

        if (!lastPresence) {
            logger.warn(`getPeerMediaInfo - no presence stored for: ${owner}`);

            return;
        }
        if (!this._doesEndpointSendNewSourceInfo(owner)) {
            return legacyGetPeerMediaInfo();
        }

        if (sourceName) {
            return this.getPeerSourceInfo(owner, sourceName);
        }

        const mediaInfo = {
            muted: true
        };

        if (mediaType === MediaType.VIDEO) {
            mediaInfo.videoType = undefined;
            const codecTypeNode = filterNodeFromPresenceJSON(lastPresence, 'jitsi_participant_codecType');

            if (codecTypeNode.length > 0) {
                mediaInfo.codecType = codecTypeNode[0].value;
            }
        }

        return mediaInfo;
    }

    /**
     * @inheritDoc
     */
    getPeerSourceInfo(owner, sourceName) {
        const mediaInfo = {
            muted: true, // muted by default
            videoType: VideoType.CAMERA // 'camera' by default
        };

        return this._remoteSourceState[owner]
            ? this._remoteSourceState[owner][sourceName] ?? mediaInfo
            : undefined;
    }

    /**
     * @inheritDoc
     */
    getSSRCOwner(ssrc) {
        return this.ssrcOwners.get(ssrc);
    }

    /**
     * @inheritDoc
     */
    getTrackSourceName(ssrc) {
        return this._sourceNames.get(ssrc);
    }

    /**
     * @inheritDoc
     */
    removeSSRCOwners(ssrcList) {
        if (!ssrcList?.length) {
            return;
        }

        for (const ssrc of ssrcList) {
            this.ssrcOwners.delete(ssrc);
        }
    }

    /**
     * Sets the <tt>ChatRoom</tt> instance used and binds presence listeners.
     * @param {ChatRoom} room
     */
    setChatRoom(room) {
        const oldChatRoom = this.chatRoom;

        this.chatRoom = room;
        if (oldChatRoom) {
            oldChatRoom.removePresenceListener(
                'audiomuted', this._audioMuteHandler);
            oldChatRoom.removePresenceListener(
                'videomuted', this._videoMuteHandler);
            oldChatRoom.removePresenceListener(
                'videoType', this._videoTypeHandler);
            this._sourceInfoHandler
                && oldChatRoom.removePresenceListener(SOURCE_INFO_PRESENCE_ELEMENT, this._sourceInfoHandler);
            this._memberLeftHandler
                && oldChatRoom.removeEventListener(XMPPEvents.MUC_MEMBER_LEFT, this._memberLeftHandler);
        }
        if (room) {
            this._bindChatRoomEventHandlers(room);
            this._addLocalSourceInfoToPresence();
        }
    }

    /**
     * @inheritDoc
     */
    setSSRCOwner(ssrc, endpointId) {
        if (typeof ssrc !== 'number') {
            throw new TypeError(`SSRC(${ssrc}) must be a number`);
        }

        // Now signaling layer instance is shared between different JingleSessionPC instances, so although very unlikely
        // an SSRC conflict could potentially occur. Log a message to make debugging easier.
        const existingOwner = this.ssrcOwners.get(ssrc);

        if (existingOwner && existingOwner !== endpointId) {
            this._logOwnerChangedMessage(`SSRC owner re-assigned from ${existingOwner} to ${endpointId}`);
        }
        this.ssrcOwners.set(ssrc, endpointId);
    }

    /**
     * @inheritDoc
     */
    setTrackMuteStatus(sourceName, muted) {
        if (!this._localSourceState[sourceName]) {
            this._localSourceState[sourceName] = {};
        }

        this._localSourceState[sourceName].muted = muted;

        if (this.chatRoom) {
            return this._addLocalSourceInfoToPresence();
        }

        return false;
    }

    /**
     * @inheritDoc
     */
    setTrackSourceName(ssrc, sourceName) {
        if (typeof ssrc !== 'number') {
            throw new TypeError(`SSRC(${ssrc}) must be a number`);
        }

        // Now signaling layer instance is shared between different JingleSessionPC instances, so although very unlikely
        // an SSRC conflict could potentially occur. Log a message to make debugging easier.
        const existingName = this._sourceNames.get(ssrc);

        if (existingName && existingName !== sourceName) {
            this._logOwnerChangedMessage(`SSRC(${ssrc}) sourceName re-assigned from ${existingName} to ${sourceName}`);
        }

        this._sourceNames.set(ssrc, sourceName);
    }

    /**
     * @inheritDoc
     */
    setTrackVideoType(sourceName, videoType) {
        if (!this._localSourceState[sourceName]) {
            this._localSourceState[sourceName] = {};
        }

        if (this._localSourceState[sourceName].videoType !== videoType) {
            // Include only if not a camera (default)
            this._localSourceState[sourceName].videoType = videoType === VideoType.CAMERA ? undefined : videoType;

            return this._addLocalSourceInfoToPresence();
        }

        return false;
    }

    /**
     * @inheritDoc
     */
    updateSsrcOwnersOnLeave(id) {
        const ssrcs = Array.from(this.ssrcOwners)
            .filter(entry => entry[1] === id)
            .map(entry => entry[0]);

        if (!ssrcs?.length) {
            return;
        }

        this.removeSSRCOwners(ssrcs);
    }

}
