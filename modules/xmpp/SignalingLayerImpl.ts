import { safeJsonParse } from '@jitsi/js-utils/json';
import { getLogger } from '@jitsi/logger';
import { Strophe } from 'strophe.js';

import { MediaType } from '../../service/RTC/MediaType';
import { SignalingEvents } from '../../service/RTC/SignalingEvents';
import SignalingLayer, { EndpointId, IPeerMediaInfo, ISourceInfo, SourceName, getMediaTypeFromSourceName } from '../../service/RTC/SignalingLayer';
import { VideoType } from '../../service/RTC/VideoType';
import { XMPPEvents } from '../../service/xmpp/XMPPEvents';
import FeatureFlags from '../flags/FeatureFlags';

import ChatRoom, { filterNodeFromPresenceJSON } from './ChatRoom';


const logger = getLogger('xmpp:SignalingLayerImpl');

export const SOURCE_INFO_PRESENCE_ELEMENT = 'SourceInfo';

export interface IPresenceNode {
    [key: string]: any;
    tagName: string;
    value?: string; // for other possible properties
}

/**
 * Default XMPP implementation of the {@link SignalingLayer} interface. Obtains
 * the data from the MUC presence.
 */
export default class SignalingLayerImpl extends SignalingLayer {
    /**
     * A map that stores SSRCs of remote streams and the corresponding jid and source name.
     * @type {Map<number, { endpointId: string, sourceName: string }>}
     */
    private _ssrcOwners: Map<number, { endpointId: string; sourceName: string; }>;

    /**
     * @type {ChatRoom|null}
     */
    private _chatRoom?: ChatRoom;

    /**
     * @type {Record<SourceName, Partial<ISourceInfo>>}
     * @private
     */
    private _localSourceState: Record<SourceName, Partial<ISourceInfo>>;

    /**
     * @type {Record<EndpointId, Record<SourceName, ISourceInfo>>}
     * @private
     */
    private _remoteSourceState: Record<EndpointId, Record<SourceName, ISourceInfo>>;

    // Event handler references for cleanup
    private _audioMuteHandler?: (node: IPresenceNode, from: string) => void;
    private _videoMuteHandler?: (node: IPresenceNode, from: string) => void;
    private _videoTypeHandler?: (node: IPresenceNode, from: string) => void;
    private _sourceInfoHandler?: (node: IPresenceNode, mucNick: string) => void;
    private _memberLeftHandler?: (jid: string) => void;

    /**
     * Creates new instance.
     */
    constructor() {
        super();

        this._ssrcOwners = new Map();
        this._chatRoom = null;
        this._localSourceState = { };
        this._remoteSourceState = { };

    }

