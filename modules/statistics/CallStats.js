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

/**
 * Creates new CallStats instance that handles all callstats API calls for given
 * {@link TraceablePeerConnection}. Each instance is meant to handle one
 * CallStats fabric added with 'addFabric' API method for the
 * {@link TraceablePeerConnection} instance passed in the constructor.
 * @param {TraceablePeerConnection} tpc
 * @param {Object} options
 * @param {string} options.confID the conference ID that wil be used to report
 * the session.
 * @param {string} [options.remoteUserID='jitsi'] the remote user ID to which
 * given <tt>tpc</tt> is connected.
 */
const CallStats = function(tpc, options) {
    if (!callStatsBackend) {
        throw new Error('CallStats backend not intiialized!');
    }

    this.confID = options.confID;
    this.tpc = tpc;
    this.peerconnection = tpc.peerconnection;
    this.remoteUserID = options.remoteUserID || DEFAULT_REMOTE_USER;
    this.hasFabric = false;

    CallStats.fabrics.add(this);

    if (CallStats.initialized) {
        this._addNewFabric();
    }
};

// some errors/events may happen before CallStats init
// in this case we accumulate them in this array
// and send them to callstats on init
CallStats.reportsQueue = [];

/**
 * Whether the library was successfully initialized using its initialize method.
 * And whether we had successfully called addNewFabric at least once.
 * @type {boolean}
 */
CallStats.initialized = false;

/**
 * Part of the CallStats credentials - application ID
 * @type {string}
 */
CallStats.callStatsID = null;

/**
 * Part of the CallStats credentials - application secret
 * @type {string}
 */
CallStats.callStatsSecret = null;

/**
 * Local CallStats user ID structure. Can be set only once when
 * {@link callStatsBackend} is initialized, so it's static for the time being.
 * See CallStats API for more info:
 * https://www.callstats.io/api/#userid
 * @type {object}
 */
CallStats.userID = null;

/**
 * Set of currently existing {@link CallStats} instances.
 * @type {Set<CallStats>}
 */
CallStats.fabrics = new Set();

/**
 * Initializes the CallStats backend. Should be called only if
 * {@link CallStats.isBackendInitialized} returns <tt>false</tt>.
 * @param {object} options
 * @param {String} options.callStatsID CallStats credentials - ID
 * @param {String} options.callStatsSecret CallStats credentials - secret
 * @param {string} options.userName the <tt>userName</tt> part of
 * the <tt>userID</tt> aka display name, see CallStats docs for more info.
 * @param {string} options.aliasName the <tt>aliasName</tt> part of
 * the <tt>userID</tt> aka endpoint ID, see CallStats docs for more info.
 *
 */
CallStats.initBackend = function(options) {
    if (callStatsBackend) {
        throw new Error('CallStats backend has been initialized already!');
    }
    try {
        callStatsBackend
            = new callstats($, io, jsSHA); // eslint-disable-line new-cap

        CallStats._traceBackendCalls(callStatsBackend);

        CallStats.userID = {
            aliasName: options.aliasName,
            userName: options.userName
        };
        CallStats.callStatsID = options.callStatsID;
        CallStats.callStatsSecret = options.callStatsSecret;

        // userID is generated or given by the origin server
        callStatsBackend.initialize(
            CallStats.callStatsID,
            CallStats.callStatsSecret,
            CallStats.userID,
            initCallback);

        return true;
    } catch (e) {
        // The callstats.io API failed to initialize (e.g. because its download
        // did not succeed in general or on time). Further attempts to utilize
        // it cannot possibly succeed.
        GlobalOnErrorHandler.callErrorHandler(e);
        callStatsBackend = null;
        logger.error(e);

        return false;
    }
};

/**
 * Checks if the CallStats backend has been created. It does not mean that it
 * has been initialized, but only that the API instance has been allocated
 * successfully.
 * @return {boolean} <tt>true</tt> if backend exists or <tt>false</tt> otherwise
 */
