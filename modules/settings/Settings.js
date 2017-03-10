import { getLogger } from 'jitsi-meet-logger';
const logger = getLogger(__filename);

import UsernameGenerator from '../util/UsernameGenerator';

/**
 * Gets the localStorage of the browser. (Technically, gets the localStorage of
 * the global object because there may be no browser but React Native for
 * example).
 * @returns {Storage} the local Storage object (if any)
 */
function getLocalStorage() {
    const global = typeof window == 'undefined' ? this : window;


    return global.localStorage;
}

function _p8() {
    return `${Math.random().toString(16)}000000000`.substr(2, 8);
}

function generateUniqueId() {
    return _p8() + _p8() + _p8() + _p8();
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
 * Generate fake username for callstats.
 * @returns {string} fake random username
 */
function generateCallStatsUsername() {
    const username = UsernameGenerator.generateUsername();

    logger.log('generated callstats uid', username);

    return username;
}

class Settings {
    constructor() {
        const localStorage = getLocalStorage();

        if (localStorage) {
            this.userId
                = localStorage.getItem('jitsiMeetId') || generateJitsiMeetId();
            this.callStatsUserName
                = localStorage.getItem('callStatsUserName')
                    || generateCallStatsUsername();

            this.save();
        } else {
            logger.log('localStorage is not supported');
            this.userId = generateJitsiMeetId();
            this.callStatsUserName = generateCallStatsUsername();
        }
    }

    /**
     * Save settings to localStorage if browser supports that.
     */
    save() {
        const localStorage = getLocalStorage();

        if (localStorage) {
            localStorage.setItem('jitsiMeetId', this.userId);
            localStorage.setItem('callStatsUserName', this.callStatsUserName);
        }
    }

    /**
     * Returns current machine id.
     * @returns {string} machine id
     */
    getMachineId() {
        return this.userId;
    }

    /**
     * Returns fake username for callstats
     * @returns {string} fake username for callstats
     */
    getCallStatsUserName() {
        return this.callStatsUserName;
    }

    /**
     * Save current session id.
     * @param {string} sessionId session id
     */
    setSessionId(sessionId) {
        const localStorage = getLocalStorage();

        if (localStorage) {
            if (sessionId) {
                localStorage.setItem('sessionId', sessionId);
            } else {
                localStorage.removeItem('sessionId');
            }
        }
    }

    /**
     * Clear current session id.
     */
    clearSessionId() {
        this.setSessionId(undefined);
    }

    /**
     * Returns current session id.
     * @returns {string} current session id
     */
    getSessionId() {
        // We may update sessionId in localStorage from another JitsiConference
        // instance and that's why we should always re-read it.
        const localStorage = getLocalStorage();


        return localStorage ? localStorage.getItem('sessionId') : undefined;
    }
}

export default new Settings();
