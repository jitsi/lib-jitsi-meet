import { getLogger } from '@jitsi/logger';
import { $iq } from 'strophe.js';

import Listenable from '../util/Listenable';
import ChatRoom from '../xmpp/ChatRoom';

import * as VideoSIPGWConstants from './VideoSIPGWConstants';

const logger = getLogger('videosipgw:JitsiVideoSIPGWSession');

/**
 * The event name for current sip video session state changed.
 * @type {string} event name for sip video session state changed.
 */
const STATE_CHANGED: string = 'STATE_CHANGED';

/**
 * Jitsi video SIP GW session. Holding its state and able to start/stop it.
 * When session is in OFF or FAILED stated it cannot be used anymore.
 */
export default class JitsiVideoSIPGWSession extends Listenable {
    sipAddress: string;
    displayName: string;
    chatRoom: ChatRoom;
    state?: string;

    /**
     * Creates new session with the desired sip address and display name.
     *
     * @param {string} sipAddress - The sip address to use when
     * starting the session.
     * @param {string} displayName - The display name to use for
     * that participant.
     * @param {ChatRoom} chatRoom - The chat room this session is bound to.
     */
    constructor(sipAddress: string, displayName: string, chatRoom: ChatRoom) {
        super();

        this.sipAddress = sipAddress;
        this.displayName = displayName;
        this.chatRoom = chatRoom;

        /*
         * The initial state is undefined. Initial state cannot be STATE_OFF,
         * the session enters this state when it was in STATE_ON and was stopped
         * and such session cannot be used anymore.
         *
         * @type {VideoSIPGWConstants|undefined}
         */
        this.state = undefined;
    }

    /**
     * Sends a jibri command using an iq.
     *
     * @private
     * @param {string} action - The action to send ('start' or 'stop').
     */
    private _sendJibriIQ(action: string): void {
        const attributes = {
            'action': action,
            'displayname': this.displayName,
            'sipaddress': this.sipAddress,
            'xmlns': 'http://jitsi.org/protocol/jibri'
        };

        const iq = $iq({
            to: this.chatRoom.focusMucJid,
            type: 'set' })
            .c('jibri', attributes)
            .up();

        logger.debug(`${action} video SIP GW session`, iq.nodeTree);
        this.chatRoom.connection.sendIQ(
            iq,
            () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
            (error: any) => {
                logger.error(
                    `Failed to ${action} video SIP GW session, error: `, error);
                this.setState(VideoSIPGWConstants.STATE_FAILED);
            },
            undefined);
    }

    /**
     * Stops the current session.
     */
    stop(): void {
        if (this.state === VideoSIPGWConstants.STATE_OFF
            || this.state === VideoSIPGWConstants.STATE_FAILED) {
            logger.warn('Video SIP GW session already stopped or failed!');

            return;
        }

        this._sendJibriIQ('stop');
    }

    /**
     * Starts a new session. Sends an iq to the focus.
     */
    start(): void {
        // if state is off, this session was active for some reason
        // and we should create new one, rather than reusing it
        if (this.state === VideoSIPGWConstants.STATE_ON
            || this.state === VideoSIPGWConstants.STATE_OFF
            || this.state === VideoSIPGWConstants.STATE_PENDING
            || this.state === VideoSIPGWConstants.STATE_RETRYING) {
            logger.warn('Video SIP GW session already started!');

            return;
        }

        this._sendJibriIQ('start');
    }

    /**
     * Changes the state of this session.
     *
     * @param {string} newState - The new {VideoSIPGWConstants} state to set.
     * @param {string} [optional] failureReason - The reason why a failure state
     * was entered.
     * @returns {void}
     */
    setState(newState: string, failureReason?: string): void {
        if (newState === this.state) {
            return;
        }

        const oldState = this.state;

        this.state = newState;
        this.eventEmitter.emit(STATE_CHANGED,
            {
                address: this.sipAddress,
                displayName: this.displayName,
                failureReason,
                newState: this.state,
                oldState
            }
        );
    }

    /**
     * Subscribes the passed listener to the event for state change of this
     * session.
     *
     * @param {EventListener} listener - The function that will receive the event.
     */
    addStateListener(listener: EventListener): void {
        this.addListener(STATE_CHANGED, listener);
    }

    /**
     * Unsubscribes the passed handler.
     *
     * @param {EventListener} listener - The function to be removed.
     */
    removeStateListener(listener: EventListener): void {
        this.removeListener(STATE_CHANGED, listener);
    }
}
