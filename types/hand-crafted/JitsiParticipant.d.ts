import JitsiConference from './JitsiConference';
import JitsiTrack from './modules/RTC/JitsiTrack';
import { MediaType } from './service/RTC/MediaType';

export default class JitsiParticipant {
  constructor( jid: unknown, conference: unknown, displayName: unknown, hidden: boolean, statsID: string, status: string, identity: unknown, isReplacing?: boolean, isReplaced?: boolean ); // TODO:
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
  isReplacing: () => boolean;
  isReplaced: () => boolean;
  isAudioMuted: () => boolean;
  isVideoMuted: () => boolean;
  getRole: () => string;
  setRole: ( role: string ) => void;
  setIsReplacing: (newIsReplacing: string) => void;
  setIsReplaced: (newIsReplaced: boolean) => void;
  supportsDTMF: () => boolean;
  hasFeature: ( feature: string ) => boolean;
  getFeatures: () => Promise<Set<string> | Error>;
  setFeatures: ( newFeatures: Set<string> | undefined ) => void;
  getBotType: () => string | undefined;
  setBotType: ( newBotType: string ) => void;
}
