/* global __filename, RTCSessionDescription */

import { Interop } from '@jitsi/sdp-interop';
import { getLogger } from 'jitsi-meet-logger';
import transform from 'sdp-transform';

import * as CodecMimeType from '../../service/RTC/CodecMimeType';
import * as MediaType from '../../service/RTC/MediaType';
import RTCEvents from '../../service/RTC/RTCEvents';
import * as SignalingEvents from '../../service/RTC/SignalingEvents';
import * as VideoType from '../../service/RTC/VideoType';
import browser from '../browser';
import * as GlobalOnErrorHandler from '../util/GlobalOnErrorHandler';
import RtxModifier from '../xmpp/RtxModifier';
import SDP from '../xmpp/SDP';
import SDPUtil from '../xmpp/SDPUtil';
import SdpConsistency from '../xmpp/SdpConsistency';
import { SdpTransformWrap } from '../xmpp/SdpTransformUtil';

import JitsiRemoteTrack from './JitsiRemoteTrack';
import LocalSdpMunger from './LocalSdpMunger';
import RTC from './RTC';
import RTCUtils from './RTCUtils';
import { SIM_LAYER_RIDS, TPCUtils } from './TPCUtils';

// FIXME SDP tools should end up in some kind of util module

const logger = getLogger(__filename);
const DEGRADATION_PREFERENCE_CAMERA = 'maintain-framerate';
const DEGRADATION_PREFERENCE_DESKTOP = 'maintain-resolution';
const DESKTOP_SHARE_RATE = 500000;
const HD_BITRATE = 2500000;
const LD_BITRATE = 200000;
const SD_BITRATE = 700000;

/* eslint-disable max-params */

/**
 * Creates new instance of 'TraceablePeerConnection'.
 *
 * @param {RTC} rtc the instance of <tt>RTC</tt> service
 * @param {number} id the peer connection id assigned by the parent RTC module.
 * @param {SignalingLayer} signalingLayer the signaling layer instance
 * @param {object} iceConfig WebRTC 'PeerConnection' ICE config
 * @param {object} constraints WebRTC 'PeerConnection' constraints
 * @param {boolean} isP2P indicates whether or not the new instance will be used
 * in a peer to peer connection
 * @param {object} options <tt>TracablePeerConnection</tt> config options.
 * @param {boolean} options.disableSimulcast if set to 'true' will disable
 * the simulcast.
 * @param {boolean} options.disableRtx if set to 'true' will disable the RTX
 * @param {boolean} options.capScreenshareBitrate if set to 'true' simulcast will
 * be disabled for screenshare and a max bitrate of 500Kbps will applied on the
 * stream.
 * @param {string} options.disabledCodec the mime type of the code that should
 * not be negotiated on the peerconnection.
 * @param {boolean} options.disableH264 If set to 'true' H264 will be
 *      disabled by removing it from the SDP (deprecated)
 * @param {boolean} options.preferH264 if set to 'true' H264 will be preferred
 * over other video codecs. (deprecated)
 * @param {string} options.preferredCodec the mime type of the codec that needs
 * to be made the preferred codec for the connection.
 * @param {boolean} options.startSilent If set to 'true' no audio will be sent or received.
 *
 * FIXME: initially the purpose of TraceablePeerConnection was to be able to
 * debug the peer connection. Since many other responsibilities have been added
 * it would make sense to extract a separate class from it and come up with
 * a more suitable name.
 *
 * @constructor
 */
export default function TraceablePeerConnection(
        rtc,
        id,
        signalingLayer,
        iceConfig,
        constraints,
        isP2P,
        options) {

    /**
     * Indicates whether or not this peer connection instance is actively
     * sending/receiving audio media. When set to <tt>false</tt> the SDP audio
     * media direction will be adjusted to 'inactive' in order to suspend
     * the transmission.
     * @type {boolean}
     * @private
     */
    this.audioTransferActive = !(options.startSilent === true);

    /**
     * The DTMF sender instance used to send DTMF tones.
     *
     * @type {RTCDTMFSender|undefined}
     * @private
     */
    this._dtmfSender = undefined;

    /**
     * @typedef {Object} TouchToneRequest
     * @property {string} tones - The DTMF tones string as defined by
     * {@code RTCDTMFSender.insertDTMF}, 'tones' argument.
     * @property {number} duration - The amount of time in milliseconds that
     * each DTMF should last.
     * @property {string} interToneGap - The length of time in miliseconds to
     * wait between tones.
     */
    /**
     * TouchToneRequests which are waiting to be played. This queue is filled
     * if there are touch tones currently being played.
     *
     * @type {Array<TouchToneRequest>}
     * @private
     */
    this._dtmfTonesQueue = [];

    /**
     * Indicates whether or not this peer connection instance is actively
     * sending/receiving video media. When set to <tt>false</tt> the SDP video
     * media direction will be adjusted to 'inactive' in order to suspend
     * the transmission.
     * @type {boolean}
     * @private
     */
    this.videoTransferActive = true;

    /**
     * The parent instance of RTC service which created this
     * <tt>TracablePeerConnection</tt>.
     * @type {RTC}
     */
    this.rtc = rtc;

    /**
     * The peer connection identifier assigned by the RTC module.
     * @type {number}
     */
    this.id = id;

    /**
     * Indicates whether or not this instance is used in a peer to peer
     * connection.
     * @type {boolean}
     */
    this.isP2P = isP2P;

    // FIXME: We should support multiple streams per jid.
    /**
     * The map holds remote tracks associated with this peer connection.
     * It maps user's JID to media type and remote track
     * (one track per media type per user's JID).
     * @type {Map<string, Map<MediaType, JitsiRemoteTrack>>}
     */
    this.remoteTracks = new Map();

    /**
     * A map which stores local tracks mapped by {@link JitsiLocalTrack.rtcId}
     * @type {Map<number, JitsiLocalTrack>}
     */
    this.localTracks = new Map();

    /**
     * Keeps tracks of the WebRTC <tt>MediaStream</tt>s that have been added to
     * the underlying WebRTC PeerConnection.
     * @type {Array}
     * @private
     */
    this._addedStreams = [];

    /**
     * @typedef {Object} TPCGroupInfo
     * @property {string} semantics the SSRC groups semantics
     * @property {Array<number>} ssrcs group's SSRCs in order where the first
     * one is group's primary SSRC, the second one is secondary (RTX) and so
     * on...
     */
    /**
     * @typedef {Object} TPCSSRCInfo
     * @property {Array<number>} ssrcs an array which holds all track's SSRCs
     * @property {Array<TPCGroupInfo>} groups an array stores all track's SSRC
     * groups
     */
    /**
     * Holds the info about local track's SSRCs mapped per their
     * {@link JitsiLocalTrack.rtcId}
     * @type {Map<number, TPCSSRCInfo>}
     */
    this.localSSRCs = new Map();

    /**
     * The local ICE username fragment for this session.
     */
    this.localUfrag = null;

    /**
     * The remote ICE username fragment for this session.
     */
    this.remoteUfrag = null;

    /**
     * The signaling layer which operates this peer connection.
     * @type {SignalingLayer}
     */
    this.signalingLayer = signalingLayer;

    // SignalingLayer listeners
    this._peerVideoTypeChanged = this._peerVideoTypeChanged.bind(this);
    this.signalingLayer.on(
        SignalingEvents.PEER_VIDEO_TYPE_CHANGED,
        this._peerVideoTypeChanged);

    this._peerMutedChanged = this._peerMutedChanged.bind(this);
    this.signalingLayer.on(
        SignalingEvents.PEER_MUTED_CHANGED,
        this._peerMutedChanged);
    this.options = options;

    // Make sure constraints is properly formatted in order to provide information about whether or not this
    // connection is P2P to rtcstats.
    const safeConstraints = constraints || {};

    safeConstraints.optional = safeConstraints.optional || [];

    // The `optional` parameter needs to be of type array, otherwise chrome will throw an error.
    // Firefox and Safari just ignore it.
    if (Array.isArray(safeConstraints.optional)) {
        safeConstraints.optional.push({ rtcStatsSFUP2P: this.isP2P });
    } else {
        logger.warn('Optional param is not an array, rtcstats p2p data is omitted.');
    }

    this.peerconnection
        = new RTCUtils.RTCPeerConnectionType(iceConfig, safeConstraints);

    // The standard video bitrates are used in Unified plan when switching
    // between camera/desktop tracks on the same sender.
    const standardVideoBitrates = {
        low: LD_BITRATE,
        standard: SD_BITRATE,
        high: HD_BITRATE
    };

    // Check if the max. bitrates for video are specified through config.js videoQuality settings.
    // These bitrates will be applied on all browsers for camera sources in both simulcast and p2p mode.
    this.videoBitrates = this.options.videoQuality && this.options.videoQuality.maxBitratesVideo
        ? this.options.videoQuality.maxBitratesVideo
        : standardVideoBitrates;

    this.tpcUtils = new TPCUtils(this, this.videoBitrates);
    this.updateLog = [];
    this.stats = {};
    this.statsinterval = null;

    /**
     * @type {number} The max number of stats to keep in this.stats. Limit to
     * 300 values, i.e. 5 minutes; set to 0 to disable
     */
    this.maxstats = options.maxstats;

    this.interop = new Interop();
    const Simulcast = require('@jitsi/sdp-simulcast');

    this.simulcast = new Simulcast(
        {
            numOfLayers: SIM_LAYER_RIDS.length,
            explodeRemoteSimulcast: false,
            usesUnifiedPlan: browser.usesUnifiedPlan()
        });
    this.sdpConsistency = new SdpConsistency(this.toString());

    /**
     * Munges local SDP provided to the Jingle Session in order to prevent from
     * sending SSRC updates on attach/detach and mute/unmute (for video).
     * @type {LocalSdpMunger}
     */
    this.localSdpMunger = new LocalSdpMunger(this);

    /**
     * TracablePeerConnection uses RTC's eventEmitter
     * @type {EventEmitter}
     */
    this.eventEmitter = rtc.eventEmitter;
    this.rtxModifier = new RtxModifier();

    /**
     * The height constraint applied on the video sender.
     */
    this.senderVideoMaxHeight = null;

    // override as desired
    this.trace = (what, info) => {
        logger.debug(what, info);

        this.updateLog.push({
            time: new Date(),
            type: what,
            value: info || ''
        });
    };
    this.onicecandidate = null;
    this.peerconnection.onicecandidate = event => {
        this.trace(
            'onicecandidate',
            JSON.stringify(event.candidate, null, ' '));

        if (this.onicecandidate !== null) {
            this.onicecandidate(event);
        }
    };

    // Use stream events in plan-b and track events in unified plan.
    if (browser.usesPlanB()) {
        this.peerconnection.onaddstream
            = event => this._remoteStreamAdded(event.stream);
        this.peerconnection.onremovestream
            = event => this._remoteStreamRemoved(event.stream);
    } else {
        this.peerconnection.ontrack = event => {
            const stream = event.streams[0];

            this._remoteTrackAdded(stream, event.track, event.transceiver);
            stream.onremovetrack = evt => {
                this._remoteTrackRemoved(stream, evt.track);
            };
        };
    }
    this.onsignalingstatechange = null;
    this.peerconnection.onsignalingstatechange = event => {
        this.trace('onsignalingstatechange', this.signalingState);
        if (this.onsignalingstatechange !== null) {
            this.onsignalingstatechange(event);
        }
    };
    this.oniceconnectionstatechange = null;
    this.peerconnection.oniceconnectionstatechange = event => {
        this.trace('oniceconnectionstatechange', this.iceConnectionState);
        if (this.oniceconnectionstatechange !== null) {
            this.oniceconnectionstatechange(event);
        }
    };
    this.onnegotiationneeded = null;
    this.peerconnection.onnegotiationneeded = event => {
        this.trace('onnegotiationneeded');
        if (this.onnegotiationneeded !== null) {
            this.onnegotiationneeded(event);
        }
    };
    this.ondatachannel = null;
    this.peerconnection.ondatachannel = event => {
        this.trace('ondatachannel');
        if (this.ondatachannel !== null) {
            this.ondatachannel(event);
        }
    };

    if (this.maxstats) {
        this.statsinterval = window.setInterval(() => {
            this.getStats(stats => {
                if (stats.result
                    && typeof stats.result === 'function') {
                    const results = stats.result();

                    for (let i = 0; i < results.length; ++i) {
                        const res = results[i];

                        res.names().forEach(name => {
                            this._processStat(res, name, res.stat(name));
                        });
                    }
                } else {
                    stats.forEach(r => this._processStat(r, '', r));
                }
            }, () => {

                // empty error callback
            });
        }, 1000);
    }

    logger.info(`Create new ${this}`);
}