CallStats.isBackendInitialized = function() {
    return Boolean(callStatsBackend);
};

/**
 * Wraps some of the CallStats API method and logs their calls with arguments on
 * the debug logging level.
 * @param {callstats} backend
 * @private
 */
CallStats._traceBackendCalls = function(backend) {
    const originalsendFabricEvent = backend.sendFabricEvent;

    backend.sendFabricEvent = function(...theArguments) {
        logger.debug('sendFabricEvent', theArguments);
        originalsendFabricEvent.apply(backend, theArguments);
    };
    const originalReportError = backend.reportError;

    // eslint-disable-next-line max-params
    backend.reportError = function(pc, cs, type, error, ...otherArguments) {
        const allArguments = [ pc, cs, type, error ].concat(otherArguments);

        // Logs from the logger are submitted on the applicationLog event
        // "type". Logging the arguments on the logger will create endless loop,
        // because it will put all the logs to the logger queue again.
        if (type === wrtcFuncNames.applicationLog) {
            console && console.debug('reportError', allArguments);
        } else {
            logger.debug('reportError', allArguments);
        }
        originalReportError.apply(backend, allArguments);
    };
    const originalSendUserFeedback = backend.sendUserFeedback;

    backend.sendUserFeedback = function(...theArguments) {
        logger.debug('sendUserFeedback', theArguments);
        originalSendUserFeedback.apply(backend, theArguments);
    };
};

/**
 * Initializes CallStats fabric by calling "addNewFabric" for
 * the peer connection associated with this instance.
 * @return {boolean} true if the call was successful or false otherwise.
 */
CallStats.prototype._addNewFabric = function() {
    logger.info('addNewFabric', this.remoteUserID, this);
    const ret
        = callStatsBackend.addNewFabric(
            this.peerconnection,
            this.remoteUserID,
            callStatsBackend.fabricUsage.multiplex,
            this.confID,
            CallStats.pcCallback);

    this.hasFabric = true;

    const success = ret.status === 'success';

    if (!success) {
        logger.error('callstats fabric not initilized', ret.message);
    }

    return success;
};

CallStats.pcCallback = tryCatch((err, msg) => {
    if (callStatsBackend && err !== 'success') {
        logger.error(`Monitoring status: ${err} msg: ${msg}`);
    }
});

/* eslint-disable max-params */

/**
 * Lets CallStats module know where is given SSRC rendered by providing renderer
 * tag ID.
 * If the lib is not initialized yet queue the call for later, when its ready.
 * @param {number} ssrc the SSRC of the stream
 * @param {boolean} isLocal indicates whether this the stream is local
 * @param {string|null} streamEndpointId if the stream is not local the it needs
 * to contain the stream owner's ID
 * @param {string} usageLabel meaningful usage label of this stream like
 *        'microphone', 'camera' or 'screen'.
 * @param {string} containerId  the id of media 'audio' or 'video' tag which
 *        renders the stream.
 */
CallStats.prototype.associateStreamWithVideoTag = function(
        ssrc,
        isLocal,
        streamEndpointId,
        usageLabel,
        containerId) {
    if (!callStatsBackend) {
        return;
    }

    // 'jitsi' is default remote user ID for now
    const callStatsId = isLocal ? CallStats.userID : streamEndpointId;

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
                pc: this.peerconnection,
                data: {
                    callStatsId,
                    containerId,
                    ssrc,
                    usageLabel
                }
            });
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

    CallStats._reportEvent(cs, event);
});

/**
 * Notifies CallStats for screen sharing events
 * @param start {boolean} true for starting screen sharing and
 * false for not stopping
 * @param {CallStats} cs callstats instance related to the event
 */
CallStats.sendScreenSharingEvent = tryCatch((start, cs) => {
    CallStats._reportEvent(
        cs,
        start ? fabricEvent.screenShareStart : fabricEvent.screenShareStop);
});

/**
 * Notifies CallStats that we are the new dominant speaker in the conference.
 * @param {CallStats} cs callstats instance related to the event
 */
