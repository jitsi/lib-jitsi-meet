/* global $ */

import { getLogger } from '@jitsi/logger';
import { $iq, Strophe } from 'strophe.js';

import * as CodecMimeType from '../../service/RTC/CodecMimeType';
import { MediaDirection } from '../../service/RTC/MediaDirection';
import { MediaType } from '../../service/RTC/MediaType';
import {
    ICE_DURATION,
    ICE_STATE_CHANGED
} from '../../service/statistics/AnalyticsEvents';
import { XMPPEvents } from '../../service/xmpp/XMPPEvents';
import { SS_DEFAULT_FRAME_RATE } from '../RTC/ScreenObtainer';
import FeatureFlags from '../flags/FeatureFlags';
import SDP from '../sdp/SDP';
import SDPDiffer from '../sdp/SDPDiffer';
import SDPUtil from '../sdp/SDPUtil';
import Statistics from '../statistics/statistics';
import AsyncQueue from '../util/AsyncQueue';
import GlobalOnErrorHandler from '../util/GlobalOnErrorHandler';
import { integerHash } from '../util/StringUtils';

import browser from './../browser';
import JingleSession from './JingleSession';
import * as JingleSessionState from './JingleSessionState';
import MediaSessionEvents from './MediaSessionEvents';
import XmppConnection from './XmppConnection';

const logger = getLogger(__filename);

/**
 * Constant tells how long we're going to wait for IQ response, before timeout
 * error is  triggered.
 * @type {number}
 */
const IQ_TIMEOUT = 10000;

/*
 * The default number of samples (per stat) to keep when webrtc stats gathering
 * is enabled in TraceablePeerConnection.
 */
const DEFAULT_MAX_STATS = 300;

/**
 * The time duration for which the client keeps gathering ICE candidates to be sent out in a single IQ.
 * @type {number} timeout in ms.
 */
const ICE_CAND_GATHERING_TIMEOUT = 150;

/**
 * Reads the endpoint ID given a string which represents either the endpoint's full JID, or the endpoint ID itself.
 * @param {String} jidOrEndpointId A string which is either the full JID of a participant, or the ID of an
 * endpoint/participant.
 * @returns The endpoint ID associated with 'jidOrEndpointId'.
 */
function getEndpointId(jidOrEndpointId) {
    return Strophe.getResourceFromJid(jidOrEndpointId) || jidOrEndpointId;
}

/**
 * @typedef {Object} JingleSessionPCOptions
 * @property {Object} abTesting - A/B testing related options (ask George).
 * @property {boolean} abTesting.enableSuspendVideoTest - enables the suspend
 * video test ?(ask George).
 * @property {boolean} disableH264 - Described in the config.js[1].
 * @property {boolean} disableRtx - Described in the config.js[1].
 * @property {boolean} disableSimulcast - Described in the config.js[1].
 * @property {boolean} enableInsertableStreams - Set to true when the insertable streams constraints is to be enabled
 * on the PeerConnection.
 * @property {boolean} enableLayerSuspension - Described in the config.js[1].
 * @property {boolean} failICE - it's an option used in the tests. Set to
 * <tt>true</tt> to block any real candidates and make the ICE fail.
 * @property {boolean} gatherStats - Described in the config.js[1].
 * @property {object} p2p - Peer to peer related options (FIXME those could be
 * fetched from config.p2p on the upper level).
 * @property {boolean} preferH264 - Described in the config.js[1].
 * @property {Object} testing - Testing and/or experimental options.
 * @property {boolean} webrtcIceUdpDisable - Described in the config.js[1].
 * @property {boolean} webrtcIceTcpDisable - Described in the config.js[1].
 *
 * [1]: https://github.com/jitsi/jitsi-meet/blob/master/config.js
 */
/**
 *
 */
