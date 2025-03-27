/**
 * Strophe logger implementation. Logs from level WARN and above.
 */
import { getLogger } from '@jitsi/logger';
import { Strophe } from 'strophe.js';
import type { Strophe as IStrophe } from 'strophe.js';

const logger = getLogger('modules/xmpp/strophe.util');

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
let lastErrorStatus: number = -1;

/**
 * A regular expression used to catch Strophe's log message indicating that the
 * last BOSH request was successful. When there is such message seen the
 * {@link lastErrorStatus} will be set back to '-1'.
 * @type {RegExp}
 */
const resetLastErrorStatusRegExpr: RegExp = /request id \d+.\d+ got 200/;

/**
 * A regular expression used to capture the current value of the BOSH request
 * error status (HTTP error code or '0' or something else).
 * @type {RegExp}
 */
const lastErrorStatusRegExpr: RegExp
    = /request errored, status: (\d+), number of errors: \d+/;

/**
 *
 */
export default function(): void {

    (Strophe as IStrophe).log = function(level: number, msg: any): void {
        logger.trace('Strophe', level, msg);
        if (typeof msg === 'string'
                && msg.indexOf('Request ') !== -1
                && msg.indexOf('timed out (secondary), restarting') !== -1) {
            // eslint-disable-next-line no-param-reassign
            level = (Strophe as IStrophe).LogLevel.WARN;
        }

        switch (level) {
        case (Strophe as IStrophe).LogLevel.DEBUG:
            if (lastErrorStatus !== -1
                    && resetLastErrorStatusRegExpr.test(msg)) {
                logger.debug('Reset lastErrorStatus');
                lastErrorStatus = -1;
            }
            break;
        case (Strophe as IStrophe).LogLevel.WARN:
            logger.warn(`Strophe: ${msg}`);
            const errStatusCapture = lastErrorStatusRegExpr.exec(msg);

            if (errStatusCapture && errStatusCapture.length === 2) {
                lastErrorStatus = parseInt(errStatusCapture[1], 10);
                logger.debug(`lastErrorStatus set to: ${lastErrorStatus}`);
            }
            break;
        case (Strophe as IStrophe).LogLevel.ERROR:
        case (Strophe as IStrophe).LogLevel.FATAL:
            logger.error(`Strophe: ${msg}`, msg);
            break;
        }
    };

    (Strophe as IStrophe).getLastErrorStatus = function(): number {
        return lastErrorStatus;
    };

    (Strophe as IStrophe).getStatusString = function(status: number): string {
        switch (status) {
        case (Strophe as IStrophe).Status.BINDREQUIRED:
            return 'BINDREQUIRED';
        case (Strophe as IStrophe).Status.ERROR:
            return 'ERROR';
        case (Strophe as IStrophe).Status.CONNECTING:
            return 'CONNECTING';
        case (Strophe as IStrophe).Status.CONNFAIL:
            return 'CONNFAIL';
        case (Strophe as IStrophe).Status.AUTHENTICATING:
            return 'AUTHENTICATING';
        case (Strophe as IStrophe).Status.AUTHFAIL:
            return 'AUTHFAIL';
        case (Strophe as IStrophe).Status.CONNECTED:
            return 'CONNECTED';
        case (Strophe as IStrophe).Status.DISCONNECTED:
            return 'DISCONNECTED';
        case (Strophe as IStrophe).Status.DISCONNECTING:
            return 'DISCONNECTING';
        case (Strophe as IStrophe).Status.ATTACHED:
            return 'ATTACHED';
        default:
            return 'unknown';
        }
    };
}
