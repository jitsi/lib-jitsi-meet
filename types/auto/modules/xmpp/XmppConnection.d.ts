/**
 * The lib-jitsi-meet layer for {@link Strophe.Connection}.
 */
export default class XmppConnection extends Listenable {
    /**
     * The list of {@link XmppConnection} events.
     *
     * @returns {Object}
     */
    static get Events(): any;
    /**
     * The list of Xmpp connection statuses.
     *
     * @returns {Strophe.Status}
     */
    static get Status(): any;
    /**
     * Initializes new connection instance.
     *
     * @param {Object} options
     * @param {String} options.serviceUrl - The BOSH or WebSocket service URL.
     * @param {String} options.shard - The BOSH or WebSocket is connecting to this shard.
     * Useful for detecting when shard changes.
     * @param {String} [options.enableWebsocketResume=true] - True/false to control the stream resumption functionality.
     * It will enable automatically by default if supported by the XMPP server.
     * @param {Number} [options.websocketKeepAlive=60000] - The websocket keep alive interval.
     * It's the interval + a up to a minute of jitter. Pass -1 to disable.
     * The keep alive is HTTP GET request to {@link options.serviceUrl} or to {@link options.websocketKeepAliveUrl}.
     * @param {Number} [options.websocketKeepAliveUrl] - The websocket keep alive url to use if any,
     * if missing the serviceUrl url will be used.
     * @param {Object} [options.xmppPing] - The xmpp ping settings.
     */
    constructor({ enableWebsocketResume, websocketKeepAlive, websocketKeepAliveUrl, serviceUrl, shard, xmppPing }: {
        serviceUrl: string;
        shard: string;
        enableWebsocketResume?: string;
        websocketKeepAlive?: number;
        websocketKeepAliveUrl?: number;
        xmppPing?: any;
    });
    _options: {
        enableWebsocketResume: string | boolean;
        pingOptions: any;
        shard: string;
        websocketKeepAlive: number;
        websocketKeepAliveUrl: number;
    };
    _stropheConn: any;
    _usesWebsocket: boolean;
    _rawInputTracker: LastSuccessTracker;
    _resumeTask: ResumeTask;
    /**
     * @typedef DeferredSendIQ Object
     * @property {Element} iq - The IQ to send.
     * @property {function} resolve - The resolve method of the deferred Promise.
     * @property {function} reject - The reject method of the deferred Promise.
     * @property {number} timeout - The ID of the timeout task that needs to be cleared, before sending the IQ.
     */
    /**
     * Deferred IQs to be sent upon reconnect.
     * @type {Array<DeferredSendIQ>}
     * @private
     */
    private _deferredIQs;
    _oneSuccessfulConnect: boolean;
    /**
     * A getter for the connected state.
     *
     * @returns {boolean}
     */
    get connected(): boolean;
    /**
     * Retrieves the feature discovery plugin instance.
     *
     * @returns {Strophe.Connection.disco}
     */
    get disco(): any;
    /**
     * A getter for the disconnecting state.
     *
     * @returns {boolean}
     */
    get disconnecting(): boolean;
    /**
     * A getter for the domain.
     *
     * @returns {string|null}
     */
    get domain(): string;
    /**
     * Tells if Websocket is used as the transport for the current XMPP connection. Returns true for Websocket or false
     * for BOSH.
     * @returns {boolean}
     */
    get isUsingWebSocket(): boolean;
    /**
     * A getter for the JID.
     *
     * @returns {string|null}
     */
    get jid(): string;
    /**
     * Returns headers for the last BOSH response received.
     *
     * @returns {string}
     */
    get lastResponseHeaders(): string;
    /**
     * A getter for the logger plugin instance.
     *
     * @returns {*}
     */
    get logger(): any;
    /**
     * A getter for the connection options.
     *
     * @returns {*}
     */
    get options(): any;
    /**
     * A getter for the domain to be used for ping.
     */
    get pingDomain(): any;
    /**
     * A getter for the service URL.
     *
     * @returns {string}
     */
    get service(): string;
    /**
     * Sets new value for shard.
     * @param value the new shard value.
     */
    set shard(arg: any);
    /**
     * Returns the current connection status.
     *
     * @returns {Strophe.Status}
     */
    get status(): any;
    /**
     * Adds a connection plugin to this instance.
     *
     * @param {string} name - The name of the plugin or rather a key under which it will be stored on this connection
     * instance.
     * @param {ConnectionPluginListenable} plugin - The plugin to add.
     */
    addConnectionPlugin(name: string, plugin: any): void;
    /**
     * See {@link Strophe.Connection.addHandler}
     *
     * @returns {void}
     */
    addHandler(...args: any[]): void;
    /**
     * Wraps {@link Strophe.Connection.attach} method in order to intercept the connection status updates.
     * See {@link Strophe.Connection.attach} for the params description.
     *
     * @returns {void}
     */
    attach(jid: any, sid: any, rid: any, callback: any, ...args: any[]): void;
    /**
     * Wraps Strophe.Connection.connect method in order to intercept the connection status updates.
     * See {@link Strophe.Connection.connect} for the params description.
     *
     * @returns {void}
     */
    connect(jid: any, pass: any, callback: any, ...args: any[]): void;
    /**
     * Handles {@link Strophe.Status} updates for the current connection.
     *
     * @param {function} targetCallback - The callback passed by the {@link XmppConnection} consumer to one of
     * the connect methods.
     * @param {Strophe.Status} status - The new connection status.
     * @param {*} args - The rest of the arguments passed by Strophe.
     * @private
     */
    private _stropheConnectionCb;
    _status: any;
    /**
     * Clears the list of IQs and rejects deferred Promises with an error.
     *
     * @private
     */
    private _clearDeferredIQs;
    /**
     * The method is meant to be used for testing. It's a shortcut for closing the WebSocket.
     *
     * @returns {void}
     */
    closeWebsocket(): void;
    /**
     * See {@link Strophe.Connection.disconnect}.
     *
     * @returns {void}
     */
    disconnect(...args: any[]): void;
    /**
     * See {@link Strophe.Connection.flush}.
     *
     * @returns {void}
     */
    flush(...args: any[]): void;
    /**
     * See {@link LastRequestTracker.getTimeSinceLastSuccess}.
     *
     * @returns {number|null}
     */
    getTimeSinceLastSuccess(): number | null;
    /**
     * See {@link LastRequestTracker.getLastFailedMessage}.
     *
     * @returns {string|null}
     */
    getLastFailedMessage(): string | null;
    /**
     * Requests a resume token from the server if enabled and all requirements are met.
     *
     * @private
     */
    private _maybeEnableStreamResume;
    /**
     * Starts the Websocket keep alive if enabled.
     *
     * @private
     * @returns {void}
     */
    private _maybeStartWSKeepAlive;
    _wsKeepAlive: NodeJS.Timeout;
    /**
     * Do a http GET to the shard and if shard change will throw an event.
     *
     * @private
     * @returns {Promise}
     */
    private _keepAliveAndCheckShard;
    /**
     * Goes over the list of {@link DeferredSendIQ} tasks and sends them.
     *
     * @private
     * @returns {void}
     */
    private _processDeferredIQs;
    /**
     * Send a stanza. This function is called to push data onto the send queue to go out over the wire.
     *
     * @param {Element|Strophe.Builder} stanza - The stanza to send.
     * @returns {void}
     */
    send(stanza: Element | any): void;
    /**
     * Helper function to send IQ stanzas.
     *
     * @param {Element} elem - The stanza to send.
     * @param {Function} callback - The callback function for a successful request.
     * @param {Function} errback - The callback function for a failed or timed out request.  On timeout, the stanza will
     * be null.
     * @param {number} timeout - The time specified in milliseconds for a timeout to occur.
     * @returns {number} - The id used to send the IQ.
     */
    sendIQ(elem: Element, callback: Function, errback: Function, timeout: number): number;
    /**
     * Sends an IQ immediately if connected or puts it on the send queue otherwise(in contrary to other send methods
     * which would fail immediately if disconnected).
     *
     * @param {Element} iq - The IQ to send.
     * @param {number} timeout - How long to wait for the response. The time when the connection is reconnecting is
     * included, which means that the IQ may never be sent and still fail with a timeout.
     */
    sendIQ2(iq: Element, { timeout }: number): Promise<any>;
    /**
     * Called by the ping plugin when ping fails too many times.
     *
     * @returns {void}
     */
    _onPingErrorThresholdExceeded(): void;
    /**
     *  Helper function to send presence stanzas. The main benefit is for sending presence stanzas for which you expect
     *  a responding presence stanza with the same id (for example when leaving a chat room).
     *
     * @param {Element} elem - The stanza to send.
     * @param {Function} callback - The callback function for a successful request.
     * @param {Function} errback - The callback function for a failed or timed out request. On timeout, the stanza will
     * be null.
     * @param {number} timeout - The time specified in milliseconds for a timeout to occur.
     * @returns {number} - The id used to send the presence.
     */
    sendPresence(elem: Element, callback: Function, errback: Function, timeout: number): number;
    /**
     * The method gracefully closes the BOSH connection by using 'navigator.sendBeacon'.
     *
     * @returns {boolean} - true if the beacon was sent.
     */
    sendUnavailableBeacon(): boolean;
    /**
     * Tries to use stream management plugin to resume dropped XMPP connection. The streamManagement plugin clears
     * the resume token if any connection error occurs which would put it in unrecoverable state, so as long as
     * the token is present it means the connection can be resumed.
     *
     * @private
     * @returns {boolean}
     */
    private _tryResumingConnection;
}
import Listenable from "../util/Listenable";
import LastSuccessTracker from "./StropheLastSuccess";
import ResumeTask from "./ResumeTask";
