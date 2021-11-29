/* global callstats */

import browser from '../browser';
import GlobalOnErrorHandler from '../util/GlobalOnErrorHandler';

const logger = require('jitsi-meet-logger').getLogger(__filename);

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

/**
 * Set of currently existing {@link CallStats} instances.
 * @type {Set<CallStats>}
 */
let _fabrics;

/**
 * An instance of this class is a wrapper for the CallStats API fabric. A fabric
 * reports one peer connection to the CallStats backend and is allocated with
 * {@link callstats.addNewFabric}. It has a bunch of instance methods for
 * reporting various events. A fabric is considered disposed when
 * {@link CallStats.sendTerminateEvent} is executed.
 *
 * Currently only one backend instance can be created ever and it's done using
 * {@link CallStats.initBackend}. At the time of this writing there is no way to
 * explicitly shutdown the backend, but it's supposed to close it's connection
 * automatically, after all fabrics have been terminated.
 */
export default class CallStats {
    /**
     * A callback passed to {@link callstats.addNewFabric}.
     * @param {string} error 'success' means ok
     * @param {string} msg some more details
     * @private
     */
    static _addNewFabricCallback(error, msg) {
        if (CallStats.backend && error !== 'success') {
            logger.error(`Monitoring status: ${error} msg: ${msg}`);
        }
    }

    /**
     * Callback passed to {@link callstats.initialize} (backend initialization)
     * @param {string} error 'success' means ok
     * @param {String} msg
     * @private
     */
    static _initCallback(error, msg) {
        logger.log(`CallStats Status: err=${error} msg=${msg}`);

        // there is no lib, nothing to report to
        if (error !== 'success') {
            return;
        }

        CallStats.backendInitialized = true;

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

        CallStats._emptyReportQueue(defaultInstance);
    }

    /**
     * Empties report queue.
     *
     * @param {CallStats} csInstance - The callstats instance.
     * @private
     */
    static _emptyReportQueue(csInstance) {
        // There is no conference ID nor a PeerConnection available when some of
        // the events are scheduled on the reportsQueue, so those will be
        // reported on the first initialized fabric.
        const defaultConfID = csInstance.confID;
        const defaultPC = csInstance.peerconnection;

        // notify callstats about failures if there were any
        for (const report of CallStats.reportsQueue) {
            if (report.type === reportType.ERROR) {
                const errorData = report.data;

                CallStats._reportError(
                    csInstance,
                    errorData.type,
                    errorData.error,
                    errorData.pc || defaultPC);
            } else if (report.type === reportType.EVENT) {
                // if we have and event to report and we failed to add
                // fabric this event will not be reported anyway, returning
                // an error
                const eventData = report.data;

                CallStats.backend.sendFabricEvent(
                    report.pc || defaultPC,
                    eventData.event,
                    defaultConfID,
                    eventData.eventData);
            } else if (report.type === reportType.MST_WITH_USERID) {
                const data = report.data;

                CallStats.backend.associateMstWithUserID(
                    report.pc || defaultPC,
                    data.callStatsId,
                    defaultConfID,
                    data.ssrc,
                    data.usageLabel,
                    data.containerId
                );
            }
        }
        CallStats.reportsQueue.length = 0;
    }

    /* eslint-disable max-params */
    /**
     * Reports an error to callstats.
     *
     * @param {CallStats} [cs]
     * @param type the type of the error, which will be one of the wrtcFuncNames
     * @param error the error
     * @param pc the peerconnection
     * @private
     */
    static _reportError(cs, type, error, pc) {
        let _error = error;

        if (!_error) {
            logger.warn('No error is passed!');
            _error = new Error('Unknown error');
        }
        if (CallStats.backendInitialized && cs) {
            CallStats.backend.reportError(pc, cs.confID, type, _error);
        } else {
            CallStats.reportsQueue.push({
                type: reportType.ERROR,
                data: {
                    error: _error,
                    pc,
                    type
                }
            });
        }

        // else just ignore it
    }

    /* eslint-enable max-params */

