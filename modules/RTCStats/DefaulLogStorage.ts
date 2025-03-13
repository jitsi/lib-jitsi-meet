import RTCStats from './RTCStats';

/**
 * The default log storage implementation.
 */
export default class DefaultLogStorage {
    private rtcStats: any;

    constructor(rtcStats: any) {
        this.rtcStats = rtcStats;
    }


    /**
     * The DefaultLogStorage is ready when the RTCStats is ready.
     *
     * @returns {boolean} <tt>true</tt> when this storage is ready or
     * <tt>false</tt> otherwise.
     */
    isReady() {
        return this.rtcStats._initialized;
    }

    /**
     * Called by the <tt>LogCollector</tt> to store a series of log lines into
     * batch.
     *
     * @param {Array<string|Object>} logEntries - An array containing strings
     * representing log lines or aggregated lines objects.
     * @returns {void}
     */
    storeLogs(logEntries: Array<string | any>) {
        RTCStats.sendStatsEntry('logs', null, logEntries);
    }
}
