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
export const AUDIO_LEVEL = "statistics.audioLevel";

/**
 * Notifies about audio problem with remote participant.
 */
export const AUDIO_NOT_WORKING = "statistics.audio_not_working";

/**
 * An event carrying connection statistics.
 */
export const CONNECTION_STATS = "statistics.connectionstats";

/**
 * An event carrying all statistics by ssrc.
 */
export const BYTE_SENT_STATS = "statistics.byte_sent_stats";
