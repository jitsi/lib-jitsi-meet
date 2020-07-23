import EventEmitter from 'events';

import browser from '../browser';
import Settings from '../settings/Settings';
import ScriptUtil from '../util/ScriptUtil';

import { CALLSTATS_SCRIPT_URL } from './constants';

const PRECALL_TEST_RESULTS = 'preCallTestResults';
const emitter = new EventEmitter();
let _initialized = false;
let api = null;

/**
 * Loads the callstats io script.
 *
 * @returns {Promise<void>}
 */
function _loadScript() {
    if (browser.isReactNative()) {
        return;
    }

    return new Promise(resolve => {
        ScriptUtil.loadScript(
            CALLSTATS_SCRIPT_URL,
            /* async */ true,
            /* prepend */ true,
            /* relativeURL */ undefined,
            /* loadCallback */ resolve);
    });
}

/**
 * Initializes the callstats lib and registers a callback to be invoked
 * when there are 'preCallTestResults'.
 *
 * @typedef PrecallTestOptions
 * @type {Object}
 * @property {string} callStatsID - Callstats credentials - the id.
 * @property {string} callStatsSecret - Callstats credentials - the secret.
 * @property {string} statisticsId - The user name to use when initializing callstats.
 * @property {string} statisticsDisplayName - The user display name.
 *
 * @param { PrecallTestOptions} options - The init options.
 * @returns {Promise<void>}
 */
function _initialize(options) {
    return new Promise((resolve, reject) => {
        if (!options.disableThirdPartyRequests) {
            const appId = options.callStatsID;
            const appSecret = options.callStatsSecret;
            const userId = options.statisticsId || options.statisticsDisplayName || Settings.callStatsUserName;

            api.initialize(appId, appSecret, userId, (status, message) => {
                if (status === 'success') {
                    api.on(PRECALL_TEST_RESULTS, (...args) => {
                        emitter.emit(PRECALL_TEST_RESULTS, ...args);
                    });
                    _initialized = true;
                    resolve();
                } else {
                    reject({
                        status,
                        message
                    });
                }
            }, null, { disablePrecalltest: true });
        }
    });
}

/**
 * Loads the callstats script and initializes the library.
 *
 * @param {Function} onResult - The callback to be invoked when results are received.
 * @returns {Promise<void>}
 */
export async function init(options) {
    if (_initialized) {
        throw new Error('Precall Test already initialized');
    }

    await _loadScript();
    // eslint-disable-next-line new-cap
    api = new window.callstats();

    return _initialize(options);
}

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
export function execute() {
    if (!_initialized) {
        return Promise.reject('uninitialized');
    }

    return new Promise((resolve, reject) => {
        emitter.on(PRECALL_TEST_RESULTS, (status, payload) => {
            if (status === 'success') {
                resolve(payload);
            } else {
                reject({
                    status,
                    payload
                });
            }

        });

        api.makePrecallTest();
    });
}

export default {
    init,
    execute
};
