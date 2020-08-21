import { getLogger } from 'jitsi-meet-logger';
import { $iq, Strophe } from 'strophe.js';

import GlobalOnErrorHandler from '../util/GlobalOnErrorHandler';

import ConnectionPlugin from './ConnectionPlugin';


const logger = getLogger(__filename);

/**
 * Ping every 10 sec
 */
const PING_INTERVAL = 10000;

/**
 * Ping timeout error after 5 sec of waiting.
 */
const PING_TIMEOUT = 5000;

/**
 * How many ping failures will be tolerated before the WebSocket connection is killed.
 * The worst case scenario in case of ping timing out without a response is (25 seconds at the time of this writing):
 * PING_THRESHOLD * PING_INTERVAL + PING_TIMEOUT
 */
const PING_THRESHOLD = 2;

/**
 * The number of timestamps of send pings to keep.
 * The current value is 2 minutes.
 * @type {number} number of timestamps.
 */
const PING_TIMESTAMPS_TO_KEEP = 120000 / PING_INTERVAL;

/**
 * XEP-0199 ping plugin.
 *
 * Registers "urn:xmpp:ping" namespace under Strophe.NS.PING.
 */
export default class PingConnectionPlugin extends ConnectionPlugin {
    /**
     * Contructs new object
     * @param {Object} options
     * @param {Function} options.onPingThresholdExceeded - Callback called when ping fails too many times (controlled
     * by the {@link PING_THRESHOLD} constant).
     * @constructor
     */
    constructor({ onPingThresholdExceeded }) {
        super();
        this.failedPings = 0;
        this.pingExecIntervals = new Array(PING_TIMESTAMPS_TO_KEEP);
        this._onPingThresholdExceeded = onPingThresholdExceeded;
    }

    /**
     * Initializes the plugin. Method called by Strophe.
     * @param connection Strophe connection instance.
     */
    init(connection) {
        super.init(connection);
        Strophe.addNamespace('PING', 'urn:xmpp:ping');
    }

    /* eslint-disable max-params */

    /**
     * Sends "ping" to given <tt>jid</tt>
     * @param jid the JID to which ping request will be sent.
     * @param success callback called on success.
     * @param error callback called on error.
     * @param timeout ms how long are we going to wait for the response. On
     * timeout <tt>error<//t> callback is called with undefined error argument.
     */
    ping(jid, success, error, timeout) {
        this._addPingExecutionTimestamp();

        const iq = $iq({
            type: 'get',
            to: jid
        });

        iq.c('ping', { xmlns: Strophe.NS.PING });
        this.connection.sendIQ2(iq, { timeout })
            .then(success, error);
    }

    /* eslint-enable max-params */

    /**
     * Starts to send ping in given interval to specified remote JID.
     * This plugin supports only one such task and <tt>stopInterval</tt>
     * must be called before starting a new one.
     * @param remoteJid remote JID to which ping requests will be sent to.
     * @param interval task interval in ms.
     */
    startInterval(remoteJid, interval = PING_INTERVAL) {
        clearInterval(this.intervalId);
        this.intervalId = window.setInterval(() => {
            this.ping(remoteJid, () => {
                this.failedPings = 0;
            }, error => {
                this.failedPings += 1;
                const errmsg = `Ping ${error ? 'error' : 'timeout'}`;

                if (this.failedPings >= PING_THRESHOLD) {
                    GlobalOnErrorHandler.callErrorHandler(new Error(errmsg));
                    logger.error(errmsg, error);
                    this._onPingThresholdExceeded && this._onPingThresholdExceeded();
                } else {
                    logger.warn(errmsg, error);
                }
            }, PING_TIMEOUT);
        }, interval);
        logger.info(`XMPP pings will be sent every ${interval} ms`);
    }

    /**
     * Stops current "ping"  interval task.
     */
    stopInterval() {
        if (this.intervalId) {
            window.clearInterval(this.intervalId);
            this.intervalId = null;
            this.failedPings = 0;
            logger.info('Ping interval cleared');
        }
    }

    /**
     * Adds the current time to the array of send ping timestamps.
     * @private
     */
    _addPingExecutionTimestamp() {
        this.pingExecIntervals.push(new Date().getTime());

        // keep array length to PING_TIMESTAMPS_TO_KEEP
        if (this.pingExecIntervals.length > PING_TIMESTAMPS_TO_KEEP) {
            this.pingExecIntervals.shift();
        }
    }

    /**
     * Returns the maximum time between the recent sent pings, if there is a
     * big value it means the computer was inactive for some time(suspended).
     * Checks the maximum gap between sending pings, considering and the
     * current time. Trying to detect computer inactivity (sleep).
     *
     * @returns {int} the time ping was suspended, if it was not 0 is returned.
     */
    getPingSuspendTime() {
        const pingIntervals = this.pingExecIntervals.slice();

        // we need current time, as if ping was sent now
        // if computer sleeps we will get correct interval after next
        // scheduled ping, bet we sometimes need that interval before waiting
        // for the next ping, on closing the connection on error.
        pingIntervals.push(new Date().getTime());

        let maxInterval = 0;
        let previousTS = pingIntervals[0];

        pingIntervals.forEach(e => {
            const currentInterval = e - previousTS;

            if (currentInterval > maxInterval) {
                maxInterval = currentInterval;
            }

            previousTS = e;
        });

        // remove the interval between the ping sent
        // this way in normal execution there is no suspend and the return
        // will be 0 or close to 0.
        maxInterval -= PING_INTERVAL;

        // make sure we do not return less than 0
        return Math.max(maxInterval, 0);
    }
}
