/**
 * Attaches to the {@link Strophe.Connection.rawInput} which is called whenever any data is received from the server.
 */
export default class LastRequestTracker {
    _lastSuccess: number;
    /**
     * Starts tracking requests on the given connection.
     *
     * @param {XmppConnection} xmppConnection - The XMPP connection which manages the given {@code stropheConnection}.
     * @param {Object} stropheConnection - Strophe connection instance.
     */
    startTracking(xmppConnection: any, stropheConnection: any): void;
    /**
     * Returns how many milliseconds have passed since the last successful BOSH request.
     *
     * @returns {number|null}
     */
    getTimeSinceLastSuccess(): number | null;
}
