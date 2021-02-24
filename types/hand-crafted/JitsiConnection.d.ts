import JitsiConference from './JitsiConference';
import { JitsiConnectionEvents } from './JitsiConnectionEvents';

export type JitsiConferenceOptions = {
  // TODO:
}

export default class JitsiConnection {
  constructor( appID?: string, token?: unknown, options?: JitsiConferenceOptions );
  connect: ( options: unknown ) => void; // TODO:
  attach: ( options: unknown ) => void; // TODO:
  disconnect: ( ...args: unknown[] ) => Promise<unknown>; // TODO:
  getJid: () => string;
  setToken: ( token: unknown ) => void;
  initJitsiConference: ( name: string, options: JitsiConferenceOptions ) => JitsiConference;
  addEventListener: ( event: JitsiConnectionEvents, listener: unknown ) => void; // TODO:
  removeEventListener: ( event: JitsiConnectionEvents, listener: unknown ) => void; // TODO:
  getConnectionTimes: () => number; // TODO: check
  addFeature: ( feature: string, submit?: boolean ) => void;
  removeFeature: ( feature: string, submit?: boolean ) => void;
  getLogs: () => unknown | { metadata: { time: Date, url: string, ua: string, xmpp?: unknown } }; // TODO:
}
