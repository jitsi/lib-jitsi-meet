/**
 * Attaches to the {@link Strophe.Connection.rawInput} which is called whenever any data is received from the server.
 */
export default class LastRequestTracker {
    /**
     * Initializes new instance.
     */
    constructor() {
        this._lastSuccess = null;
    }

    /**
     * Starts tracking requests on the given connection.
     *
     * @param {Object} stropheConnection - Strophe connection instance.
     */
    startTracking(stropheConnection) {
        const originalRawInput = stropheConnection.rawInput;

        stropheConnection.rawInput = function(...args) {
            this._lastSuccess = Date.now();
            originalRawInput.apply(stropheConnection, args);
        };
    }

    /**
     * Returns how many milliseconds have passed since the last successful BOSH request.
     *
     * @returns {number|null}
     */
    getTimeSinceLastSuccess() {
        return this._lastSuccess
            ? Date.now() - this._lastSuccess
            : null;
    }
}
