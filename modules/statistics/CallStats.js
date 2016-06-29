/* global $, Strophe, callstats */
var logger = require("jitsi-meet-logger").getLogger(__filename);
var GlobalOnErrorHandler = require("../util/GlobalOnErrorHandler");

var jsSHA = require('jssha');
var io = require('socket.io-client');

/**
 * We define enumeration of wrtcFuncNames as we need them before
 * callstats is initialized to queue events.
 * @const
 * @see http://www.callstats.io/api/#enumeration-of-wrtcfuncnames
 */
var wrtcFuncNames = {
    createOffer:          "createOffer",
    createAnswer:         "createAnswer",
    setLocalDescription:  "setLocalDescription",
    setRemoteDescription: "setRemoteDescription",
    addIceCandidate:      "addIceCandidate",
    getUserMedia:         "getUserMedia",
    iceConnectionFailure: "iceConnectionFailure",
    signalingError:       "signalingError",
    applicationLog:       "applicationLog"
};

/**
 * We define enumeration of fabricEvent as we need them before
 * callstats is initialized to queue events.
 * @const
 * @see http://www.callstats.io/api/#enumeration-of-fabricevent
 */
var fabricEvent = {
    fabricHold:"fabricHold",
    fabricResume:"fabricResume",
    audioMute:"audioMute",
    audioUnmute:"audioUnmute",
    videoPause:"videoPause",
    videoResume:"videoResume",
    fabricUsageEvent:"fabricUsageEvent",
    fabricStats:"fabricStats",
    fabricTerminated:"fabricTerminated",
    screenShareStart:"screenShareStart",
    screenShareStop:"screenShareStop",
    dominantSpeaker:"dominantSpeaker",
    activeDeviceList:"activeDeviceList"
};

var callStats = null;

function initCallback (err, msg) {
    logger.log("CallStats Status: err=" + err + " msg=" + msg);

    // there is no lib, nothing to report to
    if (err !== 'success')
        return;

    CallStats.initialized = true;

    var ret = callStats.addNewFabric(this.peerconnection,
        Strophe.getResourceFromJid(this.session.peerjid),
        callStats.fabricUsage.multiplex,
        this.confID,
        this.pcCallback.bind(this));

    var fabricInitialized = (ret.status === 'success');

    if(!fabricInitialized)
        console.log("callstats fabric not initilized", ret.message);

    // notify callstats about failures if there were any
    if (CallStats.reportsQueue.length) {
        CallStats.reportsQueue.forEach(function (report) {
            if (report.type === reportType.ERROR) {
                var error = report.data;
                CallStats._reportError.call(this, error.type, error.error,
                    error.pc);
            }
            // if we have and event to report and we failed to add fabric
            // this event will not be reported anyway, returning an error
            else if (report.type === reportType.EVENT
                && fabricInitialized) {
                var eventData = report.data;
                callStats.sendFabricEvent(
                    this.peerconnection,
                    eventData.event,
                    this.confID,
                    eventData.eventData);
            } else if (report.type === reportType.MST_WITH_USERID) {
                var data = report.data;
                callStats.associateMstWithUserID(
                    this.peerconnection,
                    data.callStatsId,
                    this.confID,
                    data.ssrc,
                    data.usageLabel,
                    data.containerId
                );
            }
        }, this);
        CallStats.reportsQueue.length = 0;
    }
}

/**
 * Returns a function which invokes f in a try/catch block, logs any exception
 * to the console, and then swallows it.
 *
 * @param f the function to invoke in a try/catch block
 * @return a function which invokes f in a try/catch block, logs any exception
 * to the console, and then swallows it
 */
function _try_catch (f) {
    return function () {
        try {
            f.apply(this, arguments);
        } catch (e) {
            GlobalOnErrorHandler.callErrorHandler(e);
            logger.error(e);
        }
    };
}

/**
 * Creates new CallStats instance that handles all callstats API calls.
 * @param peerConnection {JingleSessionPC} the session object
 * @param Settings {Settings} the settings instance. Declared in
 * /modules/settings/Settings.js
 * @param options {object} credentials for callstats.
 */
