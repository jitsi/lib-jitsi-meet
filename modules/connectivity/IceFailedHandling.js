/* global __filename */
import { getLogger } from 'jitsi-meet-logger';

import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import * as JitsiConferenceErrors from '../../JitsiConferenceErrors';
import { default as networkInfo, NETWORK_INFO_EVENT } from './NetworkInfo';

const logger = getLogger(__filename);

/**
 * Helper class for handling ICE event delay in combination with internet online/offline status check.
 */
class DelayedIceFailedEvent {
    /**
     * A constructor.
     * @param {function} emitIceFailed - Will be called by this class to emit ICE failed conference event.
     * @param {number} delay - The delay for ICE failed in milliseconds since the event occurred on the peerconnection
     * or the internet came back online.
     */
    constructor(emitIceFailed, delay) {
        this._emitIceFailed = emitIceFailed;
        this._delay = delay;
    }

    /**
     * Starts the event delay and internet status check logic.
     */
    start() {
        this._onlineListener
            = networkInfo.addEventListener(
                NETWORK_INFO_EVENT,
                () => this._maybeSetDelayTimeout());
        this._maybeSetDelayTimeout();
    }

    /**
     * Cancels the task.
     */
    stop() {
        this._onlineListener && this._onlineListener();
        this._onlineListener = undefined;
        clearTimeout(this._delayTimeout);
    }

    /**
     * Resets the timer delay if the internet status is online.
     * @private
     */
    _maybeSetDelayTimeout() {
        clearTimeout(this._delayTimeout);

        if (networkInfo.isOnline()) {
            logger.info(`Will emit ICE failed in ${this._delay}ms`);
            this._delayTimeout = setTimeout(() => this._emitIceFailed(), this._delay);
        }
    }
}


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
     * Starts the task.
     */
    start() {
        if (!this._conference.options.config.enableIceRestart) {
            logger.info('ICE failed, but ICE restarts are disabled');
            this._delayedIceFailedEvent = new DelayedIceFailedEvent(() => {
                this._conference.eventEmitter.emit(
                    JitsiConferenceEvents.CONFERENCE_FAILED,
                    JitsiConferenceErrors.ICE_FAILED);
            }, 15000);
            this._delayedIceFailedEvent.start();

            return;
        } else if (!this._conference.xmpp.isPingSupported()) {
            // Let Jicofo know that the JVB's ICE connection has failed
            logger.info('PING not supported - sending ICE failed notification immediately');
            this._conference.jvbJingleSession.sendIceFailedNotification();

            return;
        }

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
                        jvbConnection.sendIceFailedNotification();
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
        this._delayedIceFailedEvent && this._delayedIceFailedEvent.stop();
    }
}
