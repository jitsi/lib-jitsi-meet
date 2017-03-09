/* global require */
import analytics from "./AnalyticsAdapter";
var CallStats = require("./CallStats");
var EventEmitter = require("events");
import JitsiTrackError from "../../JitsiTrackError";
var logger = require("jitsi-meet-logger").getLogger(__filename);
var LocalStats = require("./LocalStatsCollector.js");
var RTPStats = require("./RTPStatsCollector.js");
var ScriptUtil = require('../util/ScriptUtil');
import * as StatisticsEvents from "../../service/statistics/Events";

/**
 * True if callstats API is loaded
 */
 var isCallstatsLoaded = false;

// Since callstats.io is a third party, we cannot guarantee the quality of their
// service. More specifically, their server may take noticeably long time to
// respond. Consequently, it is in our best interest (in the sense that the
// intergration of callstats.io is pretty important to us but not enough to
// allow it to prevent people from joining a conference) to (1) start
// downloading their API as soon as possible and (2) do the downloading
// asynchronously.
function loadCallStatsAPI(customScriptUrl) {
    if(!isCallstatsLoaded) {
        ScriptUtil.loadScript(
                customScriptUrl ? customScriptUrl :
                    'https://api.callstats.io/static/callstats-ws.min.js',
                /* async */ true,
                /* prepend */ true);
        isCallstatsLoaded = true;
    }
    // FIXME At the time of this writing, we hope that the callstats.io API will
    // have loaded by the time we needed it (i.e. CallStats.init is invoked).
}

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

/**
 * Init statistic options
 * @param options
 */
Statistics.init = function (options) {
    Statistics.audioLevelsEnabled = !options.disableAudioLevels;

    if(typeof options.audioLevelsInterval === 'number') {
        Statistics.audioLevelsInterval = options.audioLevelsInterval;
    }

    Statistics.disableThirdPartyRequests = options.disableThirdPartyRequests;

};

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
            && (Statistics.disableThirdPartyRequests !== true);
    if(this.callStatsIntegrationEnabled)
        {loadCallStatsAPI(this.options.callStatsCustomScriptUrl);}
    this.callStats = null;
    // Flag indicates whether or not the CallStats have been started for this
    // Statistics instance
    this.callStatsStarted = false;
}
Statistics.audioLevelsEnabled = false;
Statistics.audioLevelsInterval = 200;
Statistics.disableThirdPartyRequests = false;
Statistics.analytics = analytics;

/**
 * Array of callstats instances. Used to call Statistics static methods and
 * send stats to all cs instances.
 */
Statistics.callsStatsInstances = [];

Statistics.prototype.startRemoteStats = function (peerconnection) {
    this.stopRemoteStats();

    try {
        this.rtpStats
            = new RTPStats(peerconnection,
                    Statistics.audioLevelsInterval, 2000, this.eventEmitter);
        this.rtpStats.start(Statistics.audioLevelsEnabled);
    } catch (e) {
        this.rtpStats = null;
        logger.error('Failed to start collecting remote statistics: ' + e);
    }
};

Statistics.localStats = [];

Statistics.startLocalStats = function (stream, callback) {
    if(!Statistics.audioLevelsEnabled)
        {return;}
    var localStats = new LocalStats(stream, Statistics.audioLevelsInterval,
        callback);
    this.localStats.push(localStats);
    localStats.start();
};

Statistics.prototype.addAudioLevelListener = function(listener) {
    if(!Statistics.audioLevelsEnabled)
        {return;}
    this.eventEmitter.on(StatisticsEvents.AUDIO_LEVEL, listener);
};

Statistics.prototype.removeAudioLevelListener = function(listener) {
    if(!Statistics.audioLevelsEnabled)
        {return;}
    this.eventEmitter.removeListener(StatisticsEvents.AUDIO_LEVEL, listener);
};

Statistics.prototype.addBeforeDisposedListener = function (listener) {
    this.eventEmitter.on(StatisticsEvents.BEFORE_DISPOSED, listener);
};

