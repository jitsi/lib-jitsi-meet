/* global $, $iq */
import { getLogger } from 'jitsi-meet-logger';
const logger = getLogger(__filename);

import EventEmitter from 'events';

import * as Constants from './VideoSIPGWConstants';

/**
 * The event name for current sip video session state changed.
 * @type {string} event name for sip video session state changed.
 */
const STATE_CHANGED = 'STATE_CHANGED';

/**
 * Jitsi video SIP GW session. Holding its state and able to start/stop it.
 * When session is in OFF or FAILED stated it cannot be used anymore.
 */
export default class JitsiVideoSIPGWSession {

    /**
     * Creates new session with the desired sip address and display name.
     *
     * @param {string} sipAddress - The sip address to use when
     * starting the session.
     * @param {string} displayName - The display name to use for
     * that participant.
     * @param {ChatRoom} chatRoom - The chat room this session is bound to.
     */
    constructor(sipAddress, displayName, chatRoom) {
        this.sipAddress = sipAddress;
        this.displayName = displayName;
        this.chatRoom = chatRoom;

        this.eventEmitter = new EventEmitter();
    }

    /**
     * Stops the current session.
     */
    stop() {
        if (this.state === Constants.STATE_OFF
            || this.state === Constants.STATE_FAILED) {
            logger.warn('Video SIP GW session already stopped or failed!');

            return;
        }

        this._sendJibriIQ('stop');
    }

    /**
     * Starts a new session. Sends an iq to the focus.
     */
    start() {
        // if state is off, this session was active for some reason
        // and we should create new one, rather than reusing it
        if (this.state === Constants.STATE_ON
            || this.state === Constants.STATE_OFF
            || this.state === Constants.STATE_PENDING
            || this.state === Constants.STATE_RETRYING) {
            logger.warn('Video SIP GW session already started!');

            return;
        }

        this._sendJibriIQ('start');
    }

    /**
     * Changes the state of this session.
     *
     * @param {string} newState - The new {VideoSIPGWConstants} state to set.
     */
    setState(newState) {
        if (newState === this.state) {
            return;
        }

        const oldState = this.state;

        this.state = newState;
        this.eventEmitter.emit(this.sipAddress,
            {
                name: STATE_CHANGED,
                oldState,
                newState: this.state
            }
        );
    }

    /**
     * Subscribes the passed listener to the event for state change of this
     * session.
     *
     * @param {Function} listener - The function that will receive the event.
     */
    addStateListener(listener) {
        this.eventEmitter.addListener(STATE_CHANGED, listener);
    }

    /**
     * Unsubscribes the passed handler.
     *
     * @param {Function} listener - The function to be removed.
     */
    removeStateListener(listener) {
        this.eventEmitter.removeListener(STATE_CHANGED, listener);
    }

    /**
     * Sends a jibri command using an iq.
     *
     * @private
     * @param {JitsiVideoSIPGWSession} videoSIPGWSession - The session
     * sending the command.
     * @param {string} action - The action to send ('start' or 'stop').
     * @param {ChatRoom} chatRoom - The chat room to send the iq to.
     */
    _sendJibriIQ(action) {
        const attributes = {
            'xmlns': 'http://jitsi.org/protocol/jibri',
            'action': action,
            sipaddress: this.sipAddress
        };

        attributes.displayname = this.displayName;

        const iq = $iq({
            to: this.chatRoom.focusMucJid,
            type: 'set' })
            .c('jibri', attributes)
            .up();

        logger.log('Stop video SIP GW session', iq.nodeTree);
        this.chatRoom.connection.sendIQ(
            iq,
            result => {
                logger.log('Result', result);
                const initialState
                    = $(result).find('jibri')
                        .attr('state');

                this.setState(initialState);
            },
            error => {
                logger.log('Failed to start video SIP GW session, error: ',
                    error);
                this.setState(Constants.STATE_FAILED);
            });
    }
}
