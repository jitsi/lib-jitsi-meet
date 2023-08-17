/**
 * Events emitted by the RTCStats module.
 */
export enum RTCStatsEvents {
    /**
     * Event emitted when the websocket connection to the rtcstats server is disconnected.
     */
    RTC_STATS_WC_DISCONNECTED = 'rtcstats_ws_disconnected',

    /**
     * Event emitted when any PeerConnection event is triggered.
     * 
     * @param {object} event - The PeerConnection event.
     * @param {string} event.type - The event type.
     * @param {object} event.body - Event body.
     * @param {string} event.body.isP2P - PeerConnection type.
     * @param {string} event.body.state - PeerConnection state change which triggered the event.
     */
    RTC_STATS_PC_EVENT = 'rtstats_pc_event',
};

// exported for backward compatibility
export const RTC_STATS_WC_DISCONNECTED = RTCStatsEvents.RTC_STATS_WC_DISCONNECTED;
export const RTC_STATS_PC_EVENT = RTCStatsEvents.RTC_STATS_PC_EVENT;
