import { getLogger } from '@jitsi/logger';
import { isEqual } from 'lodash-es';
import { $build, $iq, Strophe } from 'strophe.js';

import { JitsiConferenceEvents } from '../../JitsiConferenceEvents';
import { JitsiTrackEvents } from '../../JitsiTrackEvents';
import { CodecMimeType } from '../../service/RTC/CodecMimeType';
import { MediaDirection } from '../../service/RTC/MediaDirection';
import { MediaType } from '../../service/RTC/MediaType';
import { SSRC_GROUP_SEMANTICS } from '../../service/RTC/StandardVideoQualitySettings';
import { VideoType } from '../../service/RTC/VideoType';
import { AnalyticsEvents } from '../../service/statistics/AnalyticsEvents';
import { XMPPEvents } from '../../service/xmpp/XMPPEvents';
import { XEP } from '../../service/xmpp/XMPPExtensioProtocols';
import JitsiLocalTrack from '../RTC/JitsiLocalTrack';
import { SS_DEFAULT_FRAME_RATE } from '../RTC/ScreenObtainer';
import TraceablePeerConnection, { IAudioQuality, IVideoQuality } from '../RTC/TraceablePeerConnection';
import browser from '../browser';
import FeatureFlags from '../flags/FeatureFlags';
import SDP from '../sdp/SDP';
import { SDPDiffer } from '../sdp/SDPDiffer';
import SDPUtil from '../sdp/SDPUtil';
import Statistics from '../statistics/statistics';
import AsyncQueue, { ClearedQueueError } from '../util/AsyncQueue';
import $ from '../util/XMLParser';

import JingleSession from './JingleSession';
import { JingleSessionState } from './JingleSessionState';
import { MediaSessionEvents } from './MediaSessionEvents';
import XmppConnection from './XmppConnection';

const logger = getLogger('xmpp:JingleSessionPC');

/**
 * Constant tells how long we're going to wait for IQ response, before timeout
 * error is  triggered.
 * @type {number}
 */
const IQ_TIMEOUT: number = 10000;

/*
 * The default number of samples (per stat) to keep when webrtc stats gathering
 * is enabled in TraceablePeerConnection.
 */
const DEFAULT_MAX_STATS: number = 300;

/**
 * The time duration for which the client keeps gathering ICE candidates to be sent out in a single IQ.
 * @type {number} timeout in ms.
 */
const ICE_CAND_GATHERING_TIMEOUT: number = 150;

/**
 * Reads the endpoint ID given a string which represents either the endpoint's full JID, or the endpoint ID itself.
 * @param {String} jidOrEndpointId A string which is either the full JID of a participant, or the ID of an
 * endpoint/participant.
 * @returns The endpoint ID associated with 'jidOrEndpointId'.
 */
function getEndpointId(jidOrEndpointId: string): string {
    return Strophe.getResourceFromJid(jidOrEndpointId) || jidOrEndpointId;
}

/**
 * Add "source" element as a child of "description" element.
 * @param {Object} description The "description" element to add to.
 * @param {Object} s Contains properties of the source being added.
 * @param {Number} ssrc_ The SSRC.
 * @param {String} msid The "msid" attribute.
 */
function _addSourceElement(description: any, s: any, ssrc_: number, msid: string): void {
    description.c('source', {
        name: s.source,
        ssrc: ssrc_,
        videoType: s.videoType?.toLowerCase(),
        xmlns: XEP.SOURCE_ATTRIBUTES
    })
        .c('parameter', {
            name: 'msid',
            value: msid
        })
        .up()
        .c('ssrc-info', {
            owner: s.owner,
            xmlns: 'http://jitsi.org/jitmeet'
        })
        .up()
        .up();
}

/**
 * @typedef {Object} JingleSessionPCOptions
 * video test ?(ask George).
 * @property {boolean} disableRtx - Described in the config.js[1].
 * @property {boolean} disableSimulcast - Described in the config.js[1].
 * @property {boolean} enableInsertableStreams - Set to true when the insertable streams constraints is to be enabled
 * on the PeerConnection.
 * @property {boolean} failICE - it's an option used in the tests. Set to
 * <tt>true</tt> to block any real candidates and make the ICE fail.
 * @property {boolean} gatherStats - Described in the config.js[1].
 * @property {object} p2p - Peer to peer related options (FIXME those could be
 * fetched from config.p2p on the upper level).
 * @property {Object} testing - Testing and/or experimental options.
 * @property {boolean} webrtcIceUdpDisable - Described in the config.js[1].
 * @property {boolean} webrtcIceTcpDisable - Described in the config.js[1].
 *
 * [1]: https://github.com/jitsi/jitsi-meet/blob/master/config.js
 */

/**
 * Represents Jingle XML content elements that can be queried using jQuery-like syntax
 */
interface IJingleContents {
    [index: number]: Element;
    attr: (name: string) => Optional<string>;
    each: (callback: (index: number, element: Element) => void) => void;
    find: (selector: string) => IJingleContents;
    length: number;
}

interface IJingleSessionPCOptions {
    audioQuality?: IAudioQuality;
    channelLastN?: number;
    codecSettings?: CodecMimeType[];
    desktopSharingFrameRate?: {
        max?: number;
    };
    disableRtx?: boolean;
    disableSimulcast?: boolean;
    enableInsertableStreams?: boolean;
    failICE?: boolean;
    forceTurnRelay?: boolean;
    gatherStats?: boolean;
    p2p?: object;
    startSilent?: boolean;
    testing?: {
        enableCodecSelectionAPI?: boolean;
        failICE?: boolean;
    };
    videoQuality?: IVideoQuality;
    webrtcIceTcpDisable?: boolean;
    webrtcIceUdpDisable?: boolean;
}

/**
 * Interface for Jingle error objects returned by the error handler.
 */
interface IJingleError {
    code?: string;
    msg?: string;
    reason?: string;
    session?: string;
}

/**
 * Interface for remote source frame height constraints.
 */
interface ISourceFrameHeight {
    maxHeight: string;
    sourceName: string;
}

/**
 * Interface for Jingle session termination options.
 */
export interface ITerminateOptions {
    reason?: string;
    reasonDescription?: string;
    requestRestart?: boolean;
    sendSessionTerminate?: boolean;
}

/**
 *
 */
export default class JingleSessionPC extends JingleSession {
    private _bridgeSessionId: Nullable<string>;
    private _cachedOldLocalSdp: Optional<SDP>;
    private _cachedNewLocalSdp: Optional<SDP>;
    private _iceCheckingStartedTimestamp: Nullable<number>;
    private _gatheringStartedTimestamp: Nullable<number>;
    private _sourceReceiverConstraints: Nullable<Map<string, number>>;
    private _localSendReceiveVideoActive: boolean;
    private _remoteSendReceiveVideoActive: boolean;
    private _gatheringReported: boolean;
    private _xmppListeners: Array<() => void>;
    private _removeSenderVideoConstraintsChangeListener: Nullable<() => void>;
    private usesCodecSelectionAPI: boolean;
    private wasConnected: boolean;
    private isReconnect: boolean;
    private wasstable: boolean;
    private webrtcIceUdpDisable: boolean;
    private webrtcIceTcpDisable: boolean;
    private remoteSourceMaxFrameHeights: ISourceFrameHeight[];

    /**
     * @internal
     */
    isP2P: boolean;

    lasticecandidate: boolean;
    numRemoteVideoSources: number;
    numRemoteAudioSources: number;
    modificationQueue: AsyncQueue;
    establishmentDuration: Nullable<number>;
    options: IJingleSessionPCOptions;
    peerconnection: TraceablePeerConnection;
    failICE: boolean;

    /**
     * Parses 'senders' attribute of the video content.
     * @param {Object} jingleContents
     * @return {Nullable<string>} one of the values of content "senders" attribute
     * defined by Jingle. If there is no "senders" attribute or if the value is
     * invalid then <tt>null</tt> will be returned.
     * @private
     */
    static parseVideoSenders(jingleContents: IJingleContents): Nullable<string> {
        const videoContents = jingleContents.find('>content[name="video"]');

        if (videoContents.length) {
            const senders = videoContents[0].getAttribute('senders');

            if (senders === 'both'
                || senders === 'initiator'
                || senders === 'responder'
                || senders === 'none') {
                return senders;
            }
        }

        return null;
    }

    /**
     * Parses the source-name and max frame height value of the 'content-modify' IQ when source-name signaling
     * is enabled.
     *
     * @param {Object} jingleContents - An element pointing to the '>jingle' element.
     * @returns {Nullable<Object>}
     */
    static parseSourceMaxFrameHeight(jingleContents: IJingleContents): Nullable<ISourceFrameHeight[]> {
        const receiverConstraints: ISourceFrameHeight[] = [];
        const sourceFrameHeightSel = jingleContents.find('>content[name="video"]>source-frame-height');
        let maxHeight: string, sourceName: string;

        if (sourceFrameHeightSel.length) {
            sourceFrameHeightSel.each((_: number, source: Element) => {
                sourceName = source.getAttribute('sourceName');
                maxHeight = source.getAttribute('maxHeight');
                receiverConstraints.push({
                    maxHeight,
                    sourceName
                });
            });

            return receiverConstraints;
        }

        return null;
    }

    /* eslint-disable max-params */

