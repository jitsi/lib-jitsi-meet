export enum StatisticsEvents {

    /**
     * Notifies about audio level in RTP statistics by SSRC.
     *
     * @param ssrc - The synchronization source identifier (SSRC) of the
     * endpoint/participant whose audio level is being reported.
     * @param {number} audioLevel - The audio level of <tt>ssrc</tt> according to
     * RTP statistics.
     * @param {boolean} isLocal - <tt>true</tt> if <tt>ssrc</tt> identifies the
     * local endpoint/participant; otherwise, <tt>false</tt>.
     */
    AUDIO_LEVEL = 'statistics.audioLevel',

    /**
     * An event fired just before the statistics module gets disposes and it's
     * the last chance to submit logs.
     */
    BEFORE_DISPOSED = 'statistics.before_disposed',

    /**
     * An event carrying all statistics by ssrc.
     */
    BYTE_SENT_STATS = 'statistics.byte_sent_stats',

    /**
     * An event carrying connection statistics.
     *
     * @param {object} connectionStats - The connection statistics carried by the
     * event such as <tt>bandwidth</tt>, <tt>bitrate</tt>, <tt>packetLoss</tt>,
     * <tt>resolution</tt>, and <tt>transport</tt>.
     */
    CONNECTION_STATS = 'statistics.connectionstats',

    /**
     * An event carrying the encode time stats for all the local video sources.
     */
    ENCODE_TIME_STATS = 'statistics.encode_time_stats',

    /**
     * An event carrying per-SSRC inbound video stats for remote video streams that are receiving bytes but
     * decoding no frames. Fired in two situations:
     *   1. When at least one such stream exists (stats map is non-empty).
     *   2. Once more with an empty map when the set of failing streams transitions from non-empty to empty,
     *      giving consumers the opportunity to fire resolution events and clean up state.
     * No event is emitted while all remote streams are healthy.
     *
     * @param {TraceablePeerConnection} tpc - The peer connection.
     * @param {Map<number, { bitrateDownload: number, fps: number, participantId: string }>} stats - Stats per SSRC.
     */
    INBOUND_VIDEO_STATS = 'statistics.inbound_video_stats',
}
