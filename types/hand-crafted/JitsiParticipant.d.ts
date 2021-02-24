import JitsiConference from './JitsiConference';
import JitsiTrack from './modules/RTC/JitsiTrack';
import { MediaType } from './service/RTC/MediaType';

export default class JitsiParticipant {
  constructor( jid: unknown, conference: unknown, displayName: unknown, hidden: boolean, statsID: string, status: string, identity: unknown ); // TODO:
  getConference: () => JitsiConference;
  getProperty: ( name: string ) => string;
  hasAnyVideoTrackWebRTCMuted: () => boolean;
  getConnectionStatus: () => string;
  setProperty: ( name: string, value: string ) => void;
  getTracks: () => JitsiTrack[];
  getTracksByMediaType: ( mediaType: MediaType ) => JitsiTrack[];
  getId: () => string;
  getJid: () => string;
  getDisplayName: () => string;
  getStatsID: () => string;
  getStatus: () => string;
  isModerator: () => boolean;
  isHidden: () => boolean;
  isAudioMuted: () => boolean;
  isVideoMuted: () => boolean;
  getRole: () => string;
  supportsDTMF: () => boolean;
  getFeatures: () => Promise<Set<String> | Error>;
  queryFeatures: ( timeout: number ) => Promise<Set<String> | Error>;
  getBotType: () => string | undefined;
}
