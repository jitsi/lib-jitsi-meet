import TraceablePeerConnection from '../RTC/TraceablePeerConnection';

declare class CallStats {
  constructor( tpc: TraceablePeerConnection, options: {
    confID: string,
    remoteUserID?: string
  } );
  static readonly fabrics: Set<CallStats>;
  static initBackend: ( options: {
    callStatsID: string,
    callStatsSecret: string,
    aliasName: string
    userName: string
  } ) => boolean;
  static isBackendInitialized: () => boolean;
  static sendActiveDeviceListEvent: ( devicesData: { deviceList: { string: string } }, cs: CallStats ) => void; // TODO: not convinced by this definition
  static sendApplicationLog: ( e: Error, cs: CallStats ) => void;
  static sendFeedback: ( conferenceID: string, overall: 1 | 2 | 3 | 4 | 5, comment: unknown ) => Promise<unknown>; // TODO:
  static sendGetUserMediaFailed: ( e: Error, cs: CallStats ) => void;
  static sendMuteEvent: ( mute: boolean, type: "audio" | "video", cs: CallStats ) => void;
  associateStreamWithVideoTag: ( ssrc: number, isLocal: boolean, streamEndpointId: string | null, usageLabel: string, containerId: string ) => void;
  sendDominantSpeakerEvent: () => void;
  sendTerminateEvent: () => void;
  sendIceConnectionFailedEvent: () => void;
  sendCreateOfferFailed: ( e: Error ) => void;
  sendCreateAnswerFailed: ( e: Error ) => void;
  sendResumeOrHoldEvent: ( isResume: boolean ) => void;
  sendScreenSharingEvent: ( start: boolean, ssrc: string | null ) => void;
  sendSetLocalDescFailed: ( e: Error ) => void;
  sendSetRemoteDescFailed: ( e: Error ) => void;
  sendAddIceCandidateFailed: ( e: Error ) => void;
}

export default CallStats;