CallStats.sendDominantSpeakerEvent = tryCatch(cs => {
    CallStats._reportEvent(cs, fabricEvent.dominantSpeaker);
});

/**
 * Notifies CallStats about active device.
 * @param {{deviceList: {String:String}}} list of devices with their data
 * @param {CallStats} cs callstats instance related to the event
 */
CallStats.sendActiveDeviceListEvent = tryCatch((devicesData, cs) => {
    CallStats._reportEvent(cs, fabricEvent.activeDeviceList, devicesData);
});

/**
 * Reports an error to callstats.
 *
 * @param {CallStats} cs
 * @param event the type of the event, which will be one of the fabricEvent
 * @param eventData additional data to pass to event
 * @private
 */
CallStats._reportEvent = function(cs, event, eventData) {
    const pc = cs && cs.peerconnection;
    const confID = cs && cs.confID;

    if (CallStats.initialized) {
        callStatsBackend.sendFabricEvent(pc, event, confID, eventData);
    } else {
        CallStats.reportsQueue.push({
            confID,
            pc,
            type: reportType.EVENT,
            data: { event,
                eventData }
        });
    }
};

/* eslint-disable no-invalid-this */
/**
 * Notifies CallStats that the fabric for the underlying peerconnection was
 * closed and no evens should be reported, after this call.
 */
CallStats.prototype.sendTerminateEvent = tryCatch(function() {
    if (CallStats.initialized) {
        callStatsBackend.sendFabricEvent(
            this.peerconnection,
            callStatsBackend.fabricEvent.fabricTerminated,
            this.confID);
    }
});

/* eslint-enable no-invalid-this */

/**
 * Notifies CallStats for ice connection failed
 * @param {CallStats} cs callstats instance related to the error
 */
CallStats.prototype.sendIceConnectionFailedEvent = tryCatch(cs => {
    CallStats._reportError(
        cs, wrtcFuncNames.iceConnectionFailure, null, cs.peerconnection);
});

/* eslint-disable no-invalid-this */
/**
 * Sends the given feedback through CallStats.
 *
 * @param {string} conferenceID the conference ID for which the feedback will be
 * reported.
 * @param overallFeedback an integer between 1 and 5 indicating the
 * user feedback
 * @param detailedFeedback detailed feedback from the user. Not yet used
 */
CallStats.sendFeedback = tryCatch(
(conferenceID, overallFeedback, detailedFeedback) => {
    if (callStatsBackend) {
        callStatsBackend.sendUserFeedback(
            conferenceID, {
                userID: CallStats.userID,
                overall: overallFeedback,
                comment: detailedFeedback
            });
    } else {
        logger.error('Failed to submit feedback to CallStats - no backend');
    }
});

/* eslint-enable no-invalid-this */

/* eslint-disable max-params */
/**
 * Reports an error to callstats.
 *
 * @param {CallStats} [cs]
 * @param type the type of the error, which will be one of the wrtcFuncNames
 * @param e the error
 * @param pc the peerconnection
 * @private
 */
CallStats._reportError = function(cs, type, e, pc) {
    let error = e;

    if (!error) {
        logger.warn('No error is passed!');
        error = new Error('Unknown error');
    }
    if (CallStats.initialized) {
        callStatsBackend.reportError(pc, cs && cs.confID, type, error);
    } else {
        CallStats.reportsQueue.push({
            type: reportType.ERROR,
            data: {
                error,
                pc,
                type
            }
        });
    }

    // else just ignore it
};

/* eslint-enable max-params */

