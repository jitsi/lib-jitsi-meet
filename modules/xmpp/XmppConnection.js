import { getLogger } from 'jitsi-meet-logger';
import { $pres, Strophe } from 'strophe.js';
import 'strophejs-plugin-stream-management';

import Listenable from '../util/Listenable';

import ResumeTask from './ResumeTask';
import LastSuccessTracker from './StropheLastSuccess';
import PingConnectionPlugin from './strophe.ping';

const logger = getLogger(__filename);

/**
 * The lib-jitsi-meet layer for {@link Strophe.Connection}.
 */
export default class XmppConnection extends Listenable {
    /**
     * The list of {@link XmppConnection} events.
     *
     * @returns {Object}
     */
    static get Events() {
        return {
            CONN_STATUS_CHANGED: 'CONN_STATUS_CHANGED'
        };
    }

    /**
     * The list of Xmpp connection statuses.
     *
     * @returns {Strophe.Status}
     */
    static get Status() {
        return Strophe.Status;
    }

    /**
     * Initializes new connection instance.
     *
     * @param {Object} options
     * @param {String} options.serviceUrl - The BOSH or WebSocket service URL.
     * @param {String} [options.enableWebsocketResume=true] - True/false to control the stream resumption functionality.
     * It will enable automatically by default if supported by the XMPP server.
     * @param {Number} [options.websocketKeepAlive=240000] - The websocket keep alive interval. It's 4 minutes by
     * default with jitter. Pass -1 to disable. The actual interval equation is:
     * jitterDelay = (interval * 0.2) + (0.8 * interval * Math.random())
     * The keep alive is HTTP GET request to the {@link options.serviceUrl}.
     * @param {Object} [options.xmppPing] - The xmpp ping settings.
     */
    constructor({ enableWebsocketResume, websocketKeepAlive, serviceUrl, xmppPing }) {
        super();
        this._options = {
            enableWebsocketResume: typeof enableWebsocketResume === 'undefined' ? true : enableWebsocketResume,
            pingOptions: xmppPing,
            websocketKeepAlive: typeof websocketKeepAlive === 'undefined' ? 4 * 60 * 1000 : Number(websocketKeepAlive)
        };

        this._stropheConn = new Strophe.Connection(serviceUrl);
        this._usesWebsocket = serviceUrl.startsWith('ws:') || serviceUrl.startsWith('wss:');

        // The default maxRetries is 5, which is too long.
        this._stropheConn.maxRetries = 3;

        this._lastSuccessTracker = new LastSuccessTracker();
        this._lastSuccessTracker.startTracking(this, this._stropheConn);

        this._resumeTask = new ResumeTask(this._stropheConn);

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
        this._deferredIQs = [];

        // Ping plugin is mandatory for the Websocket mode to work correctly. It's used to detect when the connection
        // is broken (WebSocket/TCP connection not closed gracefully).
        this.addConnectionPlugin(
            'ping',
            new PingConnectionPlugin({
                getTimeSinceLastServerResponse: () => this.getTimeSinceLastSuccess(),
                onPingThresholdExceeded: () => this._onPingErrorThresholdExceeded(),
                pingOptions: xmppPing
            }));
    }

    /**
     * A getter for the connected state.
     *
     * @returns {boolean}
     */
    get connected() {
        const websocket = this._stropheConn && this._stropheConn._proto && this._stropheConn._proto.socket;

        return (this._status === Strophe.Status.CONNECTED || this._status === Strophe.Status.ATTACHED)
            && (!this.isUsingWebSocket || (websocket && websocket.readyState === WebSocket.OPEN));
    }

    /**
     * Retrieves the feature discovery plugin instance.
     *
     * @returns {Strophe.Connection.disco}
     */
    get disco() {
        return this._stropheConn.disco;
    }

    /**
     * A getter for the disconnecting state.
     *
     * @returns {boolean}
     */
    get disconnecting() {
        return this._stropheConn.disconnecting === true;
    }

