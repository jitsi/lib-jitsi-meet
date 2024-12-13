import Logger from '@jitsi/logger';
import JitsiConnection from './JitsiConnection';
import JitsiMediaDevices from './JitsiMediaDevices';
import { JitsiConferenceErrors } from './JitsiConferenceErrors';
import { JitsiConnectionErrors } from './JitsiConnectionErrors';
import { JitsiTrackErrors } from './JitsiTrackErrors';
import { JitsiLogLevels } from './JitsiLogLevels';
import { JitsiMediaDevicesEvents } from './JitsiMediaDevicesEvents';
import { JitsiTrackEvents } from './JitsiTrackEvents';
import { JitsiConnectionEvents } from './JitsiConnectionEvents';
import { JitsiConferenceEvents } from './JitsiConferenceEvents';
import { JitsiTranscriptionStatus } from './JitsiTranscriptionStatus';
import BrowserCapabilities from './modules/browser/BrowserCapabilities';
import { DetectionEvents } from './modules/detection/DetectionEvents';
import TrackVADEmitter, { VADProcessor } from './modules/detection/TrackVADEmitter';
import RecordingConstants from './modules/recording/recordingConstants';
import JitsiLocalTrack from './modules/RTC/JitsiLocalTrack';
import PrecallTest from './modules/statistics/PrecallTest';
import ScriptUtil from './modules/util/ScriptUtil';
import { VideoSIPGWConstants } from './modules/videosipgw/VideoSIPGWConstants';
import AudioMixer from './modules/webaudio/AudioMixer';
import { ConnectionQualityEvents } from './service/connectivity/ConnectionQualityEvents';
import { E2ePingEvents } from './service/e2eping/E2ePingEvents';

export type CreateLocalTracksOptions = {
  effects?: Array<unknown>; // TODO: work out what unknown is
  devices?: Array<string>;
  resolution?: string;
  cameraDeviceId?: string;
  micDeviceId?: string;
  interval?: number;
  checkAgain?: () => boolean;
  listener?: () => void;
  frameRate?: {
    min?: string,
    max?: string,
  },
  desktopSharingFrameRate?: {
    min?: string,
    max?: string,
  },
  constraints?: any // TODO: figure out this type
}

export type InitOptions = {
  disableAudioLevels?: boolean,
  useIPv6?: unknown,
  disableSimulcast?: unknown,
  enableWindowOnErrorHandler?: unknown,
  disableThirdPartyRequests?: unknown,
  enableAnalyticsLogging?: unknown,
  externalStorage?: unknown,
  callStatsCustomScriptUrl?: unknown,
  disableRtx?: unknown,
  disabledCodec?: unknown,
  preferredCodec?: unknown,
  useTurnUdp?: unknown
}

export type JitsiMeetJSType = {
  version: string;

  JitsiConnection: typeof JitsiConnection;

  ProxyConnectionService: unknown; // TODO:

  //USER_MEDIA_SLOW_PROMISE_TIMEOUT: 1000;

  constants: {
    recording: typeof RecordingConstants,
    sipVideoGW: typeof VideoSIPGWConstants,
    transcriptionStatus: typeof JitsiTranscriptionStatus,
  };

  events: {
    conference: typeof JitsiConferenceEvents,
    connection: typeof JitsiConnectionEvents,
    detection: typeof DetectionEvents,
    track: typeof JitsiTrackEvents,
    mediaDevices: typeof JitsiMediaDevicesEvents,
    connectionQuality: typeof ConnectionQualityEvents,
    e2eping: typeof E2ePingEvents
  };

  errors: {
    conference: typeof JitsiConferenceErrors,
    connection: typeof JitsiConnectionErrors,
    track: typeof JitsiTrackErrors
  };

  errorTypes: {
    JitsiTrackError: unknown // TODO:
  };

  logLevels: typeof JitsiLogLevels; // TODO: code refers to Logger.levels and that is in @jitsi/logger

  mediaDevices: typeof JitsiMediaDevices;

  analytics: unknown; // TODO: code referes to Statistics.analytics which comes from modules/statstics/AnalyticsAdapter.js

  init: ( options: InitOptions ) => unknown; // TODO:

  isDesktopSharingEnabled: () => boolean;

  isWebRtcSupported: () => boolean;

  setLogLevel: ( level: Logger.levels ) => void;

  setLogLevelById: ( level: Logger.levels, id: unknown ) => void; // TODO:

  addGlobalLogTransport: ( globalTransport: unknown ) => void; // TODO:

  removeGlobalLogTransport: ( globalTransport: unknown ) => void; // TODO:

  setGlobalLogOptions: ( options: unknown ) => void; // TODO:

  createLocalTracks: ( options: CreateLocalTracksOptions, originalOptions?: CreateLocalTracksOptions ) => Promise<Array<JitsiLocalTrack> | JitsiConferenceErrors>; // TODO:

  createTrackVADEmitter: ( localAudioDeviceId: string, sampleRate: 256 | 512 | 1024 | 4096 | 8192 | 16384, vadProcessor: VADProcessor ) => Promise<TrackVADEmitter>;

  createAudioMixer: () => AudioMixer;

  getActiveAudioDevice: () => Promise<Object>; // TODO: can we improve on object?

  createLocalTracksFromMediaStreams: ( tracksInfo: unknown[] ) => JitsiLocalTrack[]; // TODO:

  // isDeviceListAvailable: () => boolean; // obsosete

  // isDeviceChangeAvailable: ( deviceType: string ) => boolean; // obsosete

  isMultipleAudioInputSupported: () => boolean;

  isCollectingLocalStats: () => boolean;

  enumerateDevices: ( callback: ( availableDevices: MediaDeviceInfo[] ) => void ) => void;

  setNetworkInfo: ( { isOnline: boolean } ) => void;

  precallTest: PrecallTest;

  util: {
    ScriptUtil: { loadScript: typeof ScriptUtil.loadScript },
    browser: BrowserCapabilities
  }
}

declare var _default: JitsiMeetJSType;
export default _default;
