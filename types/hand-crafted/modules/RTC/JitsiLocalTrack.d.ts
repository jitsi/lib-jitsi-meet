import JitsiTrack from './JitsiTrack';
import { CameraFacingMode } from '../../service/RTC/CameraFacingMode';

export default class JitsiLocalTrack extends JitsiTrack {
  constructor(trackInfo: { 
    rtcId: number;
    stream: MediaStream; 
    track: MediaStreamTrack; 
    mediaType: string; 
    videoType: string; 
    effects: Array<object>; 
    resolution?: any;  // No information provided about 'resolution', so kept it as any.
    deviceId: string; 
    facingMode: CameraFacingMode; 
    sourceId?: string; 
    sourceType?: string;
    constraints: Object;
})
_addStreamToConferenceAsUnmute: () => Promise<void>;
_fireNoDataFromSourceEvent: () => void;
_initNoDataFromSourceHandlers: () => void;
_isNoDataFromSourceEventsEnabled: () => boolean;
_queueSetMuted: (muted: boolean) => Promise<void>;
_removeStreamFromConferenceAsMute: (successCallback: () => void, errorCallback: (error: Error) => void) => void;
_sendMuteStatus: (mute: boolean) => void;
_setMuted: (muted: boolean) => Promise<void>;
_setRealDeviceIdFromDeviceList: (devices: MediaDeviceInfo[]) => void;
_setStream: (stream: MediaStream | null) => void;
_startStreamEffect: (effect: object) => void;
_stopStreamEffect: () => void;
_switchCamera: () => void;
_switchStreamEffect: (effect?: object) => void;
dispose: () => Promise<void>;
getCameraFacingMode: () => CameraFacingMode | undefined;
getCaptureResolution: () => number;
getDeviceId: () => string;
getDuration: () => number;
getParticipantId: () => string;
getSourceName: () => string | null;
getSsrc: () => number | null;
isEnded: () => boolean;
isLocal: () => true;
isMuted: () => boolean;
isReceivingData: () => boolean;
mute: () => Promise<void>;
onByteSentStatsReceived: (tpc: any, bytesSent: number) => void; // `tpc` type is not specified
setConference: (conference: any) => void; // `conference` type is not specified
setEffect: (effect?: object) => Promise<void>;
setSourceName: (name: string) => void;
setSsrc: (ssrc: number) => void;
stopStream: () => void;
toString: () => string;
unmute: () => Promise<void>;
}
