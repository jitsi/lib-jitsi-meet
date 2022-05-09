import { MediaType } from './service/RTC/MediaType';

declare class JitsiMediaDevices {
  enumerateDevices: ( callback: ( devices: MediaDeviceInfo[] ) => void ) => void;
  isDeviceListAvailable: () => Promise<boolean>;
  isDeviceChangeAvailable: ( deviceType: string ) => boolean;
  isDevicePermissionGranted: ( type: MediaType ) => Promise<boolean>;
  isMultipleAudioInputSupported: () => boolean;
  getAudioOutputDevice: () => string;
  setAudioOutputDevice: ( deviceId: string ) => Promise<unknown>; // TODO:
  addEventListener: ( event: string, handler: unknown ) => void; // TODO: identify the enum for the event types and the strongly typed handlers
  removeEventListener: ( event: string, handler: unknown ) => void; // TODO: identify the enum for the event types and the strongly typed handlers
  emitEvent: ( event: string, ...args: unknown[] ) => void; // TODO: identify the enum for the event types
}

declare var _default: JitsiMediaDevices;
export default _default;