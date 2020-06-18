import { Strophe } from 'strophe.js';
import Listenable from '../util/Listenable';

/* eslint-disable no-empty-function */

/**
 * Mock {@link ChatRoom}.
 */
export class MockChatRoom {
    /**
     * {@link ChatRoom.addPresenceListener}.
     */
    addPresenceListener() {
    }
}

/**
 * Mock Strophe connection.
 */
export class MockStropheConnection extends Listenable {
    /**
     * A constructor...
     */
    constructor() {
        super();
        this.sentIQs = [];
    }

    /**
     * XMPP service URL.
     *
     * @returns {string}
     */
    get service() {
        return 'wss://localhost/xmpp-websocket';
    }

    /**
     * {@see Strophe.Connection.connect}
     */
    connect(jid, pass, callback) {
        this._connectCb = callback;
    }

    /**
     * {@see Strophe.Connection.disconnect}
     */
    disconnect() {
        this.simulateConnectionState(Strophe.Status.DISCONNECTING);
        this.simulateConnectionState(Strophe.Status.DISCONNECTED);
    }

    /**
     * Simulates transition to the new connection status.
     *
     * @param {Strophe.Status} newState - The new connection status to set.
     * @returns {void}
     */
    simulateConnectionState(newState) {
        this._connectCb(newState);
    }

    /**
     * {@see Strophe.Connection.sendIQ}.
     */
    sendIQ(iq, resultCb) {
        this.sentIQs.push(iq);
        resultCb && resultCb();
    }
}
/* eslint-enable no-empty-function */
