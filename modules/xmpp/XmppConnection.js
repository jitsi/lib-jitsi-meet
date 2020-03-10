import { getLogger } from 'jitsi-meet-logger';
import { $pres, Strophe } from 'strophe.js';
import 'strophejs-plugin-stream-management';

import Listenable from '../util/Listenable';

import LastSuccessTracker from './StropheBoshLastSuccess';

const logger = getLogger(__filename);

/**
 * FIXME.
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
     * FIXME.
     *
     * @param {Object} options
     * @param {String} options.serviceUrl - The BOSH or WebSocket service URL.
     * @param {String} options.enableWebsocketResume - True to enable stream resumption.
     * @param {Number} [options.websocketKeepAlive=240000] - The websocket keep alive interval. It's 4 minutes by
     * default with jitter. Pass -1 to disable. The actual interval equation is:
     * jitterDelay = (interval * 0.2) + (0.8 * interval * Math.random())
     * The keep alive is HTTP GET request to the {@link options.serviceUrl}.
     */
    constructor({ enableWebsocketResume, websocketKeepAlive, serviceUrl }) {
        super();
        this._options = {
            enableWebsocketResume,
            websocketKeepAlive: typeof websocketKeepAlive === 'undefined' ? 4 * 60 * 1000 : Number(websocketKeepAlive)
        };
        this._stropheConn = new Strophe.Connection(serviceUrl);
        this._usesWebsocket = serviceUrl.startsWith('ws:') || serviceUrl.startsWith('wss:');

        // The default maxRetries is 5, which is too long.
        this._stropheConn.maxRetries = 3;

        if (!this._usesWebsocket) {
            this._lastSuccessTracker = new LastSuccessTracker();
            this._lastSuccessTracker.startTracking(this._stropheConn);
        }
    }

    /**
     * FIXME.
     *
     * @returns {boolean}
     */
    get connected() {
        return this._status === Strophe.Status.CONNECTED;
    }

    /**
     * FIXME.
     *
     * @returns {Strophe.Connection.disco}
     */
    get disco() {
        return this._stropheConn.disco;
    }

    /**
     * FIXME.
     *
     * @returns {boolean}
     */
    get disconnecting() {
        return this._stropheConn.disconnecting === true;
    }

    /**
     * FIXME.
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
     * FIXME.
     *
     * @returns {string|null}
     */
    get jid() {
        return this._stropheConn.jid;
    }

    /**
     * FIXME.
     *
     * @returns {string}
     */
    get lastResponseHeaders() {
        return this._stropheConn._proto && this._stropheConn._proto.lastResponseHeaders;
    }

    /**
     * FIXME.
     *
     * @returns {*}
     */
    get logger() {
        return this._stropheConn.logger;
    }

    /**
     * FIXME.
     *
     * @returns {*}
     */
    get options() {
        return this._stropheConn.options;
    }

    /**
     * FIXME.
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
     * FIXME.
     *
     * @param {number} _nextValidRid - FIXME.
     * @returns {void}
     */
    set nextValidRid(_nextValidRid) {
        // FIXME test
        this._stropheConn.nextValidRid = _nextValidRid;
    }

    /**
     * FIXME.
     *
     * @param {string} _service - FIXME.
     * @returns {void}
     */
    set service(_service) {
        this._stropheConn.service = _service;
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
     * FIXME.
     *
     * @returns {void}
     */
    addHandler(...args) {
        this._stropheConn.addHandler(...args);
    }

    /**
     * FIXME.
     *
     * @returns {void}
     */
    attach(...args) {
        this._stropheConn.attach(...args);
    }

    /**
     * Wraps Strophe.Connection.connect method in order to intercept the connection status updates.
     * See {@link Strophe.Connection.connect} for the params description.
     *
     * @returns {void}
     */
    connect(jid, pass, callback, ...args) {
        const connectCb = (status, condition) => {
            this._status = status;

            let blockCallback = false;

            if (status === Strophe.Status.CONNECTED) {
                this._maybeEnableStreamResume();
                this._maybeStartWSKeepAlive();
            } else if (status === Strophe.Status.DISCONNECTED) {
                // FIXME add RECONNECTING state instead of blocking the DISCONNECTED update
                blockCallback = this._tryResumingConnection();
                if (!blockCallback) {
                    clearTimeout(this._wsKeepAlive);
                }
            }

            if (!blockCallback) {
                callback(status, condition);
                this.eventEmitter.emit(XmppConnection.Events.CONN_STATUS_CHANGED, status);
            }
        };

        this._stropheConn.connect(jid, pass, connectCb, ...args);
    }

    /**
     * FIXME.
     *
     * @returns {void}
     */
    closeWebsocket() {
        this._stropheConn._proto && this._stropheConn._proto.socket && this._stropheConn._proto.socket.close();
    }

    /**
     * FIXME.
     *
     * @returns {void}
     */
    disconnect(...args) {
        clearTimeout(this._resumeTimeout);
        clearTimeout(this._wsKeepAlive);
        this._stropheConn.disconnect(...args);
    }

    /**
     * FIXME.
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
    getTimeSinceLastBOSHSuccess() {
        return this._lastSuccessTracker
            ? this._lastSuccessTracker.getTimeSinceLastSuccess()
            : null;
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
                const url = this.service.replace('wss', 'https').replace('ws', 'http');

                fetch(url).catch(
                    error => {
                        logger.error(`Websocket Keep alive failed for url: ${url}`, { error });
                    })
                    .then(() => this._maybeStartWSKeepAlive());
            }, intervalWithJitter);
        }
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
     * FIXME.
     *
     * @returns {void}
     */
    sendUnavailableBeacon() {
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
            `https:${this.service}`,
            Strophe.serialize(body.tree()));

        logger.info(`Successfully send unavailable beacon ${res}`);

        this._stropheConn._proto._abortAllRequests();
        this._stropheConn._doDisconnect();
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
            clearTimeout(this._resumeTimeout);
            this._resumeTimeout = setTimeout(() => {
                logger.info('Trying to resume the XMPP connection');

                const url = new URL(this._stropheConn.service);

                url.searchParams.set('previd', resumeToken);

                // FIXME remove XmppConnection 'service' setter
                this._stropheConn.service = url.toString();

                streamManagement.resume();
            }, 3000 /* FIXME calculate delay with jitter */);

            return true;
        }

        return false;
    }
}
