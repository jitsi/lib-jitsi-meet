import browser from '../browser';
import { createRttByRegionEvent }
    from '../../service/statistics/AnalyticsEvents';
import { getLogger } from 'jitsi-meet-logger';
import RTCUtils from '../RTC/RTCUtils';
import Statistics from '../statistics/statistics';

const logger = getLogger(__filename);

/**
 * The options to pass to createOffer (we need to offer to receive *something*
 * for the PC to gather candidates.
 */
const offerOptions = {
    offerToReceiveAudio: 1,
    offerToReceiveVideo: 0
};


/**
 * The interval at which the webrtc engine sends STUN keep alive requests.
 * @type {number}
 */
const stunKeepAliveIntervalMs = 10000;

/**
 * Wraps a PeerConnection with one specific STUN server and measures the RTT
 * to the STUN server.
 */
class PCMonitor {
    /* eslint-disable max-params */
    /**
     *
     * @param {String} region - The region of the STUN server.
     * @param {String} address - The address of the STUN server.
     * @param {number} getStatsIntervalMs how often to call getStats.
     * @param {number} delay the delay after which the PeerConnection will be
     * started (that is, createOffer and setLocalDescription will be invoked).
     *
     */
    constructor(region, address, getStatsIntervalMs, delay) {
        /* eslint-disable max-params */
        this.region = region;
        this.getStatsIntervalMs = getStatsIntervalMs;
        this.getStatsInterval = null;

        // What we consider the current RTT. It is Math.min(this.rtts).
        this.rtt = Infinity;

        // The RTT measurements we've made from the latest getStats() calls.
        this.rtts = [];

        const iceServers = [ { 'url': `stun:${address}` } ];

        this.pc = new RTCUtils.RTCPeerConnectionType(
            {
                'iceServers': iceServers
            });

        // Maps a key consisting of the IP address, port and priority of a
        // candidate to some state related to it. If we have more than one
        // network interface we will might multiple srflx candidates and this
        // helps to distinguish between then.
        this.candidates = {};

        this.stopped = false;

        this.start = this.start.bind(this);
        this.stop = this.stop.bind(this);
        this.startStatsInterval = this.startStatsInterval.bind(this);
        this.handleCandidateRtt = this.handleCandidateRtt.bind(this);

        window.setTimeout(this.start, delay);
    }

    /**
     * Starts this PCMonitor. That is, invokes createOffer and
     * setLocalDescription on the PeerConnection and starts an interval which
     * calls getStats.
     */
    start() {
        if (this.stopped) {
            return;
        }

        this.pc.createOffer(offerOptions).then(offer => {
            this.pc.setLocalDescription(
                offer,
                () => {
                    logger.info(
                        `setLocalDescription success for ${this.region}`);
                    this.startStatsInterval();
                },
                error => {
                    logger.warn(
                        `setLocalDescription failed for ${this.region}: ${
                            error}`);
                }
            );
        });
    }

    /**
     * Starts an interval which invokes getStats on the PeerConnection and
     * measures the RTTs for the different candidates.
     */
    startStatsInterval() {
        this.getStatsInterval = window.setInterval(
            () => {
                // Note that the data that we use to measure the RTT is only
                // available in the legacy (callback based) getStats API.
                this.pc.getStats(stats => {
                    const results = stats.result();

                    for (let i = 0; i < results.length; ++i) {
                        const res = results[i];
                        const rttTotal
                            = Number(res.stat('stunKeepaliveRttTotal'));

                        // We recognize the results that we care for (local
                        // candidates of type srflx) by the existance of the
                        // stunKeepaliveRttTotal stat.
                        if (rttTotal > 0) {
                            const candidateKey
                                = `${res.stat('ipAddress')}_${
                                    res.stat('portNumber')}_${
                                    res.stat('priority')}`;

                            this.handleCandidateRtt(
                                candidateKey,
                                rttTotal,
                                Number(
                                    res.stat('stunKeepaliveResponsesReceived')),
                                Number(
                                    res.stat('stunKeepaliveRequestsSent')));
                        }
                    }

                    // After we've measured the RTT for all candidates we,
                    // update the state of the PC with the shortest one.
                    let rtt = Infinity;

                    for (const key in this.candidates) {
                        if (this.candidates.hasOwnProperty(key)
                            && this.candidates[key].rtt > 0) {
                            rtt = Math.min(rtt, this.candidates[key].rtt);
                        }
                    }

                    // We keep the last 6 measured RTTs and choose the shortest
                    // one to export to analytics. This is because we often see
                    // failures get a real measurement which end up as Infinity.
                    this.rtts.push(rtt);
                    if (this.rtts.length > 6) {
                        this.rtts = this.rtts.splice(1, 7);
                    }
                    this.rtt = Math.min(...this.rtts);
                });
            },
            this.getStatsIntervalMs
        );
    }

