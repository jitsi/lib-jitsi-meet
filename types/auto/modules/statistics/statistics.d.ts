/// <reference types="node" />
/**
 * The options to configure Statistics.
 * @typedef {Object} StatisticsOptions
 * @property {string} applicationName - The application name to pass to
 * callstats.
 * @property {string} aliasName - The alias name to use when initializing callstats.
 * @property {string} userName - The user name to use when initializing callstats.
 * @property {string} confID - The callstats conference ID to use.
 * @property {string} callStatsID - Callstats credentials - the id.
 * @property {string} callStatsSecret - Callstats credentials - the secret.
 * @property {string} customScriptUrl - A custom lib url to use when downloading
 * callstats library.
 * @property {string} roomName - The room name we are currently in.
 * @property {string} configParams - The set of parameters
 * to enable/disable certain features in the library. See CallStats docs for more info.
 */
/**
 *
 * @param xmpp
 * @param {StatisticsOptions} options - The options to use creating the
 * Statistics.
 */
declare function Statistics(xmpp: any, options: StatisticsOptions): void;
declare class Statistics {
    /**
     * The options to configure Statistics.
     * @typedef {Object} StatisticsOptions
     * @property {string} applicationName - The application name to pass to
     * callstats.
     * @property {string} aliasName - The alias name to use when initializing callstats.
     * @property {string} userName - The user name to use when initializing callstats.
     * @property {string} confID - The callstats conference ID to use.
     * @property {string} callStatsID - Callstats credentials - the id.
     * @property {string} callStatsSecret - Callstats credentials - the secret.
     * @property {string} customScriptUrl - A custom lib url to use when downloading
     * callstats library.
     * @property {string} roomName - The room name we are currently in.
     * @property {string} configParams - The set of parameters
     * to enable/disable certain features in the library. See CallStats docs for more info.
     */
    /**
     *
     * @param xmpp
     * @param {StatisticsOptions} options - The options to use creating the
     * Statistics.
     */
    constructor(xmpp: any, options: StatisticsOptions);
    /**
     * {@link RTPStats} mapped by {@link TraceablePeerConnection.id} which
     * collect RTP statistics for each peerconnection.
     * @type {Map<string, RTPStats}
     */
    rtpStatsMap: Map<string, RTPStats>;
    eventEmitter: EventEmitter;
    xmpp: any;
    options: {};
    callStatsIntegrationEnabled: boolean;
    callStatsApplicationLogsDisabled: any;
    /**
     * Stores {@link CallStats} instances for each
     * {@link TraceablePeerConnection} (one {@link CallStats} instance serves
     * one TPC). The instances are mapped by {@link TraceablePeerConnection.id}.
     * @type {Map<number, CallStats>}
     */
    callsStatsInstances: Map<number, CallStats>;
    /**
     * Starts collecting RTP stats for given peerconnection.
     * @param {TraceablePeerConnection} peerconnection
     */
    startRemoteStats(peerconnection: any): void;
    addAudioLevelListener(listener: any): void;
    removeAudioLevelListener(listener: any): void;
    addBeforeDisposedListener(listener: any): void;
    removeBeforeDisposedListener(listener: any): void;
    addConnectionStatsListener(listener: any): void;
    removeConnectionStatsListener(listener: any): void;
    addByteSentStatsListener(listener: any): void;
    removeByteSentStatsListener(listener: any): void;
    /**
     * Add a listener that would be notified on a LONG_TASKS_STATS event.
     *
     * @param {Function} listener a function that would be called when notified.
     * @returns {void}
     */
    addLongTasksStatsListener(listener: Function): void;
    /**
     * Creates an instance of {@link PerformanceObserverStats} and starts the
     * observer that records the stats periodically.
     *
     * @returns {void}
     */
    attachLongTasksStats(conference: any): void;
    performanceObserverStats: PerformanceObserverStats;
    /**
     * Obtains the current value of the LongTasks event statistics.
     *
     * @returns {Object|null} stats object if the observer has been
     * created, null otherwise.
     */
    getLongTasksStats(): any | null;
    /**
     * Removes the given listener for the LONG_TASKS_STATS event.
     *
     * @param {Function} listener the listener we want to remove.
     * @returns {void}
     */
    removeLongTasksStatsListener(listener: Function): void;
    /**
     * Updates the list of speakers for which the audio levels are to be calculated. This is needed for the jvb pc only.
     *
     * @param {Array<string>} speakerList The list of remote endpoint ids.
     * @returns {void}
     */
    setSpeakerList(speakerList: Array<string>): void;
    dispose(): void;
    private _stopRemoteStats;
    /**
     * Stops collecting RTP stats for given peerconnection
     * @param {TraceablePeerConnection} tpc
     */
    stopRemoteStats(tpc: any): void;
    /**
     * Initializes the callstats.io API.
     * @param {TraceablePeerConnection} tpc the {@link TraceablePeerConnection}
     * instance for which CalStats will be started.
     * @param {string} remoteUserID
     */
    startCallStats(tpc: any, remoteUserID: string): void;
    /**
     * Removes the callstats.io instances.
     */
    stopCallStats(tpc: any): void;
    /**
     * Returns true if the callstats integration is enabled, otherwise returns
     * false.
     *
     * @returns true if the callstats integration is enabled, otherwise returns
     * false.
     */
    isCallstatsEnabled(): boolean;
    /**
     * Logs either resume or hold event for the given peer connection.
     * @param {TraceablePeerConnection} tpc the connection for which event will be
     * reported
     * @param {boolean} isResume true for resume or false for hold
     */
    sendConnectionResumeOrHoldEvent(tpc: any, isResume: boolean): void;
    /**
     * Notifies CallStats and analytics (if present) for ice connection failed
     * @param {TraceablePeerConnection} tpc connection on which failure occurred.
     */
    sendIceConnectionFailedEvent(tpc: any): void;
    /**
     * Notifies CallStats for mute events
     * @param {TraceablePeerConnection} tpc connection on which failure occurred.
     * @param {boolean} muted true for muted and false for not muted
     * @param {String} type "audio"/"video"
     */
    sendMuteEvent(tpc: any, muted: boolean, type: string): void;
    /**
     * Notifies CallStats for screen sharing events
     * @param start {boolean} true for starting screen sharing and
     * false for not stopping
     * @param {string|null} ssrc - optional ssrc value, used only when
     * starting screen sharing.
     */
    sendScreenSharingEvent(start: boolean, ssrc: string | null): void;
    /**
     * Notifies the statistics module that we are now the dominant speaker of the
     * conference.
     * @param {String} roomJid - The room jid where the speaker event occurred.
     */
    sendDominantSpeakerEvent(roomJid: string): void;
    /**
     * Lets the underlying statistics module know where is given SSRC rendered by
     * providing renderer tag ID.
     * @param {TraceablePeerConnection} tpc the connection to which the stream
     * belongs to
     * @param {number} ssrc the SSRC of the stream
     * @param {boolean} isLocal
     * @param {string} userId
     * @param {string} usageLabel  meaningful usage label of this stream like
     *        'microphone', 'camera' or 'screen'.
     * @param {string} containerId the id of media 'audio' or 'video' tag which
     *        renders the stream.
     */
    associateStreamWithVideoTag(tpc: any, ssrc: number, isLocal: boolean, userId: string, usageLabel: string, containerId: string): void;
    /**
     * Notifies CallStats that peer connection failed to create offer.
     *
     * @param {Error} e error to send
     * @param {TraceablePeerConnection} tpc connection on which failure occurred.
     */
    sendCreateOfferFailed(e: Error, tpc: any): void;
    /**
     * Notifies CallStats that peer connection failed to create answer.
     *
     * @param {Error} e error to send
     * @param {TraceablePeerConnection} tpc connection on which failure occured.
     */
    sendCreateAnswerFailed(e: Error, tpc: any): void;
    /**
     * Notifies CallStats that peer connection failed to set local description.
     *
     * @param {Error} e error to send
     * @param {TraceablePeerConnection} tpc connection on which failure occurred.
     */
    sendSetLocalDescFailed(e: Error, tpc: any): void;
    /**
     * Notifies CallStats that peer connection failed to set remote description.
     *
     * @param {Error} e error to send
     * @param {TraceablePeerConnection} tpc connection on which failure occurred.
     */
    sendSetRemoteDescFailed(e: Error, tpc: any): void;
    /**
     * Notifies CallStats that peer connection failed to add ICE candidate.
     *
     * @param {Error} e error to send
     * @param {TraceablePeerConnection} tpc connection on which failure occurred.
     */
    sendAddIceCandidateFailed(e: Error, tpc: any): void;
    /**
     * Sends the given feedback through CallStats.
     *
     * @param overall an integer between 1 and 5 indicating the user's rating.
     * @param comment the comment from the user.
     * @returns {Promise} Resolves when callstats feedback has been submitted
     * successfully.
     */
    sendFeedback(overall: any, comment: any): Promise<any>;
}
declare namespace Statistics {
    /**
     * Init statistic options
     * @param options
     */
    export function init(options: any): void;
    export const audioLevelsEnabled: boolean;
    export const audioLevelsInterval: number;
    export const pcStatsInterval: number;
    export const disableThirdPartyRequests: boolean;
    export { analytics };
    export const instances: any;
    export const localStats: any[];
    export function startLocalStats(stream: any, callback: any): void;
    export function stopLocalStats(stream: any): void;
    /**
     * Obtains the list of *all* {@link CallStats} instances collected from every
     * valid {@link Statistics} instance.
     * @return {Set<CallStats>}
     * @private
     */
    export function _getAllCallStatsInstances(): Set<CallStats>;
    /**
     * Notifies about active device.
     * @param {{deviceList: {String:String}}} devicesData - list of devices with
     *      their data
     */
    export function sendActiveDeviceListEvent(devicesData: {
        deviceList: {
            String: string;
        };
    }): void;
    /**
     * Notifies CallStats that getUserMedia failed.
     *
     * @param {Error} e error to send
     */
    export function sendGetUserMediaFailed(e: Error): void;
    /**
     * Adds to CallStats an application log.
     *
     * @param {String} m a log message to send or an {Error} object to be reported
     */
    export function sendLog(m: string): void;
    export const LOCAL_JID: string;
    /**
     * Reports global error to CallStats.
     *
     * @param {Error} error
     */
    export function reportGlobalError(error: Error): void;
    /**
     * Sends event to analytics and logs a message to the logger/console. Console
     * messages might also be logged to callstats automatically.
     *
     * @param {string | Object} event the event name, or an object which
     * represents the entire event.
     * @param {Object} properties properties to attach to the event (if an event
     * name as opposed to an event object is provided).
     */
    export function sendAnalyticsAndLog(event: any, properties?: any): void;
    /**
     * Sends event to analytics.
     *
     * @param {string | Object} eventName the event name, or an object which
     * represents the entire event.
     * @param {Object} properties properties to attach to the event
     */
    export function sendAnalytics(eventName: any, properties?: any): void;
}
export default Statistics;
/**
 * The options to configure Statistics.
 */
export type StatisticsOptions = {
    /**
     * - The application name to pass to
     * callstats.
     */
    applicationName: string;
    /**
     * - The alias name to use when initializing callstats.
     */
    aliasName: string;
    /**
     * - The user name to use when initializing callstats.
     */
    userName: string;
    /**
     * - The callstats conference ID to use.
     */
    confID: string;
    /**
     * - Callstats credentials - the id.
     */
    callStatsID: string;
    /**
     * - Callstats credentials - the secret.
     */
    callStatsSecret: string;
    /**
     * - A custom lib url to use when downloading
     * callstats library.
     */
    customScriptUrl: string;
    /**
     * - The room name we are currently in.
     */
    roomName: string;
    /**
     * - The set of parameters
     * to enable/disable certain features in the library. See CallStats docs for more info.
     */
    configParams: string;
};
import RTPStats from "./RTPStatsCollector";
import EventEmitter from "events";
import CallStats from "./CallStats";
import { PerformanceObserverStats } from "./PerformanceObserverStats";
import analytics from "./AnalyticsAdapter";