/* eslint-enable max-params */

/**
 * Process stat and adds it to the array of stats we store.
 * @param report the current stats report.
 * @param name the name of the report, if available
 * @param statValue the value to add.
 * @private
 */
TraceablePeerConnection.prototype._processStat
    = function(report, name, statValue) {
        const id = `${report.id}-${name}`;
        let s = this.stats[id];
        const now = new Date();

        if (!s) {
            this.stats[id] = s = {
                startTime: now,
                endTime: now,
                values: [],
                times: []
            };
        }
        s.values.push(statValue);
        s.times.push(now.getTime());
        if (s.values.length > this.maxstats) {
            s.values.shift();
            s.times.shift();
        }
        s.endTime = now;
    };

/**
 * Returns a string representation of a SessionDescription object.
 */
const dumpSDP = function(description) {
    if (typeof description === 'undefined' || description === null) {
        return '';
    }

    return `type: ${description.type}\r\n${description.sdp}`;
};


/**
 * Forwards the {@link peerconnection.iceConnectionState} state except that it
 * will convert "completed" into "connected" where both mean that the ICE has
 * succeeded and is up and running. We never see "completed" state for
 * the JVB connection, but it started appearing for the P2P one. This method
 * allows to adapt old logic to this new situation.
 * @return {string}
 */
TraceablePeerConnection.prototype.getConnectionState = function() {
    const state = this.peerconnection.iceConnectionState;

    if (state === 'completed') {
        return 'connected';
    }

    return state;
};

/**
 * Obtains the media direction for given {@link MediaType}. The method takes
 * into account whether or not there are any local tracks for media and
 * the {@link audioTransferActive} and {@link videoTransferActive} flags.
 * @param {MediaType} mediaType
 * @return {string} one of the SDP direction constants ('sendrecv, 'recvonly'
 * etc.) which should be used when setting local description on the peer
 * connection.
 * @private
 */
TraceablePeerConnection.prototype._getDesiredMediaDirection = function(
        mediaType) {
    let mediaTransferActive = true;

    if (mediaType === MediaType.AUDIO) {
        mediaTransferActive = this.audioTransferActive;
    } else if (mediaType === MediaType.VIDEO) {
        mediaTransferActive = this.videoTransferActive;
    }
    if (mediaTransferActive) {
        return this.hasAnyTracksOfType(mediaType) ? 'sendrecv' : 'recvonly';
    }

    return 'inactive';
};

/**
 * Tells whether or not this TPC instance is using Simulcast.
 * @return {boolean} <tt>true</tt> if simulcast is enabled and active or
 * <tt>false</tt> if it's turned off.
 */
TraceablePeerConnection.prototype.isSimulcastOn = function() {
    return !this.options.disableSimulcast;
};

/**
 * Handles {@link SignalingEvents.PEER_VIDEO_TYPE_CHANGED}
 * @param {string} endpointId the video owner's ID (MUC nickname)
 * @param {VideoType} videoType the new value
 * @private
 */
TraceablePeerConnection.prototype._peerVideoTypeChanged = function(
        endpointId,
        videoType) {
    // Check if endpointId has a value to avoid action on random track
    if (!endpointId) {
        logger.error(`No endpointID on peerVideoTypeChanged ${this}`);

        return;
    }
    const videoTrack = this.getRemoteTracks(endpointId, MediaType.VIDEO);

    if (videoTrack.length) {
        // NOTE 1 track per media type is assumed
        videoTrack[0]._setVideoType(videoType);
    }
};

/**
 * Handles remote track mute / unmute events.
 * @param {string} endpointId the track owner's identifier (MUC nickname)
 * @param {MediaType} mediaType "audio" or "video"
 * @param {boolean} isMuted the new mute state
 * @private
 */
TraceablePeerConnection.prototype._peerMutedChanged = function(
        endpointId,
        mediaType,
        isMuted) {
    // Check if endpointId is a value to avoid doing action on all remote tracks
    if (!endpointId) {
        logger.error('On peerMuteChanged - no endpoint ID');

        return;
    }
    const track = this.getRemoteTracks(endpointId, mediaType);

    if (track.length) {
        // NOTE 1 track per media type is assumed
        track[0].setMute(isMuted);
    }
};

/**
 * Obtains audio levels of the remote audio tracks by getting the source
 * information on the RTCRtpReceivers. The information relevant to the ssrc
 * is updated each time a RTP packet constaining the ssrc is received.
 * @returns {Object} containing ssrc and audio level information as a
 * key-value pair.
 */
TraceablePeerConnection.prototype.getAudioLevels = function() {
    const audioLevels = {};
    const audioReceivers = this.peerconnection.getReceivers()
        .filter(receiver => receiver.track && receiver.track.kind === MediaType.AUDIO);

    audioReceivers.forEach(remote => {
        const ssrc = remote.getSynchronizationSources();

        if (ssrc && ssrc.length) {
            // As per spec, this audiolevel is a value between 0..1 (linear), where 1.0
            // represents 0 dBov, 0 represents silence, and 0.5 represents approximately
            // 6 dBSPL change in the sound pressure level from 0 dBov.
            // https://www.w3.org/TR/webrtc/#dom-rtcrtpcontributingsource-audiolevel
            audioLevels[ssrc[0].source] = ssrc[0].audioLevel;
        }
    });

    return audioLevels;
};

/**
 * Obtains local tracks for given {@link MediaType}. If the <tt>mediaType</tt>
 * argument is omitted the list of all local tracks will be returned.
 * @param {MediaType} [mediaType]
 * @return {Array<JitsiLocalTrack>}
 */
TraceablePeerConnection.prototype.getLocalTracks = function(mediaType) {
    let tracks = Array.from(this.localTracks.values());

    if (mediaType !== undefined) {
        tracks = tracks.filter(track => track.getType() === mediaType);
    }

    return tracks;
};

/**
 * Retrieves the local video track.
 *
 * @returns {JitsiLocalTrack|undefined} - local video track.
 */
TraceablePeerConnection.prototype.getLocalVideoTrack = function() {
    return this.getLocalTracks(MediaType.VIDEO)[0];
};

/**
 * Checks whether or not this {@link TraceablePeerConnection} instance contains
 * any local tracks for given <tt>mediaType</tt>.
 * @param {MediaType} mediaType
 * @return {boolean}
 */
TraceablePeerConnection.prototype.hasAnyTracksOfType = function(mediaType) {
    if (!mediaType) {
        throw new Error('"mediaType" is required');
    }

    return this.getLocalTracks(mediaType).length > 0;
};

/**
 * Obtains all remote tracks currently known to this PeerConnection instance.
 * @param {string} [endpointId] the track owner's identifier (MUC nickname)
 * @param {MediaType} [mediaType] the remote tracks will be filtered
 * by their media type if this argument is specified.
 * @return {Array<JitsiRemoteTrack>}
 */
TraceablePeerConnection.prototype.getRemoteTracks = function(
        endpointId,
        mediaType) {
    const remoteTracks = [];
    const endpoints
        = endpointId ? [ endpointId ] : this.remoteTracks.keys();

    for (const endpoint of endpoints) {
        const endpointTrackMap = this.remoteTracks.get(endpoint);

        if (!endpointTrackMap) {

            // Otherwise an empty Map() would have to be allocated above
            // eslint-disable-next-line no-continue
            continue;
        }

        for (const trackMediaType of endpointTrackMap.keys()) {
            // per media type filtering
            if (!mediaType || mediaType === trackMediaType) {
                const mediaTrack = endpointTrackMap.get(trackMediaType);

                if (mediaTrack) {
                    remoteTracks.push(mediaTrack);
                }
            }
        }
    }

    return remoteTracks;
};

/**
 * Parses the remote description and returns the sdp lines of the sources associated with a remote participant.
 *
 * @param {string} id Endpoint id of the remote participant.
 * @returns {Array<string>} The sdp lines that have the ssrc information.
 */
TraceablePeerConnection.prototype.getRemoteSourceInfoByParticipant = function(id) {
    const removeSsrcInfo = [];
    const remoteTracks = this.getRemoteTracks(id);

    if (!remoteTracks?.length) {
        return removeSsrcInfo;
    }
    const primarySsrcs = remoteTracks.map(track => track.getSSRC());
    const sdp = new SDP(this.remoteDescription.sdp);

    primarySsrcs.forEach((ssrc, idx) => {
        for (const media of sdp.media) {
            let lines = '';
            let ssrcLines = SDPUtil.findLines(media, `a=ssrc:${ssrc}`);

            if (ssrcLines.length) {
                if (!removeSsrcInfo[idx]) {
                    removeSsrcInfo[idx] = '';
                }

                // Check if there are any FID groups present for the primary ssrc.
                const fidLines = SDPUtil.findLines(media, `a=ssrc-group:FID ${ssrc}`);

                if (fidLines.length) {
                    const secondarySsrc = fidLines[0].split(' ')[2];

                    lines += `${fidLines[0]}\r\n`;
                    ssrcLines = ssrcLines.concat(SDPUtil.findLines(media, `a=ssrc:${secondarySsrc}`));
                }
                removeSsrcInfo[idx] += `${ssrcLines.join('\r\n')}\r\n`;
                removeSsrcInfo[idx] += lines;
            }
        }
    });

    return removeSsrcInfo;
};

/**
 * Tries to find {@link JitsiTrack} for given SSRC number. It will search both
 * local and remote tracks bound to this instance.
 * @param {number} ssrc
 * @return {JitsiTrack|null}
 */
TraceablePeerConnection.prototype.getTrackBySSRC = function(ssrc) {
    if (typeof ssrc !== 'number') {
        throw new Error(`SSRC ${ssrc} is not a number`);
    }
    for (const localTrack of this.localTracks.values()) {
        if (this.getLocalSSRC(localTrack) === ssrc) {
            return localTrack;
        }
    }
    for (const remoteTrack of this.getRemoteTracks()) {
        if (remoteTrack.getSSRC() === ssrc) {
            return remoteTrack;
        }
    }

    return null;
};

/**
 * Tries to find SSRC number for given {@link JitsiTrack} id. It will search
 * both local and remote tracks bound to this instance.
 * @param {string} id
 * @return {number|null}
 */
TraceablePeerConnection.prototype.getSsrcByTrackId = function(id) {

    const findTrackById = track => track.getTrack().id === id;
    const localTrack = this.getLocalTracks().find(findTrackById);

    if (localTrack) {
        return this.getLocalSSRC(localTrack);
    }

    const remoteTrack = this.getRemoteTracks().find(findTrackById);

    if (remoteTrack) {
        return remoteTrack.getSSRC();
    }

    return null;
};

/**
 * Called when new remote MediaStream is added to the PeerConnection.
 * @param {MediaStream} stream the WebRTC MediaStream for remote participant
 */
TraceablePeerConnection.prototype._remoteStreamAdded = function(stream) {
    const streamId = RTC.getStreamID(stream);

    if (!RTC.isUserStreamById(streamId)) {
        logger.info(
            `${this} ignored remote 'stream added' event for non-user stream`
             + `id: ${streamId}`);

        return;
    }

    // Bind 'addtrack'/'removetrack' event handlers
    if (browser.isChromiumBased()) {
        stream.onaddtrack = event => {
            this._remoteTrackAdded(stream, event.track);
        };
        stream.onremovetrack = event => {
            this._remoteTrackRemoved(stream, event.track);
        };
    }

    // Call remoteTrackAdded for each track in the stream
    const streamAudioTracks = stream.getAudioTracks();

    for (const audioTrack of streamAudioTracks) {
        this._remoteTrackAdded(stream, audioTrack);
    }
    const streamVideoTracks = stream.getVideoTracks();

    for (const videoTrack of streamVideoTracks) {
        this._remoteTrackAdded(stream, videoTrack);
    }
};


