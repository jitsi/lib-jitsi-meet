import Listenable from "../util/Listenable";
import { MediaType } from "../../service/RTC/MediaType";

declare class RTCUtils extends Listenable {
    init: (options: object) => Promise<void>;
    enumerateDevices: () => Promise<MediaDeviceInfo[]>;
    _getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
    _getDesktopMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
    _getMissingTracks: (devices: MediaType[]) => MediaType[];
    _onMediaDevicesListChanged: () => void;
    _updateKnownDevices: () => void;
    _updateGrantedPermissions: () => void;
    obtainAudioAndVideoPermissions: (options: {
        devices?: string[];
        resolution?: string;
        cameraDeviceId?: string;
        micDeviceId?: string;
        desktopSharingFrameRate?: { min: number; max: number };
    }) => Promise<MediaStream[]>;
    maybeCreateAndAddDesktopTrack: (options: object) => Promise<MediaStreamTrack | null>;
    maybeCreateAndAddAVTracks: (options: object) => Promise<MediaStreamTrack[]>;
    isDeviceListAvailable: () => boolean;
    isDeviceChangeAvailable: (deviceType: string) => boolean;
    stopMediaStream: (mediaStream: MediaStream) => void;
    isDesktopSharingEnabled: () => boolean;
    setAudioOutputDevice: (deviceId: string) => Promise<void>;
    setDesktopSharingFrameRate: (maxFps: number) => void;
    getAudioOutputDevice: () => string;
    getCurrentlyAvailableMediaDevices: () => MediaDeviceInfo[];
    getEventDataForActiveDevice: (device: MediaDeviceInfo) => object;
    isUserStreamById: (streamId: string) => boolean;
    wrapAttachMediaStream: (element: HTMLElement, stream: MediaStream) => void;
    emptyFunction: () => void;
    getConstraints: (track: MediaStreamTrack) => MediaStreamConstraints;
    compareAvailableMediaDevices: (devices1: MediaDeviceInfo[], devices2: MediaDeviceInfo[]) => boolean;
    mediaDeviceInfoToJSON: (device: MediaDeviceInfo) => object;
    sendDeviceListToAnalytics: (devices: MediaDeviceInfo[]) => void;
}

declare const rtcUtils: RTCUtils;
export default rtcUtils;
