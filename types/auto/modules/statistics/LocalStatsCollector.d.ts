/**
 * <tt>LocalStatsCollector</tt> calculates statistics for the local stream.
 *
 * @param stream the local stream
 * @param interval stats refresh interval given in ms.
 * @param callback function that receives the audio levels.
 * @constructor
 */
declare function LocalStatsCollector(stream: any, interval: any, callback: any): void;
declare class LocalStatsCollector {
    /**
     * <tt>LocalStatsCollector</tt> calculates statistics for the local stream.
     *
     * @param stream the local stream
     * @param interval stats refresh interval given in ms.
     * @param callback function that receives the audio levels.
     * @constructor
     */
    constructor(stream: any, interval: any, callback: any);
    stream: any;
    intervalId: NodeJS.Timer;
    intervalMilis: any;
    audioLevel: number;
    callback: any;
    /**
     * Starts the collecting the statistics.
     */
    start(): void;
    /**
     * Stops collecting the statistics.
     */
    stop(): void;
}
declare namespace LocalStatsCollector {
    /**
     * Checks if the environment has the necessary conditions to support
     * collecting stats from local streams.
     *
     * @returns {boolean}
     */
    function isLocalStatsSupported(): boolean;
}
export default LocalStatsCollector;
