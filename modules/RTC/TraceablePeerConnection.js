import { getLogger } from '@jitsi/logger';
import { cloneDeep } from 'lodash-es';
import transform from 'sdp-transform';

import { CodecMimeType } from '../../service/RTC/CodecMimeType';
import { MediaDirection } from '../../service/RTC/MediaDirection';
import { MediaType } from '../../service/RTC/MediaType';
import RTCEvents from '../../service/RTC/RTCEvents';
import * as SignalingEvents from '../../service/RTC/SignalingEvents';
import { getSourceIndexFromSourceName } from '../../service/RTC/SignalingLayer';
import { SSRC_GROUP_SEMANTICS, VIDEO_QUALITY_LEVELS } from '../../service/RTC/StandardVideoQualitySettings';
import { VideoType } from '../../service/RTC/VideoType';
import { VIDEO_CODEC_CHANGED } from '../../service/statistics/AnalyticsEvents';
import { SS_DEFAULT_FRAME_RATE } from '../RTC/ScreenObtainer';
import browser from '../browser';
import FeatureFlags from '../flags/FeatureFlags';
import LocalSdpMunger from '../sdp/LocalSdpMunger';
import RtxModifier from '../sdp/RtxModifier';
import SDP from '../sdp/SDP';
import SDPUtil from '../sdp/SDPUtil';
import SdpSimulcast from '../sdp/SdpSimulcast';
import { SdpTransformWrap } from '../sdp/SdpTransformUtil';
import Statistics from '../statistics/statistics';

import JitsiRemoteTrack from './JitsiRemoteTrack';
import RTCUtils from './RTCUtils';
import { TPCUtils } from './TPCUtils';

// FIXME SDP tools should end up in some kind of util module

const logger = getLogger(__filename);
const DEGRADATION_PREFERENCE_CAMERA = 'maintain-framerate';
const DEGRADATION_PREFERENCE_DESKTOP = 'maintain-resolution';

/* eslint-disable max-params */

