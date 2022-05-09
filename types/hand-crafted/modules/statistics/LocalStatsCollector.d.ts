declare function LocalStatsCollector( stream: unknown, interval: unknown, callback: unknown ): void;

declare class LocalStatsCollector {
  constructor( stream: unknown, interval: unknown, callback: unknown );
  start: () => void;
  stop: () => void;
  static isLocalStatsSupported: () => boolean;
} // TODO: check this definition - it looks like an old school class but might be a mixin

export default LocalStatsCollector;