declare interface Strophe {
  log: ( level: unknown, msg: unknown ) => void; // TODO:
  getLastErrorStatus: () => number;
  getStatusString: ( status: unknown ) => string; // TODO:
  getTimeSinceLastSuccess: () => number | null;
}

export default function _default(): void;