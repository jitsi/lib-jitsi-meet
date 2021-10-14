/* global __filename */

import { getLogger } from 'jitsi-meet-logger';
import { Strophe } from 'strophe.js';

import * as MediaType from '../../service/RTC/MediaType';
import * as SignalingEvents from '../../service/RTC/SignalingEvents';
import SignalingLayer, { getMediaTypeFromSourceName } from '../../service/RTC/SignalingLayer';
import VideoType from '../../service/RTC/VideoType';
import XMPPEvents from '../../service/xmpp/XMPPEvents';
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
    }

    /**
     * Adds <SourceInfo> element to the local presence.
     *
     * @returns {void}
     * @private
     */
    _addLocalSourceInfoToPresence() {
        if (this.chatRoom) {
            this.chatRoom.addOrReplaceInPresence(
                SOURCE_INFO_PRESENCE_ELEMENT,
                { value: JSON.stringify(this._localSourceState) });
        }
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
            if (FeatureFlags.isSourceNameSignalingEnabled()) {
                this._sourceInfoHandler
                    && oldChatRoom.removePresenceListener(
                        SOURCE_INFO_PRESENCE_ELEMENT, this._sourceInfoHandler);
                this._memberLeftHandler
                    && oldChatRoom.removeEventListener(
                        XMPPEvents.MUC_MEMBER_LEFT, this._memberLeftHandler);
            }
        }
        if (room) {
            if (FeatureFlags.isSourceNameSignalingEnabled()) {
                this._bindChatRoomEventHandlers(room);
                this._addLocalSourceInfoToPresence();
            } else {
                // TODO the logic below has been duplicated in _bindChatRoomEventHandlers, clean this up once
                //  the new impl has been tested well enough
                // SignalingEvents
                this._audioMuteHandler = (node, from) => {
                    this.eventEmitter.emit(
                        SignalingEvents.PEER_MUTED_CHANGED,
                        from, MediaType.AUDIO, node.value === 'true');
                };
                room.addPresenceListener('audiomuted', this._audioMuteHandler);

                this._videoMuteHandler = (node, from) => {
                    this.eventEmitter.emit(
                        SignalingEvents.PEER_MUTED_CHANGED,
                        from, MediaType.VIDEO, node.value === 'true');
                };
                room.addPresenceListener('videomuted', this._videoMuteHandler);

                this._videoTypeHandler = (node, from) => {
                    this.eventEmitter.emit(
                        SignalingEvents.PEER_VIDEO_TYPE_CHANGED,
                        from, node.value);
                };
                room.addPresenceListener('videoType', this._videoTypeHandler);
            }
        }
    }

    /**
     * Binds event listeners to the chat room instance.
     * @param {ChatRoom} room
     * @private
     * @returns {void}
     */
    _bindChatRoomEventHandlers(room) {
        const emitAudioMutedEvent = (endpointId, muted) => {
            this.eventEmitter.emit(
                SignalingEvents.PEER_MUTED_CHANGED,
                endpointId,
                MediaType.AUDIO,
                muted);
        };
        const emitVideoMutedEvent = (endpointId, muted) => {
            this.eventEmitter.emit(
                SignalingEvents.PEER_MUTED_CHANGED,
                endpointId,
                MediaType.VIDEO,
                muted);
        };

        // SignalingEvents
        this._audioMuteHandler = (node, from) => {
            if (!this._doesEndpointSendNewSourceInfo(from)) {
                emitAudioMutedEvent(from, node.value === 'true');
            }
        };
        room.addPresenceListener('audiomuted', this._audioMuteHandler);

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

        this._sourceInfoHandler = (node, mucNick) => {
            const endpointId = mucNick;
            const { value } = node;
            const sourceInfoJSON = JSON.parse(value);
            const emitEventsFromHere = this._doesEndpointSendNewSourceInfo(endpointId);
            const endpointSourceState
                = this._remoteSourceState[endpointId] || (this._remoteSourceState[endpointId] = {});

            for (const sourceName of Object.keys(sourceInfoJSON)) {
                const mediaType = getMediaTypeFromSourceName(sourceName);
                const newMutedState = Boolean(sourceInfoJSON[sourceName].muted);
                const oldSourceState = endpointSourceState[sourceName]
                    || (endpointSourceState[sourceName] = { sourceName });

                if (oldSourceState.muted !== newMutedState) {
                    oldSourceState.muted = newMutedState;
                    if (emitEventsFromHere && mediaType === MediaType.AUDIO) {
                        emitAudioMutedEvent(endpointId, newMutedState);
                    } else {
                        emitVideoMutedEvent(endpointId, newMutedState);
                    }
                }

                const newVideoType = sourceInfoJSON[sourceName].videoType;

                if (oldSourceState.videoType !== newVideoType) {
                    oldSourceState.videoType = newVideoType;
                    emitEventsFromHere && emitVideoTypeEvent(endpointId, newVideoType);
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
        };

        room.addEventListener(XMPPEvents.MUC_MEMBER_LEFT, this._memberLeftHandler);
    }

    /**
     * Finds the first source of given media type for the given endpoint.
     * @param endpointId
     * @param mediaType
     * @returns {SourceInfo|null}
     * @private
     */
    _findEndpointSourceInfoForMediaType(endpointId, mediaType) {
        const remoteSourceState = this._remoteSourceState[endpointId];

        if (!remoteSourceState) {
            return null;
        }

        for (const sourceInfo of Object.values(remoteSourceState)) {
            const _mediaType = getMediaTypeFromSourceName(sourceInfo.sourceName);

            if (_mediaType === mediaType) {
                return sourceInfo;
            }
        }

        return null;
    }

    /**
     * @inheritDoc
     */
    getPeerMediaInfo(owner, mediaType) {
        const legacyGetPeerMediaInfo = () => {
            if (this.chatRoom) {
                return this.chatRoom.getMediaPresenceInfo(owner, mediaType);
            }
            logger.error('Requested peer media info, before room was set');
        };

        if (FeatureFlags.isSourceNameSignalingEnabled()) {
            const lastPresence = this.chatRoom.getLastPresence(owner);

            if (!lastPresence) {
                throw new Error(`getPeerMediaInfo - no presence stored for: ${owner}`);
            }

            if (!this._doesEndpointSendNewSourceInfo(owner)) {
                return legacyGetPeerMediaInfo();
            }

            /**
             * @type {PeerMediaInfo}
             */
            const mediaInfo = {};
            const endpointMediaSource = this._findEndpointSourceInfoForMediaType(owner, mediaType);

            // The defaults are provided only, because getPeerMediaInfo is a legacy method. This will be eventually
            // changed into a getSourceInfo method which returns undefined if there's no source. Also there will be
            // no mediaType argument there.
            if (mediaType === MediaType.AUDIO) {
                mediaInfo.muted = endpointMediaSource ? endpointMediaSource.muted : true;
            } else if (mediaType === MediaType.VIDEO) {
                mediaInfo.muted = endpointMediaSource ? endpointMediaSource.muted : true;
                mediaInfo.videoType = endpointMediaSource ? endpointMediaSource.videoType : undefined;

                const codecTypeNode = filterNodeFromPresenceJSON(lastPresence, 'jitsi_participant_codecType');

                if (codecTypeNode.length > 0) {
                    mediaInfo.codecType = codecTypeNode[0].value;
                }
            } else {
                throw new Error(`Unsupported media type: ${mediaType}`);
            }

            return mediaInfo;
        }

        return legacyGetPeerMediaInfo();
    }

    /**
     * @inheritDoc
     */
    getPeerSourceInfo(owner, sourceName) {
        return this._remoteSourceState[owner] ? this._remoteSourceState[owner][sourceName] : undefined;
    }

    /**
     * @inheritDoc
     */
    getSSRCOwner(ssrc) {
        return this.ssrcOwners.get(ssrc);
    }

    /**
     * Set an SSRC owner.
     * @param {number} ssrc an SSRC to be owned
     * @param {string} endpointId owner's ID (MUC nickname)
     * @throws TypeError if <tt>ssrc</tt> is not a number
     */
    setSSRCOwner(ssrc, endpointId) {
        if (typeof ssrc !== 'number') {
            throw new TypeError(`SSRC(${ssrc}) must be a number`);
        }

        // Now signaling layer instance is shared between different JingleSessionPC instances, so although very unlikely
        // an SSRC conflict could potentially occur. Log a message to make debugging easier.
        if (this.ssrcOwners.has(ssrc)) {
            logger.error(`SSRC owner re-assigned from ${this.ssrcOwners.get(ssrc)} to ${endpointId}`);
        }
        this.ssrcOwners.set(ssrc, endpointId);
    }

    /**
     * Adjusts muted status of given track.
     *
     * @param {SourceName} sourceName - the name of the track's source.
     * @param {boolean} muted - the new muted status.
     * @returns {boolean}
     */
    setTrackMuteStatus(sourceName, muted) {
        if (!this._localSourceState[sourceName]) {
            this._localSourceState[sourceName] = {};
        }

        this._localSourceState[sourceName].muted = muted;

        if (this.chatRoom) {
            // FIXME This only adjusts the presence, but doesn't actually send it. Here we temporarily rely on
            // the legacy signaling part to send the presence. Remember to add "send presence" here when the legacy
            // signaling is removed.
            this._addLocalSourceInfoToPresence();
        }
    }

    /**
     * Sets track's video type.
     * @param {SourceName} sourceName - the track's source name.
     * @param {VideoType} videoType - the new video type.
     */
    setTrackVideoType(sourceName, videoType) {
        if (!this._localSourceState[sourceName]) {
            this._localSourceState[sourceName] = {};
        }

        if (this._localSourceState[sourceName].videoType !== videoType) {
            // Include only if not a camera (default)
            this._localSourceState[sourceName].videoType = videoType === VideoType.CAMERA ? undefined : videoType;

            // NOTE this doesn't send the actual presence, because is called from the same place where the legacy video
            // type is emitted which does the actual sending. A send presence statement needs to be added when
            // the legacy part is removed.
            this._addLocalSourceInfoToPresence();
        }
    }
}
