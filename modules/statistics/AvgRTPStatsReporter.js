/* global __filename */

import { getLogger } from 'jitsi-meet-logger';
import * as ConnectionQualityEvents
    from '../../service/connectivity/ConnectionQualityEvents';
import * as ConferenceEvents from '../../JitsiConferenceEvents';
import Statistics from './statistics';

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
                `${this.name} - invalid value for idx: ${this.count}`);

            return;
        }
        this.sum += nextValue;
        this.count += 1;
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
         * Average upload bitrate
         * @type {AverageStatReport}
         * @private
         */
        this._avgBitrateUp = new AverageStatReport('stat.avg.bitrate.upload');

        /**
         * Average download bitrate
         * @type {AverageStatReport}
         * @private
         */
        this._avgBitrateDown
            = new AverageStatReport('stat.avg.bitrate.download');

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
         * Average FPS for local video
         * @type {AverageStatReport}
         * @private
         */
        this._avgLocalFPS = new AverageStatReport('stat.avg.framerate.local');

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
        };
        conference.on(
            ConferenceEvents.P2P_STATUS,
            this._onP2PStatusChanged);
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

        this._avgBitrateUp.addNext(bitrate.upload);
        this._avgBitrateDown.addNext(bitrate.download);
        this._avgBandwidthUp.addNext(bandwidth.upload);
        this._avgBandwidthDown.addNext(bandwidth.download);
        this._avgPacketLossUp.addNext(packetLoss.upload);
        this._avgPacketLossDown.addNext(packetLoss.download);
        this._avgPacketLossTotal.addNext(packetLoss.total);
        this._avgCQ.addNext(data.connectionQuality);

        if (frameRate) {
            this._avgRemoteFPS.addNext(
                this._calculateAvgVideoFps(frameRate, false /* remote */));
            this._avgLocalFPS.addNext(
                this._calculateAvgVideoFps(frameRate, true /* local */));
        }

        this._sampleIdx += 1;

        if (this._sampleIdx >= this._n) {
            this._avgBitrateUp.report(isP2P);
            this._avgBitrateDown.report(isP2P);
            this._avgBandwidthUp.report(isP2P);
            this._avgBandwidthDown.report(isP2P);
            this._avgPacketLossUp.report(isP2P);
            this._avgPacketLossDown.report(isP2P);
            this._avgPacketLossTotal.report(isP2P);
            this._avgRemoteFPS.report(isP2P);
            this._avgLocalFPS.report(isP2P);
            this._avgCQ.report(isP2P);

            this._resetAvgStats();
        }
    }

    /**
     * Calculates average FPS for the report
     * @param {go figure} frameRate
     * @param {boolean} isLocal if the average is to be calculated for the local
     * video or <tt>false</tt> if for remote videos.
     * @return {number|NaN} average FPS or <tt>NaN</tt> if there are no samples.
     * @private
     */
    _calculateAvgVideoFps(frameRate, isLocal) {
        let peerCount = 0;
        let subFrameAvg = 0;
        const myID = this._conference.myUserId();

        for (const peerID of Object.keys(frameRate)) {
            if (isLocal ? peerID === myID : peerID !== myID) {
                const videos = frameRate[peerID];
                const ssrcs = Object.keys(videos);

                if (ssrcs.length) {
                    let peerAvg = 0;

                    for (const ssrc of ssrcs) {
                        peerAvg += parseInt(videos[ssrc], 10);
                    }

                    peerAvg /= ssrcs.length;

                    subFrameAvg += peerAvg;
                    peerCount += 1;
                }
            }
        }

        return subFrameAvg / peerCount;
    }

    /**
     * Reset cache of all averages and {@link _sampleIdx}.
     * @private
     */
    _resetAvgStats() {
        this._avgBitrateUp.reset();
        this._avgBitrateDown.reset();
        this._avgBandwidthUp.reset();
        this._avgBandwidthDown.reset();
        this._avgPacketLossUp.reset();
        this._avgPacketLossDown.reset();
        this._avgRemoteFPS.reset();
        this._avgLocalFPS.reset();
        this._avgCQ.reset();
        this._sampleIdx = 0;
    }

    /**
     * Unregisters all event listeners and stops working.
     */
    dispose() {
        if (this._onP2PStatusChanged) {
            this._conference.off(
                ConferenceEvents.P2P_STATUS,
                this._onP2PStatusChanged);
        }
        if (this._onLocalStatsUpdated) {
            this._conference.off(
                ConnectionQualityEvents.LOCAL_STATS_UPDATED,
                this._onLocalStatsUpdated);
        }
    }
}
