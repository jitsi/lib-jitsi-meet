/* global $, Strophe, callstats */
const logger = require('jitsi-meet-logger').getLogger(__filename);
const GlobalOnErrorHandler = require('../util/GlobalOnErrorHandler');

import Settings from '../settings/Settings';

const jsSHA = require('jssha');
const io = require('socket.io-client');

/**
 * We define enumeration of wrtcFuncNames as we need them before
 * callstats is initialized to queue events.
 * @const
 * @see http://www.callstats.io/api/#enumeration-of-wrtcfuncnames
 */
const wrtcFuncNames = {
    createOffer: 'createOffer',
    createAnswer: 'createAnswer',
    setLocalDescription: 'setLocalDescription',
    setRemoteDescription: 'setRemoteDescription',
    addIceCandidate: 'addIceCandidate',
    getUserMedia: 'getUserMedia',
    iceConnectionFailure: 'iceConnectionFailure',
    signalingError: 'signalingError',
    applicationLog: 'applicationLog'
};

/**
 * We define enumeration of fabricEvent as we need them before
 * callstats is initialized to queue events.
 * @const
 * @see http://www.callstats.io/api/#enumeration-of-fabricevent
 */
const fabricEvent = {
    fabricHold: 'fabricHold',
    fabricResume: 'fabricResume',
    audioMute: 'audioMute',
    audioUnmute: 'audioUnmute',
    videoPause: 'videoPause',
    videoResume: 'videoResume',
    fabricUsageEvent: 'fabricUsageEvent',
    fabricStats: 'fabricStats',
    fabricTerminated: 'fabricTerminated',
    screenShareStart: 'screenShareStart',
    screenShareStop: 'screenShareStop',
    dominantSpeaker: 'dominantSpeaker',
    activeDeviceList: 'activeDeviceList'
};

let callStats = null;

/**
 * The user id to report to callstats as destination.
 * @type {string}
 */
const DEFAULT_REMOTE_USER = 'jitsi';

