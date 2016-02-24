var logger = require("jitsi-meet-logger").getLogger(__filename);

var UsernameGenerator = require('../util/UsernameGenerator');

/**
 * Check if browser supports localStorage.
 * @returns {boolean} true if supports, false otherwise
 */
function supportsLocalStorage() {
    try {
        return 'localStorage' in window && window.localStorage !== null;
    } catch (e) {
        return false;
    }
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

    if (supportsLocalStorage()) {
        this.userId = window.localStorage.getItem('jitsiMeetId')
            || generateJitsiMeetId();


        this.callStatsUserName = window.localStorage.getItem(
            'callStatsUserName'
        ) || generateCallStatsUsername();

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
    if (!supportsLocalStorage()) {
        return;
    }

    window.localStorage.setItem('jitsiMeetId', this.userId);
    window.localStorage.setItem('callStatsUserName', this.callStatsUserName);
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
    if (sessionId) {
        window.localStorage.setItem('sessionId', sessionId);
    } else {
        window.localStorage.removeItem('sessionId');
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
    // we can update session id in localStorage from
    // another JitsiConference instance
    // thats why we should always re-read it
    return window.localStorage.getItem('sessionId');
};

module.exports = Settings;
