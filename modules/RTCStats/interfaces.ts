export interface IRTCStatsConfiguration {
    analytics?: {
        obfuscateRoomName?: boolean;
        rtcstatsEnabled?: boolean;
        rtcstatsEndpoint?: string;
        rtcstatsPollInterval?: number;
        rtcstatsSendSdp?: boolean;
        rtcstatsStoreLogs?: boolean;
        rtcstatsUseLegacy?: boolean;
    };
}