    /**
     * Creates new <tt>JingleSessionPC</tt>
     * @param {string} sid the Jingle Session ID - random string which identifies the session
     * @param {string} localJid our JID
     * @param {string} remoteJid remote peer JID
     * @param {XmppConnection} connection - The XMPP connection instance.
     * @param mediaConstraints the media constraints object passed to createOffer/Answer, as defined
     * by the WebRTC standard
     * @param pcConfig The {@code RTCConfiguration} to use for the WebRTC peer connection.
     * @param {boolean} isP2P indicates whether this instance is meant to be used in a direct, peer to
     * peer connection or <tt>false</tt> if it's a JVB connection.
     * @param {boolean} isInitiator indicates if it will be the side which initiates the session.
     * @constructor
     *
     * @implements {SignalingLayer}
     */
    constructor(
            sid: string,
            localJid: string,
            remoteJid: string,
            connection: XmppConnection,
            mediaConstraints: MediaStreamConstraints,
            pcConfig: RTCConfiguration,
            isP2P: boolean,
            isInitiator: boolean) {
        super(
            sid,
            localJid,
            remoteJid, connection, mediaConstraints, pcConfig, isInitiator);

        /**
         * The bridge session's identifier. One Jingle session can during
         * it's lifetime participate in multiple bridge sessions managed by
         * Jicofo. A new bridge session is started whenever Jicofo sends
         * 'session-initiate'.
         *
         * @type {?string}
         * @private
         */
        this._bridgeSessionId = null;

        /**
         * The oldest SDP passed to {@link notifyMySSRCUpdate} while the XMPP connection was offline that will be
         * used to update Jicofo once the XMPP connection goes back online.
         * @type {Optional<SDP>}
         * @private
         */
        this._cachedOldLocalSdp = undefined;

        /**
         * The latest SDP passed to {@link notifyMySSRCUpdate} while the XMPP connection was offline that will be
         * used to update Jicofo once the XMPP connection goes back online.
         * @type {Optional<SDP>}
         * @private
         */
        this._cachedNewLocalSdp = undefined;

        /**
         * Stores result of {@link window.performance.now()} at the time when
         * ICE enters 'checking' state.
         * @type {Nullable<number>}
         * @private
         */
        this._iceCheckingStartedTimestamp = null;

        /**
         * Stores result of {@link window.performance.now()} at the time when
         * first ICE candidate is spawned by the peerconnection to mark when
         * ICE gathering started. That's, because ICE gathering state changed
         * events are not supported by most of the browsers, so we try something
         * that will work everywhere. It may not be as accurate, but given that
         * 'host' candidate usually comes first, the delay should be minimal.
         * @type {Nullable<number>} null if no value has been stored yet
         * @private
         */
        this._gatheringStartedTimestamp = null;

        /**
         * Receiver constraints (max height) set by the application per remote source. Will be used for p2p connection.
         *
         * @type {Map<string, number>}
         */
        this._sourceReceiverConstraints = undefined;

        /**
         * Indicates whether or not this session is willing to send/receive
         * video media. When set to <tt>false</tt> the underlying peer
         * connection will disable local video transfer and the remote peer will
         * be will be asked to stop sending video via 'content-modify' IQ
         * (the senders attribute of video contents will be adjusted
         * accordingly). Note that this notification is sent only in P2P
         * session, because Jicofo does not support it yet. Obviously when
         * the value is changed from <tt>false</tt> to <tt>true</tt> another
         * notification will be sent to resume video transfer on the remote
         * side.
         * @type {boolean}
         * @private
         */
        this._localSendReceiveVideoActive = true;

        /**
         * Indicates whether or not the remote peer has video transfer active.
         * When set to <tt>true</tt> it means that remote peer is neither
         * sending nor willing to receive video. In such case we'll ask
         * our peerconnection to stop sending video by calling
         * {@link TraceablePeerConnection.setVideoTransferActive} with
         * <tt>false</tt>.
         * @type {boolean}
         * @private
         */
        this._remoteSendReceiveVideoActive = true;

        /**
         * Marks that ICE gathering duration has been reported already. That
         * prevents reporting it again.
         * @type {boolean}
         * @private
         */
        this._gatheringReported = false;

        this.lasticecandidate = false;

        /**
         * Indicates whether or not this <tt>JingleSessionPC</tt> is used in
         * a peer to peer type of session.
         * @type {boolean} <tt>true</tt> if it's a peer to peer
         * session or <tt>false</tt> if it's a JVB session
         */
        this.isP2P = isP2P;

        /**
         * Number of remote video sources, in SSRC rewriting mode.
         * Used to generate next unique msid attribute.
         *
         * @type {Number}
         */
        this.numRemoteVideoSources = 0;

        /**
         * Number of remote audio sources, in SSRC rewriting mode.
         * Used to generate next unique msid attribute.
         *
         * @type {Number}
         */
        this.numRemoteAudioSources = 0;

        /**
         * Remote preference for the receive video max frame heights when source-name signaling is enabled.
         *
         * @type {Optional<Map<string, number>>}
         * @private
         */
        this.remoteSourceMaxFrameHeights = undefined;

        /**
         * The queue used to serialize operations done on the peerconnection after the session is established.
         * The queue is paused until the first offer/answer cycle is complete. Only track or codec related
         * operations which necessitate a renegotiation cycle need to be pushed to the modification queue.
         * These tasks will be executed after the session has been established.
         *
         * @type {AsyncQueue}
         */
        this.modificationQueue = new AsyncQueue();
        this.modificationQueue.pause();

        /**
         * Flag used to guarantee that the connection established event is
         * triggered just once.
         * @type {boolean}
         */
        this.wasConnected = false;

        /**
         * Keeps track of how long (in ms) it took from ICE start to ICE
         * connect.
         *
         * @type {number}
         */
        this.establishmentDuration = undefined;

        this._xmppListeners = [];
        this._xmppListeners.push(
            connection.addCancellableListener(
                XmppConnection.Events.CONN_STATUS_CHANGED,
                this.onXmppStatusChanged.bind(this))
        );

        this._removeSenderVideoConstraintsChangeListener = undefined;
    }

    /**
     * Handles either Jingle 'source-add' or 'source-remove' message for this Jingle session.
     *
     * @param {boolean} isAdd <tt>true</tt> for 'source-add' or <tt>false</tt> otherwise.
     * @param {Array<Element>} elem an array of Jingle "content" elements.
     * @returns {Promise} resolved when the operation is done or rejected with an error.
     */
    private _addOrRemoveRemoteStream(isAdd: boolean, elem: Element[]): void {
        const logPrefix = isAdd ? 'addRemoteStream' : 'removeRemoteStream';
        const workFunction = (finishedCallback: (error) => void) => {
            if (!this.peerconnection.remoteDescription?.sdp) {
                const errMsg = `${logPrefix} - received before remoteDescription is set, ignoring!!`;

                logger.error(errMsg);
                finishedCallback(errMsg);

                return;
            }

            logger.debug(`${this} Processing ${logPrefix}`);

            const currentRemoteSdp = new SDP(this.peerconnection.remoteDescription.sdp, this.isP2P);
            const sourceDescription = this._processSourceMapFromJingle(elem, isAdd);

            if (!sourceDescription.size) {
                logger.debug(`${this} ${logPrefix} - no sources to ${isAdd ? 'add' : 'remove'}`);
                finishedCallback(undefined);
            }

            logger.debug(`${isAdd ? 'adding' : 'removing'} sources=${Array.from(sourceDescription.keys())}`);

            // Update the remote description.
            const modifiedMids = currentRemoteSdp.updateRemoteSources(sourceDescription, isAdd);

            for (const mid of modifiedMids) {
                if (this.isP2P) {
                    const { media } = SDPUtil.parseMLine(currentRemoteSdp.media[mid].split('\r\n')[0]);
                    const desiredDirection = this.peerconnection.getDesiredMediaDirection(media as MediaType, isAdd);
                    const currentDirections = isAdd ? [ MediaDirection.RECVONLY, MediaDirection.INACTIVE ]
                        : [ MediaDirection.SENDRECV, MediaDirection.SENDONLY ];

                    currentDirections.forEach(direction => {
                        currentRemoteSdp.media[mid] = currentRemoteSdp.media[mid]
                            .replace(`a=${direction}`, `a=${desiredDirection}`);
                    });
                    currentRemoteSdp.raw = currentRemoteSdp.session + currentRemoteSdp.media.join('');
                }
            }

            this._renegotiate(currentRemoteSdp.raw).then(() => {
                logger.debug(`${this} ${logPrefix} - OK`);
                finishedCallback(undefined);
            }, error => {
                logger.error(`${this} ${logPrefix} failed:`, error);
                finishedCallback(error);
            });
        };

        logger.debug(`${this} Queued ${logPrefix} task`);

        // Queue and execute
        this.modificationQueue.push(workFunction);
    }

    /**
     * See {@link addTrackToPc} and {@link removeTrackFromPc}.
     *
     * @param {boolean} isRemove <tt>true</tt> for "remove" operation or <tt>false</tt> for "add" operation.
     * @param {JitsiLocalTrack} track the track that will be added/removed.
     * @returns {Promise} resolved when the operation is done or rejected with an error.
     */
    private _addRemoveTrack(isRemove: boolean, track: JitsiLocalTrack): Promise<void> {
        if (!track) {
            return Promise.reject('invalid "track" argument value');
        }
        const operationName = isRemove ? 'removeTrack' : 'addTrack';
        const workFunction = finishedCallback => {
            const tpc = this.peerconnection;

            if (!tpc) {
                finishedCallback(`Error:  tried ${operationName} track with no active peer connection`);

                return;
            }
            const operationPromise
                = isRemove
                    ? tpc.removeTrackFromPc(track)
                    : tpc.addTrackToPc(track);

            operationPromise
                .then(shouldRenegotiate => {
                    if (shouldRenegotiate) {
                        this._renegotiate().then(finishedCallback);
                    } else {
                        finishedCallback();
                    }
                },
                finishedCallback /* will be called with an error */);
        };

        logger.debug(`${this} Queued ${operationName} task`);

        return new Promise((resolve, reject) => {
            this.modificationQueue.push(
                workFunction,
                error => {
                    if (error) {
                        if (error instanceof ClearedQueueError) {
                            // The session might have been terminated before the task was executed, making it obsolete.
                            logger.debug(`${this} ${operationName} aborted: session terminated`);
                            resolve();

                            return;
                        }
                        logger.error(`${this} ${operationName} failed`);
                        reject(error);
                    } else {
                        logger.debug(`${this} ${operationName} done`);
                        resolve();
                    }
                });
        });
    }

    /**
     * Checks whether or not this session instance is still operational.
     *
     * @returns {boolean} {@code true} if operation or {@code false} otherwise.
     */
    private _assertNotEnded(): boolean {
        return this.state !== JingleSessionState.ENDED;
    }

    /**
     * Takes in a jingle offer iq, returns the new sdp offer that can be set as remote description in the
     * peerconnection.
     *
     * @param {Object} offerIq the incoming offer.
     * @returns {SDP object} the jingle offer translated to SDP.
     */
    private _processNewJingleOfferIq(offerIq: object): SDP {
        const remoteSdp = new SDP('', this.isP2P);

        if (this.webrtcIceTcpDisable) {
            remoteSdp.removeTcpCandidates = true;
        }
        if (this.webrtcIceUdpDisable) {
            remoteSdp.removeUdpCandidates = true;
        }
        if (this.failICE) {
            remoteSdp.failICE = true;
        }

        remoteSdp.fromJingle(offerIq);
        this._processSourceMapFromJingle($(offerIq).find('>content'));

        return remoteSdp;
    }

