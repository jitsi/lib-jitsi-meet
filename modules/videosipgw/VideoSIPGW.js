import { getLogger } from 'jitsi-meet-logger';
const logger = getLogger(__filename);

import JitsiVideoSIPGWSession from './JitsiVideoSIPGWSession';
import * as Constants from './VideoSIPGWConstants';
import XMPPEvents from '../../service/xmpp/XMPPEvents';

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
        logger.info('creating VideoSIPGW');
        this.sessions = {};

        this.sessionStateChangeListener = this.sessionStateChanged.bind(this);

        // VideoSIPGW, JitsiConference and ChatRoom are not reusable and no
        // more than one VideoSIPGW can be created per JitsiConference,
        // so we don't bother to cleanup
        chatRoom.addPresenceListener('jibri-sip-status',
            this.handleJibriSIPStatus.bind(this));
        chatRoom.addPresenceListener('jibri-sip-call-state',
            this.handleJibriSIPState.bind(this));
    }

    /**
     * Handles presence nodes with name: jibri-sip-status.
     *
     * @param {Object} node the presence node Object to handle.
     * Object representing part of the presence received over xmpp.
     */
    handleJibriSIPStatus(node) {
        const attributes = node.attributes;

        if (!attributes) {
            return;
        }

        logger.log('Handle video sip gw status : ', attributes);
        const newStatus = attributes.status;

        // check for global availability of the service
        if (newStatus !== this.status
            && (newStatus === Constants.STATUS_UNDEFINED
                || newStatus === Constants.STATUS_AVAILABLE
                || newStatus === Constants.STATUS_BUSY)) {
            this.status = newStatus;
            this.eventEmitter.emit(
                XMPPEvents.VIDEO_SIP_GW_AVAILABILITY_CHANGED, this.status);
        }
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

        logger.log('Handle video sip gw state : ', attributes);

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
                session.setState(newState);
            } else {
                logger.warn('Video SIP GW session not found:', address);
            }
        }
        }
    }

    /**
     * Creates new session and stores its reference.
     *
     * @param {string} sipAddress - The sip address to use.
     * @param {string} displayName - The display name to use.
     * @returns {JitsiVideoSIPGWSession}
     */
    createVideoSIPGWSession(sipAddress, displayName) {
        const session = new JitsiVideoSIPGWSession(
            sipAddress, displayName, this.chatRoom);

        session.addStateListener(this.sessionStateChangeListener);

        if (this.sessions[sipAddress]) {
            logger.warn('There was already a Video SIP GW session for address',
                sipAddress);
        }

        this.sessions[sipAddress] = session;

        return session;
    }

    /**
     * Returns whether SIP GW service is available.
     *
     * @returns {boolean} whether SIP GW service is available.
     */
    isVideoSIPGWAvailable() {
        return this.status === Constants.STATUS_AVAILABLE;
    }

    /**
     * Listener for session state changed. When a session goes to off or failed
     * we delete its reference.
     *
     * @param {string} address - The SIP address of the session.
     * @param {options} event - { name, oldState, newState }
     */
    sessionStateChanged(address, event) {
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
    }
}
