import { getLogger } from '@jitsi/logger';
import Strophe from 'strophe.js';

import {
    NETWORK_INFO_EVENT,
    default as NetworkInfo
} from '../connectivity/NetworkInfo';
import { getJitterDelay } from '../util/Retry';

const logger = getLogger('xmpp:ResumeTask');


export interface INetworkInfoEvent {
    isOnline: boolean;
}

/**
 * The class contains the logic for triggering connection resume via XEP-0198 stream management.
 * It does two things, the first one is it tracks the internet online/offline status and it makes sure that
 * the reconnect is attempted only while online. The seconds thing is that it tracks the retry attempts and extends
 * the retry interval using the full jitter pattern.
 */
export default class ResumeTask {
    private _stropheConn: Strophe.Connection;
    private _resumeRetryN: number;
    private _retryDelay: Optional<number>;
    private _resumeTimeout: Optional<NodeJS.Timeout>;
    private _networkOnlineListener: Nullable<() => void>;

    /**
     * Initializes new {@code RetryTask}.
     * @param {Strophe.Connection} stropheConnection - The Strophe connection instance.
     */
    constructor(stropheConnection: Strophe.Connection) {
        this._stropheConn = stropheConnection;
        this._resumeRetryN = 0;
        this._retryDelay = undefined;
        this._resumeTimeout = undefined;
        this._networkOnlineListener = null;
    }

    /**
     * @returns {number} - The amount of retries.
     */
    get retryCount(): number {
        return this._resumeRetryN;
    }

    /**
     * @returns {number|undefined} - How much the app will wait before trying to resume the XMPP connection. When
     * 'undefined' it means that no resume task was not scheduled.
     */
    get retryDelay(): Optional<number> {
        return this._retryDelay;
    }

    /**
     * Cancels the delayed resume task.
     *
     * @private
     * @returns {void}
     */
    private _cancelResume(): void {
        if (this._resumeTimeout) {
            logger.info('Canceling connection resume task');
            clearTimeout(this._resumeTimeout);
            this._resumeTimeout = undefined;
            this._retryDelay = undefined;
        }
    }

    /**
     * Removes network online listener for the NETWORK_INFO_EVENT event.
     *
     * @private
     * @returns {void}
     */
    private _removeNetworkOnlineListener(): void {
        if (this._networkOnlineListener) {
            this._networkOnlineListener();
            this._networkOnlineListener = null;
        }
    }

    /**
     * Resumes the XMPP connection using the stream management plugin.
     *
     * @private
     * @returns {void}
     */
    private _resumeConnection(): void {
        this._resumeTimeout = undefined;

        const { streamManagement } = this._stropheConn;
        const resumeToken = streamManagement.getResumeToken();

        // Things may have changed since when the task was scheduled
        if (!resumeToken) {
            return;
        }

        logger.info('Trying to resume the XMPP connection');

        const url = new URL(this._stropheConn.service);
        let { search } = url;
        const pattern = /(previd=)([\w-]+)/;
        const oldToken = search.match(pattern);

        // Replace previd if the previd value has changed.
        if (oldToken && oldToken.indexOf(resumeToken) === -1) {
            search = search.replace(pattern, `$1${resumeToken}`);

        // Append previd if it doesn't exist.
        } else if (!oldToken) {
            search += search.indexOf('?') === -1 ? `?previd=${resumeToken}` : `&previd=${resumeToken}`;
        }

        url.search = search;

        this._stropheConn.service = url.toString();

        try {
            streamManagement.resume();
        } catch (e) {
            logger.error('Failed to resume XMPP connection', e);
        }
    }

    /**
     * Schedules a delayed timeout which will execute the resume action.
     * @private
     * @returns {void}
     */
    private _scheduleResume(): void {
        if (this._resumeTimeout) {
            // NO-OP
            return;
        }

        // The retry delay will be:
        //   1st retry: 1.5s - 3s
        //   2nd retry: 3s - 9s
        //   3rd and next retry: 4.5s - 27s
        this._retryDelay = getJitterDelay(
            /* retry */ this._resumeRetryN,
            /* minDelay */ this._resumeRetryN * 1500,
            3
        );

        logger.info(`Will try to resume the XMPP connection in ${this.retryDelay}ms`);

        this._resumeTimeout = setTimeout(() => this._resumeConnection(), this.retryDelay);
    }

    /**
     * Cancels the retry task. It's called by {@link XmppConnection} when it's no longer interested in reconnecting for
     * example when the disconnect method is called.
     *
     * @returns {void}
     */
    cancel(): void {
        this._cancelResume();
        this._removeNetworkOnlineListener();
        this._resumeRetryN = 0;
    }

    /**
     * Called by {@link XmppConnection} when the connection drops and it's a signal it wants to schedule a reconnect.
     *
     * @returns {void}
     */
    schedule(): void {
        this._cancelResume();
        this._removeNetworkOnlineListener();

        this._resumeRetryN += 1;

        this._networkOnlineListener = NetworkInfo.addCancellableListener(
            NETWORK_INFO_EVENT,
            ({ isOnline }: INetworkInfoEvent) => {
                if (isOnline) {
                    this._scheduleResume();
                } else {
                    this._cancelResume();
                }
            }
        ) as () => void;

        NetworkInfo.isOnline() && this._scheduleResume();
    }
}
