/* global require */
var LocalStats = require("./LocalStatsCollector.js");
var logger = require("jitsi-meet-logger").getLogger(__filename);
var RTPStats = require("./RTPStatsCollector.js");
var EventEmitter = require("events");
var StatisticsEvents = require("../../service/statistics/Events");
var CallStats = require("./CallStats");
var ScriptUtil = require('../util/ScriptUtil');
var JitsiTrackError = require("../../JitsiTrackError");

// Since callstats.io is a third party, we cannot guarantee the quality of their
// service. More specifically, their server may take noticeably long time to
// respond. Consequently, it is in our best interest (in the sense that the
// intergration of callstats.io is pretty important to us but not enough to
// allow it to prevent people from joining a conference) to (1) start
// downloading their API as soon as possible and (2) do the downloading
// asynchronously.
function loadCallStatsAPI() {
    ScriptUtil.loadScript(
            'https://api.callstats.io/static/callstats.min.js',
            /* async */ true,
            /* prepend */ true);
    // FIXME At the time of this writing, we hope that the callstats.io API will
    // have loaded by the time we needed it (i.e. CallStats.init is invoked).
}

/**
 * Log stats via the focus once every this many milliseconds.
 */
var LOG_INTERVAL = 60000;

/**
 * callstats strips any additional fields from Error except for "name", "stack",
 * "message" and "constraintName". So we need to bundle additional information
 * from JitsiTrackError into error passed to callstats to preserve valuable
 * information about error.
 * @param {JitsiTrackError} error
 */
function formatJitsiTrackErrorForCallStats(error) {
    var err = new Error();

    // Just copy original stack from error
    err.stack = error.stack;

    // Combine name from error's name plus (possibly) name of original GUM error
    err.name = (error.name || "Unknown error") + (error.gum && error.gum.error
        && error.gum.error.name ? " - " + error.gum.error.name : "");

    // Put all constraints into this field. For constraint failed errors we will
    // still know which exactly constraint failed as it will be a part of
    // message.
    err.constraintName = error.gum && error.gum.constraints
        ? JSON.stringify(error.gum.constraints) : "";

    // Just copy error's message.
    err.message = error.message;

    return err;
}

function Statistics(xmpp, options) {
    this.rtpStats = null;
    this.eventEmitter = new EventEmitter();
    this.xmpp = xmpp;
    this.options = options || {};
    this.callStatsIntegrationEnabled
        = this.options.callStatsID && this.options.callStatsSecret
            // Even though AppID and AppSecret may be specified, the integration
            // of callstats.io may be disabled because of globally-disallowed
            // requests to any third parties.
            && (this.options.disableThirdPartyRequests !== true);
    if(this.callStatsIntegrationEnabled)
        loadCallStatsAPI();
    this.callStats = null;

    // audioLevelsInterval = 200 unless overridden in the config
    this.audioLevelsInterval
        = typeof this.options.audioLevelsInterval !== 'undefined'
                ? this.options.audioLevelsInterval : 200;
    /**
     * Send the stats already saved in rtpStats to be logged via the focus.
     */
    this.logStatsIntervalId = null;
}
Statistics.audioLevelsEnabled = false;

Statistics.prototype.startRemoteStats = function (peerconnection) {
    if(!Statistics.audioLevelsEnabled)
        return;

    this.stopRemoteStats();

    try {
        this.rtpStats
            = new RTPStats(peerconnection,
                    this.audioLevelsInterval, 2000, this.eventEmitter);
        this.rtpStats.start();
    } catch (e) {
        this.rtpStats = null;
        logger.error('Failed to start collecting remote statistics: ' + e);
    }
    if (this.rtpStats) {
        this.logStatsIntervalId = setInterval(function () {
            var stats = this.rtpStats.getCollectedStats();
            if (this.xmpp.sendLogs(stats)) {
                this.rtpStats.clearCollectedStats();
            }
        }.bind(this), LOG_INTERVAL);
    }
};

Statistics.localStats = [];

Statistics.startLocalStats = function (stream, callback) {
    if(!Statistics.audioLevelsEnabled)
        return;
    var localStats = new LocalStats(stream, this.audioLevelsInterval, callback);
    this.localStats.push(localStats);
    localStats.start();
};

