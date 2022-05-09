/* global $ */

import { getLogger } from '@jitsi/logger';
import { $msg, Strophe } from 'strophe.js';
import 'strophejs-plugin-disco';

import * as JitsiConnectionErrors from '../../JitsiConnectionErrors';
import * as JitsiConnectionEvents from '../../JitsiConnectionEvents';
import { XMPPEvents } from '../../service/xmpp/XMPPEvents';
import browser from '../browser';
import { E2EEncryption } from '../e2ee/E2EEncryption';
import FeatureFlags from '../flags/FeatureFlags';
import Statistics from '../statistics/statistics';
import GlobalOnErrorHandler from '../util/GlobalOnErrorHandler';
import Listenable from '../util/Listenable';
import RandomUtil from '../util/RandomUtil';

import Caps, { parseDiscoInfo } from './Caps';
import XmppConnection from './XmppConnection';
import MucConnectionPlugin from './strophe.emuc';
import JingleConnectionPlugin from './strophe.jingle';
import initStropheLogger from './strophe.logger';
import RayoConnectionPlugin from './strophe.rayo';
import initStropheUtil from './strophe.util';

const logger = getLogger(__filename);

/**
* Regex to extract exact error message on jwt error.
*/
const FAILURE_REGEX = /<failure.*><not-allowed\/><text>(.*)<\/text><\/failure>/gi;

/**
 * Creates XMPP connection.
 *
 * @param {Object} options
 * @param {string} [options.token] - JWT token used for authentication(JWT authentication module must be enabled in
 * Prosody).
 * @param {string} options.serviceUrl - The service URL for XMPP connection.
 * @param {string} options.shard - The shard where XMPP connection initially landed.
 * @param {string} options.enableWebsocketResume - True to enable stream resumption.
 * @param {number} [options.websocketKeepAlive] - See {@link XmppConnection} constructor.
 * @param {number} [options.websocketKeepAliveUrl] - See {@link XmppConnection} constructor.
 * @param {Object} [options.xmppPing] - See {@link XmppConnection} constructor.
 * @returns {XmppConnection}
 */
function createConnection({
    enableWebsocketResume,
    serviceUrl = '/http-bind',
    shard,
    token,
    websocketKeepAlive,
    websocketKeepAliveUrl,
    xmppPing }) {

    // Append token as URL param
    if (token) {
        // eslint-disable-next-line no-param-reassign
        serviceUrl += `${serviceUrl.indexOf('?') === -1 ? '?' : '&'}token=${token}`;
    }

    return new XmppConnection({
        enableWebsocketResume,
        serviceUrl,
        websocketKeepAlive,
        websocketKeepAliveUrl,
        xmppPing,
        shard
    });
}

/**
 * Initializes Strophe plugins that need to work with Strophe.Connection directly rather than the lib-jitsi-meet's
 * {@link XmppConnection} wrapper.
 *
 * @returns {void}
 */
function initStropheNativePlugins() {
    initStropheUtil();
    initStropheLogger();
}

// FIXME: remove once we have a default config template. -saghul
/**
 * A list of ice servers to use by default for P2P.
 */
export const DEFAULT_STUN_SERVERS = [
    { urls: 'stun:meet-jit-si-turnrelay.jitsi.net:443' }
];

/**
 * The name of the field used to recognize a chat message as carrying a JSON
 * payload from another endpoint.
 * If the json-message of a chat message contains a valid JSON object, and
 * the JSON has this key, then it is a valid json-message to be sent.
 */
export const JITSI_MEET_MUC_TYPE = 'type';

/**
 * The feature used by jigasi participants.
 * @type {string}
 */
export const FEATURE_JIGASI = 'http://jitsi.org/protocol/jigasi';

/**
 * The feature used by the lib to mark support for e2ee. We use the feature by putting it in the presence
 * to avoid additional signaling (disco-info).
 * @type {string}
 */
export const FEATURE_E2EE = 'https://jitsi.org/meet/e2ee';

/**
 *
 */
