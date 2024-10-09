import { getLogger } from '@jitsi/logger';

import * as JitsiConferenceErrors from '../../JitsiConferenceErrors';
import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';

const logger = getLogger(__filename);

/**
 * This class deals with shenanigans around JVB media session's ICE failed status handling.
 *
 * If ICE connection is not re-established within 2 secs after the internet comes back online, the client will initiate
 * a session restart via 'session-terminate'. This results in Jicofo re-inviting the participant into the conference by
 * recreating the jvb media session so that there is minimla disruption to the user by default. However, if the
 * 'enableForcedReload' option is set in config.js, the conference will be forcefully reloaded.
 */
export default class IceFailedHandling {
    /**
     * Creates new {@code DelayedIceFailed} task.
     * @param {JitsiConference} conference
     */
    constructor(conference) {
        this._conference = conference;
    }

    /**
     * After making sure there's no way for the ICE connection to recover this method either sends ICE failed
     * notification to Jicofo or emits the ice failed conference event.
     * @private
     * @returns {void}
     */
    _actOnIceFailed() {
        if (!this._conference.room) {
            return;
        }

        const { enableForcedReload } = this._conference.options.config;

        logger.info(`ICE failed, enableForcedReload: ${enableForcedReload}`);

        if (enableForcedReload) {
            logger.info('ICE failed, force reloading the conference');
            this._conference.eventEmitter.emit(
                JitsiConferenceEvents.CONFERENCE_FAILED,
                JitsiConferenceErrors.CONFERENCE_RESTARTED);

            return;
        }

        const jvbConnection = this._conference.jvbJingleSession;
        const jvbConnIceState = jvbConnection && jvbConnection.getIceConnectionState();

        if (!jvbConnection) {
            logger.warn('Not sending ICE failed - no JVB connection');
        } else if (jvbConnIceState === 'connected') {
            logger.info('ICE connection restored - not sending ICE failed');
        } else {
            logger.info(`Sending ICE failed - the connection did not recover, ICE state: ${jvbConnIceState}`);
            this._conference._stopJvbSession({
                reason: 'connectivity-error',
                reasonDescription: 'ICE FAILED',
                requestRestart: true,
                sendSessionTerminate: true
            });
        }
    }

    /**
     * Starts the task.
     */
    start() {
        //  Using xmpp.ping allows to handle both XMPP being disconnected and internet offline cases. The ping function
        // uses sendIQ2 method which is resilient to XMPP connection disconnected state and will patiently wait until it
        // gets reconnected.
        //  This also handles the case about waiting for the internet to come back online, because ping
        // will only succeed when the internet is online and then there's a chance for the ICE to recover from FAILED to
        // CONNECTED which is the extra 2 second timeout after ping.
        //  The 65 second timeout is given on purpose as there's no chance for XMPP to recover after 65 seconds of no
        // communication with the server. Such resume attempt will result in unrecoverable conference failed event due
        // to 'item-not-found' error returned by the server.
        this._conference.xmpp.ping(65000).then(
            () => {
                if (!this._canceled) {
                    this._iceFailedTimeout = window.setTimeout(() => {
                        this._iceFailedTimeout = undefined;
                        this._actOnIceFailed();
                    }, 2000);
                }
            },
            error => {
                logger.error('PING error/timeout - not sending ICE failed', error);
            });
    }

    /**
     * Cancels the task.
     */
    cancel() {
        this._canceled = true;
        window.clearTimeout(this._iceFailedTimeout);
    }
}
