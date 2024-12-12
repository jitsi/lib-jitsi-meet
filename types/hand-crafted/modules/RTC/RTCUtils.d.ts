import Listenable from '../util/Listenable';
import { MediaType } from '../../service/RTC/MediaType';

declare class RTCUtils extends Listenable {
  init: ( options: unknown ) => void; // TODO:
  getUserMediaWithConstraints: ( um: MediaType[], options: { resolution: string, bandwidth: number, fps: number, desktopStream: string, cameraDeviceId: string, micDeviceId: string, frameRate: { min: unknown, max: unknown }, screenShareAudio: boolean, timeout: number } ) => Promise<unknown>; // TODO:
  obtainAudioAndVideoPermissions: ( options: { devices: unknown[], resolution: string, cameraDeviceId: string, micDeviceId: string, desktopSharingFrameRate: { min: unknown, max: unknown } } ) => Promise<unknown>; // TODO:
  isDeviceListAvailable: () => boolean;
  isDeviceChangeAvailable: ( deviceType: string ) => boolean;
  stopMediaStream: ( mediaStream: MediaStream ) => void;
  isDesktopSharingEnabled: () => boolean;
  setAudioOutputDevice: ( deviceId: string ) => Promise<unknown>; // TODO:
  setDesktopSharingFrameRate: (maxFps: number) => void;
  getAudioOutputDevice: () => string;
  getCurrentlyAvailableMediaDevices: () => unknown[]; // TODO:
  getEventDataForActiveDevice: ( device: MediaDeviceInfo ) => unknown; // TODO:
  isUserStreamById: ( streamId: string ) => boolean;
}

declare const rtcUtils: RTCUtils;
export default rtcUtils;
