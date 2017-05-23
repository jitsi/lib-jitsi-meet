/* global __filename */

import { getLogger } from 'jitsi-meet-logger';
import * as ConnectionQualityEvents
    from '../../service/connectivity/ConnectionQualityEvents';
import * as ConferenceEvents from '../../JitsiConferenceEvents';
import * as MediaType from '../../service/RTC/MediaType';
import RTCBrowserType from '../RTC/RTCBrowserType';
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
     * Calculates an average and submit the report to the analytics module.
     * @param {boolean} isP2P indicates if the report is to be submitted for
     * the P2P connection (when conference is currently in the P2P mode). This
     * will add 'p2p.' prefix to the name of the event. All averages should be
     * cleared when the conference switches, between P2P and JVB modes.
     */
    report(isP2P) {
        Statistics.analytics.sendEvent(
            `${isP2P ? 'p2p.' : ''}${this.name}`,
            { value: this.calculate() });
    }

    /**
     * Clears all memory of any samples collected, so that new average can be
     * calculated using this instance.
     */
    reset() {
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
     * @param {JitsiConference} conference
     * @param {boolean} isP2P
     * @param {number} n the number of samples, before arithmetic mean is to be
     * calculated and values submitted to the analytics module.
     */
    constructor(conference, isP2P, n) {
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
        this._avgRTT = new AverageStatReport('stat.avg.rtt');

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
        this._conference = conference;

        this._onConnectionStats = (tpc, stats) => {
            if (this.isP2P === tpc.isP2P) {
                this._calculateAvgStats(stats);
            }
        };
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

        if (RTCBrowserType.supportsRTTStatistics()) {
            if (data.transport && data.transport.length) {
                this._avgRTT.addNext(data.transport[0].rtt);
            }
        }

        this._sampleIdx += 1;

        if (this._sampleIdx >= this._n) {
            if (RTCBrowserType.supportsRTTStatistics()) {
                this._avgRTT.report(this.isP2P);

                // Report end to end RTT only for JVB
                if (!this.isP2P) {
                    const avgRemoteRTT = this._calculateAvgRemoteRTT();
                    const avgLocalRTT = this._avgRTT.calculate();

                    if (!isNaN(avgLocalRTT) && !isNaN(avgRemoteRTT)) {
                        Statistics.analytics.sendEvent(
                            'stat.avg.end2endrtt',
                            { value: avgLocalRTT + avgRemoteRTT });
                    }
                }
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
            rttAvg = new AverageStatReport(`${id}.stat.rtt`);
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
        this._conference.statistics.removeConnectionStatsListener(
            this._onConnectionStats);
        if (!this.isP2P) {
            this._conference.off(
                ConnectionQualityEvents.REMOTE_STATS_UPDATED,
                this._onRemoteStatsUpdated);
            this._conference.off(
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
         * @type {AverageStatReport}
         * @private
         */
        this._avgAudioBitrateUp
            = new AverageStatReport('stat.avg.bitrate.audio.upload');

        /**
         * Average audio download bitrate
         * @type {AverageStatReport}
         * @private
         */
        this._avgAudioBitrateDown
            = new AverageStatReport('stat.avg.bitrate.audio.download');

        /**
         * Average video upload bitrate
         * @type {AverageStatReport}
         * @private
         */
        this._avgVideoBitrateUp
            = new AverageStatReport('stat.avg.bitrate.video.upload');

        /**
         * Average video download bitrate
         * @type {AverageStatReport}
         * @private
         */
        this._avgVideoBitrateDown
            = new AverageStatReport('stat.avg.bitrate.video.download');

        /**
         * Average upload bandwidth
         * @type {AverageStatReport}
         * @private
         */
        this._avgBandwidthUp
            = new AverageStatReport('stat.avg.bandwidth.upload');

        /**
         * Average download bandwidth
         * @type {AverageStatReport}
         * @private
         */
        this._avgBandwidthDown
            = new AverageStatReport('stat.avg.bandwidth.download');

        /**
         * Average total packet loss
         * @type {AverageStatReport}
         * @private
         */
        this._avgPacketLossTotal
            = new AverageStatReport('stat.avg.packetloss.total');

        /**
         * Average upload packet loss
         * @type {AverageStatReport}
         * @private
         */
        this._avgPacketLossUp
            = new AverageStatReport('stat.avg.packetloss.upload');

        /**
         * Average download packet loss
         * @type {AverageStatReport}
         * @private
         */
        this._avgPacketLossDown
            = new AverageStatReport('stat.avg.packetloss.download');

        /**
         * Average FPS for remote videos
         * @type {AverageStatReport}
         * @private
         */
        this._avgRemoteFPS = new AverageStatReport('stat.avg.framerate.remote');

        /**
         * Average FPS for remote screen streaming videos (reported only if not
         * a <tt>NaN</tt>).
         * @type {AverageStatReport}
         * @private
         */
        this._avgRemoteScreenFPS
            = new AverageStatReport('stat.avg.framerate.screen.remote');

        /**
         * Average FPS for local video (camera)
         * @type {AverageStatReport}
         * @private
         */
        this._avgLocalFPS = new AverageStatReport('stat.avg.framerate.local');

        /**
         * Average FPS for local screen streaming video (reported only if not
         * a <tt>NaN</tt>).
         * @type {AverageStatReport}
         * @private
         */
        this._avgLocalScreenFPS
            = new AverageStatReport('stat.avg.framerate.screen.local');

        /**
         * Average connection quality as defined by
         * the {@link ConnectionQuality} module.
         * @type {AverageStatReport}
         * @private
         */
        this._avgCQ = new AverageStatReport('stat.avg.cq');

        this._onLocalStatsUpdated = data => this._calculateAvgStats(data);
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

        this.jvbStatsMonitor
            = new ConnectionAvgStats(conference, false /* JVB */, n);

        this.p2pStatsMonitor
            = new ConnectionAvgStats(conference, true /* P2P */, n);
    }

    /**
     * Processes next batch of stats reported on
     * {@link ConnectionQualityEvents.LOCAL_STATS_UPDATED}.
     * @param {go figure} data
     * @private
     */
    _calculateAvgStats(data) {

        const isP2P = this._conference.isP2PActive();
        const peerCount = this._conference.getParticipants().length;

        if (!isP2P && peerCount < 1) {

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

        if (!data) {
            logger.error('No stats');

            return;
        }

        const bitrate = data.bitrate;
        const bandwidth = data.bandwidth;
        const packetLoss = data.packetLoss;
        const frameRate = data.framerate;

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
        }

        this._avgAudioBitrateUp.addNext(bitrate.audio.upload);
        this._avgAudioBitrateDown.addNext(bitrate.audio.download);

        this._avgVideoBitrateUp.addNext(bitrate.video.upload);
        this._avgVideoBitrateDown.addNext(bitrate.video.download);

        if (RTCBrowserType.supportsBandwidthStatistics()) {
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

        this._sampleIdx += 1;

        if (this._sampleIdx >= this._n) {
            this._avgAudioBitrateUp.report(isP2P);
            this._avgAudioBitrateDown.report(isP2P);

            this._avgVideoBitrateUp.report(isP2P);
            this._avgVideoBitrateDown.report(isP2P);

            if (RTCBrowserType.supportsBandwidthStatistics()) {
                this._avgBandwidthUp.report(isP2P);
                this._avgBandwidthDown.report(isP2P);
            }
            this._avgPacketLossUp.report(isP2P);
            this._avgPacketLossDown.report(isP2P);
            this._avgPacketLossTotal.report(isP2P);

            this._avgRemoteFPS.report(isP2P);
            if (!isNaN(this._avgRemoteScreenFPS.calculate())) {
                this._avgRemoteScreenFPS.report(isP2P);
            }
            this._avgLocalFPS.report(isP2P);
            if (!isNaN(this._avgLocalScreenFPS.calculate())) {
                this._avgLocalScreenFPS.report(isP2P);
            }

            this._avgCQ.report(isP2P);

            this._resetAvgStats();
        }
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
        this.jvbStatsMonitor.dispose();
        this.p2pStatsMonitor.dispose();
    }
}
