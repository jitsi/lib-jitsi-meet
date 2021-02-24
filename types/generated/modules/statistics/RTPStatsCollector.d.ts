/**
 * <tt>StatsCollector</tt> registers for stats updates of given
 * <tt>peerconnection</tt> in given <tt>interval</tt>. On each update particular
 * stats are extracted and put in {@link SsrcStats} objects. Once the processing
 * is done <tt>audioLevelsUpdateCallback</tt> is called with <tt>this</tt>
 * instance as an event source.
 *
 * @param peerconnection WebRTC PeerConnection object.
 * @param audioLevelsInterval
 * @param statsInterval stats refresh interval given in ms.
 * @param eventEmitter
 * @constructor
 */
export default function StatsCollector(peerconnection: any, audioLevelsInterval: any, statsInterval: any, eventEmitter: any): void;
export default class StatsCollector {
    /**
     * <tt>StatsCollector</tt> registers for stats updates of given
     * <tt>peerconnection</tt> in given <tt>interval</tt>. On each update particular
     * stats are extracted and put in {@link SsrcStats} objects. Once the processing
     * is done <tt>audioLevelsUpdateCallback</tt> is called with <tt>this</tt>
     * instance as an event source.
     *
     * @param peerconnection WebRTC PeerConnection object.
     * @param audioLevelsInterval
     * @param statsInterval stats refresh interval given in ms.
     * @param eventEmitter
     * @constructor
     */
    constructor(peerconnection: any, audioLevelsInterval: any, statsInterval: any, eventEmitter: any);
    /**
     * The browser type supported by this StatsCollector. In other words, the
     * type of the browser which initialized this StatsCollector
     * instance.
     * @private
     */
    private _browserType;
    /**
     * Whether to use the Promise-based getStats API or not.
     * @type {boolean}
     */
    _usesPromiseGetStats: boolean;
    /**
     * The function which is to be used to retrieve the value associated in a
     * report returned by RTCPeerConnection#getStats with a lib-jitsi-meet
     * browser-agnostic name/key.
     *
     * @function
     * @private
     */
    private _getStatValue;
    peerconnection: any;
    baselineAudioLevelsReport: any;
    currentAudioLevelsReport: any;
    currentStatsReport: any;
    previousStatsReport: any;
    audioLevelReportHistory: {};
    audioLevelsIntervalId: number;
    eventEmitter: any;
    conferenceStats: ConferenceStats;
    audioLevelsIntervalMilis: any;
    statsIntervalId: number;
    statsIntervalMilis: any;
    /**
     * Maps SSRC numbers to {@link SsrcStats}.
     * @type {Map<number,SsrcStats}
     */
    ssrc2stats: any;
    stop(): void;
    errorCallback(error: any): void;
    start(startAudioLevelStats: any): void;
    _defineGetStatValueMethod(keys: {
        [x: string]: string;
    }): (item: any, name: any) => any;
    private getNonNegativeStat;
    processStatsReport(): void;
    _processAndEmitReport(): void;
    processAudioLevelReport(): void;
    _defineNewGetStatValueMethod(keys: {
        [x: string]: string;
    }): (item: any, name: any) => any;
    private getNonNegativeValue;
    private _calculateBitrate;
    processNewStatsReport(): void;
    processNewAudioLevelReport(): void;
}
/**
 *
 */
declare function ConferenceStats(): void;
declare class ConferenceStats {
    /**
     * The bandwidth
     * @type {{}}
     */
    bandwidth: {};
    /**
     * The bit rate
     * @type {{}}
     */
    bitrate: {};
    /**
     * The packet loss rate
     * @type {{}}
     */
    packetLoss: {};
    /**
     * Array with the transport information.
     * @type {Array}
     */
    transport: any[];
}
export {};
