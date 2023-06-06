import Logger from '@jitsi/logger';
import rtcstatsInit from '@jitsi/rtcstats/rtcstats';
import traceInit from '@jitsi/rtcstats/trace-ws';

const logger = Logger.getLogger(__filename);

/**
 * Filter out RTCPeerConnection that are created by callstats.io.
 *
 * @param {*} config - Config object sent to the PC c'tor.
 * @returns {boolean}
 */
function connectionFilter(config) {
    if (config?.iceServers[0] && config.iceServers[0].urls) {
        for (const iceUrl of config.iceServers[0].urls) {
            if (iceUrl.indexOf('callstats.io') >= 0) {
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
    trace = null;
    eventCallback = null;
    closeCallback = null;
    setTrace;
    traceConfigured = new Promise(r => {
        this.setTrace = r;
    });
    meetingFqn = null;
    setMeetingF;
    meetingFqnSet = new Promise(r => {
        this.setMeetingF = r;
    });

    /**
     * Initializes the underlying rtcstats node moduke.
     */
    init(options) {
        const { rtcstatsUseLibJitsi } = options.analytics;

        if (rtcstatsUseLibJitsi) {
            if (!this.initialized) {
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

                    const rtcstatsOptions = {
                        connectionFilter,
                        pollInterval: rtcstatsPollInterval,
                        useLegacy: rtcstatsUseLegacy,
                        sendSdp: rtcstatsSendSdp,
                        eventCallback: this.handleRtcStatsEvent.bind(this)
                    };

                    this.trace = traceInit(traceOptions);

                    rtcstatsInit(this.trace, rtcstatsOptions);

                    this.setTrace(this.trace);

                    this.initialized = true;
                });
            }
        } else {
            logger.info('RtcStats configured to not use in lib-jitsi-meet');
        }
    }

    /**
     * Returns the handle to RtcStats tracer.
     *
     * @returns {Promise}
     */
    getTrace() {
        return this.traceConfigured.then(t => t);
    }

    /**
     * Set the meetingFqn value needed for initialzing rtcstats.
     *
     * @param {String} - the meeting fqn.
     * @returns {void}
     */
    setMeetingFqn(config) {
        const { meetingName, eventCallback, onCloseCallback } = config;

        this.eventCallback = eventCallback;
        this.closeCallback = onCloseCallback;

        logger.info(`Setting meetingFqn to ${meetingName}`);
        this.meetingFqn = meetingName;
        this.setMeetingF();
    }

    /**
     * RTCStats client can notify the App of any PeerConnection related events.
     *
     * @param {Object} event - Rtcstats event.
     * @returns {void}
     */
    handleRtcStatsEvent(event) {
        logger.info(`RtcStats received event ${JSON.stringify(event)}`);
        if (typeof this.eventCallback === 'function') {
            this.eventCallback(event);
        }
    }

    /**
     * Handle WS close.
     *
     * @param {Object} closeEvent - Event sent by ws onclose.
     * @returns {void}
     */
    handleTraceWSClose(closeEvent) {
        logger.warn('RtcStats trace WS closed', closeEvent);
        if (typeof this.closeCallback === 'function') {
            this.closeCallback(closeEvent);
        }
    }

}

export default new RtcStats();