    /* eslint-disable max-params */
    /**
     * Updates the RTT for a candidate identified by "key" based on the values
     * from getStats() and the previously saved state (i.e. old values).
     *
     * @param {String} key the ID for the candidate
     * @param {number} rttTotal the value of the 'stunKeepaliveRttTotal' just
     * measured.
     * @param {number} responsesReceived the value of the
     * 'stunKeepaliveResponsesReceived' stat just measured.
     * @param {number} requestsSent the value of the 'stunKeepaliveRequestsSent'
     * stat just measured.
     */
    handleCandidateRtt(key, rttTotal, responsesReceived, requestsSent) {
        /* eslist-enable max-params */
        if (!this.candidates[key]) {
            this.candidates[key] = {
                rttTotal: 0,
                responsesReceived: 0,
                requestsSent: 0,
                rtt: NaN
            };
        }

        const rttTotalDiff = rttTotal - this.candidates[key].rttTotal;
        const responsesReceivedDiff
            = responsesReceived - this.candidates[key].responsesReceived;

        // We observe that when the difference between the number of requests
        // and responses has grown (i.q. when the value below is positive), the
        // the RTT measurements are incorrect (too low). For this reason we
        // ignore these measurement (setting rtt=NaN), but update our state.
        const requestsResponsesDiff
            = (requestsSent - responsesReceived)
            - (this.candidates[key].requestsSent
                - this.candidates[key].responsesReceived);
        let rtt = NaN;

        if (responsesReceivedDiff > 0 && requestsResponsesDiff === 0) {
            rtt = rttTotalDiff / responsesReceivedDiff;
        }

        this.candidates[key].rttTotal = rttTotal;
        this.candidates[key].responsesReceived = responsesReceived;
        this.candidates[key].requestsSent = requestsSent;
        this.candidates[key].rtt = rtt;
    }


    /**
     * Stops this PCMonitor, clearing its intervals and stopping the
     * PeerConnection.
     */
    stop() {
        if (this.getStatsInterval) {
            window.clearInterval(this.getStatsInterval);
        }

        this.pc.close();

        this.stopped = true;
    }
}

/**
 * A class which monitors the round-trip time (RTT) to a set of STUN servers.
 * The measured RTTs are sent as analytics events. It uses a separate
 * PeerConnection (represented as a PCMonitor) for each STUN server.
 */
export default class RttMonitor {
    /**
     * Initializes a new RttMonitor.
     * @param {Object} config the object holding the configuration.
     */
    constructor(config) {
        if (!config || !config.enabled
            || !browser.supportsLocalCandidateRttStatistics()) {
            return;
        }

        // Maps a region to the PCMonitor instance for that region.
        this.pcMonitors = {};

        this.startPCMonitors = this.startPCMonitors.bind(this);
        this.sendAnalytics = this.sendAnalytics.bind(this);
        this.stop = this.stop.bind(this);

        this.analyticsInterval = null;
        this.stopped = false;

        const initialDelay = config.initialDelay || 60000;


        logger.info(
            `Starting RTT monitor with an initial delay of ${initialDelay}`);


        window.setTimeout(
            () => this.startPCMonitors(config),
            initialDelay);
    }

    /**
     * Starts the PCMonitors according to the configuration.
     */
    startPCMonitors(config) {
        if (!config.stunServers) {
            logger.warn('No stun servers configured.');

            return;
        }

        if (this.stopped) {
            return;
        }

        const getStatsIntervalMs
            = config.getStatsInterval || stunKeepAliveIntervalMs;
        const analyticsIntervalMs
            = config.analyticsInterval || getStatsIntervalMs;
        const count = Object.keys(config.stunServers).length;
        const offset = getStatsIntervalMs / count;

        // We delay the initialization of each PC so that they are uniformly
        // distributed across the getStatsIntervalMs.
        let i = 0;

        for (const region in config.stunServers) {
            if (config.stunServers.hasOwnProperty(region)) {
                const address = config.stunServers[region];

                this.pcMonitors[region]
                    = new PCMonitor(
                        region,
                        address,
                        getStatsIntervalMs,
                        offset * i);
                i++;
            }
        }

        window.setTimeout(
            () => {
                if (!this.stopped) {
                    this.analyticsInterval
                        = window.setInterval(
                        this.sendAnalytics, analyticsIntervalMs);
                }
            },
            1000);
    }

    /**
     * Sends an analytics event with the measured RTT to each region/STUN
     * server.
     */
    sendAnalytics() {
        const rtts = {};

        for (const region in this.pcMonitors) {
            if (this.pcMonitors.hasOwnProperty(region)) {
                const rtt = this.pcMonitors[region].rtt;

                if (!isNaN(rtt) && rtt !== Infinity) {
                    rtts[region.replace('-', '_')] = rtt;
                }
            }
        }

        if (rtts) {
            Statistics.sendAnalytics(createRttByRegionEvent(rtts));
        }
    }

    /**
     * Stops this RttMonitor, clearing all intervals and closing all
     * PeerConnections.
     */
    stop() {
        logger.info('Stopping RttMonitor.');
        this.stopped = true;
        for (const region in this.pcMonitors) {
            if (this.pcMonitors.hasOwnProperty(region)) {
                this.pcMonitors[region].stop();
            }
        }
        this.pcMonitors = {};

        if (this.analyticsInterval) {
            window.clearInterval(this.analyticsInterval);
        }
    }
}
