/* global __filename */
import isEqual from 'lodash.isequal';

import {
    createRtpStatsEvent,
    createTransportStatsEvent
} from '../../service/statistics/AnalyticsEvents';
import { getLogger } from 'jitsi-meet-logger';
import * as ConnectionQualityEvents
    from '../../service/connectivity/ConnectionQualityEvents';
import * as ConferenceEvents from '../../JitsiConferenceEvents';
import * as MediaType from '../../service/RTC/MediaType';
import browser from '../browser';
import Statistics from './statistics';
import * as VideoType from '../../service/RTC/VideoType';

const logger = getLogger(__filename);

/**
 * This will calculate an average for one, named stat and submit it to
 * the analytics module when requested. It automatically counts the samples.
 */
class AverageStatReport {
    /**
     * Creates new <tt>AverageStatReport</tt> for given name.
     * @param {string} name that's the name of the event that will be reported
     * to the analytics module.
     */
    constructor(name) {
        this.name = name;
        this.count = 0;
        this.sum = 0;
        this.samples = [];
    }

    /**
     * Adds the next value that will be included in the average when
     * {@link calculate} is called.
     * @param {number} nextValue
     */
    addNext(nextValue) {
        if (typeof nextValue !== 'number') {
            logger.error(
                `${this.name} - invalid value for idx: ${this.count}`,
                nextValue);
        } else if (!isNaN(nextValue)) {
            this.sum += nextValue;
            this.samples.push(nextValue);
            this.count += 1;
        }
    }

    /**
     * Calculates an average for the samples collected using {@link addNext}.
     * @return {number|NaN} an average of all collected samples or <tt>NaN</tt>
     * if no samples were collected.
     */
    calculate() {
        return this.sum / this.count;
    }

    /**
     * Appends the report to the analytics "data" object. The object will be
     * set under <tt>prefix</tt> + {@link this.name} key.
     * @param {Object} report the analytics "data" object
     */
    appendReport(report) {
        report[`${this.name}_avg`] = this.calculate();
        report[`${this.name}_samples`] = JSON.stringify(this.samples);
    }

    /**
     * Clears all memory of any samples collected, so that new average can be
     * calculated using this instance.
     */
    reset() {
        this.samples = [];
        this.sum = 0;
        this.count = 0;
    }
}

/**
 * Class gathers the stats that are calculated and reported for a
 * {@link TraceablePeerConnection} even if it's not currently active. For
 * example we want to monitor RTT for the JVB connection while in P2P mode.
 */
class ConnectionAvgStats {
    /**
     * Creates new <tt>ConnectionAvgStats</tt>
     * @param {AvgRTPStatsReporter} avgRtpStatsReporter
     * @param {boolean} isP2P
     * @param {number} n the number of samples, before arithmetic mean is to be
     * calculated and values submitted to the analytics module.
     */
    constructor(avgRtpStatsReporter, isP2P, n) {
        /**
         * Is this instance for JVB or P2P connection ?
         * @type {boolean}
         */
        this.isP2P = isP2P;

        /**
         * How many samples are to be included in arithmetic mean calculation.
         * @type {number}
         * @private
         */
        this._n = n;

        /**
         * The current sample index. Starts from 0 and goes up to {@link _n})
         * when analytics report will be submitted.
         * @type {number}
         * @private
         */
        this._sampleIdx = 0;

        /**
         * Average round trip time reported by the ICE candidate pair.
         * @type {AverageStatReport}
         */
        this._avgRTT = new AverageStatReport('rtt');

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
        this._avgRemoteRTTMap = new Map();

        /**
         * The conference for which stats will be collected and reported.
         * @type {JitsiConference}
         * @private
         */
        this._avgRtpStatsReporter = avgRtpStatsReporter;

        /**
         * The latest average E2E RTT for the JVB connection only.
         *
         * This is used only when {@link ConnectionAvgStats.isP2P} equals to
         * <tt>false</tt>.
         *
         * @type {number}
         */
        this._avgEnd2EndRTT = undefined;

        this._onConnectionStats = (tpc, stats) => {
            if (this.isP2P === tpc.isP2P) {
                this._calculateAvgStats(stats);
            }
        };

        const conference = avgRtpStatsReporter._conference;

        conference.statistics.addConnectionStatsListener(
            this._onConnectionStats);

        if (!this.isP2P) {
            this._onUserLeft = id => this._avgRemoteRTTMap.delete(id);
            conference.on(ConferenceEvents.USER_LEFT, this._onUserLeft);

            this._onRemoteStatsUpdated
                = (id, data) => this._processRemoteStats(id, data);
            conference.on(
                ConnectionQualityEvents.REMOTE_STATS_UPDATED,
                this._onRemoteStatsUpdated);
        }
    }

