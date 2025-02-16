import RTC from "./RTC";
import JitsiTrack from "./JitsiTrack";
import JitsiRemoteTrack from "./JitsiRemoteTrack";
import JitsiLocalTrack from "./JitsiLocalTrack";
import LocalSdpMunger from "../sdp/LocalSdpMunger";
import RtxModifier from "../sdp/RtxModifier";
import SignalingLayer from "../../service/RTC/SignalingLayer";
import { MediaType } from "../../service/RTC/MediaType";
import { CodecMimeType } from "../../service/RTC/CodecMimeType";
import TPCUtils from "./TPCUtils";

export default class TraceablePeerConnection {
    constructor(
        rtc: RTC,
        id: number,
        signalingLayer: SignalingLayer,
        iceConfig: RTCConfiguration,
        constraints: MediaStreamConstraints,
        isP2P: boolean,
        options: {
            disableSimulcast: boolean;
            disableRtx: boolean;
            disabledCodec: string;
            preferredCodec: string;
            startSilent: boolean;
        }
    );

    
    audioTransferActive: boolean;
    videoTransferActive: boolean;
    id: number;
    isP2P: boolean;
    remoteTracks: Map<number, Map<MediaType, JitsiRemoteTrack>>;
    localTracks: Map<number, JitsiLocalTrack>;
    localSSRCs: Map<
        number,
        { ssrcs: number[]; groups: { semantics: string; ssrcs: number[] }[] }
    >;
    localUfrag: string | null;
    signalingLayer: SignalingLayer;
    options: object;
    peerconnection: RTCPeerConnection;
    videoBitrates: object;
    tpcUtils: TPCUtils;
    updateLog: Array<object>;
    stats: object;
    statsinterval: number;
    maxstats: object;
    interop: object;
    simulcast: object;
    localSdpMunger: LocalSdpMunger;
    eventEmitter: object;
    rtxModifier: RtxModifier;
    senderVideoMaxHeight: number;
    trace: (what: string, info: object) => void;
    onicecandidate: (event: RTCPeerConnectionIceEvent) => void;
    onTrack: (event: RTCTrackEvent) => void;
    onsignalingstatechange: (event: Event) => void;
    oniceconnectionstatechange: (event: Event) => void;
    onnegotiationneeded: (event: Event) => void;
    onconnectionstatechange: (event: Event) => void;
    ondatachannel: (event: RTCDataChannelEvent) => void;
    _processStat: (report: RTCStatsReport) => void;
    dumpSDP: (description: RTCSessionDescription) => void;
    getConnectionState: () => string;
    getDesiredMediaDirection: (mediaType: MediaType) => string;
    _getReceiversByEndpointIds: (endpointIds: string[]) => RTCRtpReceiver[];
    isSpatialScalabilityOn: () => boolean;
    _peerVideoTypeChanged: (endpointId: string, videoType: string) => void;
    _peerMutedChanged: (endpointId: string, muted: boolean) => void;
    _sourceMutedChanged: (sourceName: string, muted: boolean) => void;
    _sourceVideoTypeChanged: (sourceName: string, videoType: string) => void;
    getAudioLevels: (speakerList?: string[]) => Map<string, number>;
    doesTrueSimulcast: () => boolean;
    getLocalVideoSSRCs: () => number[];
    getLocalTracks: (mediaType?: MediaType) => JitsiLocalTrack[];
    getLocalVideoTracks: () => JitsiLocalTrack[];
    getRemoteTracks: (mediaType?: MediaType) => JitsiRemoteTrack[];
    getRemoteSourceInfoBySourceName: (sourceName: string) => object;
    getRemoteSourceInfoByParticipant: (id: string) => Map<string, object>;
    getTargetVideoBitrates: () => object;
    getTrackBySSRC: (ssrc: number) => JitsiTrack | null;
    getSsrcByTrackId: (id: string) => number | null;
    findTrackById: (id: string) => JitsiTrack | null;
    _remoteTrackAdded: (track: JitsiRemoteTrack) => void;
    _createRemoteTrack: (trackInfo: object) => JitsiRemoteTrack;
    _remoteTrackRemoved: (track: JitsiRemoteTrack) => void;
    _removeRemoteTrack: (track: JitsiRemoteTrack) => void;
    _processAndExtractSourceInfo: (sourceInfo: object) => void;
    getLocalSSRC: (localTrack: JitsiLocalTrack) => string;
    signalingState: RTCSignalingState;
    iceConnectionState: RTCIceConnectionState;
    connectionState: RTCPeerConnectionState;
    localDescription: RTCSessionDescription | null;
    remoteDescription: RTCSessionDescription | null;
    _getSSRC: (track: JitsiTrack) => number;
    isSharingLowFpsScreen: () => boolean;
    _isSharingScreen: () => boolean;
    addTrack: (track: JitsiLocalTrack, isInitiator?: boolean) => Promise<void>;
    addTrackToPc: (track: JitsiLocalTrack) => void;
    _assertTrackBelongs: (track: JitsiTrack) => void;
    getConfiguredVideoCodecs: () => CodecMimeType[];
    setDesktopSharingFrameRate: (maxFps: number) => void;
    setVideoCodecs: (
        preferredCodec?: CodecMimeType,
        disabledCodec?: CodecMimeType
    ) => void;
    removeTrack: (localTrack: JitsiLocalTrack) => void;
    findReceiverForTrack: (
        track: MediaStreamTrack
    ) => RTCRtpReceiver | undefined;
    findSenderForTrack: (track: MediaStreamTrack) => RTCRtpSender | undefined;
    processLocalSdpForTransceiverInfo: (localTracks: JitsiLocalTrack[]) => void;
    replaceTrack: (
        oldTrack: JitsiLocalTrack | null,
        newTrack: JitsiLocalTrack | null
    ) => Promise<boolean>;
    removeTrackFromPc: (track: JitsiLocalTrack) => void;
    updateRemoteSources: () => void;
    usesCodecSelectionAPI: () => boolean;
    createDataChannel: (
        label: string,
        opts: RTCDataChannelInit
    ) => RTCDataChannel;
    _adjustRemoteMediaDirection: (
        mediaType: MediaType,
        direction: string
    ) => void;
    _getPreferredCodecForScreenshare: () => CodecMimeType;
    _initializeDtlsTransport: () => void;
    onerror: (error: Error) => void;
    onstatechange: (state: string) => void;
    calculateExpectedSendResolution: (localTrack: JitsiLocalTrack) => number;
    configureAudioSenderEncodings: (
        encodings: RTCRtpEncodingParameters[]
    ) => void;
    _configureSenderEncodings: (encodings: RTCRtpEncodingParameters[]) => void;
    _enableSenderEncodings: (encodings: RTCRtpEncodingParameters[]) => void;
    configureVideoSenderEncodings: (
        encodings: RTCRtpEncodingParameters[]
    ) => void;
    _setEncodings: (encodings: RTCRtpEncodingParameters[]) => void;
    _mungeDescription: (
        description: RTCSessionDescriptionInit
    ) => RTCSessionDescriptionInit;
    setLocalDescription: (
        description: RTCSessionDescriptionInit
    ) => Promise<void>;
    setRemoteDescription: (
        description: RTCSessionDescriptionInit
    ) => Promise<void>;
    setSenderVideoConstraints: (constraints: object) => Promise<void>;
    _updateVideoSenderParameters: () => void;
    _updateVideoSenderEncodings: () => void;
    setMediaTransferActive: (mediaType: MediaType, active: boolean) => boolean;
    setVideoTransferActive: (active: boolean) => boolean;
    sendTones: (tones: string, duration: number, interToneGap: number) => void;
    _onToneChange: (event: RTCDTMFToneChangeEvent) => void;
    close: () => void;
    createAnswer: (
        constraints: RTCOfferOptions
    ) => Promise<RTCSessionDescriptionInit>;
    createOffer: (
        constraints: RTCOfferOptions
    ) => Promise<RTCSessionDescriptionInit>;
    _createOfferOrAnswer: (
        isOffer: boolean,
        constraints: RTCOfferOptions
    ) => Promise<RTCSessionDescriptionInit>;
    handleSuccess: (description: RTCSessionDescriptionInit) => void;
    handleFailure: (error: Error) => void;
    _extractPrimarySSRC: (description: RTCSessionDescriptionInit) => number;
    addRemoteSsrc: (ssrc: number, cname: string) => void;
    addIceCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
    getStats: () => Promise<RTCStatsReport>;
    toString: () => string;
}
