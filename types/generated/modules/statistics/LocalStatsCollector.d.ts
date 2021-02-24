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
    intervalId: number;
    intervalMilis: any;
    audioLevel: number;
    callback: any;
    start(): void;
    stop(): void;
}
declare namespace LocalStatsCollector {
    function isLocalStatsSupported(): boolean;
}
export default LocalStatsCollector;
