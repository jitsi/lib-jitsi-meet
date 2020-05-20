import { getLogger } from 'jitsi-meet-logger';
import { jitsiLocalStorage } from 'js-utils';

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
            _callStatsUserName = jitsiLocalStorage.getItem('callStatsUserName');
            if (!_callStatsUserName) {
                _callStatsUserName = generateCallStatsUserName();
                jitsiLocalStorage.setItem('callStatsUserName', _callStatsUserName);
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
            _machineId = jitsiLocalStorage.getItem('jitsiMeetId');
            if (!_machineId) {
                _machineId = generateJitsiMeetId();
                jitsiLocalStorage.setItem('jitsiMeetId', _machineId);
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
        return jitsiLocalStorage.getItem('sessionId');
    },

    /**
     * Save current session id.
     * @param {string} sessionId session id
     */
    set sessionId(sessionId) {
        if (sessionId) {
            jitsiLocalStorage.setItem('sessionId', sessionId);
        } else {
            jitsiLocalStorage.removeItem('sessionId');
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
