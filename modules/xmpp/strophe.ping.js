import { getLogger } from '@jitsi/logger';
import { $iq, Strophe } from 'strophe.js';

import GlobalOnErrorHandler from '../util/GlobalOnErrorHandler';

import ConnectionPlugin from './ConnectionPlugin';


const logger = getLogger(__filename);

/**
 * Default ping every 10 sec
 */
const PING_DEFAULT_INTERVAL = 10000;

/**
 * Default ping timeout error after 5 sec of waiting.
 */
const PING_DEFAULT_TIMEOUT = 5000;

/**
 * Default value for how many ping failures will be tolerated before the WebSocket connection is killed.
 * The worst case scenario in case of ping timing out without a response is (25 seconds at the time of this writing):
 * PING_THRESHOLD * PING_INTERVAL + PING_TIMEOUT
 */
const PING_DEFAULT_THRESHOLD = 2;

/**
 * XEP-0199 ping plugin.
 *
 * Registers "urn:xmpp:ping" namespace under Strophe.NS.PING.
 */
export default class PingConnectionPlugin extends ConnectionPlugin {
    /**
     * Constructs new object
     * @param {Object} options
     * @param {Function} options.onPingThresholdExceeded - Callback called when ping fails too many times (controlled
     * by the {@link PING_THRESHOLD} constant).
     * @param {Function} options._getTimeSinceLastServerResponse - A function to obtain the last seen
     * response from the server.
     * @param {Object} options.pingOptions - The ping options if any.
     * @constructor
     */
    constructor({ getTimeSinceLastServerResponse, onPingThresholdExceeded, pingOptions = {} }) {
        super();
        this.failedPings = 0;
        this._onPingThresholdExceeded = onPingThresholdExceeded;
        this._getTimeSinceLastServerResponse = getTimeSinceLastServerResponse;

        this.pingInterval = typeof pingOptions.interval === 'number' ? pingOptions.interval : PING_DEFAULT_INTERVAL;
        this.pingTimeout = typeof pingOptions.timeout === 'number' ? pingOptions.timeout : PING_DEFAULT_TIMEOUT;
        this.pingThreshold = typeof pingOptions.threshold === 'number'
            ? pingOptions.threshold : PING_DEFAULT_THRESHOLD;

        // The number of timestamps of send pings to keep.
        // The current value is 2 minutes.
        this.pingTimestampsToKeep = Math.round(120000 / this.pingInterval);
        this.pingExecIntervals = new Array(this.pingTimestampsToKeep);
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
     */
    startInterval(remoteJid) {
        clearInterval(this.intervalId);
        this.intervalId = window.setInterval(() => {

            // when there were some server responses in the interval since the last time we checked (_lastServerCheck)
            // let's skip the ping

            const now = Date.now();

            if (this._getTimeSinceLastServerResponse() < now - this._lastServerCheck) {
                // do this just to keep in sync the intervals so we can detect suspended device
                this._addPingExecutionTimestamp();

                this._lastServerCheck = now;
                this.failedPings = 0;

                return;
            }

            this.ping(remoteJid, () => {
                // server response is measured on raw input and ping response time is measured after all the xmpp
                // processing is done in js, so there can be some misalignment when we do the check above.
                // That's why we store the last time we got the response
                this._lastServerCheck = this._getTimeSinceLastServerResponse() + Date.now();

                this.failedPings = 0;
            }, error => {
                this.failedPings += 1;
                const errmsg = `Ping ${error ? 'error' : 'timeout'}`;

                if (this.failedPings >= this.pingThreshold) {
                    GlobalOnErrorHandler.callErrorHandler(new Error(errmsg));
                    logger.error(errmsg, error);
                    this._onPingThresholdExceeded && this._onPingThresholdExceeded();
                } else {
                    logger.warn(errmsg, error);
                }
            }, this.pingTimeout);
        }, this.pingInterval);
        logger.info(`XMPP pings will be sent every ${this.pingInterval} ms`);
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
        if (this.pingExecIntervals.length > this.pingTimestampsToKeep) {
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
        maxInterval -= this.pingInterval;

        // make sure we do not return less than 0
        return Math.max(maxInterval, 0);
    }
}