function initCallback(err, msg) {
    logger.log(`CallStats Status: err=${err} msg=${msg}`);

    CallStats.initializeInProgress = false;

    // there is no lib, nothing to report to
    if (err !== 'success') {
        CallStats.initializeFailed = true;

        return;
    }

    const ret = callStats.addNewFabric(this.peerconnection,
        DEFAULT_REMOTE_USER,
        callStats.fabricUsage.multiplex,
        this.confID,
        this.pcCallback.bind(this));

    const fabricInitialized = ret.status === 'success';

    if (!fabricInitialized) {
        CallStats.initializeFailed = true;
        logger.log('callstats fabric not initilized', ret.message);

        return;
    }

    CallStats.initializeFailed = false;
    CallStats.initialized = true;
    CallStats.feedbackEnabled = true;

    // notify callstats about failures if there were any
    if (CallStats.reportsQueue.length) {
        CallStats.reportsQueue.forEach(function(report) {
            if (report.type === reportType.ERROR) {
                const error = report.data;

                CallStats._reportError.call(this, error.type, error.error,
                    error.pc);
            } else if (report.type === reportType.EVENT
                && fabricInitialized) {
                // if we have and event to report and we failed to add fabric
                // this event will not be reported anyway, returning an error
                const eventData = report.data;

                callStats.sendFabricEvent(
                    this.peerconnection,
                    eventData.event,
                    this.confID,
                    eventData.eventData);
            } else if (report.type === reportType.MST_WITH_USERID) {
                const data = report.data;

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
function _try_catch(f) {
    return function() {
        try {
            f.apply(this, arguments); // eslint-disable-line prefer-rest-params
        } catch (e) {
            GlobalOnErrorHandler.callErrorHandler(e);
            logger.error(e);
        }
    };
}

/**
 * Creates new CallStats instance that handles all callstats API calls.
 * @param peerConnection {JingleSessionPC} the session object
 * @param options {object} credentials for callstats.
 */
const CallStats = _try_catch(function(jingleSession, options) {
    try {
        CallStats.feedbackEnabled = false;
        callStats = new callstats($, io, jsSHA); // eslint-disable-line new-cap

        this.peerconnection = jingleSession.peerconnection.peerconnection;

        this.userID = {
            aliasName: Strophe.getResourceFromJid(jingleSession.room.myroomjid),
            userName: Settings.getCallStatsUserName()
        };

        // The confID is case sensitive!!!
        this.confID = `${options.callStatsConfIDNamespace}/${options.roomName}`;

        this.callStatsID = options.callStatsID;
        this.callStatsSecret = options.callStatsSecret;

        CallStats.initializeInProgress = true;

        // userID is generated or given by the origin server
        callStats.initialize(this.callStatsID,
            this.callStatsSecret,
            this.userID,
            initCallback.bind(this));

    } catch (e) {
        // The callstats.io API failed to initialize (e.g. because its download
        // did not succeed in general or on time). Further attempts to utilize
        // it cannot possibly succeed.
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
 * Whether we are in progress of initializing.
 * @type {boolean}
 */
CallStats.initializeInProgress = false;

/**
 * Whether we tried to initialize and it failed.
 * @type {boolean}
 */
CallStats.initializeFailed = false;

/**
 * Shows weather sending feedback is enabled or not
 * @type {boolean}
 */
CallStats.feedbackEnabled = false;

/**
 * Checks whether we need to re-initialize callstats and starts the process.
 * @private
 */
CallStats._checkInitialize = function() {
    if (CallStats.initialized || !CallStats.initializeFailed
        || !callStats || CallStats.initializeInProgress) {
        return;
    }

    // callstats object created, not initialized and it had previously failed,
    // and there is no init in progress, so lets try initialize it again
    CallStats.initializeInProgress = true;
    callStats.initialize(
        callStats.callStatsID,
        callStats.callStatsSecret,
        callStats.userID,
        initCallback.bind(callStats));
};

/**
 * Type of pending reports, can be event or an error.
 * @type {{ERROR: string, EVENT: string}}
 */
const reportType = {
    ERROR: 'error',
    EVENT: 'event',
    MST_WITH_USERID: 'mstWithUserID'
};

CallStats.prototype.pcCallback = _try_catch((err, msg) => {
    if (callStats && err !== 'success') {
        logger.error(`Monitoring status: ${err} msg: ${msg}`);
    }
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
CallStats.prototype.associateStreamWithVideoTag
= function(ssrc, isLocal, usageLabel, containerId) {
    if (!callStats) {
        return;
    }

    // 'jitsi' is default remote user ID for now
    const callStatsId = isLocal ? this.userID : DEFAULT_REMOTE_USER;

    _try_catch(function() {
        logger.debug(
            'Calling callStats.associateMstWithUserID with:',
            this.peerconnection,
            callStatsId,
            this.confID,
            ssrc,
            usageLabel,
            containerId);
        if (CallStats.initialized) {
            callStats.associateMstWithUserID(
                this.peerconnection,
                callStatsId,
                this.confID,
                ssrc,
                usageLabel,
                containerId);
        } else {
            CallStats.reportsQueue.push({
                type: reportType.MST_WITH_USERID,
                data: {
                    callStatsId,
                    containerId,
                    ssrc,
                    usageLabel
                }
            });
            CallStats._checkInitialize();
        }
    }).bind(this)();
};

/**
 * Notifies CallStats for mute events
 * @param mute {boolean} true for muted and false for not muted
 * @param type {String} "audio"/"video"
 * @param {CallStats} cs callstats instance related to the event
 */
CallStats.sendMuteEvent = _try_catch((mute, type, cs) => {
    let event;

    if (type === 'video') {
        event = mute ? fabricEvent.videoPause : fabricEvent.videoResume;
    } else {
        event = mute ? fabricEvent.audioMute : fabricEvent.audioUnmute;
    }

    CallStats._reportEvent.call(cs, event);
});

/**
 * Notifies CallStats for screen sharing events
 * @param start {boolean} true for starting screen sharing and
 * false for not stopping
 * @param {CallStats} cs callstats instance related to the event
 */
CallStats.sendScreenSharingEvent = _try_catch((start, cs) => {
    CallStats._reportEvent.call(
        cs,
        start ? fabricEvent.screenShareStart : fabricEvent.screenShareStop);
});

/**
 * Notifies CallStats that we are the new dominant speaker in the conference.
 * @param {CallStats} cs callstats instance related to the event
 */
CallStats.sendDominantSpeakerEvent = _try_catch(cs => {
    CallStats._reportEvent.call(cs, fabricEvent.dominantSpeaker);
});

/**
 * Notifies CallStats about active device.
 * @param {{deviceList: {String:String}}} list of devices with their data
 * @param {CallStats} cs callstats instance related to the event
 */
CallStats.sendActiveDeviceListEvent = _try_catch((devicesData, cs) => {
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
CallStats._reportEvent = function(event, eventData) {
    if (CallStats.initialized) {
        callStats.sendFabricEvent(
            this.peerconnection, event, this.confID, eventData);
    } else {
        CallStats.reportsQueue.push({
            type: reportType.EVENT,
            data: { event,
                eventData }
        });
        CallStats._checkInitialize();
    }
};

/**
 * Notifies CallStats for connection setup errors
 */
CallStats.prototype.sendTerminateEvent = _try_catch(function() {
    if (!CallStats.initialized) {
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
CallStats.prototype.sendIceConnectionFailedEvent = _try_catch((pc, cs) => {
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
    if (!CallStats.feedbackEnabled) {
        return;
    }

    callStats.sendUserFeedback(this.confID, {
        userID: this.userID,
        overall: overallFeedback,
        comment: detailedFeedback
    });
});

/**
 * Reports an error to callstats.
 *
 * @param type the type of the error, which will be one of the wrtcFuncNames
 * @param e the error
 * @param pc the peerconnection
 * @private
 */
CallStats._reportError = function(type, e, pc) {
    let error = e;

    if (!error) {
        logger.warn('No error is passed!');
        error = new Error('Unknown error');
    }
    if (CallStats.initialized) {
        callStats.reportError(pc, this.confID, type, error);
    } else {
        CallStats.reportsQueue.push({
            type: reportType.ERROR,
            data: {
                error,
                pc,
                type
            }
        });
        CallStats._checkInitialize();
    }

    // else just ignore it
};

/**
 * Notifies CallStats that getUserMedia failed.
 *
 * @param {Error} e error to send
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendGetUserMediaFailed = _try_catch((e, cs) => {
    CallStats._reportError.call(cs, wrtcFuncNames.getUserMedia, e, null);
});

/**
 * Notifies CallStats that peer connection failed to create offer.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendCreateOfferFailed = _try_catch((e, pc, cs) => {
    CallStats._reportError.call(cs, wrtcFuncNames.createOffer, e, pc);
});

/**
 * Notifies CallStats that peer connection failed to create answer.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendCreateAnswerFailed = _try_catch((e, pc, cs) => {
    CallStats._reportError.call(cs, wrtcFuncNames.createAnswer, e, pc);
});

/**
 * Notifies CallStats that peer connection failed to set local description.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendSetLocalDescFailed = _try_catch((e, pc, cs) => {
    CallStats._reportError.call(cs, wrtcFuncNames.setLocalDescription, e, pc);
});

/**
 * Notifies CallStats that peer connection failed to set remote description.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendSetRemoteDescFailed = _try_catch((e, pc, cs) => {
    CallStats._reportError.call(cs, wrtcFuncNames.setRemoteDescription, e, pc);
});

/**
 * Notifies CallStats that peer connection failed to add ICE candidate.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendAddIceCandidateFailed = _try_catch((e, pc, cs) => {
    CallStats._reportError.call(cs, wrtcFuncNames.addIceCandidate, e, pc);
});

/**
 * Notifies CallStats that there is a log we want to report.
 *
 * @param {Error} e error to send or {String} message
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendApplicationLog = _try_catch((e, cs) => {
    CallStats._reportError.call(cs, wrtcFuncNames.applicationLog, e, null);
});

/**
 * Clears allocated resources.
 */
CallStats.dispose = function() {
    // The next line is commented because we need to be able to send feedback
    // even after the conference has been destroyed.
    // callStats = null;
    CallStats.initialized = false;
    CallStats.initializeFailed = false;
    CallStats.initializeInProgress = false;
};

module.exports = CallStats;
