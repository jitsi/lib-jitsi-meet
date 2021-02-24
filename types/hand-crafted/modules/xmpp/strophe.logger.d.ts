import ConnectionPlugin from './ConnectionPlugin';

declare class StropheLogger extends ConnectionPlugin {
  constructor();
  init: ( connection: unknown ) => void; // TODO:
  logIncoming: ( stanza: unknown ) => void; // TODO:
}

export default function _default(): void;