    /**
     * Parses the SSRC information from the source-add/source-remove element passed and updates the SSRC owners.
     *
     * @param {Object} sourceElement the source-add/source-remove element from jingle.
     * @param {boolean} isAdd true if the sources are being added, false if they are to be removed.
     * @returns {Map<string, Object>} - The map of source name to ssrcs, msid and groups.
     */
    private _processSourceMapFromJingle(sourceElement: object, isAdd: boolean = true): Map<string, object> {
        /**
         * Map of source name to ssrcs, mediaType, msid and groups.
         * @type {Map<string,
         *  {
         *      mediaType: string,
         *      msid: string,
         *      ssrcList: Array<number>,
         *      groups: ISsrcGroupInfo
         *  }>}
         */
        const sourceDescription = new Map();
        const sourceElementArray = Array.isArray(sourceElement) ? sourceElement : [ sourceElement ];

        for (const content of sourceElementArray) {
            const descriptionsWithSources = $(content).find('>description')
                .filter((_: number, el: Element) => $(el).find('>source').length);

            for (const description of descriptionsWithSources) {
                const mediaType = $(description).attr('media');

                if (mediaType === MediaType.AUDIO && this.options.startSilent) {

                    // eslint-disable-next-line no-continue
                    continue;
                }

                const sources = $(description).find('>source');
                const removeSsrcs = [];

                for (const source of sources) {
                    const ssrc = $(source).attr('ssrc');
                    const sourceName = $(source).attr('name');
                    const msid = $(source)
                        .find('>parameter[name="msid"]')
                        .attr('value');
                    let videoType = $(source).attr('videoType');

                    // If the videoType is DESKTOP_HIGH_FPS for remote tracks, we should treat it as DESKTOP.
                    if (videoType === VideoType.DESKTOP_HIGH_FPS) {
                        videoType = VideoType.DESKTOP;
                    }

                    if (sourceDescription.has(sourceName)) {
                        sourceDescription.get(sourceName).ssrcList?.push(ssrc);
                    } else {
                        sourceDescription.set(sourceName, {
                            groups: [],
                            mediaType,
                            msid,
                            ssrcList: [ ssrc ],
                            videoType
                        });
                    }

                    // Update the source owner and source name.
                    const owner = $(source)
                        .find('>ssrc-info[xmlns="http://jitsi.org/jitmeet"]')
                        .attr('owner');

                    if (owner && isAdd) {
                        // JVB source-add.
                        this._signalingLayer.setSSRCOwner(Number(ssrc), getEndpointId(owner), sourceName);
                    } else if (isAdd) {
                        // P2P source-add.
                        this._signalingLayer.setSSRCOwner(Number(ssrc),
                            Strophe.getResourceFromJid(this.remoteJid), sourceName);
                    } else {
                        removeSsrcs.push(Number(ssrc));
                    }
                }

                // 'source-remove' from remote peer.
                removeSsrcs.length && this._signalingLayer.removeSSRCOwners(removeSsrcs);
                const groups = $(description).find('>ssrc-group');

                if (!groups.length) {
                    continue; // eslint-disable-line no-continue
                }

                for (const group of groups) {
                    const semantics = $(group).attr('semantics');
                    const groupSsrcs = [];

                    for (const source of $(group).find('>source')) {
                        groupSsrcs.push($(source).attr('ssrc'));
                    }

                    for (const [ sourceName, { ssrcList } ] of sourceDescription) {
                        if (isEqual(ssrcList.slice().sort(), groupSsrcs.slice().sort())) {
                            sourceDescription.get(sourceName).groups.push({
                                semantics,
                                ssrcs: groupSsrcs
                            });
                        }
                    }
                }
            }
        }

        sourceDescription.size && this.peerconnection.updateRemoteSources(sourceDescription, isAdd);

        return sourceDescription;
    }

    /**
     * Does a new offer/answer flow using the existing remote description (if not provided) and signals any new sources
     * to Jicofo or the remote peer.
     *
     * @param {string} [optionalRemoteSdp] optional, raw remote sdp to use.  If not provided, the remote sdp from the
     * peerconnection will be used.
     * @returns {Promise} promise which resolves when the o/a flow is complete with no arguments or rejects with an
     * error {string}
     */
    private async _renegotiate(optionalRemoteSdp?: string): Promise<void> {
        if (this.peerconnection.signalingState === 'closed') {
            throw new Error('Attempted to renegotiate in state closed');
        }

        const remoteSdp = optionalRemoteSdp || this.peerconnection.remoteDescription.sdp;

        if (!remoteSdp) {
            throw new Error(`Cannot renegotiate without remote description, state=${this.state}`);
        }

        const remoteDescription = {
            sdp: remoteSdp,
            type: 'offer'
        } as RTCSessionDescription;

        const oldLocalSDP = this.peerconnection.localDescription.sdp;

        logger.debug(`${this} Renegotiate: setting remote description`);

        try {
            await this.peerconnection.setRemoteDescription(remoteDescription);
            logger.debug(`${this} Renegotiate: creating answer`);
            const answer = await this.peerconnection.createAnswer(this.mediaConstraints as RTCOfferOptions);

            logger.debug(`${this} Renegotiate: setting local description`);
            await this.peerconnection.setLocalDescription(answer);
            if (oldLocalSDP) {
                // Send the source updates after every renegotiation cycle.
                this.notifyMySSRCUpdate(new SDP(oldLocalSDP), new SDP(this.peerconnection.localDescription.sdp));
            }
        } catch (error) {
            logger.error(`${this} Renegotiate failed:`, error);
            throw error;
        }
    }

    /**
     * Sends 'content-modify' IQ in order to ask the remote peer to either stop or resume sending video media or to
     * adjust sender's video constraints.
     *
     * @returns {void}
     */
    private _sendContentModify() {
        const senders = this._localSendReceiveVideoActive ? 'both' : 'none';
        const sessionModify
            = $iq({
                to: this.remoteJid,
                type: 'set'
            })
                .c('jingle', {
                    action: 'content-modify',
                    initiator: this.initiatorJid,
                    sid: this.sid,
                    xmlns: 'urn:xmpp:jingle:1'
                })
                .c('content', {
                    name: MediaType.VIDEO,
                    senders
                });

        if (typeof this._sourceReceiverConstraints !== 'undefined') {
            this._sourceReceiverConstraints.forEach((maxHeight, sourceName) => {
                sessionModify
                    .c('source-frame-height', { xmlns: 'http://jitsi.org/jitmeet/video' })
                    .attrs({
                        maxHeight,
                        sourceName
                    });

                sessionModify.up();
                logger.info(`${this} sending content-modify for source-name: ${sourceName}, maxHeight: ${maxHeight}`);
            });
        }

        logger.debug(sessionModify.tree());

        this.connection.sendIQ(
            sessionModify,
            null,
            this.newJingleErrorHandler(),
            IQ_TIMEOUT);
    }

    /**
     * Sends given candidate in Jingle 'transport-info' message.
     *
     * @param {RTCIceCandidate} candidate the WebRTC ICE candidate instance
     * @returns {void}
     */
    private _sendIceCandidate(candidate: RTCIceCandidate): void {
        const localSDP = new SDP(this.peerconnection.localDescription.sdp);

        if (candidate?.candidate.length && !this.lasticecandidate) {
            const ice = SDPUtil.iceparams(localSDP.media[candidate.sdpMLineIndex], localSDP.session);
            const jcand = SDPUtil.candidateToJingle(candidate.candidate);

            if (!(ice && jcand)) {
                logger.error('failed to get ice && jcand');

                return;
            }
            ice.xmlns = XEP.ICE_UDP_TRANSPORT;

            if (this.usedrip) {
                if (this.dripContainer.length === 0) {
                    setTimeout(() => {
                        if (this.dripContainer.length === 0) {
                            return;
                        }
                        this._sendIceCandidates(this.dripContainer);
                        this.dripContainer = [];
                    }, ICE_CAND_GATHERING_TIMEOUT);
                }
                this.dripContainer.push(candidate);
            } else {
                this._sendIceCandidates([ candidate ]);
            }
        } else {
            logger.debug(`${this} _sendIceCandidate: last candidate`);

            // FIXME: remember to re-think in ICE-restart
            this.lasticecandidate = true;
        }
    }

    /**
     * Sends given candidates in Jingle 'transport-info' message.
     *
     * @param {Array<RTCIceCandidate>} candidates an array of the WebRTC ICE candidate instances.
     * @returns {void}
     */
    private _sendIceCandidates(candidates: RTCIceCandidate[]): void {
        if (!this._assertNotEnded()) {

            return;
        }

        logger.debug(`${this} _sendIceCandidates count: ${candidates?.length}`);
        const cand = $iq({ to: this.remoteJid,
            type: 'set' })
            .c('jingle', { action: 'transport-info',
                initiator: this.initiatorJid,
                sid: this.sid,
                xmlns: 'urn:xmpp:jingle:1' });

        const localSDP = new SDP(this.peerconnection.localDescription.sdp);

        for (let mid = 0; mid < localSDP.media.length; mid++) {
            const cands = candidates.filter(el => el.sdpMLineIndex === mid);
            const mline
                = SDPUtil.parseMLine(localSDP.media[mid].split('\r\n')[0]);

            if (cands.length > 0) {
                const ice
                    = SDPUtil.iceparams(localSDP.media[mid], localSDP.session);

                ice.xmlns = XEP.ICE_UDP_TRANSPORT;
                cand.c('content', {
                    creator: this.initiatorJid === this.localJid
                        ? 'initiator' : 'responder',
                    name: cands[0].sdpMid ? cands[0].sdpMid : mline.media
                }).c('transport', ice);
                for (let i = 0; i < cands.length; i++) {
                    const candidate
                        = SDPUtil.candidateToJingle(cands[i].candidate);

                    // Mangle ICE candidate if 'failICE' test option is enabled

                    if (this.failICE) {
                        candidate.ip = '1.1.1.1';
                    }
                    cand.c('candidate', candidate).up();
                }

                // add fingerprint
                const fingerprintLine
                    = SDPUtil.findLine(
                        localSDP.media[mid],
                        'a=fingerprint:', localSDP.session);

                if (fingerprintLine) {
                    const tmp = SDPUtil.parseFingerprint(fingerprintLine);

                    tmp.required = true;
                    cand.c(
                        'fingerprint',
                        { xmlns: 'urn:xmpp:jingle:apps:dtls:0' })
                        .t(tmp.fingerprint);
                    delete tmp.fingerprint;
                    cand.attrs(tmp);
                    cand.up();
                }
                cand.up(); // transport
                cand.up(); // content
            }
        }

        // might merge last-candidate notification into this, but it is called
        // a lot later. See webrtc issue #2340
        // logger.debug('was this the last candidate', this.lasticecandidate);
        this.connection.sendIQ(
            cand, null, this.newJingleErrorHandler(), IQ_TIMEOUT);
    }

