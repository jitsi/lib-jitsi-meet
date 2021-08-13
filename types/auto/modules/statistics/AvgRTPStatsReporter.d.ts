/**
 * Reports average RTP statistics values (arithmetic mean) to the analytics
 * module for things like bit rate, bandwidth, packet loss etc. It keeps track
 * of the P2P vs JVB conference modes and submits the values under different
 * namespaces (the events for P2P mode have 'p2p.' prefix). Every switch between
 * P2P mode resets the data collected so far and averages are calculated from
 * scratch.
 */
export default class AvgRTPStatsReporter {
    /**
     * Creates new instance of <tt>AvgRTPStatsReporter</tt>
     * @param {JitsiConference} conference
     * @param {number} n the number of samples, before arithmetic mean is to be
     * calculated and values submitted to the analytics module.
     */
    constructor(conference: any, n: number);
    /**
     * How many {@link ConnectionQualityEvents.LOCAL_STATS_UPDATED} samples
     * are to be included in arithmetic mean calculation.
     * @type {number}
     * @private
     */
    private _n;
    /**
     * The current sample index. Starts from 0 and goes up to {@link _n})
     * when analytics report will be submitted.
     * @type {number}
     * @private
     */
    private _sampleIdx;
    /**
     * The conference for which stats will be collected and reported.
     * @type {JitsiConference}
     * @private
     */
    private _conference;
    /**
     * Average audio upload bitrate
     * XXX What are the units?
     * @type {AverageStatReport}
     * @private
     */
    private _avgAudioBitrateUp;
    /**
     * Average audio download bitrate
     * XXX What are the units?
     * @type {AverageStatReport}
     * @private
     */
    private _avgAudioBitrateDown;
    /**
     * Average video upload bitrate
     * XXX What are the units?
     * @type {AverageStatReport}
     * @private
     */
    private _avgVideoBitrateUp;
    /**
     * Average video download bitrate
     * XXX What are the units?
     * @type {AverageStatReport}
     * @private
     */
    private _avgVideoBitrateDown;
    /**
     * Average upload bandwidth
     * XXX What are the units?
     * @type {AverageStatReport}
     * @private
     */
    private _avgBandwidthUp;
    /**
     * Average download bandwidth
     * XXX What are the units?
     * @type {AverageStatReport}
     * @private
     */
    private _avgBandwidthDown;
    /**
     * Average total packet loss
     * XXX What are the units?
     * @type {AverageStatReport}
     * @private
     */
    private _avgPacketLossTotal;
    /**
     * Average upload packet loss
     * XXX What are the units?
     * @type {AverageStatReport}
     * @private
     */
    private _avgPacketLossUp;
    /**
     * Average download packet loss
     * XXX What are the units?
     * @type {AverageStatReport}
     * @private
     */
    private _avgPacketLossDown;
    /**
     * Average FPS for remote videos
     * @type {AverageStatReport}
     * @private
     */
    private _avgRemoteFPS;
    /**
     * Average FPS for remote screen streaming videos (reported only if not
     * a <tt>NaN</tt>).
     * @type {AverageStatReport}
     * @private
     */
    private _avgRemoteScreenFPS;
    /**
     * Average FPS for local video (camera)
     * @type {AverageStatReport}
     * @private
     */
    private _avgLocalFPS;
    /**
     * Average FPS for local screen streaming video (reported only if not
     * a <tt>NaN</tt>).
     * @type {AverageStatReport}
     * @private
     */
    private _avgLocalScreenFPS;
    /**
     * Average pixels for remote screen streaming videos (reported only if
     * not a <tt>NaN</tt>).
     * @type {AverageStatReport}
     * @private
     */
    private _avgRemoteCameraPixels;
    /**
     * Average pixels for remote screen streaming videos (reported only if
     * not a <tt>NaN</tt>).
     * @type {AverageStatReport}
     * @private
     */
    private _avgRemoteScreenPixels;
    /**
     * Average pixels for local video (camera)
     * @type {AverageStatReport}
     * @private
     */
    private _avgLocalCameraPixels;
    /**
     * Average pixels for local screen streaming video (reported only if not
     * a <tt>NaN</tt>).
     * @type {AverageStatReport}
     * @private
     */
    private _avgLocalScreenPixels;
    /**
     * Average connection quality as defined by
     * the {@link ConnectionQuality} module.
     * @type {AverageStatReport}
     * @private
     */
    private _avgCQ;
    _cachedTransportStats: {
        p2p: any;
        local_candidate_type: any;
        remote_candidate_type: any;
        transport_type: any;
    };
    _onLocalStatsUpdated: (data: any) => void;
    _onP2PStatusChanged: () => void;
    _onJvb121StatusChanged: (oldStatus: any, newStatus: any) => void;
    jvbStatsMonitor: ConnectionAvgStats;
    p2pStatsMonitor: ConnectionAvgStats;
    /**
     * Processes next batch of stats reported on
     * {@link ConnectionQualityEvents.LOCAL_STATS_UPDATED}.
     * @param {go figure} data
     * @private
     */
    private _calculateAvgStats;
    /**
     * Calculates average number of pixels for the report
     *
     * @param {map} peerResolutions a map of peer resolutions
     * @param {boolean} isLocal if the average is to be calculated for the local
     * video or <tt>false</tt> if for remote videos.
     * @param {VideoType} videoType
     * @return {number|NaN} average number of pixels or <tt>NaN</tt> if there
     * are no samples.
     * @private
     */
    private _calculateAvgVideoPixels;
    /**
     * Calculate average pixels for either remote or local participant
     * @param {object} videos maps resolution per video SSRC
     * @param {JitsiParticipant|null} participant remote participant or
     * <tt>null</tt> for local video pixels calculation.
     * @param {VideoType} videoType the type of the video for which an average
     * will be calculated.
     * @return {number|NaN} average video pixels of all participant's videos or
     * <tt>NaN</tt> if currently not available
     * @private
     */
    private _calculatePeerAvgVideoPixels;
    /**
     * Calculates average FPS for the report
     * @param {go figure} frameRate
     * @param {boolean} isLocal if the average is to be calculated for the local
     * video or <tt>false</tt> if for remote videos.
     * @param {VideoType} videoType
     * @return {number|NaN} average FPS or <tt>NaN</tt> if there are no samples.
     * @private
     */
    private _calculateAvgVideoFps;
    /**
     * Calculate average FPS for either remote or local participant
     * @param {object} videos maps FPS per video SSRC
     * @param {JitsiParticipant|null} participant remote participant or
     * <tt>null</tt> for local FPS calculation.
     * @param {VideoType} videoType the type of the video for which an average
     * will be calculated.
     * @return {number|NaN} average FPS of all participant's videos or
     * <tt>NaN</tt> if currently not available
     * @private
     */
    private _calculatePeerAvgVideoFps;
    /**
     * Sends the 'transport.stats' analytics event whenever we detect that
     * there is a change in the local or remote candidate type on the transport
     * that is currently selected.
     * @param {*} data
     * @private
     */
    private _maybeSendTransportAnalyticsEvent;
    /**
     * Resets the stats related to JVB connection. Must not be called when in
     * P2P mode, because then the {@link AverageStatReport} instances are
     * tracking P2P stats. Note that this should never happen unless something
     * is wrong with the P2P and JVB121 events.
     * @private
     */
    private _resetAvgJvbStats;
    /**
     * Reset cache of all averages and {@link _sampleIdx}.
     * @private
     */
    private _resetAvgStats;
    /**
     * Unregisters all event listeners and stops working.
     */
    dispose(): void;
}
/**
 * Class gathers the stats that are calculated and reported for a
 * {@link TraceablePeerConnection} even if it's not currently active. For
 * example we want to monitor RTT for the JVB connection while in P2P mode.
 */
