/**
 * Strophe logger implementation. Logs from level WARN and above.
 */
import { getLogger } from '@jitsi/logger';
import { Strophe } from 'strophe.js';

import GlobalOnErrorHandler from '../util/GlobalOnErrorHandler';

const logger = getLogger(__filename);

/**
 * This is the last HTTP error status captured from Strophe debug logs.
 * The purpose of storing it is to distinguish between the network and
 * infrastructure reason for connection being dropped (see connectionHandler in
 * xmpp.js). The value will be cleared (-1) if the subsequent request succeeds
 * which means that the failure could be transient.
 *
 * FIXME in the latest Strophe (not released on npm) there is API to handle
 * particular HTTP errors, but there is no way to learn if the subsequent
 * request succeeded in order to tell if the error was one time incident or if
 * it was the reason for dropping the connection by Strophe (the connection is
 * dropped after 5 subsequent failures). Ideally Strophe should provide more
 * details about the reason on why the connection stopped.
 *
 * @type {number}
 */
let lastErrorStatus = -1;

/**
 * A regular expression used to catch Strophe's log message indicating that the
 * last BOSH request was successful. When there is such message seen the
 * {@link lastErrorStatus} will be set back to '-1'.
 * @type {RegExp}
 */
const resetLastErrorStatusRegExpr = /request id \d+.\d+ got 200/;

/**
 * A regular expression used to capture the current value of the BOSH request
 * error status (HTTP error code or '0' or something else).
 * @type {RegExp}
 */
const lastErrorStatusRegExpr
    = /request errored, status: (\d+), number of errors: \d+/;

/**
 *
 */
export default function() {

    Strophe.log = function(level, msg) {
        // Our global handler reports uncaught errors to the stats which may
        // interpret those as partial call failure.
        // Strophe log entry about secondary request timeout does not mean that
        // it's a final failure(the request will be restarted), so we lower it's
        // level here to a warning.
        logger.trace('Strophe', level, msg);
        if (typeof msg === 'string'
                && msg.indexOf('Request ') !== -1
                && msg.indexOf('timed out (secondary), restarting') !== -1) {
            // eslint-disable-next-line no-param-reassign
            level = Strophe.LogLevel.WARN;
        }

        /* eslint-disable no-case-declarations */
        switch (level) {
        case Strophe.LogLevel.DEBUG:
            // The log message which reports successful status is logged on
            // Strophe's DEBUG level.
            if (lastErrorStatus !== -1
                    && resetLastErrorStatusRegExpr.test(msg)) {
                logger.debug('Reset lastErrorStatus');
                lastErrorStatus = -1;
            }
            break;
        case Strophe.LogLevel.WARN:
            logger.warn(`Strophe: ${msg}`);
            const errStatusCapture = lastErrorStatusRegExpr.exec(msg);

            if (errStatusCapture && errStatusCapture.length === 2) {
                lastErrorStatus = parseInt(errStatusCapture[1], 10);
                logger.debug(`lastErrorStatus set to: ${lastErrorStatus}`);
            }
            break;
        case Strophe.LogLevel.ERROR:
        case Strophe.LogLevel.FATAL:
            // eslint-disable-next-line no-param-reassign
            msg = `Strophe: ${msg}`;
            GlobalOnErrorHandler.callErrorHandler(new Error(msg));
            logger.error(msg);
            break;
        }

        /* eslint-enable no-case-declarations */
    };

    /**
     * Returns error status (HTTP error code) of the last BOSH request.
     *
     * @return {number} HTTP error code, '0' for unknown or "god knows what"
     * (this is a hack).
     */
    Strophe.getLastErrorStatus = function() {
        return lastErrorStatus;
    };

    Strophe.getStatusString = function(status) {
        switch (status) {
        case Strophe.Status.BINDREQUIRED:
            return 'BINDREQUIRED';
        case Strophe.Status.ERROR:
            return 'ERROR';
        case Strophe.Status.CONNECTING:
            return 'CONNECTING';
        case Strophe.Status.CONNFAIL:
            return 'CONNFAIL';
        case Strophe.Status.AUTHENTICATING:
            return 'AUTHENTICATING';
        case Strophe.Status.AUTHFAIL:
            return 'AUTHFAIL';
        case Strophe.Status.CONNECTED:
            return 'CONNECTED';
        case Strophe.Status.DISCONNECTED:
            return 'DISCONNECTED';
        case Strophe.Status.DISCONNECTING:
            return 'DISCONNECTING';
        case Strophe.Status.ATTACHED:
            return 'ATTACHED';
        default:
            return 'unknown';
        }
    };
}
