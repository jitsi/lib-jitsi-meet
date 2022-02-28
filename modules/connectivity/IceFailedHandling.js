import { getLogger } from '@jitsi/logger';

import * as JitsiConferenceErrors from '../../JitsiConferenceErrors';
import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';

const logger = getLogger(__filename);

/**
 * This class deals with shenanigans around JVB media session's ICE failed status handling.
 *
 * If ICE restarts are NOT explicitly enabled by the {@code enableIceRestart} config option, then the conference will
 * delay emitting the {@JitsiConferenceErrors.ICE_FAILED} event by 15 seconds. If the network info module reports
 * the internet offline status then the time will start counting after the internet comes back online.
 *
 * If ICE restart are enabled, then a delayed ICE failed notification to Jicofo will be sent, only if the ICE connection
 * does not recover soon after or before the XMPP connection is restored (if it was ever broken). If ICE fails while
 * the XMPP connection is not broken then the notifications will be sent after 2 seconds delay.
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

        const { enableForcedReload, enableIceRestart } = this._conference.options.config;
        const explicitlyDisabled = typeof enableIceRestart !== 'undefined' && !enableIceRestart;
        const supportsRestartByTerminate = this._conference.room.supportsRestartByTerminate();
        const useTerminateForRestart = supportsRestartByTerminate && !enableIceRestart;

        logger.info('ICE failed,'
            + ` enableForcedReload: ${enableForcedReload},`
            + ` enableIceRestart: ${enableIceRestart},`
            + ` supports restart by terminate: ${supportsRestartByTerminate}`);

        if (explicitlyDisabled || (!enableIceRestart && !supportsRestartByTerminate) || enableForcedReload) {
            logger.info('ICE failed, but ICE restarts are disabled');
            const reason = enableForcedReload
                ? JitsiConferenceErrors.CONFERENCE_RESTARTED
                : JitsiConferenceErrors.ICE_FAILED;

            this._conference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED, reason);

            return;
        }

        const jvbConnection = this._conference.jvbJingleSession;
        const jvbConnIceState = jvbConnection && jvbConnection.getIceConnectionState();

        if (!jvbConnection) {
            logger.warn('Not sending ICE failed - no JVB connection');
        } else if (jvbConnIceState === 'connected') {
            logger.info('ICE connection restored - not sending ICE failed');
        } else {
            logger.info('Sending ICE failed - the connection did not recover, '
                + `ICE state: ${jvbConnIceState}, `
                + `use 'session-terminate': ${useTerminateForRestart}`);
            if (useTerminateForRestart) {
                this._conference.jvbJingleSession.terminate(
                    () => {
                        logger.info('session-terminate for ice restart - done');
                    },
                    error => {
                        logger.error(`session-terminate for ice restart - error: ${error.message}`);
                    }, {
                        reason: 'connectivity-error',
                        reasonDescription: 'ICE FAILED',
                        requestRestart: true,
                        sendSessionTerminate: true
                    });
            } else {
                this._conference.jvbJingleSession.sendIceFailedNotification();
            }
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
