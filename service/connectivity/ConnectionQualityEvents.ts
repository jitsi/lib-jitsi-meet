export enum ConnectionQualityEvents {

    /**
     * Indicates that the local connection statistics were updated.
     */
    LOCAL_STATS_UPDATED = 'cq.local_stats_updated',

    /**
     * Indicates that the connection statistics for a particular remote participant
     * were updated.
     */
    REMOTE_STATS_UPDATED = 'cq.remote_stats_updated',

    /**
     * Indicates that media was previously flowing but has been zero for an
     * extended period while ICE remains connected — a zombie conference state.
     * Listeners should trigger recovery (e.g. session restart).
     */
    ZERO_MEDIA_DETECTED = 'cq.zero_media_detected'
}
