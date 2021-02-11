import { jitsiLocalStorage } from '@jitsi/js-utils';
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
     * The storage used to store the settings.
     */
    _storage: jitsiLocalStorage,

    /**
     * Initializes the Settings class.
     *
     * @param {Storage|undefined} externalStorage - Object that implements the Storage interface. This object will be
     * used for storing data instead of jitsiLocalStorage if specified.
     */
    init(externalStorage) {
        this._storage = externalStorage || jitsiLocalStorage;
    },

    /**
     * Returns fake username for callstats
     * @returns {string} fake username for callstats
     */
    get callStatsUserName() {
        if (!_callStatsUserName) {
            _callStatsUserName = this._storage.getItem('callStatsUserName');
            if (!_callStatsUserName) {
                _callStatsUserName = generateCallStatsUserName();
                this._storage.setItem('callStatsUserName', _callStatsUserName);
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
            const amDid = this._storage.getItem('billingId');

            _machineId = amDid || this._storage.getItem('jitsiMeetId');

            if (amDid) {
                this._storage.setItem('jitsiMeetId', amDid);
            } else if (!_machineId) {
                _machineId = generateJitsiMeetId();
                this._storage.setItem('jitsiMeetId', _machineId);
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
        return this._storage.getItem('sessionId');
    },

    /**
     * Save current session id.
     * @param {string} sessionId session id
     */
    set sessionId(sessionId) {
        if (sessionId) {
            this._storage.setItem('sessionId', sessionId);
        } else {
            this._storage.removeItem('sessionId');
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