Statistics.prototype.addAudioLevelListener = function(listener) {
    if(!Statistics.audioLevelsEnabled)
        return;
    this.eventEmitter.on(StatisticsEvents.AUDIO_LEVEL, listener);
};

Statistics.prototype.removeAudioLevelListener = function(listener) {
    if(!Statistics.audioLevelsEnabled)
        return;
    this.eventEmitter.removeListener(StatisticsEvents.AUDIO_LEVEL, listener);
};

Statistics.prototype.addConnectionStatsListener = function (listener) {
    this.eventEmitter.on(StatisticsEvents.CONNECTION_STATS, listener);
};

Statistics.prototype.removeConnectionStatsListener = function (listener) {
    this.eventEmitter.removeListener(StatisticsEvents.CONNECTION_STATS, listener);
};

Statistics.prototype.dispose = function () {
    if(Statistics.audioLevelsEnabled) {
        Statistics.stopAllLocalStats();
        this.stopRemoteStats();
        if(this.eventEmitter)
            this.eventEmitter.removeAllListeners();
    }
};

Statistics.stopAllLocalStats = function () {
    if(!Statistics.audioLevelsEnabled)
        return;

    for(var i = 0; i < this.localStats.length; i++)
        this.localStats[i].stop();
    this.localStats = [];
};

Statistics.stopLocalStats = function (stream) {
    if(!Statistics.audioLevelsEnabled)
        return;

    for(var i = 0; i < Statistics.localStats.length; i++)
        if(Statistics.localStats[i].stream === stream){
            var localStats = Statistics.localStats.splice(i, 1);
            localStats[0].stop();
            break;
        }
};

Statistics.prototype.stopRemoteStats = function () {
    if (!Statistics.audioLevelsEnabled || !this.rtpStats) {
        return;
    }

    this.rtpStats.stop();
    this.rtpStats = null;

    if (this.logStatsIntervalId) {
        clearInterval(this.logStatsIntervalId);
        this.logStatsIntervalId = null;
    }
};

//CALSTATS METHODS

/**
 * Initializes the callstats.io API.
 * @param peerConnection {JingleSessionPC} the session object
 * @param Settings {Settings} the settings instance. Declared in
 * /modules/settings/Settings.js
 */
Statistics.prototype.startCallStats = function (session, settings) {
    if(this.callStatsIntegrationEnabled && !this.callstats) {
        this.callstats = new CallStats(session, settings, this.options);
    }
};

/**
 * Returns true if the callstats integration is enabled, otherwise returns
 * false.
 *
 * @returns true if the callstats integration is enabled, otherwise returns
 * false.
 */
Statistics.prototype.isCallstatsEnabled = function () {
    return this.callStatsIntegrationEnabled;
};

/**
 * Notifies CallStats for ice connection failed
 * @param {RTCPeerConnection} pc connection on which failure occured.
 */
Statistics.prototype.sendIceConnectionFailedEvent = function (pc) {
    if(this.callstats)
        this.callstats.sendIceConnectionFailedEvent(pc, this.callstats);
};

/**
 * Notifies CallStats for mute events
 * @param mute {boolean} true for muted and false for not muted
 * @param type {String} "audio"/"video"
 */
Statistics.prototype.sendMuteEvent = function (muted, type) {
    if(this.callstats)
        CallStats.sendMuteEvent(muted, type, this.callstats);
};

/**
 * Notifies CallStats for screen sharing events
 * @param start {boolean} true for starting screen sharing and
 * false for not stopping
 */
Statistics.prototype.sendScreenSharingEvent = function (start) {
    if(this.callstats)
        CallStats.sendScreenSharingEvent(start, this.callstats);
};

/**
 * Notifies the statistics module that we are now the dominant speaker of the
 * conference.
 */
Statistics.prototype.sendDominantSpeakerEvent = function () {
    if(this.callstats)
        CallStats.sendDominantSpeakerEvent(this.callstats);
};

/**
 * Lets the underlying statistics module know where is given SSRC rendered by
 * providing renderer tag ID.
 * @param ssrc {number} the SSRC of the stream
 * @param isLocal {boolean} <tt>true<tt> if this stream is local or
 *        <tt>false</tt> otherwise.
 * @param usageLabel {string} meaningful usage label of this stream like
 *        'microphone', 'camera' or 'screen'.
 * @param containerId {string} the id of media 'audio' or 'video' tag which
 *        renders the stream.
 */