declare class ConnectionAvgStats {
    /**
     * Creates new <tt>ConnectionAvgStats</tt>
     * @param {AvgRTPStatsReporter} avgRtpStatsReporter
     * @param {boolean} isP2P
     * @param {number} n the number of samples, before arithmetic mean is to be
     * calculated and values submitted to the analytics module.
     */
    constructor(avgRtpStatsReporter: AvgRTPStatsReporter, isP2P: boolean, n: number);
    /**
     * Is this instance for JVB or P2P connection ?
     * @type {boolean}
     */
    isP2P: boolean;
    /**
     * How many samples are to be included in arithmetic mean calculation.
     * @type {number}
     * @private
     */
    private _n;
    /**
     * The current sample index. Starts from 0 and goes up to {@link _n})
     * when analytics report will be submitted.
     * @type {number}
     * @private
     */
    private _sampleIdx;
    /**
     * Average round trip time reported by the ICE candidate pair.
     * @type {AverageStatReport}
     */
    _avgRTT: AverageStatReport;
    /**
     * Map stores average RTT to the JVB reported by remote participants.
     * Mapped per participant id {@link JitsiParticipant.getId}.
     *
     * This is used only when {@link ConnectionAvgStats.isP2P} equals to
     * <tt>false</tt>.
     *
     * @type {Map<string,AverageStatReport>}
     * @private
     */
    private _avgRemoteRTTMap;
    /**
     * The conference for which stats will be collected and reported.
     * @type {JitsiConference}
     * @private
     */
    private _avgRtpStatsReporter;
    /**
     * The latest average E2E RTT for the JVB connection only.
     *
     * This is used only when {@link ConnectionAvgStats.isP2P} equals to
     * <tt>false</tt>.
     *
     * @type {number}
     */
    _avgEnd2EndRTT: number;
    _onConnectionStats: (tpc: any, stats: any) => void;
    _onUserLeft: (id: any) => boolean;
    _onRemoteStatsUpdated: (id: any, data: any) => void;
    /**
     * Processes next batch of stats.
     * @param {go figure} data
     * @private
     */
    private _calculateAvgStats;
    /**
     * Calculates arithmetic mean of all RTTs towards the JVB reported by
     * participants.
     * @return {number|NaN} NaN if not available (not enough data)
     * @private
     */
    private _calculateAvgRemoteRTT;
    /**
     * Processes {@link ConnectionQualityEvents.REMOTE_STATS_UPDATED} to analyse
     * RTT towards the JVB reported by each participant.
     * @param {string} id {@link JitsiParticipant.getId}
     * @param {go figure in ConnectionQuality.js} data
     * @private
     */
    private _processRemoteStats;
    /**
     * Reset cache of all averages and {@link _sampleIdx}.
     * @private
     */
    private _resetAvgStats;
    /**
     *
     */
    dispose(): void;
}
/**
 * This will calculate an average for one, named stat and submit it to
 * the analytics module when requested. It automatically counts the samples.
 */
declare class AverageStatReport {
    /**
     * Creates new <tt>AverageStatReport</tt> for given name.
     * @param {string} name that's the name of the event that will be reported
     * to the analytics module.
     */
    constructor(name: string);
    name: string;
    count: number;
    sum: number;
    samples: any[];
    /**
     * Adds the next value that will be included in the average when
     * {@link calculate} is called.
     * @param {number} nextValue
     */
    addNext(nextValue: number): void;
    /**
     * Calculates an average for the samples collected using {@link addNext}.
     * @return {number|NaN} an average of all collected samples or <tt>NaN</tt>
     * if no samples were collected.
     */
    calculate(): number | number;
    /**
     * Appends the report to the analytics "data" object. The object will be
     * set under <tt>prefix</tt> + {@link this.name} key.
     * @param {Object} report the analytics "data" object
     */
    appendReport(report: any): void;
    /**
     * Clears all memory of any samples collected, so that new average can be
     * calculated using this instance.
     */
    reset(): void;
}
export {};
