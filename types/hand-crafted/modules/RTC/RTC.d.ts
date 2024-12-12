import Listenable from '../util/Listenable';
import JitsiLocalTrack from './JitsiLocalTrack';
import JitsiRemoteTrack from './JitsiRemoteTrack';
import TraceablePeerConnection from './TraceablePeerConnection';
import { MediaType } from '../../service/RTC/MediaType';
import SignalingLayer from '../../service/RTC/SignalingLayer';

export default class RTC extends Listenable {
  destroy: () => void;
  static createLocalTracks: ( tracksInfo: unknown[] ) => JitsiLocalTrack[]; // TODO:
  static obtainAudioAndVideoPermissions: ( options: { devices: unknown[], resolution: string, cameraDeviceId: string, micDeviceId: string } ) => Promise<unknown>; // TODO:
  initializeBridgeChannel: ( perrconnection: RTCPeerConnection, wsUrl: string ) => void;
  onCallEnded: () => void;
  setDesktopSharingFrameRate: (maxFps: number) => void;
  static addListener: ( eventType: string, listener: unknown ) => void; // TODO: this should be typed to an enum of eventTypes with appropriate definition for the listeners
  static removeListener: ( eventType: string, listener: unknown ) => void; // TODO: this should be typed to an enum of eventTypes with appropriate definition for the listeners
  static init: ( options: unknown ) => unknown; // TODO:
  createPeerConnection: ( signalling: SignalingLayer, iceConfig: unknown, isP2P: boolean, options: { enableInsertableStreams: boolean, disableSimulcast: boolean, disableRtx: boolean, startSilent: boolean } ) => TraceablePeerConnection; // TODO:
  addLocalTrack: ( track: unknown ) => void; // TODO:
  getLocalVideoTrack: () => JitsiLocalTrack | undefined;
  getLocalAudioTrack: () => JitsiLocalTrack | undefined;
  getLocalEndpointId: () => string;
  getLocalTracks: ( mediaType: MediaType ) => JitsiLocalTrack[];
  getRemoteTracks: ( mediaType: MediaType ) => JitsiRemoteTrack[];
  setAudioMute: ( value: unknown ) => Promise<unknown>; // TODO:
  removeLocalTrack: ( track: unknown ) => void; // TODO:
  static attachMediaStream: ( elSelector: unknown, stream: unknown ) => unknown; // TODO:
  static isDeviceListAvailable: () => unknown; // TODO:
  static isDeviceChangeAvailable: ( deviceType: string ) => boolean; // TODO: check if deviceType should be an enum
  static isWebRtcSupported: () => boolean;
  static getAudioOutputDevice: () => string;
  static getCurrentlyAvailableMediaDevices: () => unknown[]; // TODO:
  static getEventDataForActiveDevice: () => MediaDeviceInfo;
  static setAudioOutputDevice: ( deviceId: string ) => Promise<unknown>; // TODO:
  static enumerateDevices: ( callback: () => unknown ) => void; // TODO:
  static stopMediaStream: ( mediaStream: MediaStream ) => void;
  static isDesktopSharingEnabled: () => boolean;
  closeBridgeChannel: () => void;
  setAudioLevel: ( tpc: TraceablePeerConnection, ssrc: number, audioLevel: number, isLocal: boolean ) => void;
  sendChannelMessage: ( to: string, payload: unknown ) => void; // TODO:
  setLastN: ( value: number ) => void;
  isInForwardedSources: ( sourceName: string ) => boolean;
  setReceiverVideoConstraints: ( constraints: unknown ) => void; // TODO:
  setVideoMute: ( value: unknown ) => Promise<unknown>; // TODO:
  sendEndpointStatsMessage: ( payload: unknown ) => void; // TODO:
}