var CallStats = _try_catch(function(jingleSession, Settings, options) {
    try{
        //check weather that should work with more than 1 peerconnection
        if(!callStats) {
            callStats = new callstats($, io, jsSHA);
        } else {
            return;
        }

        this.session = jingleSession;
        this.peerconnection = jingleSession.peerconnection.peerconnection;

        this.userID = Settings.getCallStatsUserName();

        var location = window.location;
        // The confID is case sensitive!!!
        this.confID = location.hostname + "/" + options.roomName;

        //userID is generated or given by the origin server
        callStats.initialize(options.callStatsID,
            options.callStatsSecret,
            this.userID,
            initCallback.bind(this));

    } catch (e) {
        // The callstats.io API failed to initialize (e.g. because its
        // download failed to succeed in general or on time). Further
        // attempts to utilize it cannot possibly succeed.
        GlobalOnErrorHandler.callErrorHandler(e);
        callStats = null;
        logger.error(e);
    }
});

// some errors/events may happen before CallStats init
// in this case we accumulate them in this array
// and send them to callstats on init
CallStats.reportsQueue = [];

/**
 * Whether the library was successfully initialized using its initialize method.
 * And whether we had successfully called addNewFabric.
 * @type {boolean}
 */
CallStats.initialized = false;

/**
 * Type of pending reports, can be event or an error.
 * @type {{ERROR: string, EVENT: string}}
 */
var reportType = {
    ERROR: "error",
    EVENT: "event",
    MST_WITH_USERID: "mstWithUserID"
};

CallStats.prototype.pcCallback = _try_catch(function (err, msg) {
    if (!callStats) {
        return;
    }
    logger.log("Monitoring status: "+ err + " msg: " + msg);
});

/**
 * Lets CallStats module know where is given SSRC rendered by providing renderer
 * tag ID.
 * If the lib is not initialized yet queue the call for later, when its ready.
 * @param ssrc {number} the SSRC of the stream
 * @param isLocal {boolean} <tt>true<tt> if this stream is local or
 *        <tt>false</tt> otherwise.
 * @param usageLabel {string} meaningful usage label of this stream like
 *        'microphone', 'camera' or 'screen'.
 * @param containerId {string} the id of media 'audio' or 'video' tag which
 *        renders the stream.
 */
CallStats.prototype.associateStreamWithVideoTag =
function (ssrc, isLocal, usageLabel, containerId) {
    if(!callStats) {
        return;
    }
    // 'focus' is default remote user ID for now
    var callStatsId = 'focus';
    if (isLocal) {
        callStatsId = this.userID;
    }

    _try_catch(function() {
        logger.debug(
            "Calling callStats.associateMstWithUserID with:",
            this.peerconnection,
            callStatsId,
            this.confID,
            ssrc,
            usageLabel,
            containerId
        );
        if(CallStats.initialized) {
            callStats.associateMstWithUserID(
                this.peerconnection,
                callStatsId,
                this.confID,
                ssrc,
                usageLabel,
                containerId
            );
        }
        else {
            CallStats.reportsQueue.push({
                type: reportType.MST_WITH_USERID,
                data: {
                    callStatsId: callStatsId,
                    ssrc: ssrc,
                    usageLabel: usageLabel,
                    containerId: containerId
                }
            });
        }
    }).bind(this)();
};

/**
 * Notifies CallStats for mute events
 * @param mute {boolean} true for muted and false for not muted
 * @param type {String} "audio"/"video"
 * @param {CallStats} cs callstats instance related to the event
 */
CallStats.sendMuteEvent = _try_catch(function (mute, type, cs) {

    var event = null;
    if (type === "video") {
        event = (mute? fabricEvent.videoPause : fabricEvent.videoResume);
    }
    else {
        event = (mute? fabricEvent.audioMute : fabricEvent.audioUnmute);
    }

    CallStats._reportEvent.call(cs, event);
});

/**
 * Notifies CallStats for screen sharing events
 * @param start {boolean} true for starting screen sharing and
 * false for not stopping
 * @param {CallStats} cs callstats instance related to the event
 */
CallStats.sendScreenSharingEvent = _try_catch(function (start, cs) {

    CallStats._reportEvent.call(cs,
        start? fabricEvent.screenShareStart : fabricEvent.screenShareStop);
});

/**
 * Notifies CallStats that we are the new dominant speaker in the conference.
 * @param {CallStats} cs callstats instance related to the event
 */
CallStats.sendDominantSpeakerEvent = _try_catch(function (cs) {

    CallStats._reportEvent.call(cs,
        fabricEvent.dominantSpeaker);
});

/**
 * Notifies CallStats about active device.
 * @param {{deviceList: {String:String}}} list of devices with their data
 * @param {CallStats} cs callstats instance related to the event
 */
CallStats.sendActiveDeviceListEvent = _try_catch(function (devicesData, cs) {

    CallStats._reportEvent.call(cs, fabricEvent.activeDeviceList, devicesData);
});