    /**
     * Sends Jingle 'session-accept' message.
     *
     * @param {function()} success callback called when we receive 'RESULT' packet for the 'session-accept'.
     * @param {function(error)} failure called when we receive an error response or when the request has timed out.
     * @returns {void}
     */
    private _sendSessionAccept(success: () => void, failure: (error: IJingleError) => void) {
        // NOTE: since we're just reading from it, we don't need to be within
        //  the modification queue to access the local description
        const localSDP = new SDP(this.peerconnection.localDescription.sdp, this.isP2P);
        const accept = $iq({ to: this.remoteJid,
            type: 'set' })
            .c('jingle', {
                action: 'session-accept',
                initiator: this.initiatorJid,
                responder: this.responderJid,
                sid: this.sid,
                xmlns: 'urn:xmpp:jingle:1'
            });

        if (this.webrtcIceTcpDisable) {
            localSDP.removeTcpCandidates = true;
        }
        if (this.webrtcIceUdpDisable) {
            localSDP.removeUdpCandidates = true;
        }
        if (this.failICE) {
            localSDP.failICE = true;
        }
        if (typeof this.options.channelLastN === 'number' && this.options.channelLastN >= 0) {
            // @ts-ignore will be fixed after merge of sdp
            localSDP.initialLastN = this.options.channelLastN;
        }
        localSDP.toJingle(
            accept,
            this.initiatorJid === this.localJid ? 'initiator' : 'responder');

        logger.info(`${this} Sending session-accept`);
        logger.debug(accept.tree());
        this.connection.sendIQ(accept,
            success,
            this.newJingleErrorHandler(error => {
                failure(error);

                // 'session-accept' is a critical timeout and we'll
                // have to restart
                this.room.eventEmitter.emit(
                    XMPPEvents.SESSION_ACCEPT_TIMEOUT, this);
            }),
            IQ_TIMEOUT);

        // XXX Videobridge needs WebRTC's answer (ICE ufrag and pwd, DTLS
        // fingerprint and setup) ASAP in order to start the connection
        // establishment.
        //
        // FIXME Flushing the connection at this point triggers an issue with
        // BOSH request handling in Prosody on slow connections.
        //
        // The problem is that this request will be quite large and it may take
        // time before it reaches Prosody. In the meantime Strophe may decide
        // to send the next one. And it was observed that a small request with
        // 'transport-info' usually follows this one. It does reach Prosody
        // before the previous one was completely received. 'rid' on the server
        // is increased and Prosody ignores the request with 'session-accept'.
        // It will never reach Jicofo and everything in the request table is
        // lost. Removing the flush does not guarantee it will never happen, but
        // makes it much less likely('transport-info' is bundled with
        // 'session-accept' and any immediate requests).
        //
        // this.connection.flush();
    }

    /**
     * Sends 'session-initiate' to the remote peer.
     *
     * NOTE this method is synchronous and we're not waiting for the RESULT
     * response which would delay the startup process.
     *
     * @param {string} offerSdp  - The local session description which will be used to generate an offer.
     * @returns {void}
     */
    private _sendSessionInitiate(offerSdp: string): void {
        let init = $iq({
            to: this.remoteJid,
            type: 'set'
        }).c('jingle', {
            action: 'session-initiate',
            initiator: this.initiatorJid,
            sid: this.sid,
            xmlns: 'urn:xmpp:jingle:1'
        });

        new SDP(offerSdp, this.isP2P).toJingle(
            init,
            this.isInitiator ? 'initiator' : 'responder');
        init = init.tree();
        logger.debug(`${this} Session-initiate: `, init);
        this.connection.sendIQ(init,
            () => {
                logger.info(`${this} Got RESULT for "session-initiate"`);
            },
            error => {
                logger.error(`${this} "session-initiate" error`, error);
            },
            IQ_TIMEOUT);
    }


    /**
     * Method returns function(errorResponse) which is a callback to be passed to Strophe connection.sendIQ method. An
     * 'error' structure is created that is passed as 1st argument to given <tt>failureCb</tt>. The format of this
     * structure is as follows:
     * {
     *  code: {XMPP error response code}
     *  reason: {the name of XMPP error reason element or 'timeout' if the
      *          request has timed out within <tt>IQ_TIMEOUT</tt> milliseconds}
     *  source: {request.tree() that provides original request}
     *  session: {this JingleSessionPC.toString()}
     * }
     * @param failureCb function(error) called when error response was returned or when a timeout has occurred.
     * @returns {function(this:JingleSessionPC)}
     */
    private newJingleErrorHandler(failureCb?: (error: IJingleError) => void): (errResponse: string | Element | Error) => void {
        return errResponse => {

            const error: IJingleError = {
                code: undefined,
                msg: undefined,
                reason: undefined,
                session: undefined
            };

            // Get XMPP error code and condition(reason)
            const errorElSel = $(errResponse).find('error');

            if (errorElSel.length) {
                error.code = errorElSel.attr('code');
                const errorReasonSel = $(errResponse).find('error :first');

                if (errorReasonSel.length) {
                    error.reason = errorReasonSel[0].tagName;
                }

                const errorMsgSel = errorElSel.find('>text');

                if (errorMsgSel.length) {
                    error.msg = errorMsgSel.text();
                }
            }

            if (!errResponse) {
                error.reason = 'timeout';
            }

            error.session = this.toString();

            if (failureCb) {
                failureCb(error);
            } else if (this.state === JingleSessionState.ENDED
                        && error.reason === 'item-not-found') {
                // When remote peer decides to terminate the session, but it
                // still have few messages on the queue for processing,
                // it will first send us 'session-terminate' (we enter ENDED)
                // and then follow with 'item-not-found' for the queued requests
                // We don't want to have that logged on error level.
                logger.debug(`${this} Jingle error: ${JSON.stringify(error)}`);
            } else {
                logger.error(`Jingle error: ${JSON.stringify(error)}`);
            }
        };
    }

    /**
     * Figures out added/removed ssrcs and sends updated IQs to the remote peer or Jicofo.
     *
     * @param oldSDP SDP object for old description.
     * @param newSDP SDP object for new description.
     * @returns {void}
     */
    private notifyMySSRCUpdate(oldSDP: SDP, newSDP: SDP): void {
        if (this.state !== JingleSessionState.ACTIVE) {
            logger.warn(`${this} Skipping SSRC update in '${this.state} ' state.`);

            return;
        }

        if (!this.connection.connected) {
            // The goal is to compare the oldest SDP with the latest one upon reconnect
            if (!this._cachedOldLocalSdp) {
                this._cachedOldLocalSdp = oldSDP;
            }
            this._cachedNewLocalSdp = newSDP;
            logger.warn(`${this} Not sending SSRC update while the signaling is disconnected`);

            return;
        }

        this._cachedOldLocalSdp = undefined;
        this._cachedNewLocalSdp = undefined;

        const getSignaledSourceInfo = sdpDiffer => {
            const newMedia = sdpDiffer.getNewMedia();
            let ssrcs = [];
            let mediaType = null;

            // It is assumed that sources are signaled one at a time.
            Object.keys(newMedia).forEach(mediaIndex => {
                const signaledSsrcs = Object.keys(newMedia[mediaIndex].ssrcs);

                mediaType = newMedia[mediaIndex].mediaType;
                if (signaledSsrcs?.length) {
                    ssrcs = ssrcs.concat(signaledSsrcs);
                }
            });

            return {
                mediaType,
                ssrcs
            };
        };

        // send source-remove IQ.
        let sdpDiffer = new SDPDiffer(newSDP, oldSDP, this.isP2P);
        const remove = $iq({ to: this.remoteJid,
            type: 'set' })
            .c('jingle', {
                action: 'source-remove',
                initiator: this.initiatorJid,
                sid: this.sid,
                xmlns: 'urn:xmpp:jingle:1'
            }
            );

        sdpDiffer.toJingle(remove);

        // context a common object for one run of ssrc update (source-add and source-remove) so we can match them if we
        // need to
        const ctx = {};
        const removedSsrcInfo = getSignaledSourceInfo(sdpDiffer);

        if (removedSsrcInfo.ssrcs.length) {
            // Log only the SSRCs instead of the full IQ.
            logger.info(`${this} Sending source-remove for ${removedSsrcInfo.mediaType}`
                + ` ssrcs=${removedSsrcInfo.ssrcs}`);
            this.connection.sendIQ(
                remove,
                () => {
                    this.room.eventEmitter.emit(XMPPEvents.SOURCE_REMOVE, this, ctx);
                },
                this.newJingleErrorHandler(error => {
                    this.room.eventEmitter.emit(XMPPEvents.SOURCE_REMOVE_ERROR, this, error, ctx);
                }),
                IQ_TIMEOUT);
        }

        // send source-add IQ.
        sdpDiffer = new SDPDiffer(oldSDP, newSDP, this.isP2P);
        const add = $iq({ to: this.remoteJid,
            type: 'set' })
            .c('jingle', {
                action: 'source-add',
                initiator: this.initiatorJid,
                sid: this.sid,
                xmlns: 'urn:xmpp:jingle:1'
            }
            );

        sdpDiffer.toJingle(add);
        const addedSsrcInfo = getSignaledSourceInfo(sdpDiffer);

        if (addedSsrcInfo.ssrcs.length) {
            // Log only the SSRCs instead of the full IQ.
            logger.info(`${this} Sending source-add for ${addedSsrcInfo.mediaType} ssrcs=${addedSsrcInfo.ssrcs}`);
            this.connection.sendIQ(
                add,
                () => {
                    this.room.eventEmitter.emit(XMPPEvents.SOURCE_ADD, this, ctx);
                },
                this.newJingleErrorHandler(error => {
                    this.room.eventEmitter.emit(XMPPEvents.SOURCE_ADD_ERROR, this, error, addedSsrcInfo.mediaType, ctx);
                }),
                IQ_TIMEOUT);
        }
    }


    /**
     * Handles XMPP connection state changes. Resends any session updates that were cached while the XMPP connection
     * was down.
     *
     * @param {Strophe.Status} status - The new status.
     * @returns {void}
     */
    private onXmppStatusChanged(status: Strophe.Status): void {
        if (status === XmppConnection.Status.CONNECTED && this._cachedOldLocalSdp) {
            logger.info(`${this} Sending SSRC update on reconnect`);
            this.notifyMySSRCUpdate(
                this._cachedOldLocalSdp,
                this._cachedNewLocalSdp);
        }
    }


