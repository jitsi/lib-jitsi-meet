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
    peerconnection: any;
    baselineAudioLevelsReport: any;
    currentAudioLevelsReport: any;
    currentStatsReport: any;
    previousStatsReport: any;
    audioLevelReportHistory: {};
    audioLevelsIntervalId: NodeJS.Timer;
    eventEmitter: any;
    conferenceStats: ConferenceStats;
    audioLevelsIntervalMilis: any;
    speakerList: any[];
    statsIntervalId: NodeJS.Timer;
    statsIntervalMilis: any;
    /**
     * Maps SSRC numbers to {@link SsrcStats}.
     * @type {Map<number,SsrcStats}
     */
    ssrc2stats: Map<number, SsrcStats>;
    /**
     * Set the list of the remote speakers for which audio levels are to be calculated.
     *
     * @param {Array<string>} speakerList - Endpoint ids.
     * @returns {void}
     */
    setSpeakerList(speakerList: Array<string>): void;
    /**
     * Stops stats updates.
     */
    stop(): void;
    /**
     * Callback passed to <tt>getStats</tt> method.
     * @param error an error that occurred on <tt>getStats</tt> call.
     */
    errorCallback(error: any): void;
    /**
     * Starts stats updates.
     */
    start(startAudioLevelStats: any): void;
    /**
     *
     */
    _processAndEmitReport(): void;
    private getNonNegativeValue;
    private _calculateBitrate;
    /**
     * Stats processing for spec-compliant RTCPeerConnection#getStats.
     */
    processStatsReport(): void;
    /**
     * Stats processing logic.
     */
    processAudioLevelReport(): void;
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
/**
 * Holds "statistics" for a single SSRC.
 * @constructor
 */
declare function SsrcStats(): void;
declare class SsrcStats {
    loss: {};
    bitrate: {
        download: number;
        upload: number;
    };
    resolution: {};
    framerate: number;
    codec: string;
    /**
     * Sets the "loss" object.
     * @param loss the value to set.
     */
    setLoss(loss: any): void;
    /**
     * Sets resolution that belong to the ssrc represented by this instance.
     * @param resolution new resolution value to be set.
     */
    setResolution(resolution: any): void;
    /**
     * Adds the "download" and "upload" fields from the "bitrate" parameter to
     * the respective fields of the "bitrate" field of this object.
     * @param bitrate an object holding the values to add.
     */
    addBitrate(bitrate: any): void;
    /**
     * Resets the bit rate for given <tt>ssrc</tt> that belong to the peer
     * represented by this instance.
     */
    resetBitrate(): void;
    /**
     * Sets the "framerate".
     * @param framerate the value to set.
     */
    setFramerate(framerate: any): void;
    setCodec(codec: any): void;
}
export {};
