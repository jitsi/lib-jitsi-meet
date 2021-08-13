/**
 * Main video SIP GW handler. Stores references of all created sessions.
 */
export default class VideoSIPGW {
    /**
     * Creates new handler.
     *
     * @param {ChatRoom} chatRoom - Tha chat room to handle.
     */
    constructor(chatRoom: any);
    chatRoom: any;
    eventEmitter: any;
    sessions: {};
    sessionStateChangeListener: any;
    /**
     * Handles presence nodes with name: jibri-sip-call-state.
     *
     * @param {Object} node the presence node Object to handle.
     * Object representing part of the presence received over xmpp.
     */
    handleJibriSIPState(node: any): void;
    /**
     * Creates new session and stores its reference if it does not exist or
     * returns an error otherwise.
     *
     * @param {string} sipAddress - The sip address to use.
     * @param {string} displayName - The display name to use.
     * @returns {JitsiVideoSIPGWSession|Error}
     */
    createVideoSIPGWSession(sipAddress: string, displayName: string): JitsiVideoSIPGWSession | Error;
    /**
     * Listener for session state changed. When a session goes to off or failed
     * we delete its reference.
     *
     * @param {options} event - { address, oldState, newState, displayName }
     */
    sessionStateChanged(event: any): void;
}
import JitsiVideoSIPGWSession from "./JitsiVideoSIPGWSession";