export default class XMPP extends Listenable {
    /**
     * FIXME describe all options
     * @param {Object} options
     * @param {String} options.serviceUrl - URL passed to the XMPP client which will be used to establish XMPP
     * connection with the server.
     * @param {String} options.bosh - Deprecated, use {@code serviceUrl}.
     * @param {boolean} options.enableWebsocketResume - Enables XEP-0198 stream management which will make the XMPP
     * module try to resume the session in case the Websocket connection breaks.
     * @param {number} [options.websocketKeepAlive] - The websocket keep alive interval. See {@link XmppConnection}
     * constructor for more details.
     * @param {number} [options.websocketKeepAliveUrl] - The websocket keep alive url. See {@link XmppConnection}
     * constructor for more details.
     * @param {Object} [options.xmppPing] - The xmpp ping settings.
     * @param {Array<Object>} options.p2pStunServers see {@link JingleConnectionPlugin} for more details.
     * @param token
     */
    constructor(options, token) {
        super();
        this.connection = null;
        this.disconnectInProgress = false;
        this.connectionTimes = {};
        this.options = options;
        this.token = token;
        this.authenticatedUser = false;

        initStropheNativePlugins();

        const xmppPing = options.xmppPing || {};

        // let's ping the main domain (in case a guest one is used for the connection)
        xmppPing.domain = options.hosts.domain;

        this.connection = createConnection({
            enableWebsocketResume: options.enableWebsocketResume,

            // FIXME remove deprecated bosh option at some point
            serviceUrl: options.serviceUrl || options.bosh,
            token,
            websocketKeepAlive: options.websocketKeepAlive,
            websocketKeepAliveUrl: options.websocketKeepAliveUrl,
            xmppPing,
            shard: options.deploymentInfo?.shard
        });

        // forwards the shard changed event
        this.connection.on(XmppConnection.Events.CONN_SHARD_CHANGED, () => {
            /* eslint-disable camelcase */
            const details = {
                shard_changed: true,
                suspend_time: this.connection.ping.getPingSuspendTime(),
                time_since_last_success: this.connection.getTimeSinceLastSuccess()
            };
            /* eslint-enable camelcase */

            this.eventEmitter.emit(
                JitsiConnectionEvents.CONNECTION_FAILED,
                JitsiConnectionErrors.OTHER_ERROR,
                undefined,
                undefined,
                details);
        });

        this._initStrophePlugins();

        this.caps = new Caps(this.connection, /* clientNode */ 'https://jitsi.org/jitsi-meet');

        // Initialize features advertised in disco-info
        this.initFeaturesList();

        // Setup a disconnect on unload as a way to facilitate API consumers. It
        // sounds like they would want that. A problem for them though may be if
        // they wanted to utilize the connected connection in an unload handler
        // of their own. However, it should be fairly easy for them to do that
        // by registering their unload handler before us.
        $(window).on(`${this.options.disableBeforeUnloadHandlers ? '' : 'beforeunload '}unload`, ev => {
            this.disconnect(ev).catch(() => {
                // ignore errors in order to not brake the unload.
            });
        });
    }

    /**
     * Initializes the list of feature advertised through the disco-info
     * mechanism.
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
        this.caps.addFeature('http://jitsi.org/json-encoded-sources');

        if (!(this.options.disableRtx || !browser.supportsRTX())) {
            this.caps.addFeature('urn:ietf:rfc:4588');
        }
        if (this.options.enableOpusRed === true && browser.supportsAudioRed()) {
            this.caps.addFeature('http://jitsi.org/opus-red');
        }

        if (typeof this.options.enableRemb === 'undefined' || this.options.enableRemb) {
            this.caps.addFeature('http://jitsi.org/remb');
        }

        // Disable TCC on Firefox because of a known issue where BWE is halved on every renegotiation.
        if (!browser.isFirefox() && (typeof this.options.enableTcc === 'undefined' || this.options.enableTcc)) {
            this.caps.addFeature('http://jitsi.org/tcc');
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
        if (browser.isChromiumBased() && this.options.enableLipSync === true) {
            logger.info('Lip-sync enabled !');
            this.caps.addFeature('http://jitsi.org/meet/lipsync');
        }

        if (this.connection.rayo) {
            this.caps.addFeature('urn:xmpp:rayo:client:1');
        }

        if (E2EEncryption.isSupported(this.options)) {
            this.caps.addFeature(FEATURE_E2EE, false, true);
        }

        // Advertise source-name signaling when the endpoint supports it.
        if (FeatureFlags.isSourceNameSignalingEnabled()) {
            logger.info('Source-name signaling is enabled');
            this.caps.addFeature('http://jitsi.org/source-name');
        }

        if (FeatureFlags.isSsrcRewritingSupported()) {
            logger.info('SSRC rewriting is supported');
            this.caps.addFeature('http://jitsi.org/ssrc-rewriting');
        }
    }

    /**
     *
     */
    getConnection() {
        return this.connection;
    }

