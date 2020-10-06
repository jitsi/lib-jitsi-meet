import { getLogger } from 'jitsi-meet-logger';

import {
    default as NetworkInfo,
    NETWORK_INFO_EVENT
} from '../connectivity/NetworkInfo';
import { getJitterDelay } from '../util/Retry';

const logger = getLogger(__filename);

/**
 * The class contains the logic for triggering connection resume via XEP-0198 stream management.
 * It does two things, the first one is it tracks the internet online/offline status and it makes sure that
 * the reconnect is attempted only while online. The seconds thing is that it tracks the retry attempts and extends
 * the retry interval using the full jitter pattern.
 */
export default class ResumeTask {
    /**
     * Initializes new {@code RetryTask}.
     * @param {Strophe.Connection} stropheConnection - The Strophe connection instance.
     */
    constructor(stropheConnection) {
        this._stropheConn = stropheConnection;

        /**
         * The counter increased before each resume retry attempt, used to calculate exponential backoff.
         * @type {number}
         * @private
         */
        this._resumeRetryN = 0;

        this._retryDelay = undefined;
    }

    /**
     * @returns {number|undefined} - How much the app will wait before trying to resume the XMPP connection. When
     * 'undefined' it means that no resume task was not scheduled.
     */
    get retryDelay() {
        return this._retryDelay;
    }

    /**
     * Called by {@link XmppConnection} when the connection drops and it's a signal it wants to schedule a reconnect.
     *
     * @returns {void}
     */
    schedule() {
        this._cancelResume();

        this._resumeRetryN += 1;

        this._networkOnlineListener
            = NetworkInfo.addEventListener(
                NETWORK_INFO_EVENT,
                ({ isOnline }) => {
                    if (isOnline) {
                        this._scheduleResume();
                    } else {
                        this._cancelResume();
                    }
                });

        NetworkInfo.isOnline() && this._scheduleResume();
    }

    /**
     * Schedules a delayed timeout which will execute the resume action.
     * @private
     * @returns {void}
     */
    _scheduleResume() {
        if (this._resumeTimeout) {

            // NO-OP
            return;
        }

        // The retry delay will be:
        //   1st retry: 1.5s - 3s
        //   2nd retry: 3s - 9s
        //   3rd and next retry: 4.5s - 27s
        this._resumeRetryN = Math.min(3, this._resumeRetryN);
        this._retryDelay = getJitterDelay(
            /* retry */ this._resumeRetryN,
            /* minDelay */ this._resumeRetryN * 1500,
            3);

        logger.info(`Will try to resume the XMPP connection in ${this.retryDelay}ms`);

        this._resumeTimeout = setTimeout(() => this._resumeConnection(), this.retryDelay);
    }

    /**
     * Cancels the delayed resume task.
     *
     * @private
     * @returns {void}
     */
    _cancelResume() {
        if (this._resumeTimeout) {
            logger.info('Canceling connection resume task');
            clearTimeout(this._resumeTimeout);
            this._resumeTimeout = undefined;
            this._retryDelay = undefined;
        }
    }

    /**
     * Resumes the XMPP connection using the stream management plugin.
     *
     * @private
     * @returns {void}
     */
    _resumeConnection() {
        const { streamManagement } = this._stropheConn;
        const resumeToken = streamManagement.getResumeToken();

        // Things may have changed since when the task was scheduled
        if (!resumeToken) {
            return;
        }

        logger.info('Trying to resume the XMPP connection');

        const url = new URL(this._stropheConn.service);
        let { search } = url;

        // adds previd param only if missing
        if (search.indexOf('previd=') === -1) {
            search += search.indexOf('?') === -1 ? `?previd=${resumeToken}` : `&previd=${resumeToken}`;
        }

        url.search = search;

        this._stropheConn.service = url.toString();

        streamManagement.resume();
    }

    /**
     * Cancels the retry task. It's called by {@link XmppConnection} when it's no longer interested in reconnecting for
     * example when the disconnect method is called.
     *
     * @returns {void}
     */
    cancel() {
        this._cancelResume();
        this._resumeRetryN = 0;
        if (this._networkOnlineListener) {
            this._networkOnlineListener();
            this._networkOnlineListener = null;
        }
    }
}
