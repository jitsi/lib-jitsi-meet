import Listenable from '../util/Listenable';
import ConnectionPluginListenable from './ConnectionPlugin';

export default class XmppConnection extends Listenable {
  static readonly Events: { CONN_STATUS_CHANGED: 'CONN_STATUS_CHANGED', CONN_SHARD_CHANGED: 'CONN_SHARD_CHANGED' };
  static readonly Status: typeof Strophe.Status;
  constructor( options: { enableWebsocketResume: boolean, websocketKeepAlive: number, websocketKeepAliveUrl: string, serviceUrl: string, shard: string, xmppPing: unknown } ) // TODO: jsdocs are wrong
  readonly connected: boolean;
  readonly disco: unknown; // TODO:
  readonly disconnecting: boolean;
  readonly domain: string | null;
  readonly isUsingWebSocket: boolean;
  readonly jid: string | null;
  readonly lastResponseHeaders: string;
  readonly logger: unknown; // TODO:
  readonly options: unknown; // TODO:
  readonly pingDomain: unknown; // TODO:
  readonly service: string;
  readonly status: Strophe.Status;
  addConnectionPlugin: ( name: string, plugin: ConnectionPluginListenable ) => void;
  addHandler: ( ...args: unknown[] ) => void; // TODO:
  attach: ( jid: string, sid: string, rid: string, callback: ( params: unknown ) => unknown, ...args: unknown[] ) => void; // TODO:
  connect: ( jid: string, pass: string, callback: ( params: unknown ) => unknown, ...args: unknown[] ) => void; // TODO:
  closeWebsocket: () => void;
  disconnect: ( ...args: unknown[] ) => void; // TODO:
  flush: ( ...args: unknown[] ) => void;
  getTimeSinceLastSuccess: () => number | null;
  getLastFailedMessage: () => string | null;
  send: ( stanza: Element | Strophe.Builder ) => void;
  sendIQ: ( elem: unknown, callback: ( params: unknown ) => unknown, errback: ( params: unknown ) => unknown, timeout: ( params: unknown ) => unknown ) => number | undefined; // TODO:
  sendIQ2: ( iq: Element, { timeout: number } ) => Promise<unknown>; // TODO:
  sendPresence: ( elem: Element, callback: ( params: unknown ) => unknown, errback: ( params: unknown ) => unknown, timeout: number ) => number; // TODO:
  sendUnavailableBeacon: () => boolean;
}
