export interface IWatchRTCConfiguration {
    allowBrowserLogCollection?: boolean;
    collectionInterval?: number;
    console?: {
        level: string;
        override: boolean;
    };
    debug?: boolean;
    keys?: any;
    logGetStats?: boolean;
    proxyUrl?: string;
    rtcApiKey: string;
    rtcPeerId?: string;
    rtcRoomId?: string;
    rtcTags?: string[];
    rtcToken?: string;
    wsUrl?: string;
}
