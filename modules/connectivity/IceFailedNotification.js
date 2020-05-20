/* global __filename */
import { getLogger } from 'jitsi-meet-logger';

const logger = getLogger(__filename);

/**
 * A delayed ICE failed notification which is triggered only if the ICE
 * connection does not recover soon after or before the XMPP connection is
 * restored (if it was ever broken). If ICE fails while the XMPP connection is
 * not broken then the notifications will be sent after 2 seconds delay. This
 * extra delay is not intentional just a side effect of the code.
 * NOTE that this delayed task can only be used if PING is supported by the XMPP
 * server.
 */
export default class IceFailedNotification {
    /**
     * Creates new {@code DelayedIceFailed} task.
     * @param {JitsiConference} conference
     */
    constructor(conference) {
        this._conference = conference;
    }

    /**
     * Starts the task.
     * @param {JingleSessionPC} session - the JVB Jingle session.
     */
    start(session) {
        // The 65 seconds are greater than the default Prosody's BOSH
        // timeout of 60. This gives some time for the XMPP connection
        // to recover.
        this._conference.xmpp.ping(65000).then(
            () => {
                if (this._canceled) {
                    return;
                }

                const jvbConnection = this._conference.jvbJingleSession;
                const jvbConnIceState = jvbConnection && jvbConnection.getIceConnectionState();

                if (!jvbConnection) {
                    logger.warn('Not sending ICE failed - no JVB connection');
                } else if (jvbConnIceState === 'connected') {
                    logger.info('ICE connection restored - not sending ICE failed');
                } else {
                    this._iceFailedTimeout = window.setTimeout(() => {
                        logger.info(`Sending ICE failed - the connection has not recovered: ${jvbConnIceState}`);
                        this._iceFailedTimeout = undefined;
                        session.sendIceFailedNotification();
                    }, 2000);
                }
            },
            error => {
                logger.error(
                    'PING error/timeout - not sending ICE failed', error);
            });
    }

    /**
     * Cancels the task.
     */
    cancel() {
        this._canceled = true;
        if (this._iceFailedTimeout) {
            window.clearTimeout(this._iceFailedTimeout);
        }
    }
}