    /**
     * Processes next batch of stats.
     * @param {go figure} data
     * @private
     */
    _calculateAvgStats(data) {
        if (!data) {
            logger.error('No stats');

            return;
        }

        if (browser.supportsRTTStatistics()) {
            if (data.transport && data.transport.length) {
                this._avgRTT.addNext(data.transport[0].rtt);
            }
        }

        this._sampleIdx += 1;

        if (this._sampleIdx >= this._n) {
            if (browser.supportsRTTStatistics()) {
                const conference = this._avgRtpStatsReporter._conference;

                const batchReport = {
                    p2p: this.isP2P,
                    'conference_size': conference.getParticipantCount()
                };

                if (data.transport && data.transport.length) {
                    Object.assign(batchReport, {
                        'local_candidate_type':
                            data.transport[0].localCandidateType,
                        'remote_candidate_type':
                            data.transport[0].remoteCandidateType,
                        'transport_type': data.transport[0].type
                    });
                }

                this._avgRTT.appendReport(batchReport);

                if (this.isP2P) {
                    // Report RTT diff only for P2P.
                    const jvbEnd2EndRTT = this
                        ._avgRtpStatsReporter.jvbStatsMonitor._avgEnd2EndRTT;

                    if (!isNaN(jvbEnd2EndRTT)) {
                        // eslint-disable-next-line dot-notation
                        batchReport['rtt_diff']
                            = this._avgRTT.calculate() - jvbEnd2EndRTT;
                    }
                } else {
                    // Report end to end RTT only for JVB.
                    const avgRemoteRTT = this._calculateAvgRemoteRTT();
                    const avgLocalRTT = this._avgRTT.calculate();

                    this._avgEnd2EndRTT = avgLocalRTT + avgRemoteRTT;

                    if (!isNaN(avgLocalRTT) && !isNaN(avgRemoteRTT)) {
                        // eslint-disable-next-line dot-notation
                        batchReport['end2end_rtt_avg'] = this._avgEnd2EndRTT;
                    }
                }

                Statistics.sendAnalytics(createRtpStatsEvent(batchReport));
            }

            this._resetAvgStats();
        }
    }

    /**
     * Calculates arithmetic mean of all RTTs towards the JVB reported by
     * participants.
     * @return {number|NaN} NaN if not available (not enough data)
     * @private
     */
    _calculateAvgRemoteRTT() {
        let count = 0, sum = 0;

        // FIXME should we ignore RTT for participant
        // who "is having connectivity issues" ?
        for (const remoteAvg of this._avgRemoteRTTMap.values()) {
            const avg = remoteAvg.calculate();

            if (!isNaN(avg)) {
                sum += avg;
                count += 1;
                remoteAvg.reset();
            }
        }

        return sum / count;
    }

    /**
     * Processes {@link ConnectionQualityEvents.REMOTE_STATS_UPDATED} to analyse
     * RTT towards the JVB reported by each participant.
     * @param {string} id {@link JitsiParticipant.getId}
     * @param {go figure in ConnectionQuality.js} data
     * @private
     */
    _processRemoteStats(id, data) {
        const validData = typeof data.jvbRTT === 'number';
        let rttAvg = this._avgRemoteRTTMap.get(id);

        if (!rttAvg && validData) {
            rttAvg = new AverageStatReport(`${id}_stat_rtt`);
            this._avgRemoteRTTMap.set(id, rttAvg);
        }

        if (validData) {
            rttAvg.addNext(data.jvbRTT);
        } else if (rttAvg) {
            this._avgRemoteRTTMap.delete(id);
        }
    }

