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

export interface RTCStatsState {
    /** Initialized - doesn't necessarily mean that rtcstats are enabled */
    initialized: boolean;
    /** Is true if initialized with `rtcstatsEnabled` being true */
    enabled: boolean;
}
