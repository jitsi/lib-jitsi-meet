import Listenable from '../util/Listenable';

export const DEFAULT_STUN_SERVERS: { urls: string; }[];

export const JITSI_MEET_MUC_TYPE: "type";

export const FEATURE_JIGASI: string;

export const FEATURE_E2EE: string;

export default class XMPP extends Listenable {
  constructor( options: { serviceUrl: string, bosh: string, enableWebsocketResume: boolean, websocketKeepAlive: number, websocketKeepAliveUrl: number, xmppPing: unknown, p2pStunServers: unknown[] }, token: unknown ); // TODO: check jsdoc number vs string
  initFeaturesList: () => void;
  getConnection: () => unknown; // TODO:
  connectionHandler: ( credentials?: { jid: string, password: string }, status?: string, msg?: string ) => void;
  attach: ( options: { jid: string, sid: string, rid: string, password: string } ) => void;
  connect: ( jid: string, password: string ) => unknown; // TODO:
  createRoom: ( roomName: string, options: unknown, onCreateResource?: ( params: unknown ) => unknown ) => Promise<unknown>; // TODO:
  getJid: () => string;
  getJingleLog: () => unknown; // TODO:
  getXmppLog: () => unknown | null; // TODO:
  dial: ( ...args: unknown[] ) => void; // TODO:
  ping: ( timeout: number ) => Promise<unknown>; // TODO:
  getSessions: () => unknown; // TODO:
  disconnect: ( ev: unknown ) => Promise<unknown>; // TODO:
  sendDominantSpeakerEvent: ( roomJid: string ) => void;
  tryParseJSONAndVerify: ( jsonString: string ) => boolean | unknown; // TODO:
}