    /**
     * Reset cache of all averages and {@link _sampleIdx}.
     * @private
     */
    _resetAvgStats() {
        this._avgRTT.reset();
        if (this._avgRemoteRTTMap) {
            this._avgRemoteRTTMap.clear();
        }
        this._sampleIdx = 0;
    }

    /**
     *
     */
    dispose() {

        const conference = this._avgRtpStatsReporter._conference;

        conference.statistics.removeConnectionStatsListener(
            this._onConnectionStats);
        if (!this.isP2P) {
            conference.off(
                ConnectionQualityEvents.REMOTE_STATS_UPDATED,
                this._onRemoteStatsUpdated);
            conference.off(
                ConferenceEvents.USER_LEFT,
                this._onUserLeft);
        }
    }
}

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
    constructor(conference, n) {
        /**
         * How many {@link ConnectionQualityEvents.LOCAL_STATS_UPDATED} samples
         * are to be included in arithmetic mean calculation.
         * @type {number}
         * @private
         */
        this._n = n;

        if (n > 0) {
            logger.info(`Avg RTP stats will be calculated every ${n} samples`);
        } else {
            logger.info('Avg RTP stats reports are disabled.');

            // Do not initialize
            return;
        }

        /**
         * The current sample index. Starts from 0 and goes up to {@link _n})
         * when analytics report will be submitted.
         * @type {number}
         * @private
         */
        this._sampleIdx = 0;

        /**
         * The conference for which stats will be collected and reported.
         * @type {JitsiConference}
         * @private
         */
        this._conference = conference;

        /**
         * Average audio upload bitrate
         * XXX What are the units?
         * @type {AverageStatReport}
         * @private
         */
        this._avgAudioBitrateUp
            = new AverageStatReport('bitrate_audio_upload');

        /**
         * Average audio download bitrate
         * XXX What are the units?
         * @type {AverageStatReport}
         * @private
         */
        this._avgAudioBitrateDown
            = new AverageStatReport('bitrate_audio_download');

        /**
         * Average video upload bitrate
         * XXX What are the units?
         * @type {AverageStatReport}
         * @private
         */
        this._avgVideoBitrateUp
            = new AverageStatReport('bitrate_video_upload');

        /**
         * Average video download bitrate
         * XXX What are the units?
         * @type {AverageStatReport}
         * @private
         */
        this._avgVideoBitrateDown
            = new AverageStatReport('bitrate_video_download');

        /**
         * Average upload bandwidth
         * XXX What are the units?
         * @type {AverageStatReport}
         * @private
         */
        this._avgBandwidthUp
            = new AverageStatReport('bandwidth_upload');

        /**
         * Average download bandwidth
         * XXX What are the units?
         * @type {AverageStatReport}
         * @private
         */
        this._avgBandwidthDown
            = new AverageStatReport('bandwidth_download');

        /**
         * Average total packet loss
         * XXX What are the units?
         * @type {AverageStatReport}
         * @private
         */
        this._avgPacketLossTotal
            = new AverageStatReport('packet_loss_total');

        /**
         * Average upload packet loss
         * XXX What are the units?
         * @type {AverageStatReport}
         * @private
         */
        this._avgPacketLossUp
            = new AverageStatReport('packet_loss_upload');

        /**
         * Average download packet loss
         * XXX What are the units?
         * @type {AverageStatReport}
         * @private
         */
        this._avgPacketLossDown
            = new AverageStatReport('packet_loss_download');

        /**
         * Average FPS for remote videos
         * @type {AverageStatReport}
         * @private
         */
        this._avgRemoteFPS = new AverageStatReport('framerate_remote');

        /**
         * Average FPS for remote screen streaming videos (reported only if not
         * a <tt>NaN</tt>).
         * @type {AverageStatReport}
         * @private
         */
        this._avgRemoteScreenFPS
            = new AverageStatReport('framerate_screen_remote');

        /**
         * Average FPS for local video (camera)
         * @type {AverageStatReport}
         * @private
         */
        this._avgLocalFPS = new AverageStatReport('framerate_local');

        /**
         * Average FPS for local screen streaming video (reported only if not
         * a <tt>NaN</tt>).
         * @type {AverageStatReport}
         * @private
         */
        this._avgLocalScreenFPS
            = new AverageStatReport('framerate_screen_local');

        /**
         * Average pixels for remote screen streaming videos (reported only if
         * not a <tt>NaN</tt>).
         * @type {AverageStatReport}
         * @private
         */
        this._avgRemoteCameraPixels
            = new AverageStatReport('pixels_remote');

        /**
         * Average pixels for remote screen streaming videos (reported only if
         * not a <tt>NaN</tt>).
         * @type {AverageStatReport}
         * @private
         */
        this._avgRemoteScreenPixels
            = new AverageStatReport('pixels_screen_remote');

        /**
         * Average pixels for local video (camera)
         * @type {AverageStatReport}
         * @private
         */
        this._avgLocalCameraPixels
            = new AverageStatReport('pixels_local');

        /**
         * Average pixels for local screen streaming video (reported only if not
         * a <tt>NaN</tt>).
         * @type {AverageStatReport}
         * @private
         */
        this._avgLocalScreenPixels
            = new AverageStatReport('pixels_screen_local');

        /**
         * Average connection quality as defined by
         * the {@link ConnectionQuality} module.
         * @type {AverageStatReport}
         * @private
         */
        this._avgCQ = new AverageStatReport('connection_quality');

        this._cachedTransportStats = undefined;

        this._onLocalStatsUpdated = data => {
            this._calculateAvgStats(data);
            this._maybeSendTransportAnalyticsEvent(data);
        };
        conference.on(
            ConnectionQualityEvents.LOCAL_STATS_UPDATED,
            this._onLocalStatsUpdated);

        this._onP2PStatusChanged = () => {
            logger.debug('Resetting average stats calculation');
            this._resetAvgStats();
            this.jvbStatsMonitor._resetAvgStats();
            this.p2pStatsMonitor._resetAvgStats();
        };
        conference.on(
            ConferenceEvents.P2P_STATUS,
            this._onP2PStatusChanged);

        this._onJvb121StatusChanged = (oldStatus, newStatus) => {
            // We want to reset only on the transition from false => true,
            // because otherwise those stats are resetted on JVB <=> P2P
            // transition.
            if (newStatus === true) {
                logger.info('Resetting JVB avg RTP stats');
                this._resetAvgJvbStats();
            }
        };
        conference.on(
            ConferenceEvents.JVB121_STATUS,
            this._onJvb121StatusChanged);

        this.jvbStatsMonitor
            = new ConnectionAvgStats(this, false /* JVB */, n);

        this.p2pStatsMonitor
            = new ConnectionAvgStats(this, true /* P2P */, n);
    }

    /**
     * Processes next batch of stats reported on
     * {@link ConnectionQualityEvents.LOCAL_STATS_UPDATED}.
     * @param {go figure} data
     * @private
     */
    _calculateAvgStats(data) {

        if (!data) {
            logger.error('No stats');

            return;
        }

        const isP2P = this._conference.isP2PActive();
        const confSize = this._conference.getParticipantCount();

        if (!isP2P && confSize < 2) {

            // There's no point in collecting stats for a JVB conference of 1.
            // That happens for short period of time after everyone leaves
            // the room, until Jicofo terminates the session.
            return;
        }

        /* Uncomment to figure out stats structure
        for (const key in data) {
            if (data.hasOwnProperty(key)) {
                logger.info(`local stat ${key}: `, data[key]);
            }
        } */

        const bitrate = data.bitrate;
        const bandwidth = data.bandwidth;
        const packetLoss = data.packetLoss;
        const frameRate = data.framerate;
        const resolution = data.resolution;

        if (!bitrate) {
            logger.error('No "bitrate"');

            return;
        } else if (!bandwidth) {
            logger.error('No "bandwidth"');

            return;
        } else if (!packetLoss) {
            logger.error('No "packetloss"');

            return;
        } else if (!frameRate) {
            logger.error('No "framerate"');

            return;
        } else if (!resolution) {
            logger.error('No resolution');

            return;
        }

        this._avgAudioBitrateUp.addNext(bitrate.audio.upload);
        this._avgAudioBitrateDown.addNext(bitrate.audio.download);

        this._avgVideoBitrateUp.addNext(bitrate.video.upload);
        this._avgVideoBitrateDown.addNext(bitrate.video.download);

        if (browser.supportsBandwidthStatistics()) {
            this._avgBandwidthUp.addNext(bandwidth.upload);
            this._avgBandwidthDown.addNext(bandwidth.download);
        }

        this._avgPacketLossUp.addNext(packetLoss.upload);
        this._avgPacketLossDown.addNext(packetLoss.download);
        this._avgPacketLossTotal.addNext(packetLoss.total);

        this._avgCQ.addNext(data.connectionQuality);

        if (frameRate) {
            this._avgRemoteFPS.addNext(
                this._calculateAvgVideoFps(
                    frameRate, false /* remote */, VideoType.CAMERA));
            this._avgRemoteScreenFPS.addNext(
                this._calculateAvgVideoFps(
                    frameRate, false /* remote */, VideoType.DESKTOP));

            this._avgLocalFPS.addNext(
                this._calculateAvgVideoFps(
                    frameRate, true /* local */, VideoType.CAMERA));
            this._avgLocalScreenFPS.addNext(
                this._calculateAvgVideoFps(
                    frameRate, true /* local */, VideoType.DESKTOP));
        }

        if (resolution) {
            this._avgRemoteCameraPixels.addNext(
                this._calculateAvgVideoPixels(
                    resolution, false /* remote */, VideoType.CAMERA));

            this._avgRemoteScreenPixels.addNext(
                this._calculateAvgVideoPixels(
                    resolution, false /* remote */, VideoType.DESKTOP));

            this._avgLocalCameraPixels.addNext(
                this._calculateAvgVideoPixels(
                    resolution, true /* local */, VideoType.CAMERA));

            this._avgLocalScreenPixels.addNext(
                this._calculateAvgVideoPixels(
                    resolution, true /* local */, VideoType.DESKTOP));
        }

        this._sampleIdx += 1;

        if (this._sampleIdx >= this._n) {

            const batchReport = {
                p2p: isP2P,
                'conference_size': confSize
            };

            if (data.transport && data.transport.length) {
                Object.assign(batchReport, {
                    'local_candidate_type':
                        data.transport[0].localCandidateType,
                    'remote_candidate_type':
                        data.transport[0].remoteCandidateType,
                    'transport_type': data.transport[0].type
                });
            }

            this._avgAudioBitrateUp.appendReport(batchReport);
            this._avgAudioBitrateDown.appendReport(batchReport);

            this._avgVideoBitrateUp.appendReport(batchReport);
            this._avgVideoBitrateDown.appendReport(batchReport);

            if (browser.supportsBandwidthStatistics()) {
                this._avgBandwidthUp.appendReport(batchReport);
                this._avgBandwidthDown.appendReport(batchReport);
            }
            this._avgPacketLossUp.appendReport(batchReport);
            this._avgPacketLossDown.appendReport(batchReport);
            this._avgPacketLossTotal.appendReport(batchReport);

            this._avgRemoteFPS.appendReport(batchReport);
            if (!isNaN(this._avgRemoteScreenFPS.calculate())) {
                this._avgRemoteScreenFPS.appendReport(batchReport);
            }
            this._avgLocalFPS.appendReport(batchReport);
            if (!isNaN(this._avgLocalScreenFPS.calculate())) {
                this._avgLocalScreenFPS.appendReport(batchReport);
            }

            this._avgRemoteCameraPixels.appendReport(batchReport);
            if (!isNaN(this._avgRemoteScreenPixels.calculate())) {
                this._avgRemoteScreenPixels.appendReport(batchReport);
            }
            this._avgLocalCameraPixels.appendReport(batchReport);
            if (!isNaN(this._avgLocalScreenPixels.calculate())) {
                this._avgLocalScreenPixels.appendReport(batchReport);
            }

            this._avgCQ.appendReport(batchReport);

            Statistics.sendAnalytics(createRtpStatsEvent(batchReport));

            this._resetAvgStats();
        }
    }

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
    _calculateAvgVideoPixels(peerResolutions, isLocal, videoType) {
        let peerPixelsSum = 0;
        let peerCount = 0;
        const myID = this._conference.myUserId();

        for (const peerID of Object.keys(peerResolutions)) {
            if (isLocal ? peerID === myID : peerID !== myID) {
                const participant
                    = isLocal
                        ? null
                        : this._conference.getParticipantById(peerID);
                const videosResolution = peerResolutions[peerID];

                // Do not continue without participant for non local peerID
                if ((isLocal || participant) && videosResolution) {
                    const peerAvgPixels = this._calculatePeerAvgVideoPixels(
                        videosResolution, participant, videoType);

                    if (!isNaN(peerAvgPixels)) {
                        peerPixelsSum += peerAvgPixels;
                        peerCount += 1;
                    }
                }
            }
        }

        return peerPixelsSum / peerCount;
    }

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
    _calculatePeerAvgVideoPixels(videos, participant, videoType) {
        let ssrcs = Object.keys(videos).map(ssrc => Number(ssrc));
        let videoTracks = null;

        // NOTE that this method is supposed to be called for the stats
        // received from the current peerconnection.
        const tpc = this._conference.getActivePeerConnection();

        if (participant) {
            videoTracks = participant.getTracksByMediaType(MediaType.VIDEO);
            if (videoTracks) {
                ssrcs
                    = ssrcs.filter(
                        ssrc => videoTracks.find(
                            track =>
                                !track.isMuted()
                                    && track.getSSRC() === ssrc
                                    && track.videoType === videoType));
            }
        } else {
            videoTracks = this._conference.getLocalTracks(MediaType.VIDEO);
            ssrcs
                = ssrcs.filter(
                    ssrc => videoTracks.find(
                        track =>
                            !track.isMuted()
                                && tpc.getLocalSSRC(track) === ssrc
                                && track.videoType === videoType));
        }

        let peerPixelsSum = 0;
        let peerSsrcCount = 0;

        for (const ssrc of ssrcs) {
            const peerSsrcPixels
                = Number(videos[ssrc].height) * Number(videos[ssrc].width);

            // FPS is reported as 0 for users with no video
            if (!isNaN(peerSsrcPixels) && peerSsrcPixels > 0) {
                peerPixelsSum += peerSsrcPixels;
                peerSsrcCount += 1;
            }
        }

        return peerPixelsSum / peerSsrcCount;
    }


    /**
     * Calculates average FPS for the report
     * @param {go figure} frameRate
     * @param {boolean} isLocal if the average is to be calculated for the local
     * video or <tt>false</tt> if for remote videos.
     * @param {VideoType} videoType
     * @return {number|NaN} average FPS or <tt>NaN</tt> if there are no samples.
     * @private
     */
    _calculateAvgVideoFps(frameRate, isLocal, videoType) {
        let peerFpsSum = 0;
        let peerCount = 0;
        const myID = this._conference.myUserId();

        for (const peerID of Object.keys(frameRate)) {
            if (isLocal ? peerID === myID : peerID !== myID) {
                const participant
                    = isLocal
                        ? null : this._conference.getParticipantById(peerID);
                const videosFps = frameRate[peerID];

                // Do not continue without participant for non local peerID
                if ((isLocal || participant) && videosFps) {
                    const peerAvgFPS
                        = this._calculatePeerAvgVideoFps(
                            videosFps, participant, videoType);

                    if (!isNaN(peerAvgFPS)) {
                        peerFpsSum += peerAvgFPS;
                        peerCount += 1;
                    }
                }
            }
        }

        return peerFpsSum / peerCount;
    }

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
    _calculatePeerAvgVideoFps(videos, participant, videoType) {
        let ssrcs = Object.keys(videos).map(ssrc => Number(ssrc));
        let videoTracks = null;

        // NOTE that this method is supposed to be called for the stats
        // received from the current peerconnection.
        const tpc = this._conference.getActivePeerConnection();

        if (participant) {
            videoTracks = participant.getTracksByMediaType(MediaType.VIDEO);
            if (videoTracks) {
                ssrcs
                    = ssrcs.filter(
                        ssrc => videoTracks.find(
                            track => !track.isMuted()
                                && track.getSSRC() === ssrc
                                && track.videoType === videoType));
            }
        } else {
            videoTracks = this._conference.getLocalTracks(MediaType.VIDEO);
            ssrcs
                = ssrcs.filter(
                    ssrc => videoTracks.find(
                        track => !track.isMuted()
                            && tpc.getLocalSSRC(track) === ssrc
                            && track.videoType === videoType));
        }

        let peerFpsSum = 0;
        let peerSsrcCount = 0;

        for (const ssrc of ssrcs) {
            const peerSsrcFps = Number(videos[ssrc]);

            // FPS is reported as 0 for users with no video
            if (!isNaN(peerSsrcFps) && peerSsrcFps > 0) {
                peerFpsSum += peerSsrcFps;
                peerSsrcCount += 1;
            }
        }

        return peerFpsSum / peerSsrcCount;
    }

    /**
     * Sends the 'transport.stats' analytics event whenever we detect that
     * there is a change in the local or remote candidate type on the transport
     * that is currently selected.
     * @param {*} data
     * @private
     */
    _maybeSendTransportAnalyticsEvent(data) {
        if (!data || !data.transport || !data.transport.length) {
            return;
        }
        const transportStats = {
            p2p: data.transport[0].p2p,
            'local_candidate_type': data.transport[0].localCandidateType,
            'remote_candidate_type': data.transport[0].remoteCandidateType,
            'transport_type': data.transport[0].type
        };

        if (!this._cachedTransportStats || !isEqual(transportStats, this._cachedTransportStats)) {
            this._cachedTransportStats = transportStats;
            Statistics.sendAnalytics(createTransportStatsEvent(transportStats));
        }
    }

    /**
     * Resets the stats related to JVB connection. Must not be called when in
     * P2P mode, because then the {@link AverageStatReport} instances are
     * tracking P2P stats. Note that this should never happen unless something
     * is wrong with the P2P and JVB121 events.
     * @private
     */
    _resetAvgJvbStats() {
        this._resetAvgStats();
        this.jvbStatsMonitor._resetAvgStats();
    }

    /**
     * Reset cache of all averages and {@link _sampleIdx}.
     * @private
     */
    _resetAvgStats() {
        this._avgAudioBitrateUp.reset();
        this._avgAudioBitrateDown.reset();

        this._avgVideoBitrateUp.reset();
        this._avgVideoBitrateDown.reset();

        this._avgBandwidthUp.reset();
        this._avgBandwidthDown.reset();

        this._avgPacketLossUp.reset();
        this._avgPacketLossDown.reset();
        this._avgPacketLossTotal.reset();

        this._avgRemoteFPS.reset();
        this._avgRemoteScreenFPS.reset();
        this._avgLocalFPS.reset();
        this._avgLocalScreenFPS.reset();

        this._avgRemoteCameraPixels.reset();
        this._avgRemoteScreenPixels.reset();
        this._avgLocalCameraPixels.reset();
        this._avgLocalScreenPixels.reset();

        this._avgCQ.reset();

        this._sampleIdx = 0;
    }

    /**
     * Unregisters all event listeners and stops working.
     */
    dispose() {
        this._conference.off(
            ConferenceEvents.P2P_STATUS,
            this._onP2PStatusChanged);
        this._conference.off(
            ConnectionQualityEvents.LOCAL_STATS_UPDATED,
            this._onLocalStatsUpdated);
        this._conference.off(
            ConferenceEvents.JVB121_STATUS,
            this._onJvb121StatusChanged);
        this.jvbStatsMonitor.dispose();
        this.p2pStatsMonitor.dispose();
    }
}
