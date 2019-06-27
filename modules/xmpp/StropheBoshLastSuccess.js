/**
 * Class attaches to Strophe BOSH connection and tracks the time of last successful request.
 * It does that by overriding {@code nextValidRid} method and tracking how the RID value changes.
 * A request was successful if the number has increased by 1 since the last time the method was called.
 */
export default class LastRequestTracker {
    /**
     * Initializes new instance.
     */
    constructor() {
        this._nextValidRid = null;
        this._lastSuccess = null;
    }

    /**
     * Starts tracking requests on the given connection.
     *
     * @param {Object} stropheConnection - Strophe connection instance.
     */
    startTracking(stropheConnection) {
        stropheConnection.nextValidRid = rid => {
            // Just before connect and on disconnect RID will get assigned a new random value.
            // A request was successful only when the value got increased exactly by 1.
            if (this._nextValidRid === rid - 1) {
                this._lastSuccess = new Date().getTime();
            }
            this._nextValidRid = rid;
        };
    }

    /**
     * Returns how many milliseconds have passed since the last successful BOSH request.
     *
     * @returns {number|null}
     */
    getTimeSinceLastSuccess() {
        return this._lastSuccess
            ? new Date().getTime() - this._lastSuccess
            : null;
    }
}
