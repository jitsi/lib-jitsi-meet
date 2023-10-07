import JitsiConference from './JitsiConference';
import JitsiTrack from './modules/RTC/JitsiTrack';
import { MediaType } from './service/RTC/MediaType';

export default class JitsiParticipant {
  constructor( jid: unknown, conference: unknown, displayName: unknown, hidden: boolean, statsID: string, status: string, identity: unknown, isReplacing?: boolean, isReplaced?: boolean ); // TODO:
  getBotType: () => string | undefined;
  getConference: () => JitsiConference;
  getConnectionStatus: () => string;
  getDisplayName: () => string;
  getFeatures: () => Promise<Set<string> | Error>;
  getId: () => string;
  getIdentity: () => undefined | JwtIdentity;
  getJid: () => string;
  getProperty: ( name: string ) => string;
  getRole: () => string;
  getStatsID: () => string;
  getStatus: () => string;
  getTracks: () => JitsiTrack[];
  getTracksByMediaType: ( mediaType: MediaType ) => JitsiTrack[];
  hasFeature: ( feature: string ) => boolean;
  isAudioMuted: () => boolean;
  isHidden: () => boolean;
  isModerator: () => boolean;
  isReplaced: () => boolean;
  isReplacing: () => boolean;
  isVideoMuted: () => boolean;
  setBotType: ( newBotType: string ) => void;
  setFeatures: ( newFeatures: Set<string> | undefined ) => void;
  setIsReplaced: (newIsReplaced: boolean) => void;
  setIsReplacing: (newIsReplacing: string) => void;
  setProperty: ( name: string, value: string ) => void;
  setRole: ( role: string ) => void;
  supportsDTMF: () => boolean;
}

/**
 * Application-defined values carried in the JWT claims section.
 *
 * @see https://github.com/jitsi/lib-jitsi-meet/blob/master/doc/tokens.md#token-identifiers-structure-optional
 */
interface JwtIdentity {
  group: string;
  user: {
    id: string;
    email: string;
    name: string;
    avatar: string;
  };
  callee?: {
    id: string;
    name: string;
    avatar: string;
  };
}