    /**
     * Reports an error to callstats.
     *
     * @param {CallStats} cs
     * @param event the type of the event, which will be one of the fabricEvent
     * @param eventData additional data to pass to event
     * @private
     */
    static _reportEvent(cs, event, eventData) {
        const pc = cs && cs.peerconnection;
        const confID = cs && cs.confID;

        if (CallStats.backendInitialized && cs) {
            CallStats.backend.sendFabricEvent(pc, event, confID, eventData);
        } else {
            CallStats.reportsQueue.push({
                confID,
                pc,
                type: reportType.EVENT,
                data: { event,
                    eventData }
            });
        }
    }

    /**
     * Wraps some of the CallStats API method and logs their calls with
     * arguments on the debug logging level. Also wraps some of the backend
     * methods execution into try catch blocks to not crash the app in case
     * there is a problem with the backend itself.
     * @param {callstats} theBackend
     * @private
     */
    static _traceAndCatchBackendCalls(theBackend) {
        const tryCatchMethods = [
            'associateMstWithUserID',
            'sendFabricEvent',
            'sendUserFeedback'

            // 'reportError', - this one needs special handling - see code below
        ];

        for (const methodName of tryCatchMethods) {
            const originalMethod = theBackend[methodName];

            theBackend[methodName] = function(...theArguments) {
                try {
                    return originalMethod.apply(theBackend, theArguments);
                } catch (e) {
                    GlobalOnErrorHandler.callErrorHandler(e);
                }
            };
        }
        const debugMethods = [
            'associateMstWithUserID',
            'sendFabricEvent',
            'sendUserFeedback'

            // 'reportError', - this one needs special handling - see code below
        ];

        for (const methodName of debugMethods) {
            const originalMethod = theBackend[methodName];

            theBackend[methodName] = function(...theArguments) {
                logger.debug(methodName, theArguments);
                originalMethod.apply(theBackend, theArguments);
            };
        }
        const originalReportError = theBackend.reportError;

        /* eslint-disable max-params */
        theBackend.reportError = function(pc, cs, type, ...args) {
            // Logs from the logger are submitted on the applicationLog event
            // "type". Logging the arguments on the logger will create endless
            // loop, because it will put all the logs to the logger queue again.
            if (type === wrtcFuncNames.applicationLog) {
                // NOTE otherArguments are not logged to the console on purpose
                // to not log the whole log batch
                // FIXME check the current logging level (currently not exposed
                // by the logger implementation)
                // NOTE it is not safe to log whole objects on react-native as
                // those contain too many circular references and may crash
                // the app.
                if (!browser.isReactNative()) {
                    console && console.debug('reportError', pc, cs, type);
                }
            } else {
                logger.debug('reportError', pc, cs, type, ...args);
            }
            try {
                originalReportError.call(theBackend, pc, cs, type, ...args);
            } catch (exception) {
                if (type === wrtcFuncNames.applicationLog) {
                    console && console.error('reportError', exception);
                } else {
                    GlobalOnErrorHandler.callErrorHandler(exception);
                }
            }
        };

        /* eslint-enable max-params */
    }

    /**
     * Returns the Set with the currently existing {@link CallStats} instances.
     * Lazily initializes the Set to allow any Set polyfills to be applied.
     * @type {Set<CallStats>}
     */
    static get fabrics() {
        if (!_fabrics) {
            _fabrics = new Set();
        }

        return _fabrics;
    }