    /**
     * Adds <SourceInfo> element to the local presence.
     *
     * @returns {boolean}
     * @private
     */
    private _addLocalSourceInfoToPresence(): boolean {
        if (this._chatRoom) {
            return this._chatRoom.addOrReplaceInPresence(
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
    private _bindChatRoomEventHandlers(room: ChatRoom): void {
        // Add handlers for 'audiomuted', 'videomuted' and 'videoType' fields in presence in order to support interop
        // with very old versions of mobile clients and jigasi that do not support source-name signaling.
        const emitAudioMutedEvent = (endpointId: string, muted: boolean) => {
            this.eventEmitter.emit(
                SignalingEvents.PEER_MUTED_CHANGED,
                endpointId,
                MediaType.AUDIO,
                muted);
        };

        this._audioMuteHandler = (node: IPresenceNode, from: string) => {
            if (!this._doesEndpointSendNewSourceInfo(from)) {
                emitAudioMutedEvent(from, node.value === 'true');
            }
        };
        room.addPresenceListener('audiomuted', this._audioMuteHandler);

        const emitVideoMutedEvent = (endpointId: string, muted: boolean) => {
            this.eventEmitter.emit(
                SignalingEvents.PEER_MUTED_CHANGED,
                endpointId,
                MediaType.VIDEO,
                muted);
        };

        this._videoMuteHandler = (node: IPresenceNode, from: string) => {
            if (!this._doesEndpointSendNewSourceInfo(from)) {
                emitVideoMutedEvent(from, node.value === 'true');
            }
        };
        room.addPresenceListener('videomuted', this._videoMuteHandler);

        const emitVideoTypeEvent = (endpointId: string, videoType: string) => {
            this.eventEmitter.emit(
                SignalingEvents.PEER_VIDEO_TYPE_CHANGED,
                endpointId, videoType);
        };

        this._videoTypeHandler = (node: IPresenceNode, from: string) => {
            if (!this._doesEndpointSendNewSourceInfo(from)) {
                emitVideoTypeEvent(from, node.value);
            }
        };
        room.addPresenceListener('videoType', this._videoTypeHandler);

        // Add handlers for presence in the new format.
        this._sourceInfoHandler = (node: IPresenceNode, mucNick: string) => {
            const endpointId = mucNick;
            const { value } = node;
            const sourceInfoJSON = safeJsonParse(value);
            const emitEventsFromHere = this._doesEndpointSendNewSourceInfo(endpointId);
            const endpointSourceState = this._remoteSourceState[endpointId] || (this._remoteSourceState[endpointId] = {});

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
        this._memberLeftHandler = (jid: string) => {
            const endpointId = Strophe.getResourceFromJid(jid);

            delete this._remoteSourceState[endpointId];
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
    private _doesEndpointSendNewSourceInfo(endpointId: EndpointId): boolean {
        const presence = this._chatRoom?.getLastPresence(endpointId);

        return Boolean(presence?.find((node: IPresenceNode) => node.tagName === SOURCE_INFO_PRESENCE_ELEMENT));
    }

    /**
     * Logs a debug or error message to console depending on whether SSRC rewriting is enabled or not.
     * Owner changes are permitted only when SSRC rewriting is enabled.
     *
     * @param {string} message - The message to be logged.
     * @returns {void}
     */
    private _logOwnerChangedMessage(message: string): void {
        if (FeatureFlags.isSsrcRewritingSupported()) {
            logger.debug(message);
        } else {
            logger.error(message);
        }
    }

    /**
     * @inheritDoc
     */
    public override getPeerMediaInfo(owner: string, mediaType: MediaType, sourceName?: SourceName): Optional<IPeerMediaInfo> {
        const legacyGetPeerMediaInfo = (): Optional<IPeerMediaInfo> => {
            if (this._chatRoom) {
                return this._chatRoom.getMediaPresenceInfo(owner, mediaType);
            }
            logger.warn('Requested peer media info, before room was set');
        };

        const lastPresence = this._chatRoom?.getLastPresence(owner);

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

        const mediaInfo: IPeerMediaInfo = {
            muted: true
        };

        if (mediaType === MediaType.VIDEO) {
            mediaInfo.videoType = undefined;
            const codecListNode = filterNodeFromPresenceJSON(lastPresence, 'jitsi_participant_codecList');
            const codecTypeNode = filterNodeFromPresenceJSON(lastPresence, 'jitsi_participant_codecType');

            if (codecListNode.length) {
                mediaInfo.codecList = codecListNode[0].value?.split(',') ?? [];
            } else if (codecTypeNode.length > 0) {
                mediaInfo.codecType = codecTypeNode[0].value;
            }
        }

        return mediaInfo;
    }

    /**
     * @inheritDoc
     */
    public override getPeerSourceInfo(owner: EndpointId, sourceName: SourceName): Optional<ISourceInfo> {
        const mediaType = getMediaTypeFromSourceName(sourceName);
        const mediaInfo: ISourceInfo = mediaType === MediaType.VIDEO
            ? { muted: true, sourceName, videoType: VideoType.CAMERA }
            : { muted: true, sourceName };

        return this._remoteSourceState[owner]
            ? this._remoteSourceState[owner][sourceName] ?? mediaInfo
            : undefined;
    }

    /**
     * @inheritDoc
     */
    public override getSSRCOwner(ssrc: number): Optional<string> {
        return this._ssrcOwners.get(ssrc)?.endpointId;
    }

    /**
     * @inheritDoc
     */
    public override getTrackSourceName(ssrc: number): Optional<SourceName> {
        return this._ssrcOwners.get(ssrc)?.sourceName;
    }

    /**
     * @inheritDoc
     */
    public override removeSSRCOwners(ssrcList: number[]): void {
        if (!ssrcList?.length) {
            return;
        }

        for (const ssrc of ssrcList) {
            this._ssrcOwners.delete(ssrc);
        }
    }

    /**
     * Sets the <tt>ChatRoom</tt> instance used and binds presence listeners.
     * @param {ChatRoom} room
     */
    public setChatRoom(room: ChatRoom): void {
        const oldChatRoom = this._chatRoom;

        this._chatRoom = room;
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
    public override setSSRCOwner(ssrc: number, newEndpointId: string, newSourceName: string): void {
        if (typeof ssrc !== 'number') {
            throw new TypeError(`SSRC(${ssrc}) must be a number`);
        }

        // Now signaling layer instance is shared between different JingleSessionPC instances, so although very unlikely
        // an SSRC conflict could potentially occur. Log a message to make debugging easier.
        const existingOwner = this._ssrcOwners.get(ssrc);

        if (existingOwner) {
            const { endpointId, sourceName } = existingOwner;

            if (endpointId !== newEndpointId || sourceName !== newSourceName) {
                this._logOwnerChangedMessage(
                    `SSRC owner re-assigned from ${existingOwner}(source-name=${sourceName}) to ${
                        newEndpointId}(source-name=${newSourceName})`);
            }
        }
        this._ssrcOwners.set(ssrc, {
            endpointId: newEndpointId,
            sourceName: newSourceName
        });
    }

    /**
     * @inheritDoc
     */
    public override setTrackMuteStatus(sourceName: SourceName, muted: boolean): boolean {
        if (!this._localSourceState[sourceName]) {
            this._localSourceState[sourceName] = {};
        }

        this._localSourceState[sourceName].muted = muted;
        logger.debug(`Mute state of ${sourceName} changed to muted=${muted}`);

        if (this._chatRoom) {
            return this._addLocalSourceInfoToPresence();
        }

        return false;
    }

    /**
     * @inheritDoc
     */
    public override setTrackVideoType(sourceName: SourceName, videoType: VideoType): boolean {
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
    public override updateSsrcOwnersOnLeave(id: string): void {
        const ssrcs: number[] = [];

        this._ssrcOwners.forEach(({ endpointId }, ssrc) => {
            if (endpointId === id) {
                ssrcs.push(ssrc);
            }
        });

        if (!ssrcs?.length) {
            return;
        }

        this.removeSSRCOwners(ssrcs);
    }
}
