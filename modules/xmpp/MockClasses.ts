import { Strophe } from 'strophe.js';

import Listenable from '../util/Listenable';

/* eslint-disable no-empty-function */

export interface ISocket {
    readyState: number;
}

export interface IStropheProto {
    socket: ISocket | undefined;
}

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
export class MockStropheConnection extends Listenable {
    sentIQs: any[];
    _proto: IStropheProto;
    _connectCb: ((status: number) => void) | undefined;

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
    connect(jid: string, pass: string, callback: (status: number) => void): void {
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
    simulateConnectionState(newState: number): void {
        if (newState === Strophe.Status.CONNECTED) {
            this._proto.socket = {
                readyState: WebSocket.OPEN
            };
        } else {
            this._proto.socket = undefined;
        }
        if (this._connectCb) {
            this._connectCb(newState);
        }
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
    registerSASLMechanisms() {}
}
/* eslint-enable no-empty-function */