    /**
     * This is a setRemoteDescription/setLocalDescription cycle which starts at converting Strophe Jingle IQ into
     * remote offer SDP. Once converted, setRemoteDescription, createAnswer and setLocalDescription calls follow.
     *
     * @param jingleOfferAnswerIq element pointing to the jingle element of the offer (or answer) IQ
     * @param success callback called when sRD/sLD cycle finishes successfully.
     * @param failure callback called with an error object as an argument if we fail at any point during setRD,
     * createAnswer, setLD.
     * @param {Array<JitsiLocalTrack>} [localTracks] the optional list of the local tracks that will be added, before
     * the offer/answer cycle executes (for the local track addition to be an atomic operation together with the
     * offer/answer).
     * @returns {void}
     */
    private setOfferAnswerCycle(jingleOfferAnswerIq: object, success: () => void, failure: (error: Error) => void, localTracks: JitsiLocalTrack[] = []): void {
        logger.debug(`${this} Executing setOfferAnswerCycle task`);

        const addTracks = [];
        const audioTracks = localTracks.filter(track => track.getType() === MediaType.AUDIO);
        const videoTracks = localTracks.filter(track => track.getType() === MediaType.VIDEO);
        let tracks = localTracks;

        // Add only 1 video track at a time. Adding 2 or more video tracks to the peerconnection at the same time
        // makes the browser go into a renegotiation loop by firing 'negotiationneeded' event after every
        // renegotiation.
        if (videoTracks.length > 1) {
            tracks = [ ...audioTracks, videoTracks[0] ];
        }
        for (const track of tracks) {
            addTracks.push(this.peerconnection.addTrack(track, this.isInitiator));
        }
        const newRemoteSdp = this._processNewJingleOfferIq(jingleOfferAnswerIq);
        const bridgeSession = $(jingleOfferAnswerIq).find('>bridge-session[xmlns="http://jitsi.org/protocol/focus"]');
        const bridgeSessionId = bridgeSession.attr('id');

        if (bridgeSessionId !== this._bridgeSessionId) {
            this._bridgeSessionId = bridgeSessionId;
        }

        Promise.all(addTracks)
            .then(() => this._renegotiate(newRemoteSdp.raw))
            .then(() => {
                this.peerconnection.processLocalSdpForTransceiverInfo(tracks);
                if (this.state === JingleSessionState.PENDING) {
                    this.state = JingleSessionState.ACTIVE;

                    // #1 Sync up video transfer active/inactive only after the initial O/A cycle. We want to
                    // adjust the video media direction only in the local SDP and the Jingle contents direction
                    // included in the initial offer/answer is mapped to the remote SDP. Jingle 'content-modify'
                    // IQ is processed in a way that it will only modify local SDP when remote peer is no longer
                    // interested in receiving video content. Changing media direction in the remote SDP will mess
                    // up our SDP translation chain (simulcast, video mute, RTX etc.)
                    // #2 Sends the max frame height if it was set, before the session-initiate/accept
                    if (this.isP2P && (!this._localSendReceiveVideoActive || this._sourceReceiverConstraints)) {
                        this._sendContentModify();
                    }
                }

            })
            .then(() => {
                logger.debug(`${this} setOfferAnswerCycle task done`);
                success();
            })
            .catch(error => {
                logger.error(`${this} setOfferAnswerCycle task failed: ${error}`);
                failure(error);
            });
    }

    /**
     * Accepts incoming Jingle 'session-initiate' and should send 'session-accept' in result.
     *
     * @param jingleOffer element pointing to the jingle element of the offer IQ
     * @param success callback called when we accept incoming session successfully and receive RESULT packet to
     * 'session-accept' sent.
     * @param failure function(error) called if for any reason we fail to accept the incoming offer. 'error' argument
     * can be used to log some details about the error.
     * @param {Array<JitsiLocalTrack>} [localTracks] the optional list of the local tracks that will be added, before
     * the offer/answer cycle executes. We allow the localTracks to optionally be passed in so that the addition of the
     * local tracks and the processing of the initial offer can all be done atomically. We want to make sure that any
     * other operations which originate in the XMPP Jingle messages related with this session to be executed with an
     * assumption that the initial offer/answer cycle has been executed already.
     */
    public override acceptOffer(
            jingleOffer: object,
            success: () => void,
            failure: (error: any) => void,
            localTracks: JitsiLocalTrack[] = []): void {
        this.setOfferAnswerCycle(
            jingleOffer,
            () => {
                // FIXME we may not care about RESULT packet for session-accept
                // then we should either call 'success' here immediately or
                // modify sendSessionAccept method to do that
                this._sendSessionAccept(() => {
                    // Start processing tasks on the modification queue.
                    logger.debug(`${this} Resuming the modification queue after session is established!`);
                    this.modificationQueue.resume();

                    success();
                    this.room.eventEmitter.emit(XMPPEvents.SESSION_ACCEPT, this);

                    // The first video track is added to the peerconnection and signaled as part of the session-accept.
                    // Add secondary video tracks (that were already added to conference) to the peerconnection here.
                    // This will happen when someone shares a secondary source to a two people call, the other user
                    // leaves and joins the call again, a new peerconnection is created for p2p/jvb connection. At this
                    // point, there are 2 video tracks which need to be signaled to the remote peer.
                    const videoTracks = localTracks.filter(track => track.getType() === MediaType.VIDEO);

                    videoTracks.length && videoTracks.splice(0, 1);
                    videoTracks.length && this.addTracks(videoTracks);
                },
                error => {
                    failure(error);
                    this.room.eventEmitter.emit(XMPPEvents.SESSION_ACCEPT_ERROR, this, error);
                });
            },
            failure,
            localTracks);
    }

    /**
     * {@inheritDoc}
     */
    public override addIceCandidates(elem: object): void {
        if (this.peerconnection.signalingState === 'closed') {
            logger.warn(`${this} Ignored add ICE candidate when in closed state`);

            return;
        }

        const iceCandidates: RTCIceCandidate[] = [];

        $(elem).find('>content>transport>candidate')
            .each((idx: number, candidate: Element) => {
                let line = SDPUtil.candidateFromJingle(candidate);

                line = line.replace('\r\n', '').replace('a=', '');

                // FIXME this code does not care to handle
                // non-bundle transport
                const rtcCandidate = new RTCIceCandidate({
                    candidate: line,
                    sdpMLineIndex: 0,

                    // FF comes up with more complex names like audio-23423,
                    // Given that it works on both Chrome and FF without
                    // providing it, let's leave it like this for the time
                    // being...
                    // sdpMid: 'audio',
                    sdpMid: ''
                });

                iceCandidates.push(rtcCandidate);
            });

        if (!iceCandidates.length) {
            logger.error(`${this} No ICE candidates to add ?`, elem[0]?.outerHTML);

            return;
        }

        // We want to have this task queued, so that we know it is executed,
        // after the initial sRD/sLD offer/answer cycle was done (based on
        // the assumption that candidates are spawned after the offer/answer
        // and XMPP preserves order).
        const workFunction = finishedCallback => {
            for (const iceCandidate of iceCandidates) {
                this.peerconnection.addIceCandidate(iceCandidate)
                    .then(
                        () => logger.debug(`${this} addIceCandidate ok!`),
                        err => logger.error(`${this} addIceCandidate failed!`, err));
            }

            finishedCallback();
            logger.debug(`${this} ICE candidates task finished`);
        };

        logger.debug(`${this} Queued add (${iceCandidates.length}) ICE candidates task`);
        this.modificationQueue.push(workFunction);
    }

    /**
     * Handles a Jingle source-add message for this Jingle session.
     *
     * @param {Array<Element>} elem an array of Jingle "content" elements.
     * @returns {Promise} resolved when the operation is done or rejected with an error.
     */
    public addRemoteStream(elem: Element[]): void {
        this._addOrRemoveRemoteStream(true /* add */, elem);
    }

    /**
     * Adds a new track to the peerconnection. This method needs to be called only when a secondary JitsiLocalTrack is
     * being added to the peerconnection for the first time.
     *
     * @param {Array<JitsiLocalTrack>} localTracks - Tracks to be added to the peer connection.
     * @returns {Promise<void>} that resolves when the track is successfully added to the peerconnection, rejected
     * otherwise.
     */
    public addTracks(localTracks: Nullable<JitsiLocalTrack[]> = null): Promise<void> {
        if (!localTracks?.length) {
            Promise.reject(new Error('No tracks passed'));
        }

        const replaceTracks = [];
        const workFunction = finishedCallback => {
            const remoteSdp = new SDP(this.peerconnection.remoteDescription.sdp, this.isP2P);
            const recvOnlyTransceiver = this.peerconnection.peerconnection.getTransceivers()
                    .find(t => t.receiver.track.kind === MediaType.VIDEO
                        && t.direction === MediaDirection.RECVONLY
                        && t.currentDirection === MediaDirection.RECVONLY);

            // Add transceivers by adding a new mline in the remote description for each track. Do not create a new
            // m-line if a recv-only transceiver exists in the p2p case. The new track will be attached to the
            // existing one in that case.
            for (const track of localTracks) {
                if (!this.isP2P || !recvOnlyTransceiver) {
                    remoteSdp.addMlineForNewSource(track.getType());
                }
            }

            this._renegotiate(remoteSdp.raw)
                .then(() => {
                    // Replace the tracks on the newly generated transceivers.
                    for (const track of localTracks) {
                        replaceTracks.push(this.peerconnection.replaceTrack(null, track));
                    }

                    return Promise.all(replaceTracks);
                })

                // Trigger a renegotiation here since renegotiations are suppressed at TPC.replaceTrack for screenshare
                // tracks. This is done here so that presence for screenshare tracks is sent before signaling.
                .then(() => this._renegotiate())
                .then(() => finishedCallback(), error => finishedCallback(error));
        };

        return new Promise((resolve, reject) => {
            logger.debug(`${this} Queued renegotiation after addTrack`);

            this.modificationQueue.push(
                workFunction,
                error => {
                    if (error) {
                        if (error instanceof ClearedQueueError) {
                            // The session might have been terminated before the task was executed, making it obsolete.
                            logger.debug(`${this} renegotiation after addTrack aborted: session terminated`);
                            resolve();

                            return;
                        }
                        logger.error(`${this} renegotiation after addTrack error`, error);
                        reject(error);
                    } else {
                        logger.debug(`${this} renegotiation after addTrack executed - OK`);
                        resolve();
                    }
                });
        });
    }

    /**
     * Adds local track back to the peerconnection associated with this session.
     *
     * @param {JitsiLocalTrack} track - the local track to be added back to the peerconnection.
     * @return {Promise} a promise that will resolve once the local track is added back to this session and
     * renegotiation succeeds (if its warranted). Will be rejected with a <tt>string</tt> that provides some error
     * details in case something goes wrong.
     * @returns {Promise<void>}
     */
    public addTrackToPc(track: JitsiLocalTrack): Promise<void> {
        return this._addRemoveTrack(false /* add */, track)
            .then(async () => {
                // Configure the video encodings after the track is unmuted. If the user joins the call muted and
                // unmutes it the first time, all the parameters need to be configured.
                if (track.isVideoTrack()) {
                    await this.peerconnection.configureVideoSenderEncodings(track);
                }
            });
    }

    /**
     * Closes the underlying peerconnection and shuts down the modification queue.
     *
     * @returns {void}
     */
    public close(): void {
        this.state = JingleSessionState.ENDED;
        this.establishmentDuration = undefined;

        if (this.peerconnection) {
            this.peerconnection.onicecandidate = null;
            this.peerconnection.oniceconnectionstatechange = null;
            this.peerconnection.onnegotiationneeded = null;
            this.peerconnection.onsignalingstatechange = null;
        }

        logger.debug(`${this} Clearing modificationQueue`);

        // Remove any pending tasks from the queue
        this.modificationQueue.clear();

        logger.debug(`${this} Queued PC close task`);
        this.modificationQueue.push(finishCallback => {
            // do not try to close if already closed.
            this.peerconnection && this.peerconnection.close();
            finishCallback();
            logger.debug(`${this} PC close task done!`);
        });

        logger.debug(`${this} Shutdown modificationQueue!`);

        // No more tasks can go in after the close task
        this.modificationQueue.shutdown();
    }

