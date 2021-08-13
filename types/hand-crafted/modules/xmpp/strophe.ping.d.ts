import ConnectionPlugin from './ConnectionPlugin';

declare class PingConnectionPlugin extends ConnectionPlugin {
  constructor( options: { getTimeSinceLastServerResponse: ( params: unknown ) => unknown, onPingThresholdExceeded: ( params: unknown ) => unknown, pingOptions?: unknown } ); // TODO: jsdocs are quite different
  init: ( connection: unknown ) => void; // TODO:
  ping: ( jid: string, success: ( params: unknown ) => unknown, error: ( params: unknown ) => unknown, timeout: number ) => void; // TODO:
  startInterval: ( remoteJid: unknown ) => void; // TODO:
  stopInterval: () => void;
  getPingSuspendTime: () => number;
}
