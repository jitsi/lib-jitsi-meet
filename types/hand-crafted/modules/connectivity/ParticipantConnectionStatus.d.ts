import JitsiConference from '../../JitsiConference';
import RTC from '../RTC/RTC';
import JitsiRemoteTrack from '../RTC/JitsiRemoteTrack';
import JitsiParticipant from '../../JitsiParticipant';
import { VideoType } from '../../service/RTC/VideoType';

export enum ParticipantConnectionStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  INTERRUPTED = 'interrupted',
  RESTORING = 'restoring'
}

export default class ParticipantConnectionStatusHandler {
  constructor( rtc: RTC, conference: JitsiConference, options: { rtcMuteTimeout: number, outOfLastNTimeout: number } );
  init: () => void;
  dispose: () => void;
  onEndpointConnStatusChanged: ( endpointId: string, isActive: boolean ) => void;
  clearTimeout: ( participantId: string ) => void;
  clearRtcMutedTimestamp: ( participantId: string ) => void;
  onRemoteTrackAdded: ( remoteTrack: JitsiRemoteTrack ) => void;
  onRemoteTrackRemoved: ( remoteTrack: JitsiRemoteTrack ) => void;
  isVideoTrackFrozen: ( participant: JitsiParticipant ) => boolean;
  refreshConnectionStatusForAll: () => void;
  figureOutConnectionStatus: ( id: string ) => void;
  maybeSendParticipantConnectionStatusEvent: ( id: string, nowMs: number ) => void;
  onUserLeft: ( id: string ) => void;
  onTrackRtcMuted: ( track: JitsiRemoteTrack ) => void;
  onTrackRtcUnmuted: ( track: JitsiRemoteTrack ) => void;
  onSignallingMuteChanged: ( track: JitsiRemoteTrack ) => void;
  onTrackVideoTypeChanged: ( track: JitsiRemoteTrack, type: VideoType ) => void;
}