    /**
     * @inheritDoc
     * @param {JingleSessionPCOptions} options  - a set of config options.
     * @returns {void}
     */
    public override doInitialize(options: IJingleSessionPCOptions): void {
        this.failICE = Boolean(options.testing?.failICE);
        this.lasticecandidate = false;
        this.options = options;

        /**
         * {@code true} if reconnect is in progress.
         * @type {boolean}
         */
        this.isReconnect = false;

        /**
         * Set to {@code true} if the connection was ever stable
         * @type {boolean}
         */
        this.wasstable = false;
        this.webrtcIceUdpDisable = Boolean(options.webrtcIceUdpDisable);
        this.webrtcIceTcpDisable = Boolean(options.webrtcIceTcpDisable);

        const pcOptions = {
            audioQuality: options.audioQuality,
            capScreenshareBitrate: undefined,
            codecSettings: options.codecSettings,
            disableRtx: options.disableRtx,
            disableSimulcast: this.isP2P ? true : options.disableSimulcast,
            enableInsertableStreams: options.enableInsertableStreams,
            forceTurnRelay: options.forceTurnRelay,
            maxstats: undefined,
            startSilent: undefined,
            usesCodecSelectionAPI: undefined,
            videoQuality: undefined
        };

        if (options.gatherStats) {
            pcOptions.maxstats = DEFAULT_MAX_STATS;
        }
        pcOptions.usesCodecSelectionAPI = this.usesCodecSelectionAPI
            = browser.supportsCodecSelectionAPI()
            && (options.testing?.enableCodecSelectionAPI ?? true)
            && !this.isP2P;

        if (options.videoQuality) {
            const settings = Object.entries(options.videoQuality)
            .map(entry => {
                entry[0] = entry[0].toLowerCase();

                return entry;
            });

            pcOptions.videoQuality = Object.fromEntries(settings);
        }

        if (!this.isP2P) {
            // Do not send lower spatial layers for low fps screenshare and enable them only for high fps screenshare.
            pcOptions.capScreenshareBitrate = !(options.desktopSharingFrameRate?.max > SS_DEFAULT_FRAME_RATE);
        }

        if (options.startSilent) {
            pcOptions.startSilent = true;
        }

        this.peerconnection
            = this.rtc.createPeerConnection(
                    this._signalingLayer,
                    this.pcConfig,
                    this.isP2P,
                    pcOptions);

        this.peerconnection.onicecandidate = ev => {
            if (!ev) {
                // There was an incomplete check for ev before which left
                // the last line of the function unprotected from a potential
                // throw of an exception. Consequently, it may be argued that
                // the check is unnecessary. Anyway, I'm leaving it and making
                // the check complete.
                return;
            }

            // XXX this is broken, candidate is not parsed.
            const candidate = ev.candidate;
            const now = window.performance.now();

            if (candidate) {
                if (this._gatheringStartedTimestamp === null) {
                    this._gatheringStartedTimestamp = now;
                }

                // Discard candidates of disabled protocols.
                let protocol = candidate.protocol as string;

                if (typeof protocol === 'string') {
                    protocol = protocol.toLowerCase();
                    if (protocol === 'tcp' || protocol === 'ssltcp') {
                        if (this.webrtcIceTcpDisable) {
                            return;
                        }
                    } else if (protocol === 'udp') {
                        if (this.webrtcIceUdpDisable) {
                            return;
                        }
                    }
                }
            } else if (!this._gatheringReported) {
                // End of gathering
                Statistics.sendAnalytics(
                    AnalyticsEvents.ICE_DURATION,
                    {
                        initiator: this.isInitiator,
                        p2p: this.isP2P,
                        phase: 'gathering',
                        value: now - this._gatheringStartedTimestamp
                    });
                this._gatheringReported = true;
            }
            if (this.isP2P) {
                this._sendIceCandidate(candidate);
            }
        };

        // Note there is a change in the spec about closed:
        // This value moved into the RTCPeerConnectionState enum in
        // the May 13, 2016 draft of the specification, as it reflects the state
        // of the RTCPeerConnection, not the signaling connection. You now
        // detect a closed connection by checking for connectionState to be
        // "closed" instead.
        // I suppose at some point this will be moved to onconnectionstatechange
        this.peerconnection.onsignalingstatechange = () => {
            if (this.peerconnection.signalingState === 'stable') {
                this.wasstable = true;
            } else if (this.peerconnection.signalingState === 'closed'
                || this.peerconnection.connectionState === 'closed') {
                this.room.eventEmitter.emit(XMPPEvents.SUSPEND_DETECTED, this);
            }
        };

        /**
         * The oniceconnectionstatechange event handler contains the code to
         * execute when the iceconnectionstatechange event, of type Event,
         * is received by this RTCPeerConnection. Such an event is sent when
         * the value of RTCPeerConnection.iceConnectionState changes.
         */
        this.peerconnection.oniceconnectionstatechange = () => {
            const now = window.performance.now();
            let isStable = false;

            if (!this.isP2P) {
                this.room.connectionTimes[
                    `ice.state.${this.peerconnection.iceConnectionState}`]
                    = now;
            }
            logger.info(`(TIME) ICE ${this.peerconnection.iceConnectionState} ${this.isP2P ? 'P2P' : 'JVB'}:\t`, now);

            Statistics.sendAnalytics(
                AnalyticsEvents.ICE_STATE_CHANGED,
                {
                    p2p: this.isP2P,
                    reconnect: this.isReconnect,
                    'signaling_state': this.peerconnection.signalingState,
                    state: this.peerconnection.iceConnectionState,
                    value: now
                });

            this.room.eventEmitter.emit(
                XMPPEvents.ICE_CONNECTION_STATE_CHANGED,
                this,
                this.peerconnection.iceConnectionState);
            switch (this.peerconnection.iceConnectionState) {
            case 'checking':
                this._iceCheckingStartedTimestamp = now;
                break;
            case 'connected':
            case 'completed':
                // Informs interested parties that the connection has been restored. This includes the case when
                // media connection to the bridge has been restored after an ICE failure by using session-terminate.
                if (this.peerconnection.signalingState === 'stable') {
                    isStable = true;
                    this.room.eventEmitter.emit(XMPPEvents.CONNECTION_RESTORED, this);
                }

                // Add a workaround for an issue on chrome in Unified plan when the local endpoint is the offerer.
                // The 'signalingstatechange' event for 'stable' is handled after the 'iceconnectionstatechange' event
                // for 'completed' is handled by the client. This prevents the client from firing a
                // CONNECTION_ESTABLISHED event for the p2p session. As a result, the offerer continues to stay on the
                // jvb connection while the remote peer switches to the p2p connection breaking the media flow between
                // the endpoints.
                // TODO - file a chromium bug and add the information here.
                if (!this.wasConnected
                    && (this.wasstable
                        || isStable
                        || (this.isInitiator && (browser.isChromiumBased() || browser.isReactNative())))) {

                    Statistics.sendAnalytics(
                        AnalyticsEvents.ICE_DURATION,
                        {
                            initiator: this.isInitiator,
                            p2p: this.isP2P,
                            phase: 'checking',
                            value: now - this._iceCheckingStartedTimestamp
                        });

                    // Switch between ICE gathering and ICE checking whichever
                    // started first (scenarios are different for initiator
                    // vs responder)
                    const iceStarted
                        = Math.min(
                            this._iceCheckingStartedTimestamp,
                            this._gatheringStartedTimestamp);

                    this.establishmentDuration = now - iceStarted;

                    Statistics.sendAnalytics(
                        AnalyticsEvents.ICE_DURATION,
                        {
                            initiator: this.isInitiator,
                            p2p: this.isP2P,
                            phase: 'establishment',
                            value: this.establishmentDuration
                        });

                    this.wasConnected = true;
                    this.room.eventEmitter.emit(
                        XMPPEvents.CONNECTION_ESTABLISHED, this);
                }
                this.isReconnect = false;
                break;
            case 'disconnected':
                this.isReconnect = true;

                // Informs interested parties that the connection has been
                // interrupted.
                if (this.wasstable) {
                    this.room.eventEmitter.emit(
                        XMPPEvents.CONNECTION_INTERRUPTED, this);
                }
                break;
            case 'failed':
                this.room.eventEmitter.emit(
                    XMPPEvents.CONNECTION_ICE_FAILED, this);
                break;
            }
        };


        /**
         * The connection state event is fired whenever the aggregate of underlying
         * transports change their state.
         */
        this.peerconnection.onconnectionstatechange = () => {
            const icestate = this.peerconnection.iceConnectionState;

            logger.info(`(TIME) ${this.isP2P ? 'P2P' : 'JVB'} PC state is now ${this.peerconnection.connectionState} `
                + `(ICE state ${this.peerconnection.iceConnectionState}):\t`, window.performance.now());

            switch (this.peerconnection.connectionState) {
            case 'failed':
                // Since version 76 Chrome no longer switches ICE connection
                // state to failed (see
                // https://bugs.chromium.org/p/chromium/issues/detail?id=982793
                // for details) we use this workaround to recover from lost connections
                if (icestate === 'disconnected') {
                    this.room.eventEmitter.emit(
                        XMPPEvents.CONNECTION_ICE_FAILED, this);
                }
                break;
            }
        };

        /**
         * The negotiationneeded event is fired whenever we shake the media on the
         * RTCPeerConnection object.
         */
        this.peerconnection.onnegotiationneeded = () => {
            const state = this.peerconnection.signalingState;
            const remoteDescription = this.peerconnection.remoteDescription;

            if (!this.isP2P
                && state === 'stable'
                && remoteDescription
                && typeof remoteDescription.sdp === 'string') {
                logger.info(`${this} onnegotiationneeded fired on ${this.peerconnection}`);

                const workFunction = async finishedCallback => {
                    try {
                        await this._renegotiate();
                        await this.peerconnection.configureAudioSenderEncodings();
                        finishedCallback();
                    } catch (error) {
                        finishedCallback(error);
                    }
                };

                this.modificationQueue.push(
                    workFunction,
                    error => {
                        if (error) {
                            logger.error(`${this} onnegotiationneeded error`, error);
                        } else {
                            logger.debug(`${this} onnegotiationneeded executed - OK`);
                        }
                    });
            }
        };
    }

    /**
     * Returns the ice connection state for the peer connection.
     *
     * @returns the ice connection state for the peer connection.
     */
    public getIceConnectionState(): RTCIceConnectionState {
        return this.peerconnection.getConnectionState();
    }

    /**
     * Returns the preference for max frame height for the remote video sources.
     *
     * @returns {Optional<$Map<string, number>>}
     */
    public getRemoteSourcesRecvMaxFrameHeight(): Optional<ISourceFrameHeight[]> {
        if (this.isP2P) {
            return this.remoteSourceMaxFrameHeights;
        }

        return undefined;
    }

