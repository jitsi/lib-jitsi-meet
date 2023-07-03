import Logger from '@jitsi/logger';
import rtcstatsInit from '@jitsi/rtcstats/rtcstats';
import traceInit from '@jitsi/rtcstats/trace-ws';
import EventEmitter from 'events';

const logger = Logger.getLogger(__filename);

const RTC_STATS_WC_DISCONNECTED = 'rtcstats_ws_disconnected';
const RTC_STATS_PC_EVENT = 'rtstats_pc_event';

/**
 * Filter out RTCPeerConnection that are created by callstats.io.
 *
 * @param {*} config - Config object sent to the PC c'tor.
 * @returns {boolean}
 */
function connectionFilter(config) {
    if (config?.iceServers[0] && config.iceServers[0].urls) {
        for (const iceUrl of config.iceServers[0].urls) {
            if (iceUrl.includes('callstats.io')) {
                return true;
            }
        }
    }
}

/**
 * Class the controls the rtcstats node module.
 */
class RtcStats {
    initialized = false;
    isPeerConnectionWrapped = false;
    trace = null;
    setTrace;
    traceConfigured = new Promise(r => {
        this.setTrace = r;
    });
    meetingFqn = null;
    setMeetingF;
    meetingFqnSet = new Promise(r => {
        this.setMeetingF = r;
    });
    events = new EventEmitter();

    /**
     * Initializes the underlying rtcstats node moduke.
     */
    init(options) {
        const { rtcstatsUseLibJitsi } = options.analytics;

        if (!rtcstatsUseLibJitsi) {
            logger.info('RtcStats configured to not use in lib-jitsi-meet');

            return;
        }
        if (this.initialized) {
            return;
        }

        this.meetingFqnSet.then(() => {
            logger.info(`meetingFqn is set to ${this.meetingFqn}, now initializing rtcstats`);

            const { rtcstatsEndpoint, rtcstatsUseLegacy, rtcstatsPollInterval, rtcstatsSendSdp }
                = options.analytics;

            const traceOptions = {
                endpoint: rtcstatsEndpoint,
                meetingFqn: this.meetingFqn,
                onCloseCallback: this.handleTraceWSClose.bind(this),
                useLegacy: rtcstatsUseLegacy
            };

            this.trace = traceInit(traceOptions);

            if (!this.isPeerConnectionWrapped) {
                const rtcstatsOptions = {
                    connectionFilter,
                    pollInterval: rtcstatsPollInterval,
                    useLegacy: rtcstatsUseLegacy,
                    sendSdp: rtcstatsSendSdp,
                    eventCallback: this.handleRtcStatsEvent.bind(this)
                };

                rtcstatsInit(this.trace, rtcstatsOptions);
                this.isPeerConnectionWrapped = true;
            }

            this.setTrace(this.trace);

            this.initialized = true;
        });
    }

    /**
     * De-initializes the module.
     */
    deinit() {
        this.initialized = false;
        this.trace = null;
        this.meetingFqn = null;
    }

    /**
     * Returns the handle to RtcStats tracer.
     *
     * @returns {Promise}
     */
    getTrace() {
        return this.traceConfigured;
    }

    /**
     * Set the meetingFqn value needed for initialzing rtcstats.
     *
     * @param {String} - the meeting fqn.
     * @returns {void}
     */
    setMeetingFqn(fqn) {
        logger.info(`Setting meetingFqn to ${fqn}`);
        this.meetingFqn = fqn;
        this.setMeetingF();
    }

    /**
     * RTCStats client can notify the App of any PeerConnection related events.
     *
     * @param {Object} event - Rtcstats event.
     * @returns {void}
     */
    handleRtcStatsEvent(event) {
        this.events.emit(RTC_STATS_PC_EVENT, event);
    }

    /**
     * Handle WS close.
     *
     * @param {Object} closeEvent - Event sent by ws onclose.
     * @returns {void}
     */
    handleTraceWSClose(closeEvent) {
        logger.warn('RtcStats trace WS closed', closeEvent);
        this.events.emit(RTC_STATS_WC_DISCONNECTED, closeEvent);
    }

}

export default new RtcStats();