    /**
     * A getter for the domain.
     *
     * @returns {string|null}
     */
    get domain() {
        return this._stropheConn.domain;
    }

    /**
     * Tells if Websocket is used as the transport for the current XMPP connection. Returns true for Websocket or false
     * for BOSH.
     * @returns {boolean}
     */
    get isUsingWebSocket() {
        return this._usesWebsocket;
    }

    /**
     * A getter for the JID.
     *
     * @returns {string|null}
     */
    get jid() {
        return this._stropheConn.jid;
    }

    /**
     * Returns headers for the last BOSH response received.
     *
     * @returns {string}
     */
    get lastResponseHeaders() {
        return this._stropheConn._proto && this._stropheConn._proto.lastResponseHeaders;
    }

    /**
     * A getter for the logger plugin instance.
     *
     * @returns {*}
     */
    get logger() {
        return this._stropheConn.logger;
    }

    /**
     * A getter for the connection options.
     *
     * @returns {*}
     */
    get options() {
        return this._stropheConn.options;
    }

    /**
     * A getter for the domain to be used for ping.
     */
    get pingDomain() {
        return this._options.pingOptions?.domain || this.domain;
    }

    /**
     * A getter for the service URL.
     *
     * @returns {string}
     */
    get service() {
        return this._stropheConn.service;
    }

    /**
     * Returns the current connection status.
     *
     * @returns {Strophe.Status}
     */
    get status() {
        return this._status;
    }

    /**
     * Adds a connection plugin to this instance.
     *
     * @param {string} name - The name of the plugin or rather a key under which it will be stored on this connection
     * instance.
     * @param {ConnectionPluginListenable} plugin - The plugin to add.
     */
    addConnectionPlugin(name, plugin) {
        this[name] = plugin;
        plugin.init(this);
    }

    /**
     * See {@link Strophe.Connection.addHandler}
     *
     * @returns {void}
     */
    addHandler(...args) {
        this._stropheConn.addHandler(...args);
    }

    /* eslint-disable max-params */
    /**
     * Wraps {@link Strophe.Connection.attach} method in order to intercept the connection status updates.
     * See {@link Strophe.Connection.attach} for the params description.
     *
     * @returns {void}
     */
    attach(jid, sid, rid, callback, ...args) {
        this._stropheConn.attach(jid, sid, rid, this._stropheConnectionCb.bind(this, callback), ...args);
    }

    /**
     * Wraps Strophe.Connection.connect method in order to intercept the connection status updates.
     * See {@link Strophe.Connection.connect} for the params description.
     *
     * @returns {void}
     */
    connect(jid, pass, callback, ...args) {
        this._stropheConn.connect(jid, pass, this._stropheConnectionCb.bind(this, callback), ...args);
    }

    /* eslint-enable max-params */

    /**
     * Handles {@link Strophe.Status} updates for the current connection.
     *
     * @param {function} targetCallback - The callback passed by the {@link XmppConnection} consumer to one of
     * the connect methods.
     * @param {Strophe.Status} status - The new connection status.
     * @param {*} args - The rest of the arguments passed by Strophe.
     * @private
     */
    _stropheConnectionCb(targetCallback, status, ...args) {
        this._status = status;

        let blockCallback = false;

        if (status === Strophe.Status.CONNECTED || status === Strophe.Status.ATTACHED) {
            this._maybeEnableStreamResume();
            this._maybeStartWSKeepAlive();
            this._processDeferredIQs();
            this._resumeTask.cancel();
            this.ping.startInterval(this._options.pingOptions?.domain || this.domain);
        } else if (status === Strophe.Status.DISCONNECTED) {
            this.ping.stopInterval();

            // FIXME add RECONNECTING state instead of blocking the DISCONNECTED update
            blockCallback = this._tryResumingConnection();
            if (!blockCallback) {
                clearTimeout(this._wsKeepAlive);
            }
        }

        if (!blockCallback) {
            targetCallback(status, ...args);
            this.eventEmitter.emit(XmppConnection.Events.CONN_STATUS_CHANGED, status);
        }
    }

