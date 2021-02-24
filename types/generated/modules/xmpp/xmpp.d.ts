/**
 * A list of ice servers to use by default for P2P.
 */
export const DEFAULT_STUN_SERVERS: {
    urls: string;
}[];
/**
 * The name of the field used to recognize a chat message as carrying a JSON
 * payload from another endpoint.
 * If the json-message of a chat message contains a valid JSON object, and
 * the JSON has this key, then it is a valid json-message to be sent.
 */
export const JITSI_MEET_MUC_TYPE: "type";
/**
 * The feature used by jigasi participants.
 * @type {string}
 */
export const FEATURE_JIGASI: string;
/**
 * The feature used by the lib to mark support for e2ee. We use the feature by putting it in the presence
 * to avoid additional signaling (disco-info).
 * @type {string}
 */
export const FEATURE_E2EE: string;
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
    constructor(options: {
        serviceUrl: string;
        bosh: string;
    }, token: any);
    connection: XmppConnection;
    disconnectInProgress: boolean;
    connectionTimes: {};
    options: {
        serviceUrl: string;
        bosh: string;
    };
    token: any;
    authenticatedUser: boolean;
    caps: Caps;
    /**
     * Initializes the list of feature advertised through the disco-info
     * mechanism.
     */
    initFeaturesList(): void;
    /**
     *
     */
    getConnection(): XmppConnection;
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
    connectionHandler(credentials: {
        jid: string;
    }, status: string, msg?: string): void;
    speakerStatsComponentAddress: any;
    conferenceDurationComponentAddress: any;
    lobbySupported: boolean;
    anonymousConnectionFailed: boolean;
    connectionFailed: boolean;
    lastErrorMsg: string;
    /**
     *
     * @param jid
     * @param password
     */
    _connect(jid: any, password: any): void;
    /**
     * Attach to existing connection. Can be used for optimizations. For
     * example: if the connection is created on the server we can attach to it
     * and start using it.
     *
     * @param options {object} connecting options - rid, sid, jid and password.
     */
    attach(options: object): void;
    /**
     * Resets any state/flag before starting a new connection.
     * @private
     */
    private _resetState;
    /**
     *
     * @param jid
     * @param password
     */
    connect(jid: any, password: any): void;
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
    createRoom(roomName: string, options: any, onCreateResource?: Function): Promise<any>;
    /**
     * Returns the jid of the participant associated with the Strophe connection.
     *
     * @returns {string} The jid of the participant.
     */
    getJid(): string;
    /**
     * Returns the logs from strophe.jingle.
     * @returns {Object}
     */
    getJingleLog(): any;
    /**
     * Returns the logs from strophe.
     */
    getXmppLog(): any;
    /**
     *
     */
    dial(...args: any[]): void;
    /**
     * Pings the server.
     * @param timeout how many ms before a timeout should occur.
     * @returns {Promise} resolved on ping success and reject on an error or
     * a timeout.
     */
    ping(timeout: any): Promise<any>;
    /**
     *
     */
    getSessions(): any;
    /**
     * Disconnects this from the XMPP server (if this is connected).
     *
     * @param {Object} ev - Optionally, the event which triggered the necessity to
     * disconnect from the XMPP server (e.g. beforeunload, unload).
     * @returns {Promise} - Resolves when the disconnect process is finished or rejects with an error.
     */
    disconnect(ev: any): Promise<any>;
    /**
     * The method is supposed to gracefully close the XMPP connection and the main goal is to make sure that the current
     * participant will be removed from the conference XMPP MUC, so that it doesn't leave a "ghost" participant behind.
     *
     * @param {Object} ev - Optionally, the event which triggered the necessity to disconnect from the XMPP server
     * (e.g. beforeunload, unload).
     * @private
     * @returns {void}
     */
    private _cleanupXmppConnection;
    /**
     *
     */
    _initStrophePlugins(): void;
    /**
     * Returns details about connection failure. Shard change or is it after
     * suspend.
     * @returns {object} contains details about a connection failure.
     * @private
     */
    private _getConnectionFailedReasonDetails;
    /**
     * Notifies speaker stats component if available that we are the new
     * dominant speaker in the conference.
     * @param {String} roomJid - The room jid where the speaker event occurred.
     */
    sendDominantSpeakerEvent(roomJid: string): void;
    /**
     * Check if the given argument is a valid JSON ENDPOINT_MESSAGE string by
     * parsing it and checking if it has a field called 'type'.
     *
     * @param {string} jsonString check if this string is a valid json string
     * and contains the special structure.
     * @returns {boolean, object} if given object is a valid JSON string, return
     * the json object. Otherwise, returns false.
     */
    tryParseJSONAndVerify(jsonString: string): boolean;
    /**
     * A private message is received, message that is not addressed to the muc.
     * We expect private message coming from plugins component if it is
     * enabled and running.
     *
     * @param {string} msg - The message.
     */
    _onPrivateMessage(msg: string): boolean;
}
import Listenable from "../util/Listenable";
import XmppConnection from "./XmppConnection";
import Caps from "./Caps";