    /**
     * Initializes the CallStats backend. Should be called only if
     * {@link CallStats.isBackendInitialized} returns <tt>false</tt>.
     * @param {object} options
     * @param {String} options.callStatsID CallStats credentials - ID
     * @param {String} options.callStatsSecret CallStats credentials - secret
     * @param {string} options.aliasName the <tt>aliasName</tt> part of
     * the <tt>userID</tt> aka endpoint ID, see CallStats docs for more info.
     * @param {string} options.userName the <tt>userName</tt> part of
     * the <tt>userID</tt> aka display name, see CallStats docs for more info.
     * @param {String} options.configParams the set of parameters
     * to enable/disable certain features in the library. See CallStats docs for more info.
     *
     */
    static initBackend(options) {
        if (CallStats.backend) {
            throw new Error('CallStats backend has been initialized already!');
        }
        try {
            const CallStatsBackend = callstats;

            CallStats.backend = new CallStatsBackend();
            CallStats._traceAndCatchBackendCalls(CallStats.backend);
            CallStats.userID = {
                aliasName: options.aliasName,
                userName: options.userName
            };
            CallStats.callStatsID = options.callStatsID;
            CallStats.callStatsSecret = options.callStatsSecret;

            const configParams = { ...options.configParams };

            if (options.applicationName) {
                configParams.applicationVersion = `${options.applicationName} (${browser.getName()})`;
            }

            if (options.confID) {
                // we first check is there a tenant in the confID
                const match = options.confID.match(/.*\/(.*)\/.*/);

                // if there is no tenant, we will just set '/'
                configParams.siteID = options.siteID || (match && match[1]) || '/';
            }

            // userID is generated or given by the origin server
            CallStats.backend.initialize(
                CallStats.callStatsID,
                CallStats.callStatsSecret,
                CallStats.userID,
                CallStats._initCallback,
                undefined,
                configParams);

            const getWiFiStatsMethod = options.getWiFiStatsMethod;

            if (getWiFiStatsMethod) {
                CallStats.backend.attachWifiStatsHandler(getWiFiStatsMethod);

                getWiFiStatsMethod().then(result => {
                    if (result) {
                        logger.info('Reported wifi addresses:'
                            , JSON.parse(result).addresses);
                    }
                })
                .catch(() => {});// eslint-disable-line no-empty-function
            }

            return true;
        } catch (e) {
            // The callstats.io API failed to initialize (e.g. because its
            // download did not succeed in general or on time). Further attempts
            // to utilize it cannot possibly succeed.
            GlobalOnErrorHandler.callErrorHandler(e);
            CallStats.backend = null;
            logger.error(e);

            return false;
        }
    }

    /**
     * Checks if the CallStats backend has been created. It does not mean that
     * it has been initialized, but only that the API instance has been
     * allocated successfully.
     * @return {boolean} <tt>true</tt> if backend exists or <tt>false</tt>
     * otherwise
     */
    static isBackendInitialized() {
        return Boolean(CallStats.backend);
    }

    /**
     * Notifies CallStats about active device.
     * @param {{deviceList: {String:String}}} devicesData list of devices with
     * their data
     * @param {CallStats} cs callstats instance related to the event
     */
    static sendActiveDeviceListEvent(devicesData, cs) {
        CallStats._reportEvent(cs, fabricEvent.activeDeviceList, devicesData);
    }

    /**
     * Notifies CallStats that there is a log we want to report.
     *
     * @param {Error} e error to send or {String} message
     * @param {CallStats} cs callstats instance related to the error (optional)
     */
    static sendApplicationLog(e, cs) {
        try {
            CallStats._reportError(
                cs,
                wrtcFuncNames.applicationLog,
                e,
                cs && cs.peerconnection);
        } catch (error) {
            // If sendApplicationLog fails it should not be printed to
            // the logger, because it will try to push the logs again
            // (through sendApplicationLog) and an endless loop is created.
            if (console && (typeof console.error === 'function')) {
                // FIXME send analytics event as well
                console.error('sendApplicationLog failed', error);
            }
        }
    }

    /**
     * Sends the given feedback through CallStats.
     *
     * @param {string} conferenceID the conference ID for which the feedback
     * will be reported.
     * @param overall an integer between 1 and 5 indicating the
     * user feedback
     * @param comment detailed feedback from the user.
     */
    static sendFeedback(conferenceID, overall, comment) {
        return new Promise((resolve, reject) => {
            if (CallStats.backend) {
                CallStats.backend.sendUserFeedback(
                    conferenceID,
                    {
                        userID: CallStats.userID,
                        overall,
                        comment
                    },
                    (status, message) => {
                        if (status === 'success') {
                            resolve(message);
                        } else {
                            reject(message);
                        }
                    });
            } else {
                const reason = 'Failed to submit feedback to CallStats - no backend';

                logger.error(reason);
                reject(reason);
            }
        });
    }