/**
 * Notifies CallStats that getUserMedia failed.
 *
 * @param {Error} e error to send
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendGetUserMediaFailed = tryCatch((e, cs) => {
    CallStats._reportError(cs, wrtcFuncNames.getUserMedia, e, null);
});

/**
 * Notifies CallStats that peer connection failed to create offer.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendCreateOfferFailed = tryCatch((e, pc, cs) => {
    CallStats._reportError(cs, wrtcFuncNames.createOffer, e, pc);
});

/**
 * Notifies CallStats that peer connection failed to create answer.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendCreateAnswerFailed = tryCatch((e, pc, cs) => {
    CallStats._reportError(cs, wrtcFuncNames.createAnswer, e, pc);
});

/**
 * Notifies CallStats that peer connection failed to set local description.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendSetLocalDescFailed = tryCatch((e, pc, cs) => {
    CallStats._reportError(cs, wrtcFuncNames.setLocalDescription, e, pc);
});

/**
 * Notifies CallStats that peer connection failed to set remote description.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendSetRemoteDescFailed = tryCatch((e, pc, cs) => {
    CallStats._reportError(cs, wrtcFuncNames.setRemoteDescription, e, pc);
});

/**
 * Notifies CallStats that peer connection failed to add ICE candidate.
 *
 * @param {Error} e error to send
 * @param {RTCPeerConnection} pc connection on which failure occured.
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendAddIceCandidateFailed = tryCatch((e, pc, cs) => {
    CallStats._reportError(cs, wrtcFuncNames.addIceCandidate, e, pc);
});

/**
 * Notifies CallStats that there is a log we want to report.
 *
 * @param {Error} e error to send or {String} message
 * @param {CallStats} cs callstats instance related to the error (optional)
 */
CallStats.sendApplicationLog = (e, cs) => {
    try {
        CallStats._reportError(
            cs,
            wrtcFuncNames.applicationLog,
            e,
            cs && cs.peerconnection);
    } catch (error) {
        // If sendApplicationLog fails it should not be printed to the logger,
        // because it will try to push the logs again
        // (through sendApplicationLog) and an endless loop is created.
        if (console && (typeof console.error === 'function')) {
            // FIXME send analytics event as well
            console.error('sendApplicationLog failed', error);
        }
    }
};

/* eslint-disable no-invalid-this */

/**
 *
 * @param err
 * @param msg
 */
function initCallback(err, msg) {
    logger.log(`CallStats Status: err=${err} msg=${msg}`);

    // there is no lib, nothing to report to
    if (err !== 'success') {

        return;
    }

    // I hate that
    let atLeastOneFabric = false;
    let defaultInstance = null;

    for (const callStatsInstance of CallStats.fabrics.values()) {
        if (!callStatsInstance.hasFabric) {
            logger.debug('addNewFabric - initCallback');
            if (callStatsInstance._addNewFabric()) {
                atLeastOneFabric = true;
                if (!defaultInstance) {
                    defaultInstance = callStatsInstance;
                }
            }
        }
    }

    if (!atLeastOneFabric) {

        return;
    }

    CallStats.initialized = true;

    // There is no conference ID nor a PeerConnection available when some of
    // the events are scheduled on the reportsQueue, so those will be reported
    // on the first initialized fabric.
    const defaultConfID = defaultInstance.confID;
    const defaultPC = defaultInstance.peerconnection;


    // notify callstats about failures if there were any
    if (CallStats.reportsQueue.length) {
        CallStats.reportsQueue.forEach(report => {
            if (report.type === reportType.ERROR) {
                const error = report.data;

                CallStats._reportError(
                    defaultInstance,
                    error.type,
                    error.error,
                    error.pc || defaultPC);
            } else if (report.type === reportType.EVENT) {
                // if we have and event to report and we failed to add fabric
                // this event will not be reported anyway, returning an error
                const eventData = report.data;

                callStatsBackend.sendFabricEvent(
                    report.pc || defaultPC,
                    eventData.event,
                    defaultConfID,
                    eventData.eventData);
            } else if (report.type === reportType.MST_WITH_USERID) {
                const data = report.data;

                callStatsBackend.associateMstWithUserID(
                    report.pc || defaultPC,
                    data.callStatsId,
                    defaultConfID,
                    data.ssrc,
                    data.usageLabel,
                    data.containerId
                );
            }
        });
        CallStats.reportsQueue.length = 0;
    }
}

/* eslint-enable no-invalid-this */

module.exports = CallStats;
