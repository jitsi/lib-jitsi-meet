/**
 * Mock {@link ChatRoom}.
 */
export class MockChatRoom extends Listenable {
    /**
     * {@link ChatRoom.addPresenceListener}.
     */
    addPresenceListener(): void;
}
/**
 * Mock Strophe connection.
 */
export class MockStropheConnection extends Listenable {
    /**
     * A constructor...
     */
    constructor();
    sentIQs: any[];
    _proto: {
        socket: any;
    };
    /**
     * XMPP service URL.
     *
     * @returns {string}
     */
    get service(): string;
    /**
     * {@see Strophe.Connection.connect}
     */
    connect(jid: any, pass: any, callback: any): void;
    _connectCb: any;
    /**
     * {@see Strophe.Connection.disconnect}
     */
    disconnect(): void;
    /**
     * Simulates transition to the new connection status.
     *
     * @param {Strophe.Status} newState - The new connection status to set.
     * @returns {void}
     */
    simulateConnectionState(newState: any): void;
    /**
     * {@see Strophe.Connection.sendIQ}.
     */
    sendIQ(iq: any, resultCb: any): void;
}
import Listenable from "../util/Listenable";