Statistics.prototype.associateStreamWithVideoTag =
function (ssrc, isLocal, usageLabel, containerId) {
    if(this.callstats) {
        this.callstats.associateStreamWithVideoTag(
            ssrc, isLocal, usageLabel, containerId);
    }
};

/**
 * Notifies CallStats that getUserMedia failed.
 *
 * @param {Error} e error to send
 */
Statistics.prototype.sendGetUserMediaFailed = function (e) {
    if(this.callstats) {
        CallStats.sendGetUserMediaFailed(
            e instanceof JitsiTrackError
                ? formatJitsiTrackErrorForCallStats(e)
                : e,
            this.callstats);
    }
};

/**
 * Notifies CallStats that getUserMedia failed.
 *
 * @param {Error} e error to send
 */
Statistics.sendGetUserMediaFailed = function (e) {
    CallStats.sendGetUserMediaFailed(
        e instanceof JitsiTrackError
            ? formatJitsiTrackErrorForCallStats(e)
            : e,
        null);
};

/**
 * Notifies CallStats that peer connection failed to create offer.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 */
Statistics.prototype.sendCreateOfferFailed = function (e, pc) {
    if(this.callstats)
        CallStats.sendCreateOfferFailed(e, pc, this.callstats);
};

/**
 * Notifies CallStats that peer connection failed to create answer.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 */
Statistics.prototype.sendCreateAnswerFailed = function (e, pc) {
    if(this.callstats)
        CallStats.sendCreateAnswerFailed(e, pc, this.callstats);
};

/**
 * Notifies CallStats that peer connection failed to set local description.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 */
Statistics.prototype.sendSetLocalDescFailed = function (e, pc) {
    if(this.callstats)
        CallStats.sendSetLocalDescFailed(e, pc, this.callstats);
};

/**
 * Notifies CallStats that peer connection failed to set remote description.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 */
Statistics.prototype.sendSetRemoteDescFailed = function (e, pc) {
    if(this.callstats)
        CallStats.sendSetRemoteDescFailed(e, pc, this.callstats);
};

/**
 * Notifies CallStats that peer connection failed to add ICE candidate.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 */
Statistics.prototype.sendAddIceCandidateFailed = function (e, pc) {
    if(this.callstats)
        CallStats.sendAddIceCandidateFailed(e, pc, this.callstats);
};

/**
 * Notifies CallStats that there is an unhandled error on the page.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 */
Statistics.prototype.sendUnhandledError = function (e) {
    if(this.callstats)
        CallStats.sendUnhandledError(e, this.callstats);
};

/**
 * Notifies CallStats that there is unhandled exception.
 *
 * @param {Error} e error to send
 */
Statistics.sendUnhandledError = function (e) {
    CallStats.sendUnhandledError(e, null);
};

/**
 * Adds to CallStats an application log.
 *
 * @param {String} a log message to send
 */
Statistics.sendLog = function (m) {
    // uses  the same field for cs stat as unhandled error
    CallStats.sendUnhandledError(m, null);
};

/**
 * Adds to CallStats an application log.
 *
 * @param {String} a log message to send
 */
Statistics.prototype.sendLog = function (m) {
    // uses  the same field for cs stat as unhandled error
    CallStats.sendUnhandledError(m, this.callstats);
};

/**
 * Sends the given feedback through CallStats.
 *
 * @param overall an integer between 1 and 5 indicating the user feedback
 * @param detailed detailed feedback from the user. Not yet used
 */
Statistics.prototype.sendFeedback = function(overall, detailed) {
    if(this.callstats)
        this.callstats.sendFeedback(overall, detailed);
};

Statistics.LOCAL_JID = require("../../service/statistics/constants").LOCAL_JID;

/**
 * Reports global error to CallStats.
 *
 * @param {Error} error
 */
Statistics.reportGlobalError = function (error) {
    if (error instanceof JitsiTrackError && error.gum) {
        this.sendGetUserMediaFailed(error);
    } else {
        this.sendUnhandledError(error);
    }
};

module.exports = Statistics;
