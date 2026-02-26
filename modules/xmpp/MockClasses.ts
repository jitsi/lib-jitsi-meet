import { Strophe } from 'strophe.js';

import Listenable from '../util/Listenable';

/* eslint-disable no-empty-function */

/**
 * Mock {@link ChatRoom}.
 */
export class MockChatRoom extends Listenable {
    /**
     * {@link ChatRoom.addPresenceListener}.
     */
    addPresenceListener(): void {
        // no operation; intentionally left blank
    }
}

/**
 * Mock Strophe connection.
 */
export interface IProto {
    socket?: WebSocket;
}

export class MockStropheConnection extends Listenable {
    private _connectCb?: (status: Strophe.Status) => void;
    private _proto: IProto;
    public sentIQs: any[];

    /**
     * A constructor...
     */
    constructor() {
        super();
        this.sentIQs = [];
        this._proto = {
            socket: undefined
        };
    }

    /**
     * XMPP service URL.
     *
     * @returns {string}
     */
    get service(): string {
        return 'wss://localhost/xmpp-websocket';
    }

    /**
     * {@see Strophe.Connection.connect}
     */
    connect(jid: string, pass: string, callback: (status: Strophe.Status) => void): void {
        this._connectCb = callback;
    }

    /**
     * {@see Strophe.Connection.disconnect}
     */
    disconnect(): void {
        this.simulateConnectionState(Strophe.Status.DISCONNECTING);
        this.simulateConnectionState(Strophe.Status.DISCONNECTED);
    }

    /**
     * Simulates transition to the new connection status.
     *
     * @param {Strophe.Status} newState - The new connection status to set.
     * @returns {void}
     */
    simulateConnectionState(newState: Strophe.Status): void {
        if (newState === Strophe.Status.CONNECTED) {
            this._proto.socket = { readyState: WebSocket.OPEN } as WebSocket;
        } else {
            this._proto.socket = undefined;
        }
        this._connectCb?.(newState);
    }

    /**
     * {@see Strophe.Connection.sendIQ}.
     */
    sendIQ(iq: any, resultCb?: () => void): void {
        this.sentIQs.push(iq);
        resultCb && resultCb();
    }

    /**
     * {@see Strophe.Connection.registerSASLMechanisms}.
     */
    registerSASLMechanisms(): void {
        // Intentionally left blank for mock functionality
    }
}
/* eslint-enable no-empty-function */