/**
 * Called on "track added" and "stream added" PeerConnection events (because we
 * handle streams on per track basis). Finds the owner and the SSRC for
 * the track and passes that to ChatRoom for further processing.
 * @param {MediaStream} stream the WebRTC MediaStream instance which is
 * the parent of the track
 * @param {MediaStreamTrack} track the WebRTC MediaStreamTrack added for remote
 * participant.
 * @param {RTCRtpTransceiver} transceiver the WebRTC transceiver that is created
 * for the remote participant in unified plan.
 */
TraceablePeerConnection.prototype._remoteTrackAdded = function(stream, track, transceiver = null) {
    const streamId = RTC.getStreamID(stream);
    const mediaType = track.kind;

    if (!this.isP2P && !RTC.isUserStreamById(streamId)) {
        logger.info(
            `${this} ignored remote 'stream added' event for non-user stream`
             + `id: ${streamId}`);

        return;
    }
    logger.info(`${this} remote track added:`, streamId, mediaType);

    // look up an associated JID for a stream id
    if (!mediaType) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error(
                `MediaType undefined for remote track, stream id: ${streamId}`
            ));

        // Abort
        return;
    }

    const remoteSDP = browser.usesPlanB()
        ? new SDP(this.remoteDescription.sdp)
        : new SDP(this.peerconnection.remoteDescription.sdp);
    let mediaLines;

    if (browser.usesUnifiedPlan()) {
        if (transceiver && transceiver.mid) {
            const mid = transceiver.mid;

            mediaLines = remoteSDP.media.filter(mls => SDPUtil.findLine(mls, `a=mid:${mid}`));
        } else {
            mediaLines = remoteSDP.media.filter(mls => {
                const msid = SDPUtil.findLine(mls, 'a=msid:');

                return typeof msid !== 'undefined' && streamId === msid.substring(7).split(' ')[0];
            });
        }
    } else {
        mediaLines = remoteSDP.media.filter(mls => mls.startsWith(`m=${mediaType}`));
    }

    if (!mediaLines.length) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error(
                `No media lines for type ${
                    mediaType} found in remote SDP for remote track: ${
                    streamId}`));

        // Abort
        return;
    }

    let ssrcLines = SDPUtil.findLines(mediaLines[0], 'a=ssrc:');

    ssrcLines
        = ssrcLines.filter(line => line.indexOf(`msid:${streamId}`) !== -1);
    if (!ssrcLines.length) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error(
                `No SSRC lines for streamId ${
                    streamId} for remote track, media type: ${mediaType}`));

        // Abort
        return;
    }

    // FIXME the length of ssrcLines[0] not verified, but it will fail
    // with global error handler anyway
    const ssrcStr = ssrcLines[0].substring(7).split(' ')[0];
    const trackSsrc = Number(ssrcStr);
    const ownerEndpointId = this.signalingLayer.getSSRCOwner(trackSsrc);

    if (isNaN(trackSsrc) || trackSsrc < 0) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error(
                `Invalid SSRC: ${ssrcStr} for remote track, msid: ${
                    streamId} media type: ${mediaType}`));

        // Abort
        return;
    } else if (!ownerEndpointId) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error(
                `No SSRC owner known for: ${
                    trackSsrc} for remote track, msid: ${
                    streamId} media type: ${mediaType}`));

        // Abort
        return;
    }

    logger.log(`${this} associated ssrc`, ownerEndpointId, trackSsrc);

    const peerMediaInfo
        = this.signalingLayer.getPeerMediaInfo(ownerEndpointId, mediaType);

    if (!peerMediaInfo) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error(
                `${this}: no peer media info available for ${
                    ownerEndpointId}`));

        return;
    }

    const muted = peerMediaInfo.muted;
    const videoType = peerMediaInfo.videoType; // can be undefined

    this._createRemoteTrack(
        ownerEndpointId, stream, track, mediaType, videoType, trackSsrc, muted);
};

// FIXME cleanup params
/* eslint-disable max-params */

/**
 * Initializes a new JitsiRemoteTrack instance with the data provided by
 * the signaling layer and SDP.
 *
 * @param {string} ownerEndpointId the owner's endpoint ID (MUC nickname)
 * @param {MediaStream} stream the WebRTC stream instance
 * @param {MediaStreamTrack} track the WebRTC track instance
 * @param {MediaType} mediaType the track's type of the media
 * @param {VideoType} [videoType] the track's type of the video (if applicable)
 * @param {number} ssrc the track's main SSRC number
 * @param {boolean} muted the initial muted status
 */
TraceablePeerConnection.prototype._createRemoteTrack = function(
        ownerEndpointId,
        stream,
        track,
        mediaType,
        videoType,
        ssrc,
        muted) {
    let remoteTracksMap = this.remoteTracks.get(ownerEndpointId);

    if (!remoteTracksMap) {
        remoteTracksMap = new Map();
        this.remoteTracks.set(ownerEndpointId, remoteTracksMap);
    }

    const existingTrack = remoteTracksMap.get(mediaType);

    // Delete the existing track and create the new one because of a known bug on Safari.
    // RTCPeerConnection.ontrack fires when a new remote track is added but MediaStream.onremovetrack doesn't so
    // it needs to be removed whenever a new track is received for the same endpoint id.
    if (existingTrack && browser.isWebKitBased()) {
        this._remoteTrackRemoved(existingTrack.getOriginalStream(), existingTrack.getTrack());
    }

    if (existingTrack && existingTrack.getTrack() === track) {
        // Ignore duplicated event which can originate either from 'onStreamAdded' or 'onTrackAdded'.
        logger.info(
            `${this} ignored duplicated remote track added event for: `
                + `${ownerEndpointId}, ${mediaType}`);

        return;
    } else if (existingTrack) {
        logger.error(`${this} received a second remote track for ${ownerEndpointId} ${mediaType}, `
            + 'deleting the existing track.');

        // The exisiting track needs to be removed here. We can get here when Jicofo reverses the order of source-add
        // and source-remove messages. Ideally, when a remote endpoint changes source, like switching devices, it sends
        // a source-remove (for old ssrc) followed by a source-add (for new ssrc) and Jicofo then should forward these
        // two messages to all the other endpoints in the conference in the same order. However, sometimes, these
        // messages arrive at the client in the reverse order resulting in two remote tracks (of same media type) being
        // created and in case of video, a black strip (that of the first track which has ended) appears over the live
        // track obscuring it. Removing the existing track when that happens will fix this issue.
        this._remoteTrackRemoved(existingTrack.getOriginalStream(), existingTrack.getTrack());
    }

    const remoteTrack
        = new JitsiRemoteTrack(
                this.rtc,
                this.rtc.conference,
                ownerEndpointId,
                stream,
                track,
                mediaType,
                videoType,
                ssrc,
                muted,
                this.isP2P);

    remoteTracksMap.set(mediaType, remoteTrack);

    this.eventEmitter.emit(RTCEvents.REMOTE_TRACK_ADDED, remoteTrack, this);
};

/* eslint-enable max-params */

/**
 * Handles remote stream removal.
 * @param stream the WebRTC MediaStream object which is being removed from the
 * PeerConnection
 */
TraceablePeerConnection.prototype._remoteStreamRemoved = function(stream) {
    if (!RTC.isUserStream(stream)) {
        const id = RTC.getStreamID(stream);

        logger.info(
            `Ignored remote 'stream removed' event for non-user stream ${id}`);

        return;
    }

    // Call remoteTrackRemoved for each track in the stream
    const streamVideoTracks = stream.getVideoTracks();

    for (const videoTrack of streamVideoTracks) {
        this._remoteTrackRemoved(stream, videoTrack);
    }
    const streamAudioTracks = stream.getAudioTracks();

    for (const audioTrack of streamAudioTracks) {
        this._remoteTrackRemoved(stream, audioTrack);
    }
};

/**
 * Handles remote media track removal.
 * @param {MediaStream} stream WebRTC MediaStream instance which is the parent
 * of the track.
 * @param {MediaStreamTrack} track the WebRTC MediaStreamTrack which has been
 * removed from the PeerConnection.
 */
TraceablePeerConnection.prototype._remoteTrackRemoved = function(
        stream,
        track) {
    const streamId = RTC.getStreamID(stream);
    const trackId = track && RTC.getTrackID(track);

    logger.info(`${this} - remote track removed: ${streamId}, ${trackId}`);

    if (!streamId) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error(`${this} remote track removal failed - no stream ID`));

        return;
    }

    if (!trackId) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error(`${this} remote track removal failed - no track ID`));

        return;
    }

    if (!this._removeRemoteTrackById(streamId, trackId)) {
        // NOTE this warning is always printed when user leaves the room,
        // because we remove remote tracks manually on MUC member left event,
        // before the SSRCs are removed by Jicofo. In most cases it is fine to
        // ignore this warning, but still it's better to keep it printed for
        // debugging purposes.
        //
        // We could change the behaviour to emit track removed only from here,
        // but the order of the events will change and consuming apps could
        // behave unexpectedly (the "user left" event would come before "track
        // removed" events).
        logger.warn(
            `${this} Removed track not found for msid: ${streamId},
             track id: ${trackId}`);
    }
};

/**
 * Finds remote track by it's stream and track ids.
 * @param {string} streamId the media stream id as defined by the WebRTC
 * @param {string} trackId the media track id as defined by the WebRTC
 * @return {JitsiRemoteTrack|undefined} the track's instance or
 * <tt>undefined</tt> if not found.
 * @private
 */
TraceablePeerConnection.prototype._getRemoteTrackById = function(
        streamId,
        trackId) {
    // .find will break the loop once the first match is found
    for (const endpointTrackMap of this.remoteTracks.values()) {
        for (const mediaTrack of endpointTrackMap.values()) {
            // FIXME verify and try to use ===
            /* eslint-disable eqeqeq */
            if (mediaTrack.getStreamId() == streamId
                && mediaTrack.getTrackId() == trackId) {
                return mediaTrack;
            }

            /* eslint-enable eqeqeq */
        }
    }

    return undefined;
};

/**
 * Removes all JitsiRemoteTracks associated with given MUC nickname
 * (resource part of the JID). Returns array of removed tracks.
 *
 * @param {string} owner - The resource part of the MUC JID.
 * @returns {JitsiRemoteTrack[]}
 */
TraceablePeerConnection.prototype.removeRemoteTracks = function(owner) {
    const removedTracks = [];
    const remoteTracksMap = this.remoteTracks.get(owner);

    if (remoteTracksMap) {
        const removedAudioTrack = remoteTracksMap.get(MediaType.AUDIO);
        const removedVideoTrack = remoteTracksMap.get(MediaType.VIDEO);

        removedAudioTrack && removedTracks.push(removedAudioTrack);
        removedVideoTrack && removedTracks.push(removedVideoTrack);

        this.remoteTracks.delete(owner);
    }

    logger.debug(
        `${this} removed remote tracks for ${owner} count: ${
            removedTracks.length}`);

    return removedTracks;
};

/**
 * Removes and disposes given <tt>JitsiRemoteTrack</tt> instance. Emits
 * {@link RTCEvents.REMOTE_TRACK_REMOVED}.
 * @param {JitsiRemoteTrack} toBeRemoved
 */
TraceablePeerConnection.prototype._removeRemoteTrack = function(toBeRemoved) {
    toBeRemoved.dispose();
    const participantId = toBeRemoved.getParticipantId();
    const remoteTracksMap = this.remoteTracks.get(participantId);

    if (!remoteTracksMap) {
        logger.error(
            `removeRemoteTrack: no remote tracks map for ${participantId}`);
    } else if (!remoteTracksMap.delete(toBeRemoved.getType())) {
        logger.error(
            `Failed to remove ${toBeRemoved} - type mapping messed up ?`);
    }
    this.eventEmitter.emit(RTCEvents.REMOTE_TRACK_REMOVED, toBeRemoved);
};

/**
 * Removes and disposes <tt>JitsiRemoteTrack</tt> identified by given stream and
 * track ids.
 *
 * @param {string} streamId the media stream id as defined by the WebRTC
 * @param {string} trackId the media track id as defined by the WebRTC
 * @returns {JitsiRemoteTrack|undefined} the track which has been removed or
 * <tt>undefined</tt> if no track matching given stream and track ids was
 * found.
 */
TraceablePeerConnection.prototype._removeRemoteTrackById = function(
        streamId,
        trackId) {
    const toBeRemoved = this._getRemoteTrackById(streamId, trackId);

    if (toBeRemoved) {
        this._removeRemoteTrack(toBeRemoved);
    }

    return toBeRemoved;
};

