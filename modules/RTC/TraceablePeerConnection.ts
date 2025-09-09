import { getLogger } from '@jitsi/logger';
import { cloneDeep } from 'lodash-es';
import transform from 'sdp-transform';

import { CodecMimeType } from '../../service/RTC/CodecMimeType';
import { MediaDirection } from '../../service/RTC/MediaDirection';
import { MediaType } from '../../service/RTC/MediaType';
import { RTCEvents } from '../../service/RTC/RTCEvents';
import { SignalingEvents } from '../../service/RTC/SignalingEvents';
import SignalingLayer, { getSourceIndexFromSourceName } from '../../service/RTC/SignalingLayer';
import { SSRC_GROUP_SEMANTICS, VIDEO_QUALITY_LEVELS } from '../../service/RTC/StandardVideoQualitySettings';
import { VideoEncoderScalabilityMode } from '../../service/RTC/VideoEncoderScalabilityMode';
import { VideoType } from '../../service/RTC/VideoType';
import { AnalyticsEvents } from '../../service/statistics/AnalyticsEvents';
import browser from '../browser';
import FeatureFlags from '../flags/FeatureFlags';
import LocalSdpMunger from '../sdp/LocalSdpMunger';
import RtxModifier from '../sdp/RtxModifier';
import SDP from '../sdp/SDP';
import SDPUtil from '../sdp/SDPUtil';
import SdpSimulcast from '../sdp/SdpSimulcast';
import { SdpTransformWrap } from '../sdp/SdpTransformUtil';
import { ISsrcGroupInfo, ISsrcInfo } from '../sdp/constants';
import Statistics from '../statistics/statistics';
import EventEmitter from '../util/EventEmitter';
import { isValidNumber } from '../util/MathUtil';

import JitsiLocalTrack from './JitsiLocalTrack';
import JitsiRemoteTrack from './JitsiRemoteTrack';
import RTC from './RTC';
import RTCUtils from './RTCUtils';
import { SS_DEFAULT_FRAME_RATE } from './ScreenObtainer';
import { ICodecConfig, TPCUtils } from './TPCUtils';


const logger = getLogger('rtc:TraceablePeerConnection');
const DEGRADATION_PREFERENCE_CAMERA = 'maintain-framerate';
const DEGRADATION_PREFERENCE_DESKTOP = 'maintain-resolution';

/**
 * Interface for legacy WebRTC stats report (pre-standard)
 */
interface ILegacyStatsReport {
    id: string;
    names: () => string[];
    stat: (name: string) => string | number;
}

/**
 * Interface for legacy stats response with result() method
 */
interface ILegacyStatsResponse {
    result: () => ILegacyStatsReport[];
}
export interface IRTCRtpEncodingParameters extends RTCRtpEncodingParameters {
    codec?: RTCRtpCodec;
    degradationPreference?: string;
    rid: string;
    // Firefox only supports the non-standard way.
    scalabilityMode?: VideoEncoderScalabilityMode;
}

/**
 * Union type for getStats() return value (legacy vs modern)
 */
type StatsResponse = RTCStatsReport | ILegacyStatsResponse;

interface ITouchToneRequest {
    duration: number;
    interToneGap: number;
    tones: string;
}

export interface ITPCOptions {
    audioQuality: IAudioQuality;
    capScreenshareBitrate: boolean;
    codecSettings: ICodecSettings;
    disableRtx: boolean;
    disableSimulcast: boolean;
    maxstats: number;
    startSilent: boolean;
    usesCodecSelectionAPI: boolean;
    videoQuality: IVideoQuality;
}

interface ITPCSourceInfo {
    groups: ISsrcGroupInfo;
    mediaType?: MediaType;
    msid: string;
    ssrcList?: Array<string>;
    videoType?: VideoType;
}
export interface IAudioQuality {
    enableOpusDtx?: boolean;
    opusMaxAverageBitrate?: number;
    stereo?: boolean;
}

export interface IVideoQuality {
    desktopbitrate?: number;
    maxBitratesVideo?: Record<string, number>;
    preferredCodec?: CodecMimeType;
    [CodecMimeType.AV1]?: ICodecConfig;
    [CodecMimeType.H264]?: ICodecConfig;
    [CodecMimeType.VP8]?: ICodecConfig;
    [CodecMimeType.VP9]?: ICodecConfig;
    maxbitratesvideo?: {
        [codec: string]: {
            [quality: string]: number;
        };
    };
}

export interface ICodecSettings {
    codecList: CodecMimeType[];
    mediaType?: MediaType;
    screenshareCodec?: CodecMimeType;
}

interface IUpdateLogEntry {
    time: Date;
    type: string;
    value: string;
}

interface IStatsEntry {
    endTime: Date;
    startTime: Date;
    times: number[];
    values: any[];
}

interface ITraceFunction {
    (what: string, info?: string, opts?: any): void;
}


/* eslint-disable max-params */
/**
 * Creates new instance of 'TraceablePeerConnection'.
 */
export default class TraceablePeerConnection {
    // Private properties
    private _dtmfSender?: RTCDTMFSender;
    private _dtmfTonesQueue: ITouchToneRequest[];
    private _dtlsTransport?: RTCDtlsTransport;
    private _usesCodecSelectionAPI: boolean;
    private _senderMaxHeights: Map<string, number>;
    private _localSsrcMap?: Map<string, ISsrcInfo>;
    private _remoteSsrcMap: Map<string, ITPCSourceInfo>;
    private _lastVideoSenderUpdatePromise: Promise<void>;
    private _localUfrag: string;
    private _remoteUfrag: string;
    private _signalingLayer: SignalingLayer;
    /**
     * @internal
     */
    _capScreenshareBitrate: boolean;
    /**
     * @internal
     */
    _hasHadAudioTrack: boolean;
    /**
     * @internal
     */
    _hasHadVideoTrack: boolean;

    // public property declarations
    audioTransferActive: boolean;
    videoTransferActive: boolean;
    id: number;
    isP2P: boolean;
    remoteTracksBySsrc: Map<number, JitsiRemoteTrack>;
    remoteTracks: Map<string, Map<MediaType, Set<JitsiRemoteTrack>>>;
    localTracks: Map<number, JitsiLocalTrack>;
    localSSRCs: Map<number, ISsrcInfo>;
    remoteSSRCs: Set<number>;
    remoteSources: Map<string, number>;
    options: ITPCOptions;
    peerconnection: RTCPeerConnection;
    tpcUtils: TPCUtils;
    updateLog: Array<IUpdateLogEntry>;
    stats: Record<string, IStatsEntry>;
    statsinterval?: number;
    simulcast: SdpSimulcast;
    localSdpMunger: LocalSdpMunger;
    eventEmitter: EventEmitter;
    rtxModifier: RtxModifier;
    localTrackTransceiverMids: Map<number, string>;
    codecSettings: ICodecSettings;
    maxstats: number;
    rtc: RTC;
    trace: ITraceFunction;
    onicecandidate?: ((event: RTCPeerConnectionIceEvent) => void);
    onTrack: (evt: RTCTrackEvent) => void;
    onsignalingstatechange?: ((event: Event) => void);
    oniceconnectionstatechange?: ((event: Event) => void);
    onnegotiationneeded?: ((event: Event) => void);
    onconnectionstatechange?: ((event: Event) => void);
    ondatachannel?: ((event: RTCDataChannelEvent) => void);

    /**
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
    constructor(
            rtc: RTC,
            id: number,
            signalingLayer: SignalingLayer,
            pcConfig: RTCConfiguration,
            constraints: { optional?: any[]; },
            isP2P: boolean,
            options: ITPCOptions
    ) {
        /**
         * Indicates whether or not this peer connection instance is actively
         * sending/receiving audio media. When set to <tt>false</tt> the SDP audio
         * media direction will be adjusted to 'inactive' in order to suspend
         * the transmission.
         * @type {boolean}
         * @internal
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
         * @internal
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
         * The map holds remote tracks associated with this peer connection.
         * It maps user's JID to media type and a set of
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
        this._localUfrag = null;

        /**
         * The remote ICE username fragment for this session.
         */
        this._remoteUfrag = null;

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
        this._signalingLayer = signalingLayer;

