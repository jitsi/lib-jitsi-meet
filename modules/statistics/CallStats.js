/* global $, callstats */
const logger = require('jitsi-meet-logger').getLogger(__filename);
const GlobalOnErrorHandler = require('../util/GlobalOnErrorHandler');

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

let callStatsBackend = null;

/**
 * The user id to report to callstats as destination.
 * @type {string}
 */
const DEFAULT_REMOTE_USER = 'jitsi';

/**
 * Type of pending reports, can be event or an error.
 * @type {{ERROR: string, EVENT: string}}
 */
const reportType = {
    ERROR: 'error',
    EVENT: 'event',
    MST_WITH_USERID: 'mstWithUserID'
};

/* eslint-enable no-invalid-this */

/**
 * Returns a function which invokes f in a try/catch block, logs any exception
 * to the console, and then swallows it.
 *
 * @param f the function to invoke in a try/catch block
 * @return a function which invokes f in a try/catch block, logs any exception
 * to the console, and then swallows it
 */
function tryCatch(f) {
    return function() {
        try {

            // eslint-disable-next-line no-invalid-this
            f.apply(this, arguments); // eslint-disable-line prefer-rest-params
        } catch (e) {
            GlobalOnErrorHandler.callErrorHandler(e);
            logger.error(e);
        }
    };
}

/* eslint-disable no-invalid-this */

/**
 * Creates new CallStats instance that handles all callstats API calls.
 * @param {TraceablePeerConnection} tpc
 * @param {Object} options
 * @param {String} options.callStatsID CallStats credentials - ID
 * @param {String} options.callStatsSecret CallStats credentials - secret
 * @param {string} options.confID the conference ID that wil be used to report
 * the session.
 * @param {string} options.userName the <tt>userName</tt> part of
 * the <tt>userID</tt> aka display name, see CallStats docs for more info.
 * @param {string} options.aliasName the <tt>aliasName</tt> part of
 * the <tt>userID</tt> aka endpoint ID, see CallStats docs for more info.
 */
const CallStats = tryCatch(function(tpc, options) {
    try {
        CallStats.feedbackEnabled = false;
        callStatsBackend
            = new callstats($, io, jsSHA); // eslint-disable-line new-cap

        this.peerconnection = tpc.peerconnection;
        this.userID = {
            aliasName: options.aliasName,
            userName: options.userName
        };
        this.confID = options.confID;

        this.callStatsID = options.callStatsID;
        this.callStatsSecret = options.callStatsSecret;

        CallStats.initializeInProgress = true;

        // userID is generated or given by the origin server
        callStatsBackend.initialize(this.callStatsID,
            this.callStatsSecret,
            this.userID,
            initCallback.bind(this));

    } catch (e) {
        // The callstats.io API failed to initialize (e.g. because its download
        // did not succeed in general or on time). Further attempts to utilize
        // it cannot possibly succeed.
        GlobalOnErrorHandler.callErrorHandler(e);
        callStatsBackend = null;
        logger.error(e);
    }
});

/* eslint-enable no-invalid-this */

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
        || !callStatsBackend || CallStats.initializeInProgress) {
        return;
    }

    // callstats object created, not initialized and it had previously failed,
    // and there is no init in progress, so lets try initialize it again
    CallStats.initializeInProgress = true;
    callStatsBackend.initialize(
        callStatsBackend.callStatsID,
        callStatsBackend.callStatsSecret,
        callStatsBackend.userID,
        initCallback.bind(callStatsBackend));
};

CallStats.prototype.pcCallback = tryCatch((err, msg) => {
    if (callStatsBackend && err !== 'success') {
        logger.error(`Monitoring status: ${err} msg: ${msg}`);
    }
});

