import { MediaType } from "../RTC/MediaType";

export enum AnalyticsEvents {
  TYPE_OPERATIONAL = 'operational',
  TYPE_PAGE = 'page',
  TYPE_TRACK = 'track',
  TYPE_UI = 'ui',
  ACTION_JINGLE_RESTART = 'restart',
  ACTION_JINGLE_SA_TIMEOUT = 'session-accept.timeout',
  ACTION_JINGLE_SI_RECEIVED = 'session-initiate.received',
  ACTION_JINGLE_SI_TIMEOUT = 'session-initiate.timeout',
  ACTION_JINGLE_TERMINATE = 'terminate',
  ACTION_JINGLE_TR_RECEIVED = 'transport-replace.received',
  ACTION_JINGLE_TR_SUCCESS = 'transport-replace.success',
  ACTION_P2P_DECLINED = 'decline',
  ACTION_P2P_ESTABLISHED = 'established',
  ACTION_P2P_FAILED = 'failed',
  ACTION_P2P_SWITCH_TO_JVB = 'switch.to.jvb',
  AVAILABLE_DEVICE = 'available.device',
  CONNECTION_DISCONNECTED = 'connection.disconnected',
  FEEDBACK = 'feedback',
  ICE_DURATION = 'ice.duration',
  ICE_ESTABLISHMENT_DURATION_DIFF = 'ice.establishment.duration.diff',
  ICE_STATE_CHANGED = 'ice.state.changed',
  NO_BYTES_SENT = 'track.no-bytes-sent',
  TRACK_UNMUTED = 'track.unmuted',
}

export const createRemotelyMutedEvent: ( mediaType: MediaType ) => { type: AnalyticsEvents.TYPE_OPERATIONAL, action: string, mediaType: MediaType };
