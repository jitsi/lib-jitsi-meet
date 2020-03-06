import { getLogger } from 'jitsi-meet-logger';
import { $pres, Strophe } from 'strophe.js';

import LastSuccessTracker from './StropheBoshLastSuccess';

const logger = getLogger(__filename);

/**
 * FIXME.
 */
export default class XmppConnection {
    /**
     * FIXME.
     *
     * @param {XMPP} xmpp - FIXME.
     * @param {String} serviceUrl - FIXME.
     */
    constructor(xmpp, serviceUrl) {
        this.xmpp = xmpp;
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
        return this._stropheConn.connected === true;
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
     * FIXME.
     *
     * @returns {*}
     */
    get emuc() {
        return this._stropheConn.emuc;
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
     * @returns {*}
     */
    get jingle() {
        return this._stropheConn.jingle;
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
     * @returns {PingConnectionPlugin}
     */
    get ping() {
        return this._stropheConn.ping;
    }

    /**
     * FIXME.
     *
     * @returns {*}
     */
    get rayo() {
        return this._stropheConn.rayo;
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
     * FIXME.
     *
     * @returns {void}
     */
    connect(...args) {
        this._stropheConn.connect(...args);
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
}
