/**
 * Attaches to the {@link Strophe.Connection.rawInput} which is called whenever any data is received from the server.
 */

import { Strophe } from 'strophe.js';

import XmppConnection from './XmppConnection';


export default class LastRequestTracker {
    private _lastSuccess: number | null;
    private _lastFailedMessage: string | null;

    /**
     * Initializes new instance.
     */
    constructor() {
        this._lastSuccess = null;
        this._lastFailedMessage = null;
    }

    /**
     * Starts tracking requests on the given connection.
     *
     * @param {XmppConnection} xmppConnection - The XMPP connection which manages the given {@code stropheConnection}.
     * @param {Strophe.Connection} stropheConnection - Strophe connection instance.
     */
    startTracking(xmppConnection: XmppConnection, stropheConnection: Strophe.Connection): void {
        const originalRawInput = stropheConnection.rawInput;

        stropheConnection.rawInput = (...args: any[]): void => {
            const rawMessage = args[0];

            if (rawMessage.includes('failure')) {
                this._lastFailedMessage = rawMessage;
            }

            // It's okay to use rawInput callback only once the connection has been established, otherwise it will
            // treat 'item-not-found' or other connection error on websocket reconnect as successful stanza received.
            if (xmppConnection.connected) {
                this._lastSuccess = Date.now();
            }
            originalRawInput.apply(stropheConnection, args);
        };
    }

    /**
     * Returns the last raw failed incoming message on the xmpp connection.
     *
     * @returns {string|null}
     */
    getLastFailedMessage(): string | null {
        return this._lastFailedMessage;
    }

    /**
     * Returns how many milliseconds have passed since the last successful BOSH request.
     *
     * @returns {number|null}
     */
    getTimeSinceLastSuccess(): number | null {
        return this._lastSuccess
            ? Date.now() - this._lastSuccess
            : null;
    }
}
