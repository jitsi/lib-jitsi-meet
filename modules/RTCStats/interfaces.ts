export interface IRTCStatsConfiguration {
    analytics?: {
        obfuscateRoomName?: boolean;
        rtcstatsEnabled?: boolean;
        rtcstatsEndpoint?: string;
        rtcstatsPollInterval?: number;
        rtcstatsSendSdp?: boolean;
        rtcstatsStoreLogs?: boolean;
        rtcstatsUseLegacy?: boolean;
    },
}

export interface ITraceOptions {
    endpoint: string;
    isBreakoutRoom: boolean;
    meetingFqn: string;
    useLegacy: boolean;
}