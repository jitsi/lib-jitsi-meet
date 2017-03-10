/* global $, Strophe */

import { getLogger } from 'jitsi-meet-logger';
const logger = getLogger(__filename);

import RandomUtil from '../util/RandomUtil';
import * as JitsiConnectionErrors from '../../JitsiConnectionErrors';
import * as JitsiConnectionEvents from '../../JitsiConnectionEvents';
import RTCBrowserType from '../RTC/RTCBrowserType';
import initEmuc from './strophe.emuc';
import initJingle from './strophe.jingle';
import initStropheUtil from './strophe.util';
import initPing from './strophe.ping';
import initRayo from './strophe.rayo';
import initStropheLogger from './strophe.logger';
import Listenable from '../util/Listenable';
import Caps from './Caps';

function createConnection(token, bosh = '/http-bind') {
    // Append token as URL param
    if (token) {
        bosh += `${bosh.indexOf('?') == -1 ? '?' : '&'}token=${token}`;
    }

    return new Strophe.Connection(bosh);
}

export default class XMPP extends Listenable {
    constructor(options, token) {
        super();
        this.connection = null;
        this.disconnectInProgress = false;
        this.connectionTimes = {};
        this.forceMuted = false;
        this.options = options;
        this.connectParams = {};
        this.token = token;
        this.authenticatedUser = false;
        this._initStrophePlugins(this);

        this.connection = createConnection(token, options.bosh);

        this.caps = new Caps(this.connection, this.options.clientNode);

        // Initialize features advertised in disco-info
        this.initFeaturesList();

        // Setup a disconnect on unload as a way to facilitate API consumers. It
        // sounds like they would want that. A problem for them though may be if
        // they wanted to utilize the connected connection in an unload handler of
        // their own. However, it should be fairly easy for them to do that by
        // registering their unload handler before us.
        $(window).on('beforeunload unload', this.disconnect.bind(this));
    }

    /**
     * Initializes the list of feature advertised through the disco-info mechanism
     */
    initFeaturesList() {
        // http://xmpp.org/extensions/xep-0167.html#support
        // http://xmpp.org/extensions/xep-0176.html#support
        this.caps.addFeature('urn:xmpp:jingle:1');
        this.caps.addFeature('urn:xmpp:jingle:apps:rtp:1');
        this.caps.addFeature('urn:xmpp:jingle:transports:ice-udp:1');
        this.caps.addFeature('urn:xmpp:jingle:apps:dtls:0');
        this.caps.addFeature('urn:xmpp:jingle:transports:dtls-sctp:1');
        this.caps.addFeature('urn:xmpp:jingle:apps:rtp:audio');
        this.caps.addFeature('urn:xmpp:jingle:apps:rtp:video');

        if (!this.options.disableRtx && !RTCBrowserType.isFirefox()) {
            this.caps.addFeature('urn:ietf:rfc:4588');
        }

        // this is dealt with by SDP O/A so we don't need to announce this
        // XEP-0293
        // this.caps.addFeature('urn:xmpp:jingle:apps:rtp:rtcp-fb:0');
        // XEP-0294
        // this.caps.addFeature('urn:xmpp:jingle:apps:rtp:rtp-hdrext:0');

        this.caps.addFeature('urn:ietf:rfc:5761'); // rtcp-mux
        this.caps.addFeature('urn:ietf:rfc:5888'); // a=group, e.g. bundle

        // this.caps.addFeature('urn:ietf:rfc:5576'); // a=ssrc

        // Enable Lipsync ?
        if (RTCBrowserType.isChrome() && this.options.enableLipSync !== false) {
            logger.info('Lip-sync enabled !');
            this.caps.addFeature('http://jitsi.org/meet/lipsync');
        }

        if (this.connection.rayo) {
            this.caps.addFeature('urn:xmpp:rayo:client:1');
        }
    }

    getConnection() {
        return this.connection;
    }