/**
 * @typedef {Object} SSRCGroupInfo
 * @property {Array<number>} ssrcs group's SSRCs
 * @property {string} semantics
 */
/**
 * @typedef {Object} TrackSSRCInfo
 * @property {Array<number>} ssrcs track's SSRCs
 * @property {Array<SSRCGroupInfo>} groups track's SSRC groups
 */
/**
 * Returns map with keys msid and <tt>TrackSSRCInfo</tt> values.
 * @param {Object} desc the WebRTC SDP instance.
 * @return {Map<string,TrackSSRCInfo>}
 */
function extractSSRCMap(desc) {
    /**
     * Track SSRC infos mapped by stream ID (msid)
     * @type {Map<string,TrackSSRCInfo>}
     */
    const ssrcMap = new Map();

    /**
     * Groups mapped by primary SSRC number
     * @type {Map<number,Array<SSRCGroupInfo>>}
     */
    const groupsMap = new Map();

    if (typeof desc !== 'object' || desc === null
        || typeof desc.sdp !== 'string') {
        logger.warn('An empty description was passed as an argument.');

        return ssrcMap;
    }

    const session = transform.parse(desc.sdp);

    if (!Array.isArray(session.media)) {
        return ssrcMap;
    }

    for (const mLine of session.media) {
        if (!Array.isArray(mLine.ssrcs)) {
            continue; // eslint-disable-line no-continue
        }

        if (Array.isArray(mLine.ssrcGroups)) {
            for (const group of mLine.ssrcGroups) {
                if (typeof group.semantics !== 'undefined'
                    && typeof group.ssrcs !== 'undefined') {
                    // Parse SSRCs and store as numbers
                    const groupSSRCs
                        = group.ssrcs.split(' ').map(
                            ssrcStr => parseInt(ssrcStr, 10));
                    const primarySSRC = groupSSRCs[0];

                    // Note that group.semantics is already present

                    group.ssrcs = groupSSRCs;

                    // eslint-disable-next-line max-depth
                    if (!groupsMap.has(primarySSRC)) {
                        groupsMap.set(primarySSRC, []);
                    }
                    groupsMap.get(primarySSRC).push(group);
                }
            }
        }
        for (const ssrc of mLine.ssrcs) {
            if (ssrc.attribute !== 'msid') {
                continue; // eslint-disable-line no-continue
            }

            const msid = ssrc.value;
            let ssrcInfo = ssrcMap.get(msid);

            if (!ssrcInfo) {
                ssrcInfo = {
                    ssrcs: [],
                    groups: [],
                    msid
                };
                ssrcMap.set(msid, ssrcInfo);
            }

            const ssrcNumber = ssrc.id;

            ssrcInfo.ssrcs.push(ssrcNumber);

            if (groupsMap.has(ssrcNumber)) {
                const ssrcGroups = groupsMap.get(ssrcNumber);

                for (const group of ssrcGroups) {
                    ssrcInfo.groups.push(group);
                }
            }
        }
    }

    return ssrcMap;
}

/**
 * Takes a SessionDescription object and returns a "normalized" version.
 * Currently it takes care of ordering the a=ssrc lines and denoting receive
 * only SSRCs.
 */
const normalizePlanB = function(desc) {
    if (typeof desc !== 'object' || desc === null
        || typeof desc.sdp !== 'string') {
        logger.warn('An empty description was passed as an argument.');

        return desc;
    }

    // eslint-disable-next-line no-shadow
    const transform = require('sdp-transform');
    const session = transform.parse(desc.sdp);

    if (typeof session !== 'undefined'
            && typeof session.media !== 'undefined'
            && Array.isArray(session.media)) {
        session.media.forEach(mLine => {

            // Chrome appears to be picky about the order in which a=ssrc lines
            // are listed in an m-line when rtx is enabled (and thus there are
            // a=ssrc-group lines with FID semantics). Specifically if we have
            // "a=ssrc-group:FID S1 S2" and the "a=ssrc:S2" lines appear before
            // the "a=ssrc:S1" lines, SRD fails.
            // So, put SSRC which appear as the first SSRC in an FID ssrc-group
            // first.
            const firstSsrcs = [];
            const newSsrcLines = [];

            if (typeof mLine.ssrcGroups !== 'undefined'
                && Array.isArray(mLine.ssrcGroups)) {
                mLine.ssrcGroups.forEach(group => {
                    if (typeof group.semantics !== 'undefined'
                        && group.semantics === 'FID') {
                        if (typeof group.ssrcs !== 'undefined') {
                            firstSsrcs.push(Number(group.ssrcs.split(' ')[0]));
                        }
                    }
                });
            }

            if (Array.isArray(mLine.ssrcs)) {
                let i;

                for (i = 0; i < mLine.ssrcs.length; i++) {
                    if (typeof mLine.ssrcs[i] === 'object'
                        && typeof mLine.ssrcs[i].id !== 'undefined'
                        && firstSsrcs.indexOf(mLine.ssrcs[i].id) >= 0) {
                        newSsrcLines.push(mLine.ssrcs[i]);
                        delete mLine.ssrcs[i];
                    }
                }

                for (i = 0; i < mLine.ssrcs.length; i++) {
                    if (typeof mLine.ssrcs[i] !== 'undefined') {
                        newSsrcLines.push(mLine.ssrcs[i]);
                    }
                }

                mLine.ssrcs = replaceDefaultUnifiedPlanMsid(newSsrcLines);
            }
        });
    }

    const resStr = transform.write(session);


    return new RTCSessionDescription({
        type: desc.type,
        sdp: resStr
    });
};

/**
 * Unified plan differentiates a remote track not associated with a stream using
 * the msid "-", which can incorrectly trigger an onaddstream event in plan-b.
 * For jitsi, these tracks are actually receive-only ssrcs. To prevent
 * onaddstream from firing, remove the ssrcs with msid "-" except the cname
 * line. Normally the ssrcs are not used by the client, as the bridge controls
 * media flow, but keep one reference to the ssrc for the p2p case.
 *
 * @param {Array<Object>} ssrcLines - The ssrc lines from a remote description.
 * @private
 * @returns {Array<Object>} ssrcLines with removed lines referencing msid "-".
 */
function replaceDefaultUnifiedPlanMsid(ssrcLines = []) {
    if (!browser.isChrome() || !browser.isVersionGreaterThan(70)) {
        return ssrcLines;
    }

    let filteredLines = [ ...ssrcLines ];

    const problematicSsrcIds = ssrcLines.filter(ssrcLine =>
        ssrcLine.attribute === 'mslabel' && ssrcLine.value === '-')
        .map(ssrcLine => ssrcLine.id);

    problematicSsrcIds.forEach(ssrcId => {
        // Find the cname which is to be modified and left in.
        const cnameLine = filteredLines.find(line =>
            line.id === ssrcId && line.attribute === 'cname');

        cnameLine.value = `recvonly-${ssrcId}`;

        // Remove all of lines for the ssrc.
        filteredLines
            = filteredLines.filter(line => line.id !== ssrcId);

        // But re-add the cname line so there is a reference kept to the ssrc
        // in the SDP.
        filteredLines.push(cnameLine);
    });

    return filteredLines;
}

/**
 * Makes sure that both audio and video directions are configured as 'sendrecv'.
 * @param {Object} localDescription the SDP object as defined by WebRTC.
 * @param {object} options <tt>TracablePeerConnection</tt> config options.
 */
const enforceSendRecv = function(localDescription, options) {
    if (!localDescription) {
        throw new Error('No local description passed in.');
    }

    const transformer = new SdpTransformWrap(localDescription.sdp);
    const audioMedia = transformer.selectMedia('audio');
    let changed = false;

    if (audioMedia && audioMedia.direction !== 'sendrecv') {
        if (options.startSilent) {
            audioMedia.direction = 'inactive';
        } else {
            audioMedia.direction = 'sendrecv';
        }

        changed = true;
    }

    const videoMedia = transformer.selectMedia('video');

    if (videoMedia && videoMedia.direction !== 'sendrecv') {
        videoMedia.direction = 'sendrecv';
        changed = true;
    }

    if (changed) {
        return new RTCSessionDescription({
            type: localDescription.type,
            sdp: transformer.toRawSDP()
        });
    }

    return localDescription;
};

/**
 *
 * @param {JitsiLocalTrack} localTrack
 */
TraceablePeerConnection.prototype.getLocalSSRC = function(localTrack) {
    const ssrcInfo = this._getSSRC(localTrack.rtcId);

    return ssrcInfo && ssrcInfo.ssrcs[0];
};

/**
 * When doing unified plan simulcast, we'll have a set of ssrcs with the
 * same msid but no ssrc-group, since unified plan signals the simulcast
 * group via the a=simulcast line.  Unfortunately, Jicofo will complain
 * if it sees ssrcs with matching msids but no ssrc-group, so we'll inject
 * an ssrc-group line to make Jicofo happy.
 * @param desc A session description object (with 'type' and 'sdp' fields)
 * @return A session description object with its sdp field modified to
 * contain an inject ssrc-group for simulcast
 */
TraceablePeerConnection.prototype._injectSsrcGroupForUnifiedSimulcast
    = function(desc) {
        const sdp = transform.parse(desc.sdp);
        const video = sdp.media.find(mline => mline.type === 'video');

        // Check if the browser supports RTX, add only the primary ssrcs to the
        // SIM group if that is the case.
        video.ssrcGroups = video.ssrcGroups || [];
        const fidGroups = video.ssrcGroups.filter(group => group.semantics === 'FID');

        if (video.simulcast || video.simulcast_03) {
            const ssrcs = [];

            if (fidGroups && fidGroups.length) {
                fidGroups.forEach(group => {
                    ssrcs.push(group.ssrcs.split(' ')[0]);
                });
            } else {
                video.ssrcs.forEach(ssrc => {
                    if (ssrc.attribute === 'msid') {
                        ssrcs.push(ssrc.id);
                    }
                });
            }
            if (video.ssrcGroups.find(group => group.semantics === 'SIM')) {
                // Group already exists, no need to do anything
                return desc;
            }
            video.ssrcGroups.push({
                semantics: 'SIM',
                ssrcs: ssrcs.join(' ')
            });
        }

        return new RTCSessionDescription({
            type: desc.type,
            sdp: transform.write(sdp)
        });
    };

/* eslint-disable-next-line vars-on-top */
const getters = {
    signalingState() {
        return this.peerconnection.signalingState;
    },
    iceConnectionState() {
        return this.peerconnection.iceConnectionState;
    },
    localDescription() {
        let desc = this.peerconnection.localDescription;

        if (!desc) {
            logger.debug('getLocalDescription no localDescription found');

            return {};
        }

        this.trace('getLocalDescription::preTransform', dumpSDP(desc));

        // if we're running on FF, transform to Plan B first.
        if (browser.usesUnifiedPlan()) {
            desc = this.interop.toPlanB(desc);
            this.trace('getLocalDescription::postTransform (Plan B)',
                dumpSDP(desc));

            desc = this._injectSsrcGroupForUnifiedSimulcast(desc);
            this.trace('getLocalDescription::postTransform (inject ssrc group)',
                dumpSDP(desc));
        } else {
            if (browser.doesVideoMuteByStreamRemove()) {
                desc = this.localSdpMunger.maybeAddMutedLocalVideoTracksToSDP(desc);
                logger.debug(
                    'getLocalDescription::postTransform (munge local SDP)', desc);
            }

            // What comes out of this getter will be signalled over Jingle to
            // the other peer, so we need to make sure the media direction is
            // 'sendrecv' because we won't change the direction later and don't want
            // the other peer to think we can't send or receive.
            //
            // Note that the description we set in chrome does have the accurate
            // direction (e.g. 'recvonly'), since that is technically what is
            // happening (check setLocalDescription impl).
            desc = enforceSendRecv(desc, this.options);
        }

        // See the method's doc for more info about this transformation.
        desc = this.localSdpMunger.transformStreamIdentifiers(desc);

        return desc;
    },
    remoteDescription() {
        let desc = this.peerconnection.remoteDescription;

        if (!desc) {
            logger.debug('getRemoteDescription no remoteDescription found');

            return {};
        }
        this.trace('getRemoteDescription::preTransform', dumpSDP(desc));

        // if we're running on FF, transform to Plan B first.
        if (browser.usesUnifiedPlan()) {
            desc = this.interop.toPlanB(desc);
            this.trace(
                'getRemoteDescription::postTransform (Plan B)', dumpSDP(desc));
        }

        return desc;
    }
};

