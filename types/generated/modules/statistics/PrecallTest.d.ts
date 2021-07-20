/**
 * Loads the callstats script and initializes the library.
 *
 * @param {Function} onResult - The callback to be invoked when results are received.
 * @returns {Promise<void>}
 */
export function init(options: any): Promise<void>;
/**
 * Executes a pre call test.
 *
 * @typedef PrecallTestResults
 * @type {Object}
 * @property {boolean} mediaConnectivity - If there is media connectivity or not.
 * @property {number} throughput  - The average throughput.
 * @property {number} fractionalLoss - The packet loss.
 * @property {number} rtt - The round trip time.
 * @property {string} provider - It is usually 'callstats'.
 *
 * @returns {Promise<{PrecallTestResults}>}
 */
export function execute(): Promise<{
    PrecallTestResults;
}>;
declare namespace _default {
    export { init };
    export { execute };
}
export default _default;
/**
 * Initializes the callstats lib and registers a callback to be invoked
 * when there are 'preCallTestResults'.
 */
export type PrecallTestOptions = {
    /**
     * - Callstats credentials - the id.
     */
    callStatsID: string;
    /**
     * - Callstats credentials - the secret.
     */
    callStatsSecret: string;
    /**
     * - The user name to use when initializing callstats.
     */
    statisticsId: string;
    /**
     * - The user display name.
     */
    statisticsDisplayName: string;
};
/**
 * Executes a pre call test.
 */
export type PrecallTestResults = {
    /**
     * - If there is media connectivity or not.
     */
    mediaConnectivity: boolean;
    /**
     * - The average throughput.
     */
    throughput: number;
    /**
     * - The packet loss.
     */
    fractionalLoss: number;
    /**
     * - The round trip time.
     */
    rtt: number;
    /**
     * - It is usually 'callstats'.
     */
    provider: string;
};