    /**
     * Receive connection status changes and handles them.
     * @password {string} the password passed in connect method
     * @status the connection status
     * @msg message
     */
    connectionHandler(password, status, msg) {
        const now = window.performance.now();
        const statusStr = Strophe.getStatusString(status).toLowerCase();

        this.connectionTimes[statusStr] = now;
        logger.log(
            `(TIME) Strophe ${statusStr}${msg ? `[${msg}]` : ''}:\t`,
            now);
        if (status === Strophe.Status.CONNECTED
            || status === Strophe.Status.ATTACHED) {
            if (this.options.useStunTurn) {
                this.connection.jingle.getStunAndTurnCredentials();
            }

            logger.info(`My Jabber ID: ${this.connection.jid}`);

            // Schedule ping ?
            const pingJid = this.connection.domain;

            this.connection.ping.hasPingSupport(
                pingJid,
                hasPing => {
                    if (hasPing) {
                        this.connection.ping.startInterval(pingJid);
                    } else {
                        logger.warn(`Ping NOT supported by ${pingJid}`);
                    }
                });

            if (password) {
                this.authenticatedUser = true;
            }
            if (this.connection && this.connection.connected
                && Strophe.getResourceFromJid(this.connection.jid)) {
                // .connected is true while connecting?
    //                this.connection.send($pres());
                this.eventEmitter.emit(
                        JitsiConnectionEvents.CONNECTION_ESTABLISHED,
                        Strophe.getResourceFromJid(this.connection.jid));
            }
        } else if (status === Strophe.Status.CONNFAIL) {
            if (msg === 'x-strophe-bad-non-anon-jid') {
                this.anonymousConnectionFailed = true;
            } else {
                this.connectionFailed = true;
            }
            this.lastErrorMsg = msg;
        } else if (status === Strophe.Status.DISCONNECTED) {
            // Stop ping interval
            this.connection.ping.stopInterval();
            const wasIntentionalDisconnect = this.disconnectInProgress;
            const errMsg = msg ? msg : this.lastErrorMsg;

            this.disconnectInProgress = false;
            if (this.anonymousConnectionFailed) {
                // prompt user for username and password
                this.eventEmitter.emit(
                    JitsiConnectionEvents.CONNECTION_FAILED,
                    JitsiConnectionErrors.PASSWORD_REQUIRED);
            } else if (this.connectionFailed) {
                this.eventEmitter.emit(
                    JitsiConnectionEvents.CONNECTION_FAILED,
                    JitsiConnectionErrors.OTHER_ERROR, errMsg);
            } else if (wasIntentionalDisconnect) {
                this.eventEmitter.emit(
                    JitsiConnectionEvents.CONNECTION_DISCONNECTED, errMsg);
            } else {
                // XXX if Strophe drops the connection while not being asked to,
                // it means that most likely some serious error has occurred.
                // One currently known case is when a BOSH request fails for
                // more than 4 times. The connection is dropped without
                // supplying a reason(error message/event) through the API.
                logger.error('XMPP connection dropped!');

                // XXX if the last request error is within 5xx range it means it
                // was a server failure
                const lastErrorStatus = Strophe.getLastErrorStatus();

                if (lastErrorStatus >= 500 && lastErrorStatus < 600) {
                    this.eventEmitter.emit(
                        JitsiConnectionEvents.CONNECTION_FAILED,
                        JitsiConnectionErrors.SERVER_ERROR,
                        errMsg ? errMsg : 'server-error');
                } else {
                    this.eventEmitter.emit(
                        JitsiConnectionEvents.CONNECTION_FAILED,
                        JitsiConnectionErrors.CONNECTION_DROPPED_ERROR,
                        errMsg ? errMsg : 'connection-dropped-error');
                }
            }
        } else if (status === Strophe.Status.AUTHFAIL) {
            // wrong password or username, prompt user
            this.eventEmitter.emit(JitsiConnectionEvents.CONNECTION_FAILED,
                JitsiConnectionErrors.PASSWORD_REQUIRED);

        }
    }

    _connect(jid, password) {
        // connection.connect() starts the connection process.
        //
        // As the connection process proceeds, the user supplied callback will
        // be triggered multiple times with status updates. The callback should
        // take two arguments - the status code and the error condition.
        //
        // The status code will be one of the values in the Strophe.Status
        // constants. The error condition will be one of the conditions defined
        // in RFC 3920 or the condition ‘strophe-parsererror’.
        //
        // The Parameters wait, hold and route are optional and only relevant
        // for BOSH connections. Please see XEP 124 for a more detailed
        // explanation of the optional parameters.
        //
        // Connection status constants for use by the connection handler
        // callback.
        //
        //  Status.ERROR - An error has occurred (websockets specific)
        //  Status.CONNECTING - The connection is currently being made
        //  Status.CONNFAIL - The connection attempt failed
        //  Status.AUTHENTICATING - The connection is authenticating
        //  Status.AUTHFAIL - The authentication attempt failed
        //  Status.CONNECTED - The connection has succeeded
        //  Status.DISCONNECTED - The connection has been terminated
        //  Status.DISCONNECTING - The connection is currently being terminated
        //  Status.ATTACHED - The connection has been attached

        this.anonymousConnectionFailed = false;
        this.connectionFailed = false;
        this.lastErrorMsg = undefined;
        this.connection.connect(jid, password,
            this.connectionHandler.bind(this, password));
    }