    /**
     * Receive connection status changes and handles them.
     *
     * @param {Object} credentials
     * @param {string} credentials.jid - The user's XMPP ID passed to the
     * connect method. For example, 'user@xmpp.com'.
     * @param {string} credentials.password - The password passed to the connect
     * method.
     * @param {string} status - One of Strophe's connection status strings.
     * @param {string} [msg] - The connection error message provided by Strophe.
     */
    connectionHandler(credentials = {}, status, msg) {
        const now = window.performance.now();
        const statusStr = Strophe.getStatusString(status).toLowerCase();

        this.connectionTimes[statusStr] = now;
        logger.log(
            `(TIME) Strophe ${statusStr}${msg ? `[${msg}]` : ''}:\t`,
            now);

        this.eventEmitter.emit(XMPPEvents.CONNECTION_STATUS_CHANGED, credentials, status, msg);
        this._maybeSendDeploymentInfoStat();
        if (status === Strophe.Status.CONNECTED || status === Strophe.Status.ATTACHED) {
            // once connected or attached we no longer need this handle, drop it if it exist
            if (this._sysMessageHandler) {
                this.connection._stropheConn.deleteHandler(this._sysMessageHandler);
                this._sysMessageHandler = null;
            }

            this.sendDiscoInfo && this.connection.jingle.getStunAndTurnCredentials();

            logger.info(`My Jabber ID: ${this.connection.jid}`);

            // XmppConnection emits CONNECTED again on reconnect - a good opportunity to clear any "last error" flags
            this._resetState();

            // make sure we will send the info after the features request succeeds or fails
            this.sendDeploymentInfo = false;
            this.sendDiscoInfo && this.caps.getFeaturesAndIdentities(this.options.hosts.domain)
                .then(({ features, identities }) => {
                    if (!features.has(Strophe.NS.PING)) {
                        logger.error(`Ping NOT supported by ${
                            this.options.hosts.domain} - please enable ping in your XMPP server config`);
                    }

                    this._processDiscoInfoIdentities(
                        identities, undefined /* when querying we will query for features */);
                })
                .catch(error => {
                    const errmsg = 'Feature discovery error';

                    GlobalOnErrorHandler.callErrorHandler(
                        new Error(`${errmsg}: ${error}`));
                    logger.error(errmsg, error);

                    this._maybeSendDeploymentInfoStat(true);
                });

            // make sure we don't query again
            this.sendDiscoInfo = false;

            if (credentials.password) {
                this.authenticatedUser = true;
            }
            if (this.connection && this.connection.connected
                && Strophe.getResourceFromJid(this.connection.jid)) {
                // .connected is true while connecting?
                // this.connection.send($pres());
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
            if (msg === 'giving-up') {
                this.eventEmitter.emit(
                    JitsiConnectionEvents.CONNECTION_FAILED,
                    JitsiConnectionErrors.OTHER_ERROR, msg);
            }
        } else if (status === Strophe.Status.ERROR) {
            this.lastErrorMsg = msg;
        } else if (status === Strophe.Status.DISCONNECTED) {
            // Stop ping interval
            this.connection.ping.stopInterval();
            const wasIntentionalDisconnect = Boolean(this.disconnectInProgress);
            const errMsg = msg || this.lastErrorMsg;

            if (this.anonymousConnectionFailed) {
                // prompt user for username and password
                this.eventEmitter.emit(
                    JitsiConnectionEvents.CONNECTION_FAILED,
                    JitsiConnectionErrors.PASSWORD_REQUIRED);
            } else if (this.connectionFailed) {
                this.eventEmitter.emit(
                    JitsiConnectionEvents.CONNECTION_FAILED,
                    JitsiConnectionErrors.OTHER_ERROR,
                    errMsg,
                    undefined, /* credentials */
                    this._getConnectionFailedReasonDetails());
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
                        errMsg || 'server-error',
                        /* credentials */ undefined,
                        this._getConnectionFailedReasonDetails());
                } else {
                    this.eventEmitter.emit(
                        JitsiConnectionEvents.CONNECTION_FAILED,
                        JitsiConnectionErrors.CONNECTION_DROPPED_ERROR,
                        errMsg || 'connection-dropped-error',
                        /* credentials */ undefined,
                        this._getConnectionFailedReasonDetails());
                }
            }
        } else if (status === Strophe.Status.AUTHFAIL) {
            const lastFailedRawMessage = this.getConnection().getLastFailedMessage();

            // wrong password or username, prompt user
            this.eventEmitter.emit(
                JitsiConnectionEvents.CONNECTION_FAILED,
                JitsiConnectionErrors.PASSWORD_REQUIRED,
                msg || this._parseConnectionFailedMessage(lastFailedRawMessage),
                credentials);
        }
    }

    /**
     * Process received identities.
     * @param {Set<String>} identities The identities to process.
     * @param {Set<String>} features The features to process, optional. If missing lobby component will be queried
     * for more features.
     * @private
     */
    _processDiscoInfoIdentities(identities, features) {
        // check for speakerstats
        identities.forEach(identity => {
            if (identity.type === 'av_moderation') {
                this.avModerationComponentAddress = identity.name;
            }

            if (identity.type === 'speakerstats') {
                this.speakerStatsComponentAddress = identity.name;
            }

            if (identity.type === 'conference_duration') {
                this.conferenceDurationComponentAddress = identity.name;
            }

            if (identity.type === 'lobbyrooms') {
                this.lobbySupported = true;
                const processLobbyFeatures = f => {
                    f.forEach(fr => {
                        if (fr.endsWith('#displayname_required')) {
                            this.eventEmitter.emit(JitsiConnectionEvents.DISPLAY_NAME_REQUIRED);
                        }
                    });
                };

                if (features) {
                    processLobbyFeatures(features);
                } else {
                    identity.name && this.caps.getFeaturesAndIdentities(identity.name, identity.type)
                        .then(({ features: f }) => processLobbyFeatures(f))
                        .catch(e => logger.warn('Error getting features from lobby.', e && e.message));
                }
            }

            if (identity.type === 'shard') {
                this.options.deploymentInfo.shard = this.connection.shard = identity.name;
            }

            if (identity.type === 'region') {
                this.options.deploymentInfo.region = this.connection.region = identity.name;
            }

            if (identity.type === 'breakout_rooms') {
                this.breakoutRoomsComponentAddress = identity.name;
            }
        });

        this._maybeSendDeploymentInfoStat(true);

        if (this.avModerationComponentAddress
            || this.speakerStatsComponentAddress
            || this.conferenceDurationComponentAddress
            || this.breakoutRoomsComponentAddress) {
            this.connection.addHandler(this._onPrivateMessage.bind(this), null, 'message', null, null);
        }
    }

    /**
    * Parses a raw failure xmpp xml message received on auth failed.
    *
    * @param {string} msg - The raw failure message from xmpp.
    * @returns {string|null} - The parsed message from the raw xmpp message.
    */
    _parseConnectionFailedMessage(msg) {
        if (!msg) {
            return null;
        }

        const matches = FAILURE_REGEX.exec(msg);

        return matches ? matches[1] : null;
    }

    /**
     *
     * @param jid
     * @param password
     */
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

        this._resetState();

        // we want to send this only on the initial connect
        this.sendDiscoInfo = true;
        this.sendDeploymentInfo = true;

        if (this.connection._stropheConn && this.connection._stropheConn._addSysHandler) {
            this._sysMessageHandler = this.connection._stropheConn._addSysHandler(
                this._onSystemMessage.bind(this),
                null,
                'message'
            );
        } else {
            logger.warn('Cannot attach strophe system handler, jiconop cannot operate');
        }

        this.connection.connect(
            jid,
            password,
            this.connectionHandler.bind(this, {
                jid,
                password
            }));
    }

    /**
     * Receives system messages during the connect/login process and checks for services or
     * @param msg The received message.
     * @returns {void}
     * @private
     */
    _onSystemMessage(msg) {
        // proceed only if the message has any of the expected information
        if ($(msg).find('>services').length === 0 && $(msg).find('>query').length === 0) {
            return;
        }

        this.sendDiscoInfo = false;

        const foundIceServers = this.connection.jingle.onReceiveStunAndTurnCredentials(msg);

        const { features, identities } = parseDiscoInfo(msg);

        this._processDiscoInfoIdentities(identities, features);

        if (foundIceServers || identities.size > 0 || features.size > 0) {
            this.connection._stropheConn.deleteHandler(this._sysMessageHandler);
            this._sysMessageHandler = null;
        }
    }

    /**
     * Attach to existing connection. Can be used for optimizations. For
     * example: if the connection is created on the server we can attach to it
     * and start using it.
     *
     * @param options {object} connecting options - rid, sid, jid and password.
     */
    attach(options) {
        this._resetState();

        // we want to send this only on the initial connect
        this.sendDiscoInfo = true;

        const now = this.connectionTimes.attaching = window.performance.now();

        logger.log('(TIME) Strophe Attaching:\t', now);
        this.connection.attach(options.jid, options.sid,
            parseInt(options.rid, 10) + 1,
            this.connectionHandler.bind(this, {
                jid: options.jid,
                password: options.password
            }));
    }

    /**
     * Resets any state/flag before starting a new connection.
     * @private
     */
    _resetState() {
        this.anonymousConnectionFailed = false;
        this.connectionFailed = false;
        this.lastErrorMsg = undefined;
        this.disconnectInProgress = undefined;
    }

    /**
     *
     * @param jid
     * @param password
     */
    connect(jid, password) {
        if (!jid) {
            const { anonymousdomain, domain } = this.options.hosts;
            let configDomain = anonymousdomain || domain;

            // Force authenticated domain if room is appended with '?login=true'
            // or if we're joining with the token

            // FIXME Do not rely on window.location because (1) React Native
            // does not have a window.location by default and (2) here we cannot
            // know for sure that query/search has not be stripped from
            // window.location by the time the following executes.
            const { location } = window;

            if (anonymousdomain) {
                const search = location && location.search;

                if ((search && search.indexOf('login=true') !== -1)
                        || this.token) {
                    configDomain = domain;
                }
            }

            // eslint-disable-next-line no-param-reassign
            jid = configDomain || (location && location.hostname);
        }

        return this._connect(jid, password);
    }

    /**
     * Joins or creates a muc with the provided jid, created from the passed
     * in room name and muc host and onCreateResource result.
     *
     * @param {string} roomName - The name of the muc to join.
     * @param {Object} options - Configuration for how to join the muc.
     * @param {Function} [onCreateResource] - Callback to invoke when a resource
     * is to be added to the jid.
     * @returns {Promise} Resolves with an instance of a strophe muc.
     */
    createRoom(roomName, options, onCreateResource) {
        // Support passing the domain in a String object as part of the room name.
        const domain = roomName.domain || options.customDomain;

        // There are cases (when using subdomain) where muc can hold an uppercase part
        let roomjid = `${this.getRoomJid(roomName, domain)}/`;
        const mucNickname = onCreateResource
            ? onCreateResource(this.connection.jid, this.authenticatedUser)
            : RandomUtil.randomHexString(8).toLowerCase();

        logger.info(`JID ${this.connection.jid} using MUC nickname ${mucNickname}`);
        roomjid += mucNickname;

        return this.connection.emuc.createRoom(roomjid, null, options);
    }

    /**
     * Returns the room JID based on the passed room name and domain.
     *
     * @param {string} roomName - The room name.
     * @param {string} domain - The domain.
     * @returns {string} - The room JID.
     */
    getRoomJid(roomName, domain) {
        return `${roomName}@${domain ? domain : this.options.hosts.muc.toLowerCase()}`;
    }

    /**
     * Check if a room with the passed JID is already created.
     *
     * @param {string} roomJid - The JID of the room.
     * @returns {boolean}
     */
    isRoomCreated(roomName, domain) {
        return this.connection.emuc.isRoomCreated(this.getRoomJid(roomName, domain));
    }

    /**
     * Returns the jid of the participant associated with the Strophe connection.
     *
     * @returns {string} The jid of the participant.
     */
    getJid() {
        return this.connection.jid;
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

    /**
     *
     */
    dial(...args) {
        this.connection.rayo.dial(...args);
    }

    /**
     * Pings the server.
     * @param timeout how many ms before a timeout should occur.
     * @returns {Promise} resolved on ping success and reject on an error or
     * a timeout.
     */
    ping(timeout) {
        return new Promise((resolve, reject) => {
            this.connection.ping.ping(this.connection.pingDomain, resolve, reject, timeout);
        });
    }

    /**
     *
     */
    getSessions() {
        return this.connection.jingle.sessions;
    }

    /**
     * Disconnects this from the XMPP server (if this is connected).
     *
     * @param {Object} ev - Optionally, the event which triggered the necessity to
     * disconnect from the XMPP server (e.g. beforeunload, unload).
     * @returns {Promise} - Resolves when the disconnect process is finished or rejects with an error.
     */
    disconnect(ev) {
        if (this.disconnectInProgress) {
            return this.disconnectInProgress;
        } else if (!this.connection) {
            return Promise.resolve();
        }

        this.disconnectInProgress = new Promise(resolve => {
            const disconnectListener = (credentials, status) => {
                if (status === Strophe.Status.DISCONNECTED) {
                    resolve();
                    this.eventEmitter.removeListener(XMPPEvents.CONNECTION_STATUS_CHANGED, disconnectListener);
                }
            };

            this.eventEmitter.on(XMPPEvents.CONNECTION_STATUS_CHANGED, disconnectListener);
        });

        this._cleanupXmppConnection(ev);

        return this.disconnectInProgress;
    }

    /**
     * The method is supposed to gracefully close the XMPP connection and the main goal is to make sure that the current
     * participant will be removed from the conference XMPP MUC, so that it doesn't leave a "ghost" participant behind.
     *
     * @param {Object} ev - Optionally, the event which triggered the necessity to disconnect from the XMPP server
     * (e.g. beforeunload, unload).
     * @private
     * @returns {void}
     */
    _cleanupXmppConnection(ev) {
        // XXX Strophe is asynchronously sending by default. Unfortunately, that means that there may not be enough time
        // to send an unavailable presence or disconnect at all. Switching Strophe to synchronous sending is not much of
        // an option because it may lead to a noticeable delay in navigating away from the current location. As
        // a compromise, we will try to increase the chances of sending an unavailable presence and/or disconnecting
        // within the short time span that we have upon unloading by invoking flush() on the connection. We flush() once
        // before disconnect() in order to attempt to have its unavailable presence at the top of the send queue. We
        // flush() once more after disconnect() in order to attempt to have its unavailable presence sent as soon as
        // possible.
        !this.connection.isUsingWebSocket && this.connection.flush();

        if (!this.connection.isUsingWebSocket && ev !== null && typeof ev !== 'undefined') {
            const evType = ev.type;

            if (evType === 'beforeunload' || evType === 'unload') {
                // XXX Whatever we said above, synchronous sending is the best (known) way to properly disconnect from
                // the XMPP server. Consequently, it may be fine to have the source code and comment it in or out
                // depending on whether we want to run with it for some time.
                this.connection.options.sync = true;

                // This is needed in some browsers where sync xhr sending is disabled by default on unload.
                if (this.connection.sendUnavailableBeacon()) {

                    return;
                }
            }
        }

        this.connection.disconnect();

        if (this.connection.options.sync !== true) {
            this.connection.flush();
        }
    }

    /**
     *
     */
    _initStrophePlugins() {
        const iceConfig = {
            jvb: { iceServers: [ ] },
            p2p: { iceServers: [ ] }
        };

        const p2pStunServers = (this.options.p2p
            && this.options.p2p.stunServers) || DEFAULT_STUN_SERVERS;

        if (Array.isArray(p2pStunServers)) {
            logger.info('P2P STUN servers: ', p2pStunServers);
            iceConfig.p2p.iceServers = p2pStunServers;
        }

        if (this.options.p2p && this.options.p2p.iceTransportPolicy) {
            logger.info('P2P ICE transport policy: ',
                this.options.p2p.iceTransportPolicy);

            iceConfig.p2p.iceTransportPolicy
                = this.options.p2p.iceTransportPolicy;
        }

        this.connection.addConnectionPlugin('emuc', new MucConnectionPlugin(this));
        this.connection.addConnectionPlugin('jingle', new JingleConnectionPlugin(this, this.eventEmitter, iceConfig));
        this.connection.addConnectionPlugin('rayo', new RayoConnectionPlugin());
    }

    /**
     * Returns details about connection failure. Shard change or is it after
     * suspend.
     * @returns {object} contains details about a connection failure.
     * @private
     */
    _getConnectionFailedReasonDetails() {
        const details = {};

        // check for moving between shard if information is available
        if (this.options.deploymentInfo
            && this.options.deploymentInfo.shard
            && this.connection.lastResponseHeaders) {

            // split headers by line
            const headersArr = this.connection.lastResponseHeaders
                .trim().split(/[\r\n]+/);
            const headers = {};

            headersArr.forEach(line => {
                const parts = line.split(': ');
                const header = parts.shift();
                const value = parts.join(': ');

                headers[header] = value;
            });

            /* eslint-disable camelcase */
            details.shard_changed
                = this.options.deploymentInfo.shard
                    !== headers['x-jitsi-shard'];
            /* eslint-enable camelcase */
        }

        /* eslint-disable camelcase */
        // check for possible suspend
        details.suspend_time = this.connection.ping.getPingSuspendTime();
        details.time_since_last_success = this.connection.getTimeSinceLastSuccess();
        /* eslint-enable camelcase */

        return details;
    }

    /**
     * Notifies speaker stats component if available that we are the new
     * dominant speaker in the conference.
     * @param {String} roomJid - The room jid where the speaker event occurred.
     */
    sendDominantSpeakerEvent(roomJid) {
        // no speaker stats component advertised
        if (!this.speakerStatsComponentAddress || !roomJid) {
            return;
        }

        const msg = $msg({ to: this.speakerStatsComponentAddress });

        msg.c('speakerstats', {
            xmlns: 'http://jitsi.org/jitmeet',
            room: roomJid })
            .up();

        this.connection.send(msg);
    }

    /**
     * Sends face expressions to speaker stats component.
     * @param {String} roomJid - The room jid where the speaker event occurred.
     * @param {Object} payload - The expression to be sent to the speaker stats.
     */
    sendFaceExpressionEvent(roomJid, payload) {
        // no speaker stats component advertised
        if (!this.speakerStatsComponentAddress || !roomJid) {
            return;
        }

        const msg = $msg({ to: this.speakerStatsComponentAddress });

        msg.c('faceExpression', {
            xmlns: 'http://jitsi.org/jitmeet',
            room: roomJid,
            expression: payload.faceExpression,
            duration: payload.duration
        }).up();

        this.connection.send(msg);
    }

    /**
     * Check if the given argument is a valid JSON ENDPOINT_MESSAGE string by
     * parsing it and checking if it has a field called 'type'.
     *
     * @param {string} jsonString check if this string is a valid json string
     * and contains the special structure.
     * @returns {boolean, object} if given object is a valid JSON string, return
     * the json object. Otherwise, returns false.
     */
    tryParseJSONAndVerify(jsonString) {
        // ignore empty strings, like message errors
        if (!jsonString) {
            return false;
        }

        try {
            const json = JSON.parse(jsonString);

            // Handle non-exception-throwing cases:
            // Neither JSON.parse(false) or JSON.parse(1234) throw errors,
            // hence the type-checking,
            // but... JSON.parse(null) returns null, and
            // typeof null === "object",
            // so we must check for that, too.
            // Thankfully, null is falsey, so this suffices:
            if (json && typeof json === 'object') {
                const type = json[JITSI_MEET_MUC_TYPE];

                if (typeof type !== 'undefined') {
                    return json;
                }

                logger.debug('parsing valid json but does not have correct '
                    + 'structure', 'topic: ', type);
            }
        } catch (e) {
            logger.error(`Error parsing json ${jsonString}`, e);

            return false;
        }

        return false;
    }

    /**
     * A private message is received, message that is not addressed to the muc.
     * We expect private message coming from plugins component if it is
     * enabled and running.
     *
     * @param {string} msg - The message.
     */
    _onPrivateMessage(msg) {
        const from = msg.getAttribute('from');

        if (!(from === this.speakerStatsComponentAddress
            || from === this.conferenceDurationComponentAddress
            || from === this.avModerationComponentAddress
            || from === this.breakoutRoomsComponentAddress)) {
            return true;
        }

        const jsonMessage = $(msg).find('>json-message')
            .text();
        const parsedJson = this.tryParseJSONAndVerify(jsonMessage);

        if (!parsedJson) {
            return true;
        }

        if (parsedJson[JITSI_MEET_MUC_TYPE] === 'speakerstats' && parsedJson.users) {
            this.eventEmitter.emit(XMPPEvents.SPEAKER_STATS_RECEIVED, parsedJson.users);
        } else if (parsedJson[JITSI_MEET_MUC_TYPE] === 'conference_duration' && parsedJson.created_timestamp) {
            this.eventEmitter.emit(XMPPEvents.CONFERENCE_TIMESTAMP_RECEIVED, parsedJson.created_timestamp);
        } else if (parsedJson[JITSI_MEET_MUC_TYPE] === 'av_moderation') {
            this.eventEmitter.emit(XMPPEvents.AV_MODERATION_RECEIVED, parsedJson);
        } else if (parsedJson[JITSI_MEET_MUC_TYPE] === 'breakout_rooms') {
            this.eventEmitter.emit(XMPPEvents.BREAKOUT_ROOMS_EVENT, parsedJson);
        }

        return true;
    }

    /**
     * Sends deployment info to stats if not sent already.
     * We want to try sending it on failure to connect
     * or when we get a sys message(from jiconop2)
     * or after success or failure of disco-info
     * @param force Whether to force sending without checking anything.
     * @private
     */
    _maybeSendDeploymentInfoStat(force) {
        const acceptedStatuses = [
            Strophe.Status.ERROR,
            Strophe.Status.CONNFAIL,
            Strophe.Status.AUTHFAIL,
            Strophe.Status.DISCONNECTED,
            Strophe.Status.CONNTIMEOUT
        ];

        if (!force && !(acceptedStatuses.includes(this.connection.status) && this.sendDeploymentInfo)) {
            return;
        }

        // Log deployment-specific information, if available. Defined outside
        // the application by individual deployments
        const aprops = this.options.deploymentInfo;

        if (aprops && Object.keys(aprops).length > 0) {
            const logObject = {};

            logObject.id = 'deployment_info';
            for (const attr in aprops) {
                if (aprops.hasOwnProperty(attr)) {
                    logObject[attr] = aprops[attr];
                }
            }

            Statistics.sendLog(JSON.stringify(logObject));
        }

        this.sendDeploymentInfo = false;
    }
}
