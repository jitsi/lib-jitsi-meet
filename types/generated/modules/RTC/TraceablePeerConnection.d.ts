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
export default function TraceablePeerConnection(rtc: RTC, id: number, signalingLayer: any, iceConfig: object, constraints: object, isP2P: boolean, options: {
    disableSimulcast: boolean;
    disableRtx: boolean;
    capScreenshareBitrate: boolean;
    disabledCodec: string;
    disableH264: boolean;
    preferH264: boolean;
    preferredCodec: string;
    startSilent: boolean;
}): void;
export default class TraceablePeerConnection {
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
    constructor(rtc: RTC, id: number, signalingLayer: any, iceConfig: object, constraints: object, isP2P: boolean, options: {
        disableSimulcast: boolean;
        disableRtx: boolean;
        capScreenshareBitrate: boolean;
        disabledCodec: string;
        disableH264: boolean;
        preferH264: boolean;
        preferredCodec: string;
        startSilent: boolean;
    });
    /**
     * Indicates whether or not this peer connection instance is actively
     * sending/receiving audio media. When set to <tt>false</tt> the SDP audio
     * media direction will be adjusted to 'inactive' in order to suspend
     * the transmission.
     * @type {boolean}
     * @private
     */
    private audioTransferActive;
    /**
     * The DTMF sender instance used to send DTMF tones.
     *
     * @type {RTCDTMFSender|undefined}
     * @private
     */
    private _dtmfSender;
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
    private _dtmfTonesQueue;
    /**
     * Indicates whether or not this peer connection instance is actively
     * sending/receiving video media. When set to <tt>false</tt> the SDP video
     * media direction will be adjusted to 'inactive' in order to suspend
     * the transmission.
     * @type {boolean}
     * @private
     */
    private videoTransferActive;
    /**
     * The parent instance of RTC service which created this
     * <tt>TracablePeerConnection</tt>.
     * @type {RTC}
     */
    rtc: RTC;
    /**
     * The peer connection identifier assigned by the RTC module.
     * @type {number}
     */
    id: number;
    /**
     * Indicates whether or not this instance is used in a peer to peer
     * connection.
     * @type {boolean}
     */
    isP2P: boolean;
    /**
     * The map holds remote tracks associated with this peer connection.
     * It maps user's JID to media type and remote track
     * (one track per media type per user's JID).
     * @type {Map<string, Map<MediaType, JitsiRemoteTrack>>}
     */
    remoteTracks: any;
    /**
     * A map which stores local tracks mapped by {@link JitsiLocalTrack.rtcId}
     * @type {Map<number, JitsiLocalTrack>}
     */
    localTracks: any;
    /**
     * Keeps tracks of the WebRTC <tt>MediaStream</tt>s that have been added to
     * the underlying WebRTC PeerConnection.
     * @type {Array}
     * @private
     */
    private _addedStreams;
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
    localSSRCs: any;
    /**
     * The local ICE username fragment for this session.
     */
    localUfrag: any;
    /**
     * The remote ICE username fragment for this session.
     */
    remoteUfrag: any;
    /**
     * The signaling layer which operates this peer connection.
     * @type {SignalingLayer}
     */
    signalingLayer: any;
    _peerVideoTypeChanged: any;
    _peerMutedChanged: any;
    options: {
        disableSimulcast: boolean;
        disableRtx: boolean;
        capScreenshareBitrate: boolean;
        disabledCodec: string;
        disableH264: boolean;
        preferH264: boolean;
        preferredCodec: string;
        startSilent: boolean;
    };
    peerconnection: RTCPeerConnection;
    videoBitrates: any;
    tpcUtils: TPCUtils;
    updateLog: any[];
    stats: {};
    statsinterval: number;
    /**
     * @type {number} The max number of stats to keep in this.stats. Limit to
     * 300 values, i.e. 5 minutes; set to 0 to disable
     */
    maxstats: number;
    interop: any;
    simulcast: any;
    sdpConsistency: SdpConsistency;
    /**
     * Munges local SDP provided to the Jingle Session in order to prevent from
     * sending SSRC updates on attach/detach and mute/unmute (for video).
     * @type {LocalSdpMunger}
     */
    localSdpMunger: LocalSdpMunger;
    /**
     * TracablePeerConnection uses RTC's eventEmitter
     * @type {EventEmitter}
     */
    eventEmitter: any;
    rtxModifier: RtxModifier;
    /**
     * The height constraint applied on the video sender.
     */
    senderVideoMaxHeight: any;
    trace: (what: any, info: any) => void;
    onicecandidate: any;
    onsignalingstatechange: any;
    oniceconnectionstatechange: any;
    onnegotiationneeded: any;
    ondatachannel: any;
    private _processStat;
    getConnectionState(): string;
    private _getDesiredMediaDirection;
    isSimulcastOn(): boolean;
    getAudioLevels(): any;
    getLocalTracks(mediaType?: typeof MediaType): Array<any>;
    getLocalVideoTrack(): any | undefined;
    hasAnyTracksOfType(mediaType: typeof MediaType): boolean;
    getRemoteTracks(endpointId?: string, mediaType?: typeof MediaType): Array<JitsiRemoteTrack>;
    getTrackBySSRC(ssrc: number): any | null;
    getSsrcByTrackId(id: string): number | null;
    _remoteStreamAdded(stream: MediaStream): void;
    _remoteTrackAdded(stream: MediaStream, track: MediaStreamTrack, transceiver?: RTCRtpTransceiver): void;
    _createRemoteTrack(ownerEndpointId: string, stream: MediaStream, track: MediaStreamTrack, mediaType: typeof MediaType, videoType?: {
        CAMERA: string;
        DESKTOP: string;
    }, ssrc: number, muted: boolean): void;
    _remoteStreamRemoved(stream: any): void;
    _remoteTrackRemoved(stream: MediaStream, track: MediaStreamTrack): void;
    private _getRemoteTrackById;
    removeRemoteTracks(owner: string): JitsiRemoteTrack[];
    _removeRemoteTrack(toBeRemoved: JitsiRemoteTrack): void;
    _removeRemoteTrackById(streamId: string, trackId: string): JitsiRemoteTrack | undefined;
    getLocalSSRC(localTrack: any): any;
    _injectSsrcGroupForUnifiedSimulcast(desc: any): any;
    _getSSRC(rtcId: any): any;
    _mungeCodecOrder(description: RTCSessionDescription): RTCSessionDescription;
    containsTrack(track: any | JitsiRemoteTrack): boolean;
    addTrack(track: any, isInitiator?: boolean): Promise<void>;
    addTrackUnmute(track: any): Promise<boolean>;
    private _addStream;
    _removeStream(mediaStream: MediaStream): void;
    private _assertTrackBelongs;
    getConfiguredVideoCodec(): {
        H264: string;
        VP8: string;
        VP9: string;
    };
    setVideoCodecs(preferredCodec?: {
        H264: string;
        VP8: string;
        VP9: string;
    }, disabledCodec?: {
        H264: string;
        VP8: string;
        VP9: string;
    }): void;
    codecPreference: {
        enable: boolean;
        mediaType: string;
        mimeType: {
            H264: string;
            VP8: string;
            VP9: string;
        };
    };
    isMediaStreamInPc(mediaStream: MediaStream): boolean;
    removeTrack(localTrack: any): void;
    findSenderByKind(mediaType: any): any | undefined;
    findReceiverForTrack(track: any): RTCRtpReceiver | undefined;
    findSenderForTrack(track: any): RTCRtpSender | undefined;
    replaceTrack(oldTrack: any | null, newTrack: any | null): Promise<boolean>;
    removeTrackMute(localTrack: any): Promise<boolean>;
    createDataChannel(label: any, opts: any): RTCDataChannel;
    private _ensureSimulcastGroupIsLast;
    private _adjustLocalMediaDirection;
    setLocalDescription(description: any): any;
    public setAudioTransferActive(active: boolean): boolean;
    setSenderVideoDegradationPreference(): Promise<void>;
    setMaxBitRate(): Promise<void>;
    setRemoteDescription(description: any): any;
    setSenderVideoConstraint(frameHeight?: number): Promise<any>;
    public setVideoTransferActive(active: boolean): boolean;
    sendTones(tones: string, duration?: number, interToneGap?: number): void;
    private _onToneChange;
    generateRecvonlySsrc(): void;
    clearRecvonlySsrc(): void;
    close(): void;
    createAnswer(constraints: any): any;
    createOffer(constraints: any): any;
    _createOfferOrAnswer(isOffer: any, constraints: any): any;
    _extractPrimarySSRC(ssrcObj: TrackSSRCInfo): number | null;
    private _processLocalSSRCsMap;
    addIceCandidate(candidate: any): Promise<void>;
    getStats(callback: Function, errback: Function): void;
    generateNewStreamSSRCInfo(track: any): {
        /**
         * an array which holds all track's SSRCs
         */
        ssrcs: Array<number>;
        /**
         * an array stores all track's SSRC
         * groups
         */
        groups: {
            /**
             * the SSRC groups semantics
             */
            semantics: string;
            /**
             * group's SSRCs in order where the first
             * one is group's primary SSRC, the second one is secondary (RTX) and so
             * on...
             */
            ssrcs: Array<number>;
        }[];
    };
    toString(): string;
}
export type SSRCGroupInfo = {
    /**
     * group's SSRCs
     */
    ssrcs: Array<number>;
    semantics: string;
};
export type TrackSSRCInfo = {
    /**
     * track's SSRCs
     */
    ssrcs: Array<number>;
    /**
     * track's SSRC groups
     */
    groups: Array<SSRCGroupInfo>;
};
import RTC from "./RTC";
import { TPCUtils } from "./TPCUtils";
import SdpConsistency from "../xmpp/SdpConsistency";
import LocalSdpMunger from "./LocalSdpMunger";
import RtxModifier from "../xmpp/RtxModifier";
import * as MediaType from "../../service/RTC/MediaType";
import JitsiRemoteTrack from "./JitsiRemoteTrack";
