/**
 * Jitsi video SIP GW session. Holding its state and able to start/stop it.
 * When session is in OFF or FAILED stated it cannot be used anymore.
 */
export default class JitsiVideoSIPGWSession extends Listenable {
    /**
     * Creates new session with the desired sip address and display name.
     *
     * @param {string} sipAddress - The sip address to use when
     * starting the session.
     * @param {string} displayName - The display name to use for
     * that participant.
     * @param {ChatRoom} chatRoom - The chat room this session is bound to.
     */
    constructor(sipAddress: string, displayName: string, chatRoom: any);
    sipAddress: string;
    displayName: string;
    chatRoom: any;
    state: any;
    /**
     * Stops the current session.
     */
    stop(): void;
    /**
     * Starts a new session. Sends an iq to the focus.
     */
    start(): void;
    /**
     * Changes the state of this session.
     *
     * @param {string} newState - The new {VideoSIPGWConstants} state to set.
     * @param {string} [optional] failureReason - The reason why a failure state
     * was entered.
     * @returns {void}
     */
    setState(newState: string, failureReason: any): void;
    /**
     * Subscribes the passed listener to the event for state change of this
     * session.
     *
     * @param {Function} listener - The function that will receive the event.
     */
    addStateListener(listener: Function): void;
    /**
     * Unsubscribes the passed handler.
     *
     * @param {Function} listener - The function to be removed.
     */
    removeStateListener(listener: Function): void;
    /**
     * Sends a jibri command using an iq.
     *
     * @private
     * @param {string} action - The action to send ('start' or 'stop').
     */
    private _sendJibriIQ;
}
import Listenable from "../util/Listenable";