    /**
     * Creates an offer and sends Jingle 'session-initiate' to the remote peer.
     *
     * @param {Array<JitsiLocalTrack>} localTracks the local tracks that will be added, before the offer/answer cycle
     * executes (for the local track addition to be an atomic operation together with the offer/answer).
     * @returns {Promise<void>} that resolves when the offer is sent to the remote peer, rejected otherwise.
     */
    public async invite(localTracks: JitsiLocalTrack[] = []): Promise<void> {
        if (!this.isInitiator) {
            throw new Error('Trying to invite from the responder session');
        }
        logger.debug(`${this} Executing invite task`);

        const addTracks = [];

        for (const track of localTracks) {
            addTracks.push(this.peerconnection.addTrack(track, this.isInitiator));
        }

        try {
            await Promise.all(addTracks);
            const offerSdp = await this.peerconnection.createOffer(this.mediaConstraints as RTCOfferOptions);

            await this.peerconnection.setLocalDescription(offerSdp);
            this.peerconnection.processLocalSdpForTransceiverInfo(localTracks);
            this._sendSessionInitiate(this.peerconnection.localDescription.sdp);

            logger.debug(`${this} invite executed - OK`);
        } catch (error) {
            logger.error(`${this} invite error`, error);
            throw error;
        }
    }

    /**
     * Enables/disables local video based on 'senders' attribute of the video conent in 'content-modify' IQ sent by the
     * remote peer. Also, checks if the sourceMaxFrameHeight (as requested by the p2p peer) or the senders attribute of
     * the video content has changed and modifies the local video resolution accordingly.
     *
     * @param {Element} jingleContents - The content of the 'content-modify' IQ sent by the remote peer.
     * @returns {void}
     */
    public modifyContents(jingleContents: IJingleContents): void {
        const newVideoSenders = JingleSessionPC.parseVideoSenders(jingleContents);
        const sourceMaxFrameHeights = JingleSessionPC.parseSourceMaxFrameHeight(jingleContents);

        if (sourceMaxFrameHeights) {
            this.remoteSourceMaxFrameHeights = sourceMaxFrameHeights;
            this.eventEmitter.emit(MediaSessionEvents.REMOTE_SOURCE_CONSTRAINTS_CHANGED, this, sourceMaxFrameHeights);
        }

        if (newVideoSenders === null) {
            logger.error(`${this} - failed to parse video "senders" attribute in "content-modify" action`);

            return;
        }

        if (!this._assertNotEnded()) {
            return;
        }

        const isRemoteVideoActive
            = newVideoSenders === 'both'
                || (newVideoSenders === 'initiator' && this.isInitiator)
                || (newVideoSenders === 'responder' && !this.isInitiator);

        if (isRemoteVideoActive !== this._remoteSendReceiveVideoActive) {
            logger.debug(`${this} new remote video active: ${isRemoteVideoActive}`);
            this._remoteSendReceiveVideoActive = isRemoteVideoActive;

            this.peerconnection
                .setVideoTransferActive(this._localSendReceiveVideoActive && this._remoteSendReceiveVideoActive);
        }
    }

    /**
     * Handles the termination of the session.
     *
     * @param {string} reasonCondition - The XMPP Jingle reason condition.
     * @param {string} reasonText - The XMPP Jingle reason text.
     * @returns {void}
     */
    public onTerminated(reasonCondition: string, reasonText: string) {
        // Do something with reason and reasonCondition when we start to care
        // this.reasonCondition = reasonCondition;
        // this.reasonText = reasonText;
        logger.info(`${this} Session terminated`, reasonCondition, reasonText);

        this._xmppListeners.forEach(removeListener => removeListener());
        this._xmppListeners = [];

        if (this._removeSenderVideoConstraintsChangeListener) {
            this._removeSenderVideoConstraintsChangeListener();
        }

        if (FeatureFlags.isSsrcRewritingSupported() && this.peerconnection) {
            this.peerconnection.getRemoteTracks().forEach(track => {
                this.room.eventEmitter.emit(JitsiConferenceEvents.TRACK_REMOVED, track);
            });
        }

        this.close();
    }

    /**
     * Processes the source map message received from the bridge and creates a new remote track for newly signaled
     * SSRCs or updates the source-name and owner on the remote track for an existing SSRC.
     *
     * @param {Object} message - The source map message.
     * @param {string} mediaType - The media type, 'audio' or 'video'.
     * @returns {void}
     */
    public processSourceMap(message: any, mediaType: MediaType): void {
        if (!FeatureFlags.isSsrcRewritingSupported()) {
            return;
        }

        if (mediaType === MediaType.AUDIO && this.options.startSilent) {

            return;
        }

        const newSsrcs = [];

        for (const src of message.mappedSources) {
            const { owner, source, ssrc } = src;
            const isNewSsrc = this.peerconnection.addRemoteSsrc(ssrc);

            if (isNewSsrc) {
                newSsrcs.push(src);
                logger.debug(`New SSRC signaled ${ssrc}: owner=${owner}, source-name=${source}`);

                // Check if there is an old mapping for the given source and clear the owner on the associated track.
                const oldSsrc = this.peerconnection.remoteSources.get(source);

                if (oldSsrc) {
                    this._signalingLayer.removeSSRCOwners([ oldSsrc ]);
                    const track = this.peerconnection.getTrackBySSRC(oldSsrc);

                    if (track) {
                        this.room.eventEmitter.emit(JitsiTrackEvents.TRACK_OWNER_SET, track);
                    }
                }
            } else {
                const track = this.peerconnection.getTrackBySSRC(ssrc);

                if (!track || (track.getParticipantId() === owner && track.getSourceName() === source)) {
                    !track && logger.warn(`Remote track for SSRC=${ssrc} hasn't been created yet,`
                        + 'not processing the source map');
                    continue; // eslint-disable-line no-continue
                }
                logger.debug(`Existing SSRC re-mapped ${ssrc}: new owner=${owner}, source-name=${source}`);

                this._signalingLayer.setSSRCOwner(ssrc, owner, source);
                const oldSourceName = track.getSourceName();
                const sourceInfo = this.peerconnection.getRemoteSourceInfoBySourceName(oldSourceName);

                // Update the SSRC map on the peerconnection.
                if (sourceInfo) {
                    this.peerconnection.updateRemoteSources(new Map([ [ oldSourceName, sourceInfo ] ]), false);
                    this.peerconnection.updateRemoteSources(new Map([ [ source, sourceInfo ] ]), true /* isAdd */);
                }

                // Update the muted state and the video type on the track since the presence for this track could have
                // been received before the updated source map is received on the bridge channel.
                const { muted, videoType } = this._signalingLayer.getPeerMediaInfo(owner, mediaType, source);

                muted && this.peerconnection._sourceMutedChanged(source, muted);
                this.room.eventEmitter.emit(JitsiTrackEvents.TRACK_OWNER_SET, track, owner, source, videoType);
            }
        }

        // Add the new SSRCs to the remote description by generating a source message.
        if (newSsrcs.length) {
            let node = $build('content', {
                name: mediaType,
                xmlns: 'urn:xmpp:jingle:1'
            }).c('description', {
                media: mediaType,
                xmlns: XEP.RTP_MEDIA
            });

            for (const src of newSsrcs) {
                const { rtx, ssrc, source } = src;
                let msid;

                if (mediaType === MediaType.VIDEO) {
                    const idx = ++this.numRemoteVideoSources;

                    msid = `remote-video-${idx} remote-video-${idx}`;

                    if (rtx !== '-1') {
                        _addSourceElement(node, src, rtx, msid);
                        node.c('ssrc-group', {
                            semantics: SSRC_GROUP_SEMANTICS.FID,
                            xmlns: XEP.SOURCE_ATTRIBUTES
                        })
                            .c('source', {
                                ssrc,
                                xmlns: XEP.SOURCE_ATTRIBUTES
                            })
                            .up()
                            .c('source', {
                                ssrc: rtx,
                                xmlns: XEP.SOURCE_ATTRIBUTES
                            })
                            .up()
                            .up();
                    }
                } else {
                    const idx = ++this.numRemoteAudioSources;

                    msid = `remote-audio-${idx} remote-audio-${idx}`;
                }
                _addSourceElement(node, src, ssrc, msid);
                this.peerconnection.remoteSources.set(source, ssrc);
            }
            node = node.up();
            this._addOrRemoveRemoteStream(true /* add */, node.node);
        }
    }

    /**
     * Handles a Jingle source-remove message for this Jingle session.
     *
     * @param {Array<Element>} contents - An array of content elements from the source-remove message.
     * @returns {void}
     */
    public removeRemoteStream(elem: Element[]): void {
        this._addOrRemoveRemoteStream(false /* remove */, elem);
    }

    /**
     * Handles the deletion of SSRCs associated with a remote user from the remote description when the user leaves.
     *
     * @param {string} id Endpoint id of the participant that has left the call.
     * @returns {void}
     */
    public removeRemoteStreamsOnLeave(id: string): void {
        const workFunction = finishCallback => {
            const removeSsrcInfo = this.peerconnection.getRemoteSourceInfoByParticipant(id);

            if (removeSsrcInfo.size) {
                logger.debug(`${this} Removing SSRCs for user ${id}, sources=${Array.from(removeSsrcInfo.keys())}`);
                const newRemoteSdp = new SDP(this.peerconnection.remoteDescription.sdp, this.isP2P);

                newRemoteSdp.updateRemoteSources(removeSsrcInfo, false /* isAdd */);
                this.peerconnection.updateRemoteSources(removeSsrcInfo, false /* isAdd */);

                this._renegotiate(newRemoteSdp.raw)
                    .then(() => finishCallback(), error => finishCallback(error));
            } else {
                finishCallback();
            }
        };

        logger.debug(`${this} Queued removeRemoteStreamsOnLeave task for participant ${id}`);

        this.modificationQueue.push(
            workFunction,
            error => {
                if (error) {
                    logger.error(`${this} removeRemoteStreamsOnLeave error:`, error);
                } else {
                    logger.info(`${this} removeRemoteStreamsOnLeave done!`);
                }
            });
    }

    /**
     * Removes local track from the peerconnection as part of the mute operation.
     *
     * @param {JitsiLocalTrack} track the local track to be removed.
     * @return {Promise} a promise which will be resolved once the local track is removed from this session or rejected
     * with a <tt>string</tt> that the describes the error if anything goes wrong.
     */
    public removeTrackFromPc(track: JitsiLocalTrack): Promise<void> {
        return this._addRemoveTrack(true /* remove */, track);
    }