    /**
     * Clears the list of IQs and rejects deferred Promises with an error.
     *
     * @private
     */
    _clearDeferredIQs() {
        for (const deferred of this._deferredIQs) {
            deferred.reject(new Error('disconnect'));
        }
        this._deferredIQs = [];
    }

    /**
     * The method is meant to be used for testing. It's a shortcut for closing the WebSocket.
     *
     * @returns {void}
     */
    closeWebsocket() {
        if (this._stropheConn && this._stropheConn._proto) {
            this._stropheConn._proto._closeSocket();
            this._stropheConn._proto._onClose(null);
        }
    }

    /**
     * See {@link Strophe.Connection.disconnect}.
     *
     * @returns {void}
     */
    disconnect(...args) {
        this._resumeTask.cancel();
        clearTimeout(this._wsKeepAlive);
        this._clearDeferredIQs();
        this._stropheConn.disconnect(...args);
    }

    /**
     * See {@link Strophe.Connection.flush}.
     *
     * @returns {void}
     */
    flush(...args) {
        this._stropheConn.flush(...args);
    }

    /**
     * See {@link LastRequestTracker.getTimeSinceLastSuccess}.
     *
     * @returns {number|null}
     */
    getTimeSinceLastSuccess() {
        return this._lastSuccessTracker.getTimeSinceLastSuccess();
    }

    /**
     * Requests a resume token from the server if enabled and all requirements are met.
     *
     * @private
     */
    _maybeEnableStreamResume() {
        if (!this._options.enableWebsocketResume) {

            return;
        }

        const { streamManagement } = this._stropheConn;

        if (!this.isUsingWebSocket) {
            logger.warn('Stream resume enabled, but WebSockets are not enabled');
        } else if (!streamManagement) {
            logger.warn('Stream resume enabled, but Strophe streamManagement plugin is not installed');
        } else if (!streamManagement.isSupported()) {
            logger.warn('Stream resume enabled, but XEP-0198 is not supported by the server');
        } else if (!streamManagement.getResumeToken()) {
            logger.info('Enabling XEP-0198 stream management');
            streamManagement.enable(/* resume */ true);
        }
    }

    /**
     * Starts the Websocket keep alive if enabled.
     *
     * @private
     * @returns {void}
     */
    _maybeStartWSKeepAlive() {
        const { websocketKeepAlive } = this._options;

        if (this._usesWebsocket && websocketKeepAlive > 0) {
            this._wsKeepAlive || logger.info(`WebSocket keep alive interval: ${websocketKeepAlive}ms`);
            clearTimeout(this._wsKeepAlive);

            const intervalWithJitter
                = /* base */ (websocketKeepAlive * 0.2) + /* jitter */ (Math.random() * 0.8 * websocketKeepAlive);

            logger.debug(`Scheduling next WebSocket keep-alive in ${intervalWithJitter}ms`);

            this._wsKeepAlive = setTimeout(() => {
                const url = this.service.replace('wss://', 'https://').replace('ws://', 'http://');

                fetch(url).catch(
                    error => {
                        logger.error(`Websocket Keep alive failed for url: ${url}`, { error });
                    })
                    .then(() => this._maybeStartWSKeepAlive());
            }, intervalWithJitter);
        }
    }

    /**
     * Goes over the list of {@link DeferredSendIQ} tasks and sends them.
     *
     * @private
     * @returns {void}
     */
    _processDeferredIQs() {
        for (const deferred of this._deferredIQs) {
            if (deferred.iq) {
                clearTimeout(deferred.timeout);

                const timeLeft = Date.now() - deferred.start;

                this.sendIQ(
                    deferred.iq,
                    result => deferred.resolve(result),
                    error => deferred.reject(error),
                    timeLeft);
            }
        }

        this._deferredIQs = [];
    }

