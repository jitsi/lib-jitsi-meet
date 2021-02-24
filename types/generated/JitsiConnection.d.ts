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
    connect(options?: object): void;
    attach(options: object): void;
    disconnect(...args: any[]): Promise<any>;
    getJid(): string;
    setToken(token: any): void;
    initJitsiConference(name: any, options: any): JitsiConference;
    addEventListener(event: typeof JitsiConnectionEvents, listener: Function): void;
    removeEventListener(event: typeof JitsiConnectionEvents, listener: Function): void;
    getConnectionTimes(): {};
    addFeature(feature: string, submit?: boolean): void;
    removeFeature(feature: string, submit?: boolean): void;
    getLogs(): any;
}
import XMPP from "./modules/xmpp/xmpp";
import JitsiConference from "./JitsiConference";
import * as JitsiConnectionEvents from "./JitsiConnectionEvents";
