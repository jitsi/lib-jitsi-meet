import { jitsiLocalStorage } from '@jitsi/js-utils';
import { getLogger } from '@jitsi/logger';
import { v4 as uuidv4 } from 'uuid';

import UsernameGenerator from '../util/UsernameGenerator';

const logger = getLogger('modules/settings/Settings');

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
     * Returns the ID to use for the purposes of stats, saved in localstorage as "callStatsUserName".
     * @returns {string} fake username for callstats
     */
    get callStatsUserName() {
        if (!_callStatsUserName) {
            _callStatsUserName = this._storage.getItem('callStatsUserName');
            if (!_callStatsUserName) {
                _callStatsUserName = _generateStatsId();
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
 * Generate a random ID to be used for statistics.
 * @returns {string} the random ID
 */
function _generateStatsId() {
    const username = UsernameGenerator.generateUsername();

    logger.log('generated stats id', username);

    return username;
}

/**
 * Generate unique id.
 * @returns {string} random unique id
 */
function generateJitsiMeetId() {
    const jitsiMeetId = uuidv4().replaceAll('-', '');

    logger.log('generated id', jitsiMeetId);

    return jitsiMeetId;
}