    /**
     * Notifies CallStats that getUserMedia failed.
     *
     * @param {Error} e error to send
     * @param {CallStats} cs callstats instance related to the error (optional)
     */
    static sendGetUserMediaFailed(e, cs) {
        CallStats._reportError(cs, wrtcFuncNames.getUserMedia, e, null);
    }

    /**
     * Notifies CallStats for mute events
     * @param mute {boolean} true for muted and false for not muted
     * @param type {String} "audio"/"video"
     * @param {CallStats} cs callstats instance related to the event
     */
    static sendMuteEvent(mute, type, cs) {
        let event;

        if (type === 'video') {
            event = mute ? fabricEvent.videoPause : fabricEvent.videoResume;
        } else {
            event = mute ? fabricEvent.audioMute : fabricEvent.audioUnmute;
        }

        CallStats._reportEvent(cs, event);
    }

    /**
     * Creates new CallStats instance that handles all callstats API calls for
     * given {@link TraceablePeerConnection}. Each instance is meant to handle
     * one CallStats fabric added with 'addFabric' API method for the
     * {@link TraceablePeerConnection} instance passed in the constructor.
     * @param {TraceablePeerConnection} tpc
     * @param {Object} options
     * @param {string} options.confID the conference ID that wil be used to
     * report the session.
     * @param {string} [options.remoteUserID='jitsi'] the remote user ID to
     * which given <tt>tpc</tt> is connected.
     */
    constructor(tpc, options) {
        this.confID = options.confID;
        this.tpc = tpc;
        this.peerconnection = tpc.peerconnection;
        this.remoteUserID = options.remoteUserID || DEFAULT_REMOTE_USER;
        this.hasFabric = false;

        CallStats.fabrics.add(this);

        if (CallStats.backendInitialized) {
            this._addNewFabric();

            // if this is the first fabric let's try to empty the
            // report queue. Reports all events that we recorded between
            // backend initialization and receiving the first fabric
            if (CallStats.fabrics.size === 1) {
                CallStats._emptyReportQueue(this);
            }
        }
    }

    /**
     * Initializes CallStats fabric by calling "addNewFabric" for
     * the peer connection associated with this instance.
     * @return {boolean} true if the call was successful or false otherwise.
     */
    _addNewFabric() {
        logger.info('addNewFabric', this.remoteUserID);
        try {
            const fabricAttributes = {
                remoteEndpointType:
                    this.tpc.isP2P
                        ? CallStats.backend.endpointType.peer
                        : CallStats.backend.endpointType.server
            };
            const ret
                = CallStats.backend.addNewFabric(
                    this.peerconnection,
                    this.remoteUserID,
                    CallStats.backend.fabricUsage.multiplex,
                    this.confID,
                    fabricAttributes,
                    CallStats._addNewFabricCallback);

            this.hasFabric = true;

            const success = ret.status === 'success';

            if (!success) {
                logger.error('callstats fabric not initilized', ret.message);
            }

            return success;

        } catch (error) {
            GlobalOnErrorHandler.callErrorHandler(error);

            return false;
        }
    }

    /* eslint-disable max-params */