/* eslint-disable max-params */

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
CallStats.prototype.associateStreamWithVideoTag = function(
        ssrc,
        isLocal,
        usageLabel,
        containerId) {
    if (!callStatsBackend) {
        return;
    }

    // 'jitsi' is default remote user ID for now
    const callStatsId = isLocal ? this.userID : DEFAULT_REMOTE_USER;

    tryCatch(() => {
        logger.debug(
            'Calling callStats.associateMstWithUserID with:',
            this.peerconnection,
            callStatsId,
            this.confID,
            ssrc,
            usageLabel,
            containerId);
        if (CallStats.initialized) {
            callStatsBackend.associateMstWithUserID(
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
    })();
};

/* eslint-enable max-params */

/**
 * Notifies CallStats for mute events
 * @param mute {boolean} true for muted and false for not muted
 * @param type {String} "audio"/"video"
 * @param {CallStats} cs callstats instance related to the event
 */
CallStats.sendMuteEvent = tryCatch((mute, type, cs) => {
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
CallStats.sendScreenSharingEvent = tryCatch((start, cs) => {
    CallStats._reportEvent.call(
        cs,
        start ? fabricEvent.screenShareStart : fabricEvent.screenShareStop);
});

/**
 * Notifies CallStats that we are the new dominant speaker in the conference.
 * @param {CallStats} cs callstats instance related to the event
 */
CallStats.sendDominantSpeakerEvent = tryCatch(cs => {
    CallStats._reportEvent.call(cs, fabricEvent.dominantSpeaker);
});

/**
 * Notifies CallStats about active device.
 * @param {{deviceList: {String:String}}} list of devices with their data
 * @param {CallStats} cs callstats instance related to the event
 */
CallStats.sendActiveDeviceListEvent = tryCatch((devicesData, cs) => {
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
        callStatsBackend.sendFabricEvent(
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

/* eslint-disable no-invalid-this */
/**
 * Notifies CallStats for connection setup errors
 */
CallStats.prototype.sendTerminateEvent = tryCatch(function() {
    if (!CallStats.initialized) {
        return;
    }
    callStatsBackend.sendFabricEvent(this.peerconnection,
        callStatsBackend.fabricEvent.fabricTerminated, this.confID);
});

/* eslint-enable no-invalid-this */

/**
 * Notifies CallStats for ice connection failed
 * @param {RTCPeerConnection} pc connection on which failure occured.
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.prototype.sendIceConnectionFailedEvent = tryCatch((pc, cs) => {
    CallStats._reportError.call(
        cs, wrtcFuncNames.iceConnectionFailure, null, pc);
});

/* eslint-disable no-invalid-this */
/**
 * Sends the given feedback through CallStats.
 *
 * @param overallFeedback an integer between 1 and 5 indicating the
 * user feedback
 * @param detailedFeedback detailed feedback from the user. Not yet used
 */
CallStats.prototype.sendFeedback = tryCatch(
function(overallFeedback, detailedFeedback) {
    if (!CallStats.feedbackEnabled) {
        return;
    }

    callStatsBackend.sendUserFeedback(this.confID, {
        userID: this.userID,
        overall: overallFeedback,
        comment: detailedFeedback
    });
});

/* eslint-enable no-invalid-this */

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
        callStatsBackend.reportError(pc, this.confID, type, error);
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
CallStats.sendGetUserMediaFailed = tryCatch((e, cs) => {
    CallStats._reportError.call(cs, wrtcFuncNames.getUserMedia, e, null);
});

/**
 * Notifies CallStats that peer connection failed to create offer.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendCreateOfferFailed = tryCatch((e, pc, cs) => {
    CallStats._reportError.call(cs, wrtcFuncNames.createOffer, e, pc);
});

/**
 * Notifies CallStats that peer connection failed to create answer.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendCreateAnswerFailed = tryCatch((e, pc, cs) => {
    CallStats._reportError.call(cs, wrtcFuncNames.createAnswer, e, pc);
});

/**
 * Notifies CallStats that peer connection failed to set local description.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendSetLocalDescFailed = tryCatch((e, pc, cs) => {
    CallStats._reportError.call(cs, wrtcFuncNames.setLocalDescription, e, pc);
});

/**
 * Notifies CallStats that peer connection failed to set remote description.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendSetRemoteDescFailed = tryCatch((e, pc, cs) => {
    CallStats._reportError.call(cs, wrtcFuncNames.setRemoteDescription, e, pc);
});

/**
 * Notifies CallStats that peer connection failed to add ICE candidate.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendAddIceCandidateFailed = tryCatch((e, pc, cs) => {
    CallStats._reportError.call(cs, wrtcFuncNames.addIceCandidate, e, pc);
});

/**
 * Notifies CallStats that there is a log we want to report.
 *
 * @param {Error} e error to send or {String} message
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendApplicationLog = tryCatch((e, cs) => {
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

/* eslint-disable no-invalid-this */

/**
 *
 * @param err
 * @param msg
 */
function initCallback(err, msg) {
    logger.log(`CallStats Status: err=${err} msg=${msg}`);

    CallStats.initializeInProgress = false;

    // there is no lib, nothing to report to
    if (err !== 'success') {
        CallStats.initializeFailed = true;

        return;
    }

    const ret = callStatsBackend.addNewFabric(this.peerconnection,
        DEFAULT_REMOTE_USER,
        callStatsBackend.fabricUsage.multiplex,
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

                callStatsBackend.sendFabricEvent(
                    this.peerconnection,
                    eventData.event,
                    this.confID,
                    eventData.eventData);
            } else if (report.type === reportType.MST_WITH_USERID) {
                const data = report.data;

                callStatsBackend.associateMstWithUserID(
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

/* eslint-enable no-invalid-this */

module.exports = CallStats;