    /**
     * Attach to existing connection. Can be used for optimizations. For example:
     * if the connection is created on the server we can attach to it and start
     * using it.
     *
     * @param options {object} connecting options - rid, sid, jid and password.
     */
    attach(options) {
        const now = this.connectionTimes.attaching = window.performance.now();

        logger.log(`(TIME) Strophe Attaching\t:${now}`);
        this.connection.attach(options.jid, options.sid,
            parseInt(options.rid, 10) + 1,
            this.connectionHandler.bind(this, options.password));
    }

    connect(jid, password) {
        this.connectParams = {
            jid,
            password
        };
        if (!jid) {
            let configDomain
                = this.options.hosts.anonymousdomain
                    || this.options.hosts.domain;

            // Force authenticated domain if room is appended with '?login=true'
            // or if we're joining with the token

            if (this.options.hosts.anonymousdomain
                    && (window.location.search.indexOf('login=true') !== -1
                        || this.options.token)) {
                configDomain = this.options.hosts.domain;
            }
            jid = configDomain || window.location.hostname;
        }

        return this._connect(jid, password);
    }

    createRoom(roomName, options) {
        // By default MUC nickname is the resource part of the JID
        let mucNickname = Strophe.getNodeFromJid(this.connection.jid);
        let roomjid = `${roomName}@${this.options.hosts.muc}/`;
        const cfgNickname
            = options.useNicks && options.nick ? options.nick : null;

        if (cfgNickname) {
            // Use nick if it's defined
            mucNickname = options.nick;
        } else if (!this.authenticatedUser) {
            // node of the anonymous JID is very long - here we trim it a bit
            mucNickname = mucNickname.substr(0, 8);
        }

        // Constant JIDs need some random part to be appended in order to be
        // able to join the MUC more than once.
        if (this.authenticatedUser || cfgNickname !== null) {
            mucNickname += `-${RandomUtil.randomHexString(6)}`;
        }

        roomjid += mucNickname;

        return this.connection.emuc.createRoom(roomjid, null, options);
    }

    /**
     * Returns the logs from strophe.jingle.
     * @returns {Object}
     */
    getJingleLog() {
        const jingle = this.connection.jingle;


        return jingle ? jingle.getLog() : {};
    }

    /**
     * Returns the logs from strophe.
     */
    getXmppLog() {
        return (this.connection.logger || {}).log || null;
    }

    dial(to, from, roomName, roomPass) {
        this.connection.rayo.dial(to, from, roomName, roomPass);
    }

    setMute(jid, mute) {
        this.connection.moderate.setMute(jid, mute);
    }

    eject(jid) {
        this.connection.moderate.eject(jid);
    }

    getSessions() {
        return this.connection.jingle.sessions;
    }

    /**
     * Disconnects this from the XMPP server (if this is connected).
     *
     * @param ev optionally, the event which triggered the necessity to disconnect
     * from the XMPP server (e.g. beforeunload, unload)
     */
    disconnect(ev) {
        if (this.disconnectInProgress
                || !this.connection
                || !this.connection.connected) {
            this.eventEmitter.emit(JitsiConnectionEvents.WRONG_STATE);

            return;
        }

        this.disconnectInProgress = true;

        // XXX Strophe is asynchronously sending by default. Unfortunately, that
        // means that there may not be enough time to send an unavailable presence
        // or disconnect at all. Switching Strophe to synchronous sending is not
        // much of an option because it may lead to a noticeable delay in navigating
        // away from the current location. As a compromise, we will try to increase
        // the chances of sending an unavailable presence and/or disconecting within
        // the short time span that we have upon unloading by invoking flush() on
        // the connection. We flush() once before disconnect() in order to attemtp
        // to have its unavailable presence at the top of the send queue. We flush()
        // once more after disconnect() in order to attempt to have its unavailable
        // presence sent as soon as possible.
        this.connection.flush();

        if (ev !== null && typeof ev !== 'undefined') {
            const evType = ev.type;

            if (evType == 'beforeunload' || evType == 'unload') {
                // XXX Whatever we said above, synchronous sending is the best
                // (known) way to properly disconnect from the XMPP server.
                // Consequently, it may be fine to have the source code and comment
                // it in or out depending on whether we want to run with it for some
                // time.
                this.connection.options.sync = true;
            }
        }

        this.connection.disconnect();

        if (this.connection.options.sync !== true) {
            this.connection.flush();
        }
    }

    _initStrophePlugins() {
        initEmuc(this);
        initJingle(this, this.eventEmitter);
        initStropheUtil();
        initPing(this);
        initRayo();
        initStropheLogger();
    }
}