Object.keys(getters).forEach(prop => {
    Object.defineProperty(
        TraceablePeerConnection.prototype,
        prop, {
            get: getters[prop]
        }
    );
});

TraceablePeerConnection.prototype._getSSRC = function(rtcId) {
    return this.localSSRCs.get(rtcId);
};

/**
 * Checks if screensharing is in progress.
 *
 * @returns {boolean}  Returns true if a desktop track has been added to the
 * peerconnection, false otherwise.
 */
TraceablePeerConnection.prototype._isSharingScreen = function() {
    const track = this.getLocalVideoTrack();

    return track && track.videoType === VideoType.DESKTOP;
};

/**
 * Munges the order of the codecs in the SDP passed based on the preference
 * set through config.js settings. All instances of the specified codec are
 * moved up to the top of the list when it is preferred. The specified codec
 * is deleted from the list if the configuration specifies that the codec be
 * disabled.
 * @param {RTCSessionDescription} description that needs to be munged.
 * @returns {RTCSessionDescription} the munged description.
 */
TraceablePeerConnection.prototype._mungeCodecOrder = function(description) {
    if (!this.codecPreference || browser.supportsCodecPreferences()) {
        return description;
    }

    const parsedSdp = transform.parse(description.sdp);
    const mLine = parsedSdp.media.find(m => m.type === this.codecPreference.mediaType);

    if (this.codecPreference.enable) {
        SDPUtil.preferCodec(mLine, this.codecPreference.mimeType);

        // Strip the high profile H264 codecs on mobile clients for p2p connection.
        // High profile codecs give better quality at the expense of higher load which
        // we do not want on mobile clients.
        // Jicofo offers only the baseline code for the jvb connection.
        // TODO - add check for mobile browsers once js-utils provides that check.
        if (this.codecPreference.mimeType === CodecMimeType.H264 && browser.isReactNative() && this.isP2P) {
            SDPUtil.stripCodec(mLine, this.codecPreference.mimeType, true /* high profile */);
        }

        // Set the max bitrate here on the SDP so that the configured max. bitrate is effective
        // as soon as the browser switches to VP9.
        if (this.codecPreference.mimeType === CodecMimeType.VP9) {
            const bitrates = Object.values(this.videoBitrates.VP9 || this.videoBitrates);

            // Use only the HD bitrate for now as there is no API available yet for configuring
            // the bitrates on the individual SVC layers.
            mLine.bandwidth = [ {
                type: 'AS',
                limit: this._isSharingScreen() ? HD_BITRATE : Math.floor(bitrates[2] / 1000)
            } ];
        }
    } else {
        SDPUtil.stripCodec(mLine, this.codecPreference.mimeType);
    }

    return new RTCSessionDescription({
        type: description.type,
        sdp: transform.write(parsedSdp)
    });
};

/**
 * Checks if given track belongs to this peerconnection instance.
 *
 * @param {JitsiLocalTrack|JitsiRemoteTrack} track - The track to be checked.
 * @returns {boolean}
 */
TraceablePeerConnection.prototype.containsTrack = function(track) {
    if (track.isLocal()) {
        return this.localTracks.has(track.rtcId);
    }

    const participantId = track.getParticipantId();
    const remoteTracksMap = this.remoteTracks.get(participantId);

    return Boolean(remoteTracksMap && remoteTracksMap.get(track.getType()) === track);
};

/**
 * Add {@link JitsiLocalTrack} to this TPC.
 * @param {JitsiLocalTrack} track
 * @param {boolean} isInitiator indicates if the endpoint is the offerer.
 * @returns {Promise<void>} - resolved when done.
 */
TraceablePeerConnection.prototype.addTrack = function(track, isInitiator = false) {
    const rtcId = track.rtcId;

    logger.info(`add ${track} to: ${this}`);

    if (this.localTracks.has(rtcId)) {

        return Promise.reject(new Error(`${track} is already in ${this}`));
    }

    this.localTracks.set(rtcId, track);

    // For p2p unified case, use addTransceiver API to add the tracks on the peerconnection.
    if (browser.usesUnifiedPlan() && this.isP2P) {
        this.tpcUtils.addTrack(track, isInitiator);
    } else {
        // In all other cases, i.e., plan-b and unified plan bridge case, use addStream API to
        // add the track to the peerconnection.
        // TODO - addTransceiver doesn't generate a MSID for the stream, which is needed for signaling
        // the ssrc to Jicofo. Switch to using UUID as MSID when addTransceiver is used in Unified plan
        // JVB connection case as well.
        const webrtcStream = track.getOriginalStream();

        if (webrtcStream) {
            this._addStream(webrtcStream);

        // It's not ok for a track to not have a WebRTC stream if:
        } else if (!browser.doesVideoMuteByStreamRemove()
                    || track.isAudioTrack()
                    || (track.isVideoTrack() && !track.isMuted())) {
            return Promise.reject(new Error(`${this} no WebRTC stream for: ${track}`));
        }

        // Muted video tracks do not have WebRTC stream
        if (browser.usesPlanB() && browser.doesVideoMuteByStreamRemove()
                && track.isVideoTrack() && track.isMuted()) {
            const ssrcInfo = this.generateNewStreamSSRCInfo(track);

            this.sdpConsistency.setPrimarySsrc(ssrcInfo.ssrcs[0]);
            const simGroup
                = ssrcInfo.groups.find(groupInfo => groupInfo.semantics === 'SIM');

            if (simGroup) {
                this.simulcast.setSsrcCache(simGroup.ssrcs);
            }
            const fidGroups
                = ssrcInfo.groups.filter(
                    groupInfo => groupInfo.semantics === 'FID');

            if (fidGroups) {
                const rtxSsrcMapping = new Map();

                fidGroups.forEach(fidGroup => {
                    const primarySsrc = fidGroup.ssrcs[0];
                    const rtxSsrc = fidGroup.ssrcs[1];

                    rtxSsrcMapping.set(primarySsrc, rtxSsrc);
                });
                this.rtxModifier.setSsrcCache(rtxSsrcMapping);
            }
        }
    }

    let promiseChain = Promise.resolve();

    // On Firefox, the encodings have to be configured on the sender only after the transceiver is created.
    if (browser.isFirefox()) {
        promiseChain = this.tpcUtils.setEncodings(track);
    }

    return promiseChain;
};

/**
 * Adds local track as part of the unmute operation.
 * @param {JitsiLocalTrack} track the track to be added as part of the unmute
 * operation
 * @return {Promise<boolean>} Promise that resolves to true if the underlying PeerConnection's
 * state has changed and renegotiation is required, false if no renegotiation is needed or
 * Promise is rejected when something goes wrong.
 */
TraceablePeerConnection.prototype.addTrackUnmute = function(track) {
    if (!this._assertTrackBelongs('addTrackUnmute', track)) {
        // Abort
        return Promise.reject('Track not found on the peerconnection');
    }

    logger.info(`Adding ${track} as unmute to ${this}`);
    const webRtcStream = track.getOriginalStream();

    if (!webRtcStream) {
        logger.error(
            `Unable to add ${track} as unmute to ${this} - no WebRTC stream`);

        return Promise.reject('Stream not found');
    }

    if (browser.usesUnifiedPlan()) {
        return this.tpcUtils.addTrackUnmute(track);
    }

    this._addStream(webRtcStream);

    return Promise.resolve(true);
};

/**
 * Adds WebRTC media stream to the underlying PeerConnection
 * @param {MediaStream} mediaStream
 * @private
 */
TraceablePeerConnection.prototype._addStream = function(mediaStream) {
    this.peerconnection.addStream(mediaStream);
    this._addedStreams.push(mediaStream);
};

/**
 * Removes WebRTC media stream from the underlying PeerConection
 * @param {MediaStream} mediaStream
 */
TraceablePeerConnection.prototype._removeStream = function(mediaStream) {
    this.peerconnection.removeStream(mediaStream);
    this._addedStreams
        = this._addedStreams.filter(stream => stream !== mediaStream);
};

/**
 * This method when called will check if given <tt>localTrack</tt> belongs to
 * this TPC (that it has been previously added using {@link addTrack}). If the
 * track does not belong an error message will be logged.
 * @param {string} methodName the method name that will be logged in an error
 * message
 * @param {JitsiLocalTrack} localTrack
 * @return {boolean} <tt>true</tt> if given local track belongs to this TPC or
 * <tt>false</tt> otherwise.
 * @private
 */
TraceablePeerConnection.prototype._assertTrackBelongs = function(
        methodName,
        localTrack) {
    const doesBelong = this.localTracks.has(localTrack.rtcId);

    if (!doesBelong) {
        logger.error(
            `${methodName}: ${localTrack} does not belong to ${this}`);
    }

    return doesBelong;
};

/**
 * Returns the codec that is configured on the client as the preferred video codec.
 * This takes into account the current order of codecs in the local description sdp.
 *
 * @returns {CodecMimeType} The codec that is set as the preferred codec to receive
 * video in the local SDP.
 */
TraceablePeerConnection.prototype.getConfiguredVideoCodec = function() {
    const sdp = this.localDescription.sdp;
    const defaultCodec = CodecMimeType.VP8;

    if (!sdp) {
        return defaultCodec;
    }
    const parsedSdp = transform.parse(sdp);
    const mLine = parsedSdp.media.find(m => m.type === MediaType.VIDEO);
    const codec = mLine.rtp[0].codec;

    if (codec) {
        return Object.values(CodecMimeType).find(value => value === codec.toLowerCase());
    }

    return defaultCodec;
};

/**
 * Sets the codec preference on the peerconnection. The codec preference goes into effect when
 * the next renegotiation happens.
 *
 * @param {CodecMimeType} preferredCodec the preferred codec.
 * @param {CodecMimeType} disabledCodec the codec that needs to be disabled.
 * @returns {void}
 */
TraceablePeerConnection.prototype.setVideoCodecs = function(preferredCodec = null, disabledCodec = null) {
    // If both enable and disable are set, disable settings will prevail.
    const enable = disabledCodec === null;
    const mimeType = disabledCodec ? disabledCodec : preferredCodec;

    if (this.codecPreference && (preferredCodec || disabledCodec)) {
        this.codecPreference.enable = enable;
        this.codecPreference.mimeType = mimeType;
    } else if (preferredCodec || disabledCodec) {
        this.codecPreference = {
            enable,
            mediaType: MediaType.VIDEO,
            mimeType
        };
    } else {
        logger.warn(`Invalid codec settings: preferred ${preferredCodec}, disabled ${disabledCodec},
            atleast one value is needed`);
    }

    if (browser.supportsCodecPreferences()) {
        // TODO implement codec preference using RTCRtpTransceiver.setCodecPreferences()
        // We are using SDP munging for now until all browsers support this.
    }
};

/**
 * Tells if the given WebRTC <tt>MediaStream</tt> has been added to
 * the underlying WebRTC PeerConnection.
 * @param {MediaStream} mediaStream
 * @returns {boolean}
 */
TraceablePeerConnection.prototype.isMediaStreamInPc = function(mediaStream) {
    return this._addedStreams.indexOf(mediaStream) > -1;
};

/**
 * Remove local track from this TPC.
 * @param {JitsiLocalTrack} localTrack the track to be removed from this TPC.
 *
 * FIXME It should probably remove a boolean just like {@link removeTrackMute}
 *       The same applies to addTrack.
 */
TraceablePeerConnection.prototype.removeTrack = function(localTrack) {
    const webRtcStream = localTrack.getOriginalStream();

    this.trace(
        'removeStream',
        localTrack.rtcId, webRtcStream ? webRtcStream.id : undefined);

    if (!this._assertTrackBelongs('removeStream', localTrack)) {
        // Abort - nothing to be done here
        return;
    }
    this.localTracks.delete(localTrack.rtcId);
    this.localSSRCs.delete(localTrack.rtcId);

    if (webRtcStream) {
        this.peerconnection.removeStream(webRtcStream);
    }
};

/**
 * Returns the sender corresponding to the given media type.
 * @param {MEDIA_TYPE} mediaType - The media type 'audio' or 'video' to be used for the search.
 * @returns {RTPSender|undefined} - The found sender or undefined if no sender
 * was found.
 */
