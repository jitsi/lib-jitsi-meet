export default function StatsCollector( peerconnection: unknown, audioLevelsInterval: unknown, statsInterval: unknown, eventEmitter: unknown ): void; // TODO:

export default class StatsCollector {
  constructor( peerconnection: unknown, audioLevelsInterval: unknown, statsInterval: unknown, eventEmitter: unknown ); // TODO:
  stop: () => void;
  errorCallback: ( error: Error ) => void;
  start: ( startAudioLevelStats: unknown ) => void;
  getNonNegativeStat: ( report: unknown, name: string ) => number;
  processStatsReport: () => void;
  getNonNegativeValue: ( v: unknown ) => number; // TODO:
  setSpeakerList: ( speakerList: Array<string> ) => void;
}
