import JitsiTrack from './JitsiTrack';
import { CameraFacingMode } from '../../service/RTC/CameraFacingMode';

export default class JitsiLocalTrack extends JitsiTrack {
  constructor( trackInfo: { rtcId: number, stream: unknown, track: unknown, mediaType: unknown, videoType: unknown, effects: unknown, resolution: unknown, deviceId: string, facingMode: CameraFacingMode, sourceId: unknown } ) // TODO:
  isEnded: () => boolean;
  setEffect: ( effect: unknown ) => Promise<unknown>; // TODO:
  mute: () => Promise<void>;
  unmute: () => Promise<void>;
  dispose: () => Promise<void>;
  isMuted: () => boolean;
  isLocal: () => true;
  getDeviceId: () => string;
  getParticipantId: () => string;
  getCameraFacingMode: () => CameraFacingMode | undefined;
  stopStream: () => void;
  isReceivingData: () => boolean;
  toString: () => string;
}