    /**
     * Lets CallStats module know where is given SSRC rendered by providing
     * renderer tag ID.
     * If the lib is not initialized yet queue the call for later, when it's
     * ready.
     * @param {number} ssrc the SSRC of the stream
     * @param {boolean} isLocal indicates whether this the stream is local
     * @param {string|null} streamEndpointId if the stream is not local the it
     * needs to contain the stream owner's ID
     * @param {string} usageLabel meaningful usage label of this stream like
     *        'microphone', 'camera' or 'screen'.
     * @param {string} containerId  the id of media 'audio' or 'video' tag which
     *        renders the stream.
     */
    associateStreamWithVideoTag(
            ssrc,
            isLocal,
            streamEndpointId,
            usageLabel,
            containerId) {
        if (!CallStats.backend) {
            return;
        }

        const callStatsId = isLocal ? CallStats.userID : streamEndpointId;

        if (CallStats.backendInitialized) {
            CallStats.backend.associateMstWithUserID(
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
    }

    /* eslint-enable max-params */

    /**
     * Notifies CallStats that we are the new dominant speaker in the
     * conference.
     */
    sendDominantSpeakerEvent() {
        CallStats._reportEvent(this, fabricEvent.dominantSpeaker);
    }

    /**
     * Notifies CallStats that the fabric for the underlying peerconnection was
     * closed and no evens should be reported, after this call.
     */
    sendTerminateEvent() {
        if (CallStats.backendInitialized) {
            CallStats.backend.sendFabricEvent(
                this.peerconnection,
                CallStats.backend.fabricEvent.fabricTerminated,
                this.confID);
        }
        CallStats.fabrics.delete(this);
    }

    /**
     * Notifies CallStats for ice connection failed
     */
    sendIceConnectionFailedEvent() {
        CallStats._reportError(
            this,
            wrtcFuncNames.iceConnectionFailure,
            null,
            this.peerconnection);
    }

    /**
     * Notifies CallStats that peer connection failed to create offer.
     *
     * @param {Error} e error to send
     */
    sendCreateOfferFailed(e) {
        CallStats._reportError(
            this, wrtcFuncNames.createOffer, e, this.peerconnection);
    }

    /**
     * Notifies CallStats that peer connection failed to create answer.
     *
     * @param {Error} e error to send
     */
    sendCreateAnswerFailed(e) {
        CallStats._reportError(
            this, wrtcFuncNames.createAnswer, e, this.peerconnection);
    }

    /**
     * Sends either resume or hold event for the fabric associated with
     * the underlying peerconnection.
     * @param {boolean} isResume true to resume or false to hold
     */
    sendResumeOrHoldEvent(isResume) {
        CallStats._reportEvent(
            this,
            isResume ? fabricEvent.fabricResume : fabricEvent.fabricHold);
    }

    /**
     * Notifies CallStats for screen sharing events
     * @param {boolean} start true for starting screen sharing and
     * false for not stopping
     * @param {string|null} ssrc - optional ssrc value, used only when
     * starting screen sharing.
     */
    sendScreenSharingEvent(start, ssrc) {
        let eventData;

        if (ssrc) {
            eventData = { ssrc };
        }

        CallStats._reportEvent(
            this,
            start ? fabricEvent.screenShareStart : fabricEvent.screenShareStop,
            eventData);
    }

    /**
     * Notifies CallStats that peer connection failed to set local description.
     *
     * @param {Error} e error to send
     */
    sendSetLocalDescFailed(e) {
        CallStats._reportError(
            this, wrtcFuncNames.setLocalDescription, e, this.peerconnection);
    }

    /**
     * Notifies CallStats that peer connection failed to set remote description.
     *
     * @param {Error} e error to send
     */
    sendSetRemoteDescFailed(e) {
        CallStats._reportError(
            this, wrtcFuncNames.setRemoteDescription, e, this.peerconnection);
    }

    /**
     * Notifies CallStats that peer connection failed to add ICE candidate.
     *
     * @param {Error} e error to send
     */
    sendAddIceCandidateFailed(e) {
        CallStats._reportError(
            this, wrtcFuncNames.addIceCandidate, e, this.peerconnection);
    }
}

/**
 * The CallStats API backend instance
 * @type {callstats}
 */
CallStats.backend = null;

// some errors/events may happen before CallStats init
// in this case we accumulate them in this array
// and send them to callstats on init
CallStats.reportsQueue = [];

/**
 * Whether the library was successfully initialized(the backend) using its
 * initialize method.
 * @type {boolean}
 */
CallStats.backendInitialized = false;

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
 * {@link backend} is initialized, so it's static for the time being.
 * See CallStats API for more info:
 * https://www.callstats.io/api/#userid
 * @type {object}
 */
CallStats.userID = null;
