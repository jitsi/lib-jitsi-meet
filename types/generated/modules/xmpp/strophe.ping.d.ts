declare const PingConnectionPlugin_base: {
    new (...args: any[]): {
        connection: any;
        init(connection: any): void;
    };
};
/**
 * XEP-0199 ping plugin.
 *
 * Registers "urn:xmpp:ping" namespace under Strophe.NS.PING.
 */
export default class PingConnectionPlugin extends PingConnectionPlugin_base {
    /**
     * Constructs new object
     * @param {Object} options
     * @param {Function} options.onPingThresholdExceeded - Callback called when ping fails too many times (controlled
     * by the {@link PING_THRESHOLD} constant).
     * @param {Function} options._getTimeSinceLastServerResponse - A function to obtain the last seen
     * response from the server.
     * @param {Object} options.pingOptions - The ping options if any.
     * @constructor
     */
    constructor({ getTimeSinceLastServerResponse, onPingThresholdExceeded, pingOptions }: {
        onPingThresholdExceeded: Function;
        _getTimeSinceLastServerResponse: Function;
        pingOptions: any;
    });
    failedPings: number;
    _onPingThresholdExceeded: Function;
    _getTimeSinceLastServerResponse: any;
    pingInterval: any;
    pingTimeout: any;
    pingThreshold: any;
    pingTimestampsToKeep: number;
    pingExecIntervals: any[];
    /**
     * Sends "ping" to given <tt>jid</tt>
     * @param jid the JID to which ping request will be sent.
     * @param success callback called on success.
     * @param error callback called on error.
     * @param timeout ms how long are we going to wait for the response. On
     * timeout <tt>error<//t> callback is called with undefined error argument.
     */
    ping(jid: any, success: any, error: any, timeout: any): void;
    /**
     * Starts to send ping in given interval to specified remote JID.
     * This plugin supports only one such task and <tt>stopInterval</tt>
     * must be called before starting a new one.
     * @param remoteJid remote JID to which ping requests will be sent to.
     */
    startInterval(remoteJid: any): void;
    intervalId: number;
    _lastServerCheck: any;
    /**
     * Stops current "ping"  interval task.
     */
    stopInterval(): void;
    /**
     * Adds the current time to the array of send ping timestamps.
     * @private
     */
    private _addPingExecutionTimestamp;
    /**
     * Returns the maximum time between the recent sent pings, if there is a
     * big value it means the computer was inactive for some time(suspended).
     * Checks the maximum gap between sending pings, considering and the
     * current time. Trying to detect computer inactivity (sleep).
     *
     * @returns {int} the time ping was suspended, if it was not 0 is returned.
     */
    getPingSuspendTime(): any;
}
export {};
