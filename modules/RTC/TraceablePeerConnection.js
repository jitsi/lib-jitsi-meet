import { getLogger } from '@jitsi/logger';
import { Interop } from '@jitsi/sdp-interop';
import transform from 'sdp-transform';

import * as CodecMimeType from '../../service/RTC/CodecMimeType';
import { MediaDirection } from '../../service/RTC/MediaDirection';
import { MediaType } from '../../service/RTC/MediaType';
import RTCEvents from '../../service/RTC/RTCEvents';
import * as SignalingEvents from '../../service/RTC/SignalingEvents';
import { getSourceIndexFromSourceName } from '../../service/RTC/SignalingLayer';
import { VideoType } from '../../service/RTC/VideoType';
import { SS_DEFAULT_FRAME_RATE } from '../RTC/ScreenObtainer';
import browser from '../browser';
import FeatureFlags from '../flags/FeatureFlags';
import LocalSdpMunger from '../sdp/LocalSdpMunger';
import RtxModifier from '../sdp/RtxModifier';
import SDP from '../sdp/SDP';
import SDPUtil from '../sdp/SDPUtil';
import SdpConsistency from '../sdp/SdpConsistency';
import SdpSimulcast from '../sdp/SdpSimulcast';
import { SdpTransformWrap } from '../sdp/SdpTransformUtil';
import * as GlobalOnErrorHandler from '../util/GlobalOnErrorHandler';

import JitsiRemoteTrack from './JitsiRemoteTrack';
import RTC from './RTC';
import {
    HD_BITRATE,
    HD_SCALE_FACTOR,
    SIM_LAYER_RIDS,
    TPCUtils
} from './TPCUtils';

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
 * @param {boolean} options.disableSimulcast if set to 'true' will disable the simulcast.
 * @param {boolean} options.disableRtx if set to 'true' will disable the RTX.
 * @param {string} options.disabledCodec the mime type of the code that should not be negotiated on the peerconnection.
 * @param {string} options.preferredCodec the mime type of the codec that needs to be made the preferred codec for the
 * peerconnection.
 * @param {boolean} options.startSilent If set to 'true' no audio will be sent or received.
 * @param {boolean} options.usesUnifiedPlan Indicates if the  browser is running in unified plan mode.
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
     * The set of remote SSRCs seen so far.
     * Distinguishes new SSRCs from those that have been remapped.
     */
    this.remoteSSRCs = new Set();

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

    this.tpcUtils = new TPCUtils(this);
    this.updateLog = [];
    this.stats = {};
    this.statsinterval = null;

    /**
     * Flag used to indicate if low fps screenshare is desired.
     */
    this._capScreenshareBitrate = this.options.capScreenshareBitrate;

    /**
    * Flag used to indicate if the browser is running in unified  plan mode.
    */
    this._usesUnifiedPlan = options.usesUnifiedPlan;

    /**
     * Codec preferences set for the peerconnection through config.js.
     */
    this.codecSettings = this.options.codecSettings;

    /**
     * Flag used to indicate if RTCRtpTransceiver#setCodecPreferences is to be used instead of SDP
     * munging for codec selection.
     */
    this._usesTransceiverCodecPreferences = browser.supportsCodecPreferences() && this._usesUnifiedPlan;
    this._usesTransceiverCodecPreferences
        && logger.info('Using RTCRtpTransceiver#setCodecPreferences for codec selection');

    // We currently need these flags only for FF and that's why we are updating them only for unified plan.
    if (this._usesUnifiedPlan) {
        /**
         * Indicates whether an audio track has ever been added to the peer connection.
         */
        this._hasHadAudioTrack = false;

        /**
         * Indicates whether a video track has ever been added to the peer connection.
         */
        this._hasHadVideoTrack = false;
    }

    /**
     * @type {number} The max number of stats to keep in this.stats. Limit to
     * 300 values, i.e. 5 minutes; set to 0 to disable
     */
    this.maxstats = options.maxstats;

    this.interop = new Interop();

    if (this._usesUnifiedPlan) {
        this.simulcast = new SdpSimulcast({ numOfLayers: SIM_LAYER_RIDS.length });
    } else {
        const Simulcast = require('@jitsi/sdp-simulcast');

        this.simulcast = new Simulcast(
            {
                numOfLayers: SIM_LAYER_RIDS.length,
                explodeRemoteSimulcast: false,
                usesUnifiedPlan: false
            });
    }

    this.sdpConsistency = new SdpConsistency(this.toString());

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
     * The height constraint applied on the video sender. The default value is 2160 (4K) when layer suspension is
     * explicitly disabled.
     */
    this._senderVideoMaxHeight = 2160;

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
    this._localTrackTransceiverMids = new Map();

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

    // Use track events when browser is running in unified plan mode and stream events in plan-b mode.
    if (this._usesUnifiedPlan) {
        this.onTrack = evt => {
            const stream = evt.streams[0];

            this._remoteTrackAdded(stream, evt.track, evt.transceiver);
            stream.addEventListener('removetrack', e => {
                this._remoteTrackRemoved(stream, e.track);
            });
        };
        this.peerconnection.addEventListener('track', this.onTrack);
    } else {
        this.peerconnection.onaddstream = event => this._remoteStreamAdded(event.stream);
        this.peerconnection.onremovestream = event => this._remoteStreamRemoved(event.stream);
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
 * Obtains the media direction for given {@link MediaType}. The method takes
 * into account whether or not there are any local tracks for media and
 * the {@link audioTransferActive} and {@link videoTransferActive} flags.
 * @param {MediaType} mediaType
 * @param {boolean} isAddOperation whether the direction is to be calculated after a source-add action.
 * @return {string} one of the SDP direction constants ('sendrecv, 'recvonly'
 * etc.) which should be used when setting local description on the peer
 * connection.
 * @private
 */
TraceablePeerConnection.prototype.getDesiredMediaDirection = function(mediaType, isAddOperation = false) {
    const hasLocalSource = this.hasAnyTracksOfType(mediaType);

    if (this._usesUnifiedPlan) {
        return isAddOperation
            ? hasLocalSource ? MediaDirection.SENDRECV : MediaDirection.SENDONLY
            : hasLocalSource ? MediaDirection.RECVONLY : MediaDirection.INACTIVE;
    }

    const mediaTransferActive = mediaType === MediaType.AUDIO ? this.audioTransferActive : this.videoTransferActive;

    if (mediaTransferActive) {
        return hasLocalSource ? MediaDirection.SENDRECV : MediaDirection.RECVONLY;
    }

    return MediaDirection.INACTIVE;
};

/**
 * Returns the MID of the m-line associated with the local desktop track (if it exists).
 *
 * @returns {Number|null}
 */
TraceablePeerConnection.prototype._getDesktopTrackMid = function() {
    const desktopTrack = this.getLocalVideoTracks().find(track => track.getVideoType() === VideoType.DESKTOP);

    if (desktopTrack) {
        return Number(this._localTrackTransceiverMids.get(desktopTrack.rtcId));
    }

    return null;
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
 * Checks whether or not this {@link TraceablePeerConnection} instance contains any local tracks for given
 * <tt>mediaType</tt>.
 *
 * @param {MediaType} mediaType - The media type.
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
 *
 * @param {string} [endpointId] - The track owner's identifier (MUC nickname)
 * @param {MediaType} [mediaType] - The remote tracks will be filtered by their media type if this argument is
 * specified.
 * @return {Array<JitsiRemoteTrack>}
 */
TraceablePeerConnection.prototype.getRemoteTracks = function(endpointId, mediaType) {
    let remoteTracks = [];
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
 * Returns the target bitrates configured for the local video source.
 *
 * @returns {Object}
 */
TraceablePeerConnection.prototype.getTargetVideoBitrates = function() {
    const currentCodec = this.getConfiguredVideoCodec();

    return this.tpcUtils.videoBitrates[currentCodec.toUpperCase()] || this.tpcUtils.videoBitrates;
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
    const streamId = stream.id;

    // Do not create remote tracks for 'mixed' JVB SSRCs (used by JVB for RTCP termination).
    if (!RTC.isUserStreamById(streamId)) {
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
    const streamId = stream.id;
    const mediaType = track.kind;

    // Do not create remote tracks for 'mixed' JVB SSRCs (used by JVB for RTCP termination).
    if (!this.isP2P && !RTC.isUserStreamById(streamId)) {
        return;
    }
    logger.info(`${this} Received track event for remote stream[id=${streamId},type=${mediaType}]`);

    // look up an associated JID for a stream id
    if (!mediaType) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error(`MediaType undefined for remote track, stream id: ${streamId}, track creation failed!`));

        return;
    }

    const remoteSDP = this._usesUnifiedPlan
        ? new SDP(this.peerconnection.remoteDescription.sdp)
        : new SDP(this.remoteDescription.sdp);
    let mediaLine;

    // In unified plan mode, find the matching mline using 'mid' or the 'msid' attr of the stream.
    if (this._usesUnifiedPlan) {
        if (transceiver?.mid) {
            const mid = transceiver.mid;

            mediaLine = remoteSDP.media.find(mls => SDPUtil.findLine(mls, `a=mid:${mid}`));
        } else {
            mediaLine = remoteSDP.media.find(mls => {
                const msid = SDPUtil.findLine(mls, 'a=msid:');

                return typeof msid === 'string' && streamId === msid.substring(7).split(' ')[0];
            });
        }
    } else {
        mediaLine = remoteSDP.media.find(mls => mls.startsWith(`m=${mediaType}`));
    }

    if (!mediaLine) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error(`Matching media line not found in remote SDP for remote stream[id=${streamId},type=${mediaType}],`
                + 'track creation failed!'));

        return;
    }

    let ssrcLines = SDPUtil.findLines(mediaLine, 'a=ssrc:');

    ssrcLines = ssrcLines.filter(line => line.indexOf(`msid:${streamId}`) !== -1);
    if (!ssrcLines.length) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error(`No SSRC lines found in remote SDP for remote stream[msid=${streamId},type=${mediaType}]`
                + 'track creation failed!'));

        return;
    }

    // FIXME the length of ssrcLines[0] not verified, but it will fail
    // with global error handler anyway
    const ssrcStr = ssrcLines[0].substring(7).split(' ')[0];
    const trackSsrc = Number(ssrcStr);
    const ownerEndpointId = this.signalingLayer.getSSRCOwner(trackSsrc);

    if (isNaN(trackSsrc) || trackSsrc < 0) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error(`Invalid SSRC for remote stream[ssrc=${trackSsrc},id=${streamId},type=${mediaType}]`
                + 'track creation failed!'));

        return;
    }

    if (!ownerEndpointId) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error(`No SSRC owner known for remote stream[ssrc=${trackSsrc},id=${streamId},type=${mediaType}]`
            + 'track creation failed!'));

        return;
    }

    const sourceName = this.signalingLayer.getTrackSourceName(trackSsrc);
    const peerMediaInfo = this.signalingLayer.getPeerMediaInfo(ownerEndpointId, mediaType, sourceName);

    // Assume default presence state for remote source. Presence can be received after source signaling. This shouldn't
    // prevent the endpoint from creating a remote track for the source.
    let muted = true;
    let videoType = VideoType.CAMERA;

    if (peerMediaInfo) {
        muted = peerMediaInfo.muted;
        videoType = peerMediaInfo.videoType; // can be undefined
    } else {
        logger.info(`${this}: no source-info available for ${ownerEndpointId}:${sourceName}, assuming default state`);
    }

    this._createRemoteTrack(ownerEndpointId, stream, track, mediaType, videoType, trackSsrc, muted, sourceName);
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
 * @param {String} sourceName the track's source name
 */
