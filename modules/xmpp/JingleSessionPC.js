/* global __filename, $ */

import { getLogger } from 'jitsi-meet-logger';
import { $iq, Strophe } from 'strophe.js';

import * as CodecMimeType from '../../service/RTC/CodecMimeType';
import {
    ICE_DURATION,
    ICE_STATE_CHANGED
} from '../../service/statistics/AnalyticsEvents';
import XMPPEvents from '../../service/xmpp/XMPPEvents';
import Statistics from '../statistics/statistics';
import AsyncQueue from '../util/AsyncQueue';
import GlobalOnErrorHandler from '../util/GlobalOnErrorHandler';
import { integerHash } from '../util/StringUtils';

import browser from './../browser';
import JingleSession from './JingleSession';
import * as JingleSessionState from './JingleSessionState';
import MediaSessionEvents from './MediaSessionEvents';
import SDP from './SDP';
import SDPDiffer from './SDPDiffer';
import SDPUtil from './SDPUtil';
import SignalingLayerImpl from './SignalingLayerImpl';
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

    /* eslint-disable max-params */

    /**
     * Creates new <tt>JingleSessionPC</tt>
     * @param {string} sid the Jingle Session ID - random string which
     * identifies the session
     * @param {string} localJid our JID
     * @param {string} remoteJid remote peer JID
     * @param {XmppConnection} connection - The XMPP connection instance.
     * @param mediaConstraints the media constraints object passed to
     * createOffer/Answer, as defined by the WebRTC standard
     * @param iceConfig the ICE servers config object as defined by the WebRTC
     * standard.
     * @param {boolean} isP2P indicates whether this instance is
     * meant to be used in a direct, peer to peer connection or <tt>false</tt>
     * if it's a JVB connection.
     * @param {boolean} isInitiator indicates if it will be the side which
     * initiates the session.
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
            iceConfig,
            isP2P,
            isInitiator) {
        super(
            sid,
            localJid,
            remoteJid, connection, mediaConstraints, iceConfig, isInitiator);

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
         * The signaling layer implementation.
         * @type {SignalingLayerImpl}
         */
        this.signalingLayer = new SignalingLayerImpl();

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

            // disable simulcast for screenshare and set the max bitrate to
            // 500Kbps if the testing flag is present in config.js.
            if (options.testing
                && options.testing.capScreenshareBitrate
                && typeof options.testing.capScreenshareBitrate === 'number') {
                pcOptions.capScreenshareBitrate
                    = Math.random()
                    < options.testing.capScreenshareBitrate;

                // add the capScreenshareBitrate to the permanent properties so
                // that it's included with every event that we send to the
                // analytics backend.
                Statistics.analytics.addPermanentProperties({ capScreenshareBitrate: pcOptions.capScreenshareBitrate });
            }
        }

        if (options.startSilent) {
            pcOptions.startSilent = true;
        }

        this.peerconnection
            = this.rtc.createPeerConnection(
                    this.signalingLayer,
                    this.iceConfig,
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

            if (!this.isP2P) {
                this.room.connectionTimes[
                    `ice.state.${this.peerconnection.iceConnectionState}`]
                    = now;
            }
            logger.log(
                `(TIME) ICE ${this.peerconnection.iceConnectionState}`
                    + ` P2P? ${this.isP2P}:\t`,
                now);

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
                    const usesTerminateForRestart = !this.options.enableIceRestart
                        && this.room.supportsRestartByTerminate();

                    if (this.isReconnect || usesTerminateForRestart) {
                        this.room.eventEmitter.emit(
                            XMPPEvents.CONNECTION_RESTORED, this);
                    }
                }

                if (!this.wasConnected && this.wasstable) {

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
         * The negotiationneeded event is fired whenever we shake the media on the
         * RTCPeerConnection object.
         */
        this.peerconnection.onnegotiationneeded = () => {
            const state = this.peerconnection.signalingState;
            const remoteDescription = this.peerconnection.remoteDescription;

            if (browser.usesUnifiedPlan() && state === 'stable'
                && remoteDescription && typeof remoteDescription.sdp === 'string') {
                logger.debug(`onnegotiationneeded fired on ${this.peerconnection} in state: ${state}`);
                const workFunction = finishedCallback => {
                    const oldSdp = new SDP(this.peerconnection.localDescription.sdp);

                    this._renegotiate()
                        .then(() => {
                            const newSdp = new SDP(this.peerconnection.localDescription.sdp);

                            this.notifyMySSRCUpdate(oldSdp, newSdp);
                            finishedCallback();
                        },
                        finishedCallback /* will be called with en error */);
                };

                this.modificationQueue.push(
                    workFunction,
                    error => {
                        if (error) {
                            logger.error(`onnegotiationneeded error on ${this}`, error);
                        } else {
                            logger.debug(`onnegotiationneeded executed - OK on ${this}`);
                        }
                    });
            }
        };

        // The signaling layer will bind it's listeners at this point
        this.signalingLayer.setChatRoom(this.room);
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
     * Sends given candidate in Jingle 'transport-info' message.
     * @param {RTCIceCandidate} candidate the WebRTC ICE candidate instance
     * @private
     */
    sendIceCandidate(candidate) {
        const localSDP = new SDP(this.peerconnection.localDescription.sdp);

        if (candidate && candidate.candidate.length && !this.lasticecandidate) {
            const ice
                = SDPUtil.iceparams(
                    localSDP.media[candidate.sdpMLineIndex], localSDP.session);
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
                    // start 20ms callout
                    setTimeout(() => {
                        if (this.dripContainer.length === 0) {
                            return;
                        }
                        this.sendIceCandidates(this.dripContainer);
                        this.dripContainer = [];
                    }, 20);
                }
                this.dripContainer.push(candidate);
            } else {
                this.sendIceCandidates([ candidate ]);
            }
        } else {
            logger.log('sendIceCandidate: last candidate.');

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

        logger.log('sendIceCandidates', candidates);
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
            logger.warn('Ignored add ICE candidate when in closed state');

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
            logger.error(
                'No ICE candidates to add ?', elem[0] && elem[0].outerHTML);

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
                        () => logger.debug('addIceCandidate ok!'),
                        err => logger.error('addIceCandidate failed!', err));
            }

            finishedCallback();
            logger.debug(`ICE candidates task finished on ${this}`);
        };

        logger.debug(
            `Queued add (${iceCandidates.length}) ICE candidates task...`);
        this.modificationQueue.push(workFunction);
    }

    /**
     *
     * @param contents
     */
    readSsrcInfo(contents) {
        const ssrcs
            = $(contents).find(
                '>description>'
                    + 'source[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]');

        ssrcs.each((i, ssrcElement) => {
            const ssrc = Number(ssrcElement.getAttribute('ssrc'));

            if (this.isP2P) {
                // In P2P all SSRCs are owner by the remote peer
                this.signalingLayer.setSSRCOwner(
                    ssrc, Strophe.getResourceFromJid(this.remoteJid));
            } else {
                $(ssrcElement)
                    .find('>ssrc-info[xmlns="http://jitsi.org/jitmeet"]')
                    .each((i3, ssrcInfoElement) => {
                        const owner = ssrcInfoElement.getAttribute('owner');

                        if (owner && owner.length) {
                            if (isNaN(ssrc) || ssrc < 0) {
                                logger.warn(
                                    `Invalid SSRC ${ssrc} value received`
                                        + ` for ${owner}`);
                            } else {
                                this.signalingLayer.setSSRCOwner(
                                    ssrc,
                                    Strophe.getResourceFromJid(owner));
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
            logger.error(
                'Unable to generate recvonly SSRC - no peerconnection');
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
                this.sendSessionAccept(success, failure);
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

            for (const localTrack of localTracks) {
                addTracks.push(this.peerconnection.addTrack(localTrack, this.isInitiator));
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

        logger.debug(`Queued invite task on ${this}.`);
        this.modificationQueue.push(
            workFunction,
            error => {
                if (error) {
                    logger.error(`invite error on ${this}`, error);
                } else {
                    logger.debug(`invite executed - OK on ${this}`);
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
        logger.info('Session-initiate: ', init);
        this.connection.sendIQ(init,
            () => {
                logger.info('Got RESULT for "session-initiate"');
            },
            error => {
                logger.error('"session-initiate" error', error);
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
                logger.info('setAnswer - succeeded');
            },
            error => {
                logger.error('setAnswer failed: ', error);
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

            for (const track of localTracks) {
                addTracks.push(this.peerconnection.addTrack(track, this.isInitiator));
            }

            const newRemoteSdp
                = this._processNewJingleOfferIq(jingleOfferAnswerIq);
            const oldLocalSdp
                = this.peerconnection.localDescription.sdp;

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

                        // #1 Sync up video transfer active/inactive only after
                        // the initial O/A cycle. We want to adjust the video
                        // media direction only in the local SDP and the Jingle
                        // contents direction included in the initial
                        // offer/answer is mapped to the remote SDP. Jingle
                        // 'content-modify' IQ is processed in a way that it
                        // will only modify local SDP when remote peer is no
                        // longer interested in receiving video content.
                        // Changing media direction in the remote SDP will mess
                        // up our SDP translation chain (simulcast, video mute,
                        // RTX etc.)
                        //
                        // #2 Sends the max frame height if it was set, before the session-initiate/accept
                        if (this.isP2P
                            && (!this._localVideoActive || this.localRecvMaxFrameHeight)) {
                            this.sendContentModify();
                        }
                    }

                    // Old local SDP will be available when we're setting answer
                    // for the first time, but not when offer and it's fine
                    // since we're generating an answer now it will contain all
                    // our SSRCs
                    if (oldLocalSdp) {
                        const newLocalSdp
                            = new SDP(this.peerconnection.localDescription.sdp);

                        this.notifyMySSRCUpdate(
                            new SDP(oldLocalSdp), newLocalSdp);
                    }
                })
                .then(() => finishedCallback(), error => finishedCallback(error));
        };

        logger.debug(`Queued setOfferAnswerCycle task on ${this}`);
        this.modificationQueue.push(
            workFunction,
            error => {
                if (error) {
                    logger.error(`setOfferAnswerCycle task on ${this} failed: ${error}`);
                    failure(error);
                } else {
                    logger.debug(`setOfferAnswerCycle task on ${this} done.`);
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
                        logger.debug(`setVideoCodecs task on ${this} is done.`);

                        return finishedCallback();
                    }, error => {
                        logger.error(`setVideoCodecs task on ${this} failed: ${error}`);

                        return finishedCallback(error);
                    });
            };

            logger.debug(`Queued setVideoCodecs task on ${this}`);

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
        let accept = $iq({ to: this.remoteJid,
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
            this.initiatorJid === this.localJid ? 'initiator' : 'responder',
            null);

        // Calling tree() to print something useful
        accept = accept.tree();
        logger.info('Sending session-accept', accept);
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
                    name: 'video',
                    senders
                });

        if (typeof maxFrameHeight !== 'undefined') {
            sessionModify = sessionModify
                .c('max-frame-height', { xmlns: 'http://jitsi.org/jitmeet/video' })
                .t(maxFrameHeight);
        }

        logger.info(`${this} sending content-modify, video senders: ${senders}, max frame height: ${maxFrameHeight}`);

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
     */
    setReceiverVideoConstraint(maxFrameHeight) {
        logger.info(`${this} setReceiverVideoConstraint - max frame height: ${maxFrameHeight}`);

        this.localRecvMaxFrameHeight = maxFrameHeight;

        if (this.isP2P) {
            // Tell the remote peer about our receive constraint. If Jingle session is not yet active the state will
            // be synced after offer/answer.
            if (this.state === JingleSessionState.ACTIVE) {
                this.sendContentModify();
            }
        } else {
            this.rtc.setReceiverVideoConstraint(maxFrameHeight);
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
        let transportAccept = $iq({ to: this.remoteJid,
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

        // Calling tree() to print something useful to the logger
        transportAccept = transportAccept.tree();
        logger.info('Sending transport-accept: ', transportAccept);

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
        let transportReject = $iq({ to: this.remoteJid,
            type: 'set' })
            .c('jingle', {
                xmlns: 'urn:xmpp:jingle:1',
                action: 'transport-reject',
                initiator: this.initiatorJid,
                sid: this.sid
            });

        transportReject = transportReject.tree();
        logger.info('Sending \'transport-reject', transportReject);

        this.connection.sendIQ(transportReject,
            success,
            this.newJingleErrorHandler(transportReject, failure),
            IQ_TIMEOUT);
    }

    /**
     * Sets the maximum bitrates on the local video track. Bitrate values from
     * videoQuality settings in config.js will be used for configuring the sender.
     * @returns {Promise<void>} promise that will be resolved when the operation is
     * successful and rejected otherwise.
     */
    setSenderMaxBitrates() {
        if (this._assertNotEnded()) {
            return this.peerconnection.setMaxBitRate();
        }

        return Promise.resolve();
    }

    /**
     * Sets the resolution constraint on the local camera track.
     * @param {number} maxFrameHeight - The user preferred max frame height.
     * @returns {Promise} promise that will be resolved when the operation is
     * successful and rejected otherwise.
     */
    setSenderVideoConstraint(maxFrameHeight) {
        if (this._assertNotEnded()) {
            logger.info(`${this} setSenderVideoConstraint: ${maxFrameHeight}`);

            // RN doesn't support RTCRtpSenders yet, aggresive layer suspension on RN is implemented
            // by changing the media direction in the SDP. This is applicable to jvb sessions only.
            if (!this.isP2P && browser.isReactNative() && typeof maxFrameHeight !== 'undefined') {
                const videoActive = maxFrameHeight > 0;

                return this.setMediaTransferActive(true, videoActive);
            }

            return this.peerconnection.setSenderVideoConstraint(maxFrameHeight);
        }

        return Promise.resolve();
    }

    /**
     * Sets the degradation preference on the video sender. This setting determines if
     * resolution or framerate will be preferred when bandwidth or cpu is constrained.
     * @returns {Promise<void>} promise that will be resolved when the operation is
     * successful and rejected otherwise.
     */
    setSenderVideoDegradationPreference() {
        if (this._assertNotEnded()) {
            return this.peerconnection.setSenderVideoDegradationPreference();
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
            let sessionTerminate
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

            // Calling tree() to print something useful
            sessionTerminate = sessionTerminate.tree();
            logger.info('Sending session-terminate', sessionTerminate);
            this.connection.sendIQ(
                sessionTerminate,
                success,
                this.newJingleErrorHandler(sessionTerminate, failure),
                IQ_TIMEOUT);
        } else {
            logger.info(`Skipped sending session-terminate for ${this}`);
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
        logger.info(`Session terminated ${this}`, reasonCondition, reasonText);

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
            logger.info('Sending SSRC update on reconnect');
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
                        lines
                            += `a=ssrc-group:${semantics} ${
                                ssrcs.join(' ')}\r\n`;
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
                    logger.warn(
                        `Source-add request for existing SSRC: ${ssrc}`);

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

            /* eslint-enable no-invalid-this */
            currentRemoteSdp.media.forEach((media, i2) => {
                if (!SDPUtil.findLine(media, `a=mid:${name}`)) {
                    return;
                }
                if (!addSsrcInfo[i2]) {
                    addSsrcInfo[i2] = '';
                }
                addSsrcInfo[i2] += lines;
            });
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
     * Handles the deletion of the remote tracks and SSRCs associated with a remote endpoint.
     *
     * @param {string} id Endpoint id of the participant that has left the call.
     * @returns {Promise<JitsiRemoteTrack>} Promise that resolves with the tracks that are removed or error if the
     * operation fails.
     */
    removeRemoteStreamsOnLeave(id) {
        let remoteTracks = [];

        const workFunction = finishCallback => {
            const removeSsrcInfo = this.peerconnection.getRemoteSourceInfoByParticipant(id);

            if (removeSsrcInfo.length) {
                const oldLocalSdp = new SDP(this.peerconnection.localDescription.sdp);
                const newRemoteSdp = this._processRemoteRemoveSource(removeSsrcInfo);

                remoteTracks = this.peerconnection.removeRemoteTracks(id);
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

        return new Promise((resolve, reject) => {
            logger.debug(`Queued removeRemoteStreamsOnLeave task for participant ${id} on ${this}`);

            this.modificationQueue.push(
                workFunction,
                error => {
                    if (error) {
                        logger.error(`removeRemoteStreamsOnLeave error on ${this}:`, error);
                        reject(error);
                    } else {
                        logger.info(`removeRemoteStreamsOnLeave done on ${this}!`);
                        resolve(remoteTracks);
                    }
                });
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

            logger.log(`Processing ${logPrefix}`);
            logger.log(
                'ICE connection state: ',
                this.peerconnection.iceConnectionState);

            const oldLocalSdp
                = new SDP(this.peerconnection.localDescription.sdp);
            const sdp = new SDP(this.peerconnection.remoteDescription.sdp);
            const addOrRemoveSsrcInfo
                = isAdd
                    ? this._parseSsrcInfoFromSourceAdd(elem, sdp)
                    : this._parseSsrcInfoFromSourceRemove(elem, sdp);
            const newRemoteSdp
                = isAdd
                    ? this._processRemoteAddSource(addOrRemoveSsrcInfo)
                    : this._processRemoteRemoveSource(addOrRemoveSsrcInfo);

            this._renegotiate(newRemoteSdp.raw)
                .then(() => {
                    const newLocalSdp
                        = new SDP(this.peerconnection.localDescription.sdp);

                    logger.log(
                        `${logPrefix} - OK, SDPs: `, oldLocalSdp, newLocalSdp);
                    this.notifyMySSRCUpdate(oldLocalSdp, newLocalSdp);
                    finishedCallback();
                }, error => {
                    logger.error(`${logPrefix} failed:`, error);
                    finishedCallback(error);
                });
        };

        logger.debug(`Queued ${logPrefix} task on ${this}`);

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
        const remoteSdp = browser.usesPlanB()
            ? new SDP(this.peerconnection.remoteDescription.sdp)
            : new SDP(this.peerconnection.peerconnection.remoteDescription.sdp);

        removeSsrcInfo.forEach((lines, idx) => {
            // eslint-disable-next-line no-param-reassign
            lines = lines.split('\r\n');
            lines.pop(); // remove empty last element;
            if (browser.usesPlanB()) {
                lines.forEach(line => {
                    remoteSdp.media[idx]
                        = remoteSdp.media[idx].replace(`${line}\r\n`, '');
                });
            } else {
                lines.forEach(line => {
                    const mid = remoteSdp.media.findIndex(mLine => mLine.includes(line));

                    if (mid > -1) {
                        remoteSdp.media[mid] = remoteSdp.media[mid].replace(`${line}\r\n`, '');

                        // Change the direction to "inactive" only on Firefox. Audio fails on
                        // Safari (possibly Chrome in unified plan mode) when we try to re-use inactive
                        // m-lines due to a webkit bug.
                        // https://bugs.webkit.org/show_bug.cgi?id=211181
                        if (browser.isFirefox()) {
                            remoteSdp.media[mid] = remoteSdp.media[mid].replace('a=sendonly', 'a=inactive');
                        }
                    }
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
        const remoteSdp = new SDP(this.peerconnection.remoteDescription.sdp);

        addSsrcInfo.forEach((lines, idx) => {
            remoteSdp.media[idx] += lines;
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
        logger.debug('Renegotiate: setting remote description');

        return this.peerconnection.setRemoteDescription(remoteDescription)
            .then(() => {
                logger.debug('Renegotiate: creating answer');

                return this.peerconnection.createAnswer(this.mediaConstraints)
                    .then(answer => {
                        logger.debug('Renegotiate: setting local description');

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
        logger.debug('Renegotiate: creating offer');

        return this.peerconnection.createOffer(this.mediaConstraints)
            .then(offer => {
                logger.debug('Renegotiate: setting local description');

                return this.peerconnection.setLocalDescription(offer)
                    .then(() => {
                        logger.debug(
                            'Renegotiate: setting remote description');

                        // eslint-disable-next-line max-len
                        return this.peerconnection.setRemoteDescription(remoteDescription);
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
            logger.debug(`replaceTrack worker started. oldTrack = ${oldTrack}, newTrack = ${newTrack}, ${this}`);

            const oldLocalSdp = this.peerconnection.localDescription.sdp;

            if (browser.usesPlanB()) {
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

                    logger.debug(`TPC.replaceTrack finished. shouldRenegotiate = ${
                        shouldRenegotiate}, JingleSessionState = ${this.state}, ${this}`);

                    if (shouldRenegotiate
                        && (oldTrack || newTrack)
                        && this.state === JingleSessionState.ACTIVE) {
                        promise = this._renegotiate().then(() => {
                            const newLocalSDP = new SDP(this.peerconnection.localDescription.sdp);

                            this.notifyMySSRCUpdate(new SDP(oldLocalSdp), newLocalSDP);
                        });
                    }

                    return promise.then(() => {
                        if (newTrack && newTrack.isVideoTrack()) {
                            logger.debug(`replaceTrack worker: setSenderVideoDegradationPreference(), ${this}`);

                            // FIXME set all sender parameters in one go?
                            // Set the degradation preference on the new video sender.
                            return this.peerconnection.setSenderVideoDegradationPreference()

                                // Apply the cached video constraints on the new video sender.
                                .then(() => {
                                    logger.debug(`replaceTrack worker: setSenderVideoConstraint(), ${this}`);

                                    return this.peerconnection.setSenderVideoConstraint();
                                })
                                .then(() => {
                                    logger.debug(`replaceTrack worker: setMaxBitRate(), ${this}`);

                                    return this.peerconnection.setMaxBitRate();
                                });
                        }
                    });
                })
                .then(() => finishedCallback(), error => finishedCallback(error));
        };

        return new Promise((resolve, reject) => {
            logger.debug(`Queued replaceTrack task. Old track = ${
                oldTrack}, new track = ${newTrack}, ${this}`);

            this.modificationQueue.push(
                workFunction,
                error => {
                    if (error) {
                        logger.error(`Replace track error on ${this}:`, error);
                        reject(error);
                    } else {
                        logger.info(`Replace track done on ${this}!`);
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
            logger.error(
                `${this} - some SSRC were added on ${operationName}`,
                addedMedia);

            return false;
        }

        sdpDiff = new SDPDiffer(currentLocalSDP, oldSDP);
        const removedMedia = sdpDiff.getNewMedia();

        if (Object.keys(removedMedia).length) {
            logger.error(
                `${this} - some SSRCs were removed on ${operationName}`,
                removedMedia);

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
                // Apply the video constraints, max bitrates and degradation preference on
                // the video sender if needed.
                if (track.isVideoTrack() && browser.doesVideoMuteByStreamRemove()) {
                    return this.setSenderMaxBitrates()
                        .then(() => this.setSenderVideoDegradationPreference())
                        .then(() => this.setSenderVideoConstraint());
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
                                // The results are ignored, as this check failure is not
                                // enough to fail the whole operation. It will log
                                // an error inside.
                                this._verifyNoSSRCChanged(
                                    operationName, new SDP(oldLocalSDP));
                                finishedCallback();
                            });
                    } else {
                        finishedCallback();
                    }
                },
                finishedCallback /* will be called with an error */);
        };

        logger.debug(`Queued _addRemoveTrackAsMuteUnmute task on ${this}. Operation - ${operationName}`);

        return new Promise((resolve, reject) => {
            this.modificationQueue.push(
                workFunction,
                error => {
                    if (error) {
                        logger.error(`_addRemoveTrackAsMuteUnmute failed. Operation - ${
                            operationName}, peerconnection = ${this}`);

                        reject(error);
                    } else {
                        logger.debug(`_addRemoveTrackAsMuteUnmute done. Operation - ${
                            operationName}, peerconnection = ${this}`);

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

        logger.info(`Queued make ${logVideoStr}, ${logAudioStr} task...`);

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
                        logger.error(`Make ${logVideoStr}, ${logAudioStr} task failed!`);
                        reject(error);
                    } else {
                        logger.debug(`Make ${logVideoStr}, ${logAudioStr} task done!`);
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
        const newVideoSenders
            = JingleSessionPC.parseVideoSenders(jingleContents);
        const newMaxFrameHeight
            = JingleSessionPC.parseMaxFrameHeight(jingleContents);

        // frame height is optional in our content-modify protocol
        if (newMaxFrameHeight) {
            logger.info(`${this} received remote max frame height: ${newMaxFrameHeight}`);
            this.remoteRecvMaxFrameHeight = newMaxFrameHeight;
            this.eventEmitter.emit(
                MediaSessionEvents.REMOTE_VIDEO_CONSTRAINTS_CHANGED, this);
        }

        if (newVideoSenders === null) {
            logger.error(
                `${this} - failed to parse video "senders" attribute in`
                    + '"content-modify" action');

            return;
        }

        const workFunction = finishedCallback => {
            if (this._assertNotEnded('content-modify')
                    && this._modifyRemoteVideoActive(newVideoSenders)) {
                // Will do the sRD/sLD cycle to update SDPs and adjust
                // the media direction
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
                    logger.error(`"content-modify" failed on PC - ${this}`, error);
                } else {
                    logger.debug(`"content-modify" task(video senders="${newVideoSenders}") done. PC = ${this}`);
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
            logger.debug(
                `${this} new remote video active: ${isRemoteVideoActive}`);
            this._remoteVideoActive = isRemoteVideoActive;
        }

        return this.peerconnection.setVideoTransferActive(
            this._localVideoActive && this._remoteVideoActive);
    }

    /**
     * Figures out added/removed ssrcs and send update IQs.
     * @param oldSDP SDP object for old description.
     * @param newSDP SDP object for new description.
     */
    notifyMySSRCUpdate(oldSDP, newSDP) {

        if (this.state !== JingleSessionState.ACTIVE) {
            logger.warn(`Skipping SSRC update in '${this.state} ' state.`);

            return;
        }

        if (!this.connection.connected) {
            // The goal is to compare the oldest SDP with the latest one upon reconnect
            if (!this._cachedOldLocalSdp) {
                this._cachedOldLocalSdp = oldSDP;
            }
            this._cachedNewLocalSdp = newSDP;
            logger.warn('Not sending SSRC update while the signaling is disconnected');

            return;
        }

        this._cachedOldLocalSdp = undefined;
        this._cachedNewLocalSdp = undefined;

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
        const removedAnySSRCs = sdpDiffer.toJingle(remove);

        if (removedAnySSRCs) {
            logger.info('Sending source-remove', remove.tree());
            this.connection.sendIQ(
                remove, null,
                this.newJingleErrorHandler(remove), IQ_TIMEOUT);
        } else {
            logger.log('removal not necessary');
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

        const containsNewSSRCs = sdpDiffer.toJingle(add);

        if (containsNewSSRCs) {
            logger.info('Sending source-add', add.tree());
            this.connection.sendIQ(
                add, null, this.newJingleErrorHandler(add), IQ_TIMEOUT);
        } else {
            logger.log('addition not necessary');
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
                logger.debug(`Jingle error: ${JSON.stringify(error)}`);
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

        logger.debug(`Clearing modificationQueue on ${this}...`);

        // Remove any pending tasks from the queue
        this.modificationQueue.clear();

        logger.debug(`Queued PC close task on ${this}...`);
        this.modificationQueue.push(finishCallback => {
            // The signaling layer will remove it's listeners
            this.signalingLayer.setChatRoom(null);

            // do not try to close if already closed.
            this.peerconnection && this.peerconnection.close();
            finishCallback();
            logger.debug(`PC close task on ${this} done!`);
        });

        logger.debug(`Shutdown modificationQueue on ${this}!`);

        // No more tasks can go in after the close task
        this.modificationQueue.shutdown();
    }

    /**
     * Converts to string with minor summary.
     * @return {string}
     */
    toString() {
        return `JingleSessionPC[p2p=${this.isP2P},`
                    + `initiator=${this.isInitiator},sid=${this.sid}]`;
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
