import { getLogger } from '@jitsi/logger';

import JitsiConference from './JitsiConference';
import { JitsiConnectionEvents } from './JitsiConnectionEvents';
import RTCStats from './modules/RTCStats/RTCStats';
import FeatureFlags from './modules/flags/FeatureFlags';
import Statistics from './modules/statistics/statistics';
import XMPP from './modules/xmpp/xmpp';
import {
    AnalyticsEvents,
    createConnectionFailedEvent
} from './service/statistics/AnalyticsEvents';

const logger = getLogger('core:JitsiConnection');

export interface IConnectionOptions {
    analytics?: any;
    bridgeChannel?: {
        ignoreDomain?: string;
        preferSctp?: boolean;
    };
    disableFocus?: boolean;
    enableWebsocketResume: boolean;
    flags?: Record<string, any>;
    hosts: {
        domain: string;
    };
    name?: string;
    p2pStunServers: any[];
    serviceUrl: string;
    websocketKeepAlive?: number;
    websocketKeepAliveUrl?: string;
    xmppPing?: any;
}

export interface IConnectOptions {
    id?: string;
    name?: string;
    password?: string;
}

export interface IAttachOptions {
    jid: string;
    rid: string;
    sid: string;
}

/**
 * Creates a new connection object for the Jitsi Meet server side video
 * conferencing service. Provides access to the JitsiConference interface.
 */
export default class JitsiConnection {
    private appID?: string;
    private token?: string;
    private _xmpp: XMPP;
    readonly options: IConnectionOptions;

    /**
     * Creates a new JitsiConnection instance.
     * @param appID - Identification for the provider of Jitsi Meet video conferencing services.
     * @param token - The JWT token used to authenticate with the server (optional).
     * @param options - Object with properties / settings related to connection with the server.
     */
    constructor(appID: string, token: Nullable<string>, options: IConnectionOptions) {
        this.appID = appID;
        this.token = token;
        this.options = options;

        // Initialize the feature flags so that they are advertised through the disco-info.
        FeatureFlags.init(options.flags || {});

        this._xmpp = new XMPP(options, token);

        this.addEventListener(JitsiConnectionEvents.CONNECTION_FAILED,
            (errType: string, msg: string, credentials: any, details: any) => {
                Statistics.sendAnalyticsAndLog(
                    createConnectionFailedEvent(errType, msg, details));
            });

        this.addEventListener(JitsiConnectionEvents.CONNECTION_DISCONNECTED,
            (msg: string) => {
                // we can see disconnects from normal tab closing of the browser
                // and then there are no msgs, but we want to log only disconnects
                // when there is real error
                // XXX Do we need the difference in handling between the log and
                // analytics event here?
                if (msg) {
                    Statistics.sendAnalytics(
                        AnalyticsEvents.CONNECTION_DISCONNECTED,
                        { message: msg });
                }
            });
    }

    /**
     * Connect the client with the server.
     * @param options - Connecting options (for example authentications parameters).
     * @param options.id - The username to use when connecting, if any.
     * @param options.password - The password to use when connecting with username, if any.
     * @param options.name - The name of the room/conference we will be connecting to. This is needed on connection
     * time to be able to send conference-request over http. If missing the flow where we send conference-iq to jicofo over
     * the established xmpp connection will be used, even in the case where we have configured conference http request url
     * to be used.
     */
    connect(options: IConnectOptions = {}): void {

        RTCStats.startWithConnection(this);

        // if we get redirected, we set disableFocus to skip sending the conference request twice
        if (this.xmpp.moderator.targetUrl && !this.options.disableFocus && options.name) {
            // The domain (optional) will uses this.options.hosts.muc.toLowerCase() if not provided
            this.xmpp.moderator.sendConferenceRequest(this.xmpp.getRoomJid(options.name, undefined))
                .then(() => {
                    this.xmpp.connect(options.id, options.password);
                })
                .catch(e => logger.trace('sendConferenceRequest rejected', e));
        } else {
            this.xmpp.connect(options.id, options.password);
        }
    }

    /**
     * Attach to existing connection. Can be used for optimizations. For example:
     * if the connection is created on the server we can attach to it and start
     * using it.
     *
     * @param options - Connecting options - rid, sid and jid.
     */
    attach(options: IAttachOptions): void {
        this.xmpp.attach(options);
    }

    /**
     * Disconnect the client from the server.
     * @param args - Optional arguments to be passed to XMPP.disconnect
     * @returns Promise that resolves when the disconnect process is finished or rejects with an error.
     */
    disconnect(...args: any): boolean | Promise<void> {
        // XXX Forward any arguments passed to JitsiConnection.disconnect to
        // XMPP.disconnect. For example, the caller of JitsiConnection.disconnect
        // may optionally pass the event which triggered the disconnect in order to
        // provide the implementation with finer-grained context.
        return this.xmpp.disconnect(...args);
    }

    /**
     * Returns the jid of the participant associated with the XMPP connection.
     *
     * @returns The jid of the participant.
     */
    getJid(): string {
        return this.xmpp.getJid();
    }

    /**
     * This method allows renewal of the tokens if they are expiring.
     * @param token - The new token.
     */
    setToken(token: string): void {
        this.token = token;
    }

    /**
     * Creates and joins new conference.
     * @param name - The name of the conference; if null - a generated name will be
     * provided from the api
     * @param options - Object with properties / settings related to the conference
     * that will be created.
     * @returns The new conference object.
     */
    initJitsiConference(name: Nullable<string>, options: Record<string, any>): JitsiConference {
        return new JitsiConference({
            config: options,
            connection: this,
            name
        });
    }

    /**
     * Subscribes the passed listener to the event.
     * @param event - The connection event.
     * @param listener - The function that will receive the event
     */
    addEventListener(event: JitsiConnectionEvents, listener: (...args: any[]) => void): void {
        this.xmpp.addListener(event, listener);
    }

    /**
     * Unsubscribes the passed handler.
     * @param event - The connection event.
     * @param listener - The function that will receive the event
     */
    removeEventListener(event: JitsiConnectionEvents, listener: (...args: any[]) => void): void {
        this.xmpp.removeListener(event, listener);
    }

    /**
     * Returns measured connectionTimes.
     * @returns Object containing connection timing information
     */
    getConnectionTimes(): Record<string, any> {
        return this.xmpp.connectionTimes;
    }

    /**
     * Adds new feature to the list of supported features for the local
     * participant.
     * @param feature - The name of the feature.
     * @param submit - If true - the new list of features will be
     * immediately submitted to the others.
     */
    addFeature(feature: string, submit: boolean = false): void {
        this.xmpp.caps.addFeature(feature, submit, true);
    }

    /**
     * Removes a feature from the list of supported features for the local
     * participant
     * @param feature - The name of the feature.
     * @param submit - If true - the new list of features will be
     * immediately submitted to the others.
     */
    removeFeature(feature: string, submit: boolean = false): void {
        this.xmpp.caps.removeFeature(feature, submit, true);
    }

    /**
     * Get object with internal logs.
     * @returns Object containing connection logs and metadata
     */
    getLogs(): Record<string, any> {
        const data = this.xmpp.getJingleLog();

        const metadata: Record<string, any> = {};

        metadata.time = new Date();
        metadata.url = window.location.href;
        metadata.ua = navigator.userAgent;

        const log = this.xmpp.getXmppLog();

        if (log) {
            metadata.xmpp = log;
        }

        data.metadata = metadata;

        return data;
    }

    /**
     * Get the XMPP instance.
     * @internal
     */
    get xmpp(): XMPP {
        return this._xmpp;
    }
}
