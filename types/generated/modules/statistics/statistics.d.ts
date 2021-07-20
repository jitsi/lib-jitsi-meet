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
    rtpStatsMap: any;
    eventEmitter: any;
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
    callsStatsInstances: any;
    startRemoteStats(peerconnection: any): void;
    addAudioLevelListener(listener: any): void;
    removeAudioLevelListener(listener: any): void;
    addBeforeDisposedListener(listener: any): void;
    removeBeforeDisposedListener(listener: any): void;
    addConnectionStatsListener(listener: any): void;
    removeConnectionStatsListener(listener: any): void;
    addByteSentStatsListener(listener: any): void;
    removeByteSentStatsListener(listener: any): void;
    addLongTasksStatsListener(listener: Function): void;
    attachLongTasksStats(conference: any): void;
    performanceObserverStats: PerformanceObserverStats;
    getLongTasksStats(): any | null;
    removeLongTasksStatsListener(listener: Function): void;
    dispose(): void;
    private _stopRemoteStats;
    stopRemoteStats(tpc: any): void;
    startCallStats(tpc: any, remoteUserID: string): void;
    stopCallStats(tpc: any): void;
    isCallstatsEnabled(): boolean;
    sendConnectionResumeOrHoldEvent(tpc: any, isResume: boolean): void;
    sendIceConnectionFailedEvent(tpc: any): void;
    sendMuteEvent(tpc: any, muted: boolean, type: string): void;
    sendScreenSharingEvent(start: boolean, ssrc: string | null): void;
    sendDominantSpeakerEvent(roomJid: string): void;
    associateStreamWithVideoTag(tpc: any, ssrc: number, isLocal: boolean, userId: string, usageLabel: string, containerId: string): void;
    sendCreateOfferFailed(e: Error, tpc: any): void;
    sendCreateAnswerFailed(e: Error, tpc: any): void;
    sendSetLocalDescFailed(e: Error, tpc: any): void;
    sendSetRemoteDescFailed(e: Error, tpc: any): void;
    sendAddIceCandidateFailed(e: Error, tpc: any): void;
    sendFeedback(overall: any, comment: any): Promise<any>;
}
declare namespace Statistics {
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
    export function _getAllCallStatsInstances(): any;
    export function sendActiveDeviceListEvent(devicesData: {
        deviceList: {
            String: string;
        };
    }): void;
    export function sendGetUserMediaFailed(e: Error): void;
    export function sendLog(m: string): void;
    export const LOCAL_JID: string;
    export function reportGlobalError(error: Error): void;
    export function sendAnalyticsAndLog(event: any, properties?: any): void;
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
};
import { PerformanceObserverStats } from "./PerformanceObserverStats";
import analytics from "./AnalyticsAdapter";
