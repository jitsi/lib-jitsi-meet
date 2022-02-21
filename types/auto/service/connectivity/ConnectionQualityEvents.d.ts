export declare enum ConnectionQualityEvents {
    /**
     * Indicates that the local connection statistics were updated.
     */
    LOCAL_STATS_UPDATED = "cq.local_stats_updated",
    /**
     * Indicates that the connection statistics for a particular remote participant
     * were updated.
     */
    REMOTE_STATS_UPDATED = "cq.remote_stats_updated"
}
export declare const LOCAL_STATS_UPDATED = ConnectionQualityEvents.LOCAL_STATS_UPDATED;
export declare const REMOTE_STATS_UPDATED = ConnectionQualityEvents.REMOTE_STATS_UPDATED;