TraceablePeerConnection.prototype.findSenderByKind = function(mediaType) {
    return this.peerconnection.getSenders().find(s => s.track && s.track.kind === mediaType);
};

/**
 * Returns the receiver corresponding to the given MediaStreamTrack.
 *
 * @param {MediaSreamTrack} track - The media stream track used for the search.
 * @returns {RTCRtpReceiver|undefined} - The found receiver or undefined if no receiver
 * was found.
 */
TraceablePeerConnection.prototype.findReceiverForTrack = function(track) {
    return this.peerconnection.getReceivers().find(r => r.track === track);
};

/**
 * Returns the sender corresponding to the given MediaStreamTrack.
 *
 * @param {MediaSreamTrack} track - The media stream track used for the search.
 * @returns {RTCRtpSender|undefined} - The found sender or undefined if no sender
 * was found.
 */
TraceablePeerConnection.prototype.findSenderForTrack = function(track) {
    return this.peerconnection.getSenders().find(s => s.track === track);
};

/**
 * Replaces <tt>oldTrack</tt> with <tt>newTrack</tt> from the peer connection.
 * Either <tt>oldTrack</tt> or <tt>newTrack</tt> can be null; replacing a valid
 * <tt>oldTrack</tt> with a null <tt>newTrack</tt> effectively just removes
 * <tt>oldTrack</tt>
 *
 * @param {JitsiLocalTrack|null} oldTrack - The current track in use to be
 * replaced
 * @param {JitsiLocalTrack|null} newTrack - The new track to use
 * @returns {Promise<boolean>} - If the promise resolves with true,
 * renegotiation will be needed. Otherwise no renegotiation is needed.
 */
TraceablePeerConnection.prototype.replaceTrack = function(oldTrack, newTrack) {
    if (browser.usesUnifiedPlan()) {
        logger.debug('TPC.replaceTrack using unified plan.');

        return this.tpcUtils.replaceTrack(oldTrack, newTrack)

            // renegotiate when SDP is used for simulcast munging
            .then(() => this.isSimulcastOn() && browser.usesSdpMungingForSimulcast());
    }

    logger.debug('TPC.replaceTrack using plan B.');

    let promiseChain = Promise.resolve();

    if (oldTrack) {
        this.removeTrack(oldTrack);
    }
    if (newTrack) {
        promiseChain = this.addTrack(newTrack);
    }

    return promiseChain.then(() => true);
};

/**
 * Removes local track as part of the mute operation.
 * @param {JitsiLocalTrack} localTrack the local track to be remove as part of
 * the mute operation.
 * @return {Promise<boolean>} Promise that resolves to true if the underlying PeerConnection's
 * state has changed and renegotiation is required, false if no renegotiation is needed or
 * Promise is rejected when something goes wrong.
 */
TraceablePeerConnection.prototype.removeTrackMute = function(localTrack) {
    const webRtcStream = localTrack.getOriginalStream();

    this.trace(
        'removeStreamMute',
        localTrack.rtcId, webRtcStream ? webRtcStream.id : null);

    if (!this._assertTrackBelongs('removeStreamMute', localTrack)) {
        // Abort - nothing to be done here
        return Promise.reject('Track not found in the peerconnection');
    }

    if (browser.usesUnifiedPlan()) {
        return this.tpcUtils.removeTrackMute(localTrack);
    }

    if (webRtcStream) {
        logger.info(
            `Removing ${localTrack} as mute from ${this}`);
        this._removeStream(webRtcStream);

        return Promise.resolve(true);
    }

    logger.error(`removeStreamMute - no WebRTC stream for ${localTrack}`);

    return Promise.reject('Stream not found');
};

TraceablePeerConnection.prototype.createDataChannel = function(label, opts) {
    this.trace('createDataChannel', label, opts);

    return this.peerconnection.createDataChannel(label, opts);
};

/**
 * Ensures that the simulcast ssrc-group appears after any other ssrc-groups
 * in the SDP so that simulcast is properly activated.
 *
 * @param {Object} localSdp the WebRTC session description instance for
 * the local description.
 * @private
 */
TraceablePeerConnection.prototype._ensureSimulcastGroupIsLast = function(
        localSdp) {
    let sdpStr = localSdp.sdp;

    const videoStartIndex = sdpStr.indexOf('m=video');
    const simStartIndex = sdpStr.indexOf('a=ssrc-group:SIM', videoStartIndex);
    let otherStartIndex = sdpStr.lastIndexOf('a=ssrc-group');

    if (simStartIndex === -1
        || otherStartIndex === -1
        || otherStartIndex === simStartIndex) {
        return localSdp;
    }

    const simEndIndex = sdpStr.indexOf('\r\n', simStartIndex);
    const simStr = sdpStr.substring(simStartIndex, simEndIndex + 2);

    sdpStr = sdpStr.replace(simStr, '');
    otherStartIndex = sdpStr.lastIndexOf('a=ssrc-group');
    const otherEndIndex = sdpStr.indexOf('\r\n', otherStartIndex);
    const sdpHead = sdpStr.slice(0, otherEndIndex);
    const simStrTrimmed = simStr.trim();
    const sdpTail = sdpStr.slice(otherEndIndex);

    sdpStr = `${sdpHead}\r\n${simStrTrimmed}${sdpTail}`;

    return new RTCSessionDescription({
        type: localSdp.type,
        sdp: sdpStr
    });
};

/**
 * Will adjust audio and video media direction in the given SDP object to
 * reflect the current status of the {@link audioTransferActive} and
 * {@link videoTransferActive} flags.
 * @param {Object} localDescription the WebRTC session description instance for
 * the local description.
 * @private
 */
TraceablePeerConnection.prototype._adjustLocalMediaDirection = function(
        localDescription) {
    const transformer = new SdpTransformWrap(localDescription.sdp);
    let modifiedDirection = false;
    const audioMedia = transformer.selectMedia('audio');

    if (audioMedia) {
        const desiredAudioDirection
            = this._getDesiredMediaDirection(MediaType.AUDIO);

        if (audioMedia.direction !== desiredAudioDirection) {
            audioMedia.direction = desiredAudioDirection;
            logger.info(
                `Adjusted local audio direction to ${desiredAudioDirection}`);
            modifiedDirection = true;
        }
    } else {
        logger.warn('No "audio" media found int the local description');
    }

    const videoMedia = transformer.selectMedia('video');

    if (videoMedia) {
        const desiredVideoDirection
            = this._getDesiredMediaDirection(MediaType.VIDEO);

        if (videoMedia.direction !== desiredVideoDirection) {
            videoMedia.direction = desiredVideoDirection;
            logger.info(
                `Adjusted local video direction to ${desiredVideoDirection}`);
            modifiedDirection = true;
        }
    } else {
        logger.warn('No "video" media found in the local description');
    }

    if (modifiedDirection) {
        return new RTCSessionDescription({
            type: localDescription.type,
            sdp: transformer.toRawSDP()
        });
    }

    return localDescription;
};

TraceablePeerConnection.prototype.setLocalDescription = function(description) {
    let localSdp = description;

    this.trace('setLocalDescription::preTransform', dumpSDP(localSdp));

    // Munge the order of the codecs based on the preferences set through config.js
    localSdp = this._mungeCodecOrder(localSdp);

    if (browser.usesPlanB()) {
        localSdp = this._adjustLocalMediaDirection(localSdp);
        localSdp = this._ensureSimulcastGroupIsLast(localSdp);
    } else {

        // if we're using unified plan, transform to it first.
        localSdp = this.interop.toUnifiedPlan(localSdp);
        this.trace(
            'setLocalDescription::postTransform (Unified Plan)',
            dumpSDP(localSdp));
    }

    return new Promise((resolve, reject) => {
        this.peerconnection.setLocalDescription(localSdp)
            .then(() => {
                this.trace('setLocalDescriptionOnSuccess');
                const localUfrag = SDPUtil.getUfrag(localSdp.sdp);

                if (localUfrag !== this.localUfrag) {
                    this.localUfrag = localUfrag;
                    this.eventEmitter.emit(
                        RTCEvents.LOCAL_UFRAG_CHANGED, this, localUfrag);
                }
                resolve();
            }, err => {
                this.trace('setLocalDescriptionOnFailure', err);
                this.eventEmitter.emit(
                    RTCEvents.SET_LOCAL_DESCRIPTION_FAILED,
                    err, this);
                reject(err);
            });
    });
};

/**
 * Enables/disables audio media transmission on this peer connection. When
 * disabled the SDP audio media direction in the local SDP will be adjusted to
 * 'inactive' which means that no data will be sent nor accepted, but
 * the connection should be kept alive.
 * @param {boolean} active <tt>true</tt> to enable audio media transmission or
 * <tt>false</tt> to disable. If the value is not a boolean the call will have
 * no effect.
 * @return {boolean} <tt>true</tt> if the value has changed and sRD/sLD cycle
 * needs to be executed in order for the changes to take effect or
 * <tt>false</tt> if the given value was the same as the previous one.
 * @public
 */
TraceablePeerConnection.prototype.setAudioTransferActive = function(active) {
    logger.debug(`${this} audio transfer active: ${active}`);
    const changed = this.audioTransferActive !== active;

    this.audioTransferActive = active;

    if (browser.usesUnifiedPlan()) {
        this.tpcUtils.setAudioTransferActive(active);

        // false means no renegotiation up the chain which is not needed in the Unified mode
        return false;
    }

    return changed;
};

/**
 * Sets the degradation preference on the video sender. This setting determines if
 * resolution or framerate will be preferred when bandwidth or cpu is constrained.
 * Sets it to 'maintain-framerate' when a camera track is added to the pc, sets it
 * to 'maintain-resolution' when a desktop track is being shared instead.
 * @returns {Promise<void>}
 */
TraceablePeerConnection.prototype.setSenderVideoDegradationPreference = function() {
    if (!this.peerconnection.getSenders) {
        logger.debug('Browser does not support RTCRtpSender');

        return Promise.resolve();
    }
    const localVideoTrack = this.getLocalVideoTrack();
    const videoSender = this.findSenderByKind(MediaType.VIDEO);

    if (!videoSender) {
        return Promise.resolve();
    }
    const parameters = videoSender.getParameters();
    const preference = localVideoTrack.videoType === VideoType.CAMERA
        ? DEGRADATION_PREFERENCE_CAMERA
        : this.options.capScreenshareBitrate && browser.usesPlanB()

            // Prefer resolution for low fps share.
            ? DEGRADATION_PREFERENCE_DESKTOP

            // Prefer frame-rate for high fps share.
            : DEGRADATION_PREFERENCE_CAMERA;

    logger.info(`Setting a degradation preference of ${preference} on local video track`);
    parameters.degradationPreference = preference;
    this.tpcUtils.updateEncodingsResolution(parameters);

    return videoSender.setParameters(parameters);
};

/**
 * Sets the max bitrate on the RTCRtpSender so that the
 * bitrate of the enocder doesn't exceed the configured value.
 * This is needed for the desktop share until spec-complaint
 * simulcast is implemented.
 * @param {JitsiLocalTrack} localTrack - the local track whose
 * max bitrate is to be configured.
 * @returns {Promise<void>}
 */