    /**
     * Replaces <tt>oldTrack</tt> with <tt>newTrack</tt> and performs a single offer/answer cycle (if needed) after
     * both operations are done.
     * <tt>oldTrack</tt> or <tt>newTrack</tt> can be null; replacing a valid <tt>oldTrack</tt> with a null
     * <tt>newTrack</tt> effectively just removes <tt>oldTrack</tt>.
     *
     * @param {Nullable<JitsiLocalTrack>} oldTrack the current track in use to be replaced.
     * @param {Nullable<JitsiLocalTrack>} newTrack the new track to use.
     * @returns {Promise} which resolves once the replacement is complete with no arguments or rejects with an error.
     */
    public replaceTrack(oldTrack: Nullable<JitsiLocalTrack>, newTrack: Nullable<JitsiLocalTrack>): Promise<void> {
        const workFunction = finishedCallback => {
            logger.debug(`${this} replaceTrack worker started. oldTrack = ${oldTrack}, newTrack = ${newTrack}`);

            this.peerconnection.replaceTrack(oldTrack, newTrack)
                .then(shouldRenegotiate => {
                    let promise = Promise.resolve();

                    logger.debug(`${this} TPC.replaceTrack finished. shouldRenegotiate = ${
                        shouldRenegotiate}, JingleSessionState = ${this.state}`);

                    if (shouldRenegotiate && (oldTrack || newTrack) && this.state === JingleSessionState.ACTIVE) {
                        promise = this._renegotiate();
                    }

                    return promise.then(() => {
                        // Set the source name of the new track.
                        if (oldTrack && newTrack && oldTrack.isVideoTrack()) {
                            newTrack.setSourceName(oldTrack.getSourceName());
                        }
                    });
                })
                .then(() => finishedCallback(), error => finishedCallback(error));
        };

        return new Promise((resolve, reject) => {
            logger.debug(`${this} Queued replaceTrack task. Old track = ${oldTrack}, new track = ${newTrack}`);

            this.modificationQueue.push(
                workFunction,
                error => {
                    if (error) {
                        if (error instanceof ClearedQueueError) {
                            // The session might have been terminated before the task was executed, making it obsolete.
                            logger.debug('Replace track aborted: session terminated');
                            resolve();

                            return;
                        }
                        logger.error(`${this} Replace track error:`, error);
                        reject(error);
                    } else {
                        logger.info(`${this}  Replace track done!`);
                        resolve();
                    }
                });
        });
    }

    /**
     * Sets the answer received from the remote peer as the remote description.
     *
     * @param {Element} jingleAnswer - The jingle answer element.
     * @returns {Promise<void>} that resolves when the answer is set as the remote description, rejected otherwise.
     */
    public async setAnswer(jingleAnswer: Element): Promise<void> {
        if (!this.isInitiator) {
            throw new Error('Trying to set an answer on the responder session');
        }
        logger.debug(`${this} Executing setAnswer task`);

        const newRemoteSdp = this._processNewJingleOfferIq(jingleAnswer);
        const oldLocalSdp = new SDP(this.peerconnection.localDescription.sdp);
        const remoteDescription = {
            sdp: newRemoteSdp.raw,
            type: 'answer'
        } as RTCSessionDescription;

        try {
            await this.peerconnection.setRemoteDescription(remoteDescription);
            if (this.state === JingleSessionState.PENDING) {
                this.state = JingleSessionState.ACTIVE;

                // Start processing tasks on the modification queue.
                logger.debug(`${this} Resuming the modification queue after session is established!`);
                this.modificationQueue.resume();
                const newLocalSdp = new SDP(this.peerconnection.localDescription.sdp);

                this._sendContentModify();
                this.notifyMySSRCUpdate(oldLocalSdp, newLocalSdp);
            }
            logger.debug(`${this} setAnswer task done`);
        } catch (error) {
            logger.error(`${this} setAnswer task failed: ${error}`);
            throw error;
        }
    }

    /**
     * Resumes or suspends media transfer over the underlying peer connection.
     *
     * @param {boolean} active - <tt>true</tt> to enable media transfer or <tt>false</tt> to suspend media transmission.
     * @returns {Promise<void>}
     */
    public setMediaTransferActive(active: boolean): Promise<void> {
        const changed = this.peerconnection.audioTransferActive !== active
            || this.peerconnection.videoTransferActive !== active;

        if (!changed) {
            return Promise.resolve();
        }

        return this.peerconnection.setMediaTransferActive(active)
            .then(async () => {
                this.peerconnection.audioTransferActive = active;
                this.peerconnection.videoTransferActive = active;

                // Reconfigure the audio and video tracks so that only the correct encodings are active.
                const promises = [];

                promises.push(this.peerconnection.configureVideoSenderEncodings());
                promises.push(this.peerconnection.configureAudioSenderEncodings());
                await Promise.allSettled(promises);
            });
    }

    /**
     * Resumes or suspends video media transfer over the p2p peer connection.
     *
     * @param {boolean} videoActive <tt>true</tt> to enable video media transfer or <tt>false</tt> to suspend video
     * media transmission.
     * @return {Promise} a <tt>Promise</tt> which will resolve once the operation is done. It will be rejected with
     * an error description as a string in case anything goes wrong.
     */
    public setP2pVideoTransferActive(videoActive: boolean): Promise<void> {
        if (!this.peerconnection) {
            return Promise.reject('Can not modify video transfer active state,'
                    + ' before "initialize" is called');
        }

        if (this._localSendReceiveVideoActive !== videoActive) {
            this._localSendReceiveVideoActive = videoActive;
            if (this.isP2P && this.state === JingleSessionState.ACTIVE) {
                this._sendContentModify();
            }

            return this.peerconnection
                .setVideoTransferActive(this._localSendReceiveVideoActive && this._remoteSendReceiveVideoActive);
        }

        return Promise.resolve();
    }

    /**
     * Adjust the preference for max video frame height that the local party is willing to receive. Signals
     * the remote p2p peer.
     *
     * @param {Map<string, number>} sourceReceiverConstraints - The receiver constraints per source.
     * @returns {void}
     */
    public setReceiverVideoConstraint(sourceReceiverConstraints: Map<string, number>): void {
        logger.info(`${this} setReceiverVideoConstraint - constraints: ${JSON.stringify(sourceReceiverConstraints)}`);
        this._sourceReceiverConstraints = sourceReceiverConstraints;

        if (this.isP2P) {
            // Tell the remote peer about our receive constraint. If Jingle session is not yet active the state will
            // be synced after offer/answer.
            if (this.state === JingleSessionState.ACTIVE) {
                this._sendContentModify();
            }
        }
    }

    /**
     * Sets the resolution constraint on the local video tracks.
     *
     * @param {number} maxFrameHeight - The user preferred max frame height.
     * @param {string} sourceName - The source name of the track.
     * @returns {Promise} promise that will be resolved when the operation is
     * successful and rejected otherwise.
     */
    public setSenderVideoConstraint(maxFrameHeight: number, sourceName: Nullable<string> = null): Promise<void> {
        if (this._assertNotEnded()) {
            logger.info(`${this} setSenderVideoConstraint: ${maxFrameHeight}, sourceName: ${sourceName}`);

            const jitsiLocalTrack = sourceName
                ? this.rtc.getLocalVideoTracks().find(track => track.getSourceName() === sourceName)
                : this.rtc.getLocalVideoTrack();

            return this.peerconnection.setSenderVideoConstraints(maxFrameHeight, jitsiLocalTrack);
        }

        return Promise.resolve();
    }

    /**
     * Updates the codecs on the peerconnection and initiates a renegotiation (if needed) for the
     * new codec config to take effect.
     *
     * @param {Array<CodecMimeType>} codecList - Preferred codecs for video.
     * @param {CodecMimeType} screenshareCodec - The preferred screenshare codec.
     * @returns {void}
     */
    public setVideoCodecs(codecList: CodecMimeType[], screenshareCodec: Optional<CodecMimeType>): void {
        if (this._assertNotEnded()) {
            const updated = this.peerconnection.setVideoCodecs(codecList, screenshareCodec);

            if (updated) {
                this.eventEmitter.emit(MediaSessionEvents.VIDEO_CODEC_CHANGED);
            }

            // Browser throws an error when H.264 is set on the encodings. Therefore, munge the SDP when H.264 needs to
            // be selected.
            // TODO: Remove this check when the above issue is fixed.
            if (this.usesCodecSelectionAPI && codecList[0] !== CodecMimeType.H264) {
                return;
            }

            // Skip renegotiation when the selected codec order matches with that of the remote SDP.
            const currentCodecOrder = this.peerconnection.getConfiguredVideoCodecs();

            if (codecList.every((val, index) => val === currentCodecOrder[index])) {
                return;
            }

            this.eventEmitter.emit(MediaSessionEvents.VIDEO_CODEC_CHANGED);
            Statistics.sendAnalytics(
                AnalyticsEvents.VIDEO_CODEC_CHANGED,
                {
                    value: codecList[0],
                    videoType: VideoType.CAMERA
                });

            logger.info(`${this} setVideoCodecs: codecList=${codecList}, screenshareCodec=${screenshareCodec}`);

            // Initiate a renegotiate for the codec setting to take effect.
            const workFunction = async finishedCallback => {
                try {
                    await this._renegotiate();
                    await this.peerconnection.configureVideoSenderEncodings();
                    logger.debug(`${this} setVideoCodecs task is done`);

                    return finishedCallback();
                } catch (error) {
                    logger.error(`${this} setVideoCodecs task failed: ${error}`);

                    return finishedCallback(error);
                }
            };

            logger.debug(`${this} Queued setVideoCodecs task`);

            // Queue and execute
            this.modificationQueue.push(workFunction);
        }
    }

    /**
     * @inheritDoc
     */
    public override terminate(
            success: () => void,
            failure: (error: IJingleError) => void,
            options: ITerminateOptions = {}) {
        if (this.state === JingleSessionState.ENDED) {
            return;
        }

        if (!options || Boolean(options.sendSessionTerminate)) {
            const sessionTerminate
                = $iq({
                    to: this.remoteJid,
                    type: 'set'
                })
                    .c('jingle', {
                        action: 'session-terminate',
                        initiator: this.initiatorJid,
                        sid: this.sid,
                        xmlns: 'urn:xmpp:jingle:1'
                    })
                    .c('reason')
                    .c((options?.reason) || 'success')
                    .up();

            if (options?.reasonDescription) {
                sessionTerminate
                    .c('text')
                    .t(options.reasonDescription)
                    .up()
                    .up();
            } else {
                sessionTerminate.up();
            }

            this._bridgeSessionId
                && sessionTerminate.c(
                    'bridge-session', {
                        id: this._bridgeSessionId,
                        restart: options && options.requestRestart === true,
                        xmlns: 'http://jitsi.org/protocol/focus'
                    }).up();

            logger.info(`${this} Sending session-terminate`);
            logger.debug(sessionTerminate.tree());

            this.connection.sendIQ(
                sessionTerminate,
                success,
                this.newJingleErrorHandler(failure),
                IQ_TIMEOUT);
        } else {
            logger.info(`${this} Skipped sending session-terminate`);
        }

        // this should result in 'onTerminated' being called by strophe.jingle.js
        this.connection.jingle.terminate(this.sid);
    }

    /**
     * Converts to string with minor summary.
     *
     * @return {string}
     */
    public override toString(): string {
        return `JingleSessionPC[session=${this.isP2P ? 'P2P' : 'JVB'},initiator=${this.isInitiator},sid=${this.sid}]`;
    }
}
