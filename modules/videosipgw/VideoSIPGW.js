import { getLogger } from '@jitsi/logger';
const logger = getLogger(__filename);

import { XMPPEvents } from '../../service/xmpp/XMPPEvents';

import JitsiVideoSIPGWSession from './JitsiVideoSIPGWSession';
import * as Constants from './VideoSIPGWConstants';

/**
 * Main video SIP GW handler. Stores references of all created sessions.
 */
export default class VideoSIPGW {

    /**
     * Creates new handler.
     *
     * @param {ChatRoom} chatRoom - Tha chat room to handle.
     */
    constructor(chatRoom) {
        this.chatRoom = chatRoom;
        this.eventEmitter = chatRoom.eventEmitter;
        logger.debug('creating VideoSIPGW');
        this.sessions = {};

        this.sessionStateChangeListener = this.sessionStateChanged.bind(this);

        // VideoSIPGW, JitsiConference and ChatRoom are not reusable and no
        // more than one VideoSIPGW can be created per JitsiConference,
        // so we don't bother to cleanup
        chatRoom.addPresenceListener('jibri-sip-call-state',
            this.handleJibriSIPState.bind(this));
    }

    /**
     * Handles presence nodes with name: jibri-sip-call-state.
     *
     * @param {Object} node the presence node Object to handle.
     * Object representing part of the presence received over xmpp.
     */
    handleJibriSIPState(node) {
        const attributes = node.attributes;

        if (!attributes) {
            return;
        }

        logger.debug('Handle video sip gw state : ', attributes);

        const newState = attributes.state;

        if (newState === this.state) {
            return;
        }

        switch (newState) {
        case Constants.STATE_ON:
        case Constants.STATE_OFF:
        case Constants.STATE_PENDING:
        case Constants.STATE_RETRYING:
        case Constants.STATE_FAILED: {
            const address = attributes.sipaddress;

            if (!address) {
                return;
            }

            // find the corresponding session and set its state
            const session = this.sessions[address];

            if (session) {
                session.setState(newState, attributes.failure_reason);
            } else {
                logger.warn('Video SIP GW session not found:', address);
            }
        }
        }
    }

    /**
     * Creates new session and stores its reference if it does not exist or
     * returns an error otherwise.
     *
     * @param {string} sipAddress - The sip address to use.
     * @param {string} displayName - The display name to use.
     * @returns {JitsiVideoSIPGWSession|Error}
     */
    createVideoSIPGWSession(sipAddress, displayName) {
        if (this.sessions[sipAddress]) {
            logger.warn('There was already a Video SIP GW session for address',
                sipAddress);

            return new Error(Constants.ERROR_SESSION_EXISTS);
        }

        const session = new JitsiVideoSIPGWSession(
            sipAddress, displayName, this.chatRoom);

        session.addStateListener(this.sessionStateChangeListener);

        this.sessions[sipAddress] = session;

        return session;
    }

    /**
     * Listener for session state changed. When a session goes to off or failed
     * we delete its reference.
     *
     * @param {options} event - { address, oldState, newState, displayName }
     */
    sessionStateChanged(event) {
        const address = event.address;

        if (event.newState === Constants.STATE_OFF
            || event.newState === Constants.STATE_FAILED) {
            const session = this.sessions[address];

            if (!session) {
                logger.error('Missing Video SIP GW session with address:',
                    address);

                return;
            }

            session.removeStateListener(this.sessionStateChangeListener);
            delete this.sessions[address];
        }

        this.eventEmitter.emit(
            XMPPEvents.VIDEO_SIP_GW_SESSION_STATE_CHANGED,
            event);
    }
}