TraceablePeerConnection.prototype.setMaxBitRate = function() {
    // For VP9, max bitrate is configured by setting b=AS value in SDP. Browsers do
    // not yet support setting max bitrates for individual VP9 SVC layers.
    if (this.getConfiguredVideoCodec() === CodecMimeType.VP9 || !window.RTCRtpSender) {
        return Promise.resolve();
    }
    const localVideoTrack = this.getLocalVideoTrack();

    if (!localVideoTrack) {
        return Promise.resolve();
    }

    const videoType = localVideoTrack.videoType;
    const planBScreenSharing = browser.usesPlanB() && videoType === VideoType.DESKTOP;

    // Apply the maxbitrates on the video track when one of the conditions is met.
    // 1. Max. bitrates for video are specified through videoQuality settings in config.js
    // 2. Track is a desktop track and bitrate is capped using capScreenshareBitrate option in plan-b mode.
    // 3. The client is running in Unified plan mode.
    if (!((this.options.videoQuality && this.options.videoQuality.maxBitratesVideo)
        || (planBScreenSharing && this.options.capScreenshareBitrate)
        || browser.usesUnifiedPlan())) {
        return Promise.resolve();
    }

    const presenterEnabled = localVideoTrack._originalStream
        && localVideoTrack._originalStream.id !== localVideoTrack.getStreamId();
    const videoSender = this.findSenderByKind(MediaType.VIDEO);

    if (!videoSender) {
        return Promise.resolve();
    }
    const parameters = videoSender.getParameters();

    if (!(parameters.encodings && parameters.encodings.length)) {
        return Promise.resolve();
    }

    if (this.isSimulcastOn()) {
        for (const encoding in parameters.encodings) {
            if (parameters.encodings.hasOwnProperty(encoding)) {
                let bitrate;

                if (planBScreenSharing) {
                    // On chromium, set a max bitrate of 500 Kbps for screenshare when capScreenshareBitrate
                    // is enabled through config.js and presenter is not turned on.
                    // FIXME the top 'isSimulcastOn' condition is confusing for screensharing, because
                    // if capScreenshareBitrate option is enabled then the simulcast is turned off
                    bitrate = this.options.capScreenshareBitrate
                        ? presenterEnabled ? HD_BITRATE : DESKTOP_SHARE_RATE

                        // Remove the bitrate config if not capScreenshareBitrate:
                        // When switching from camera to desktop and videoQuality.maxBitratesVideo were set,
                        // then the 'maxBitrate' setting must be cleared, because if simulcast is enabled for screen
                        // and maxBitrates are set then Chrome will not send the screen stream (plan B).
                        : undefined;
                } else {
                    bitrate = this.tpcUtils.localStreamEncodingsConfig[encoding].maxBitrate;
                }

                logger.info(`${this} Setting a max bitrate of ${bitrate} bps on layer `
                    + `${this.tpcUtils.localStreamEncodingsConfig[encoding].rid}`);
                parameters.encodings[encoding].maxBitrate = bitrate;
            }
        }
    } else {
        // Do not change the max bitrate for desktop tracks in non-simulcast mode.
        let bitrate = this.videoBitrates.high;

        if (videoType === VideoType.CAMERA) {
            // Determine the bitrates based on the sender constraint applied for unicast tracks.
            const scaleFactor = this.senderVideoMaxHeight
                ? Math.floor(localVideoTrack.resolution / this.senderVideoMaxHeight)
                : 1;
            const encoding = this.tpcUtils.localStreamEncodingsConfig
                .find(layer => layer.scaleResolutionDownBy === scaleFactor);

            if (encoding) {
                logger.info(`${this} Setting a max bitrate of ${encoding.maxBitrate} bps on local video track`);
                bitrate = encoding.maxBitrate;
            }
        }
        parameters.encodings[0].maxBitrate = bitrate;
    }
    this.tpcUtils.updateEncodingsResolution(parameters);

    return videoSender.setParameters(parameters);
};

TraceablePeerConnection.prototype.setRemoteDescription = function(description) {
    this.trace('setRemoteDescription::preTransform', dumpSDP(description));

    // Munge the order of the codecs based on the preferences set through config.js
    // eslint-disable-next-line no-param-reassign
    description = this._mungeCodecOrder(description);

    if (browser.usesPlanB()) {
        // TODO the focus should squeze or explode the remote simulcast
        if (this.isSimulcastOn()) {
            // eslint-disable-next-line no-param-reassign
            description = this.simulcast.mungeRemoteDescription(description, true /* add x-google-conference flag */);
            this.trace(
                'setRemoteDescription::postTransform (simulcast)',
                dumpSDP(description));
        }

        // eslint-disable-next-line no-param-reassign
        description = normalizePlanB(description);
    } else {
        const currentDescription = this.peerconnection.remoteDescription;

        // eslint-disable-next-line no-param-reassign
        description = this.interop.toUnifiedPlan(description, currentDescription);
        this.trace(
            'setRemoteDescription::postTransform (Unified)',
            dumpSDP(description));

        if (this.isSimulcastOn()) {
            // eslint-disable-next-line no-param-reassign
            description = this.simulcast.mungeRemoteDescription(description);

            // eslint-disable-next-line no-param-reassign
            description = this.tpcUtils.insertUnifiedPlanSimulcastReceive(description);
            this.trace(
                'setRemoteDescription::postTransform (sim receive)',
                dumpSDP(description));

            // eslint-disable-next-line no-param-reassign
            description = this.tpcUtils.ensureCorrectOrderOfSsrcs(description);
        }
    }

    return new Promise((resolve, reject) => {
        this.peerconnection.setRemoteDescription(description)
            .then(() => {
                this.trace('setRemoteDescriptionOnSuccess');
                const remoteUfrag = SDPUtil.getUfrag(description.sdp);

                if (remoteUfrag !== this.remoteUfrag) {
                    this.remoteUfrag = remoteUfrag;
                    this.eventEmitter.emit(
                        RTCEvents.REMOTE_UFRAG_CHANGED, this, remoteUfrag);
                }
                resolve();
            }, err => {
                this.trace('setRemoteDescriptionOnFailure', err);
                this.eventEmitter.emit(
                    RTCEvents.SET_REMOTE_DESCRIPTION_FAILED,
                    err,
                    this);
                reject(err);
            });
    });
};

/**
 * Changes the resolution of the video stream that is sent to the peer based on
 * the user preferred value. If simulcast is enabled on the peerconection, all the
 * simulcast encodings that have a resolution height lower or equal to the value
 * provided will remain active. For the non-simulcast case, video constraint is
 * applied on the track.
 * @param {number} frameHeight - The user preferred max frame height.
 * @returns {Promise} promise that will be resolved when the operation is
 * successful and rejected otherwise.
 */
TraceablePeerConnection.prototype.setSenderVideoConstraint = function(frameHeight = null) {
    if (frameHeight < 0) {
        throw new Error(`Invalid frameHeight: ${frameHeight}`);
    }

    // XXX: This is not yet supported on mobile.
    if (browser.isReactNative()) {
        return Promise.resolve();
    }

    // Need to explicitly check for null as 0 is falsy, but a valid value
    const newHeight = frameHeight === null ? this.senderVideoMaxHeight : frameHeight;

    this.senderVideoMaxHeight = newHeight;

    // If layer suspension is disabled and sender constraint is not configured for the conference,
    // resolve here so that the encodings stay enabled. This can happen in custom apps built using
    // lib-jitsi-meet.
    if (newHeight === null) {
        return Promise.resolve();
    }

    logger.log(`${this} senderVideoMaxHeight: ${newHeight}`);

    const localVideoTrack = this.getLocalVideoTrack();

    if (!localVideoTrack || localVideoTrack.isMuted()) {
        return Promise.resolve();
    }
    const videoSender = this.findSenderByKind(MediaType.VIDEO);

    if (!videoSender) {
        return Promise.resolve();
    }
    const parameters = videoSender.getParameters();

    if (!parameters || !parameters.encodings || !parameters.encodings.length) {
        return Promise.resolve();
    }

    if (this.isSimulcastOn()) {
        // Determine the encodings that need to stay enabled based on the new frameHeight provided.
        const encodingsEnabledState = this.tpcUtils.getLocalStreamHeightConstraints(localVideoTrack.track)
            .map(height => height <= newHeight);

        // Always keep the LD stream enabled, specifically when the LD stream's resolution is higher than of the
        // requested resolution. This can happen when camera is captured at resolutions higher than 720p but the
        // requested resolution is 180. Since getParameters doesn't give us information about the resolutions
        // of the simulcast encodings, we have to rely on our initial config for the simulcast streams.
        const ldStreamIndex = this.tpcUtils.localStreamEncodingsConfig
            .findIndex(layer => layer.scaleResolutionDownBy === 4.0);

        if (newHeight > 0 && ldStreamIndex !== -1) {
            encodingsEnabledState[ldStreamIndex] = true;
        }
        for (const encoding in parameters.encodings) {
            if (parameters.encodings.hasOwnProperty(encoding)) {
                parameters.encodings[encoding].active = encodingsEnabledState[encoding];
            }
        }
        this.tpcUtils.updateEncodingsResolution(parameters);
    } else if (newHeight > 0) {
        // Do not scale down the desktop tracks until SendVideoController is able to propagate the sender constraints
        // only on the active media connection. Right now, the sender constraints received on the bridge channel
        // are propagated on both the jvb and p2p connections in cases where they both are active at the same time.
        parameters.encodings[0].scaleResolutionDownBy
            = localVideoTrack.videoType === VideoType.DESKTOP || localVideoTrack.resolution <= newHeight
                ? 1
                : Math.floor(localVideoTrack.resolution / newHeight);
        parameters.encodings[0].active = true;
    } else {
        parameters.encodings[0].scaleResolutionDownBy = undefined;
        parameters.encodings[0].active = false;
    }

    logger.info(`${this} setting max height of ${newHeight}, encodings: ${JSON.stringify(parameters.encodings)}`);

    return videoSender.setParameters(parameters).then(() => {
        localVideoTrack.maxEnabledResolution = newHeight;
        this.eventEmitter.emit(RTCEvents.LOCAL_TRACK_MAX_ENABLED_RESOLUTION_CHANGED, localVideoTrack);

        // Max bitrate needs to be reconfigured on the sender in p2p/non-simulcast case if needed when
        // the send resolution changes.
        if (this.isP2P || !this.isSimulcastOn()) {
            return this.setMaxBitRate();
        }
    });
};

/**
 * Enables/disables video media transmission on this peer connection. When
 * disabled the SDP video media direction in the local SDP will be adjusted to
 * 'inactive' which means that no data will be sent nor accepted, but
 * the connection should be kept alive.
 * @param {boolean} active <tt>true</tt> to enable video media transmission or
 * <tt>false</tt> to disable. If the value is not a boolean the call will have
 * no effect.
 * @return {boolean} <tt>true</tt> if the value has changed and sRD/sLD cycle
 * needs to be executed in order for the changes to take effect or
 * <tt>false</tt> if the given value was the same as the previous one.
 * @public
 */
TraceablePeerConnection.prototype.setVideoTransferActive = function(active) {
    logger.debug(`${this} video transfer active: ${active}`);
    const changed = this.videoTransferActive !== active;

    this.videoTransferActive = active;

    if (browser.usesUnifiedPlan()) {
        this.tpcUtils.setVideoTransferActive(active);

        // false means no renegotiation up the chain which is not needed in the Unified mode
        return false;
    }

    return changed;
};

/**
 * Sends DTMF tones if possible.
 *
 * @param {string} tones - The DTMF tones string as defined by {@code RTCDTMFSender.insertDTMF}, 'tones' argument.
 * @param {number} duration - The amount of time in milliseconds that each DTMF should last. It's 200ms by default.
 * @param {number} interToneGap - The length of time in miliseconds to wait between tones. It's 200ms by default.
 *
 * @returns {void}
 */
TraceablePeerConnection.prototype.sendTones = function(tones, duration = 200, interToneGap = 200) {
    if (!this._dtmfSender) {
        if (this.peerconnection.getSenders) {
            const rtpSender = this.peerconnection.getSenders().find(s => s.dtmf);

            this._dtmfSender = rtpSender && rtpSender.dtmf;
            this._dtmfSender && logger.info(`${this} initialized DTMFSender using getSenders`);
        }

        if (!this._dtmfSender) {
            const localAudioTrack = Array.from(this.localTracks.values()).find(t => t.isAudioTrack());

            if (this.peerconnection.createDTMFSender && localAudioTrack) {
                this._dtmfSender = this.peerconnection.createDTMFSender(localAudioTrack.getTrack());
            }
            this._dtmfSender && logger.info(`${this} initialized DTMFSender using deprecated createDTMFSender`);
        }

        if (this._dtmfSender) {
            this._dtmfSender.ontonechange = this._onToneChange.bind(this);
        }
    }

    if (this._dtmfSender) {
        if (this._dtmfSender.toneBuffer) {
            this._dtmfTonesQueue.push({
                tones,
                duration,
                interToneGap
            });

            return;
        }

        this._dtmfSender.insertDTMF(tones, duration, interToneGap);
    } else {
        logger.warn(`${this} sendTones - failed to select DTMFSender`);
    }
};

/**
 * Callback ivoked by {@code this._dtmfSender} when it has finished playing
 * a single tone.
 *
 * @param {Object} event - The tonechange event which indicates what characters
 * are left to be played for the current tone.
 * @private
 * @returns {void}
 */
