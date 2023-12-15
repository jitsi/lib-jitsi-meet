import { MediaType } from './service/RTC/MediaType';

declare class JitsiMediaDevices {
  enumerateDevices: ( callback: ( devices: MediaDeviceInfo[] ) => void ) => void;
  isDeviceListAvailable: () => Promise<boolean>;
  isDeviceChangeAvailable: ( deviceType: string ) => boolean;
  isDevicePermissionGranted: ( type: MediaType ) => Promise<boolean>;
  isMultipleAudioInputSupported: () => boolean;
  getAudioOutputDevice: () => string;
  setAudioOutputDevice: ( deviceId: string ) => Promise<unknown>; // TODO:
}

declare var _default: JitsiMediaDevices;
export default _default;