        // SignalingLayer listeners
        this._peerVideoTypeChanged = this._peerVideoTypeChanged.bind(this);
        this._signalingLayer.on(SignalingEvents.PEER_VIDEO_TYPE_CHANGED, this._peerVideoTypeChanged);

        this._peerMutedChanged = this._peerMutedChanged.bind(this);
        this._signalingLayer.on(SignalingEvents.PEER_MUTED_CHANGED, this._peerMutedChanged);
        this.options = options;

        // Setup SignalingLayer listeners for source-name based events.
        this._signalingLayer.on(SignalingEvents.SOURCE_MUTED_CHANGED,
            (sourceName, isMuted) => this._sourceMutedChanged(sourceName, isMuted));
        this._signalingLayer.on(SignalingEvents.SOURCE_VIDEO_TYPE_CHANGED,
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

        // RTCPeerConnection constructor only accepts RTCConfiguration
        // @ts-ignore
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
                this.getStats().then((stats: StatsResponse) => {
                    if (typeof (stats as ILegacyStatsResponse)?.result === 'function') {
                        const results = (stats as ILegacyStatsResponse).result();

                        for (let i = 0; i < results.length; ++i) {
                            const res = results[i];

                            res.names().forEach(name => {
                                this._processStat(res, name, res.stat(name));
                            });
                        }
                    } else {
                        (stats as RTCStatsReport).forEach(r => this._processStat(r, '', r));
                    }
                });
            }, 1000);
        }

        this._lastVideoSenderUpdatePromise = Promise.resolve();

        logger.info(`Create new ${this}`);
    }


    /**
     * Returns a string representation of a SessionDescription object.
     */
    static dumpSDP = function(description: Optional<Nullable<RTCSessionDescription>>): string {
        if (!description?.sdp) {
            return '';
        }

        return `type: ${description.type}\r\n${description.sdp}`;
    };

    /**
     * Handles remote track mute / unmute events.
     * @param {string} endpointId the track owner's identifier (MUC nickname)
     * @param {MediaType} mediaType "audio" or "video"
     * @param {boolean} isMuted the new mute state
     * @private
     */
    private _peerMutedChanged(endpointId: string, mediaType: MediaType, isMuted: boolean): void {
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
    }

    /**
     * Handles remote source videoType changed events.
     *
     * @param {string} sourceName - The name of the remote source.
     * @param {boolean} isMuted - The new value.
     */
    private _sourceVideoTypeChanged(sourceName: string, videoType: VideoType): void {
        const track = this.getRemoteTracks().slice().reverse().find(t => t.getSourceName() === sourceName);

        if (!track) {
            return;
        }

        track._setVideoType(videoType);
    }


    /**
     * Configures the RTCRtpEncodingParameters of the outbound rtp stream associated with the given track.
     *
     * @param {JitsiLocalTracj} localTrack - The local track whose outbound stream needs to be configured.
     * @returns {Promise} - A promise that resolves when the operation is successful, rejected otherwise.
     */
    private _configureSenderEncodings = async (localTrack: JitsiLocalTrack): Promise<void> => {
        const mediaType = localTrack.getType();
        const transceiver = localTrack?.track && localTrack.getOriginalStream()
            ? this.peerconnection.getTransceivers().find(t => t.sender?.track?.id === localTrack.getTrackId())
            : this.peerconnection.getTransceivers().find(t => t.receiver?.track?.kind === mediaType);
        const parameters = transceiver?.sender?.getParameters() as RTCRtpSendParameters;

        // Resolve if the encodings are not available yet. This happens immediately after the track is added to the
        // peerconnection on chrome in unified-plan. It is ok to ignore and not report the error here since the
        // action that triggers 'addTrack' (like unmute) will also configure the encodings and set bitrates after that.
        if (!parameters?.encodings?.length) {
            return;
        }

        parameters.encodings = this.tpcUtils.getStreamEncodings(localTrack) as RTCRtpEncodingParameters[];
        await transceiver.sender.setParameters(parameters);
    };

    /**
     * Enables/disables the streams by changing the active field on RTCRtpEncodingParameters for a given RTCRtpSender.
     *
     * @param {RTCRtpSender} sender - the sender associated with a MediaStreamTrack.
     * @param {boolean} enable - whether the streams needs to be enabled or disabled.
     * @returns {Promise} - A promise that resolves when the operation is successful, rejected otherwise.
     */
    private _enableSenderEncodings = async (sender: RTCRtpSender, enable: boolean): Promise<void> => {
        const parameters: RTCRtpSendParameters = sender.getParameters() as RTCRtpSendParameters;

        if (parameters?.encodings?.length) {
            for (const encoding of parameters.encodings) {
                encoding.active = enable;
            }
        }

        await sender.setParameters(parameters);
    };


    /**
     * Returns the list of RTCRtpReceivers created for the source of the given media type associated with
     * the set of remote endpoints specified.
     * @param {Array<string>} endpoints list of the endpoints
     * @param {string} mediaType 'audio' or 'video'
     * @returns {Array<RTCRtpReceiver>} list of receivers created by the peerconnection.
     */
    private _getReceiversByEndpointIds(endpoints: string[], mediaType: MediaType): RTCRtpReceiver[] {
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
    }


    /**
     * Handles {@link SignalingEvents.PEER_VIDEO_TYPE_CHANGED}
     * @param {string} endpointId the video owner's ID (MUC nickname)
     * @param {VideoType} videoType the new value
     * @private
     */
    private _peerVideoTypeChanged(endpointId: string, videoType: VideoType): void {
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
    }


    /**
     * Adjusts the media direction on the remote description based on availability of local and remote sources in a p2p
     * media connection.
     *
     * @param {RTCSessionDescription} remoteDescription the WebRTC session description
     *  instance for the remote description.
     * @returns the transformed remoteDescription.
     * @private
     */
    private _adjustRemoteMediaDirection(remoteDescription: RTCSessionDescription): RTCSessionDescription {
        const transformer = new SdpTransformWrap(remoteDescription?.sdp);

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

                // When there are 2 local sources and 1 remote source,
                // the first m-line should be set to 'sendrecv' while
                // the second one needs to be set to 'recvonly'.
                } else if (localSources > remoteSources) {
                    mLine.direction = idx ? MediaDirection.RECVONLY : MediaDirection.SENDRECV;

                // When there are 2 remote sources and 1 local source, the first m-line
                // should be set to 'sendrecv' while
                // the second one needs to be set to 'sendonly'.
                } else {
                    mLine.direction = idx ? MediaDirection.SENDONLY : MediaDirection.SENDRECV;
                }
            });
        });

        return new RTCSessionDescription({
            sdp: transformer.toRawSDP(),
            type: remoteDescription.type
        });
    }

    /**
     * Returns the codec to be used for screenshare based on the supported codecs and the preferred codec requested
     * through config.js setting.
     *
     * @param {CodecMimeType} defaultCodec - the preferred codec for video tracks.
     * @returns {CodecMimeType}
     */
    private _getPreferredCodecForScreenshare(defaultCodec: CodecMimeType): CodecMimeType {
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
    }

    /**
     * Sets up the _dtlsTransport object and initializes callbacks for it.
     */
    private _initializeDtlsTransport(): void {
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
    }


    /**
     * Set the simulcast stream encoding properties on the RTCRtpSender.
     *
     * @param {JitsiLocalTrack} localTrack - the current track in use for which the encodings are to be set.
     * @returns {Promise<void>} - resolved when done.
     */
    private _setEncodings(localTrack: JitsiLocalTrack): Promise<void> {
        if (localTrack.getType() === MediaType.VIDEO) {
            return this._updateVideoSenderParameters(() => this._configureSenderEncodings(localTrack));
        }

        return this._configureSenderEncodings(localTrack);
    }

    /**
     * Munges the provided description to update the codec order, set the max bitrates (for VP9 K-SVC), set stereo flag
     * and update the DD Header extensions for AV1.
     *
     * @param {RTCSessionDescription} description - The description to be munged.
     * @returns {RTCSessionDescription} - The munged description.
     */
    private _mungeDescription(description: RTCSessionDescription): RTCSessionDescription {
        this.trace('RTCSessionDescription::preTransform', TraceablePeerConnection.dumpSDP(description));
        let mungedSdp = transform.parse(description?.sdp);

        mungedSdp = this.tpcUtils.mungeOpus(mungedSdp);
        mungedSdp = this.tpcUtils.mungeCodecOrder(mungedSdp);
        mungedSdp = this.tpcUtils.setMaxBitrates(mungedSdp, true);
        const mungedDescription = new RTCSessionDescription({
            sdp: transform.write(mungedSdp),
            type: description.type
        });

        this.trace('RTCSessionDescription::postTransform', TraceablePeerConnection.dumpSDP(mungedDescription));

        return mungedDescription;
    }


    /**
     * Returns a wrapped-up promise so that the setParameters() call on the RTCRtpSender
     * for video sources are chained.
     * This is needed on Chrome as it resets the transaction id after
     * executing setParameters() and can affect the next on
     * the fly updates if they are not chained.
     * https://chromium.googlesource.com/external/webrtc/+/master/pc/rtp_sender.cc#340
     * @param {Function} nextFunction - The function to be called when the last video sender update promise is settled.
     * @returns {Promise}
     */
    private _updateVideoSenderParameters(nextFunction: () => void): Promise<void> {
        const nextPromise = this._lastVideoSenderUpdatePromise
            .finally(nextFunction);

        this._lastVideoSenderUpdatePromise = nextPromise;

        return nextPromise;
    }

    /**
     * Configures the video stream with resolution / degradation / maximum bitrates
     *
     * @param {number} frameHeight - The max frame height to be imposed on the outgoing video stream.
     * @param {JitsiLocalTrack} - The local track for which the sender constraints have to be applied.
     * @param {preferredCodec} - The video codec that needs to be configured on
     * the sender associated with the video source.
     * @returns {Promise} promise that will be resolved when the operation is successful and rejected otherwise.
     */
    private _updateVideoSenderEncodings(frameHeight: number, localVideoTrack: JitsiLocalTrack, preferredCodec: CodecMimeType): Promise<void> {
        const videoSender = this.findSenderForTrack(localVideoTrack.getTrack());
        const videoType = localVideoTrack.getVideoType();
        const isScreensharingTrack = videoType === VideoType.DESKTOP;

        if (!videoSender) {
            return Promise.resolve();
        }
        const parameters = videoSender.getParameters() as RTCRtpSendParameters;

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
        const codec = isScreensharingTrack ? this._getPreferredCodecForScreenshare(codecForCamera as CodecMimeType) : codecForCamera as CodecMimeType;
        const activeState = this.tpcUtils.calculateEncodingsActiveState(localVideoTrack, codec, frameHeight);
        let bitrates = this.tpcUtils.calculateEncodingsBitrates(localVideoTrack, codec, frameHeight);
        const scalabilityModes = this.tpcUtils.calculateEncodingsScalabilityMode(localVideoTrack, codec, frameHeight);
        let scaleFactors = this.tpcUtils.calculateEncodingsScaleFactor(localVideoTrack, codec, frameHeight);
        let needsUpdate = false;

        // Do not configure 'scaleResolutionDownBy' and 'maxBitrate' for encoders running in VP9 legacy K-SVC mode since
        // the browser sends only the lowest resolution layer when those
        // are configured. Those fields need to be reset in
        // case they were set when the endpoint was encoding video using the other codecs before switching over to VP9
        // K-SVC codec.
        if (codec === CodecMimeType.VP9
            && browser.supportsSVC()
            && this.isSpatialScalabilityOn()
            && !this.tpcUtils.codecSettings[codec].scalabilityModeEnabled) {
            scaleFactors = scaleFactors.map(() => undefined);
            bitrates = bitrates.map(() => undefined);
        }

        for (const idx in parameters.encodings) {
            if (parameters.encodings.hasOwnProperty(idx)) {
                const encoding = parameters.encodings[idx] as IRTCRtpEncodingParameters;
                const {
                    active = undefined,
                    codec: currentCodec = undefined,
                    maxBitrate = undefined,
                    scalabilityMode = undefined,
                    scaleResolutionDownBy = undefined
                } = encoding;

                if (active !== activeState[idx]) {
                    encoding.active = activeState[idx];
                    needsUpdate = true;
                }

                // Firefox doesn't follow the spec and lets application specify the degradation preference on the
                // encodings.
                browser.isFirefox() && (encoding.degradationPreference = preference);

                if (scaleResolutionDownBy !== scaleFactors[idx]) {
                    encoding.scaleResolutionDownBy = scaleFactors[idx];
                    needsUpdate = true;
                }
                if (maxBitrate !== bitrates[idx]) {
                    encoding.maxBitrate = bitrates[idx];
                    needsUpdate = true;
                }

                // Configure scalability mode when its supported and enabled.
                if (scalabilityModes) {
                    if (scalabilityMode !== scalabilityModes[idx]) {
                        encoding.scalabilityMode = scalabilityModes[idx];
                        needsUpdate = true;
                    }
                } else {
                    encoding.scalabilityMode = undefined;
                }

                const expectedPattern = `${MediaType.VIDEO}/${codec.toUpperCase()}`;

                // Configure the codec here if its supported.
                if (this.usesCodecSelectionAPI() && currentCodec?.mimeType !== expectedPattern) {
                    const matchingCodec = parameters.codecs.find(pt => pt.mimeType === expectedPattern);

                    encoding.codec = matchingCodec;
                    needsUpdate = true;

                    Statistics.sendAnalytics(
                        AnalyticsEvents.VIDEO_CODEC_CHANGED,
                        {
                            value: codec,
                            videoType
                        });
                }
            }
        }

        if (!needsUpdate) {
            return Promise.resolve();
        }

        logger.info(`${this} setting max height=${frameHeight},encodings=${JSON.stringify(parameters.encodings)}`);

        return videoSender.setParameters(parameters).then(() => {
            localVideoTrack.maxEnabledResolution = frameHeight;
            this.eventEmitter.emit(RTCEvents.LOCAL_TRACK_MAX_ENABLED_RESOLUTION_CHANGED, localVideoTrack);
        });
    }


    /**
     * Callback ivoked by {@code this._dtmfSender} when it has finished playing
     * a single tone.
     *
     * @param {Object} event - The tonechange event which indicates what characters
     * are left to be played for the current tone.
     * @private
     * @returns {void}
     */
    private _onToneChange(event: { tone: string; }): void {
        // An empty event.tone indicates the current tones have finished playing.
        // Automatically start playing any queued tones on finish.
        if (this._dtmfSender && event.tone === '' && this._dtmfTonesQueue.length) {
            const { tones, duration, interToneGap } = this._dtmfTonesQueue.shift();

            this._dtmfSender.insertDTMF(tones, duration, interToneGap);
        }
    }


    /**
     * Internal method to create an SDP offer or answer for the peer connection.
     * Handles codec preferences, SDP munging for simulcast and RTX, and source information extraction.
     * @private
     */
    private _createOfferOrAnswer(isOffer: boolean, constraints: Optional<RTCOfferOptions>): Promise<RTCSessionDescription> {
        const logName = isOffer ? 'Offer' : 'Answer';

        this.trace(`create${logName}`, JSON.stringify(constraints, null, ' '));

        const handleSuccess = (resultSdp: Nullable<RTCSessionDescription>, resolveFn: (result: RTCSessionDescription) => void, rejectFn: (error: string) => void): void => {
            try {
                this.trace(
                    `create${logName}OnSuccess::preTransform`, TraceablePeerConnection.dumpSDP(resultSdp));

                // Munge local description to add 3 SSRCs for video tracks when spatial scalability is enabled.
                if (this.isSpatialScalabilityOn() && browser.usesSdpMungingForSimulcast()) {
                    // eslint-disable-next-line no-param-reassign
                    resultSdp = this.simulcast.mungeLocalDescription(resultSdp);
                    this.trace(`create${logName} OnSuccess::postTransform (simulcast)`,
                         TraceablePeerConnection.dumpSDP(resultSdp));
                }

                if (!this.options.disableRtx && browser.usesSdpMungingForSimulcast()) {
                    // eslint-disable-next-line no-param-reassign
                    resultSdp = new RTCSessionDescription({
                        sdp: this.rtxModifier.modifyRtxSsrcs(resultSdp?.sdp),
                        type: resultSdp.type
                    });

                    this.trace(
                        `create${logName}`
                             + 'OnSuccess::postTransform (rtx modifier)',
                        TraceablePeerConnection.dumpSDP(resultSdp));
                }

                if (resultSdp?.sdp) {
                    this._processAndExtractSourceInfo(resultSdp.sdp);
                }

                resolveFn(resultSdp as RTCSessionDescription);
            } catch (e) {
                this.trace(`create${logName}OnError`, e);
                this.trace(`create${logName}OnError`, TraceablePeerConnection.dumpSDP(resultSdp));
                logger.error(`${this} create${logName}OnError`, e, TraceablePeerConnection.dumpSDP(resultSdp));

                rejectFn(e);
            }
        };

        const handleFailure = (err: string, rejectFn: (error: string) => void): void => {
            this.trace(`create${logName}OnFailure`, err);
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
    }

    /**
     * Extract primary SSRC from given {@link ITPCSSRCInfo} object.
     * @param {ITPCSSRCInfo} ssrcObj
     * @return {Nullable<number>} the primary SSRC or <tt>null</tt>
     */
    private _extractPrimarySSRC(ssrcObj: ISsrcInfo): Nullable<number> {
        if (ssrcObj?.groups?.length) {
            return ssrcObj.groups[0].ssrcs[0];
        } else if (ssrcObj?.ssrcs?.length) {
            return ssrcObj.ssrcs[0];
        }

        return null;
    }

    /**
     * Handles remote source mute and unmute changed events.
     *
     * @param {string} sourceName - The name of the remote source.
     * @param {boolean} isMuted - The new mute state.
     * @internal
     */
    _sourceMutedChanged(sourceName: string, isMuted: boolean): void {
        const track = this.getRemoteTracks().slice().reverse().find(t => t.getSourceName() === sourceName);

        if (!track) {
            logger.debug(`Remote track not found for source=${sourceName}, mute update failed!`);

            return;
        }

        track.setMute(isMuted);
    }

    /* eslint-enable max-params */

    /**
     * Process stat and adds it to the array of stats we store.
     * @param report the current stats report.
     * @param name the name of the report, if available
     * @param statValue the value to add.
     * @private
     */
    _processStat(report: RTCStats | ILegacyStatsReport, name: string, statValue: string | number | RTCStats): void {
        const id = `${report.id}-${name}`;
        let s = this.stats[id];
        const now = new Date();

        if (!s) {
            this.stats[id] = s = {
                endTime: now,
                startTime: now,
                times: [],
                values: []
            };
        }
        s.values.push(statValue);
        s.times.push(now.getTime());
        if (s.values.length > this.maxstats) {
            s.values.shift();
            s.times.shift();
        }
        s.endTime = now;
    }


    /**
     * Forwards the {@link peerconnection.iceConnectionState} state except that it
     * will convert "completed" into "connected" where both mean that the ICE has
     * succeeded and is up and running. We never see "completed" state for
     * the JVB connection, but it started appearing for the P2P one. This method
     * allows to adapt old logic to this new situation.
     * @return {RTCIceConnectionState}
     */
    getConnectionState(): RTCIceConnectionState {
        const state = this.peerconnection.iceConnectionState;

        if (state === 'completed') {
            return 'connected';
        }

        return state;
    }

    /**
     * Obtains the media direction for given {@link MediaType} that needs to be set on a p2p peerconnection's remote SDP
     * after a source-add or source-remove action. The method takes into account whether or not there are any
     * local tracks for the given media type.
     * @param {MediaType} mediaType - The media type for which the direction is to be calculated.
     * @param {boolean} isAddOperation whether the direction is to be calculated after a source-add action.
     * @return {string} one of the SDP direction constants ('sendrecv, 'recvonly' etc.)
     * which should be used when setting
     * local description on the peerconnection.
     * @internal
     */
    getDesiredMediaDirection(mediaType: MediaType, isAddOperation = false): MediaDirection {
        return this.tpcUtils.getDesiredMediaDirection(mediaType, isAddOperation);
    }

    /**
     * Tells whether or not this TPC instance has spatial scalability enabled.
     * @return {boolean} <tt>true</tt> if spatial scalability is enabled and active or
     * <tt>false</tt> if it's turned off.
     */
    isSpatialScalabilityOn(): boolean {
        const h264SimulcastEnabled = this.tpcUtils.codecSettings[CodecMimeType.H264].scalabilityModeEnabled;

        return !this.options.disableSimulcast
            && (this.codecSettings.codecList[0] !== CodecMimeType.H264 || h264SimulcastEnabled);
    }

    /**
     * Obtains audio levels of the remote audio tracks by getting the source information on the RTCRtpReceivers.
     * The information relevant to the ssrc is updated each time a RTP packet constaining the ssrc is received.
     * @param {Array<string>} speakerList list of endpoint ids for which audio levels are to be gathered.
     * @returns {Object} containing ssrc and audio level information as a key-value pair.
     */
    getAudioLevels(speakerList: string[] = []): Record<string, number> {
        const audioLevels = {};
        const audioReceivers = speakerList.length
            ? this._getReceiversByEndpointIds(speakerList, MediaType.AUDIO)
            : this.peerconnection.getReceivers()
                .filter(receiver => receiver.track
                    && receiver.track.kind === MediaType.AUDIO && receiver.track.enabled);

        audioReceivers.forEach(remote => {
            const ssrc = remote.getSynchronizationSources();

            if (ssrc?.length) {
                // As per spec, this audiolevel is a value between 0..1 (linear), where 1.0
                // represents 0 dBov, 0 represents silence, and 0.5 represents approximately
                // 6 dBSPL change in the sound pressure level from 0 dBov.
                // https://www.w3.org/TR/webrtc/#dom-rtcrtpcontributingsource-audiolevel
                audioLevels[ssrc[0].source] = ssrc[0].audioLevel;
            }
        });

        return audioLevels;
    }

    /**
     * Checks if the browser is currently doing true simulcast where in three
     * different media streams are being sent to the
     * bridge. Currently this happens always for VP8 and only if simulcast is enabled for VP9/AV1/H264.
     *
     * @param {JitsiLocalTrack} localTrack - The local video track.
     * @returns {boolean}
     */
    doesTrueSimulcast(localTrack: JitsiLocalTrack): boolean {
        const currentCodec = this.tpcUtils.getConfiguredVideoCodec(localTrack);

        return this.isSpatialScalabilityOn() && this.tpcUtils.isRunningInSimulcastMode(currentCodec as CodecMimeType);
    }

    /**
     * Returns the SSRCs associated with a given local video track.
     *
     * @param {JitsiLocalTrack} localTrack
     * @returns
     */
    getLocalVideoSSRCs(localTrack: JitsiLocalTrack): number[] {
        const ssrcs = [];

        if (!localTrack?.isVideoTrack()) {
            return ssrcs;
        }

        const ssrcGroup = this.isSpatialScalabilityOn() ? SSRC_GROUP_SEMANTICS.SIM : SSRC_GROUP_SEMANTICS.FID;

        return this.localSSRCs.get(localTrack.rtcId)
            ?.groups?.find(group => group.semantics === ssrcGroup)?.ssrcs || ssrcs;
    }

    /**
     * Obtains local tracks for given {@link MediaType}. If the <tt>mediaType</tt>
     * argument is omitted the list of all local tracks will be returned.
     * @param {MediaType} [mediaType]
     * @return {Array<JitsiLocalTrack>}
     */
    getLocalTracks(mediaType: Optional<MediaType> = undefined): JitsiLocalTrack[] {
        let tracks = Array.from(this.localTracks.values());

        if (mediaType !== undefined) {
            tracks = tracks.filter(track => track.getType() === mediaType);
        }

        return tracks;
    }

    /**
     * Retrieves the local video tracks.
     *
     * @returns {Array<JitsiLocalTrack>} - local video tracks.
     */
    getLocalVideoTracks(): JitsiLocalTrack[] {
        return this.getLocalTracks(MediaType.VIDEO);
    }

    /**
     * Obtains all remote tracks currently known to this PeerConnection instance.
     *
     * @param {optional<string>} [endpointId] - The track owner's identifier (MUC nickname)
     * @param {optional<MediaType>} [mediaType] - The remote tracks will be filtered by their media type if this argument is
     * specified.
     * @return {Array<JitsiRemoteTrack>}
     */
    getRemoteTracks(endpointId: Optional<string> = undefined, mediaType: Optional<MediaType> = undefined): JitsiRemoteTrack[] {
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
    }

    /**
     * Returns the remote sourceInfo for a given source name.
     *
     * @param {string} sourceName - The source name.
     * @returns {TPCSourceInfo}
     */
    getRemoteSourceInfoBySourceName(sourceName: string): ITPCSourceInfo {
        return cloneDeep(this._remoteSsrcMap.get(sourceName));
    }

    /**
     * Returns a map of source names and their associated SSRCs for the remote participant.
     *
     * @param {string} id Endpoint id of the remote participant.
     * @returns {Map<string, TPCSourceInfo>} The map of source names and their associated SSRCs.
     */
    getRemoteSourceInfoByParticipant(id: string): Map<string, ITPCSourceInfo> {
        const removeSsrcInfo = new Map();
        const remoteTracks = this.getRemoteTracks(id);

        if (!remoteTracks?.length) {
            return removeSsrcInfo;
        }
        const primarySsrcs = remoteTracks.map(track => track.getSsrc());

        for (const [ sourceName, sourceInfo ] of this._remoteSsrcMap) {
            if (sourceInfo.ssrcList?.some(ssrc => primarySsrcs.includes(Number(ssrc)))) {
                removeSsrcInfo.set(sourceName, sourceInfo);
            }
        }

        return removeSsrcInfo;
    }

    /**
     * Returns the target bitrates configured for the local video source.
     *
     * @param {JitsiLocalTrack} - The local video track.
     * @returns {Object}
     */
    getTargetVideoBitrates(localTrack: JitsiLocalTrack): any {
        const currentCodec = this.tpcUtils.getConfiguredVideoCodec(localTrack);

        return this.tpcUtils.codecSettings[currentCodec].maxBitratesVideo;
    }

    /**
     * Tries to find {@link JitsiTrack} for given SSRC number. It will search both local and remote tracks bound to this
     * instance.
     * @param {number} ssrc
     * @return {Nullable<JitsiRemoteTrack | JitsiLocalTrack>}
     */
    getTrackBySSRC(ssrc: number): Nullable<JitsiRemoteTrack | JitsiLocalTrack> {
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
            if (remoteTrack.getSsrc() === ssrc) {
                return remoteTrack;
            }
        }

        return null;
    }

    /**
     * Tries to find SSRC number for given {@link JitsiTrack} id. It will search
     * both local and remote tracks bound to this instance.
     * @param {string} id
     * @return {Nullable<number>}
     */
    getSsrcByTrackId(id: string): Nullable<number> {

        const findTrackById = track => track.getTrack().id === id;
        const localTrack = this.getLocalTracks().find(findTrackById);

        if (localTrack) {
            return this.getLocalSSRC(localTrack);
        }

        const remoteTrack = this.getRemoteTracks().find(findTrackById);

        if (remoteTrack) {
            return remoteTrack.getSsrc();
        }

        return null;
    }

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
    _remoteTrackAdded(stream: MediaStream, track: MediaStreamTrack, transceiver: Nullable<RTCRtpTransceiver> = null): void {
        const streamId = stream.id;
        const mediaType = track.kind as MediaType;

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

        const remoteSDP = new SDP(this.remoteDescription?.sdp);
        let mediaLine;

        // Find the matching mline using 'mid' or the 'msid' attr of the stream.
        if (transceiver?.mid) {
            const mid = transceiver.mid;

            // @ts-ignore
            mediaLine = remoteSDP.media.find(mls => SDPUtil.findLine(mls, `a=mid:${mid}`));
        } else {
            mediaLine = remoteSDP.media.find(mls => {
                // @ts-ignore
                const msid = SDPUtil.findLine(mls, 'a=msid:');

                return typeof msid === 'string' && streamId === msid.substring(7).split(' ')[0];
            });
        }

        if (!mediaLine) {
            logger.error(
                `Matching media line not found in remote SDP for remote stream[id=${streamId},type=${mediaType}],`
                    + 'track creation failed!');

            return;
        }
        // @ts-ignore
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
        const ownerEndpointId = this._signalingLayer.getSSRCOwner(trackSsrc);

        if (!isValidNumber(trackSsrc) || trackSsrc < 0) {
            logger.error(`Invalid SSRC for remote stream[ssrc=${trackSsrc},id=${streamId},type=${mediaType}]`
                    + 'track creation failed!');

            return;
        }

        if (!ownerEndpointId) {
            logger.error(`No SSRC owner known for remote stream[ssrc=${trackSsrc},id=${streamId},type=${mediaType}]`
                + 'track creation failed!');

            return;
        }

        const sourceName = this._signalingLayer.getTrackSourceName(trackSsrc);
        const peerMediaInfo = this._signalingLayer.getPeerMediaInfo(ownerEndpointId, mediaType, sourceName);
        const trackDetails = {
            mediaType,
            muted: peerMediaInfo?.muted ?? true,
            ssrc: trackSsrc,
            stream,
            track,
            videoType: peerMediaInfo?.videoType
        };

        if (this._remoteSsrcMap.has(sourceName) && mediaType === MediaType.VIDEO) {
            trackDetails.videoType = this._remoteSsrcMap.get(sourceName).videoType;
        }

        this._createRemoteTrack(ownerEndpointId, sourceName, trackDetails);
    }

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
    _createRemoteTrack(ownerEndpointId, sourceName, trackDetails) {
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
                && Array.from(userTracksByMediaType).find((jitsiTrack: JitsiRemoteTrack) => jitsiTrack.getTrack() === track)) {
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
    }

    /**
     * Handles remote media track removal.
     *
     * @param {MediaStream} stream - WebRTC MediaStream instance which is the parent of the track.
     * @param {MediaStreamTrack} track - WebRTC MediaStreamTrack which has been removed from the PeerConnection.
     * @returns {void}
     */
    _remoteTrackRemoved(stream: MediaStream, track: MediaStreamTrack): void {
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
    }

    /**
     * Removes and disposes given <tt>JitsiRemoteTrack</tt> instance. Emits {@link RTCEvents.REMOTE_TRACK_REMOVED}.
     *
     * @param {JitsiRemoteTrack} toBeRemoved - The remote track to be removed.
     * @returns {void}
     */
    _removeRemoteTrack(toBeRemoved: JitsiRemoteTrack): void {
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
    }

    /**
     * Processes the local SDP and creates an SSRC map for every local track.
     *
     * @param {string} localSDP - SDP from the local description.
     * @returns {void}
     */
    _processAndExtractSourceInfo(localSDP: string): void {
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
                    groups: [],
                    msid,
                    ssrcs: []
                };

                ssrcs.forEach(ssrc => ssrcInfo.ssrcs.push(ssrc.id));

                if (ssrcGroups?.length) {
                    for (const group of ssrcGroups) {
                        const parsedGroup = {
                            semantics: group.semantics,
                            ssrcs: group.ssrcs.split(' ').map(ssrcStr => parseInt(ssrcStr, 10))
                        };

                        ssrcInfo.groups.push(parsedGroup);
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
    }

    /**
     * @param {JitsiLocalTrack} localTrack
     * @returns {Nullable<number>}
     */
    getLocalSSRC(localTrack: JitsiLocalTrack): Nullable<number> {
        const ssrcInfo = this._getSSRC(localTrack.rtcId.toString());

        return ssrcInfo?.ssrcs[0];
    }

    /**
     * Gets the signaling state of the peer connection.
     */
    get signalingState(): string {
        return this.peerconnection.signalingState;
    }

    /**
     * Gets the ICE connection state of the peer connection.
     */
    get iceConnectionState(): string {
        return this.peerconnection.iceConnectionState;
    }

    /**
     * Gets the connection state of the peer connection.
     */
    get connectionState(): string {
        return this.peerconnection.connectionState;
    }

    /**
     * Gets the local description of the peer connection, with optional transformations for
     * simulcast and stream identifiers.
     */
    get localDescription(): RTCSessionDescription {
        let desc = this.peerconnection.localDescription;

        if (!desc) {
            logger.debug(`${this} getLocalDescription no localDescription found`);

            // @ts-ignore
            return {};
        }

        this.trace('getLocalDescription::preTransform', TraceablePeerConnection.dumpSDP(desc));

        if (!this.isP2P) {
            desc = this.tpcUtils.injectSsrcGroupForSimulcast(desc);
            this.trace('getLocalDescription::postTransform (inject ssrc group)', TraceablePeerConnection.dumpSDP(desc));
        }

        desc = this.localSdpMunger.transformStreamIdentifiers(desc, this._localSsrcMap);

        return desc;
    }

    /**
     * Gets the remote description of the peer connection, with optional adjustments for media direction in P2P mode.
     */
    get remoteDescription(): RTCSessionDescription {
        let desc = this.peerconnection.remoteDescription;

        if (!desc) {
            logger.debug(`${this} getRemoteDescription no remoteDescription found`);

            // @ts-ignore
            return {};
        }
        this.trace('getRemoteDescription::preTransform', TraceablePeerConnection.dumpSDP(desc));

        if (this.isP2P) {
            desc = this._adjustRemoteMediaDirection(desc);
        }

        return desc;
    }

    /**
     * Retrieves the SSRC (Synchronization Source) identifier associated with the given RTC ID.
     * @private
     */
    _getSSRC(rtcId: string): Nullable<ISsrcInfo> {
        return this.localSSRCs.get(Number(rtcId));
    }

    /**
     * Checks if low fps screensharing is in progress.
     *
     * @private
     * @returns {boolean} Returns true if 5 fps screensharing is in progress, false otherwise.
     */
    isSharingLowFpsScreen(): boolean {
        return this._isSharingScreen() && this._capScreenshareBitrate;
    }

    /**
     * Checks if screensharing is in progress.
     *
     * @returns {boolean}  Returns true if a desktop track has been added to the peerconnection, false otherwise.
     */
    _isSharingScreen(): boolean {
        const tracks = this.getLocalVideoTracks();

        return Boolean(tracks.find(track => track.videoType === VideoType.DESKTOP));
    }

    /**
     * Add {@link JitsiLocalTrack} to this TPC.
     * @param {JitsiLocalTrack} track
     * @param {boolean} isInitiator indicates if the endpoint is the offerer.
     * @returns {Promise<void>} - resolved when done.
     */
    addTrack = async (track: JitsiLocalTrack, isInitiator = false): Promise<void> => {
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
                sendEncodings: [],
                streams
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
        if (browser.isFirefox() && webrtcStream && this.doesTrueSimulcast(track)) {
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
    addTrackToPc(track: JitsiLocalTrack): Promise<boolean> {
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
    }

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
    _assertTrackBelongs(methodName: string, localTrack: JitsiLocalTrack): boolean {
        const doesBelong = this.localTracks.has(localTrack?.rtcId);

        if (!doesBelong) {
            logger.error(`${this} ${methodName}: track=${localTrack} does not belong to pc`);
        }

        return doesBelong;
    }

    /**
     * Returns the codecs in the current order of preference as configured on the peerconnection.
     *
     * @param {RTCSessionDescription} - The local description to be used.
     * @returns {Array}
     */
    getConfiguredVideoCodecs(description?: RTCSessionDescription): CodecMimeType[] {
        return this.tpcUtils.getConfiguredVideoCodecs(description?.sdp);
    }

    /**
     * Enables or disables simulcast for screenshare based on the frame rate requested for desktop track capture.
     *
     * @param {number} maxFps framerate to be used for desktop track capture.
     */
    setDesktopSharingFrameRate(maxFps: number): void {
        const lowFps = maxFps <= SS_DEFAULT_FRAME_RATE;

        this._capScreenshareBitrate = this.isSpatialScalabilityOn() && lowFps;
    }

    /**
     * Sets the codec preference on the peerconnection. The codec preference goes into effect when
     * the next renegotiation happens for older clients that do not support the codec selection API.
     *
     * @param {Array<CodecMimeType>} codecList - Preferred codecs for video.
     * @param {CodecMimeType} screenshareCodec - The preferred codec for screenshare.
     * @returns {boolean} - Returns true if the codec settings were updated, false otherwise.
     */
    setVideoCodecs(codecList: CodecMimeType[], screenshareCodec: CodecMimeType): boolean {
        let updated = false;

        if (!this.codecSettings || !codecList?.length) {
            return updated;
        }

        this.codecSettings.codecList = codecList;
        if (screenshareCodec) {
            this.codecSettings.screenshareCodec = screenshareCodec;
        }

        if (!this.usesCodecSelectionAPI()) {
            return updated;
        }

        for (const track of this.getLocalVideoTracks()) {
            const currentCodec = this.tpcUtils.getConfiguredVideoCodec(track);

            if (screenshareCodec && track.getVideoType() === VideoType.DESKTOP && screenshareCodec !== currentCodec) {
                this.configureVideoSenderEncodings(track, screenshareCodec);
                updated = true;
            } else if (currentCodec !== codecList[0]) {
                this.configureVideoSenderEncodings(track);
                updated = true;
            }
        }

        return updated;
    }

    /**
     * Remove local track from this TPC.
     * @param {JitsiLocalTrack} localTrack the track to be removed from this TPC.
     *
     * FIXME It should probably remove a boolean just like {@link removeTrackFromPc}
     *       The same applies to addTrack.
     */
    removeTrack(localTrack: JitsiLocalTrack): void {
        const webRtcStream = localTrack.getOriginalStream();

        this.trace(
            'removeStream',
            localTrack.rtcId.toString(), webRtcStream ? webRtcStream.id : undefined);

        if (!this._assertTrackBelongs('removeStream', localTrack)) {
            // Abort - nothing to be done here
            return;
        }
        this.localTracks.delete(localTrack.rtcId);
        this.localSSRCs.delete(localTrack.rtcId);

        if (webRtcStream) {
            // @ts-ignore
            this.peerconnection.removeStream(webRtcStream);
        }
    }

    /**
     * Returns the receiver corresponding to the given MediaStreamTrack.
     *
     * @param {MediaSreamTrack} track - The media stream track used for the search.
     * @returns {Optional<RTCRtpReceiver>} - The found receiver or undefined if no receiver
     * was found.
     */
    findReceiverForTrack(track: MediaStreamTrack): Optional<RTCRtpReceiver> {
        return this.peerconnection.getReceivers().find(r => r.track === track);
    }

    /**
     * Returns the sender corresponding to the given MediaStreamTrack.
     *
     * @param {MediaSreamTrack} track - The media stream track used for the search.
     * @returns {Optional<RTCRtpSender>} - The found sender or undefined if no sender
     * was found.
     */
    findSenderForTrack(track: MediaStreamTrack): Optional<RTCRtpSender> {
        return this.peerconnection.getSenders().find(s => s.track === track);
    }

    /**
     * Processes the local description SDP and caches the mids of the mlines associated with the given tracks.
     *
     * @param {Array<JitsiLocalTrack>} localTracks - local tracks that are added to the peerconnection.
     * @returns {void}
     */
    processLocalSdpForTransceiverInfo(localTracks: JitsiLocalTrack[]): void {
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
    }

    /**
     * Replaces <tt>oldTrack</tt> with <tt>newTrack</tt> from the peer connection.
     * Either <tt>oldTrack</tt> or <tt>newTrack</tt> can be null; replacing a valid
     * <tt>oldTrack</tt> with a null <tt>newTrack</tt> effectively just removes
     * <tt>oldTrack</tt>
     *
     * @param {Nullable<JitsiLocalTrack>} oldTrack - The current track in use to be replaced on the pc.
     * @param {Nullable<JitsiLocalTrack>} newTrack - The new track to be used.
     * @param {boolean} isMuteOperation - Whether the operation is a mute/unmute operation.
     * @returns {Promise<boolean>} - If the promise resolves with true, renegotiation will be needed.
     * Otherwise no renegotiation is needed.
     */
    replaceTrack(oldTrack: Nullable<JitsiLocalTrack>, newTrack: Nullable<JitsiLocalTrack>, isMuteOperation = false): Promise<boolean> {
        if (!(oldTrack || newTrack)) {
            logger.info(`${this} replaceTrack called with no new track and no old track`);

            return Promise.resolve(false);
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
                // @ts-ignore
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
                // NOTE: If we return to the approach of not removing the track for FF and instead using the
                // enabled property for muting the track, we may need to change the direction to
                // RECVONLY if FF still sends the media even though the enabled flag is set to false.
                transceiver.direction
                    = newTrack || browser.isFirefox() ? MediaDirection.SENDRECV : MediaDirection.RECVONLY;

                // Configure simulcast encodings on Firefox when a track is added to the
                // peerconnection for the first time.
                const configureEncodingsPromise
                    = browser.isFirefox() && !oldTrack && newTrack && this.doesTrueSimulcast(newTrack)
                        ? this._setEncodings(newTrack)
                        : Promise.resolve();

                return configureEncodingsPromise.then(() => this.isP2P);
            });
    }

    /**
     * Removes local track from the RTCPeerConnection.
     *
     * @param {JitsiLocalTrack} localTrack the local track to be removed.
     * @return {Promise<boolean>} Promise that resolves to true if the underlying PeerConnection's state has changed and
     * renegotiation is required, false if no renegotiation is needed or Promise is rejected when something goes wrong.
     */
    removeTrackFromPc(localTrack: JitsiLocalTrack): Promise<boolean> {
        const webRtcStream = localTrack.getOriginalStream();

        this.trace('removeTrack', `${localTrack.rtcId} ${webRtcStream ? webRtcStream.id : 'null'}`);

        if (!this._assertTrackBelongs('removeTrack', localTrack)) {
            // Abort - nothing to be done here
            return Promise.reject('Track not found in the peerconnection');
        }

        return this.replaceTrack(localTrack, null, true /* isMuteOperation */).then(() => false);
    }

    /**
     * Updates the remote source map with the given source map for adding or removing sources.
     *
     * @param {Map<string, TPCSourceInfo>} sourceMap - The map of source names to their corresponding SSRCs.
     * @param {boolean} isAdd - Whether the sources are being added or removed.
     * @returns {void}
     */
    updateRemoteSources(sourceMap: Map<string, ITPCSourceInfo>, isAdd: boolean): void {
        for (const [ sourceName, ssrcInfo ] of sourceMap) {
            if (isAdd) {
                this._remoteSsrcMap.set(sourceName, ssrcInfo);
            } else {
                this._remoteSsrcMap.delete(sourceName);
            }
        }
    }

    /**
     * Returns true if the codec selection API is used for switching between codecs for the video sources.
     *
     * @returns {boolean}
     */
    usesCodecSelectionAPI(): boolean {
        // Browser throws an error when H.264 is set on the encodings. Therefore, munge the SDP when H.264 needs to be
        // selected.
        // TODO: Remove this check when the above issue is fixed.
        return this._usesCodecSelectionAPI && this.codecSettings.codecList[0] !== CodecMimeType.H264;
    }

    /**
     * Creates a new data channel on the peer connection with the specified label and options.
     */
    createDataChannel(label: string, opts: RTCDataChannelInit): RTCDataChannel {
        this.trace('createDataChannel', label, opts);

        return this.peerconnection.createDataChannel(label, opts);
    }

    /**
     * Returns the expected send resolution for a local video track based on what encodings are currently active.
     *
     * @param {JitsiLocalTrack} localTrack - The local video track.
     * @returns {number}
     */
    calculateExpectedSendResolution(localTrack: JitsiLocalTrack): number {
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

                const { encodings } = sender.getParameters() as RTCRtpSendParameters;

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
    }

    /**
     * Configures the stream encodings for the audio tracks that are added to the peerconnection.
     *
     * @param {Nullable<JitsiLocalTrack>} localAudioTrack - The local audio track.
     * @returns {Promise} promise that will be resolved when the operation is successful and rejected otherwise.
     */
    configureAudioSenderEncodings(localAudioTrack: Nullable<JitsiLocalTrack> = null): Promise<PromiseSettledResult<void>[]> | Promise<void> {
        if (localAudioTrack) {
            return this._setEncodings(localAudioTrack);
        }
        const promises = [];

        for (const track of this.getLocalTracks(MediaType.AUDIO)) {
            promises.push(this._setEncodings(track));
        }

        return Promise.allSettled(promises);
    }

    /**
     * Configures the stream encodings depending on the video type,
     * scalability mode and the bitrate settings for the codec
     * that is currently selected.
     *
     * @param {Nullable<JitsiLocalTrack>} - The local track for which the sender encodings have to configured.
     * @param {CodecMimeType} - The preferred codec for the video track.
     * @returns {Promise} promise that will be resolved when the operation is successful and rejected otherwise.
     */
    configureVideoSenderEncodings(localVideoTrack: Nullable<JitsiLocalTrack> = null, codec: Nullable<CodecMimeType> = null): Promise<PromiseSettledResult<void>[]> | Promise<void> {
        const preferredCodec = codec ?? this.codecSettings.codecList[0];

        if (localVideoTrack) {
            const height = this._senderMaxHeights.get(localVideoTrack.getSourceName())
            ?? VIDEO_QUALITY_LEVELS[0].height;

            return this.setSenderVideoConstraints(height, localVideoTrack, preferredCodec);
        }
        const promises = [];

        for (const track of this.getLocalVideoTracks()) {
            const maxHeight = this._senderMaxHeights.get(track.getSourceName()) ?? VIDEO_QUALITY_LEVELS[0].height;

            promises.push(this.setSenderVideoConstraints(maxHeight, track, preferredCodec));
        }

        return Promise.allSettled(promises);
    }

    /**
     * Sets the local description on the peerconnection.
     *
     * @param {RTCSessionDescription} description - The local description to be set.
     * @returns {Promise<void>} - Resolved when the operation is successful and rejected with an error otherwise.
     */
    setLocalDescription(description: RTCSessionDescription): Promise<void> {
        let localDescription = description;

        localDescription = this._mungeDescription(localDescription);

        return new Promise((resolve, reject) => {
            this.peerconnection.setLocalDescription(localDescription)
                .then(() => {
                    this.trace('setLocalDescriptionOnSuccess');
                    const localUfrag = SDPUtil.getUfrag(localDescription.sdp);

                    if (localUfrag !== this._localUfrag) {
                        this._localUfrag = localUfrag;
                        this.eventEmitter.emit(RTCEvents.LOCAL_UFRAG_CHANGED, this, localUfrag);
                    }

                    this._initializeDtlsTransport();

                    resolve();
                }, err => {
                    this.trace('setLocalDescriptionOnFailure', err);
                    reject(err);
                });
        });
    }

    /**
     * Sets the remote description on the peerconnection.
     *
     * @param {RTCSessionDescription} description - The remote description to be set.
     * @returns {Promise<void>} - Resolved when the operation is successful and rejected with an error otherwise.
     */
    setRemoteDescription(description: RTCSessionDescription): Promise<void> {
        let remoteDescription = description;

        if (this.isSpatialScalabilityOn()) {
            remoteDescription = this.tpcUtils.insertUnifiedPlanSimulcastReceive(remoteDescription);
            this.trace(
                'setRemoteDescription::postTransform (sim receive)',
                TraceablePeerConnection.dumpSDP(remoteDescription));
        }
        remoteDescription = this.tpcUtils.ensureCorrectOrderOfSsrcs(remoteDescription);
        this.trace(
            'setRemoteDescription::postTransform (correct ssrc order)',
             TraceablePeerConnection.dumpSDP(remoteDescription));

        remoteDescription = this._mungeDescription(remoteDescription);

        return new Promise((resolve, reject) => {
            this.peerconnection.setRemoteDescription(remoteDescription)
                .then(() => {
                    this.trace('setRemoteDescriptionOnSuccess');
                    const remoteUfrag = SDPUtil.getUfrag(remoteDescription.sdp);

                    if (remoteUfrag !== this._remoteUfrag) {
                        this._remoteUfrag = remoteUfrag;
                        this.eventEmitter.emit(RTCEvents.REMOTE_UFRAG_CHANGED, this, remoteUfrag);
                    }

                    this._initializeDtlsTransport();

                    resolve();
                })
                .catch(err => {
                    this.trace('setRemoteDescriptionOnFailure', err);
                    reject(err);
                });
        });
    }

    /**
     * Changes the resolution of the video stream that is sent to the peer based on the resolution requested by the peer
     * and user preference, sets the degradation preference on the sender
     * based on the video type, configures the maximum
     * bitrates on the send stream.
     *
     * @param {number} frameHeight - The max frame height to be imposed on the outgoing video stream.
     * @param {JitsiLocalTrack} - The local track for which the sender constraints have to be applied.
     * @param {preferredCodec} - The video codec that needs to be configured on the
     * sender associated with the video source.
     * @returns {Promise} promise that will be resolved when the operation is successful and rejected otherwise.
     */
    setSenderVideoConstraints(frameHeight: number, localVideoTrack: JitsiLocalTrack, preferredCodec?: Optional<CodecMimeType>): Promise<void> {
        if (frameHeight < 0 || !isValidNumber(frameHeight)) {
            throw new Error(`Invalid frameHeight: ${frameHeight}`);
        }
        if (!localVideoTrack) {
            throw new Error('Local video track is missing');
        }
        const sourceName = localVideoTrack.getSourceName();

        this._senderMaxHeights.set(sourceName, frameHeight);

        // Ignore sender constraints if the video track is muted.
        if (localVideoTrack.isMuted()) {
            return Promise.resolve();
        }

        const codec = preferredCodec ?? this.codecSettings.codecList[0];

        return this._updateVideoSenderParameters(
            () => this._updateVideoSenderEncodings(frameHeight, localVideoTrack, codec));
    }

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
    setMediaTransferActive(enable: boolean, mediaType?: Optional<MediaType>): Promise<void> {
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
    }

    /**
     * Enables/disables outgoing video media transmission on this peer connection. When disabled the stream encoding's
     * active state is enabled or disabled to send or stop the media.
     * @param {boolean} active <tt>true</tt> to enable video media transmission
     * or <tt>false</tt> to disable. If the value
     * is not a boolean the call will have no effect.
     * @return {Promise} A promise that is resolved when the change is succesful, rejected otherwise.
     * @public
     */
    setVideoTransferActive(active: boolean): Promise<void> {
        logger.debug(`${this} video transfer active: ${active}`);
        const changed = this.videoTransferActive !== active;

        this.videoTransferActive = active;

        if (changed) {
            return this.setMediaTransferActive(active, MediaType.VIDEO);
        }

        return Promise.resolve();
    }

    /**
     * Sends DTMF tones if possible.
     *
     * @param {string} tones - The DTMF tones string as defined by {@code RTCDTMFSender.insertDTMF}, 'tones' argument.
     * @param {number} duration - The amount of time in milliseconds that each DTMF should last. It's 200ms by default.
     * @param {number} interToneGap - The length of time in miliseconds to wait between tones. It's 200ms by default.
     *
     * @returns {void}
     */
    sendTones(tones: string, duration = 200, interToneGap = 200): void {
        if (!this._dtmfSender) {
            if (this.peerconnection.getSenders) {
                const rtpSender = this.peerconnection.getSenders().find(s => s.dtmf);

                this._dtmfSender = rtpSender?.dtmf;
                this._dtmfSender && logger.info(`${this} initialized DTMFSender using getSenders`);
            }

            if (!this._dtmfSender) {
                const localAudioTrack = Array.from(this.localTracks.values()).find(t => t.isAudioTrack());

                // @ts-ignore
                if (this.peerconnection.createDTMFSender && localAudioTrack) {
                    // @ts-ignore
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
                    duration,
                    interToneGap,
                    tones
                });

                return;
            }

            this._dtmfSender.insertDTMF(tones, duration, interToneGap);
        } else {
            logger.warn(`${this} sendTones - failed to select DTMFSender`);
        }
    }

    /**
     * Closes underlying WebRTC PeerConnection instance and removes all remote
     * tracks by emitting {@link RTCEvents.REMOTE_TRACK_REMOVED} for each one of
     * them.
     */
    close(): void {
        this.trace('stop');

        // Off SignalingEvents
        this._signalingLayer.off(SignalingEvents.PEER_MUTED_CHANGED, this._peerMutedChanged);
        this._signalingLayer.off(SignalingEvents.PEER_VIDEO_TYPE_CHANGED, this._peerVideoTypeChanged);
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
    }

    /**
     * Creates an SDP answer for the peer connection based on the provided constraints.
     */
    createAnswer(constraints: Optional<RTCOfferOptions>): Promise<RTCSessionDescription> {
        return this._createOfferOrAnswer(false /* answer */, constraints);
    }

    /**
     * Creates an SDP offer for the peer connection based on the provided constraints.
     */
    createOffer(constraints: Optional<RTCOfferOptions>): Promise<RTCSessionDescription> {
        return this._createOfferOrAnswer(true /* offer */, constraints);
    }

    /**
     * Track the SSRCs seen so far.
     * @param {number} ssrc - SSRC.
     * @return {boolean} - Whether this is a new SSRC.
     */
    addRemoteSsrc(ssrc: number): boolean {
        const existing = this.remoteSSRCs.has(ssrc);

        if (!existing) {
            this.remoteSSRCs.add(ssrc);
        }

        return !existing;
    }

    /**
     * Adds an ICE candidate to the peer connection.
     */
    addIceCandidate(candidate: RTCIceCandidate): Promise<void> {
        this.trace('addIceCandidate', JSON.stringify({
            candidate: candidate.candidate,
            sdpMLineIndex: candidate.sdpMLineIndex,
            sdpMid: candidate.sdpMid,
            usernameFragment: candidate.usernameFragment
        }, null, ' '));

        return this.peerconnection.addIceCandidate(candidate);
    }

    /**
     * Obtains call-related stats from the peer connection.
     *
     * @returns {Promise<Object>} Promise which resolves with data providing statistics about
     * the peerconnection.
     */
    getStats(): Promise<RTCStatsReport> {
        return this.peerconnection.getStats();
    }

    /**
     * Creates a text representation of this <tt>TraceablePeerConnection</tt>
     * instance.
     * @return {string}
     */
    toString(): string {
        return `TPC[id=${this.id},type=${this.isP2P ? 'P2P' : 'JVB'}]`;
    }
}
