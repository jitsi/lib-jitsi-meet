import JitsiLocalTrack from "./JitsiLocalTrack";
import { CodecMimeType } from "../../service/RTC/CodecMimeType";
import { VideoEncoderScalabilityMode } from "../../service/RTC/VideoEncoderScalabilityMode";
import { MediaType } from "../../service/RTC/MediaType";
import transform from "sdp-transform";

export default class TPCUtils {
    constructor(peerconnection: RTCPeerConnection, videoBitrates: object);

    _calculateActiveEncodingParams: (
        localVideoTrack: JitsiLocalTrack,
        codec: CodecMimeType,
        newHeight: number
    ) => {
        active: boolean;
        maxBitrate: number;
        scalabilityMode: VideoEncoderScalabilityMode;
        scaleResolutionDownBy: number;
    };

    _getConfiguredVideoCodecsImpl: (
        parsedSdp: transform.SessionDescription
    ) => Array<CodecMimeType>;

    _getVideoStreamEncodings: (
        localTrack: JitsiLocalTrack,
        codec: CodecMimeType
    ) => Array<object>;

    _isRunningInFullSvcMode: (codec: CodecMimeType) => boolean;

    _isScreenshareBitrateCapped: (localVideoTrack: JitsiLocalTrack) => boolean;

    calculateEncodingsActiveState: (
        localVideoTrack: JitsiLocalTrack,
        codec: CodecMimeType,
        newHeight: number
    ) => Array<boolean>;

    calculateEncodingsBitrates: (
        localVideoTrack: JitsiLocalTrack,
        codec: CodecMimeType,
        newHeight: number
    ) => Array<number>;

    calculateEncodingsScalabilityMode: (
        localVideoTrack: JitsiLocalTrack,
        codec: CodecMimeType,
        maxHeight: number
    ) => Array<VideoEncoderScalabilityMode> | undefined;

    calculateEncodingsScaleFactor: (
        localVideoTrack: JitsiLocalTrack,
        codec: CodecMimeType,
        maxHeight: number
    ) => Array<number>;

    ensureCorrectOrderOfSsrcs: (
        description: RTCSessionDescription
    ) => RTCSessionDescription;

    getConfiguredVideoCodec: () => CodecMimeType;

    getConfiguredVideoCodecs: () => Array<CodecMimeType>;

    getDesiredMediaDirection: () => string;

    getStreamEncodings: () => Array<object>;

    injectSsrcGroupForSimulcast: (sdp: string) => string;

    insertUnifiedPlanSimulcastReceive: (desc: {
        type: string;
        sdp: string;
    }) => RTCSessionDescription;

    isRunningInSimulcastMode: (codec: CodecMimeType) => boolean;

    mungeCodecOrder: (sdp: string) => string;

    mungeOpus: (sdp: string) => string;

    setMaxBitrates: (encodings: Array<object>, maxBitrates: object) => void;

    updateAv1DdHeaders: (sdp: string) => string;

    addTrack: (localTrack: JitsiLocalTrack, isInitiator: boolean) => void;
    addTrackUnmute: (localTrack: JitsiLocalTrack) => Promise<void>;
    getLocalStreamHeightConstraints: (localTrack: JitsiLocalTrack) => number[];
    removeTrackMute: (localTrack: JitsiLocalTrack) => Promise<void>;
    replaceTrack: (
        oldTrack: JitsiLocalTrack,
        newTrack: JitsiLocalTrack
    ) => Promise<void>;
    setMediaTransferActive: (active: boolean) => void;
    setVideoTransferActive: (active: boolean) => void;
    updateEncodingsResolution: (parameters: RTCRtpEncodingParameters) => void;
}
