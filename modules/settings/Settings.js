var logger = require("jitsi-meet-logger").getLogger(__filename);
var UsernameGenerator = require('../util/UsernameGenerator');

/**
 * Gets the localStorage of the browser. (Technically, gets the localStorage of
 * the global object because there may be no browser but React Native for
 * example).
 * @returns {Storage} the local Storage object (if any)
 */
function getLocalStorage() {
    var global = typeof window == 'undefined' ? this : window;
    return global.localStorage;
}

function generateUniqueId() {
    function _p8() {
        return (Math.random().toString(16) + "000000000").substr(2, 8);
    }
    return _p8() + _p8() + _p8() + _p8();
}

/**
 * Generate unique id.
 * @returns {string} random unique id
 */
function generateJitsiMeetId() {
    var jitsiMeetId = generateUniqueId();
    logger.log("generated id", jitsiMeetId);

    return jitsiMeetId;
}

/**
 * Generate fake username for callstats.
 * @returns {string} fake random username
 */
function generateCallStatsUsername() {
    var username = UsernameGenerator.generateUsername();
    logger.log('generated callstats uid', username);

    return username;
}

function Settings() {
    this.userId;
    this.callStatsUserName;

    var localStorage = getLocalStorage();
    if (localStorage) {
        this.userId
            = localStorage.getItem('jitsiMeetId') || generateJitsiMeetId();
        this.callStatsUserName
            = localStorage.getItem('callStatsUserName')
                || generateCallStatsUsername();

        this.save();
    } else {
        logger.log("localStorage is not supported");
        this.userId = generateJitsiMeetId();
        this.callStatsUserName = generateCallStatsUsername();
    }
}

/**
 * Save settings to localStorage if browser supports that.
 */
Settings.prototype.save = function () {
    var localStorage = getLocalStorage();
    if (localStorage) {
        localStorage.setItem('jitsiMeetId', this.userId);
        localStorage.setItem('callStatsUserName', this.callStatsUserName);
    }
};

/**
 * Returns current user id.
 * @returns {string} user id
 */
Settings.prototype.getUserId = function () {
    return this.userId;
};

/**
 * Returns fake username for callstats
 * @returns {string} fake username for callstats
 */
Settings.prototype.getCallStatsUserName = function () {
    return this.callStatsUserName;
};

/**
 * Save current session id.
 * @param {string} sessionId session id
 */
Settings.prototype.setSessionId = function (sessionId) {
    var localStorage = getLocalStorage();
    if (localStorage) {
        if (sessionId) {
            localStorage.setItem('sessionId', sessionId);
        } else {
            localStorage.removeItem('sessionId');
        }
    }
};

/**
 * Clear current session id.
 */
Settings.prototype.clearSessionId = function () {
    this.setSessionId(undefined);
};

/**
 * Returns current session id.
 * @returns {string} current session id
 */
Settings.prototype.getSessionId = function () {
    // We may update sessionId in localStorage from another JitsiConference
    // instance and that's why we should always re-read it.
    var localStorage = getLocalStorage();
    return localStorage ? localStorage.getItem('sessionId') : undefined;
};

module.exports = Settings;