TraceablePeerConnection.prototype._onToneChange = function(event) {
    // An empty event.tone indicates the current tones have finished playing.
    // Automatically start playing any queued tones on finish.
    if (this._dtmfSender && event.tone === '' && this._dtmfTonesQueue.length) {
        const { tones, duration, interToneGap } = this._dtmfTonesQueue.shift();

        this._dtmfSender.insertDTMF(tones, duration, interToneGap);
    }
};

/**
 * Makes the underlying TraceablePeerConnection generate new SSRC for
 * the recvonly video stream.
 */
TraceablePeerConnection.prototype.generateRecvonlySsrc = function() {
    const newSSRC = SDPUtil.generateSsrc();

    logger.info(`${this} generated new recvonly SSRC: ${newSSRC}`);
    this.sdpConsistency.setPrimarySsrc(newSSRC);
};

/**
 * Makes the underlying TraceablePeerConnection forget the current primary video
 * SSRC.
 */
TraceablePeerConnection.prototype.clearRecvonlySsrc = function() {
    logger.info('Clearing primary video SSRC!');
    this.sdpConsistency.clearVideoSsrcCache();
};

/**
 * Closes underlying WebRTC PeerConnection instance and removes all remote
 * tracks by emitting {@link RTCEvents.REMOTE_TRACK_REMOVED} for each one of
 * them.
 */
TraceablePeerConnection.prototype.close = function() {
    this.trace('stop');

    // Off SignalingEvents
    this.signalingLayer.off(
        SignalingEvents.PEER_MUTED_CHANGED, this._peerMutedChanged);
    this.signalingLayer.off(
        SignalingEvents.PEER_VIDEO_TYPE_CHANGED, this._peerVideoTypeChanged);

    for (const peerTracks of this.remoteTracks.values()) {
        for (const remoteTrack of peerTracks.values()) {
            this._removeRemoteTrack(remoteTrack);
        }
    }
    this.remoteTracks.clear();

    this._addedStreams = [];

    this._dtmfSender = null;
    this._dtmfTonesQueue = [];

    if (!this.rtc._removePeerConnection(this)) {
        logger.error('RTC._removePeerConnection returned false');
    }
    if (this.statsinterval !== null) {
        window.clearInterval(this.statsinterval);
        this.statsinterval = null;
    }
    logger.info(`Closing ${this}...`);
    this.peerconnection.close();
};

TraceablePeerConnection.prototype.createAnswer = function(constraints) {
    return this._createOfferOrAnswer(false /* answer */, constraints);
};

TraceablePeerConnection.prototype.createOffer = function(constraints) {
    return this._createOfferOrAnswer(true /* offer */, constraints);
};

TraceablePeerConnection.prototype._createOfferOrAnswer = function(
        isOffer,
        constraints) {
    const logName = isOffer ? 'Offer' : 'Answer';

    this.trace(`create${logName}`, JSON.stringify(constraints, null, ' '));

    const handleSuccess = (resultSdp, resolveFn, rejectFn) => {
        try {
            this.trace(
                `create${logName}OnSuccess::preTransform`, dumpSDP(resultSdp));

            if (browser.usesPlanB()) {
                // If there are no local video tracks, then a "recvonly"
                // SSRC needs to be generated
                if (!this.hasAnyTracksOfType(MediaType.VIDEO)
                    && !this.sdpConsistency.hasPrimarySsrcCached()) {
                    this.generateRecvonlySsrc();
                }

                // eslint-disable-next-line no-param-reassign
                resultSdp = new RTCSessionDescription({
                    type: resultSdp.type,
                    sdp: this.sdpConsistency.makeVideoPrimarySsrcsConsistent(
                        resultSdp.sdp)
                });

                this.trace(
                    `create${logName}OnSuccess::postTransform `
                         + '(make primary audio/video ssrcs consistent)',
                    dumpSDP(resultSdp));
            }

            // Configure simulcast for camera tracks always and for desktop tracks only when
            // the "capScreenshareBitrate" flag in config.js is disabled.
            if (this.isSimulcastOn() && browser.usesSdpMungingForSimulcast()
                && (!this.options.capScreenshareBitrate
                || (this.options.capScreenshareBitrate && !this._isSharingScreen()))) {
                // eslint-disable-next-line no-param-reassign
                resultSdp = this.simulcast.mungeLocalDescription(resultSdp);
                this.trace(
                    `create${logName}`
                        + 'OnSuccess::postTransform (simulcast)',
                    dumpSDP(resultSdp));
            }

            if (!this.options.disableRtx && browser.usesSdpMungingForSimulcast()) {
                // eslint-disable-next-line no-param-reassign
                resultSdp = new RTCSessionDescription({
                    type: resultSdp.type,
                    sdp: this.rtxModifier.modifyRtxSsrcs(resultSdp.sdp)
                });

                this.trace(
                    `create${logName}`
                         + 'OnSuccess::postTransform (rtx modifier)',
                    dumpSDP(resultSdp));
            }

            const ssrcMap = extractSSRCMap(resultSdp);

            logger.debug('Got local SSRCs MAP: ', ssrcMap);
            this._processLocalSSRCsMap(ssrcMap);

            resolveFn(resultSdp);
        } catch (e) {
            this.trace(`create${logName}OnError`, e);
            this.trace(`create${logName}OnError`, dumpSDP(resultSdp));
            logger.error(`create${logName}OnError`, e, dumpSDP(resultSdp));

            rejectFn(e);
        }
    };

    const handleFailure = (err, rejectFn) => {
        this.trace(`create${logName}OnFailure`, err);
        const eventType
            = isOffer
                ? RTCEvents.CREATE_OFFER_FAILED
                : RTCEvents.CREATE_ANSWER_FAILED;

        this.eventEmitter.emit(eventType, err, this);

        rejectFn(err);
    };

    return new Promise((resolve, reject) => {
        let oaPromise;

        if (isOffer) {
            oaPromise = this.peerconnection.createOffer(constraints);
        } else {
            oaPromise = this.peerconnection.createAnswer(constraints);
        }

        oaPromise
            .then(
                sdp => handleSuccess(sdp, resolve, reject),
                error => handleFailure(error, reject));
    });
};

/**
 * Extract primary SSRC from given {@link TrackSSRCInfo} object.
 * @param {TrackSSRCInfo} ssrcObj
 * @return {number|null} the primary SSRC or <tt>null</tt>
 */
TraceablePeerConnection.prototype._extractPrimarySSRC = function(ssrcObj) {
    if (ssrcObj && ssrcObj.groups && ssrcObj.groups.length) {
        return ssrcObj.groups[0].ssrcs[0];
    } else if (ssrcObj && ssrcObj.ssrcs && ssrcObj.ssrcs.length) {
        return ssrcObj.ssrcs[0];
    }

    return null;
};

/**
 * Goes over the SSRC map extracted from the latest local description and tries
 * to match them with the local tracks (by MSID). Will update the values
 * currently stored in the {@link TraceablePeerConnection.localSSRCs} map.
 * @param {Map<string,TrackSSRCInfo>} ssrcMap
 * @private
 */
TraceablePeerConnection.prototype._processLocalSSRCsMap = function(ssrcMap) {
    for (const track of this.localTracks.values()) {
        const trackMSID = track.storedMSID;

        if (ssrcMap.has(trackMSID)) {
            const newSSRC = ssrcMap.get(trackMSID);

            if (!newSSRC) {
                logger.error(`No SSRC found for: ${trackMSID} in ${this}`);

                return;
            }
            const oldSSRC = this.localSSRCs.get(track.rtcId);
            const newSSRCNum = this._extractPrimarySSRC(newSSRC);
            const oldSSRCNum = this._extractPrimarySSRC(oldSSRC);

            // eslint-disable-next-line no-negated-condition
            if (newSSRCNum !== oldSSRCNum) {
                if (oldSSRCNum === null) {
                    logger.info(
                        `Storing new local SSRC for ${track} in ${this}`,
                        newSSRC);
                } else {
                    logger.error(
                        `Overwriting SSRC for ${track} ${trackMSID} in ${this
                        } with: `, newSSRC);
                }
                this.localSSRCs.set(track.rtcId, newSSRC);

                this.eventEmitter.emit(
                    RTCEvents.LOCAL_TRACK_SSRC_UPDATED, track, newSSRCNum);
            } else {
                logger.debug(
                    `The local SSRC(${newSSRCNum}) for ${track} ${trackMSID}`
                     + `is still up to date in ${this}`);
            }
        } else if (!track.isVideoTrack() && !track.isMuted()) {
            // It is normal to find no SSRCs for a muted video track in
            // the local SDP as the recv-only SSRC is no longer munged in.
            // So log the warning only if it's not a muted video track.
            logger.warn(`No SSRCs found in the local SDP for ${track} MSID: ${trackMSID} in ${this}`);
        }
    }
};

TraceablePeerConnection.prototype.addIceCandidate = function(candidate) {
    this.trace('addIceCandidate', JSON.stringify({
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
        usernameFragment: candidate.usernameFragment
    }, null, ' '));

    return this.peerconnection.addIceCandidate(candidate);
};

/**
 * Obtains call-related stats from the peer connection.
 *
 * @param {Function} callback - The function to invoke after successfully
 * obtaining stats.
 * @param {Function} errback - The function to invoke after failing to obtain
 * stats.
 * @returns {void}
 */
TraceablePeerConnection.prototype.getStats = function(callback, errback) {
    // TODO (brian): After moving all browsers to adapter, check if adapter is
    // accounting for different getStats apis, making the browser-checking-if
    // unnecessary.
    if (browser.isWebKitBased() || browser.isFirefox() || browser.isReactNative()) {
        // uses the new Promise based getStats
        this.peerconnection.getStats()
            .then(callback)
            .catch(errback || (() => {

                // Making sure that getStats won't fail if error callback is
                // not passed.
            }));
    } else {
        this.peerconnection.getStats(callback);
    }
};

/**
 * Generates and stores new SSRC info object for given local track.
 * The method should be called only for a video track being added to this TPC
 * in the muted state (given that the current browser uses this strategy).
 * @param {JitsiLocalTrack} track
 * @return {TPCSSRCInfo}
 */
TraceablePeerConnection.prototype.generateNewStreamSSRCInfo = function(track) {
    const rtcId = track.rtcId;
    let ssrcInfo = this._getSSRC(rtcId);

    if (ssrcInfo) {
        logger.error(`Will overwrite local SSRCs for track ID: ${rtcId}`);
    }

    // Configure simulcast for camera tracks always and for desktop tracks only when
    // the "capScreenshareBitrate" flag in config.js is disabled.
    if (this.isSimulcastOn()
        && (!this.options.capScreenshareBitrate
        || (this.options.capScreenshareBitrate && !this._isSharingScreen()))) {
        ssrcInfo = {
            ssrcs: [],
            groups: []
        };
        for (let i = 0; i < SIM_LAYER_RIDS.length; i++) {
            ssrcInfo.ssrcs.push(SDPUtil.generateSsrc());
        }
        ssrcInfo.groups.push({
            ssrcs: ssrcInfo.ssrcs.slice(),
            semantics: 'SIM'
        });
    } else {
        ssrcInfo = {
            ssrcs: [ SDPUtil.generateSsrc() ],
            groups: []
        };
    }
    if (!this.options.disableRtx) {
        // Specifically use a for loop here because we'll
        //  be adding to the list we're iterating over, so we
        //  only want to iterate through the items originally
        //  on the list
        const currNumSsrcs = ssrcInfo.ssrcs.length;

        for (let i = 0; i < currNumSsrcs; ++i) {
            const primarySsrc = ssrcInfo.ssrcs[i];
            const rtxSsrc = SDPUtil.generateSsrc();

            ssrcInfo.ssrcs.push(rtxSsrc);
            ssrcInfo.groups.push({
                ssrcs: [ primarySsrc, rtxSsrc ],
                semantics: 'FID'
            });
        }
    }
    ssrcInfo.msid = track.storedMSID;
    this.localSSRCs.set(rtcId, ssrcInfo);

    return ssrcInfo;
};

/**
 * Creates a text representation of this <tt>TraceablePeerConnection</tt>
 * instance.
 * @return {string}
 */
TraceablePeerConnection.prototype.toString = function() {
    return `TPC[${this.id},p2p:${this.isP2P}]`;
};
