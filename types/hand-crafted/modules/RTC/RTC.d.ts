import Listenable from "../util/Listenable";
import JitsiLocalTrack from "./JitsiLocalTrack";
import JitsiRemoteTrack from "./JitsiRemoteTrack";
import TraceablePeerConnection from "./TraceablePeerConnection";
import { MediaType } from "../../service/RTC/MediaType";
import SignalingLayer from "../../service/RTC/SignalingLayer";
import { CodecMimeType } from "../../service/RTC/CodecMimeType";

export default class RTC extends Listenable {
    destroy: () => void;
    static createLocalTracks: (tracksInfo: Array<object>) => Array<JitsiLocalTrack>;
    static obtainAudioAndVideoPermissions: (options: {
        devices?: Array<string>;
        resolution?: string;
        cameraDeviceId?: string;
        micDeviceId?: string;
    }) => Promise<Array<JitsiLocalTrack>>;
    initializeBridgeChannel: (peerconnection?: RTCPeerConnection, wsUrl?: string) => void;
    onCallEnded: () => void;
    setDesktopSharingFrameRate: (maxFps: number) => void;
    setReceiverVideoConstraints: (constraints: object) => void;
    sendSourceVideoType: (sourceName: string, videoType: string) => void;
    static addListener: (eventType: string, listener: Function) => void;
    static removeListener: (eventType: string, listener: Function) => void;
    static init: (options: object) => unknown;
    createPeerConnection: (
        signaling: SignalingLayer,
        pcConfig: RTCConfiguration,
        isP2P: boolean,
        options: {
            enableInsertableStreams?: boolean;
            disableSimulcast?: boolean;
            disableRtx?: boolean;
            startSilent?: boolean;
            forceTurnRelay?: boolean;
            audioQuality?: object;
            videoQuality?: object;
            codecSettings?: Array<CodecMimeType>;
            capScreenshareBitrate?: boolean;
        }
    ) => TraceablePeerConnection;
    addLocalTrack: (track: JitsiLocalTrack) => void;
    getForwardedSources: () => Array<string> | null;
    getLocalVideoTrack: () => JitsiLocalTrack | undefined;
    getLocalVideoTracks: () => Array<JitsiLocalTrack>;
    getLocalAudioTrack: () => JitsiLocalTrack | undefined;
    getLocalEndpointId: () => string;
    getLocalTracks: (mediaType?: MediaType) => Array<JitsiLocalTrack>;
    getRemoteTracks: (mediaType?: MediaType) => Array<JitsiRemoteTrack>;
    setAudioMute: (value: boolean) => Promise<void>;
    setVideoMute: (value: boolean) => Promise<void>;
    removeLocalTrack: (track: JitsiLocalTrack) => void;
    static attachMediaStream: (elSelector: HTMLElement, stream: MediaStream) => void;
    static isDeviceListAvailable: () => boolean;
    static isDeviceChangeAvailable: (deviceType?: string) => boolean;
    static isWebRtcSupported: () => boolean;
    static getAudioOutputDevice: () => string;
    static getCurrentlyAvailableMediaDevices: () => Array<MediaDeviceInfo>;
    static getEventDataForActiveDevice: (device: MediaDeviceInfo) => MediaDeviceInfo;
    static setAudioOutputDevice: (deviceId: string) => Promise<void>;
    static enumerateDevices: (callback: (devices: Array<MediaDeviceInfo>) => void) => void;
    static stopMediaStream: (mediaStream: MediaStream) => void;
    static isDesktopSharingEnabled: () => boolean;
    closeBridgeChannel: () => void;
    setAudioLevel: (tpc: TraceablePeerConnection, ssrc: number, audioLevel: number, isLocal: boolean) => void;
    sendChannelMessage: (to: string, payload: object) => void;
    setLastN: (value: number) => void;
    isInForwardedSources: (sourceName: string) => boolean;
    sendEndpointStatsMessage: (payload: object) => void;
    _updateAudioOutputForAudioTracks: (deviceId: string) => void;
}