TraceablePeerConnection.prototype._createRemoteTrack = function(
        ownerEndpointId,
        stream,
        track,
        mediaType,
        videoType,
        ssrc,
        muted,
        sourceName) {
    logger.info(`${this} creating remote track[endpoint=${ownerEndpointId},ssrc=${ssrc},`
        + `type=${mediaType},sourceName=${sourceName}]`);
    let remoteTracksMap = this.remoteTracks.get(ownerEndpointId);

    if (!remoteTracksMap) {
        remoteTracksMap = new Map();
        remoteTracksMap.set(MediaType.AUDIO, new Set());
        remoteTracksMap.set(MediaType.VIDEO, new Set());
        this.remoteTracks.set(ownerEndpointId, remoteTracksMap);
    }

    const userTracksByMediaType = remoteTracksMap.get(mediaType);

    if (userTracksByMediaType?.size
        && Array.from(userTracksByMediaType).find(jitsiTrack => jitsiTrack.getTrack() === track)) {
        // Ignore duplicated event which can originate either from 'onStreamAdded' or 'onTrackAdded'.
        logger.info(`${this} ignored duplicated track event for track[endpoint=${ownerEndpointId},type=${mediaType}]`);

        return;
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

    userTracksByMediaType.add(remoteTrack);
    this.eventEmitter.emit(RTCEvents.REMOTE_TRACK_ADDED, remoteTrack, this);
};

/**
 * Handles remote stream removal.
 * @param stream the WebRTC MediaStream object which is being removed from the
 * PeerConnection
 */
TraceablePeerConnection.prototype._remoteStreamRemoved = function(stream) {
    if (!RTC.isUserStream(stream)) {
        logger.info(`Ignored remote 'stream removed' event for stream[id=${stream.id}]`);

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
 *
 * @param {MediaStream} stream - WebRTC MediaStream instance which is the parent of the track.
 * @param {MediaStreamTrack} track - WebRTC MediaStreamTrack which has been removed from the PeerConnection.
 * @returns {void}
 */
TraceablePeerConnection.prototype._remoteTrackRemoved = function(stream, track) {
    const streamId = stream.id;
    const trackId = track?.id;

    // Ignore stream removed events for JVB "mixed" sources (used for RTCP termination).
    if (!RTC.isUserStreamById(streamId)) {
        return;
    }

    if (!streamId) {
        GlobalOnErrorHandler.callErrorHandler(new Error(`${this} remote track removal failed - no stream ID`));

        return;
    }

    if (!trackId) {
        GlobalOnErrorHandler.callErrorHandler(new Error(`${this} remote track removal failed - no track ID`));

        return;
    }

    const toBeRemoved = this.getRemoteTracks().find(
        remoteTrack => remoteTrack.getStreamId() === streamId && remoteTrack.getTrackId() === trackId);

    if (!toBeRemoved) {
        GlobalOnErrorHandler.callErrorHandler(new Error(`${this} remote track removal failed - track not found`));

        return;
    }

    this._removeRemoteTrack(toBeRemoved);
};

/**
 * Removes all JitsiRemoteTracks associated with given MUC nickname (resource part of the JID).
 *
 * @param {string} owner - The resource part of the MUC JID.
 * @returns {JitsiRemoteTrack[]} - The array of removed tracks.
 */
TraceablePeerConnection.prototype.removeRemoteTracks = function(owner) {
    let removedTracks = [];
    const remoteTracksByMedia = this.remoteTracks.get(owner);

    if (remoteTracksByMedia) {
        removedTracks = removedTracks.concat(Array.from(remoteTracksByMedia.get(MediaType.AUDIO)));
        removedTracks = removedTracks.concat(Array.from(remoteTracksByMedia.get(MediaType.VIDEO)));
        this.remoteTracks.delete(owner);
    }
    logger.debug(`${this} removed remote tracks[endpoint=${owner},count=${removedTracks.length}`);

    return removedTracks;
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
    const userTracksByMediaType = this.remoteTracks.get(participantId);

    if (!userTracksByMediaType) {
        logger.error(`${this} removeRemoteTrack: no remote tracks map for endpoint=${participantId}`);
    } else if (!userTracksByMediaType.get(toBeRemoved.getType())?.delete(toBeRemoved)) {
        logger.error(`${this} Failed to remove ${toBeRemoved} - type mapping messed up ?`);
    }
    this.eventEmitter.emit(RTCEvents.REMOTE_TRACK_REMOVED, toBeRemoved);
};

/**
 * Returns a map with keys msid/mediaType and <tt>TrackSSRCInfo</tt> values.
 * @param {RTCSessionDescription} desc the local description.
 * @return {Map<string,TrackSSRCInfo>}
 */
TraceablePeerConnection.prototype._extractSSRCMap = function(desc) {
    /**
     * Track SSRC infos mapped by stream ID (msid) or mediaType (unified-plan)
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
        logger.warn('An empty description was passed as an argument');

        return ssrcMap;
    }

    const session = transform.parse(desc.sdp);

    if (!Array.isArray(session.media)) {
        return ssrcMap;
    }

    let media = session.media;

    if (this._usesUnifiedPlan) {
        media = media.filter(mline => mline.direction === MediaDirection.SENDONLY
            || mline.direction === MediaDirection.SENDRECV);
    } else {
        media = [];
        [ MediaType.AUDIO, MediaType.VIDEO ].forEach(mediaType => {
            const mLine = session.media.find(m => m.type === mediaType);

            mLine && media.push(mLine);
        });
    }

    let index = 0;

    for (const mLine of media) {
        if (!Array.isArray(mLine.ssrcs)) {
            continue; // eslint-disable-line no-continue
        }

        if (Array.isArray(mLine.ssrcGroups)) {
            for (const group of mLine.ssrcGroups) {
                if (typeof group.semantics !== 'undefined' && typeof group.ssrcs !== 'undefined') {
                    // Parse SSRCs and store as numbers
                    const groupSSRCs = group.ssrcs.split(' ').map(ssrcStr => parseInt(ssrcStr, 10));
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

        let ssrcs = mLine.ssrcs;

        // Filter the ssrcs with 'msid' attribute for plan-b clients and 'cname' for unified-plan clients.
        ssrcs = this._usesUnifiedPlan
            ? ssrcs.filter(s => s.attribute === 'cname')
            : ssrcs.filter(s => s.attribute === 'msid');

        for (const ssrc of ssrcs) {
            // Use the mediaType as key for the source map for unified plan clients since msids are not part of
            // the standard and the unified plan SDPs do not have a proper msid attribute for the sources.
            // Also the ssrcs for sources do not change for Unified plan clients since RTCRtpSender#replaceTrack is
            // used for switching the tracks so it is safe to use the mediaType as the key for the TrackSSRCInfo map.
            const key = this._usesUnifiedPlan ? `${mLine.type}-${index}` : ssrc.value;
            const ssrcNumber = ssrc.id;
            let ssrcInfo = ssrcMap.get(key);

            if (!ssrcInfo) {
                ssrcInfo = {
                    ssrcs: [],
                    groups: [],
                    msid: key
                };
                ssrcMap.set(key, ssrcInfo);
            }
            ssrcInfo.ssrcs.push(ssrcNumber);

            if (groupsMap.has(ssrcNumber)) {
                const ssrcGroups = groupsMap.get(ssrcNumber);

                for (const group of ssrcGroups) {
                    ssrcInfo.groups.push(group);
                }
            }
        }

        // Currently multi-stream is supported for video only.
        mLine.type === MediaType.VIDEO && index++;
    }

    return ssrcMap;
};

/**
 * Takes a SessionDescription object and returns a "normalized" version.
 * Currently it takes care of ordering the a=ssrc lines and denoting receive
 * only SSRCs.
 */
const normalizePlanB = function(desc) {
    if (typeof desc !== 'object' || desc === null
        || typeof desc.sdp !== 'string') {
        logger.warn('An empty description was passed as an argument');

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

        cnameLine.value = `${MediaDirection.RECVONLY}-${ssrcId}`;

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
    const audioMedia = transformer.selectMedia(MediaType.AUDIO)?.[0];
    let changed = false;

    if (audioMedia && audioMedia.direction !== MediaDirection.SENDRECV) {
        if (options.startSilent) {
            audioMedia.direction = MediaDirection.INACTIVE;
        } else {
            audioMedia.direction = MediaDirection.SENDRECV;
        }

        changed = true;
    }

    const videoMedia = transformer.selectMedia(MediaType.VIDEO)?.[0];

    if (videoMedia && videoMedia.direction !== MediaDirection.SENDRECV) {
        videoMedia.direction = MediaDirection.SENDRECV;
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
 * When doing unified plan simulcast, we'll have a set of ssrcs but no ssrc-groups on Firefox. Unfortunately, Jicofo
 * will complain if it sees ssrcs with matching msids but no ssrc-group, so a ssrc-group line is injected to make
 * Jicofo happy.
 *
 * @param desc A session description object (with 'type' and 'sdp' fields)
 * @return A session description object with its sdp field modified to contain an inject ssrc-group for simulcast.
 */
TraceablePeerConnection.prototype._injectSsrcGroupForUnifiedSimulcast = function(desc) {
    const sdp = transform.parse(desc.sdp);
    const video = sdp.media.find(mline => mline.type === 'video');

    // Check if the browser supports RTX, add only the primary ssrcs to the SIM group if that is the case.
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

        // Add a SIM group for every 3 FID groups.
        for (let i = 0; i < ssrcs.length; i += 3) {
            const simSsrcs = ssrcs.slice(i, i + 3);

            video.ssrcGroups.push({
                semantics: 'SIM',
                ssrcs: simSsrcs.join(' ')
            });
        }
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

        // If the browser is running in unified plan mode and this is a jvb connection,
        // transform the SDP to Plan B first.
        if (this._usesUnifiedPlan && !this.isP2P) {
            desc = this.interop.toPlanB(desc);
            this.trace('getLocalDescription::postTransform (Plan B)',
                dumpSDP(desc));

            desc = this._injectSsrcGroupForUnifiedSimulcast(desc);
            this.trace('getLocalDescription::postTransform (inject ssrc group)',
                dumpSDP(desc));
        } else if (!this._usesUnifiedPlan) {
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
            logger.debug(`${this} getRemoteDescription no remoteDescription found`);

            return {};
        }
        this.trace('getRemoteDescription::preTransform', dumpSDP(desc));

        if (this._usesUnifiedPlan) {
            if (this.isP2P) {
                // Adjust the media direction for p2p based on whether a local source has been added.
                desc = this._adjustRemoteMediaDirection(desc);
            } else {
                // If this is a jvb connection, transform the SDP to Plan B first.
                desc = this.interop.toPlanB(desc);
                this.trace('getRemoteDescription::postTransform (Plan B)', dumpSDP(desc));
            }
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
 * Munges the order of the codecs in the SDP passed based on the preference
 * set through config.js settings. All instances of the specified codec are
 * moved up to the top of the list when it is preferred. The specified codec
 * is deleted from the list if the configuration specifies that the codec be
 * disabled.
 * @param {RTCSessionDescription} description that needs to be munged.
 * @returns {RTCSessionDescription} the munged description.
 */
TraceablePeerConnection.prototype._mungeCodecOrder = function(description) {
    const parsedSdp = transform.parse(description.sdp);
    const mLines = parsedSdp.media.filter(m => m.type === this.codecSettings.mediaType);

    if (!mLines.length) {
        return description;
    }

    for (const mLine of mLines) {
        if (this.codecSettings.disabled) {
            SDPUtil.stripCodec(mLine, this.codecSettings.disabled);
        }

        if (this.codecSettings.preferred) {
            SDPUtil.preferCodec(mLine, this.codecSettings.preferred);

            // Strip the high profile H264 codecs on mobile clients for p2p connection. High profile codecs give better
            // quality at the expense of higher load which we do not want on mobile clients. Jicofo offers only the
            // baseline code for the jvb connection and therefore this is not needed for jvb connection.
            // TODO - add check for mobile browsers once js-utils provides that check.
            if (this.codecSettings.preferred === CodecMimeType.H264 && browser.isReactNative() && this.isP2P) {
                SDPUtil.stripCodec(mLine, this.codecSettings.preferred, true /* high profile */);
            }
        }
    }

    return new RTCSessionDescription({
        type: description.type,
        sdp: transform.write(parsedSdp)
    });
};

/**
 * Add {@link JitsiLocalTrack} to this TPC.
 * @param {JitsiLocalTrack} track
 * @param {boolean} isInitiator indicates if the endpoint is the offerer.
 * @returns {Promise<void>} - resolved when done.
 */
TraceablePeerConnection.prototype.addTrack = function(track, isInitiator = false) {
    const rtcId = track.rtcId;

    logger.info(`${this} adding ${track}`);

    if (this.localTracks.has(rtcId)) {

        return Promise.reject(new Error(`${track} is already in ${this}`));
    }

    this.localTracks.set(rtcId, track);
    const webrtcStream = track.getOriginalStream();

    if (this._usesUnifiedPlan) {
        logger.debug(`${this} TPC.addTrack using unified plan`);
        try {
            this.tpcUtils.addTrack(track, isInitiator);
            if (track) {
                if (track.isAudioTrack()) {
                    this._hasHadAudioTrack = true;
                } else {
                    this._hasHadVideoTrack = true;
                }
            }
        } catch (error) {
            logger.error(`${this} Adding track=${track} failed: ${error?.message}`);

            return Promise.reject(error);
        }
    } else {
        // Use addStream API for the plan-b case.
        if (webrtcStream) {
            this._addStream(webrtcStream);

        // It's not ok for a track to not have a WebRTC stream if:
        } else if (!browser.doesVideoMuteByStreamRemove()
                    || track.isAudioTrack()
                    || (track.isVideoTrack() && !track.isMuted())) {
            return Promise.reject(new Error(`${this} no WebRTC stream for track=${track}`));
        }

        // Muted video tracks do not have WebRTC stream
        if (browser.doesVideoMuteByStreamRemove() && track.isVideoTrack() && track.isMuted()) {
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
        promiseChain = promiseChain.then(() => webrtcStream && this.tpcUtils.setEncodings(track));
    }

    return promiseChain;
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

    if (this._usesUnifiedPlan) {
        return this.tpcUtils.replaceTrack(null, track).then(() => {
            if (track) {
                if (track.isAudioTrack()) {
                    this._hasHadAudioTrack = true;
                } else {
                    this._hasHadVideoTrack = true;
                }
            }

            return false;
        });
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
    const doesBelong = this.localTracks.has(localTrack?.rtcId);

    if (!doesBelong) {
        logger.error(`${this} ${methodName}: track=${localTrack} does not belong to pc`);
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
    const sdp = this.peerconnection.localDescription?.sdp;
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
 * Checks if the client has negotiated not to receive video encoded using the given codec, i.e., the codec has been
 * removed from the local description.
 */
TraceablePeerConnection.prototype.isVideoCodecDisabled = function(codec) {
    const sdp = this.peerconnection.localDescription?.sdp;

    if (!sdp) {
        return false;
    }
    const parsedSdp = transform.parse(sdp);
    const mLine = parsedSdp.media.find(m => m.type === MediaType.VIDEO);

    return !mLine.rtp.find(r => r.codec === codec);
};

/**
 * Enables or disables simulcast for screenshare based on the frame rate requested for desktop track capture.
 *
 * @param {number} maxFps framerate to be used for desktop track capture.
 */
TraceablePeerConnection.prototype.setDesktopSharingFrameRate = function(maxFps) {
    const lowFps = maxFps <= SS_DEFAULT_FRAME_RATE;

    this._capScreenshareBitrate = this.isSimulcastOn() && lowFps;
};

/**
 * Sets the codec preference on the peerconnection. The codec preference goes into effect when
 * the next renegotiation happens.
 *
 * @param {CodecMimeType} preferredCodec the preferred codec.
 * @param {CodecMimeType} disabledCodec the codec that needs to be disabled.
 * @returns {void}
 */
TraceablePeerConnection.prototype.setVideoCodecs = function(preferredCodec, disabledCodec) {
    preferredCodec && (this.codecSettings.preferred = preferredCodec);
    disabledCodec && (this.codecSettings.disabled = disabledCodec);
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
 * Returns the sender corresponding to the given media type.
 * @param {MEDIA_TYPE} mediaType - The media type 'audio' or 'video' to be used for the search.
 * @returns {RTPSender|undefined} - The found sender or undefined if no sender
 * was found.
 */
TraceablePeerConnection.prototype.findSenderByKind = function(mediaType) {
    if (this.peerconnection.getSenders) {
        return this.peerconnection.getSenders().find(s => s.track && s.track.kind === mediaType);
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
    if (this.peerconnection.getSenders) {
        return this.peerconnection.getSenders().find(s => s.track === track);
    }
};

/**
 * Processes the local description SDP and caches the mids of the mlines associated with the given tracks.
 *
 * @param {Array<JitsiLocalTrack>} localTracks - local tracks that are added to the peerconnection.
 * @returns {void}
 */
TraceablePeerConnection.prototype.processLocalSdpForTransceiverInfo = function(localTracks) {
    const localSdp = this.peerconnection.localDescription?.sdp;

    if (!localSdp) {
        return;
    }

    [ MediaType.AUDIO, MediaType.VIDEO ].forEach(mediaType => {
        const tracks = localTracks.filter(t => t.getType() === mediaType);
        const parsedSdp = transform.parse(localSdp);
        const mLines = parsedSdp.media.filter(mline => mline.type === mediaType);

        tracks.forEach((track, idx) => {
            if (!this._localTrackTransceiverMids.has(track.rtcId)) {
                this._localTrackTransceiverMids.set(track.rtcId, mLines[idx].mid.toString());
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
 *
 * @returns {Promise<boolean>} - If the promise resolves with true, renegotiation will be needed.
 * Otherwise no renegotiation is needed.
 */
TraceablePeerConnection.prototype.replaceTrack = function(oldTrack, newTrack) {
    if (!(oldTrack || newTrack)) {
        logger.info(`${this} replaceTrack called with no new track and no old track`);

        return Promise.resolve();
    }

    if (this._usesUnifiedPlan) {
        logger.debug(`${this} TPC.replaceTrack using unified plan`);

        return this.tpcUtils.replaceTrack(oldTrack, newTrack)
            .then(transceiver => {
                if (oldTrack) {
                    this.localTracks.delete(oldTrack.rtcId);
                    this._localTrackTransceiverMids.delete(oldTrack.rtcId);
                }

                if (newTrack) {
                    if (newTrack.isAudioTrack()) {
                        this._hasHadAudioTrack = true;
                    } else {
                        this._hasHadVideoTrack = true;
                    }
                    this._localTrackTransceiverMids.set(newTrack.rtcId, transceiver?.mid?.toString());
                    this.localTracks.set(newTrack.rtcId, newTrack);
                }

                // Update the local SSRC cache for the case when one track gets replaced with another and no
                // renegotiation is triggered as a result of this.
                if (oldTrack && newTrack) {
                    const oldTrackSSRC = this.localSSRCs.get(oldTrack.rtcId);

                    if (oldTrackSSRC) {
                        this.localSSRCs.delete(oldTrack.rtcId);
                        this.localSSRCs.set(newTrack.rtcId, oldTrackSSRC);
                    }
                }

                if (transceiver) {
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
                }

                // Avoid configuring the encodings on Chromium/Safari until simulcast is configured
                // for the newly added track using SDP munging which happens during the renegotiation.
                const configureEncodingsPromise = browser.usesSdpMungingForSimulcast() || !newTrack
                    ? Promise.resolve()
                    : this.tpcUtils.setEncodings(newTrack);

                return configureEncodingsPromise.then(() => this.isP2P);
            });
    }

    logger.debug(`${this} TPC.replaceTrack using plan B`);

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

    if (this._usesUnifiedPlan) {
        return this.tpcUtils.replaceTrack(localTrack, null).then(() => false);
    }

    if (webRtcStream) {
        logger.info(`${this} Removing track=${localTrack} from PC`);
        this._removeStream(webRtcStream);

        return Promise.resolve(true);
    }

    logger.error(`${this} removeTrack - no WebRTC stream for track=${localTrack}`);

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
TraceablePeerConnection.prototype._ensureSimulcastGroupIsLast = function(localSdp) {
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
 * @param {RTCSessionDescription} localDescription the WebRTC session description instance for
 * the local description.
 * @private
 */
TraceablePeerConnection.prototype._adjustLocalMediaDirection = function(localDescription) {
    const transformer = new SdpTransformWrap(localDescription.sdp);
    let modifiedDirection = false;
    const audioMedia = transformer.selectMedia(MediaType.AUDIO)?.[0];

    if (audioMedia) {
        const desiredAudioDirection = this.getDesiredMediaDirection(MediaType.AUDIO);

        if (audioMedia.direction !== desiredAudioDirection) {
            audioMedia.direction = desiredAudioDirection;
            logger.info(`${this} Adjusted local audio direction to ${desiredAudioDirection}`);
            modifiedDirection = true;
        }
    } else {
        logger.warn(`${this} No "audio" media found in the local description`);
    }

    const videoMedia = transformer.selectMedia(MediaType.VIDEO)?.[0];

    if (videoMedia) {
        const desiredVideoDirection = this.getDesiredMediaDirection(MediaType.VIDEO);

        if (videoMedia.direction !== desiredVideoDirection) {
            videoMedia.direction = desiredVideoDirection;
            logger.info(`${this} Adjusted local video direction to ${desiredVideoDirection}`);
            modifiedDirection = true;
        }
    } else {
        logger.warn(`${this} No "video" media found in the local description`);
    }

    if (modifiedDirection) {
        return new RTCSessionDescription({
            type: localDescription.type,
            sdp: transformer.toRawSDP()
        });
    }

    return localDescription;
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

    return new RTCSessionDescription({
        type: remoteDescription.type,
        sdp: transformer.toRawSDP()
    });
};

/**
 * Munges the stereo flag as well as the opusMaxAverageBitrate in the SDP, based
 * on values set through config.js, if present.
 *
 * @param {RTCSessionDescription} description that needs to be munged.
 * @returns {RTCSessionDescription} the munged description.
 */
TraceablePeerConnection.prototype._mungeOpus = function(description) {
    const { audioQuality } = this.options;

    if (!audioQuality?.enableOpusDtx && !audioQuality?.stereo && !audioQuality?.opusMaxAverageBitrate) {
        return description;
    }

    const parsedSdp = transform.parse(description.sdp);
    const mLines = parsedSdp.media;

    for (const mLine of mLines) {
        if (mLine.type === 'audio') {
            const { payload } = mLine.rtp.find(protocol => protocol.codec === CodecMimeType.OPUS);

            if (!payload) {
                // eslint-disable-next-line no-continue
                continue;
            }

            let fmtpOpus = mLine.fmtp.find(protocol => protocol.payload === payload);

            if (!fmtpOpus) {
                fmtpOpus = {
                    payload,
                    config: ''
                };
            }

            const fmtpConfig = transform.parseParams(fmtpOpus.config);
            let sdpChanged = false;

            if (audioQuality?.stereo) {
                fmtpConfig.stereo = 1;
                sdpChanged = true;
            }

            if (audioQuality?.opusMaxAverageBitrate) {
                fmtpConfig.maxaveragebitrate = audioQuality.opusMaxAverageBitrate;
                sdpChanged = true;
            }

            // On Firefox, the OpusDtx enablement has no effect
            if (!browser.isFirefox() && audioQuality?.enableOpusDtx) {
                fmtpConfig.usedtx = 1;
                sdpChanged = true;
            }

            if (!sdpChanged) {
                // eslint-disable-next-line no-continue
                continue;
            }

            let mungedConfig = '';

            for (const key of Object.keys(fmtpConfig)) {
                mungedConfig += `${key}=${fmtpConfig[key]}; `;
            }

            fmtpOpus.config = mungedConfig.trim();
        }
    }

    return new RTCSessionDescription({
        type: description.type,
        sdp: transform.write(parsedSdp)
    });
};

/**
 * Munges the SDP to set all directions to inactive and drop all ssrc and ssrc-groups.
 *
 * @param {RTCSessionDescription} description that needs to be munged.
 * @returns {RTCSessionDescription} the munged description.
 */
TraceablePeerConnection.prototype._mungeInactive = function(description) {
    const parsedSdp = transform.parse(description.sdp);
    const mLines = parsedSdp.media;

    for (const mLine of mLines) {
        mLine.direction = MediaDirection.INACTIVE;
        mLine.ssrcs = undefined;
        mLine.ssrcGroups = undefined;
    }

    return new RTCSessionDescription({
        type: description.type,
        sdp: transform.write(parsedSdp)
    });
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
 * Sets the max bitrates on the video m-lines when VP9 is the selected codec.
 *
 * @param {RTCSessionDescription} description - The local description that needs to be munged.
 * @param {boolean} isLocalSdp - Whether the max bitrate (via b=AS line in SDP) is set on local SDP.
 * @returns RTCSessionDescription
 */
TraceablePeerConnection.prototype._setVp9MaxBitrates = function(description, isLocalSdp = false) {
    const parsedSdp = transform.parse(description.sdp);

    // Find all the m-lines associated with the local sources.
    const direction = isLocalSdp ? MediaDirection.RECVONLY : MediaDirection.SENDONLY;
    const mLines = parsedSdp.media.filter(m => m.type === MediaType.VIDEO && m.direction !== direction);

    for (const mLine of mLines) {
        if (this.codecSettings.preferred === CodecMimeType.VP9) {
            const bitrates = this.tpcUtils.videoBitrates.VP9 || this.tpcUtils.videoBitrates;
            const hdBitrate = bitrates.high ? bitrates.high : HD_BITRATE;
            const ssHdBitrate = bitrates.ssHigh ? bitrates.ssHigh : HD_BITRATE;
            const mid = mLine.mid;
            const isSharingScreen = FeatureFlags.isMultiStreamSendSupportEnabled()
                ? mid === this._getDesktopTrackMid()
                : this._isSharingScreen();
            const limit = Math.floor((isSharingScreen ? ssHdBitrate : hdBitrate) / 1000);

            // Use only the HD bitrate for now as there is no API available yet for configuring
            // the bitrates on the individual SVC layers.
            mLine.bandwidth = [ {
                type: 'AS',
                limit
            } ];
        } else {
            // Clear the bandwidth limit in SDP when VP9 is no longer the preferred codec.
            // This is needed on react native clients as react-native-webrtc returns the
            // SDP that the application passed instead of returning the SDP off the native side.
            // This line automatically gets cleared on web on every renegotiation.
            mLine.bandwidth = undefined;
        }
    }

    return new RTCSessionDescription({
        type: description.type,
        sdp: transform.write(parsedSdp)
    });
};

/**
 * Configures the stream encodings depending on the video type and the bitrates configured.
 *
 * @param {JitsiLocalTrack} - The local track for which the sender encodings have to configured.
 * @returns {Promise} promise that will be resolved when the operation is successful and rejected otherwise.
 */
TraceablePeerConnection.prototype.configureSenderVideoEncodings = function(localVideoTrack = null) {
    // If media is suspended on the peerconnection, make sure that media stays disabled. The default 'active' state for
    // the encodings after the source is added to the peerconnection is 'true', so it needs to be explicitly disabled
    // after the source is added.
    if (!(this.videoTransferActive && this.audioTransferActive)) {
        return this.tpcUtils.setMediaTransferActive(false);
    }

    if (localVideoTrack) {
        return this.setSenderVideoConstraints(
            this._senderMaxHeights.get(localVideoTrack.getSourceName()),
            localVideoTrack);
    }
    const promises = [];

    for (const track of this.getLocalVideoTracks()) {
        promises.push(this.setSenderVideoConstraints(this._senderMaxHeights.get(track.getSourceName()), track));
    }

    return Promise.allSettled(promises);
};

TraceablePeerConnection.prototype.setLocalDescription = function(description) {
    let localDescription = description;

    this.trace('setLocalDescription::preTransform', dumpSDP(localDescription));

    // Munge stereo flag and opusMaxAverageBitrate based on config.js
    localDescription = this._mungeOpus(localDescription);

    if (!this._usesUnifiedPlan) {
        localDescription = this._adjustLocalMediaDirection(localDescription);
        localDescription = this._ensureSimulcastGroupIsLast(localDescription);
    }

    // Munge the order of the codecs based on the preferences set through config.js.
    localDescription = this._mungeCodecOrder(localDescription);
    localDescription = this._setVp9MaxBitrates(localDescription, true);

    this.trace('setLocalDescription::postTransform', dumpSDP(localDescription));

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

TraceablePeerConnection.prototype.setRemoteDescription = function(description) {
    let remoteDescription = description;

    this.trace('setRemoteDescription::preTransform', dumpSDP(description));

    // Munge stereo flag and opusMaxAverageBitrate based on config.js
    remoteDescription = this._mungeOpus(remoteDescription);

    if (this._usesUnifiedPlan) {
        // Translate the SDP to Unified plan format first for the jvb case, p2p case will only have 2 m-lines.
        if (!this.isP2P) {
            const currentDescription = this.peerconnection.remoteDescription;

            remoteDescription = this.interop.toUnifiedPlan(remoteDescription, currentDescription);
            this.trace('setRemoteDescription::postTransform (Unified)', dumpSDP(remoteDescription));
        }
        if (this.isSimulcastOn()) {
            remoteDescription = this.tpcUtils.insertUnifiedPlanSimulcastReceive(remoteDescription);
            this.trace('setRemoteDescription::postTransform (sim receive)', dumpSDP(remoteDescription));
        }
        remoteDescription = this.tpcUtils.ensureCorrectOrderOfSsrcs(remoteDescription);
        this.trace('setRemoteDescription::postTransform (correct ssrc order)', dumpSDP(remoteDescription));
    } else {
        if (this.isSimulcastOn()) {
            // Implode the simulcast ssrcs so that the remote sdp has only the first ssrc in the SIM group.
            remoteDescription = this.simulcast.mungeRemoteDescription(
                remoteDescription,
                true /* add x-google-conference flag */);
            this.trace('setRemoteDescription::postTransform (simulcast)', dumpSDP(remoteDescription));
        }
        remoteDescription = normalizePlanB(remoteDescription);
    }

    // Munge the order of the codecs based on the preferences set through config.js.
    remoteDescription = this._mungeCodecOrder(remoteDescription);
    remoteDescription = this._setVp9MaxBitrates(remoteDescription);
    this.trace('setRemoteDescription::postTransform (munge codec order)', dumpSDP(remoteDescription));

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
 * @returns {Promise} promise that will be resolved when the operation is successful and rejected otherwise.
 */
TraceablePeerConnection.prototype.setSenderVideoConstraints = function(frameHeight, localVideoTrack) {
    if (frameHeight < 0) {
        throw new Error(`Invalid frameHeight: ${frameHeight}`);
    }
    const sourceName = localVideoTrack.getSourceName();

    this._senderMaxHeights.set(sourceName, frameHeight);

    // Ignore sender constraints for the following cases -
    // 1. If the media on the peerconnection is suspended (jvb conn when p2p is currently active).
    // 2. If the client is already sending video of the requested resolution.
    if (!this.videoTransferActive || this.tpcUtils.getConfiguredEncodeResolution(localVideoTrack) === frameHeight) {
        return Promise.resolve();
    }

    if (!localVideoTrack || localVideoTrack.isMuted()) {
        return Promise.resolve();
    }

    return this._updateVideoSenderParameters(this._updateVideoSenderEncodings(frameHeight, localVideoTrack));
};

/**
 * Returns a wrapped-up promise so that the setParameters() call on the RTCRtpSender for video sources are chained.
 * This is needed on Chrome as it resets the transaction id after executing setParameters() and can affect the next on
 * the fly updates if they are not chained.
 * https://chromium.googlesource.com/external/webrtc/+/master/pc/rtp_sender.cc#340
 * @param {Promise} promise - The promise that needs to be chained.
 * @returns {Promise}
 */
TraceablePeerConnection.prototype._updateVideoSenderParameters = function(promise) {
    const nextPromise = this._lastVideoSenderUpdatePromise
        .finally(() => promise);

    this._lastVideoSenderUpdatePromise = nextPromise;

    return nextPromise;
};

/**
 * Configures the video stream with resolution / degradation / maximum bitrates
 *
 * @param {number} frameHeight - The max frame height to be imposed on the outgoing video stream.
 * @param {JitsiLocalTrack} - The local track for which the sender constraints have to be applied.
 * @returns {Promise} promise that will be resolved when the operation is successful and rejected otherwise.
 */
TraceablePeerConnection.prototype._updateVideoSenderEncodings = function(frameHeight, localVideoTrack) {
    const videoSender = this.findSenderForTrack(localVideoTrack.getTrack());

    if (!videoSender) {
        return Promise.resolve();
    }
    const parameters = videoSender.getParameters();

    if (!parameters?.encodings?.length) {
        return Promise.resolve();
    }

    const isSharingLowFpsScreen = localVideoTrack.getVideoType() === VideoType.DESKTOP && this._capScreenshareBitrate;

    // Set the degradation preference.
    const preference = isSharingLowFpsScreen
        ? DEGRADATION_PREFERENCE_DESKTOP // Prefer resolution for low fps share.
        : DEGRADATION_PREFERENCE_CAMERA; // Prefer frame-rate for high fps share and camera.

    parameters.degradationPreference = preference;
    logger.info(`${this} Setting degradation preference [preference=${preference},track=${localVideoTrack}`);

    // Calculate the encodings active state based on the resolution requested by the bridge.
    this.encodingsEnabledState = this.tpcUtils.calculateEncodingsActiveState(localVideoTrack, frameHeight);
    const maxBitrates = this.tpcUtils.calculateEncodingsBitrates(localVideoTrack);
    const videoType = localVideoTrack.getVideoType();

    if (this.isSimulcastOn()) {
        for (const encoding in parameters.encodings) {
            if (parameters.encodings.hasOwnProperty(encoding)) {
                parameters.encodings[encoding].active = this.encodingsEnabledState[encoding];

                // Firefox doesn't follow the spec and lets application specify the degradation preference on the
                // encodings.
                browser.isFirefox() && (parameters.encodings[encoding].degradationPreference = preference);

                if (this.getConfiguredVideoCodec() === CodecMimeType.VP8
                    && (this.options?.videoQuality?.maxBitratesVideo
                        || isSharingLowFpsScreen
                        || this._usesUnifiedPlan)) {
                    parameters.encodings[encoding].maxBitrate = maxBitrates[encoding];
                }
            }
        }
        this.tpcUtils.updateEncodingsResolution(localVideoTrack, parameters);

    // For p2p and cases and where simulcast is explicitly disabled.
    } else if (frameHeight > 0) {
        let scaleFactor = HD_SCALE_FACTOR;

        // Do not scale down encodings for desktop tracks for non-simulcast case.
        if (videoType === VideoType.CAMERA && localVideoTrack.resolution > frameHeight) {
            scaleFactor = Math.floor(localVideoTrack.resolution / frameHeight);
        }

        parameters.encodings[0].active = true;
        parameters.encodings[0].scaleResolutionDownBy = scaleFactor;

        // Firefox doesn't follow the spec and lets application specify the degradation preference on the encodings.
        browser.isFirefox() && (parameters.encodings[0].degradationPreference = preference);

        // Configure the bitrate.
        if (this.getConfiguredVideoCodec() === CodecMimeType.VP8 && this.options?.videoQuality?.maxBitratesVideo) {
            let bitrate = this.getTargetVideoBitrates()?.high;

            if (videoType === VideoType.CAMERA) {
                bitrate = this.tpcUtils._getVideoStreamEncodings(localVideoTrack.getVideoType())
                    .find(layer => layer.scaleResolutionDownBy === scaleFactor)?.maxBitrate ?? bitrate;
            }
            parameters.encodings[0].maxBitrate = bitrate;
        } else {
            parameters.encodings[0].maxBitrate = undefined;
        }
    } else {
        parameters.encodings[0].active = false;
    }

    logger.info(`${this} setting max height=${frameHeight},encodings=${JSON.stringify(parameters.encodings)}`);

    return videoSender.setParameters(parameters).then(() => {
        localVideoTrack.maxEnabledResolution = frameHeight;
        this.eventEmitter.emit(RTCEvents.LOCAL_TRACK_MAX_ENABLED_RESOLUTION_CHANGED, localVideoTrack);
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

    if (this._usesUnifiedPlan) {
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

    logger.info(`${this} generated new recvonly SSRC=${newSSRC}`);
    this.sdpConsistency.setPrimarySsrc(newSSRC);
};

/**
 * Makes the underlying TraceablePeerConnection forget the current primary video
 * SSRC.
 */
TraceablePeerConnection.prototype.clearRecvonlySsrc = function() {
    logger.info(`${this} Clearing primary video SSRC!`);
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
    this.signalingLayer.off(SignalingEvents.PEER_MUTED_CHANGED, this._peerMutedChanged);
    this.signalingLayer.off(SignalingEvents.PEER_VIDEO_TYPE_CHANGED, this._peerVideoTypeChanged);
    this._usesUnifiedPlan && this.peerconnection.removeEventListener('track', this.onTrack);

    for (const peerTracks of this.remoteTracks.values()) {
        for (const remoteTracks of peerTracks.values()) {
            for (const remoteTrack of remoteTracks) {
                this._removeRemoteTrack(remoteTrack);
            }
        }
    }
    this.remoteTracks.clear();

    this._addedStreams = [];

    this._dtmfSender = null;
    this._dtmfTonesQueue = [];

    if (!this.rtc._removePeerConnection(this)) {
        logger.error(`${this} RTC._removePeerConnection returned false`);
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

TraceablePeerConnection.prototype._createOfferOrAnswer = function(
        isOffer,
        constraints) {
    const logName = isOffer ? 'Offer' : 'Answer';

    this.trace(`create${logName}`, JSON.stringify(constraints, null, ' '));

    const handleSuccess = (resultSdp, resolveFn, rejectFn) => {
        try {
            this.trace(
                `create${logName}OnSuccess::preTransform`, dumpSDP(resultSdp));

            if (!this._usesUnifiedPlan) {
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

            const localVideoTrack = this.getLocalVideoTracks()[0];

            // Configure simulcast for camera tracks and for desktop tracks that need simulcast.
            if (this.isSimulcastOn() && browser.usesSdpMungingForSimulcast()
                && (localVideoTrack?.getVideoType() === VideoType.CAMERA
                || this._usesUnifiedPlan)) {
                // eslint-disable-next-line no-param-reassign
                resultSdp = this.simulcast.mungeLocalDescription(resultSdp);
                this.trace(`create${logName} OnSuccess::postTransform (simulcast)`, dumpSDP(resultSdp));
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

            const ssrcMap = this._extractSSRCMap(resultSdp);

            this._processLocalSSRCsMap(ssrcMap);

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
    if (this._usesTransceiverCodecPreferences) {
        const { mediaType } = this.codecSettings;
        const transceivers = this.peerconnection.getTransceivers()
            .filter(t => t.receiver && t.receiver?.track?.kind === mediaType);

        if (transceivers.length) {
            let capabilities = RTCRtpReceiver.getCapabilities(mediaType)?.codecs;
            const disabledCodecMimeType = this.codecSettings?.disabled;
            const preferredCodecMimeType = this.codecSettings?.preferred;

            if (capabilities && disabledCodecMimeType) {
                capabilities = capabilities
                    .filter(caps => caps.mimeType.toLowerCase() !== `${mediaType}/${disabledCodecMimeType}`);
            }

            if (capabilities && preferredCodecMimeType) {
                // Move the desired codec (all variations of it as well) to the beginning of the list.
                /* eslint-disable-next-line arrow-body-style */
                capabilities.sort(caps => {
                    return caps.mimeType.toLowerCase() === `${mediaType}/${preferredCodecMimeType}` ? -1 : 1;
                });
            }

            // Disable ulpfec on Google Chrome and derivatives because
            // https://bugs.chromium.org/p/chromium/issues/detail?id=1276427
            if (browser.isChromiumBased() && mediaType === MediaType.VIDEO) {
                capabilities = capabilities
                    .filter(caps => caps.mimeType.toLowerCase() !== `${MediaType.VIDEO}/${CodecMimeType.ULPFEC}`);
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
 * Goes over the SSRC map extracted from the latest local description and tries
 * to match them with the local tracks (by MSID). Will update the values
 * currently stored in the {@link TraceablePeerConnection.localSSRCs} map.
 * @param {Map<string,TrackSSRCInfo>} ssrcMap
 * @private
 */
TraceablePeerConnection.prototype._processLocalSSRCsMap = function(ssrcMap) {
    for (const track of this.localTracks.values()) {
        const sourceName = track.getSourceName();
        const sourceIndex = getSourceIndexFromSourceName(sourceName);
        const sourceIdentifier = this._usesUnifiedPlan
            ? `${track.getType()}-${sourceIndex}`
            : track.storedMSID;

        if (ssrcMap.has(sourceIdentifier)) {
            const newSSRC = ssrcMap.get(sourceIdentifier);

            if (!newSSRC) {
                logger.error(`${this} No SSRC found for stream=${sourceIdentifier}`);

                return;
            }
            const oldSSRC = this.localSSRCs.get(track.rtcId);
            const newSSRCNum = this._extractPrimarySSRC(newSSRC);
            const oldSSRCNum = this._extractPrimarySSRC(oldSSRC);

            // eslint-disable-next-line no-negated-condition
            if (newSSRCNum !== oldSSRCNum) {
                oldSSRCNum && logger.error(`${this} Overwriting SSRC for track=${track}] with ssrc=${newSSRC}`);
                this.localSSRCs.set(track.rtcId, newSSRC);
                this.eventEmitter.emit(RTCEvents.LOCAL_TRACK_SSRC_UPDATED, track, newSSRCNum);
            }
        } else if (!track.isVideoTrack() && !track.isMuted()) {
            // It is normal to find no SSRCs for a muted video track in
            // the local SDP as the recv-only SSRC is no longer munged in.
            // So log the warning only if it's not a muted video track.
            logger.warn(`${this} No SSRCs found in the local SDP for track=${track}, stream=${sourceIdentifier}`);
        }
    }
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
 * Returns the number of simulcast streams that are currently enabled on the peerconnection.
 *
 * @returns {number} The number of simulcast streams currently enabled or 1 when simulcast is disabled.
 */
TraceablePeerConnection.prototype.getActiveSimulcastStreams = function() {
    let activeStreams = 1;

    if (this.isSimulcastOn() && this.encodingsEnabledState) {
        activeStreams = this.encodingsEnabledState.filter(stream => Boolean(stream))?.length;
    } else if (this.isSimulcastOn()) {
        activeStreams = SIM_LAYER_RIDS.length;
    }

    return activeStreams;
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
        logger.error(`${this} Overwriting local SSRCs for track id=${rtcId}`);
    }

    // Configure simulcast for camera tracks and desktop tracks that need simulcast.
    if (this.isSimulcastOn()
        && (track.getVideoType() === VideoType.CAMERA || !this.isSharingLowFpsScreen())) {
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
 * Returns if the peer connection uses Unified plan implementation.
 *
 * @returns {boolean} True if the pc uses Unified plan, false otherwise.
 */
TraceablePeerConnection.prototype.usesUnifiedPlan = function() {
    return this._usesUnifiedPlan;
};

/**
 * Creates a text representation of this <tt>TraceablePeerConnection</tt>
 * instance.
 * @return {string}
 */
TraceablePeerConnection.prototype.toString = function() {
    return `TPC[id=${this.id},type=${this.isP2P ? 'P2P' : 'JVB'}]`;
};
