import TraceablePeerConnection from '../RTC/TraceablePeerConnection';

export type StatisticsOptions = {
  applicationName: string,
  aliasName: string,
  userName: string,
  confID: string,
  callStatsID: string,
  callStatsSecret: string,
  customScriptUrl: string,
  roomName: string
}

declare function Statistics( xmpp: unknown, options: StatisticsOptions ): void;

declare class Statistics {
  constructor( xmpp: unknown, options: StatisticsOptions ); // TODO:
  readonly instances: Set<Statistics>;
  localStats: unknown[]; // TODO:
  startRemoteStats: ( peerconnection: TraceablePeerConnection ) => void;
  startLocalStats: ( stream: unknown, callback: unknown ) => void; // TODO:
  addAudioLevelListener: ( listener: unknown ) => void; // TODO:
  removeAudioLevelListener: ( listener: unknown ) => void; // TODO:
  addBeforeDisposedListener: ( listener: unknown ) => void; // TODO:
  removeBeforeDisposedListener: ( listener: unknown ) => void; // TODO:
  addConnectionStatsListener: ( listener: unknown ) => void; // TODO:
  removeConnectionStatsListener: ( listener: unknown ) => void; // TODO:
  addByteSentStatsListener: ( listener: unknown ) => void; // TODO:
  removeByteSentStatsListener: ( listener: unknown ) => void; // TODO:
  addLongTasksStatsListener: ( listener: unknown ) => void; // TODO:
  attachLongTasksStats: ( conference: unknown ) => void; // TODO:
  getLongTasksStats: () => unknown | null; // TODO:
  removeLongTasksStatsListener: ( listener: unknown ) => void; // TODO:
  setSpeakerList: ( speakerList: Array<string> ) => void;
  dispose: () => void;
  stopLocalStats: ( stream: unknown ) => void;
  stopRemoteStats: ( tpc: TraceablePeerConnection ) => void;
  startCallStats: ( tpc: TraceablePeerConnection, remoteUserID: string ) => void;
  stopCallStats: ( tpc: TraceablePeerConnection ) => void;
  isCallstatsEnabled: () => boolean;
  sendConnectionResumeOrHoldEvent: ( tpc: TraceablePeerConnection, isResume: boolean ) => void;
  sendIceConnectionFailedEvent: ( tpc: TraceablePeerConnection ) => void;
  sendMuteEvent: ( tpc: TraceablePeerConnection, muted: boolean, type: "audio" | "video" ) => void;
  sendScreenSharingEvent: ( start: boolean, ssrc: string | null ) => void;
  sendDominantSpeakerEvent: ( roomJid: string ) => void;
  sendActiveDeviceListEvent: ( devicesData: { deviceList: { String: string } } ) => void; // TODO: check this definition
  associateStreamWithVideoTag: ( tpc: TraceablePeerConnection, ssrc: number, isLocal: boolean, userId: string, usageLabel: string, containerId: string ) => void;
  sendGetUserMediaFailed: ( e: Error ) => void;
  sendCreateOfferFailed: ( e: Error, tpc: TraceablePeerConnection ) => void;
  sendCreateAnswerFailed: ( e: Error, tpc: TraceablePeerConnection ) => void;
  sendSetLocalDescFailed: ( e: Error, tpc: TraceablePeerConnection ) => void;
  sendSetRemoteDescFailed: ( e: Error, tpc: TraceablePeerConnection ) => void;
  sendAddIceCandidateFailed: ( e: Error, tpc: TraceablePeerConnection ) => void;
  sendFeedback: ( overall: 1 | 2 | 3 | 4 | 5, comment: string ) => Promise<void>;
  static reportGlobalError: ( error: Error ) => void;
  static sendLog: ( m: string ) => void;
  static sendAnalyticsAndLog: ( event: string | unknown, properties?: unknown ) => void; // TODO
  static sendAnalytics: ( eventName: string | unknown, properties?: unknown ) => void; // TODO
}

export default Statistics;