    /**
     * Send a stanza. This function is called to push data onto the send queue to go out over the wire.
     *
     * @param {Element|Strophe.Builder} stanza - The stanza to send.
     * @returns {void}
     */
    send(stanza) {
        if (!this.connected) {
            throw new Error('Not connected');
        }
        this._stropheConn.send(stanza);
    }

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
    sendIQ(elem, callback, errback, timeout) {
        if (!this.connected) {
            errback('Not connected');

            return;
        }

        return this._stropheConn.sendIQ(elem, callback, errback, timeout);
    }

    /**
     * Sends an IQ immediately if connected or puts it on the send queue otherwise(in contrary to other send methods
     * which would fail immediately if disconnected).
     *
     * @param {Element} iq - The IQ to send.
     * @param {number} timeout - How long to wait for the response. The time when the connection is reconnecting is
     * included, which means that the IQ may never be sent and still fail with a timeout.
     */
    sendIQ2(iq, { timeout }) {
        return new Promise((resolve, reject) => {
            if (this.connected) {
                this.sendIQ(
                    iq,
                    result => resolve(result),
                    error => reject(error),
                    timeout);
            } else {
                const deferred = {
                    iq,
                    resolve,
                    reject,
                    start: Date.now(),
                    timeout: setTimeout(() => {
                        // clears the IQ on timeout and invalidates the deferred task
                        deferred.iq = undefined;

                        // Strophe calls with undefined on timeout
                        reject(undefined);
                    }, timeout)
                };

                this._deferredIQs.push(deferred);
            }
        });
    }

    /**
     * Called by the ping plugin when ping fails too many times.
     *
     * @returns {void}
     */
    _onPingErrorThresholdExceeded() {
        if (this.isUsingWebSocket) {
            logger.warn('Ping error threshold exceeded - killing the WebSocket');
            this.closeWebsocket();
        }
    }

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
    sendPresence(elem, callback, errback, timeout) {
        if (!this.connected) {
            errback('Not connected');

            return;
        }
        this._stropheConn.sendPresence(elem, callback, errback, timeout);
    }

    /**
     * The method gracefully closes the BOSH connection by using 'navigator.sendBeacon'.
     *
     * @returns {boolean} - true if the beacon was sent.
     */
    sendUnavailableBeacon() {
        if (!navigator.sendBeacon || this._stropheConn.disconnecting || !this._stropheConn.connected) {
            return false;
        }

        this._stropheConn._changeConnectStatus(Strophe.Status.DISCONNECTING);
        this._stropheConn.disconnecting = true;

        const body = this._stropheConn._proto._buildBody()
            .attrs({
                type: 'terminate'
            });
        const pres = $pres({
            xmlns: Strophe.NS.CLIENT,
            type: 'unavailable'
        });

        body.cnode(pres.tree());

        const res = navigator.sendBeacon(
            this.service.indexOf('https://') === -1 ? `https:${this.service}` : this.service,
            Strophe.serialize(body.tree()));

        logger.info(`Successfully send unavailable beacon ${res}`);

        this._stropheConn._proto._abortAllRequests();
        this._stropheConn._doDisconnect();

        return true;
    }

    /**
     * Tries to use stream management plugin to resume dropped XMPP connection. The streamManagement plugin clears
     * the resume token if any connection error occurs which would put it in unrecoverable state, so as long as
     * the token is present it means the connection can be resumed.
     *
     * @private
     * @returns {boolean}
     */
    _tryResumingConnection() {
        const { streamManagement } = this._stropheConn;
        const resumeToken = streamManagement && streamManagement.getResumeToken();

        if (resumeToken) {
            this._resumeTask.schedule();

            return true;
        }

        return false;
    }
}