Statistics.prototype.removeBeforeDisposedListener = function (listener) {
    this.eventEmitter.removeListener(
        StatisticsEvents.BEFORE_DISPOSED, listener);
};

Statistics.prototype.addConnectionStatsListener = function (listener) {
    this.eventEmitter.on(StatisticsEvents.CONNECTION_STATS, listener);
};

Statistics.prototype.removeConnectionStatsListener = function (listener) {
    this.eventEmitter.removeListener(StatisticsEvents.CONNECTION_STATS, listener);
};

Statistics.prototype.addByteSentStatsListener = function (listener) {
    this.eventEmitter.on(StatisticsEvents.BYTE_SENT_STATS, listener);
};

Statistics.prototype.removeByteSentStatsListener = function (listener) {
    this.eventEmitter.removeListener(StatisticsEvents.BYTE_SENT_STATS,
        listener);
};

Statistics.prototype.dispose = function () {
    if (this.eventEmitter) {
        this.eventEmitter.emit(StatisticsEvents.BEFORE_DISPOSED);
    }
    this.stopCallStats();
    this.stopRemoteStats();
    if(this.eventEmitter)
        {this.eventEmitter.removeAllListeners();}
};

Statistics.stopLocalStats = function (stream) {
    if(!Statistics.audioLevelsEnabled)
        {return;}

    for(var i = 0; i < Statistics.localStats.length; i++)
        {if(Statistics.localStats[i].stream === stream){
            var localStats = Statistics.localStats.splice(i, 1);
            localStats[0].stop();
            break;
        }}
};

Statistics.prototype.stopRemoteStats = function () {
    if (!this.rtpStats) {
        return;
    }

    this.rtpStats.stop();
    this.rtpStats = null;
};

//CALSTATS METHODS

/**
 * Initializes the callstats.io API.
 * @param peerConnection {JingleSessionPC} the session object
 */
Statistics.prototype.startCallStats = function (session) {
    if(this.callStatsIntegrationEnabled && !this.callStatsStarted) {
        // Here we overwrite the previous instance, but it must be bound to
        // the new PeerConnection
        this.callstats = new CallStats(session, this.options);
        Statistics.callsStatsInstances.push(this.callstats);
        this.callStatsStarted = true;
    }
};

/**
 * Removes the callstats.io instances.
 */