/**
 * Creates new instance of 'TraceablePeerConnection'.
 *
 * @param {RTC} rtc the instance of <tt>RTC</tt> service
 * @param {number} id the peer connection id assigned by the parent RTC module.
 * @param {SignalingLayer} signalingLayer the signaling layer instance
 * @param {object} pcConfig The {@code RTCConfiguration} to use for the WebRTC peer connection.
 * @param {object} constraints WebRTC 'PeerConnection' constraints
 * @param {boolean} isP2P indicates whether or not the new instance will be used in a peer to peer connection.
 * @param {object} options <tt>TracablePeerConnection</tt> config options.
 * @param {Object} options.audioQuality - Quality settings to applied on the outbound audio stream.
 * @param {boolean} options.capScreenshareBitrate if set to true, lower layers will be disabled for screenshare.
 * @param {Array<CodecMimeType>} options.codecSettings - codec settings to be applied for video streams.
 * @param {boolean} options.disableSimulcast if set to 'true' will disable the simulcast.
 * @param {boolean} options.disableRtx if set to 'true' will disable the RTX.
 * @param {boolean} options.enableInsertableStreams set to true when the insertable streams constraints is to be
 * enabled on the PeerConnection.
 * @param {boolean} options.forceTurnRelay If set to true, the browser will generate only Relay ICE candidates.
 * @param {boolean} options.startSilent If set to 'true' no audio will be sent or received.
 * @param {Object} options.videoQuality - Quality settings to applied on the outbound video streams.
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
        pcConfig,
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

    /**
     * A map that holds remote tracks signaled on the peerconnection indexed by their SSRC.
     * @type {Map<number, JitsiRemoteTrack>}
     */
    this.remoteTracksBySsrc = new Map();

    /**
     * The map holds remote tracks associated with this peer connection. It maps user's JID to media type and a set of
     * remote tracks.
     * @type {Map<string, Map<MediaType, Set<JitsiRemoteTrack>>>}
     */
    this.remoteTracks = new Map();

    /**
     * A map which stores local tracks mapped by {@link JitsiLocalTrack.rtcId}
     * @type {Map<number, JitsiLocalTrack>}
     */
    this.localTracks = new Map();

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
     * The set of remote SSRCs seen so far.
     * Distinguishes new SSRCs from those that have been remapped.
     * @type {Set<number>}
     */
    this.remoteSSRCs = new Set();

    /**
     * Mapping of source-names and their associated SSRCs that have been signaled by the JVB.
     * @type {Map<string, number>}
     */
    this.remoteSources = new Map();

    /**
     * The local ICE username fragment for this session.
     */
    this.localUfrag = null;

    /**
     * The remote ICE username fragment for this session.
     */
    this.remoteUfrag = null;

    /**
     * The DTLS transport object for the PeerConnection.
     * Note: this assume only one shared transport exists because we bundled
     *       all streams on the same underlying transport.
     */
    this._dtlsTransport = null;

    /**
     * The signaling layer which operates this peer connection.
     * @type {SignalingLayer}
     */
    this.signalingLayer = signalingLayer;

    // SignalingLayer listeners
    this._peerVideoTypeChanged = this._peerVideoTypeChanged.bind(this);
    this.signalingLayer.on(SignalingEvents.PEER_VIDEO_TYPE_CHANGED, this._peerVideoTypeChanged);

    this._peerMutedChanged = this._peerMutedChanged.bind(this);
    this.signalingLayer.on(SignalingEvents.PEER_MUTED_CHANGED, this._peerMutedChanged);
    this.options = options;

    // Setup SignalingLayer listeners for source-name based events.
    this.signalingLayer.on(SignalingEvents.SOURCE_MUTED_CHANGED,
        (sourceName, isMuted) => this._sourceMutedChanged(sourceName, isMuted));
    this.signalingLayer.on(SignalingEvents.SOURCE_VIDEO_TYPE_CHANGED,
        (sourceName, videoType) => this._sourceVideoTypeChanged(sourceName, videoType));

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

    this.peerconnection = new RTCPeerConnection(pcConfig, safeConstraints);

    this.tpcUtils = new TPCUtils(this, {
        audioQuality: options.audioQuality,
        isP2P: this.isP2P,
        videoQuality: options.videoQuality
    });
    this.updateLog = [];
    this.stats = {};
    this.statsinterval = null;

    /**
     * Flag used to indicate if low fps screenshare is desired.
     */
    this._capScreenshareBitrate = this.options.capScreenshareBitrate;

    /**
     * Codec preferences set for the peerconnection through config.js.
     */
    this.codecSettings = this.options.codecSettings;

    /**
     * Flag used to indicate if RTCRtpTransceiver#setCodecPreferences is to be used instead of SDP
     * munging for codec selection.
     */
    browser.supportsCodecPreferences()
        && logger.info('Using RTCRtpTransceiver#setCodecPreferences for codec selection');

    /**
     * Flag used to indicate if the codecs are configured using the codec selection API without having the need to
     * trigger a renegotiation for the change to be effective.
     */
    this._usesCodecSelectionAPI = this.options.usesCodecSelectionAPI;

    /**
     * Indicates whether an audio track has ever been added to the peer connection.
     */
    this._hasHadAudioTrack = false;

    /**
     * Indicates whether a video track has ever been added to the peer connection.
     */
    this._hasHadVideoTrack = false;

    /**
     * @type {number} The max number of stats to keep in this.stats. Limit to
     * 300 values, i.e. 5 minutes; set to 0 to disable
     */
    this.maxstats = options.maxstats;

    this.simulcast = new SdpSimulcast();

    /**
     * Munges local SDP provided to the Jingle Session in order to prevent from
     * sending SSRC updates on attach/detach and mute/unmute (for video).
     * @type {LocalSdpMunger}
     */
    this.localSdpMunger = new LocalSdpMunger(this, this.rtc.getLocalEndpointId());

    /**
     * TracablePeerConnection uses RTC's eventEmitter
     * @type {EventEmitter}
     */
    this.eventEmitter = rtc.eventEmitter;
    this.rtxModifier = new RtxModifier();

    /**
     * The height constraints to be applied on the sender per local video source (source name as the key).
     * @type {Map<string, number>}
     */
    this._senderMaxHeights = new Map();

    /**
     * Holds the RTCRtpTransceiver mids that the local tracks are attached to, mapped per their
     * {@link JitsiLocalTrack.rtcId}.
     * @type {Map<string, string>}
     */
    this.localTrackTransceiverMids = new Map();

    /**
     * Holds the SSRC map for the local tracks mapped by their source names.
     *
     * @type {Map<string, TPCSourceInfo>}
     * @property {string} msid - The track's MSID.
     * @property {Array<string>} ssrcs - The SSRCs associated with the track.
     * @property {Array<TPCGroupInfo>} groups - The SSRC groups associated with the track.
     */
    this._localSsrcMap = null;

    /**
     * Holds the SSRC map for the remote tracks mapped by their source names.
     *
     * @type {Map<string, TPCSourceInfo>}
     * @property {string} mediaType - The media type of the track.
     * @property {string} msid - The track's MSID.
     * @property {Array<TPCGroupInfo>} groups - The SSRC groups associated with the track.
     * @property {Array<string>} ssrcList - The SSRCs associated with the track.
     * @property {VideoType} videoType - The videoType of the track (undefined for audio tracks).
     */
    this._remoteSsrcMap = new Map();

    // override as desired
    this.trace = (what, info) => {
        logger.trace(what, info);

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

    this.onTrack = evt => {
        const stream = evt.streams[0];

        this._remoteTrackAdded(stream, evt.track, evt.transceiver);
        stream.addEventListener('removetrack', e => {
            this._remoteTrackRemoved(stream, e.track);
        });
    };
    this.peerconnection.addEventListener('track', this.onTrack);

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
    this.onconnectionstatechange = null;
    this.peerconnection.onconnectionstatechange = event => {
        this.trace('onconnectionstatechange', this.connectionState);
        if (this.onconnectionstatechange !== null) {
            this.onconnectionstatechange(event);
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
            this.getStats().then(stats => {
                if (typeof stats?.result === 'function') {
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
            });
        }, 1000);
    }

    this._lastVideoSenderUpdatePromise = Promise.resolve();

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
 * Obtains the media direction for given {@link MediaType} that needs to be set on a p2p peerconnection's remote SDP
 * after a source-add or source-remove action. The method takes into account whether or not there are any
 * local tracks for the given media type.
 * @param {MediaType} mediaType - The media type for which the direction is to be calculated.
 * @param {boolean} isAddOperation whether the direction is to be calculated after a source-add action.
 * @return {string} one of the SDP direction constants ('sendrecv, 'recvonly' etc.) which should be used when setting
 * local description on the peerconnection.
 * @private
 */
TraceablePeerConnection.prototype.getDesiredMediaDirection = function(mediaType, isAddOperation = false) {
    return this.tpcUtils.getDesiredMediaDirection(mediaType, isAddOperation);
};

/**
 * Returns the list of RTCRtpReceivers created for the source of the given media type associated with
 * the set of remote endpoints specified.
 * @param {Array<string>} endpoints list of the endpoints
 * @param {string} mediaType 'audio' or 'video'
 * @returns {Array<RTCRtpReceiver>} list of receivers created by the peerconnection.
 */
TraceablePeerConnection.prototype._getReceiversByEndpointIds = function(endpoints, mediaType) {
    let remoteTracks = [];
    let receivers = [];

    for (const endpoint of endpoints) {
        remoteTracks = remoteTracks.concat(this.getRemoteTracks(endpoint, mediaType));
    }

    // Get the ids of the MediaStreamTracks associated with each of these remote tracks.
    const remoteTrackIds = remoteTracks.map(remote => remote.track?.id);

    receivers = this.peerconnection.getReceivers()
        .filter(receiver => receiver.track
            && receiver.track.kind === mediaType
            && remoteTrackIds.find(trackId => trackId === receiver.track.id));

    return receivers;
};

/**
 * Tells whether or not this TPC instance has spatial scalability enabled.
 * @return {boolean} <tt>true</tt> if spatial scalability is enabled and active or
 * <tt>false</tt> if it's turned off.
 */
TraceablePeerConnection.prototype.isSpatialScalabilityOn = function() {
    const h264SimulcastEnabled = this.tpcUtils.codecSettings[CodecMimeType.H264].scalabilityModeEnabled
        && this.tpcUtils.supportsDDHeaderExt;

    return !this.options.disableSimulcast
        && (this.codecSettings.codecList[0] !== CodecMimeType.H264 || h264SimulcastEnabled);
};

/**
 * Handles {@link SignalingEvents.PEER_VIDEO_TYPE_CHANGED}
 * @param {string} endpointId the video owner's ID (MUC nickname)
 * @param {VideoType} videoType the new value
 * @private
 */
TraceablePeerConnection.prototype._peerVideoTypeChanged = function(endpointId, videoType) {
    // Check if endpointId has a value to avoid action on random track
    if (!endpointId) {
        logger.error(`${this} No endpointID on peerVideoTypeChanged`);

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
TraceablePeerConnection.prototype._peerMutedChanged = function(endpointId, mediaType, isMuted) {
    // Check if endpointId is a value to avoid doing action on all remote tracks
    if (!endpointId) {
        logger.error(`${this} On peerMuteChanged - no endpoint ID`);

        return;
    }
    const track = this.getRemoteTracks(endpointId, mediaType);

    if (track.length) {
        // NOTE 1 track per media type is assumed
        track[0].setMute(isMuted);
    }
};

/**
 * Handles remote source mute and unmute changed events.
 *
 * @param {string} sourceName - The name of the remote source.
 * @param {boolean} isMuted - The new mute state.
 */
TraceablePeerConnection.prototype._sourceMutedChanged = function(sourceName, isMuted) {
    const track = this.getRemoteTracks().find(t => t.getSourceName() === sourceName);

    if (!track) {
        if (FeatureFlags.isSsrcRewritingSupported()) {
            logger.debug(`Remote track not found for source=${sourceName}, mute update failed!`);
        }

        return;
    }

    track.setMute(isMuted);
};

/**
 * Handles remote source videoType changed events.
 *
 * @param {string} sourceName - The name of the remote source.
 * @param {boolean} isMuted - The new value.
 */
TraceablePeerConnection.prototype._sourceVideoTypeChanged = function(sourceName, videoType) {
    const track = this.getRemoteTracks().find(t => t.getSourceName() === sourceName);

    if (!track) {
        return;
    }

    track._setVideoType(videoType);
};

/**
 * Obtains audio levels of the remote audio tracks by getting the source information on the RTCRtpReceivers.
 * The information relevant to the ssrc is updated each time a RTP packet constaining the ssrc is received.
 * @param {Array<string>} speakerList list of endpoint ids for which audio levels are to be gathered.
 * @returns {Object} containing ssrc and audio level information as a key-value pair.
 */
TraceablePeerConnection.prototype.getAudioLevels = function(speakerList = []) {
    const audioLevels = {};
    const audioReceivers = speakerList.length
        ? this._getReceiversByEndpointIds(speakerList, MediaType.AUDIO)
        : this.peerconnection.getReceivers()
            .filter(receiver => receiver.track && receiver.track.kind === MediaType.AUDIO && receiver.track.enabled);

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
 * Checks if the browser is currently doing true simulcast where in three different media streams are being sent to the
 * bridge. Currently this happens always for VP8 and only if simulcast is enabled for VP9/AV1/H264.
 *
 * @param {JitsiLocalTrack} localTrack - The local video track.
 * @returns {boolean}
 */
TraceablePeerConnection.prototype.doesTrueSimulcast = function(localTrack) {
    const currentCodec = this.tpcUtils.getConfiguredVideoCodec(localTrack);

    return this.isSpatialScalabilityOn() && this.tpcUtils.isRunningInSimulcastMode(currentCodec);
};

/**
 * Returns the SSRCs associated with a given local video track.
 *
 * @param {JitsiLocalTrack} localTrack
 * @returns
 */
TraceablePeerConnection.prototype.getLocalVideoSSRCs = function(localTrack) {
    const ssrcs = [];

    if (!localTrack || !localTrack.isVideoTrack()) {
        return ssrcs;
    }

    const ssrcGroup = this.isSpatialScalabilityOn() ? SSRC_GROUP_SEMANTICS.SIM : SSRC_GROUP_SEMANTICS.FID;

    return this.localSSRCs.get(localTrack.rtcId)?.groups?.find(group => group.semantics === ssrcGroup)?.ssrcs || ssrcs;
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
 * Retrieves the local video tracks.
 *
 * @returns {Array<JitsiLocalTrack>} - local video tracks.
 */
TraceablePeerConnection.prototype.getLocalVideoTracks = function() {
    return this.getLocalTracks(MediaType.VIDEO);
};

/**
 * Obtains all remote tracks currently known to this PeerConnection instance.
 *
 * @param {string} [endpointId] - The track owner's identifier (MUC nickname)
 * @param {MediaType} [mediaType] - The remote tracks will be filtered by their media type if this argument is
 * specified.
 * @return {Array<JitsiRemoteTrack>}
 */
TraceablePeerConnection.prototype.getRemoteTracks = function(endpointId, mediaType) {
    let remoteTracks = [];

    if (FeatureFlags.isSsrcRewritingSupported()) {
        for (const remoteTrack of this.remoteTracksBySsrc.values()) {
            const owner = remoteTrack.getParticipantId();

            if (owner && (!endpointId || owner === endpointId)) {
                if (!mediaType || remoteTrack.getType() === mediaType) {
                    remoteTracks.push(remoteTrack);
                }
            }
        }

        return remoteTracks;
    }

    const endpoints = endpointId ? [ endpointId ] : this.remoteTracks.keys();

    for (const endpoint of endpoints) {
        const endpointTracksByMediaType = this.remoteTracks.get(endpoint);

        if (endpointTracksByMediaType) {
            for (const trackMediaType of endpointTracksByMediaType.keys()) {
                // per media type filtering
                if (!mediaType || mediaType === trackMediaType) {
                    remoteTracks = remoteTracks.concat(Array.from(endpointTracksByMediaType.get(trackMediaType)));
                }
            }
        }
    }

    return remoteTracks;
};

/**
 * Returns the remote sourceInfo for a given source name.
 *
 * @param {string} sourceName - The source name.
 * @returns {TPCSourceInfo}
 */
TraceablePeerConnection.prototype.getRemoteSourceInfoBySourceName = function(sourceName) {
    return cloneDeep(this._remoteSsrcMap.get(sourceName));
};

/**
 * Returns a map of source names and their associated SSRCs for the remote participant.
 *
 * @param {string} id Endpoint id of the remote participant.
 * @returns {Map<string, TPCSourceInfo>} The map of source names and their associated SSRCs.
 */
TraceablePeerConnection.prototype.getRemoteSourceInfoByParticipant = function(id) {
    const removeSsrcInfo = new Map();
    const remoteTracks = this.getRemoteTracks(id);

    if (!remoteTracks?.length) {
        return removeSsrcInfo;
    }
    const primarySsrcs = remoteTracks.map(track => track.getSSRC());

    for (const [ sourceName, sourceInfo ] of this._remoteSsrcMap) {
        if (sourceInfo.ssrcList?.some(ssrc => primarySsrcs.includes(Number(ssrc)))) {
            removeSsrcInfo.set(sourceName, sourceInfo);
        }
    }

    return removeSsrcInfo;
};

/**
 * Returns the target bitrates configured for the local video source.
 *
 * @param {JitsiLocalTrack} - The local video track.
 * @returns {Object}
 */
TraceablePeerConnection.prototype.getTargetVideoBitrates = function(localTrack) {
    const currentCodec = this.tpcUtils.getConfiguredVideoCodec(localTrack);

    return this.tpcUtils.codecSettings[currentCodec].maxBitratesVideo;
};

/**
 * Tries to find {@link JitsiTrack} for given SSRC number. It will search both local and remote tracks bound to this
 * instance.
 * @param {number} ssrc
 * @return {JitsiTrack|null}
 */
TraceablePeerConnection.prototype.getTrackBySSRC = function(ssrc) {
    if (typeof ssrc !== 'number') {
        throw new Error(`SSRC ${ssrc} is not a number`);
    }
    for (const localTrack of this.localTracks.values()) {
        const { ssrcs } = this.localSSRCs.get(localTrack.rtcId) ?? { ssrcs: [] };

        if (ssrcs.find(localSsrc => Number(localSsrc) === ssrc)) {
            return localTrack;
        }
    }

    if (FeatureFlags.isSsrcRewritingSupported()) {
        return this.remoteTracksBySsrc.get(ssrc);
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
    const streamId = stream.id;
    const mediaType = track.kind;

    // Do not create remote tracks for 'mixed' JVB SSRCs (used by JVB for RTCP termination).
    if (!this.isP2P && !RTCUtils.isUserStreamById(streamId)) {
        return;
    }
    logger.info(`${this} Received track event for remote stream[id=${streamId},type=${mediaType}]`);

    // look up an associated JID for a stream id
    if (!mediaType) {
        logger.error(`MediaType undefined for remote track, stream id: ${streamId}, track creation failed!`);

        return;
    }

    const remoteSDP = new SDP(this.remoteDescription.sdp);
    let mediaLine;

    // Find the matching mline using 'mid' or the 'msid' attr of the stream.
    if (transceiver?.mid) {
        const mid = transceiver.mid;

        mediaLine = remoteSDP.media.find(mls => SDPUtil.findLine(mls, `a=mid:${mid}`));
    } else {
        mediaLine = remoteSDP.media.find(mls => {
            const msid = SDPUtil.findLine(mls, 'a=msid:');

            return typeof msid === 'string' && streamId === msid.substring(7).split(' ')[0];
        });
    }

    if (!mediaLine) {
        logger.error(`Matching media line not found in remote SDP for remote stream[id=${streamId},type=${mediaType}],`
                + 'track creation failed!');

        return;
    }

    let ssrcLines = SDPUtil.findLines(mediaLine, 'a=ssrc:');

    ssrcLines = ssrcLines.filter(line => line.indexOf(`msid:${streamId}`) !== -1);
    if (!ssrcLines.length) {
        logger.error(`No SSRC lines found in remote SDP for remote stream[msid=${streamId},type=${mediaType}]`
                + 'track creation failed!');

        return;
    }

    // FIXME the length of ssrcLines[0] not verified, but it will fail
    // with global error handler anyway
    const ssrcStr = ssrcLines[0].substring(7).split(' ')[0];
    const trackSsrc = Number(ssrcStr);
    const ownerEndpointId = this.signalingLayer.getSSRCOwner(trackSsrc);

    if (isNaN(trackSsrc) || trackSsrc < 0) {
        logger.error(`Invalid SSRC for remote stream[ssrc=${trackSsrc},id=${streamId},type=${mediaType}]`
                + 'track creation failed!');

        return;
    }

    if (!ownerEndpointId) {
        logger.error(`No SSRC owner known for remote stream[ssrc=${trackSsrc},id=${streamId},type=${mediaType}]`
            + 'track creation failed!');

        return;
    }

    const sourceName = this.signalingLayer.getTrackSourceName(trackSsrc);
    const peerMediaInfo = this.signalingLayer.getPeerMediaInfo(ownerEndpointId, mediaType, sourceName);
    const trackDetails = {
        mediaType,
        muted: peerMediaInfo?.muted ?? true,
        stream,
        track,
        ssrc: trackSsrc,
        videoType: peerMediaInfo?.videoType
    };

    if (this._remoteSsrcMap.has(sourceName) && mediaType === MediaType.VIDEO) {
        trackDetails.videoType = this._remoteSsrcMap.get(sourceName).videoType;
    }

    this._createRemoteTrack(ownerEndpointId, sourceName, trackDetails);
};

/**
 * Initializes a new JitsiRemoteTrack instance with the data provided by the signaling layer and SDP.
 *
 * @param {string} ownerEndpointId - The owner's endpoint ID (MUC nickname)
 * @param {String} sourceName - The track's source name
 * @param {Object} trackDetails - The track's details.
 * @param {MediaType} trackDetails.mediaType - media type, 'audio' or 'video'.
 * @param {boolean} trackDetails.muted - The initial muted status.
 * @param {number} trackDetails.ssrc - The track's main SSRC number.
 * @param {MediaStream} trackDetails.stream - The WebRTC stream instance.
 * @param {MediaStreamTrack} trackDetails.track - The WebRTC track instance.
 * @param {VideoType} trackDetails.videoType - The track's type of the video (if applicable).
 */
TraceablePeerConnection.prototype._createRemoteTrack = function(ownerEndpointId, sourceName, trackDetails) {
    const { mediaType, muted, ssrc, stream, track, videoType } = trackDetails;

    logger.info(`${this} creating remote track[endpoint=${ownerEndpointId},ssrc=${ssrc},`
        + `type=${mediaType},sourceName=${sourceName}]`);
    let remoteTracksMap;
    let userTracksByMediaType;

    if (FeatureFlags.isSsrcRewritingSupported()) {
        const existingTrack = this.remoteTracksBySsrc.get(ssrc);

        if (existingTrack) {
            logger.info(`${this} ignored duplicated track event for SSRC[ssrc=${ssrc},type=${mediaType}]`);

            return;
        }
    } else {
        remoteTracksMap = this.remoteTracks.get(ownerEndpointId);

        if (!remoteTracksMap) {
            remoteTracksMap = new Map();
            remoteTracksMap.set(MediaType.AUDIO, new Set());
            remoteTracksMap.set(MediaType.VIDEO, new Set());
            this.remoteTracks.set(ownerEndpointId, remoteTracksMap);
        }

        userTracksByMediaType = remoteTracksMap.get(mediaType);

        if (userTracksByMediaType?.size
            && Array.from(userTracksByMediaType).find(jitsiTrack => jitsiTrack.getTrack() === track)) {
            // Ignore duplicated event which can originate either from 'onStreamAdded' or 'onTrackAdded'.
            logger.info(`${this} ignored duplicated track event for track[endpoint=${ownerEndpointId},`
                + `type=${mediaType}]`);

            return;
        }
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
                this.isP2P,
                sourceName);

    if (FeatureFlags.isSsrcRewritingSupported()) {
        this.remoteTracksBySsrc.set(ssrc, remoteTrack);
    } else {
        userTracksByMediaType.add(remoteTrack);
    }

    this.eventEmitter.emit(RTCEvents.REMOTE_TRACK_ADDED, remoteTrack, this);
};

/**
 * Handles remote media track removal.
 *
 * @param {MediaStream} stream - WebRTC MediaStream instance which is the parent of the track.
 * @param {MediaStreamTrack} track - WebRTC MediaStreamTrack which has been removed from the PeerConnection.
 * @returns {void}
 */
TraceablePeerConnection.prototype._remoteTrackRemoved = function(stream, track) {
    const streamId = stream.id;
    const trackId = track?.id;

    // Ignore stream removed events for JVB "mixed" sources (used for RTCP termination).
    if (!RTCUtils.isUserStreamById(streamId)) {
        return;
    }

    if (!streamId) {
        logger.error(`${this} remote track removal failed - no stream ID`);

        return;
    }

    if (!trackId) {
        logger.error(`${this} remote track removal failed - no track ID`);

        return;
    }

    const toBeRemoved = this.getRemoteTracks().find(
        remoteTrack => remoteTrack.getStreamId() === streamId && remoteTrack.getTrackId() === trackId);

    if (!toBeRemoved) {
        logger.error(`${this} remote track removal failed - track not found`);

        return;
    }

    this._removeRemoteTrack(toBeRemoved);
};

/**
 * Removes and disposes given <tt>JitsiRemoteTrack</tt> instance. Emits {@link RTCEvents.REMOTE_TRACK_REMOVED}.
 *
 * @param {JitsiRemoteTrack} toBeRemoved - The remote track to be removed.
 * @returns {void}
 */
TraceablePeerConnection.prototype._removeRemoteTrack = function(toBeRemoved) {
    logger.info(`${this} Removing remote track stream[id=${toBeRemoved.getStreamId()},`
        + `trackId=${toBeRemoved.getTrackId()}]`);

    toBeRemoved.dispose();
    const participantId = toBeRemoved.getParticipantId();

    if (FeatureFlags.isSsrcRewritingSupported() && !participantId) {
        return;
    } else if (!FeatureFlags.isSsrcRewritingSupported()) {
        const userTracksByMediaType = this.remoteTracks.get(participantId);

        if (!userTracksByMediaType) {
            logger.error(`${this} removeRemoteTrack: no remote tracks map for endpoint=${participantId}`);
        } else if (!userTracksByMediaType.get(toBeRemoved.getType())?.delete(toBeRemoved)) {
            logger.error(`${this} Failed to remove ${toBeRemoved} - type mapping messed up ?`);
        }
    }

    this.eventEmitter.emit(RTCEvents.REMOTE_TRACK_REMOVED, toBeRemoved);
};

/**
 * Processes the local SDP and creates an SSRC map for every local track.
 *
 * @param {string} localSDP - SDP from the local description.
 * @returns {void}
 */
TraceablePeerConnection.prototype._processAndExtractSourceInfo = function(localSDP) {
    /**
     * @type {Map<string, TPCSourceInfo>} The map of source names and their associated SSRCs.
     */
    const ssrcMap = new Map();

    if (!localSDP || typeof localSDP !== 'string') {
        throw new Error('Local SDP must be a valid string, aborting!!');
    }
    const session = transform.parse(localSDP);
    const media = session.media.filter(mline => mline.direction === MediaDirection.SENDONLY
        || mline.direction === MediaDirection.SENDRECV);

    if (!media.length) {
        this._localSsrcMap = ssrcMap;

        return;
    }

    for (const localTrack of this.localTracks.values()) {
        const sourceName = localTrack.getSourceName();
        const trackIndex = getSourceIndexFromSourceName(sourceName);
        const mediaType = localTrack.getType();
        const mLines = media.filter(m => m.type === mediaType);
        const ssrcGroups = mLines[trackIndex].ssrcGroups;
        let ssrcs = mLines[trackIndex].ssrcs;

        if (ssrcs?.length) {
            // Filter the ssrcs with 'cname' attribute.
            ssrcs = ssrcs.filter(s => s.attribute === 'cname');

            const msid = `${this.rtc.getLocalEndpointId()}-${mediaType}-${trackIndex}`;
            const ssrcInfo = {
                ssrcs: [],
                groups: [],
                msid
            };

            ssrcs.forEach(ssrc => ssrcInfo.ssrcs.push(ssrc.id));

            if (ssrcGroups?.length) {
                for (const group of ssrcGroups) {
                    group.ssrcs = group.ssrcs.split(' ').map(ssrcStr => parseInt(ssrcStr, 10));
                    ssrcInfo.groups.push(group);
                }

                const simGroup = ssrcGroups.find(group => group.semantics === SSRC_GROUP_SEMANTICS.SIM);

                // Add a SIM group if its missing in the description (happens on Firefox).
                if (this.isSpatialScalabilityOn() && !simGroup) {
                    const groupSsrcs = ssrcGroups.map(group => group.ssrcs[0]);

                    ssrcInfo.groups.push({
                        semantics: SSRC_GROUP_SEMANTICS.SIM,
                        ssrcs: groupSsrcs
                    });
                }
            }

            ssrcMap.set(sourceName, ssrcInfo);

            const oldSsrcInfo = this.localSSRCs.get(localTrack.rtcId);
            const oldSsrc = this._extractPrimarySSRC(oldSsrcInfo);
            const newSsrc = this._extractPrimarySSRC(ssrcInfo);

            if (oldSsrc !== newSsrc) {
                oldSsrc && logger.debug(`${this} Overwriting SSRC for track=${localTrack}] with ssrc=${newSsrc}`);
                this.localSSRCs.set(localTrack.rtcId, ssrcInfo);
                localTrack.setSsrc(newSsrc);
            }
        }
    }
    this._localSsrcMap = ssrcMap;
};

/**
 *
 * @param {JitsiLocalTrack} localTrack
 */
TraceablePeerConnection.prototype.getLocalSSRC = function(localTrack) {
    const ssrcInfo = this._getSSRC(localTrack.rtcId);

    return ssrcInfo && ssrcInfo.ssrcs[0];
};

/* eslint-disable-next-line vars-on-top */
const getters = {
    signalingState() {
        return this.peerconnection.signalingState;
    },
    iceConnectionState() {
        return this.peerconnection.iceConnectionState;
    },
    connectionState() {
        return this.peerconnection.connectionState;
    },
    localDescription() {
        let desc = this.peerconnection.localDescription;

        if (!desc) {
            logger.debug(`${this} getLocalDescription no localDescription found`);

            return {};
        }

        this.trace('getLocalDescription::preTransform', dumpSDP(desc));

        if (!this.isP2P) {
            desc = this.tpcUtils.injectSsrcGroupForSimulcast(desc);
            this.trace('getLocalDescription::postTransform (inject ssrc group)', dumpSDP(desc));
        }

        // See the method's doc for more info about this transformation.
        desc = this.localSdpMunger.transformStreamIdentifiers(desc, this._localSsrcMap);

        return desc;
    },
    remoteDescription() {
        let desc = this.peerconnection.remoteDescription;

        if (!desc) {
            logger.debug(`${this} getRemoteDescription no remoteDescription found`);

            return {};
        }
        this.trace('getRemoteDescription::preTransform', dumpSDP(desc));

        if (this.isP2P) {
            // Adjust the media direction for p2p based on whether a local source has been added.
            desc = this._adjustRemoteMediaDirection(desc);
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
 * Checks if low fps screensharing is in progress.
 *
 * @private
 * @returns {boolean} Returns true if 5 fps screensharing is in progress, false otherwise.
 */
TraceablePeerConnection.prototype.isSharingLowFpsScreen = function() {
    return this._isSharingScreen() && this._capScreenshareBitrate;
};

/**
 * Checks if screensharing is in progress.
 *
 * @returns {boolean}  Returns true if a desktop track has been added to the peerconnection, false otherwise.
 */
TraceablePeerConnection.prototype._isSharingScreen = function() {
    const tracks = this.getLocalVideoTracks();

    return Boolean(tracks.find(track => track.videoType === VideoType.DESKTOP));
};

/**
 * Add {@link JitsiLocalTrack} to this TPC.
 * @param {JitsiLocalTrack} track
 * @param {boolean} isInitiator indicates if the endpoint is the offerer.
 * @returns {Promise<void>} - resolved when done.
 */
TraceablePeerConnection.prototype.addTrack = async function(track, isInitiator = false) {
    const rtcId = track.rtcId;

    if (this.localTracks.has(rtcId)) {
        throw new Error(`${track} is already in ${this}`);
    }

    logger.info(`${this} adding ${track}`);
    const webrtcStream = track.getOriginalStream();
    const mediaStreamTrack = track.getTrack();
    let transceiver;

    if (isInitiator) {
        const streams = [];

        webrtcStream && streams.push(webrtcStream);

        // Use pc.addTransceiver() for the initiator case when local tracks are getting added
        // to the peerconnection before a session-initiate is sent over to the peer.
        const transceiverInit = {
            direction: MediaDirection.SENDRECV,
            streams,
            sendEncodings: []
        };

        if (!browser.isFirefox()) {
            transceiverInit.sendEncodings = this.tpcUtils.getStreamEncodings(track);
        }

        transceiver = this.peerconnection.addTransceiver(mediaStreamTrack, transceiverInit);
    } else {
        // Use pc.addTrack() for responder case so that we can re-use the m-lines that were created
        // when setRemoteDescription was called. pc.addTrack() automatically  attaches to any existing
        // unused "recv-only" transceiver.
        const sender = this.peerconnection.addTrack(mediaStreamTrack);

        // Find the corresponding transceiver that the track was attached to.
        transceiver = this.peerconnection.getTransceivers().find(t => t.sender === sender);
    }

    if (transceiver?.mid) {
        this.localTrackTransceiverMids.set(track.rtcId, transceiver.mid.toString());
    }

    if (track) {
        this.localTracks.set(rtcId, track);
        if (track.isAudioTrack()) {
            this._hasHadAudioTrack = true;
        } else {
            this._hasHadVideoTrack = true;
        }
    }

    // On Firefox, the encodings have to be configured on the sender only after the transceiver is created.
    if (browser.isFirefox() && webrtcStream) {
        await this._setEncodings(track);
    }
};

/**
 * Adds local track to the RTCPeerConnection.
 *
 * @param {JitsiLocalTrack} track the track to be added to the pc.
 * @return {Promise<boolean>} Promise that resolves to true if the underlying PeerConnection's state has changed and
 * renegotiation is required, false if no renegotiation is needed or Promise is rejected when something goes wrong.
 */
TraceablePeerConnection.prototype.addTrackToPc = function(track) {
    logger.info(`${this} Adding track=${track} to PC`);

    if (!this._assertTrackBelongs('addTrackToPc', track)) {
        // Abort

        return Promise.reject('Track not found on the peerconnection');
    }

    const webRtcStream = track.getOriginalStream();

    if (!webRtcStream) {
        logger.error(`${this} Unable to add track=${track} to PC - no WebRTC stream`);

        return Promise.reject('Stream not found');
    }

    return this.replaceTrack(null, track, true /* isMuteOperation */).then(() => {
        if (track) {
            if (track.isAudioTrack()) {
                this._hasHadAudioTrack = true;
            } else {
                this._hasHadVideoTrack = true;
            }
        }

        return false;
    });
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
    const doesBelong = this.localTracks.has(localTrack?.rtcId);

    if (!doesBelong) {
        logger.error(`${this} ${methodName}: track=${localTrack} does not belong to pc`);
    }

    return doesBelong;
};

/**
 * Returns the codecs in the current order of preference as configured on the peerconnection.
 *
 * @param {RTCSessionDescription} - The local description to be used.
 * @returns {Array}
 */
TraceablePeerConnection.prototype.getConfiguredVideoCodecs = function(description) {
    return this.tpcUtils.getConfiguredVideoCodecs(description?.sdp);
};

/**
 * Enables or disables simulcast for screenshare based on the frame rate requested for desktop track capture.
 *
 * @param {number} maxFps framerate to be used for desktop track capture.
 */
TraceablePeerConnection.prototype.setDesktopSharingFrameRate = function(maxFps) {
    const lowFps = maxFps <= SS_DEFAULT_FRAME_RATE;

    this._capScreenshareBitrate = this.isSpatialScalabilityOn() && lowFps;
};

/**
 * Sets the codec preference on the peerconnection. The codec preference goes into effect when
 * the next renegotiation happens for older clients that do not support the codec selection API.
 *
 * @param {Array<CodecMimeType>} codecList - Preferred codecs for video.
 * @param {CodecMimeType} screenshareCodec - The preferred codec for screenshare.
 * @returns {void}
 */
TraceablePeerConnection.prototype.setVideoCodecs = function(codecList, screenshareCodec) {
    if (!this.codecSettings || !codecList?.length) {
        return;
    }

    this.codecSettings.codecList = codecList;
    if (screenshareCodec) {
        this.codecSettings.screenshareCodec = screenshareCodec;
    }

    if (this.usesCodecSelectionAPI()) {
        this.configureVideoSenderEncodings();
    }
};

/**
 * Remove local track from this TPC.
 * @param {JitsiLocalTrack} localTrack the track to be removed from this TPC.
 *
 * FIXME It should probably remove a boolean just like {@link removeTrackFromPc}
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
 * Processes the local description SDP and caches the mids of the mlines associated with the given tracks.
 *
 * @param {Array<JitsiLocalTrack>} localTracks - local tracks that are added to the peerconnection.
 * @returns {void}
 */
TraceablePeerConnection.prototype.processLocalSdpForTransceiverInfo = function(localTracks) {
    const localSdp = this.localDescription?.sdp;

    if (!localSdp) {
        return;
    }

    [ MediaType.AUDIO, MediaType.VIDEO ].forEach(mediaType => {
        const tracks = localTracks.filter(t => t.getType() === mediaType);
        const parsedSdp = transform.parse(localSdp);
        const mLines = parsedSdp.media.filter(mline => mline.type === mediaType);

        tracks.forEach((track, idx) => {
            if (!this.localTrackTransceiverMids.has(track.rtcId)) {
                this.localTrackTransceiverMids.set(track.rtcId, mLines[idx].mid.toString());
            }
        });
    });
};

/**
 * Replaces <tt>oldTrack</tt> with <tt>newTrack</tt> from the peer connection.
 * Either <tt>oldTrack</tt> or <tt>newTrack</tt> can be null; replacing a valid
 * <tt>oldTrack</tt> with a null <tt>newTrack</tt> effectively just removes
 * <tt>oldTrack</tt>
 *
 * @param {JitsiLocalTrack|null} oldTrack - The current track in use to be replaced on the pc.
 * @param {JitsiLocalTrack|null} newTrack - The new track to be used.
 * @param {boolean} isMuteOperation - Whether the operation is a mute/unmute operation.
 * @returns {Promise<boolean>} - If the promise resolves with true, renegotiation will be needed.
 * Otherwise no renegotiation is needed.
 */
TraceablePeerConnection.prototype.replaceTrack = function(oldTrack, newTrack, isMuteOperation = false) {
    if (!(oldTrack || newTrack)) {
        logger.info(`${this} replaceTrack called with no new track and no old track`);

        return Promise.resolve();
    }

    logger.info(`${this} TPC.replaceTrack old=${oldTrack}, new=${newTrack}`);

    let transceiver;
    const mediaType = newTrack?.getType() ?? oldTrack?.getType();
    const localTracks = this.getLocalTracks(mediaType);
    const track = newTrack?.getTrack() ?? null;
    const isNewLocalSource = localTracks?.length
        && !oldTrack
        && newTrack
        && !localTracks.find(t => t === newTrack);

    // If old track exists, replace the track on the corresponding sender.
    if (oldTrack && !oldTrack.isMuted()) {
        transceiver = this.peerconnection.getTransceivers().find(t => t.sender.track === oldTrack.getTrack());

    // Find the first recvonly transceiver when more than one track of the same media type is being added to the pc.
    // As part of the track addition, a new m-line was added to the remote description with direction set to
    // recvonly.
    } else if (isNewLocalSource) {
        transceiver = this.peerconnection.getTransceivers().find(
            t => t.receiver.track.kind === mediaType
            && t.direction === MediaDirection.RECVONLY

            // Re-use any existing recvonly transceiver (if available) for p2p case.
            && ((this.isP2P && t.currentDirection === MediaDirection.RECVONLY)
                || (t.currentDirection === MediaDirection.INACTIVE && !t.stopped)));

    // For mute/unmute operations, find the transceiver based on the track index in the source name if present,
    // otherwise it is assumed to be the first local track that was added to the peerconnection.
    } else {
        transceiver = this.peerconnection.getTransceivers().find(t => t.receiver.track.kind === mediaType);
        const sourceName = newTrack?.getSourceName() ?? oldTrack?.getSourceName();

        if (sourceName) {
            const trackIndex = getSourceIndexFromSourceName(sourceName);

            if (this.isP2P) {
                transceiver = this.peerconnection.getTransceivers()
                    .filter(t => t.receiver.track.kind === mediaType)[trackIndex];
            } else if (oldTrack) {
                const transceiverMid = this.localTrackTransceiverMids.get(oldTrack.rtcId);

                transceiver = this.peerconnection.getTransceivers().find(t => t.mid === transceiverMid);
            } else if (trackIndex) {
                transceiver = this.peerconnection.getTransceivers()
                        .filter(t => t.receiver.track.kind === mediaType
                            && t.direction !== MediaDirection.RECVONLY)[trackIndex];
            }
        }
    }

    if (!transceiver) {
        return Promise.reject(
            new Error(`Replace track failed - no transceiver for old: ${oldTrack}, new: ${newTrack}`));
    }

    return transceiver.sender.replaceTrack(track)
        .then(() => {
            if (isMuteOperation) {
                return Promise.resolve();
            }
            if (oldTrack) {
                this.localTracks.delete(oldTrack.rtcId);
                this.localTrackTransceiverMids.delete(oldTrack.rtcId);
            }

            if (newTrack) {
                if (newTrack.isAudioTrack()) {
                    this._hasHadAudioTrack = true;
                } else {
                    this._hasHadVideoTrack = true;
                }
                this.localTrackTransceiverMids.set(newTrack.rtcId, transceiver?.mid?.toString());
                this.localTracks.set(newTrack.rtcId, newTrack);
            }

            // Update the local SSRC cache for the case when one track gets replaced with another and no
            // renegotiation is triggered as a result of this.
            if (oldTrack && newTrack) {
                const oldTrackSSRC = this.localSSRCs.get(oldTrack.rtcId);

                if (oldTrackSSRC) {
                    this.localSSRCs.delete(oldTrack.rtcId);
                    this.localSSRCs.set(newTrack.rtcId, oldTrackSSRC);
                    const oldSsrcNum = this._extractPrimarySSRC(oldTrackSSRC);

                    newTrack.setSsrc(oldSsrcNum);
                }
            }

            // In the scenario where we remove the oldTrack (oldTrack is not null and newTrack is null) on FF
            // if we change the direction to RECVONLY, create answer will generate SDP with only 1 receive
            // only ssrc instead of keeping all 6 ssrcs that we currently have. Stopping the screen sharing
            // and then starting it again will trigger 2 rounds of source-remove and source-add replacing
            // the 6 ssrcs for the screen sharing with 1 receive only ssrc and then removing the receive
            // only ssrc and adding the same 6 ssrcs. On the remote participant's side the same ssrcs will
            // be reused on a new m-line and if the remote participant is FF due to
            // https://bugzilla.mozilla.org/show_bug.cgi?id=1768729 the video stream won't be rendered.
            // That's why we need keep the direction to SENDRECV for FF.
            //
            // NOTE: If we return back to the approach of not removing the track for FF and instead using the
            // enabled property for mute or stopping screensharing we may need to change the direction to
            // RECVONLY if FF still sends the media even though the enabled flag is set to false.
            transceiver.direction
                = newTrack || browser.isFirefox() ? MediaDirection.SENDRECV : MediaDirection.RECVONLY;

            // Avoid re-configuring the encodings on Chromium/Safari, this is needed only on Firefox.
            const configureEncodingsPromise
                = !newTrack || browser.usesSdpMungingForSimulcast()
                    ? Promise.resolve()
                    : this._setEncodings(newTrack);

            return configureEncodingsPromise.then(() => this.isP2P);
        });
};

/**
 * Removes local track from the RTCPeerConnection.
 *
 * @param {JitsiLocalTrack} localTrack the local track to be removed.
 * @return {Promise<boolean>} Promise that resolves to true if the underlying PeerConnection's state has changed and
 * renegotiation is required, false if no renegotiation is needed or Promise is rejected when something goes wrong.
 */
TraceablePeerConnection.prototype.removeTrackFromPc = function(localTrack) {
    const webRtcStream = localTrack.getOriginalStream();

    this.trace('removeTrack', localTrack.rtcId, webRtcStream ? webRtcStream.id : null);

    if (!this._assertTrackBelongs('removeTrack', localTrack)) {
        // Abort - nothing to be done here
        return Promise.reject('Track not found in the peerconnection');
    }

    return this.replaceTrack(localTrack, null, true /* isMuteOperation */).then(() => false);
};

/**
 * Updates the remote source map with the given source map for adding or removing sources.
 *
 * @param {Map<string, TPCSourceInfo>} sourceMap - The map of source names to their corresponding SSRCs.
 * @param {boolean} isAdd - Whether the sources are being added or removed.
 * @returns {void}
 */
TraceablePeerConnection.prototype.updateRemoteSources = function(sourceMap, isAdd) {
    for (const [ sourceName, ssrcInfo ] of sourceMap) {
        if (isAdd) {
            this._remoteSsrcMap.set(sourceName, ssrcInfo);
        } else {
            this._remoteSsrcMap.delete(sourceName);
        }
    }
};

/**
 * Returns true if the codec selection API is used for switching between codecs for the video sources.
 *
 * @returns {boolean}
 */
TraceablePeerConnection.prototype.usesCodecSelectionAPI = function() {
    // Browser throws an error when H.264 is set on the encodings. Therefore, munge the SDP when H.264 needs to be
    // selected.
    // TODO: Remove this check when the above issue is fixed.
    return this._usesCodecSelectionAPI && this.codecSettings.codecList[0] !== CodecMimeType.H264;
};

TraceablePeerConnection.prototype.createDataChannel = function(label, opts) {
    this.trace('createDataChannel', label, opts);

    return this.peerconnection.createDataChannel(label, opts);
};

/**
 * Adjusts the media direction on the remote description based on availability of local and remote sources in a p2p
 * media connection.
 *
 * @param {RTCSessionDescription} remoteDescription the WebRTC session description instance for the remote description.
 * @returns the transformed remoteDescription.
 * @private
 */
TraceablePeerConnection.prototype._adjustRemoteMediaDirection = function(remoteDescription) {
    const transformer = new SdpTransformWrap(remoteDescription.sdp);

    [ MediaType.AUDIO, MediaType.VIDEO ].forEach(mediaType => {
        const media = transformer.selectMedia(mediaType);
        const localSources = this.getLocalTracks(mediaType).length;
        const remoteSources = this.getRemoteTracks(null, mediaType).length;

        media.forEach((mLine, idx) => {
            if (localSources && localSources === remoteSources) {
                mLine.direction = MediaDirection.SENDRECV;
            } else if (!localSources && !remoteSources) {
                mLine.direction = MediaDirection.INACTIVE;
            } else if (!localSources) {
                mLine.direction = MediaDirection.SENDONLY;
            } else if (!remoteSources) {
                mLine.direction = MediaDirection.RECVONLY;

            // When there are 2 local sources and 1 remote source, the first m-line should be set to 'sendrecv' while
            // the second one needs to be set to 'recvonly'.
            } else if (localSources > remoteSources) {
                mLine.direction = idx ? MediaDirection.RECVONLY : MediaDirection.SENDRECV;

            // When there are 2 remote sources and 1 local source, the first m-line should be set to 'sendrecv' while
            // the second one needs to be set to 'sendonly'.
            } else {
                mLine.direction = idx ? MediaDirection.SENDONLY : MediaDirection.SENDRECV;
            }
        });
    });

    return {
        type: remoteDescription.type,
        sdp: transformer.toRawSDP()
    };
};

/**
 * Returns the codec to be used for screenshare based on the supported codecs and the preferred codec requested
 * through config.js setting.
 *
 * @param {CodecMimeType} defaultCodec - the preferred codec for video tracks.
 * @returns {CodecMimeType}
 */
TraceablePeerConnection.prototype._getPreferredCodecForScreenshare = function(defaultCodec) {
    // Use the same codec for both camera and screenshare if the client doesn't support the codec selection API.
    if (!this.usesCodecSelectionAPI()) {
        return defaultCodec;
    }

    const { screenshareCodec } = this.codecSettings;

    if (screenshareCodec && this.codecSettings.codecList.find(c => c === screenshareCodec)) {
        return screenshareCodec;
    }

    // Default to AV1 for screenshare if its supported and is not overriden through config.js.
    if (this.codecSettings.codecList.find(c => c === CodecMimeType.AV1)) {
        return CodecMimeType.AV1;
    }

    return defaultCodec;
};

/**
 * Sets up the _dtlsTransport object and initializes callbacks for it.
 */
TraceablePeerConnection.prototype._initializeDtlsTransport = function() {
    // We are assuming here that we only have one bundled transport here
    if (!this.peerconnection.getSenders || this._dtlsTransport) {
        return;
    }

    const senders = this.peerconnection.getSenders();

    if (senders.length !== 0 && senders[0].transport) {
        this._dtlsTransport = senders[0].transport;

        this._dtlsTransport.onerror = error => {
            logger.error(`${this} DtlsTransport error: ${error}`);
        };

        this._dtlsTransport.onstatechange = () => {
            this.trace('dtlsTransport.onstatechange', this._dtlsTransport.state);
        };
    }
};

/**
 * Returns the expected send resolution for a local video track based on what encodings are currently active.
 *
 * @param {JitsiLocalTrack} localTrack - The local video track.
 * @returns {number}
 */
TraceablePeerConnection.prototype.calculateExpectedSendResolution = function(localTrack) {
    const captureResolution = localTrack.getCaptureResolution();
    let result = Math.min(localTrack.maxEnabledResolution, captureResolution);

    if (localTrack.getVideoType() === VideoType.CAMERA) {
        // Find the closest matching resolution based on the current codec, simulcast config and the requested
        // resolution by the bridge or the peer.
        if (this.doesTrueSimulcast(localTrack)) {
            const sender = this.findSenderForTrack(localTrack.getTrack());

            if (!sender) {
                return result;
            }

            const { encodings } = sender.getParameters();

            result = encodings.reduce((maxValue, encoding) => {
                if (encoding.active) {
                    // eslint-disable-next-line no-param-reassign
                    maxValue = Math.max(maxValue, Math.floor(captureResolution / encoding.scaleResolutionDownBy));
                }

                return maxValue;
            }, 0);
        }
    }

    return result;
};

/**
 * Configures the stream encodings for the audio tracks that are added to the peerconnection.
 *
 * @param {JitsiLocalTrack} localAudioTrack - The local audio track.
 * @returns {Promise} promise that will be resolved when the operation is successful and rejected otherwise.
 */
TraceablePeerConnection.prototype.configureAudioSenderEncodings = function(localAudioTrack = null) {
    if (localAudioTrack) {
        return this._setEncodings(localAudioTrack);
    }
    const promises = [];

    for (const track of this.getLocalTracks(MediaType.AUDIO)) {
        promises.push(this._setEncodings(track));
    }

    return Promise.allSettled(promises);
};

/**
 * Configures the RTCRtpEncodingParameters of the outbound rtp stream associated with the given track.
 *
 * @param {JitsiLocalTracj} localTrack - The local track whose outbound stream needs to be configured.
 * @returns {Promise} - A promise that resolves when the operation is successful, rejected otherwise.
 */
TraceablePeerConnection.prototype._configureSenderEncodings = async function(localTrack) {
    const mediaType = localTrack.getType();
    const transceiver = localTrack?.track && localTrack.getOriginalStream()
        ? this.peerconnection.getTransceivers().find(t => t.sender?.track?.id === localTrack.getTrackId())
        : this.peerconnection.getTransceivers().find(t => t.receiver?.track?.kind === mediaType);
    const parameters = transceiver?.sender?.getParameters();

    // Resolve if the encodings are not available yet. This happens immediately after the track is added to the
    // peerconnection on chrome in unified-plan. It is ok to ignore and not report the error here since the
    // action that triggers 'addTrack' (like unmute) will also configure the encodings and set bitrates after that.
    if (!parameters?.encodings?.length) {
        return;
    }

    parameters.encodings = this.tpcUtils.getStreamEncodings(localTrack);
    await transceiver.sender.setParameters(parameters);
};

/**
 * Enables/disables the streams by changing the active field on RTCRtpEncodingParameters for a given RTCRtpSender.
 *
 * @param {RTCRtpSender} sender - the sender associated with a MediaStreamTrack.
 * @param {boolean} enable - whether the streams needs to be enabled or disabled.
 * @returns {Promise} - A promise that resolves when the operation is successful, rejected otherwise.
 */
TraceablePeerConnection.prototype._enableSenderEncodings = async function(sender, enable) {
    const parameters = sender.getParameters();

    if (parameters?.encodings?.length) {
        for (const encoding of parameters.encodings) {
            encoding.active = enable;
        }
    }

    await sender.setParameters(parameters);
};

/**
 * Configures the stream encodings depending on the video type, scalability mode and the bitrate settings for the codec
 * that is currently selected.
 *
 * @param {JitsiLocalTrack} - The local track for which the sender encodings have to configured.
 * @returns {Promise} promise that will be resolved when the operation is successful and rejected otherwise.
 */
TraceablePeerConnection.prototype.configureVideoSenderEncodings = function(localVideoTrack = null) {
    const preferredCodec = this.codecSettings.codecList[0];

    if (localVideoTrack) {
        return this.setSenderVideoConstraints(
            this._senderMaxHeights.get(localVideoTrack.getSourceName()),
            localVideoTrack,
            preferredCodec);
    }
    const promises = [];

    for (const track of this.getLocalVideoTracks()) {
        const maxHeight = this._senderMaxHeights.get(track.getSourceName()) ?? VIDEO_QUALITY_LEVELS[0].height;

        promises.push(this.setSenderVideoConstraints(maxHeight, track, preferredCodec));
    }

    return Promise.allSettled(promises);
};

/**
 * Set the simulcast stream encoding properties on the RTCRtpSender.
 *
 * @param {JitsiLocalTrack} localTrack - the current track in use for which the encodings are to be set.
 * @returns {Promise<void>} - resolved when done.
 */
TraceablePeerConnection.prototype._setEncodings = function(localTrack) {
    if (localTrack.getType() === MediaType.VIDEO) {
        return this._updateVideoSenderParameters(() => this._configureSenderEncodings(localTrack));
    }

    return this._configureSenderEncodings(localTrack);
};

/**
 * Munges the provided description to update the codec order, set the max bitrates (for VP9 K-SVC), set stereo flag
 * and update the DD Header extensions for AV1.
 *
 * @param {RTCSessionDescription} description - The description to be munged.
 * @returns {RTCSessionDescription} - The munged description.
 */
TraceablePeerConnection.prototype._mungeDescription = function(description) {
    this.trace('RTCSessionDescription::preTransform', dumpSDP(description));
    let mungedSdp = transform.parse(description.sdp);

    mungedSdp = this.tpcUtils.mungeOpus(mungedSdp);
    mungedSdp = this.tpcUtils.mungeCodecOrder(mungedSdp);
    mungedSdp = this.tpcUtils.setMaxBitrates(mungedSdp, true);
    mungedSdp = this.tpcUtils.updateAv1DdHeaders(mungedSdp);
    const mungedDescription = {
        type: description.type,
        sdp: transform.write(mungedSdp)
    };

    this.trace('RTCSessionDescription::postTransform', dumpSDP(mungedDescription));

    return mungedDescription;
};

/**
 * Sets the local description on the peerconnection.
 *
 * @param {RTCSessionDescription} description - The local description to be set.
 * @returns {Promise<void>} - Resolved when the operation is successful and rejected with an error otherwise.
 */
TraceablePeerConnection.prototype.setLocalDescription = function(description) {
    let localDescription = description;

    localDescription = this._mungeDescription(localDescription);

    return new Promise((resolve, reject) => {
        this.peerconnection.setLocalDescription(localDescription)
            .then(() => {
                this.trace('setLocalDescriptionOnSuccess');
                const localUfrag = SDPUtil.getUfrag(localDescription.sdp);

                if (localUfrag !== this.localUfrag) {
                    this.localUfrag = localUfrag;
                    this.eventEmitter.emit(RTCEvents.LOCAL_UFRAG_CHANGED, this, localUfrag);
                }

                this._initializeDtlsTransport();

                resolve();
            }, err => {
                this.trace('setLocalDescriptionOnFailure', err);
                this.eventEmitter.emit(RTCEvents.SET_LOCAL_DESCRIPTION_FAILED, err, this);
                reject(err);
            });
    });
};

/**
 * Sets the remote description on the peerconnection.
 *
 * @param {RTCSessionDescription} description - The remote description to be set.
 * @returns {Promise<void>} - Resolved when the operation is successful and rejected with an error otherwise.
 */
TraceablePeerConnection.prototype.setRemoteDescription = function(description) {
    let remoteDescription = description;

    if (this.isSpatialScalabilityOn()) {
        remoteDescription = this.tpcUtils.insertUnifiedPlanSimulcastReceive(remoteDescription);
        this.trace('setRemoteDescription::postTransform (sim receive)', dumpSDP(remoteDescription));
    }
    remoteDescription = this.tpcUtils.ensureCorrectOrderOfSsrcs(remoteDescription);
    this.trace('setRemoteDescription::postTransform (correct ssrc order)', dumpSDP(remoteDescription));

    remoteDescription = this._mungeDescription(remoteDescription);

    return new Promise((resolve, reject) => {
        this.peerconnection.setRemoteDescription(remoteDescription)
            .then(() => {
                this.trace('setRemoteDescriptionOnSuccess');
                const remoteUfrag = SDPUtil.getUfrag(remoteDescription.sdp);

                if (remoteUfrag !== this.remoteUfrag) {
                    this.remoteUfrag = remoteUfrag;
                    this.eventEmitter.emit(RTCEvents.REMOTE_UFRAG_CHANGED, this, remoteUfrag);
                }

                this._initializeDtlsTransport();

                resolve();
            }, err => {
                this.trace('setRemoteDescriptionOnFailure', err);
                this.eventEmitter.emit(RTCEvents.SET_REMOTE_DESCRIPTION_FAILED, err, this);
                reject(err);
            });
    });
};

/**
 * Changes the resolution of the video stream that is sent to the peer based on the resolution requested by the peer
 * and user preference, sets the degradation preference on the sender based on the video type, configures the maximum
 * bitrates on the send stream.
 *
 * @param {number} frameHeight - The max frame height to be imposed on the outgoing video stream.
 * @param {JitsiLocalTrack} - The local track for which the sender constraints have to be applied.
 * @param {preferredCodec} - The video codec that needs to be configured on the sender associated with the video source.
 * @returns {Promise} promise that will be resolved when the operation is successful and rejected otherwise.
 */
TraceablePeerConnection.prototype.setSenderVideoConstraints = function(frameHeight, localVideoTrack, preferredCodec) {
    if (frameHeight < 0 || isNaN(frameHeight)) {
        throw new Error(`Invalid frameHeight: ${frameHeight}`);
    }
    if (!localVideoTrack) {
        throw new Error('Local video track is missing');
    }
    const sourceName = localVideoTrack.getSourceName();

    // Ignore sender constraints if the video track is muted.
    if (localVideoTrack.isMuted()) {
        this._senderMaxHeights.set(sourceName, frameHeight);

        return Promise.resolve();
    }

    const codec = preferredCodec ?? this.codecSettings.codecList[0];

    return this._updateVideoSenderParameters(
        () => this._updateVideoSenderEncodings(frameHeight, localVideoTrack, codec));
};

/**
 * Returns a wrapped-up promise so that the setParameters() call on the RTCRtpSender for video sources are chained.
 * This is needed on Chrome as it resets the transaction id after executing setParameters() and can affect the next on
 * the fly updates if they are not chained.
 * https://chromium.googlesource.com/external/webrtc/+/master/pc/rtp_sender.cc#340
 * @param {Function} nextFunction - The function to be called when the last video sender update promise is settled.
 * @returns {Promise}
 */
TraceablePeerConnection.prototype._updateVideoSenderParameters = function(nextFunction) {
    const nextPromise = this._lastVideoSenderUpdatePromise
        .finally(nextFunction);

    this._lastVideoSenderUpdatePromise = nextPromise;

    return nextPromise;
};

/**
 * Configures the video stream with resolution / degradation / maximum bitrates
 *
 * @param {number} frameHeight - The max frame height to be imposed on the outgoing video stream.
 * @param {JitsiLocalTrack} - The local track for which the sender constraints have to be applied.
 * @param {preferredCodec} - The video codec that needs to be configured on the sender associated with the video source.
 * @returns {Promise} promise that will be resolved when the operation is successful and rejected otherwise.
 */
TraceablePeerConnection.prototype._updateVideoSenderEncodings = function(frameHeight, localVideoTrack, preferredCodec) {
    const videoSender = this.findSenderForTrack(localVideoTrack.getTrack());
    const videoType = localVideoTrack.getVideoType();
    const isScreensharingTrack = videoType === VideoType.DESKTOP;

    if (!videoSender) {
        return Promise.resolve();
    }
    const parameters = videoSender.getParameters();

    if (!parameters?.encodings?.length) {
        return Promise.resolve();
    }

    const isSharingLowFpsScreen = isScreensharingTrack && this._capScreenshareBitrate;

    // Set the degradation preference.
    const preference = isSharingLowFpsScreen
        ? DEGRADATION_PREFERENCE_DESKTOP // Prefer resolution for low fps share.
        : DEGRADATION_PREFERENCE_CAMERA; // Prefer frame-rate for high fps share and camera.

    parameters.degradationPreference = preference;

    // Calculate the encodings active state based on the resolution requested by the bridge.
    const codecForCamera = preferredCodec ?? this.tpcUtils.getConfiguredVideoCodec(localVideoTrack);
    const codec = isScreensharingTrack ? this._getPreferredCodecForScreenshare(codecForCamera) : codecForCamera;
    const activeState = this.tpcUtils.calculateEncodingsActiveState(localVideoTrack, codec, frameHeight);
    let bitrates = this.tpcUtils.calculateEncodingsBitrates(localVideoTrack, codec, frameHeight);
    const scalabilityModes = this.tpcUtils.calculateEncodingsScalabilityMode(localVideoTrack, codec, frameHeight);
    let scaleFactors = this.tpcUtils.calculateEncodingsScaleFactor(localVideoTrack, codec, frameHeight);
    const sourceName = localVideoTrack.getSourceName();
    let needsUpdate = false;

    // Do not configure 'scaleResolutionDownBy' and 'maxBitrate' for encoders running in VP9 legacy K-SVC mode since
    // the browser sends only the lowest resolution layer when those are configured. Those fields need to be reset in
    // case they were set when the endpoint was encoding video using the other codecs before switching over to VP9
    // K-SVC codec.
    if (codec === CodecMimeType.VP9
        && this.isSpatialScalabilityOn()
        && !this.tpcUtils.codecSettings[codec].scalabilityModeEnabled) {
        scaleFactors = scaleFactors.map(() => undefined);
        bitrates = bitrates.map(() => undefined);
    }

    for (const idx in parameters.encodings) {
        if (parameters.encodings.hasOwnProperty(idx)) {
            const {
                active = undefined,
                codec: currentCodec = undefined,
                maxBitrate = undefined,
                scalabilityMode = undefined,
                scaleResolutionDownBy = undefined
            } = parameters.encodings[idx];

            if (active !== activeState[idx]) {
                parameters.encodings[idx].active = activeState[idx];
                needsUpdate = true;
            }

            // Firefox doesn't follow the spec and lets application specify the degradation preference on the
            // encodings.
            browser.isFirefox() && (parameters.encodings[idx].degradationPreference = preference);

            if (scaleResolutionDownBy !== scaleFactors[idx]) {
                parameters.encodings[idx].scaleResolutionDownBy = scaleFactors[idx];
                needsUpdate = true;
            }
            if (maxBitrate !== bitrates[idx]) {
                parameters.encodings[idx].maxBitrate = bitrates[idx];
                needsUpdate = true;
            }

            // Configure scalability mode when its supported and enabled.
            if (scalabilityModes) {
                if (scalabilityMode !== scalabilityModes[idx]) {
                    parameters.encodings[idx].scalabilityMode = scalabilityModes[idx];
                    needsUpdate = true;
                }
            } else {
                parameters.encodings[idx].scalabilityMode = undefined;
            }

            const expectedPattern = `${MediaType.VIDEO}/${codec.toUpperCase()}`;

            // Configure the codec here if its supported.
            if (this.usesCodecSelectionAPI() && currentCodec?.mimeType !== expectedPattern) {
                const matchingCodec = parameters.codecs.find(pt => pt.mimeType === expectedPattern);

                parameters.encodings[idx].codec = matchingCodec;
                needsUpdate = true;

                Statistics.sendAnalytics(
                    VIDEO_CODEC_CHANGED,
                    {
                        value: codec,
                        videoType
                    });
            }
        }
    }

    if (!needsUpdate) {
        this._senderMaxHeights.set(sourceName, frameHeight);

        return Promise.resolve();
    }

    logger.info(`${this} setting max height=${frameHeight},encodings=${JSON.stringify(parameters.encodings)}`);

    return videoSender.setParameters(parameters).then(() => {
        this._senderMaxHeights.set(sourceName, frameHeight);
        localVideoTrack.maxEnabledResolution = frameHeight;
        this.eventEmitter.emit(RTCEvents.LOCAL_TRACK_MAX_ENABLED_RESOLUTION_CHANGED, localVideoTrack);
    });
};

/**
 * Resumes or suspends media on the peerconnection by setting the active state on RTCRtpEncodingParameters
 * associated with all the senders that have a track attached to it.
 *
 * @param {boolean} enable - whether outgoing media needs to be enabled or disabled.
 * @param {string} mediaType - media type, 'audio' or 'video', if neither is passed, all outgoing media will either
 * be enabled or disabled.
 * @returns {Promise} - A promise that is resolved when the change is succesful on all the senders, rejected
 * otherwise.
 */
TraceablePeerConnection.prototype.setMediaTransferActive = function(enable, mediaType) {
    logger.info(`${this} ${enable ? 'Resuming' : 'Suspending'} media transfer.`);

    const senders = this.peerconnection.getSenders()
        .filter(s => Boolean(s.track) && (!mediaType || s.track.kind === mediaType));
    const promises = [];

    for (const sender of senders) {
        if (sender.track.kind === MediaType.VIDEO) {
            promises.push(this._updateVideoSenderParameters(() => this._enableSenderEncodings(sender, enable)));
        } else {
            promises.push(this._enableSenderEncodings(sender, enable));
        }
    }

    return Promise.allSettled(promises)
        .then(settledResult => {
            const errors = settledResult
                .filter(result => result.status === 'rejected')
                .map(result => result.reason);

            if (errors.length) {
                return Promise.reject(new Error('Failed to change encodings on the RTCRtpSenders'
                    + `${errors.join(' ')}`));
            }

            return Promise.resolve();
        });
};

/**
 * Enables/disables outgoing video media transmission on this peer connection. When disabled the stream encoding's
 * active state is enabled or disabled to send or stop the media.
 * @param {boolean} active <tt>true</tt> to enable video media transmission or <tt>false</tt> to disable. If the value
 * is not a boolean the call will have no effect.
 * @return {Promise} A promise that is resolved when the change is succesful, rejected otherwise.
 * @public
 */
TraceablePeerConnection.prototype.setVideoTransferActive = function(active) {
    logger.debug(`${this} video transfer active: ${active}`);
    const changed = this.videoTransferActive !== active;

    this.videoTransferActive = active;

    if (changed) {
        return this.setMediaTransferActive(active, MediaType.VIDEO);
    }

    return Promise.resolve();
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
 * Closes underlying WebRTC PeerConnection instance and removes all remote
 * tracks by emitting {@link RTCEvents.REMOTE_TRACK_REMOVED} for each one of
 * them.
 */
TraceablePeerConnection.prototype.close = function() {
    this.trace('stop');

    // Off SignalingEvents
    this.signalingLayer.off(SignalingEvents.PEER_MUTED_CHANGED, this._peerMutedChanged);
    this.signalingLayer.off(SignalingEvents.PEER_VIDEO_TYPE_CHANGED, this._peerVideoTypeChanged);
    this.peerconnection.removeEventListener('track', this.onTrack);

    if (FeatureFlags.isSsrcRewritingSupported()) {
        for (const remoteTrack of this.remoteTracksBySsrc.values()) {
            this._removeRemoteTrack(remoteTrack);
        }
        this.remoteTracksBySsrc.clear();
    } else {
        for (const peerTracks of this.remoteTracks.values()) {
            for (const remoteTracks of peerTracks.values()) {
                for (const remoteTrack of remoteTracks) {
                    this._removeRemoteTrack(remoteTrack);
                }
            }
        }
        this.remoteTracks.clear();
    }

    this._dtmfSender = null;
    this._dtmfTonesQueue = [];

    if (!this.rtc._removePeerConnection(this)) {
        logger.error(`${this} rtc._removePeerConnection returned false`);
    }
    if (this.statsinterval !== null) {
        window.clearInterval(this.statsinterval);
        this.statsinterval = null;
    }
    logger.info(`${this} Closing peerconnection`);
    this.peerconnection.close();
};

TraceablePeerConnection.prototype.createAnswer = function(constraints) {
    return this._createOfferOrAnswer(false /* answer */, constraints);
};

TraceablePeerConnection.prototype.createOffer = function(constraints) {
    return this._createOfferOrAnswer(true /* offer */, constraints);
};

TraceablePeerConnection.prototype._createOfferOrAnswer = function(isOffer, constraints) {
    const logName = isOffer ? 'Offer' : 'Answer';

    this.trace(`create${logName}`, JSON.stringify(constraints, null, ' '));

    const handleSuccess = (resultSdp, resolveFn, rejectFn) => {
        try {
            this.trace(
                `create${logName}OnSuccess::preTransform`, dumpSDP(resultSdp));

            // Munge local description to add 3 SSRCs for video tracks when spatial scalability is enabled.
            if (this.isSpatialScalabilityOn() && browser.usesSdpMungingForSimulcast()) {
                // eslint-disable-next-line no-param-reassign
                resultSdp = this.simulcast.mungeLocalDescription(resultSdp);
                this.trace(`create${logName} OnSuccess::postTransform (simulcast)`, dumpSDP(resultSdp));
            }

            if (!this.options.disableRtx && browser.usesSdpMungingForSimulcast()) {
                // eslint-disable-next-line no-param-reassign
                resultSdp = {
                    type: resultSdp.type,
                    sdp: this.rtxModifier.modifyRtxSsrcs(resultSdp.sdp)
                };

                this.trace(
                    `create${logName}`
                         + 'OnSuccess::postTransform (rtx modifier)',
                    dumpSDP(resultSdp));
            }

            this._processAndExtractSourceInfo(resultSdp.sdp);

            resolveFn(resultSdp);
        } catch (e) {
            this.trace(`create${logName}OnError`, e);
            this.trace(`create${logName}OnError`, dumpSDP(resultSdp));
            logger.error(`${this} create${logName}OnError`, e, dumpSDP(resultSdp));

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

    // Set the codec preference before creating an offer or answer so that the generated SDP will have
    // the correct preference order.
    if (browser.supportsCodecPreferences() && this.codecSettings) {
        const { codecList, mediaType } = this.codecSettings;
        const transceivers = this.peerconnection.getTransceivers()
            .filter(t => t.receiver && t.receiver?.track?.kind === mediaType);
        let capabilities = RTCRtpReceiver.getCapabilities(mediaType)?.codecs;

        if (transceivers.length && capabilities) {
            // Rearrange the codec list as per the preference order.
            for (const codec of codecList.slice().reverse()) {
                // Move the desired codecs (all variations of it as well) to the beginning of the list
                /* eslint-disable-next-line arrow-body-style */
                capabilities.sort(caps => {
                    return caps.mimeType.toLowerCase() === `${mediaType}/${codec}` ? -1 : 1;
                });
            }

            // Disable ulpfec and RED on the p2p peerconnection.
            if (this.isP2P && mediaType === MediaType.VIDEO) {
                capabilities = capabilities
                    .filter(caps => caps.mimeType.toLowerCase() !== `${MediaType.VIDEO}/${CodecMimeType.ULPFEC}`
                            && caps.mimeType.toLowerCase() !== `${MediaType.VIDEO}/${CodecMimeType.RED}`);
            }

            // Apply codec preference to all the transceivers associated with the given media type.
            for (const transceiver of transceivers) {
                transceiver.setCodecPreferences(capabilities);
            }
        }
    }

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
 * Track the SSRCs seen so far.
 * @param {number} ssrc - SSRC.
 * @return {boolean} - Whether this is a new SSRC.
 */
TraceablePeerConnection.prototype.addRemoteSsrc = function(ssrc) {
    const existing = this.remoteSSRCs.has(ssrc);

    if (!existing) {
        this.remoteSSRCs.add(ssrc);
    }

    return !existing;
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
 * @returns {Promise<Object>} Promise which resolves with data providing statistics about
 * the peerconnection.
 */
TraceablePeerConnection.prototype.getStats = function() {
    return this.peerconnection.getStats();
};

/**
 * Creates a text representation of this <tt>TraceablePeerConnection</tt>
 * instance.
 * @return {string}
 */
TraceablePeerConnection.prototype.toString = function() {
    return `TPC[id=${this.id},type=${this.isP2P ? 'P2P' : 'JVB'}]`;
};