export default class JingleSessionPC extends JingleSession {
    /**
     * Parses 'senders' attribute of the video content.
     * @param {jQuery} jingleContents
     * @return {string|null} one of the values of content "senders" attribute
     * defined by Jingle. If there is no "senders" attribute or if the value is
     * invalid then <tt>null</tt> will be returned.
     * @private
     */
    static parseVideoSenders(jingleContents) {
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
     * Parses the video max frame height value out of the 'content-modify' IQ.
     *
     * @param {jQuery} jingleContents - A jQuery selector pointing to the '>jingle' element.
     * @returns {Number|null}
     */
    static parseMaxFrameHeight(jingleContents) {
        const maxFrameHeightSel = jingleContents.find('>content[name="video"]>max-frame-height');

        return maxFrameHeightSel.length ? Number(maxFrameHeightSel.text()) : null;
    }

    /**
     * Parses the source-name and max frame height value of the 'content-modify' IQ when source-name signaling
     * is enabled.
     *
     * @param {jQuery} jingleContents - A jQuery selector pointing to the '>jingle' element.
     * @returns {Object|null}
     */
    static parseSourceMaxFrameHeight(jingleContents) {
        const receiverConstraints = [];
        const sourceFrameHeightSel = jingleContents.find('>content[name="video"]>source-frame-height');
        let maxHeight, sourceName;

        if (sourceFrameHeightSel.length) {
            sourceFrameHeightSel.each((_, source) => {
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
            sid,
            localJid,
            remoteJid,
            connection,
            mediaConstraints,
            pcConfig,
            isP2P,
            isInitiator) {
        super(
            sid,
            localJid,
            remoteJid, connection, mediaConstraints, pcConfig, isInitiator);

        /**
         * The bridge session's identifier. One Jingle session can during
         * it's lifetime participate in multiple bridge sessions managed by
         * Jicofo. A new bridge session is started whenever Jicofo sends
         * 'session-initiate' or 'transport-replace'.
         *
         * @type {?string}
         * @private
         */
        this._bridgeSessionId = null;

        /**
         * The oldest SDP passed to {@link notifyMySSRCUpdate} while the XMPP connection was offline that will be
         * used to update Jicofo once the XMPP connection goes back online.
         * @type {SDP|undefined}
         * @private
         */
        this._cachedOldLocalSdp = undefined;

        /**
         * The latest SDP passed to {@link notifyMySSRCUpdate} while the XMPP connection was offline that will be
         * used to update Jicofo once the XMPP connection goes back online.
         * @type {SDP|undefined}
         * @private
         */
        this._cachedNewLocalSdp = undefined;

        /**
         * Stores result of {@link window.performance.now()} at the time when
         * ICE enters 'checking' state.
         * @type {number|null} null if no value has been stored yet
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
         * @type {number|null} null if no value has been stored yet
         * @private
         */
        this._gatheringStartedTimestamp = null;

        /**
         * Local preference for the receive video max frame height.
         *
         * @type {Number|undefined}
         */
        this.localRecvMaxFrameHeight = undefined;

        /**
         * Receiver constraints (max height) set by the application per remote source. Will be used for p2p connection
         * in lieu of localRecvMaxFrameHeight when source-name signaling is enabled.
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
        this._localVideoActive = true;

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
        this._remoteVideoActive = true;

        /**
         * Marks that ICE gathering duration has been reported already. That
         * prevents reporting it again, after eventual 'transport-replace' (JVB
         * conference migration/ICE restart).
         * @type {boolean}
         * @private
         */
        this._gatheringReported = false;

        this.lasticecandidate = false;
        this.closed = false;

        /**
         * Indicates whether or not this <tt>JingleSessionPC</tt> is used in
         * a peer to peer type of session.
         * @type {boolean} <tt>true</tt> if it's a peer to peer
         * session or <tt>false</tt> if it's a JVB session
         */
        this.isP2P = isP2P;

        /**
         * Remote preference for the receive video max frame height.
         *
         * @type {Number|undefined}
         */
        this.remoteRecvMaxFrameHeight = undefined;

        /**
         * Remote preference for the receive video max frame heights when source-name signaling is enabled.
         *
         * @type {Map<string, number>|undefined}
         */
        this.remoteSourceMaxFrameHeights = undefined;

        /**
         * The queue used to serialize operations done on the peerconnection.
         *
         * @type {AsyncQueue}
         */
        this.modificationQueue = new AsyncQueue();

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
            connection.addEventListener(
                XmppConnection.Events.CONN_STATUS_CHANGED,
                this.onXmppStatusChanged.bind(this))
        );

        this._removeSenderVideoConstraintsChangeListener = undefined;
    }

    /* eslint-enable max-params */

    /**
     * Checks whether or not this session instance is still operational.
     * @private
     * @returns {boolean} {@code true} if operation or {@code false} otherwise.
     */
    _assertNotEnded() {
        return this.state !== JingleSessionState.ENDED;
    }

    /**
     * @inheritDoc
     * @param {JingleSessionPCOptions} options  - a set of config options.
     */
    doInitialize(options) {
        this.failICE = Boolean(options.failICE);
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

        const pcOptions = { disableRtx: options.disableRtx };

        if (options.gatherStats) {
            pcOptions.maxstats = DEFAULT_MAX_STATS;
        }
        pcOptions.capScreenshareBitrate = false;
        pcOptions.enableInsertableStreams = options.enableInsertableStreams;
        pcOptions.videoQuality = options.videoQuality;
        pcOptions.forceTurnRelay = options.forceTurnRelay;
        pcOptions.audioQuality = options.audioQuality;
        pcOptions.usesUnifiedPlan = this.usesUnifiedPlan
            = browser.supportsUnifiedPlan()
                && (browser.isFirefox()
                    || browser.isWebKitBased()
                    || (browser.isChromiumBased()

                        // Provide a way to control the behavior for jvb and p2p connections independently.
                        && this.isP2P
                        ? options.p2p?.enableUnifiedOnChrome ?? true
                        : options.enableUnifiedOnChrome ?? true));

        if (this.isP2P) {
            // simulcast needs to be disabled for P2P (121) calls
            pcOptions.disableSimulcast = true;
            const abtestSuspendVideo = this._abtestSuspendVideoEnabled(options);

            if (typeof abtestSuspendVideo !== 'undefined') {
                pcOptions.abtestSuspendVideo = abtestSuspendVideo;
            }
        } else {
            // H264 does not support simulcast, so it needs to be disabled.
            pcOptions.disableSimulcast
                = options.disableSimulcast
                    || (options.preferH264 && !options.disableH264)
                    || (options.videoQuality && options.videoQuality.preferredCodec === CodecMimeType.H264);

            // Disable simulcast for low fps screenshare and enable it for high fps screenshare.
            // testing.capScreenshareBitrate config.js setting has now been deprecated.
            pcOptions.capScreenshareBitrate = pcOptions.disableSimulcast
                || !(typeof options.desktopSharingFrameRate?.max === 'number'
                    && options.desktopSharingFrameRate?.max > SS_DEFAULT_FRAME_RATE);

            // add the capScreenshareBitrate to the permanent properties so that it's included with every event that we
            // send to the analytics backend.
            Statistics.analytics.addPermanentProperties({ capScreenshareBitrate: pcOptions.capScreenshareBitrate });
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
                let protocol = candidate.protocol;

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
                    ICE_DURATION,
                    {
                        phase: 'gathering',
                        value: now - this._gatheringStartedTimestamp,
                        p2p: this.isP2P,
                        initiator: this.isInitiator
                    });
                this._gatheringReported = true;
            }
            this.sendIceCandidate(candidate);
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
            logger.log(`(TIME) ICE ${this.peerconnection.iceConnectionState} ${this.isP2P ? 'P2P' : 'JVB'}:\t`, now);

            Statistics.sendAnalytics(
                ICE_STATE_CHANGED,
                {
                    p2p: this.isP2P,
                    state: this.peerconnection.iceConnectionState,
                    'signaling_state': this.peerconnection.signalingState,
                    reconnect: this.isReconnect,
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
                // Informs interested parties that the connection has been restored. This includes the case when
                // media connection to the bridge has been restored after an ICE failure by using session-terminate.
                if (this.peerconnection.signalingState === 'stable') {
                    isStable = true;
                    const usesTerminateForRestart = !this.options.enableIceRestart
                        && this.room.supportsRestartByTerminate();

                    if (this.isReconnect || usesTerminateForRestart) {
                        this.room.eventEmitter.emit(
                            XMPPEvents.CONNECTION_RESTORED, this);
                    }
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
                        || (this.usesUnifiedPlan && this.isInitiator && browser.isChromiumBased()))) {

                    Statistics.sendAnalytics(
                        ICE_DURATION,
                        {
                            phase: 'checking',
                            value: now - this._iceCheckingStartedTimestamp,
                            p2p: this.isP2P,
                            initiator: this.isInitiator
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
                        ICE_DURATION,
                        {
                            phase: 'establishment',
                            value: this.establishmentDuration,
                            p2p: this.isP2P,
                            initiator: this.isInitiator
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

            if (this.usesUnifiedPlan
                && !this.isP2P
                && state === 'stable'
                && remoteDescription
                && typeof remoteDescription.sdp === 'string') {
                logger.info(`${this} onnegotiationneeded fired on ${this.peerconnection}`);

                const workFunction = finishedCallback => {
                    const oldSdp = new SDP(this.peerconnection.localDescription.sdp);

                    this._renegotiate()
                        .then(() => this.peerconnection.configureSenderVideoEncodings())
                        .then(() => {
                            const newSdp = new SDP(this.peerconnection.localDescription.sdp);

                            this.notifyMySSRCUpdate(oldSdp, newSdp);
                        })
                        .then(() => finishedCallback(), error => finishedCallback(error));
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
     * Remote preference for receive video max frame height.
     *
     * @returns {Number|undefined}
     */
    getRemoteRecvMaxFrameHeight() {
        if (this.isP2P) {
            return this.remoteRecvMaxFrameHeight;
        }

        return undefined;
    }

    /**
     * Remote preference for receive video max frame heights when source-name signaling is enabled.
     *
     * @returns {Map<string, number>|undefined}
     */
    getRemoteSourcesRecvMaxFrameHeight() {
        if (this.isP2P) {
            return this.remoteSourceMaxFrameHeights;
        }

        return undefined;
    }

    /**
     * Sends given candidate in Jingle 'transport-info' message.
     * @param {RTCIceCandidate} candidate the WebRTC ICE candidate instance
     * @private
     */
    sendIceCandidate(candidate) {
        const localSDP = new SDP(this.peerconnection.localDescription.sdp);

        if (candidate && candidate.candidate.length && !this.lasticecandidate) {
            const ice = SDPUtil.iceparams(localSDP.media[candidate.sdpMLineIndex], localSDP.session);
            const jcand = SDPUtil.candidateToJingle(candidate.candidate);

            if (!(ice && jcand)) {
                const errorMesssage = 'failed to get ice && jcand';

                GlobalOnErrorHandler.callErrorHandler(new Error(errorMesssage));
                logger.error(errorMesssage);

                return;
            }
            ice.xmlns = 'urn:xmpp:jingle:transports:ice-udp:1';

            if (this.usedrip) {
                if (this.dripContainer.length === 0) {
                    setTimeout(() => {
                        if (this.dripContainer.length === 0) {
                            return;
                        }
                        this.sendIceCandidates(this.dripContainer);
                        this.dripContainer = [];
                    }, ICE_CAND_GATHERING_TIMEOUT);
                }
                this.dripContainer.push(candidate);
            } else {
                this.sendIceCandidates([ candidate ]);
            }
        } else {
            logger.log(`${this} sendIceCandidate: last candidate`);

            // FIXME: remember to re-think in ICE-restart
            this.lasticecandidate = true;
        }
    }

    /**
     * Sends given candidates in Jingle 'transport-info' message.
     * @param {Array<RTCIceCandidate>} candidates an array of the WebRTC ICE
     * candidate instances
     * @private
     */
    sendIceCandidates(candidates) {
        if (!this._assertNotEnded('sendIceCandidates')) {

            return;
        }

        logger.log(`${this} sendIceCandidates ${JSON.stringify(candidates)}`);
        const cand = $iq({ to: this.remoteJid,
            type: 'set' })
            .c('jingle', { xmlns: 'urn:xmpp:jingle:1',
                action: 'transport-info',
                initiator: this.initiatorJid,
                sid: this.sid });

        const localSDP = new SDP(this.peerconnection.localDescription.sdp);

        for (let mid = 0; mid < localSDP.media.length; mid++) {
            const cands = candidates.filter(el => el.sdpMLineIndex === mid);
            const mline
                = SDPUtil.parseMLine(localSDP.media[mid].split('\r\n')[0]);

            if (cands.length > 0) {
                const ice
                    = SDPUtil.iceparams(localSDP.media[mid], localSDP.session);

                ice.xmlns = 'urn:xmpp:jingle:transports:ice-udp:1';
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
        // logger.log('was this the last candidate', this.lasticecandidate);
        this.connection.sendIQ(
            cand, null, this.newJingleErrorHandler(cand), IQ_TIMEOUT);
    }

    /**
     * Sends Jingle 'session-info' message which includes custom Jitsi Meet
     * 'ice-state' element with the text value 'failed' to let Jicofo know
     * that the ICE connection has entered the failed state. It can then
     * choose to re-create JVB channels and send 'transport-replace' to
     * retry the connection.
     */
    sendIceFailedNotification() {
        const sessionInfo
            = $iq({
                to: this.remoteJid,
                type: 'set' })
            .c('jingle', { xmlns: 'urn:xmpp:jingle:1',
                action: 'session-info',
                initiator: this.initiatorJid,
                sid: this.sid })
            .c('ice-state', { xmlns: 'http://jitsi.org/protocol/focus' })
            .t('failed')
            .up();

        this._bridgeSessionId
            && sessionInfo.c(
                'bridge-session', {
                    xmlns: 'http://jitsi.org/protocol/focus',
                    id: this._bridgeSessionId
                });

        this.connection.sendIQ2(
            sessionInfo, {
                /*
                 * This message will be often sent when there are connectivity
                 * issues, so make it slightly longer than Prosody's default BOSH
                 * inactivity timeout of 60 seconds.
                 */
                timeout: 65
            })
            .catch(this.newJingleErrorHandler(sessionInfo));
    }

    /**
     * {@inheritDoc}
     */
    addIceCandidates(elem) {
        if (this.peerconnection.signalingState === 'closed') {
            logger.warn(`${this} Ignored add ICE candidate when in closed state`);

            return;
        }

        const iceCandidates = [];

        elem.find('>content>transport>candidate')
            .each((idx, candidate) => {
                let line = SDPUtil.candidateFromJingle(candidate);

                line = line.replace('\r\n', '').replace('a=', '');

                // FIXME this code does not care to handle
                // non-bundle transport
                const rtcCandidate = new RTCIceCandidate({
                    sdpMLineIndex: 0,

                    // FF comes up with more complex names like audio-23423,
                    // Given that it works on both Chrome and FF without
                    // providing it, let's leave it like this for the time
                    // being...
                    // sdpMid: 'audio',
                    sdpMid: '',
                    candidate: line
                });

                iceCandidates.push(rtcCandidate);
            });

        if (!iceCandidates.length) {
            logger.error(`${this} No ICE candidates to add ?`, elem[0] && elem[0].outerHTML);

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
     *
     * @param contents
     */
    readSsrcInfo(contents) {
        const ssrcs = $(contents).find('>description>source[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]');

        ssrcs.each((i, ssrcElement) => {
            const ssrc = Number(ssrcElement.getAttribute('ssrc'));

            if (FeatureFlags.isSourceNameSignalingEnabled()) {
                if (ssrcElement.hasAttribute('name')) {
                    const sourceName = ssrcElement.getAttribute('name');

                    this._signalingLayer.setTrackSourceName(ssrc, sourceName);
                }
            }

            if (this.isP2P) {
                // In P2P all SSRCs are owner by the remote peer
                this._signalingLayer.setSSRCOwner(ssrc, Strophe.getResourceFromJid(this.remoteJid));
            } else {
                $(ssrcElement)
                    .find('>ssrc-info[xmlns="http://jitsi.org/jitmeet"]')
                    .each((i3, ssrcInfoElement) => {
                        const owner = ssrcInfoElement.getAttribute('owner');

                        if (owner?.length) {
                            if (isNaN(ssrc) || ssrc < 0) {
                                logger.warn(`${this} Invalid SSRC ${ssrc} value received for ${owner}`);
                            } else {
                                this._signalingLayer.setSSRCOwner(ssrc, getEndpointId(owner));
                            }
                        }
                    });
            }
        });
    }

    /**
     * Makes the underlying TraceablePeerConnection generate new SSRC for
     * the recvonly video stream.
     * @deprecated
     */
    generateRecvonlySsrc() {
        if (this.peerconnection) {
            this.peerconnection.generateRecvonlySsrc();
        } else {
            logger.error(`${this} Unable to generate recvonly SSRC - no peerconnection`);
        }
    }

    /**
     * Returns the video codec configured as the preferred codec on the peerconnection.
     */
    getConfiguredVideoCodec() {
        return this.peerconnection.getConfiguredVideoCodec();
    }

    /* eslint-disable max-params */
    /**
     * Accepts incoming Jingle 'session-initiate' and should send
     * 'session-accept' in result.
     * @param jingleOffer jQuery selector pointing to the jingle element of
     * the offer IQ
     * @param success callback called when we accept incoming session
     * successfully and receive RESULT packet to 'session-accept' sent.
     * @param failure function(error) called if for any reason we fail to accept
     * the incoming offer. 'error' argument can be used to log some details
     * about the error.
     * @param {Array<JitsiLocalTrack>} [localTracks] the optional list of
     * the local tracks that will be added, before the offer/answer cycle
     * executes. We allow the localTracks to optionally be passed in so that
     * the addition of the local tracks and the processing of the initial offer
     * can all be done atomically. We want to make sure that any other
     * operations which originate in the XMPP Jingle messages related with
     * this session to be executed with an assumption that the initial
     * offer/answer cycle has been executed already.
     */
    acceptOffer(jingleOffer, success, failure, localTracks) {
        this.setOfferAnswerCycle(
            jingleOffer,
            () => {
                // FIXME we may not care about RESULT packet for session-accept
                // then we should either call 'success' here immediately or
                // modify sendSessionAccept method to do that
                this.sendSessionAccept(() => {
                    success();
                    this.room.eventEmitter.emit(XMPPEvents.SESSION_ACCEPT, this);

                    // The first video track is added to the peerconnection and signaled as part of the session-accept.
                    // Add secondary video tracks (that were already added to conference) to the peerconnection here.
                    // This will happen when someone shares a secondary source to a two people call, the other user
                    // leaves and joins the call again, a new peerconnection is created for p2p/jvb connection. At this
                    // point, there are 2 video tracks which need to be signaled to the remote peer.
                    const videoTracks = localTracks.filter(track => track.getType() === MediaType.VIDEO);

                    videoTracks.length && videoTracks.splice(0, 1);
                    if (FeatureFlags.isMultiStreamSupportEnabled() && videoTracks.length) {
                        this.addTracks(videoTracks);
                    }
                },
                error => {
                    failure(error);
                    this.room.eventEmitter.emit(XMPPEvents.SESSION_ACCEPT_ERROR, this, error);
                });
            },
            failure,
            localTracks);
    }

    /* eslint-enable max-params */

    /**
     * Creates an offer and sends Jingle 'session-initiate' to the remote peer.
     * @param {Array<JitsiLocalTrack>} localTracks the local tracks that will be
     * added, before the offer/answer cycle executes (for the local track
     * addition to be an atomic operation together with the offer/answer).
     */
    invite(localTracks = []) {
        if (!this.isInitiator) {
            throw new Error('Trying to invite from the responder session');
        }
        const workFunction = finishedCallback => {
            const addTracks = [];

            for (const track of localTracks) {
                addTracks.push(this.peerconnection.addTrack(track, this.isInitiator));
            }

            Promise.all(addTracks)
                .then(() => this.peerconnection.createOffer(this.mediaConstraints))
                .then(offerSdp => this.peerconnection.setLocalDescription(offerSdp))
                .then(() => {
                    // NOTE that the offer is obtained from the localDescription getter as it needs to go though
                    // the transformation chain.
                    this.sendSessionInitiate(this.peerconnection.localDescription.sdp);
                })
                .then(() => finishedCallback(), error => finishedCallback(error));
        };

        logger.debug(`${this} Queued invite task`);
        this.modificationQueue.push(
            workFunction,
            error => {
                if (error) {
                    logger.error(`${this} invite error`, error);
                } else {
                    logger.debug(`${this} invite executed - OK`);
                }
            });
    }

    /**
     * Sends 'session-initiate' to the remote peer.
     *
     * NOTE this method is synchronous and we're not waiting for the RESULT
     * response which would delay the startup process.
     *
     * @param {string} offerSdp  - The local session description which will be
     * used to generate an offer.
     * @private
     */
    sendSessionInitiate(offerSdp) {
        let init = $iq({
            to: this.remoteJid,
            type: 'set'
        }).c('jingle', {
            xmlns: 'urn:xmpp:jingle:1',
            action: 'session-initiate',
            initiator: this.initiatorJid,
            sid: this.sid
        });

        new SDP(offerSdp).toJingle(
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
     * Sets the answer received from the remote peer.
     * @param jingleAnswer
     */
    setAnswer(jingleAnswer) {
        if (!this.isInitiator) {
            throw new Error('Trying to set an answer on the responder session');
        }
        this.setOfferAnswerCycle(
            jingleAnswer,
            () => {
                logger.info(`${this} setAnswer - succeeded`);
                if (this.usesUnifiedPlan && browser.isChromiumBased()) {
                    const workFunction = finishedCallback => {
                        // This hack is needed for Chrome to create a decoder for the ssrcs in the remote SDP when
                        // the local endpoint is the offerer and starts muted.
                        const remoteSdp = this.peerconnection.remoteDescription.sdp;
                        const remoteDescription = new RTCSessionDescription({
                            type: 'offer',
                            sdp: remoteSdp
                        });

                        return this._responderRenegotiate(remoteDescription)
                        .then(() => finishedCallback(), error => finishedCallback(error));
                    };

                    logger.debug(`${this} Queued responderRenegotiate task`);
                    this.modificationQueue.push(
                        workFunction,
                        error => {
                            if (error) {
                                logger.error(`${this} failed to renegotiate a decoder for muted endpoint ${error}`);
                            } else {
                                logger.debug(`${this} renegotiate a decoder for muted endpoint`);
                            }
                        });
                }
            },
            error => {
                logger.error(`${this} setAnswer failed: `, error);
            });
    }

    /* eslint-disable max-params */
    /**
     * This is a setRemoteDescription/setLocalDescription cycle which starts at
     * converting Strophe Jingle IQ into remote offer SDP. Once converted
     * setRemoteDescription, createAnswer and setLocalDescription calls follow.
     * @param jingleOfferAnswerIq jQuery selector pointing to the jingle element
     *        of the offer (or answer) IQ
     * @param success callback called when sRD/sLD cycle finishes successfully.
     * @param failure callback called with an error object as an argument if we
     *        fail at any point during setRD, createAnswer, setLD.
     * @param {Array<JitsiLocalTrack>} [localTracks] the optional list of
     * the local tracks that will be added, before the offer/answer cycle
     * executes (for the local track addition to be an atomic operation together
     * with the offer/answer).
     */
    setOfferAnswerCycle(jingleOfferAnswerIq, success, failure, localTracks = []) {
        const workFunction = finishedCallback => {
            const addTracks = [];
            const audioTracks = localTracks.filter(track => track.getType() === MediaType.AUDIO);
            const videoTracks = localTracks.filter(track => track.getType() === MediaType.VIDEO);
            let tracks = localTracks;

            // Add only 1 video track at a time. Adding 2 or more video tracks to the peerconnection at the same time
            // makes the browser go into a renegotiation loop by firing 'negotiationneeded' event after every
            // renegotiation.
            if (FeatureFlags.isMultiStreamSupportEnabled() && videoTracks.length > 1) {
                tracks = [ ...audioTracks, videoTracks[0] ];
            }
            for (const track of tracks) {
                addTracks.push(this.peerconnection.addTrack(track, this.isInitiator));
            }
            const newRemoteSdp = this._processNewJingleOfferIq(jingleOfferAnswerIq);
            const oldLocalSdp = this.peerconnection.localDescription.sdp;

            const bridgeSession
                = $(jingleOfferAnswerIq)
                    .find('>bridge-session['
                        + 'xmlns="http://jitsi.org/protocol/focus"]');
            const bridgeSessionId = bridgeSession.attr('id');

            if (bridgeSessionId !== this._bridgeSessionId) {
                this._bridgeSessionId = bridgeSessionId;
            }

            Promise.all(addTracks)
                .then(() => this._renegotiate(newRemoteSdp.raw))
                .then(() => {
                    if (this.state === JingleSessionState.PENDING) {
                        this.state = JingleSessionState.ACTIVE;

                        // #1 Sync up video transfer active/inactive only after the initial O/A cycle. We want to
                        // adjust the video media direction only in the local SDP and the Jingle contents direction
                        // included in the initial offer/answer is mapped to the remote SDP. Jingle 'content-modify'
                        // IQ is processed in a way that it will only modify local SDP when remote peer is no longer
                        // interested in receiving video content. Changing media direction in the remote SDP will mess
                        // up our SDP translation chain (simulcast, video mute, RTX etc.)
                        // #2 Sends the max frame height if it was set, before the session-initiate/accept
                        if (this.isP2P
                            && (!this._localVideoActive
                                || this.localRecvMaxFrameHeight
                                || this._sourceReceiverConstraints)) {
                            this.sendContentModify();
                        }
                    }

                    // Old local SDP will be available when we're setting answer for the first time, but not when offer
                    // and it's fine since we're generating an answer now it will contain all our SSRCs.
                    if (oldLocalSdp) {
                        const newLocalSdp = new SDP(this.peerconnection.localDescription.sdp);

                        this.notifyMySSRCUpdate(new SDP(oldLocalSdp), newLocalSdp);
                    }
                })
                .then(() => finishedCallback(), error => finishedCallback(error));
        };

        logger.debug(`${this} Queued setOfferAnswerCycle task`);
        this.modificationQueue.push(
            workFunction,
            error => {
                if (error) {
                    logger.error(`${this} setOfferAnswerCycle task failed: ${error}`);
                    failure(error);
                } else {
                    logger.debug(`${this} setOfferAnswerCycle task done`);
                    success();
                }
            });
    }

    /**
     * Updates the codecs on the peerconnection and initiates a renegotiation for the
     * new codec config to take effect.
     *
     * @param {CodecMimeType} preferred the preferred codec.
     * @param {CodecMimeType} disabled the codec that needs to be disabled.
     */
    setVideoCodecs(preferred = null, disabled = null) {
        const current = this.peerconnection.getConfiguredVideoCodec();

        if (this._assertNotEnded() && preferred !== current) {
            logger.info(`${this} Switching video codec from ${current} to ${preferred}`);
            this.peerconnection.setVideoCodecs(preferred, disabled);

            // Initiate a renegotiate for the codec setting to take effect.
            const workFunction = finishedCallback => {
                this._renegotiate().then(
                    () => {
                        logger.debug(`${this} setVideoCodecs task is done`);

                        return finishedCallback();
                    }, error => {
                        logger.error(`${this} setVideoCodecs task failed: ${error}`);

                        return finishedCallback(error);
                    });
            };

            logger.debug(`${this} Queued setVideoCodecs task`);

            // Queue and execute
            this.modificationQueue.push(workFunction);
        }
    }

    /* eslint-enable max-params */

    /**
     * Although it states "replace transport" it does accept full Jingle offer
     * which should contain new ICE transport details.
     * @param jingleOfferElem an element Jingle IQ that contains new offer and
     *        transport info.
     * @param success callback called when we succeed to accept new offer.
     * @param failure function(error) called when we fail to accept new offer.
     */
    replaceTransport(jingleOfferElem, success, failure) {
        if (this.options.enableForcedReload) {
            const sdp = new SDP(this.peerconnection.localDescription.sdp);

            this.sendTransportAccept(sdp, success, failure);
            this.room.eventEmitter.emit(XMPPEvents.CONNECTION_RESTARTED, this);

            return;
        }
        this.room.eventEmitter.emit(XMPPEvents.ICE_RESTARTING, this);

        // We need to first reject the 'data' section to have the SCTP stack
        // cleaned up to signal the known data channel is now invalid. After
        // that the original offer is set to have the SCTP connection
        // established with the new bridge.
        const originalOffer = jingleOfferElem.clone();

        jingleOfferElem
            .find('>content[name=\'data\']')
            .attr('senders', 'rejected');

        // Remove all remote sources in order to reset the client's state
        // for the remote MediaStreams. When a conference is moved to
        // another bridge it will start streaming with a sequence number
        // that is not in sync with the most recently seen by the client.
        // The symptoms include frozen or black video and lots of "failed to
        // unprotect SRTP packets" in Chrome logs.
        jingleOfferElem
            .find('>content>description>source')
            .remove();
        jingleOfferElem
            .find('>content>description>ssrc-group')
            .remove();

        // On the JVB it's not a real ICE restart and all layers are re-initialized from scratch as Jicofo does
        // the restart by re-allocating new channels. Chrome (or WebRTC stack) needs to have the DTLS transport layer
        // reset to start a new handshake with fresh DTLS transport on the bridge. Make it think that the DTLS
        // fingerprint has changed by setting an all zeros key.
        const newFingerprint = jingleOfferElem.find('>content>transport>fingerprint');

        newFingerprint.attr('hash', 'sha-1');
        newFingerprint.text('00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00');

        // First set an offer with a rejected 'data' section
        this.setOfferAnswerCycle(
            jingleOfferElem,
            () => {
                // Now set the original offer(with the 'data' section)
                this.setOfferAnswerCycle(
                    originalOffer,
                    () => {
                        const localSDP
                            = new SDP(this.peerconnection.localDescription.sdp);

                        this.sendTransportAccept(localSDP, success, failure);

                        this.room.eventEmitter.emit(
                            XMPPEvents.ICE_RESTART_SUCCESS,
                            this,
                            originalOffer);
                    },
                    failure);
            },
            failure
        );
    }

    /**
     * Sends Jingle 'session-accept' message.
     * @param {function()} success callback called when we receive 'RESULT'
     *        packet for the 'session-accept'
     * @param {function(error)} failure called when we receive an error response
     *        or when the request has timed out.
     * @private
     */
    sendSessionAccept(success, failure) {
        // NOTE: since we're just reading from it, we don't need to be within
        //  the modification queue to access the local description
        const localSDP = new SDP(this.peerconnection.localDescription.sdp);
        const accept = $iq({ to: this.remoteJid,
            type: 'set' })
            .c('jingle', { xmlns: 'urn:xmpp:jingle:1',
                action: 'session-accept',
                initiator: this.initiatorJid,
                responder: this.responderJid,
                sid: this.sid });

        if (this.webrtcIceTcpDisable) {
            localSDP.removeTcpCandidates = true;
        }
        if (this.webrtcIceUdpDisable) {
            localSDP.removeUdpCandidates = true;
        }
        if (this.failICE) {
            localSDP.failICE = true;
        }
        localSDP.toJingle(
            accept,
            this.initiatorJid === this.localJid ? 'initiator' : 'responder');

        logger.info(`${this} Sending session-accept`);
        logger.debug(accept.tree());
        this.connection.sendIQ(accept,
            success,
            this.newJingleErrorHandler(accept, error => {
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
     * Will send 'content-modify' IQ in order to ask the remote peer to
     * either stop or resume sending video media or to adjust sender's video constraints.
     * @private
     */
    sendContentModify() {
        const maxFrameHeight = this.localRecvMaxFrameHeight;
        const senders = this._localVideoActive ? 'both' : 'none';

        let sessionModify
            = $iq({
                to: this.remoteJid,
                type: 'set'
            })
                .c('jingle', {
                    xmlns: 'urn:xmpp:jingle:1',
                    action: 'content-modify',
                    initiator: this.initiatorJid,
                    sid: this.sid
                })
                .c('content', {
                    name: MediaType.VIDEO,
                    senders
                });

        if (typeof maxFrameHeight !== 'undefined') {
            sessionModify = sessionModify
                .c('max-frame-height', { xmlns: 'http://jitsi.org/jitmeet/video' })
                .t(maxFrameHeight);
            logger.info(`${this} sending content-modify, video senders: ${senders},`
                + ` max frame height: ${maxFrameHeight}`);
        }

        if (typeof this._sourceReceiverConstraints !== 'undefined') {
            this._sourceReceiverConstraints.forEach((maxHeight, sourceName) => {
                sessionModify
                    .c('source-frame-height', { xmlns: 'http://jitsi.org/jitmeet/video' })
                    .attrs({
                        sourceName,
                        maxHeight
                    });

                sessionModify.up();
                logger.info(`${this} sending content-modify for source-name: ${sourceName}, maxHeight: ${maxHeight}`);
            });
        }

        logger.debug(sessionModify.tree());

        this.connection.sendIQ(
            sessionModify,
            null,
            this.newJingleErrorHandler(sessionModify),
            IQ_TIMEOUT);
    }

    /**
     * Adjust the preference for max video frame height that the local party is willing to receive. Signals
     * the remote party.
     *
     * @param {Number} maxFrameHeight - the new value to set.
     * @param {Map<string, number>} sourceReceiverConstraints - The receiver constraints per source.
     */
    setReceiverVideoConstraint(maxFrameHeight, sourceReceiverConstraints) {
        logger.info(`${this} setReceiverVideoConstraint - max frame height: ${maxFrameHeight}`
            + ` sourceReceiverConstraints: ${sourceReceiverConstraints}`);

        if (FeatureFlags.isSourceNameSignalingEnabled()) {
            this._sourceReceiverConstraints = sourceReceiverConstraints;
        } else {
            this.localRecvMaxFrameHeight = maxFrameHeight;
        }

        if (this.isP2P) {
            // Tell the remote peer about our receive constraint. If Jingle session is not yet active the state will
            // be synced after offer/answer.
            if (this.state === JingleSessionState.ACTIVE) {
                this.sendContentModify();
            }
        }
    }

    /**
     * Sends Jingle 'transport-accept' message which is a response to
     * 'transport-replace'.
     * @param localSDP the 'SDP' object with local session description
     * @param success callback called when we receive 'RESULT' packet for
     *        'transport-replace'
     * @param failure function(error) called when we receive an error response
     *        or when the request has timed out.
     * @private
     */
    sendTransportAccept(localSDP, success, failure) {
        const transportAccept = $iq({ to: this.remoteJid,
            type: 'set' })
            .c('jingle', {
                xmlns: 'urn:xmpp:jingle:1',
                action: 'transport-accept',
                initiator: this.initiatorJid,
                sid: this.sid
            });

        localSDP.media.forEach((medialines, idx) => {
            const mline = SDPUtil.parseMLine(medialines.split('\r\n')[0]);

            transportAccept.c('content',
                {
                    creator:
                        this.initiatorJid === this.localJid
                            ? 'initiator'
                            : 'responder',
                    name: mline.media
                }
            );
            localSDP.transportToJingle(idx, transportAccept);
            transportAccept.up();
        });

        logger.info(`${this} Sending transport-accept`);
        logger.debug(transportAccept.tree());

        this.connection.sendIQ(transportAccept,
            success,
            this.newJingleErrorHandler(transportAccept, failure),
            IQ_TIMEOUT);
    }

    /**
     * Sends Jingle 'transport-reject' message which is a response to
     * 'transport-replace'.
     * @param success callback called when we receive 'RESULT' packet for
     *        'transport-replace'
     * @param failure function(error) called when we receive an error response
     *        or when the request has timed out.
     *
     * FIXME method should be marked as private, but there's some spaghetti that
     *       needs to be fixed prior doing that
     */
    sendTransportReject(success, failure) {
        // Send 'transport-reject', so that the focus will
        // know that we've failed
        const transportReject = $iq({ to: this.remoteJid,
            type: 'set' })
            .c('jingle', {
                xmlns: 'urn:xmpp:jingle:1',
                action: 'transport-reject',
                initiator: this.initiatorJid,
                sid: this.sid
            });

        logger.info(`${this} Sending 'transport-reject'`);
        logger.debug(transportReject.tree());

        this.connection.sendIQ(transportReject,
            success,
            this.newJingleErrorHandler(transportReject, failure),
            IQ_TIMEOUT);
    }

    /**
     * Sets the resolution constraint on the local camera track.
     * @param {number} maxFrameHeight - The user preferred max frame height.
     * @param {string} sourceName - The source name of the track.
     * @returns {Promise} promise that will be resolved when the operation is
     * successful and rejected otherwise.
     */
    setSenderVideoConstraint(maxFrameHeight, sourceName = null) {
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
     * @inheritDoc
     */
    terminate(success, failure, options) {
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
                        xmlns: 'urn:xmpp:jingle:1',
                        action: 'session-terminate',
                        initiator: this.initiatorJid,
                        sid: this.sid
                    })
                    .c('reason')
                    .c((options && options.reason) || 'success')
                    .up();

            if (options && options.reasonDescription) {
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
                        xmlns: 'http://jitsi.org/protocol/focus',
                        id: this._bridgeSessionId,
                        restart: options && options.requestRestart === true
                    }).up();

            logger.info(`${this} Sending session-terminate`);
            logger.debug(sessionTerminate.tree());

            this.connection.sendIQ(
                sessionTerminate,
                success,
                this.newJingleErrorHandler(sessionTerminate, failure),
                IQ_TIMEOUT);
        } else {
            logger.info(`${this} Skipped sending session-terminate`);
        }

        // this should result in 'onTerminated' being called by strope.jingle.js
        this.connection.jingle.terminate(this.sid);
    }

    /**
     *
     * @param reasonCondition
     * @param reasonText
     */
    onTerminated(reasonCondition, reasonText) {
        // Do something with reason and reasonCondition when we start to care
        // this.reasonCondition = reasonCondition;
        // this.reasonText = reasonText;
        logger.info(`${this} Session terminated`, reasonCondition, reasonText);

        this._xmppListeners.forEach(removeListener => removeListener());
        this._xmppListeners = [];

        if (this._removeSenderVideoConstraintsChangeListener) {
            this._removeSenderVideoConstraintsChangeListener();
        }

        this.close();
    }

    /**
     * Handles XMPP connection state changes.
     *
     * @param {XmppConnection.Status} status - The new status.
     */
    onXmppStatusChanged(status) {
        if (status === XmppConnection.Status.CONNECTED && this._cachedOldLocalSdp) {
            logger.info(`${this} Sending SSRC update on reconnect`);
            this.notifyMySSRCUpdate(
                this._cachedOldLocalSdp,
                this._cachedNewLocalSdp);
        }
    }

    /**
     * Parse the information from the xml sourceAddElem and translate it
     *  into sdp lines
     * @param {jquery xml element} sourceAddElem the source-add
     *  element from jingle
     * @param {SDP object} currentRemoteSdp the current remote
     *  sdp (as of this new source-add)
     * @returns {list} a list of SDP line strings that should
     *  be added to the remote SDP
     */
    _parseSsrcInfoFromSourceAdd(sourceAddElem, currentRemoteSdp) {
        const addSsrcInfo = [];
        const self = this;

        $(sourceAddElem).each((i1, content) => {
            const name = $(content).attr('name');
            let lines = '';

            $(content)
                .find('ssrc-group[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]')
                .each(function() {
                    // eslint-disable-next-line no-invalid-this
                    const semantics = this.getAttribute('semantics');
                    const ssrcs
                        = $(this) // eslint-disable-line no-invalid-this
                            .find('>source')
                            .map(function() {
                                // eslint-disable-next-line no-invalid-this
                                return this.getAttribute('ssrc');
                            })
                            .get();

                    if (ssrcs.length) {
                        lines += `a=ssrc-group:${semantics} ${ssrcs.join(' ')}\r\n`;
                    }
                });

            // handles both >source and >description>source
            const tmp
                = $(content).find(
                    'source[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]');

            /* eslint-disable no-invalid-this */
            tmp.each(function() {
                const ssrc = $(this).attr('ssrc');

                if (currentRemoteSdp.containsSSRC(ssrc)) {

                    // Do not print the warning for unified plan p2p case since ssrcs are never removed from the SDP.
                    !(self.usesUnifiedPlan && self.isP2P)
                        && logger.warn(`${self} Source-add request for existing SSRC: ${ssrc}`);

                    return;
                }

                // eslint-disable-next-line newline-per-chained-call
                $(this).find('>parameter').each(function() {
                    lines += `a=ssrc:${ssrc} ${$(this).attr('name')}`;
                    if ($(this).attr('value') && $(this).attr('value').length) {
                        lines += `:${$(this).attr('value')}`;
                    }
                    lines += '\r\n';
                });
            });

            let midFound = false;

            /* eslint-enable no-invalid-this */
            currentRemoteSdp.media.forEach((media, i2) => {
                if (!SDPUtil.findLine(media, `a=mid:${name}`)) {
                    return;
                }
                if (!addSsrcInfo[i2]) {
                    addSsrcInfo[i2] = '';
                }
                addSsrcInfo[i2] += lines;
                midFound = true;
            });

            // In p2p unified mode with multi-stream enabled, the new sources will have content name that doesn't exist
            // in the current remote description. Add a new m-line for this newly signaled source.
            if (!midFound && this.isP2P && FeatureFlags.isSourceNameSignalingEnabled()) {
                addSsrcInfo[name] = lines;
            }
        });

        return addSsrcInfo;
    }

    /**
     * Handles a Jingle source-add message for this Jingle session.
     * @param elem An array of Jingle "content" elements.
     */
    addRemoteStream(elem) {
        this._addOrRemoveRemoteStream(true /* add */, elem);
    }

    /**
     * Handles a Jingle source-remove message for this Jingle session.
     * @param elem An array of Jingle "content" elements.
     */
    removeRemoteStream(elem) {
        this._addOrRemoveRemoteStream(false /* remove */, elem);
    }

    /**
     * Handles the deletion of SSRCs associated with a remote user from the remote description when the user leaves.
     *
     * @param {string} id Endpoint id of the participant that has left the call.
     * @returns {void}
     */
    removeRemoteStreamsOnLeave(id) {
        const workFunction = finishCallback => {
            const removeSsrcInfo = this.peerconnection.getRemoteSourceInfoByParticipant(id);

            if (removeSsrcInfo.length) {
                const oldLocalSdp = new SDP(this.peerconnection.localDescription.sdp);
                const newRemoteSdp = this._processRemoteRemoveSource(removeSsrcInfo);

                this._renegotiate(newRemoteSdp.raw)
                    .then(() => {
                        const newLocalSDP = new SDP(this.peerconnection.localDescription.sdp);

                        this.notifyMySSRCUpdate(oldLocalSdp, newLocalSDP);
                        finishCallback();
                    })
                    .catch(err => finishCallback(err));
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
     * Handles either Jingle 'source-add' or 'source-remove' message for this
     * Jingle session.
     * @param {boolean} isAdd <tt>true</tt> for 'source-add' or <tt>false</tt>
     * otherwise.
     * @param {Array<Element>} elem an array of Jingle "content" elements.
     * @private
     */
    _addOrRemoveRemoteStream(isAdd, elem) {
        const logPrefix = isAdd ? 'addRemoteStream' : 'removeRemoteStream';

        if (isAdd) {
            this.readSsrcInfo(elem);
        }

        const workFunction = finishedCallback => {
            if (!this.peerconnection.localDescription
                || !this.peerconnection.localDescription.sdp) {
                const errMsg = `${logPrefix} - localDescription not ready yet`;

                logger.error(errMsg);
                finishedCallback(errMsg);

                return;
            }

            logger.log(`${this} Processing ${logPrefix}`);

            const oldLocalSdp = new SDP(this.peerconnection.localDescription.sdp);
            const sdp = new SDP(this.peerconnection.remoteDescription.sdp);
            const addOrRemoveSsrcInfo
                = isAdd
                    ? this._parseSsrcInfoFromSourceAdd(elem, sdp)
                    : this._parseSsrcInfoFromSourceRemove(elem, sdp);
            const newRemoteSdp
                = isAdd
                    ? this._processRemoteAddSource(addOrRemoveSsrcInfo)
                    : this._processRemoteRemoveSource(addOrRemoveSsrcInfo);

            // Add a workaround for a bug in Chrome (unified plan) for p2p connection. When the media direction on
            // the transceiver goes from "inactive" (both users join muted) to "recvonly" (peer unmutes), the browser
            // doesn't seem to create a decoder if the signaling state changes from "have-local-offer" to "stable".
            // Therefore, initiate a responder renegotiate even if the endpoint is the offerer to workaround this issue.
            // TODO - open a chrome bug and update the comments.
            const remoteDescription = new RTCSessionDescription({
                type: 'offer',
                sdp: newRemoteSdp.raw
            });
            const promise = isAdd && this.usesUnifiedPlan && this.isP2P && browser.isChromiumBased()
                ? this._responderRenegotiate(remoteDescription)
                : this._renegotiate(newRemoteSdp.raw);

            promise.then(() => {
                const newLocalSdp = new SDP(this.peerconnection.localDescription.sdp);

                logger.log(`${this} ${logPrefix} - OK`);
                this.notifyMySSRCUpdate(oldLocalSdp, newLocalSdp);
                finishedCallback();
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
     * Takes in a jingle offer iq, returns the new sdp offer
     * @param {jquery xml element} offerIq the incoming offer
     * @returns {SDP object} the jingle offer translated to SDP
     */
    _processNewJingleOfferIq(offerIq) {
        const remoteSdp = new SDP('');

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
        this.readSsrcInfo($(offerIq).find('>content'));

        return remoteSdp;
    }

    /**
     * Remove the given ssrc lines from the current remote sdp
     * @param {list} removeSsrcInfo a list of SDP line strings that
     *  should be removed from the remote SDP
     * @returns type {SDP Object} the new remote SDP (after removing the lines
     *  in removeSsrcInfo
     */
    _processRemoteRemoveSource(removeSsrcInfo) {
        const remoteSdp = this.usesUnifiedPlan
            ? new SDP(this.peerconnection.peerconnection.remoteDescription.sdp)
            : new SDP(this.peerconnection.remoteDescription.sdp);

        removeSsrcInfo.forEach((lines, idx) => {
            // eslint-disable-next-line no-param-reassign
            lines = lines.split('\r\n');
            lines.pop(); // remove empty last element;
            if (this.usesUnifiedPlan) {
                let mid;

                lines.forEach(line => {
                    mid = remoteSdp.media.findIndex(mLine => mLine.includes(line));

                    if (mid > -1) {
                        remoteSdp.media[mid] = remoteSdp.media[mid].replace(`${line}\r\n`, '');
                        if (this.isP2P) {
                            const mediaType = SDPUtil.parseMLine(remoteSdp.media[mid].split('\r\n')[0])?.media;
                            const desiredDirection = this.peerconnection.getDesiredMediaDirection(mediaType, false);

                            [ MediaDirection.SENDRECV, MediaDirection.SENDONLY ].forEach(direction => {
                                remoteSdp.media[mid] = remoteSdp.media[mid]
                                    .replace(`a=${direction}`, `a=${desiredDirection}`);
                            });
                        } else {
                            // Jvb connections will have direction set to 'sendonly' for the remote sources.
                            remoteSdp.media[mid] = remoteSdp.media[mid]
                                .replace(`a=${MediaDirection.SENDONLY}`, `a=${MediaDirection.INACTIVE}`);
                        }
                    }
                });

                // Reject the m-line so that the browser removes the associated transceiver from the list of available
                // transceivers. This will prevent the client from trying to re-use these inactive transceivers when
                // additional video sources are added to the peerconnection.
                if (mid > -1 && !this.isP2P && FeatureFlags.isMultiStreamSupportEnabled()) {
                    const { media, port } = SDPUtil.parseMLine(remoteSdp.media[mid].split('\r\n')[0]);

                    remoteSdp.media[mid] = remoteSdp.media[mid].replace(`m=${media} ${port}`, `m=${media} 0`);
                }
            } else {
                lines.forEach(line => {
                    remoteSdp.media[idx] = remoteSdp.media[idx].replace(`${line}\r\n`, '');
                });
            }
        });
        remoteSdp.raw = remoteSdp.session + remoteSdp.media.join('');

        return remoteSdp;
    }

    /**
     * Add the given ssrc lines to the current remote sdp
     * @param {list} addSsrcInfo a list of SDP line strings that
     *  should be added to the remote SDP
     * @returns type {SDP Object} the new remote SDP (after removing the lines
     *  in removeSsrcInfo
     */
    _processRemoteAddSource(addSsrcInfo) {
        let remoteSdp = new SDP(this.peerconnection.remoteDescription.sdp);

        // Add a new m-line in the remote description if the source info for a secondary video source is recceived from
        // the remote p2p peer when multi-stream support is enabled.
        if (addSsrcInfo.length > remoteSdp.media.length
            && FeatureFlags.isSourceNameSignalingEnabled()
            && this.isP2P
            && this.usesUnifiedPlan) {
            remoteSdp.addMlineForNewLocalSource(MediaType.VIDEO);
            remoteSdp = new SDP(remoteSdp.raw);
        }
        addSsrcInfo.forEach((lines, idx) => {
            remoteSdp.media[idx] += lines;

            // Make sure to change the direction to 'sendrecv/sendonly' only for p2p connections. For jvb connections,
            // a new m-line is added for the new remote sources.
            if (this.isP2P && this.usesUnifiedPlan) {
                const mediaType = SDPUtil.parseMLine(remoteSdp.media[idx].split('\r\n')[0])?.media;
                const desiredDirection = this.peerconnection.getDesiredMediaDirection(mediaType, true);

                [ MediaDirection.RECVONLY, MediaDirection.INACTIVE ].forEach(direction => {
                    remoteSdp.media[idx] = remoteSdp.media[idx]
                        .replace(`a=${direction}`, `a=${desiredDirection}`);
                });
            }
        });
        remoteSdp.raw = remoteSdp.session + remoteSdp.media.join('');

        return remoteSdp;
    }

    /**
     * Do a new o/a flow using the existing remote description
     * @param {string} [optionalRemoteSdp] optional, raw remote sdp
     *  to use.  If not provided, the remote sdp from the
     *  peerconnection will be used
     * @returns {Promise} promise which resolves when the
     *  o/a flow is complete with no arguments or
     *  rejects with an error {string}
     */
    _renegotiate(optionalRemoteSdp) {
        if (this.peerconnection.signalingState === 'closed') {
            const error = new Error('Attempted to renegotiate in state closed');

            this.room.eventEmitter.emit(XMPPEvents.RENEGOTIATION_FAILED, error, this);

            return Promise.reject(error);
        }

        const remoteSdp
            = optionalRemoteSdp || this.peerconnection.remoteDescription.sdp;

        if (!remoteSdp) {
            const error = new Error(`Can not renegotiate without remote description, current state: ${this.state}`);

            this.room.eventEmitter.emit(XMPPEvents.RENEGOTIATION_FAILED, error, this);

            return Promise.reject(error);
        }

        const remoteDescription = new RTCSessionDescription({
            type: this.isInitiator ? 'answer' : 'offer',
            sdp: remoteSdp
        });

        if (this.isInitiator) {
            return this._initiatorRenegotiate(remoteDescription);
        }

        return this._responderRenegotiate(remoteDescription);
    }

    /**
     * Renegotiate cycle implementation for the responder case.
     * @param {object} remoteDescription the SDP object as defined by the WebRTC
     * which will be used as remote description in the cycle.
     * @private
     */
    _responderRenegotiate(remoteDescription) {
        logger.debug(`${this} Renegotiate: setting remote description`);

        return this.peerconnection.setRemoteDescription(remoteDescription)
            .then(() => {
                logger.debug(`${this} Renegotiate: creating answer`);

                return this.peerconnection.createAnswer(this.mediaConstraints)
                    .then(answer => {
                        logger.debug(`${this} Renegotiate: setting local description`);

                        return this.peerconnection.setLocalDescription(answer);
                    });
            });
    }

    /**
     * Renegotiate cycle implementation for the initiator's case.
     * @param {object} remoteDescription the SDP object as defined by the WebRTC
     * which will be used as remote description in the cycle.
     * @private
     */
    _initiatorRenegotiate(remoteDescription) {
        logger.debug(`${this} Renegotiate: creating offer`);

        return this.peerconnection.createOffer(this.mediaConstraints)
            .then(offer => {
                logger.debug(`${this} Renegotiate: setting local description`);

                return this.peerconnection.setLocalDescription(offer)
                    .then(() => {
                        logger.debug(`${this} Renegotiate: setting remote description`);

                        // eslint-disable-next-line max-len
                        return this.peerconnection.setRemoteDescription(remoteDescription);
                    });
            });
    }

    /**
     * Adds a new track to the peerconnection. This method needs to be called only when a secondary JitsiLocalTrack is
     * being added to the peerconnection for the first time.
     *
     * @param {Array<JitsiLocalTrack>} localTracks - Tracks to be added to the peer connection.
     * @returns {Promise<void>} that resolves when the track is successfully added to the peerconnection, rejected
     * otherwise.
     */
    addTracks(localTracks = null) {
        if (!FeatureFlags.isMultiStreamSupportEnabled()
            || !localTracks?.length
            || localTracks.find(track => track.getType() !== MediaType.VIDEO)) {
            return Promise.reject(new Error('Multiple tracks of the given media type are not supported'));
        }

        const replaceTracks = [];
        const workFunction = finishedCallback => {
            const oldLocalSDP = new SDP(this.peerconnection.localDescription.sdp);
            const remoteSdp = new SDP(this.peerconnection.peerconnection.remoteDescription.sdp);

            // Add transceivers by adding a new mline in the remote description for each track.
            for (const track of localTracks) {
                remoteSdp.addMlineForNewLocalSource(track.getType());
            }

            const remoteDescription = new RTCSessionDescription({
                type: 'offer',
                sdp: remoteSdp.raw
            });

            // Always initiate a responder renegotiate since the new m-line is added to remote SDP.
            this._responderRenegotiate(remoteDescription)
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
                .then(() => {
                    const newLocalSDP = new SDP(this.peerconnection.localDescription.sdp);

                    // Signal the new sources to the peer.
                    this.notifyMySSRCUpdate(oldLocalSDP, newLocalSDP);
                    finishedCallback();
                })
                .catch(error => finishedCallback(error));
        };

        return new Promise((resolve, reject) => {
            logger.debug(`${this} Queued renegotiation after addTrack`);

            this.modificationQueue.push(
                workFunction,
                error => {
                    if (error) {
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
     * Replaces <tt>oldTrack</tt> with <tt>newTrack</tt> and performs a single
     * offer/answer cycle after both operations are done. Either
     * <tt>oldTrack</tt> or <tt>newTrack</tt> can be null; replacing a valid
     * <tt>oldTrack</tt> with a null <tt>newTrack</tt> effectively just removes
     * <tt>oldTrack</tt>
     * @param {JitsiLocalTrack|null} oldTrack the current track in use to be
     * replaced
     * @param {JitsiLocalTrack|null} newTrack the new track to use
     * @returns {Promise} which resolves once the replacement is complete
     *  with no arguments or rejects with an error {string}
     */
    replaceTrack(oldTrack, newTrack) {
        const workFunction = finishedCallback => {
            logger.debug(`${this} replaceTrack worker started. oldTrack = ${oldTrack}, newTrack = ${newTrack}`);

            const oldLocalSdp = this.peerconnection.localDescription.sdp;

            if (!this.usesUnifiedPlan) {
                // NOTE the code below assumes that no more than 1 video track
                // can be added to the peer connection.
                // Transition from camera to desktop share
                // or transition from one camera source to another.
                if (this.peerconnection.options.capScreenshareBitrate
                    && oldTrack && newTrack && newTrack.isVideoTrack()) {
                    // Clearing current primary SSRC will make
                    // the SdpConsistency generate a new one which will result
                    // with:
                    // 1. source-remove for the old video stream.
                    // 2. source-add for the new video stream.
                    this.peerconnection.clearRecvonlySsrc();
                }

                // Transition from no video to video (unmute).
                if (!oldTrack && newTrack && newTrack.isVideoTrack()) {
                    // Clearing current primary SSRC will make
                    // the SdpConsistency generate a new one which will result
                    // with:
                    // 1. source-remove for the recvonly
                    // 2. source-add for the new video stream
                    this.peerconnection.clearRecvonlySsrc();

                // Transition from video to no video
                } else if (oldTrack && oldTrack.isVideoTrack() && !newTrack) {
                    // Clearing current primary SSRC and generating the recvonly
                    // will result in:
                    // 1. source-remove for the old video stream
                    // 2. source-add for the recvonly stream
                    this.peerconnection.clearRecvonlySsrc();
                    this.peerconnection.generateRecvonlySsrc();
                }
            }

            this.peerconnection.replaceTrack(oldTrack, newTrack)
                .then(shouldRenegotiate => {
                    let promise = Promise.resolve();

                    logger.debug(`${this} TPC.replaceTrack finished. shouldRenegotiate = ${
                        shouldRenegotiate}, JingleSessionState = ${this.state}`);

                    if (shouldRenegotiate
                        && (oldTrack || newTrack)
                        && this.state === JingleSessionState.ACTIVE) {
                        promise = this._renegotiate().then(() => {
                            const newLocalSDP = new SDP(this.peerconnection.localDescription.sdp);

                            this.notifyMySSRCUpdate(new SDP(oldLocalSdp), newLocalSDP);
                        });
                    }

                    return promise.then(() => {
                        // Set the source name of the new track.
                        if (FeatureFlags.isSourceNameSignalingEnabled()
                            && oldTrack
                            && newTrack
                            && oldTrack.isVideoTrack()) {
                            newTrack.setSourceName(oldTrack.getSourceName());
                        }

                        if (newTrack?.isVideoTrack()) {
                            logger.debug(`${this} replaceTrack worker: configuring video stream`);

                            // Configure the video encodings after the track is replaced.
                            return this.peerconnection.configureSenderVideoEncodings(newTrack);
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
     * Parse the information from the xml sourceRemoveElem and translate it
     *  into sdp lines
     * @param {jquery xml element} sourceRemoveElem the source-remove
     *  element from jingle
     * @param {SDP object} currentRemoteSdp the current remote
     *  sdp (as of this new source-remove)
     * @returns {list} a list of SDP line strings that should
     *  be removed from the remote SDP
     */
    _parseSsrcInfoFromSourceRemove(sourceRemoveElem, currentRemoteSdp) {
        const removeSsrcInfo = [];

        $(sourceRemoveElem).each((i1, content) => {
            const name = $(content).attr('name');
            let lines = '';

            $(content)
                .find('ssrc-group[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]')
                .each(function() {
                    /* eslint-disable no-invalid-this */
                    const semantics = this.getAttribute('semantics');
                    const ssrcs
                        = $(this)
                            .find('>source')
                            .map(function() {
                                return this.getAttribute('ssrc');
                            })
                            .get();

                    if (ssrcs.length) {
                        lines
                            += `a=ssrc-group:${semantics} ${
                                ssrcs.join(' ')}\r\n`;
                    }

                    /* eslint-enable no-invalid-this */
                });
            const ssrcs = [];

            // handles both >source and >description>source versions
            const tmp
                = $(content).find(
                    'source[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]');

            tmp.each(function() {
                // eslint-disable-next-line no-invalid-this
                const ssrc = $(this).attr('ssrc');

                ssrcs.push(ssrc);
            });
            currentRemoteSdp.media.forEach((media, i2) => {
                if (!SDPUtil.findLine(media, `a=mid:${name}`)) {
                    return;
                }
                if (!removeSsrcInfo[i2]) {
                    removeSsrcInfo[i2] = '';
                }
                ssrcs.forEach(ssrc => {
                    const ssrcLines
                        = SDPUtil.findLines(media, `a=ssrc:${ssrc}`);

                    if (ssrcLines.length) {
                        removeSsrcInfo[i2] += `${ssrcLines.join('\r\n')}\r\n`;
                    }
                });
                removeSsrcInfo[i2] += lines;
            });
        });

        return removeSsrcInfo;
    }

    /**
     * Will print an error if there is any difference, between the SSRCs given
     * in the <tt>oldSDP</tt> and the ones currently described in
     * the peerconnection's local description.
     * @param {string} operationName the operation's name which will be printed
     * in the error message.
     * @param {SDP} oldSDP the old local SDP which will be compared with
     * the current one.
     * @return {boolean} <tt>true</tt> if there was any change or <tt>false</tt>
     * otherwise.
     * @private
     */
    _verifyNoSSRCChanged(operationName, oldSDP) {
        const currentLocalSDP
            = new SDP(this.peerconnection.localDescription.sdp);
        let sdpDiff = new SDPDiffer(oldSDP, currentLocalSDP);
        const addedMedia = sdpDiff.getNewMedia();

        if (Object.keys(addedMedia).length) {
            logger.error(`${this} - some SSRC were added on ${operationName}`, addedMedia);

            return false;
        }

        sdpDiff = new SDPDiffer(currentLocalSDP, oldSDP);
        const removedMedia = sdpDiff.getNewMedia();

        if (Object.keys(removedMedia).length) {
            logger.error(`${this} - some SSRCs were removed on ${operationName}`, removedMedia);

            return false;
        }

        return true;
    }

    /**
     * Adds local track back to this session, as part of the unmute operation.
     * @param {JitsiLocalTrack} track
     * @return {Promise} a promise that will resolve once the local track is
     * added back to this session and renegotiation succeeds. Will be rejected
     * with a <tt>string</tt> that provides some error details in case something
     * goes wrong.
     */
    addTrackAsUnmute(track) {
        return this._addRemoveTrackAsMuteUnmute(
            false /* add as unmute */, track)
            .then(() => {
                // Configure the video encodings after the track is unmuted. If the user joins the call muted and
                // unmutes it the first time, all the parameters need to be configured.
                if (track.isVideoTrack()) {
                    return this.peerconnection.configureSenderVideoEncodings(track);
                }
            });
    }

    /**
     * Remove local track as part of the mute operation.
     * @param {JitsiLocalTrack} track the local track to be removed
     * @return {Promise} a promise which will be resolved once the local track
     * is removed from this session and the renegotiation is performed.
     * The promise will be rejected with a <tt>string</tt> that the describes
     * the error if anything goes wrong.
     */
    removeTrackAsMute(track) {
        return this._addRemoveTrackAsMuteUnmute(
            true /* remove as mute */, track);
    }

    /**
     * See {@link addTrackAsUnmute} and {@link removeTrackAsMute}.
     * @param {boolean} isMute <tt>true</tt> for "remove as mute" or
     * <tt>false</tt> for "add as unmute".
     * @param {JitsiLocalTrack} track the track that will be added/removed
     * @private
     */
    _addRemoveTrackAsMuteUnmute(isMute, track) {
        if (!track) {
            return Promise.reject('invalid "track" argument value');
        }
        const operationName = isMute ? 'removeTrackMute' : 'addTrackUnmute';
        const workFunction = finishedCallback => {
            const tpc = this.peerconnection;

            if (!tpc) {
                finishedCallback(
                    `Error:  tried ${operationName} track with no active peer`
                        + 'connection');

                return;
            }
            const oldLocalSDP = tpc.localDescription.sdp;
            const operationPromise
                = isMute
                    ? tpc.removeTrackMute(track)
                    : tpc.addTrackUnmute(track);

            operationPromise
                .then(shouldRenegotiate => {
                    if (shouldRenegotiate && oldLocalSDP && tpc.remoteDescription.sdp) {
                        this._renegotiate()
                            .then(() => {
                                // The results are ignored, as this check failure is not enough to fail the whole
                                // operation. It will log an error inside for plan-b.
                                !this.usesUnifiedPlan && this._verifyNoSSRCChanged(operationName, new SDP(oldLocalSDP));
                                const newLocalSdp = tpc.localDescription.sdp;

                                // Signal the ssrc if an unmute operation results in a new ssrc being generated.
                                this.notifyMySSRCUpdate(new SDP(oldLocalSDP), new SDP(newLocalSdp));
                                finishedCallback();
                            });
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
     * Resumes or suspends media transfer over the underlying peer connection.
     * @param {boolean} audioActive <tt>true</tt> to enable audio media
     * transfer or <tt>false</tt> to suspend audio media transmission.
     * @param {boolean} videoActive <tt>true</tt> to enable video media
     * transfer or <tt>false</tt> to suspend video media transmission.
     * @return {Promise} a <tt>Promise</tt> which will resolve once
     * the operation is done. It will be rejected with an error description as
     * a string in case anything goes wrong.
     */
    setMediaTransferActive(audioActive, videoActive) {
        if (!this.peerconnection) {
            return Promise.reject(
                'Can not modify transfer active state,'
                    + ' before "initialize" is called');
        }

        const logAudioStr = audioActive ? 'audio active' : 'audio inactive';
        const logVideoStr = videoActive ? 'video active' : 'video inactive';

        logger.info(`${this} Queued make ${logVideoStr}, ${logAudioStr} task`);

        const workFunction = finishedCallback => {
            const isSessionActive = this.state === JingleSessionState.ACTIVE;

            // Because the value is modified on the queue it's impossible to
            // check it's final value reliably prior to submitting the task.
            // The rule here is that the last submitted state counts.
            // Check the values here to avoid unnecessary renegotiation cycle.
            const audioActiveChanged
                = this.peerconnection.setAudioTransferActive(audioActive);

            if (this._localVideoActive !== videoActive) {
                this._localVideoActive = videoActive;

                // Do only for P2P - Jicofo will reply with 'bad-request'
                // We don't want to send 'content-modify', before the initial
                // O/A (state === JingleSessionState.ACTIVE), because that will
                // mess up video media direction in the remote SDP.
                // 'content-modify' when processed only affects the media
                // direction in the local SDP. We're doing that, because setting
                // 'inactive' on video media in remote SDP will mess up our SDP
                // translation chain (simulcast, RTX, video mute etc.).
                if (this.isP2P && isSessionActive) {
                    this.sendContentModify();
                }
            }

            const pcVideoActiveChanged
                = this.peerconnection.setVideoTransferActive(
                    this._localVideoActive && this._remoteVideoActive);

            // Will do the sRD/sLD cycle to update SDPs and adjust the media
            // direction
            if (isSessionActive
                    && (audioActiveChanged || pcVideoActiveChanged)) {
                this._renegotiate()
                    .then(
                        finishedCallback,
                        finishedCallback /* will be called with an error */);
            } else {
                finishedCallback();
            }
        };

        return new Promise((resolve, reject) => {
            this.modificationQueue.push(
                workFunction,
                error => {
                    if (error) {
                        logger.error(`${this} Make ${logVideoStr}, ${logAudioStr} task failed!`);
                        reject(error);
                    } else {
                        logger.debug(`${this} Make ${logVideoStr}, ${logAudioStr} task done!`);
                        resolve();
                    }
                });
        });
    }

    /**
     * Will put and execute on the queue a session modify task. Currently it
     * only checks the senders attribute of the video content in order to figure
     * out if the remote peer has video in the inactive state (stored locally
     * in {@link _remoteVideoActive} - see field description for more info).
     * @param {jQuery} jingleContents jQuery selector pointing to the jingle
     * element of the session modify IQ.
     * @see {@link _remoteVideoActive}
     * @see {@link _localVideoActive}
     */
    modifyContents(jingleContents) {
        const newVideoSenders = JingleSessionPC.parseVideoSenders(jingleContents);
        const newMaxFrameHeight = JingleSessionPC.parseMaxFrameHeight(jingleContents);
        const sourceMaxFrameHeights = JingleSessionPC.parseSourceMaxFrameHeight(jingleContents);

        // frame height is optional in our content-modify protocol
        if (newMaxFrameHeight) {
            logger.info(`${this} received remote max frame height: ${newMaxFrameHeight}`);
            this.remoteRecvMaxFrameHeight = newMaxFrameHeight;
            this.eventEmitter.emit(MediaSessionEvents.REMOTE_VIDEO_CONSTRAINTS_CHANGED, this);
        }

        if (sourceMaxFrameHeights) {
            this.remoteSourceMaxFrameHeights = sourceMaxFrameHeights;
            this.eventEmitter.emit(MediaSessionEvents.REMOTE_SOURCE_CONSTRAINTS_CHANGED, this, sourceMaxFrameHeights);
        }

        if (newVideoSenders === null) {
            logger.error(`${this} - failed to parse video "senders" attribute in "content-modify" action`);

            return;
        }

        const workFunction = finishedCallback => {
            if (this._assertNotEnded() && this._modifyRemoteVideoActive(newVideoSenders)) {
                // Will do the sRD/sLD cycle to update SDPs and adjust the media direction.
                this._renegotiate()
                    .then(finishedCallback, finishedCallback /* (error) */);
            } else {
                finishedCallback();
            }
        };

        logger.debug(`${this} queued "content-modify" task(video senders="${newVideoSenders}")`);

        this.modificationQueue.push(
            workFunction,
            error => {
                if (error) {
                    logger.error(`${this} "content-modify" failed`, error);
                } else {
                    logger.debug(`${this} "content-modify" task(video senders="${newVideoSenders}") done`);
                }
            });
    }

    /**
     * Processes new value of remote video "senders" Jingle attribute and tries
     * to apply it for {@link _remoteVideoActive}.
     * @param {string} remoteVideoSenders the value of "senders" attribute of
     * Jingle video content element advertised by remote peer.
     * @return {boolean} <tt>true</tt> if the change affected state of
     * the underlying peerconnection and renegotiation is required for
     * the changes to take effect.
     * @private
     */
    _modifyRemoteVideoActive(remoteVideoSenders) {
        const isRemoteVideoActive
            = remoteVideoSenders === 'both'
                || (remoteVideoSenders === 'initiator' && this.isInitiator)
                || (remoteVideoSenders === 'responder' && !this.isInitiator);

        if (isRemoteVideoActive !== this._remoteVideoActive) {
            logger.debug(`${this} new remote video active: ${isRemoteVideoActive}`);
            this._remoteVideoActive = isRemoteVideoActive;
        }

        return this.peerconnection.setVideoTransferActive(this._localVideoActive && this._remoteVideoActive);
    }

    /**
     * Figures out added/removed ssrcs and send update IQs.
     * @param oldSDP SDP object for old description.
     * @param newSDP SDP object for new description.
     */
    notifyMySSRCUpdate(oldSDP, newSDP) {
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

                mediaType = newMedia[mediaIndex].mid;
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
        let sdpDiffer = new SDPDiffer(newSDP, oldSDP);
        const remove = $iq({ to: this.remoteJid,
            type: 'set' })
            .c('jingle', {
                xmlns: 'urn:xmpp:jingle:1',
                action: 'source-remove',
                initiator: this.initiatorJid,
                sid: this.sid
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
                this.newJingleErrorHandler(remove, error => {
                    this.room.eventEmitter.emit(XMPPEvents.SOURCE_REMOVE_ERROR, this, error, ctx);
                }),
                IQ_TIMEOUT);
        }

        // send source-add IQ.
        sdpDiffer = new SDPDiffer(oldSDP, newSDP);
        const add = $iq({ to: this.remoteJid,
            type: 'set' })
            .c('jingle', {
                xmlns: 'urn:xmpp:jingle:1',
                action: 'source-add',
                initiator: this.initiatorJid,
                sid: this.sid
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
                this.newJingleErrorHandler(add, error => {
                    this.room.eventEmitter.emit(XMPPEvents.SOURCE_ADD_ERROR, this, error, addedSsrcInfo.mediaType, ctx);
                }),
                IQ_TIMEOUT);
        }
    }

    /**
     * Method returns function(errorResponse) which is a callback to be passed
     * to Strophe connection.sendIQ method. An 'error' structure is created that
     * is passed as 1st argument to given <tt>failureCb</tt>. The format of this
     * structure is as follows:
     * {
     *  code: {XMPP error response code}
     *  reason: {the name of XMPP error reason element or 'timeout' if the
      *          request has timed out within <tt>IQ_TIMEOUT</tt> milliseconds}
     *  source: {request.tree() that provides original request}
     *  session: {this JingleSessionPC.toString()}
     * }
     * @param request Strophe IQ instance which is the request to be dumped into
     *        the error structure
     * @param failureCb function(error) called when error response was returned
     *        or when a timeout has occurred.
     * @returns {function(this:JingleSessionPC)}
     */
    newJingleErrorHandler(request, failureCb) {
        return errResponse => {

            const error = {};

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
                GlobalOnErrorHandler.callErrorHandler(
                    new Error(
                        `Jingle error: ${JSON.stringify(error)}`));
            }
        };
    }

    /**
     * Returns the ice connection state for the peer connection.
     * @returns the ice connection state for the peer connection.
     */
    getIceConnectionState() {
        return this.peerconnection.getConnectionState();
    }

    /**
     * Closes the peerconnection.
     */
    close() {
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
     * Converts to string with minor summary.
     * @return {string}
     */
    toString() {
        return `JingleSessionPC[session=${this.isP2P ? 'P2P' : 'JVB'},initiator=${this.isInitiator},sid=${this.sid}]`;
    }

    /**
     * If the A/B test for suspend video is disabled according to the room's
     * configuration, returns undefined. Otherwise returns a boolean which
     * indicates whether the suspend video option should be enabled or disabled.
     * @param {JingleSessionPCOptions} options - The config options.
     */
    _abtestSuspendVideoEnabled({ abTesting }) {
        if (!abTesting || !abTesting.enableSuspendVideoTest) {
            return;
        }

        // We want the two participants in a P2P call to agree on the value of
        // the "suspend" option. We use the JID of the initiator, because it is
        // both randomly selected and agreed upon by both participants.
        const jid = this._getInitiatorJid();

        return integerHash(jid) % 2 === 0;
    }
}
