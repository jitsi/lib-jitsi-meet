import XmppConnection from './XmppConnection';
import Lobby from './Lobby';
import Listenable from '../util/Listenable';
import { MediaType } from '../../service/RTC/MediaType';
import AVModeration from "./AVModeration";

declare namespace parser {
  function packet2JSON( xmlElement: unknown, nodes: unknown[] ): void; // TODO:
  function json2packet( nodes: unknown[], packet: unknown ): void; // TODO:
}

export default class ChatRoom extends Listenable {
  constructor( connection: XmppConnection, jid: string, password: string, XMPP: unknown, options?: { disableFocus?: boolean, disableDiscoInfo?: boolean, enableLobby?: boolean } );
  initPresenceMap: ( options?: { statsId: string, deploymentInfo?: { userRegion: string } } ) => void; // TODO: check the options
  join: ( password: string, replaceParticipant?: boolean ) => Promise<unknown>; // TODO:
  sendPresence: ( fromJoin: boolean ) => void;
  doLeave: ( reason?: string ) => void;
  discoRoomInfo: () => unknown;
  setMeetingId: ( meetingId: string ) => void;
  createNonAnonymousRoom: () => void;
  onConnStatusChanged: ( status: Strophe.Status ) => void;
  onPresence: ( pres: unknown ) => void; // TODO:
  setParticipantPropertyListener: ( listener: unknown ) => void; // TODO:
  supportsRestartByTerminate: () => boolean;
  processNode: ( node: unknown, from: unknown ) => void; // TODO:
  sendMessage: ( message: unknown, elementName: string ) => void; // TODO:
  sendPrivateMessage: ( id: unknown, message: unknown, elementName: string ) => void; // TODO:
  setSubject: ( subject: string ) => void;
  onParticipantLeft: ( jid: string, skipEvents?: boolean, reason?: string ) => void;
  onPresenceUnavailable: ( pres: unknown, from: unknown ) => void; // TODO:
  onMessage: ( msg: unknown, from: unknown ) => void; // TODO:
  onPresenceError: ( pres: unknown, from: unknown ) => void; // TODO:
  setAffiliation: ( jid: string, affiliation: unknown ) => void; // TODO:
  kick: ( jid: string, reason?: string ) => void; // TODO:
  lockRoom: ( key: string, onSuccess: unknown, onError: unknown, onNotSupported: unknown ) => void; // TODO:
  setMembersOnly: ( enabled: boolean, onSuccess: unknown, onError: unknown ) => void; // TODO:
  addToPresence: ( key: unknown, values: unknown ) => unknown; // TODO:
  getFromPresence: ( key: unknown ) => void; // TODO:
  removeFromPresence: ( key: unknown ) => void; // TODO:
  addPresenceListener: ( name: string, handler: ( params: unknown ) => unknown ) => void; // TODO:
  removePresenceListener: ( name: string, handler: ( params: unknown ) => unknown ) => void; // TODO:
  isFocus: ( mucJid: string ) => boolean | null;
  isModerator: () => boolean;
  getMemberRole: ( peerJid: string ) => string | null;
  setVideoMute: ( mute: unknown, callback: ( params: unknown ) => unknown ) => void; // TODO:
  setAudioMute: ( mute: unknown, callback: ( params: unknown ) => unknown ) => void; // TODO:
  addAudioInfoToPresence: ( mute: unknown ) => void; // TODO:
  sendAudioInfoPresence: ( mute: unknown, callback: ( params: unknown ) => unknown ) => void; // TODO:
  addVideoInfoToPresence: ( mute: unknown ) => void; // TODO:
  sendVideoInfoPresence: ( mute: unknown ) => void; // TODO:
  isSIPCallingSupported: () => boolean;
  dial: ( number: string ) => unknown; // TODO:
  hangup: () => unknown; // TODO:
  getLobby: () => Lobby;
  getAVModeration(): AVModeration;
  getPhoneNumber: () => string;
  getPhonePin: () => string;
  getMeetingId: () => string;
  muteParticipant: ( jid: string, mute: unknown ) => void; // TODO:
  onMuteVideo: ( iq: unknown ) => void; // TODO:
  onMute: ( iq: unknown ) => void; // TODO:
  clean: () => void;
  leave: ( reason?: string ) => Promise<unknown>; // TODO:
  end: () => void;
}