Statistics.prototype.stopCallStats = function () {
    if(this.callStatsStarted) {
        var index = Statistics.callsStatsInstances.indexOf(this.callstats);
        if(index > -1)
            {Statistics.callsStatsInstances.splice(index, 1);}
        // The next line is commented because we need to be able to send
        // feedback even after the conference has been destroyed.
        // this.callstats = null;
        CallStats.dispose();
        this.callStatsStarted = false;
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
 * Notifies CallStats and analytics(if present) for ice connection failed
 * @param {RTCPeerConnection} pc connection on which failure occured.
 */
Statistics.prototype.sendIceConnectionFailedEvent = function (pc) {
    if(this.callstats)
        {this.callstats.sendIceConnectionFailedEvent(pc, this.callstats);}
    Statistics.analytics.sendEvent('connection.ice_failed');
};

/**
 * Notifies CallStats for mute events
 * @param mute {boolean} true for muted and false for not muted
 * @param type {String} "audio"/"video"
 */
Statistics.prototype.sendMuteEvent = function (muted, type) {
    if(this.callstats)
        {CallStats.sendMuteEvent(muted, type, this.callstats);}
};

/**
 * Notifies CallStats for screen sharing events
 * @param start {boolean} true for starting screen sharing and
 * false for not stopping
 */
Statistics.prototype.sendScreenSharingEvent = function (start) {
    if(this.callstats)
        {CallStats.sendScreenSharingEvent(start, this.callstats);}
};

/**
 * Notifies the statistics module that we are now the dominant speaker of the
 * conference.
 */
Statistics.prototype.sendDominantSpeakerEvent = function () {
    if(this.callstats)
        {CallStats.sendDominantSpeakerEvent(this.callstats);}
};

/**
 * Notifies about active device.
 * @param {{deviceList: {String:String}}} devicesData - list of devices with
 *      their data
 */
Statistics.sendActiveDeviceListEvent = function (devicesData) {
    if (Statistics.callsStatsInstances.length) {
        Statistics.callsStatsInstances.forEach(function (cs) {
            CallStats.sendActiveDeviceListEvent(devicesData, cs);
        });
    } else {
        CallStats.sendActiveDeviceListEvent(devicesData, null);
    }
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
Statistics.sendGetUserMediaFailed = function (e) {

    if (Statistics.callsStatsInstances.length) {
        Statistics.callsStatsInstances.forEach(function (cs) {
            CallStats.sendGetUserMediaFailed(
                e instanceof JitsiTrackError
                    ? formatJitsiTrackErrorForCallStats(e)
                    : e,
                cs);
        });
    } else {
        CallStats.sendGetUserMediaFailed(
            e instanceof JitsiTrackError
                ? formatJitsiTrackErrorForCallStats(e)
                : e,
            null);
    }
};

/**
 * Notifies CallStats that peer connection failed to create offer.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 */
Statistics.prototype.sendCreateOfferFailed = function (e, pc) {
    if(this.callstats)
        {CallStats.sendCreateOfferFailed(e, pc, this.callstats);}
};

/**
 * Notifies CallStats that peer connection failed to create answer.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 */
Statistics.prototype.sendCreateAnswerFailed = function (e, pc) {
    if(this.callstats)
        {CallStats.sendCreateAnswerFailed(e, pc, this.callstats);}
};

/**
 * Notifies CallStats that peer connection failed to set local description.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 */
Statistics.prototype.sendSetLocalDescFailed = function (e, pc) {
    if(this.callstats)
        {CallStats.sendSetLocalDescFailed(e, pc, this.callstats);}
};

/**
 * Notifies CallStats that peer connection failed to set remote description.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 */
Statistics.prototype.sendSetRemoteDescFailed = function (e, pc) {
    if(this.callstats)
        {CallStats.sendSetRemoteDescFailed(e, pc, this.callstats);}
};

/**
 * Notifies CallStats that peer connection failed to add ICE candidate.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 */
Statistics.prototype.sendAddIceCandidateFailed = function (e, pc) {
    if(this.callstats)
        {CallStats.sendAddIceCandidateFailed(e, pc, this.callstats);}
};

/**
 * Adds to CallStats an application log.
 *
 * @param {String} a log message to send or an {Error} object to be reported
 */
Statistics.sendLog = function (m) {
    if (Statistics.callsStatsInstances.length) {
        Statistics.callsStatsInstances.forEach(function (cs) {
            CallStats.sendApplicationLog(m, cs);
        });
    } else {
        CallStats.sendApplicationLog(m, null);
    }
};

/**
 * Sends the given feedback through CallStats.
 *
 * @param overall an integer between 1 and 5 indicating the user feedback
 * @param detailed detailed feedback from the user. Not yet used
 */
Statistics.prototype.sendFeedback = function(overall, detailed) {
    if(this.callstats)
        {this.callstats.sendFeedback(overall, detailed);}
    Statistics.analytics.sendEvent("feedback.rating",
        {value: overall, detailed: detailed});
};

Statistics.LOCAL_JID = require("../../service/statistics/constants").LOCAL_JID;

/**
 * Reports global error to CallStats.
 *
 * @param {Error} error
 */
Statistics.reportGlobalError = function (error) {
    if (error instanceof JitsiTrackError && error.gum) {
        Statistics.sendGetUserMediaFailed(error);
    } else {
        Statistics.sendLog(error);
    }
};

/**
 * Sends event to analytics and callstats.
 * @param {string} eventName the event name.
 * @param {Object} data the data to be sent.
 */
Statistics.sendEventToAll = function (eventName, data) {
    this.analytics.sendEvent(eventName, data);
    Statistics.sendLog(JSON.stringify({name: eventName, data}));
};

module.exports = Statistics;