/**
 * Reports an error to callstats.
 *
 * @param type the type of the error, which will be one of the wrtcFuncNames
 * @param e the error
 * @param pc the peerconnection
 * @param eventData additional data to pass to event
 * @private
 */
CallStats._reportEvent = function (event, eventData) {
    if (CallStats.initialized) {
        callStats.sendFabricEvent(
            this.peerconnection, event, this.confID, eventData);
    } else {
        CallStats.reportsQueue.push({
                type: reportType.EVENT,
                data: {event: event, eventData: eventData}
            });
    }
};

/**
 * Notifies CallStats for connection setup errors
 */
CallStats.prototype.sendTerminateEvent = _try_catch(function () {
    if(!CallStats.initialized) {
        return;
    }
    callStats.sendFabricEvent(this.peerconnection,
        callStats.fabricEvent.fabricTerminated, this.confID);
});

/**
 * Notifies CallStats for ice connection failed
 * @param {RTCPeerConnection} pc connection on which failure occured.
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.prototype.sendIceConnectionFailedEvent = _try_catch(function (pc, cs){
    CallStats._reportError.call(
        cs, wrtcFuncNames.iceConnectionFailure, null, pc);
});

/**
 * Sends the given feedback through CallStats.
 *
 * @param overallFeedback an integer between 1 and 5 indicating the
 * user feedback
 * @param detailedFeedback detailed feedback from the user. Not yet used
 */
CallStats.prototype.sendFeedback = _try_catch(
function(overallFeedback, detailedFeedback) {
    if(!CallStats.initialized) {
        return;
    }
    var feedbackString =    '{"userID":"' + this.userID + '"' +
                            ', "overall":' + overallFeedback +
                            ', "comment": "' + detailedFeedback + '"}';

    var feedbackJSON = JSON.parse(feedbackString);

    callStats.sendUserFeedback(this.confID, feedbackJSON);
});

/**
 * Reports an error to callstats.
 *
 * @param type the type of the error, which will be one of the wrtcFuncNames
 * @param e the error
 * @param pc the peerconnection
 * @private
 */
CallStats._reportError = function (type, e, pc) {
    if(!e) {
        logger.warn("No error is passed!");
        e = new Error("Unknown error");
    }
    if (CallStats.initialized) {
        callStats.reportError(pc, this.confID, type, e);
    } else {
        CallStats.reportsQueue.push({
            type: reportType.ERROR,
            data: { type: type, error: e, pc: pc}
        });
    }
    // else just ignore it
};

/**
 * Notifies CallStats that getUserMedia failed.
 *
 * @param {Error} e error to send
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendGetUserMediaFailed = _try_catch(function (e, cs) {
    CallStats._reportError.call(cs, wrtcFuncNames.getUserMedia, e, null);
});

/**
 * Notifies CallStats that peer connection failed to create offer.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendCreateOfferFailed = _try_catch(function (e, pc, cs) {
    CallStats._reportError.call(cs, wrtcFuncNames.createOffer, e, pc);
});

/**
 * Notifies CallStats that peer connection failed to create answer.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendCreateAnswerFailed = _try_catch(function (e, pc, cs) {
    CallStats._reportError.call(cs, wrtcFuncNames.createAnswer, e, pc);
});

/**
 * Notifies CallStats that peer connection failed to set local description.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendSetLocalDescFailed = _try_catch(function (e, pc, cs) {
    CallStats._reportError.call(cs, wrtcFuncNames.setLocalDescription, e, pc);
});

/**
 * Notifies CallStats that peer connection failed to set remote description.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendSetRemoteDescFailed = _try_catch(function (e, pc, cs) {
    CallStats._reportError.call(cs, wrtcFuncNames.setRemoteDescription, e, pc);
});

/**
 * Notifies CallStats that peer connection failed to add ICE candidate.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendAddIceCandidateFailed = _try_catch(function (e, pc, cs) {
    CallStats._reportError.call(cs, wrtcFuncNames.addIceCandidate, e, pc);
});

/**
 * Notifies CallStats that there is a log we want to report.
 *
 * @param {Error} e error to send or {String} message
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendApplicationLog = _try_catch(function (e, cs) {
    CallStats._reportError
        .call(cs, wrtcFuncNames.applicationLog, e, null);
});

/**
 * Clears allocated resources.
 */
CallStats.dispose = function () {
    callStats = null;
    CallStats.initialized = false;
};

module.exports = CallStats;
