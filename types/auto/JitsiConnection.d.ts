/**
 * Creates a new connection object for the Jitsi Meet server side video
 * conferencing service. Provides access to the JitsiConference interface.
 * @param appID identification for the provider of Jitsi Meet video conferencing
 * services.
 * @param token the JWT token used to authenticate with the server(optional)
 * @param options Object with properties / settings related to connection with
 * the server.
 * @constructor
 */
export default function JitsiConnection(appID: any, token: any, options: any): void;
export default class JitsiConnection {
    /**
     * Creates a new connection object for the Jitsi Meet server side video
     * conferencing service. Provides access to the JitsiConference interface.
     * @param appID identification for the provider of Jitsi Meet video conferencing
     * services.
     * @param token the JWT token used to authenticate with the server(optional)
     * @param options Object with properties / settings related to connection with
     * the server.
     * @constructor
     */
    constructor(appID: any, token: any, options: any);
    appID: any;
    token: any;
    options: any;
    xmpp: XMPP;
    /**
     * Connect the client with the server.
     * @param options {object} connecting options
     * (for example authentications parameters).
     */
    connect(options?: object): void;
    /**
     * Attach to existing connection. Can be used for optimizations. For example:
     * if the connection is created on the server we can attach to it and start
     * using it.
     *
     * @param options {object} connecting options - rid, sid and jid.
     */
    attach(options: object): void;
    /**
     * Disconnect the client from the server.
     * @returns {Promise} - Resolves when the disconnect process is finished or rejects with an error.
     */
    disconnect(...args: any[]): Promise<any>;
    /**
     * Returns the jid of the participant associated with the XMPP connection.
     *
     * @returns {string} The jid of the participant.
     */
    getJid(): string;
    /**
     * This method allows renewal of the tokens if they are expiring.
     * @param token the new token.
     */
    setToken(token: any): void;
    /**
     * Creates and joins new conference.
     * @param name the name of the conference; if null - a generated name will be
     * provided from the api
     * @param options Object with properties / settings related to the conference
     * that will be created.
     * @returns {JitsiConference} returns the new conference object.
     */
    initJitsiConference(name: any, options: any): JitsiConference;
    /**
     * Subscribes the passed listener to the event.
     * @param event {JitsiConnectionEvents} the connection event.
     * @param listener {Function} the function that will receive the event
     */
    addEventListener(event: typeof JitsiConnectionEvents, listener: Function): void;
    /**
     * Unsubscribes the passed handler.
     * @param event {JitsiConnectionEvents} the connection event.
     * @param listener {Function} the function that will receive the event
     */
    removeEventListener(event: typeof JitsiConnectionEvents, listener: Function): void;
    /**
     * Returns measured connectionTimes.
     */
    getConnectionTimes(): {};
    /**
     * Adds new feature to the list of supported features for the local
     * participant.
     * @param {String} feature the name of the feature.
     * @param {boolean} submit if true - the new list of features will be
     * immediately submitted to the others.
     */
    addFeature(feature: string, submit?: boolean): void;
    /**
     * Removes a feature from the list of supported features for the local
     * participant
     * @param {String} feature the name of the feature.
     * @param {boolean} submit if true - the new list of features will be
     * immediately submitted to the others.
     */
    removeFeature(feature: string, submit?: boolean): void;
    /**
     * Get object with internal logs.
     */
    getLogs(): any;
}
import XMPP from "./modules/xmpp/xmpp";
import JitsiConference from "./JitsiConference";
import * as JitsiConnectionEvents from "./JitsiConnectionEvents";
