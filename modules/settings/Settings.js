import { getLogger } from 'jitsi-meet-logger';
const logger = getLogger(__filename);

import UsernameGenerator from '../util/UsernameGenerator';

let _callStatsUserName;

let _machineId;

/**
 *
 */
export default {
    /**
     * Returns fake username for callstats
     * @returns {string} fake username for callstats
     */
    get callStatsUserName() {
        if (!_callStatsUserName) {
            const localStorage = getLocalStorage();

            if (localStorage) {
                _callStatsUserName = localStorage.getItem('callStatsUserName');
            }
            if (!_callStatsUserName) {
                _callStatsUserName = generateCallStatsUserName();
                if (localStorage) {
                    localStorage.setItem(
                        'callStatsUserName',
                        _callStatsUserName);
                }
            }
        }

        return _callStatsUserName;
    },

    /**
     * Returns current machine id.
     * @returns {string} machine id
     */
    get machineId() {
        if (!_machineId) {
            const localStorage = getLocalStorage();

            if (localStorage) {
                _machineId = localStorage.getItem('jitsiMeetId');
            }
            if (!_machineId) {
                _machineId = generateJitsiMeetId();
                if (localStorage) {
                    localStorage.setItem('jitsiMeetId', _machineId);
                }
            }
        }

        return _machineId;
    },

    /**
     * Returns current session id.
     * @returns {string} current session id
     */
    get sessionId() {
        // We may update sessionId in localStorage from another JitsiConference
        // instance and that's why we should always re-read it.
        const localStorage = getLocalStorage();

        return localStorage ? localStorage.getItem('sessionId') : undefined;
    },

    /**
     * Save current session id.
     * @param {string} sessionId session id
     */
    set sessionId(sessionId) {
        const localStorage = getLocalStorage();

        if (localStorage) {
            if (sessionId) {
                localStorage.setItem('sessionId', sessionId);
            } else {
                localStorage.removeItem('sessionId');
            }
        }
    }
};

/**
 * Generate fake username for callstats.
 * @returns {string} fake random username
 */
function generateCallStatsUserName() {
    const username = UsernameGenerator.generateUsername();

    logger.log('generated callstats uid', username);

    return username;
}

/**
 * Generate unique id.
 * @returns {string} random unique id
 */
function generateJitsiMeetId() {
    const jitsiMeetId = generateUniqueId();

    logger.log('generated id', jitsiMeetId);

    return jitsiMeetId;
}

/**
 * Gets the localStorage of the browser. (Technically, gets the localStorage of
 * the global object because there may be no browser but React Native for
 * example).
 * @returns {Storage} the local Storage object (if any)
 */
function getLocalStorage() {
    let storage;

    try {
        // eslint-disable-next-line no-invalid-this
        storage = (window || this).localStorage;
    } catch (error) {
        logger.error(error);
    }

    return storage;
}

/**
 *
 */
function generateUniqueId() {
    return _p8() + _p8() + _p8() + _p8();
}

/**
 *
 */
function _p8() {
    return `${Math.random().toString(16)}000000000`.substr(2, 8);
}
