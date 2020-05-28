import EventEmitter from 'events';

import { FEEDBACK } from '../../service/statistics/AnalyticsEvents';
import analytics from './AnalyticsAdapter';
import CallStats from './CallStats';
import LocalStats from './LocalStatsCollector';
import RTPStats from './RTPStatsCollector';

import browser from '../browser';
import ScriptUtil from '../util/ScriptUtil';
import JitsiTrackError from '../../JitsiTrackError';
import * as StatisticsEvents from '../../service/statistics/Events';

const logger = require('jitsi-meet-logger').getLogger(__filename);

/**
 * Stores all active {@link Statistics} instances.
 * @type {Set<Statistics>}
 */
let _instances;

/**
 * True if callstats API is loaded
 */
let isCallstatsLoaded = false;

/**
 * Since callstats.io is a third party, we cannot guarantee the quality of their
 * service. More specifically, their server may take noticeably long time to
 * respond. Consequently, it is in our best interest (in the sense that the
 * intergration of callstats.io is pretty important to us but not enough to
 * allow it to prevent people from joining a conference) to (1) start
 * downloading their API as soon as possible and (2) do the downloading
 * asynchronously.
 *
 * @param {StatisticsOptions} options - Options to use for downloading and
 * initializing callstats backend.
 */
function loadCallStatsAPI(options) {
    if (!isCallstatsLoaded) {
        ScriptUtil.loadScript(
            options.customScriptUrl
                || 'https://api.callstats.io/static/callstats-ws.min.js',
            /* async */ true,
            /* prepend */ true,
            /* relativeURL */ undefined,
            /* loadCallback */ () => _initCallStatsBackend(options)
        );
        isCallstatsLoaded = true;
    }
}

/**
 * Initializes Callstats backend.
 *
 * @param {StatisticsOptions} options - The options to use for initializing
 * callstats backend.
 * @private
 */
function _initCallStatsBackend(options) {
    if (CallStats.isBackendInitialized()) {
        return;
    }

    if (!CallStats.initBackend({
        callStatsID: options.callStatsID,
        callStatsSecret: options.callStatsSecret,
        userName: options.userName,
        aliasName: options.aliasName,
        applicationName: options.applicationName,
        getWiFiStatsMethod: options.getWiFiStatsMethod,
        confID: options.confID,
        siteID: options.siteID
    })) {
        logger.error('CallStats Backend initialization failed bad');
    }
}

/**
 * callstats strips any additional fields from Error except for "name", "stack",
 * "message" and "constraintName". So we need to bundle additional information
 * from JitsiTrackError into error passed to callstats to preserve valuable
 * information about error.
 * @param {JitsiTrackError} error
 */
function formatJitsiTrackErrorForCallStats(error) {
    const err = new Error();

    // Just copy original stack from error
    err.stack = error.stack;

    // Combine name from error's name plus (possibly) name of original GUM error
    err.name = (error.name || 'Unknown error') + (error.gum && error.gum.error
        && error.gum.error.name ? ` - ${error.gum.error.name}` : '');

    // Put all constraints into this field. For constraint failed errors we will
    // still know which exactly constraint failed as it will be a part of
    // message.
    err.constraintName = error.gum && error.gum.constraints
        ? JSON.stringify(error.gum.constraints) : '';

    // Just copy error's message.
    err.message = error.message;

    return err;
}

/**
 * Init statistic options
 * @param options
 */
Statistics.init = function(options) {
    Statistics.audioLevelsEnabled = !options.disableAudioLevels;
    if (typeof options.pcStatsInterval === 'number') {
        Statistics.pcStatsInterval = options.pcStatsInterval;
    }

    if (typeof options.audioLevelsInterval === 'number') {
        Statistics.audioLevelsInterval = options.audioLevelsInterval;
    }

    Statistics.disableThirdPartyRequests = options.disableThirdPartyRequests;
};

/**
 * The options to configure Statistics.
 * @typedef {Object} StatisticsOptions
 * @property {string} applicationName - The application name to pass to
 * callstats.
 * @property {string} aliasName - The alias name to use when initializing callstats.
 * @property {string} userName - The user name to use when initializing callstats.
 * @property {string} confID - The callstats conference ID to use.
 * @property {string} callStatsID - Callstats credentials - the id.
 * @property {string} callStatsSecret - Callstats credentials - the secret.
 * @property {string} customScriptUrl - A custom lib url to use when downloading
 * callstats library.
 * @property {string} roomName - The room name we are currently in.
 */
/**
 *
 * @param xmpp
 * @param {StatisticsOptions} options - The options to use creating the
 * Statistics.
 */
export default function Statistics(xmpp, options) {
    /**
     * {@link RTPStats} mapped by {@link TraceablePeerConnection.id} which
     * collect RTP statistics for each peerconnection.
     * @type {Map<string, RTPStats}
     */
    this.rtpStatsMap = new Map();
    this.eventEmitter = new EventEmitter();
    this.xmpp = xmpp;
    this.options = options || {};

    this.callStatsIntegrationEnabled
        = this.options.callStatsID && this.options.callStatsSecret

            // Even though AppID and AppSecret may be specified, the integration
            // of callstats.io may be disabled because of globally-disallowed
            // requests to any third parties.
            && (Statistics.disableThirdPartyRequests !== true);
    if (this.callStatsIntegrationEnabled) {
        this.callStatsApplicationLogsDisabled
            = this.options.callStatsApplicationLogsDisabled;
        if (browser.isReactNative()) {
            _initCallStatsBackend(this.options);
        } else {
            loadCallStatsAPI(this.options);
        }

        if (!this.options.confID) {
            logger.warn('"confID" is not defined');
        }
    }

    /**
     * Stores {@link CallStats} instances for each
     * {@link TraceablePeerConnection} (one {@link CallStats} instance serves
     * one TPC). The instances are mapped by {@link TraceablePeerConnection.id}.
     * @type {Map<number, CallStats>}
     */
    this.callsStatsInstances = new Map();

    Statistics.instances.add(this);
}
Statistics.audioLevelsEnabled = false;
Statistics.audioLevelsInterval = 200;
Statistics.pcStatsInterval = 10000;
Statistics.disableThirdPartyRequests = false;
Statistics.analytics = analytics;

Object.defineProperty(Statistics, 'instances', {
    /**
     * Returns the Set holding all active {@link Statistics} instances. Lazily
     * initializes the Set to allow any Set polyfills to be applied.
     * @type {Set<Statistics>}
     */
    get() {
        if (!_instances) {
            _instances = new Set();
        }

        return _instances;
    }
});

/**
 * Starts collecting RTP stats for given peerconnection.
 * @param {TraceablePeerConnection} peerconnection
 */
Statistics.prototype.startRemoteStats = function(peerconnection) {
    this.stopRemoteStats(peerconnection);

    try {
        const rtpStats
            = new RTPStats(
                peerconnection,
                Statistics.audioLevelsInterval,
                Statistics.pcStatsInterval,
                this.eventEmitter);

        rtpStats.start(Statistics.audioLevelsEnabled);
        this.rtpStatsMap.set(peerconnection.id, rtpStats);
    } catch (e) {
        logger.error(`Failed to start collecting remote statistics: ${e}`);
    }
};

Statistics.localStats = [];

Statistics.startLocalStats = function(stream, callback) {
    if (!Statistics.audioLevelsEnabled) {
        return;
    }
    const localStats = new LocalStats(stream, Statistics.audioLevelsInterval,
        callback);

    this.localStats.push(localStats);
    localStats.start();
};

Statistics.prototype.addAudioLevelListener = function(listener) {
    if (!Statistics.audioLevelsEnabled) {
        return;
    }
    this.eventEmitter.on(StatisticsEvents.AUDIO_LEVEL, listener);
};

Statistics.prototype.removeAudioLevelListener = function(listener) {
    if (!Statistics.audioLevelsEnabled) {
        return;
    }
    this.eventEmitter.removeListener(StatisticsEvents.AUDIO_LEVEL, listener);
};

Statistics.prototype.addBeforeDisposedListener = function(listener) {
    this.eventEmitter.on(StatisticsEvents.BEFORE_DISPOSED, listener);
};

Statistics.prototype.removeBeforeDisposedListener = function(listener) {
    this.eventEmitter.removeListener(
        StatisticsEvents.BEFORE_DISPOSED, listener);
};

Statistics.prototype.addConnectionStatsListener = function(listener) {
    this.eventEmitter.on(StatisticsEvents.CONNECTION_STATS, listener);
};

Statistics.prototype.removeConnectionStatsListener = function(listener) {
    this.eventEmitter.removeListener(
        StatisticsEvents.CONNECTION_STATS,
        listener);
};

Statistics.prototype.addByteSentStatsListener = function(listener) {
    this.eventEmitter.on(StatisticsEvents.BYTE_SENT_STATS, listener);
};

Statistics.prototype.removeByteSentStatsListener = function(listener) {
    this.eventEmitter.removeListener(StatisticsEvents.BYTE_SENT_STATS,
        listener);
};

Statistics.prototype.dispose = function() {
    try {
        // NOTE Before reading this please see the comment in stopCallStats...
        //
        // Here we prevent from emitting the event twice in case it will be
        // triggered from stopCallStats.
        // If the event is triggered from here it means that the logs will not
        // be submitted anyway (because there is no CallStats instance), but
        // we're doing that for the sake of some kind of consistency.
        if (!this.callsStatsInstances.size) {
            this.eventEmitter.emit(StatisticsEvents.BEFORE_DISPOSED);
        }
        for (const callStats of this.callsStatsInstances.values()) {
            this.stopCallStats(callStats.tpc);
        }
        for (const tpcId of this.rtpStatsMap.keys()) {
            this._stopRemoteStats(tpcId);
        }
        if (this.eventEmitter) {
            this.eventEmitter.removeAllListeners();
        }
    } finally {
        Statistics.instances.delete(this);
    }
};

Statistics.stopLocalStats = function(stream) {
    if (!Statistics.audioLevelsEnabled) {
        return;
    }

    for (let i = 0; i < Statistics.localStats.length; i++) {
        if (Statistics.localStats[i].stream === stream) {
            const localStats = Statistics.localStats.splice(i, 1);

            localStats[0].stop();
            break;
        }
    }
};

/**
 * Stops remote RTP stats for given peerconnection ID.
 * @param {string} tpcId {@link TraceablePeerConnection.id}
 * @private
 */
Statistics.prototype._stopRemoteStats = function(tpcId) {
    const rtpStats = this.rtpStatsMap.get(tpcId);

    if (rtpStats) {
        rtpStats.stop();
        this.rtpStatsMap.delete(tpcId);
    }
};

/**
 * Stops collecting RTP stats for given peerconnection
 * @param {TraceablePeerConnection} tpc
 */
Statistics.prototype.stopRemoteStats = function(tpc) {
    this._stopRemoteStats(tpc.id);
};

// CALSTATS METHODS

/**
 * Initializes the callstats.io API.
 * @param {TraceablePeerConnection} tpc the {@link TraceablePeerConnection}
 * instance for which CalStats will be started.
 * @param {string} remoteUserID
 */
Statistics.prototype.startCallStats = function(tpc, remoteUserID) {
    if (!this.callStatsIntegrationEnabled) {
        return;
    } else if (this.callsStatsInstances.has(tpc.id)) {
        logger.error('CallStats instance for ${tpc} exists already');

        return;
    }

    logger.info(`Starting CallStats for ${tpc}...`);

    const newInstance
        = new CallStats(
            tpc,
            {
                confID: this.options.confID,
                remoteUserID
            });

    this.callsStatsInstances.set(tpc.id, newInstance);
};

/**
 * Obtains the list of *all* {@link CallStats} instances collected from every
 * valid {@link Statistics} instance.
 * @return {Set<CallStats>}
 * @private
 */
Statistics._getAllCallStatsInstances = function() {
    const csInstances = new Set();

    for (const statistics of Statistics.instances) {
        for (const cs of statistics.callsStatsInstances.values()) {
            csInstances.add(cs);
        }
    }

    return csInstances;
};

/**
 * Removes the callstats.io instances.
 */
Statistics.prototype.stopCallStats = function(tpc) {
    const callStatsInstance = this.callsStatsInstances.get(tpc.id);

    if (callStatsInstance) {
        // FIXME the original purpose of adding BEFORE_DISPOSED event was to be
        // able to submit the last log batch from jitsi-meet to CallStats. After
        // recent changes we dispose the CallStats earlier
        // (before Statistics.dispose), so we need to emit this event here to
        // give this last chance for final log batch submission.
        //
        // Eventually there should be a separate module called "log storage"
        // which should emit proper events when it's underlying
        // CallStats instance is going away.
        if (this.callsStatsInstances.size === 1) {
            this.eventEmitter.emit(StatisticsEvents.BEFORE_DISPOSED);
        }
        this.callsStatsInstances.delete(tpc.id);

        // The fabric needs to be terminated when being stopped
        callStatsInstance.sendTerminateEvent();
    }
};

/**
 * Returns true if the callstats integration is enabled, otherwise returns
 * false.
 *
 * @returns true if the callstats integration is enabled, otherwise returns
 * false.
 */
Statistics.prototype.isCallstatsEnabled = function() {
    return this.callStatsIntegrationEnabled;
};

/**
 * Logs either resume or hold event for the given peer connection.
 * @param {TraceablePeerConnection} tpc the connection for which event will be
 * reported
 * @param {boolean} isResume true for resume or false for hold
 */
Statistics.prototype.sendConnectionResumeOrHoldEvent = function(tpc, isResume) {
    const instance = this.callsStatsInstances.get(tpc.id);

    if (instance) {
        instance.sendResumeOrHoldEvent(isResume);
    }
};

/**
 * Notifies CallStats and analytics (if present) for ice connection failed
 * @param {TraceablePeerConnection} tpc connection on which failure occurred.
 */
Statistics.prototype.sendIceConnectionFailedEvent = function(tpc) {
    const instance = this.callsStatsInstances.get(tpc.id);

    if (instance) {
        instance.sendIceConnectionFailedEvent();
    }
};

/**
 * Notifies CallStats for mute events
 * @param {TraceablePeerConnection} tpc connection on which failure occurred.
 * @param {boolean} muted true for muted and false for not muted
 * @param {String} type "audio"/"video"
 */
Statistics.prototype.sendMuteEvent = function(tpc, muted, type) {
    const instance = tpc && this.callsStatsInstances.get(tpc.id);

    CallStats.sendMuteEvent(muted, type, instance);
};

/**
 * Notifies CallStats for screen sharing events
 * @param start {boolean} true for starting screen sharing and
 * false for not stopping
 * @param {string|null} ssrc - optional ssrc value, used only when
 * starting screen sharing.
 */
Statistics.prototype.sendScreenSharingEvent
    = function(start, ssrc) {
        for (const cs of this.callsStatsInstances.values()) {
            cs.sendScreenSharingEvent(start, ssrc);
        }
    };

/**
 * Notifies the statistics module that we are now the dominant speaker of the
 * conference.
 * @param {String} roomJid - The room jid where the speaker event occurred.
 */
Statistics.prototype.sendDominantSpeakerEvent = function(roomJid) {
    for (const cs of this.callsStatsInstances.values()) {
        cs.sendDominantSpeakerEvent();
    }

    // xmpp send dominant speaker event
    this.xmpp.sendDominantSpeakerEvent(roomJid);
};

/**
 * Notifies about active device.
 * @param {{deviceList: {String:String}}} devicesData - list of devices with
 *      their data
 */
Statistics.sendActiveDeviceListEvent = function(devicesData) {
    const globalSet = Statistics._getAllCallStatsInstances();

    if (globalSet.size) {
        for (const cs of globalSet) {
            CallStats.sendActiveDeviceListEvent(devicesData, cs);
        }
    } else {
        CallStats.sendActiveDeviceListEvent(devicesData, null);
    }
};

/* eslint-disable max-params */

/**
 * Lets the underlying statistics module know where is given SSRC rendered by
 * providing renderer tag ID.
 * @param {TraceablePeerConnection} tpc the connection to which the stream
 * belongs to
 * @param {number} ssrc the SSRC of the stream
 * @param {boolean} isLocal
 * @param {string} userId
 * @param {string} usageLabel  meaningful usage label of this stream like
 *        'microphone', 'camera' or 'screen'.
 * @param {string} containerId the id of media 'audio' or 'video' tag which
 *        renders the stream.
 */
Statistics.prototype.associateStreamWithVideoTag = function(
        tpc,
        ssrc,
        isLocal,
        userId,
        usageLabel,
        containerId) {
    const instance = this.callsStatsInstances.get(tpc.id);

    if (instance) {
        instance.associateStreamWithVideoTag(
            ssrc,
            isLocal,
            userId,
            usageLabel,
            containerId);
    }
};

/* eslint-enable max-params */

/**
 * Notifies CallStats that getUserMedia failed.
 *
 * @param {Error} e error to send
 */
Statistics.sendGetUserMediaFailed = function(e) {
    const error
        = e instanceof JitsiTrackError
            ? formatJitsiTrackErrorForCallStats(e) : e;
    const globalSet = Statistics._getAllCallStatsInstances();

    if (globalSet.size) {
        for (const cs of globalSet) {
            CallStats.sendGetUserMediaFailed(error, cs);
        }
    } else {
        CallStats.sendGetUserMediaFailed(error, null);
    }
};

/**
 * Notifies CallStats that peer connection failed to create offer.
 *
 * @param {Error} e error to send
 * @param {TraceablePeerConnection} tpc connection on which failure occurred.
 */
Statistics.prototype.sendCreateOfferFailed = function(e, tpc) {
    const instance = this.callsStatsInstances.get(tpc.id);

    if (instance) {
        instance.sendCreateOfferFailed(e);
    }
};

/**
 * Notifies CallStats that peer connection failed to create answer.
 *
 * @param {Error} e error to send
 * @param {TraceablePeerConnection} tpc connection on which failure occured.
 */
Statistics.prototype.sendCreateAnswerFailed = function(e, tpc) {
    const instance = this.callsStatsInstances.get(tpc.id);

    if (instance) {
        instance.sendCreateAnswerFailed(e);
    }
};

/**
 * Notifies CallStats that peer connection failed to set local description.
 *
 * @param {Error} e error to send
 * @param {TraceablePeerConnection} tpc connection on which failure occurred.
 */
Statistics.prototype.sendSetLocalDescFailed = function(e, tpc) {
    const instance = this.callsStatsInstances.get(tpc.id);

    if (instance) {
        instance.sendSetLocalDescFailed(e);
    }
};

/**
 * Notifies CallStats that peer connection failed to set remote description.
 *
 * @param {Error} e error to send
 * @param {TraceablePeerConnection} tpc connection on which failure occurred.
 */
Statistics.prototype.sendSetRemoteDescFailed = function(e, tpc) {
    const instance = this.callsStatsInstances.get(tpc.id);

    if (instance) {
        instance.sendSetRemoteDescFailed(e);
    }
};

/**
 * Notifies CallStats that peer connection failed to add ICE candidate.
 *
 * @param {Error} e error to send
 * @param {TraceablePeerConnection} tpc connection on which failure occurred.
 */
Statistics.prototype.sendAddIceCandidateFailed = function(e, tpc) {
    const instance = this.callsStatsInstances.get(tpc.id);

    if (instance) {
        instance.sendAddIceCandidateFailed(e);
    }
};

/**
 * Adds to CallStats an application log.
 *
 * @param {String} m a log message to send or an {Error} object to be reported
 */
Statistics.sendLog = function(m) {
    const globalSubSet = new Set();

    // FIXME we don't want to duplicate logs over P2P instance, but
    // here we should go over instances and call this method for each
    // unique conference ID rather than selecting the first one.
    // We don't have such use case though, so leaving as is for now.
    for (const stats of Statistics.instances) {
        if (stats.callStatsApplicationLogsDisabled) {
            return;
        }

        if (stats.callsStatsInstances.size) {
            globalSubSet.add(stats.callsStatsInstances.values().next().value);
        }
    }

    if (globalSubSet.size) {
        for (const csPerStats of globalSubSet) {
            CallStats.sendApplicationLog(m, csPerStats);
        }
    } else {
        CallStats.sendApplicationLog(m, null);
    }
};

/**
 * Sends the given feedback through CallStats.
 *
 * @param overall an integer between 1 and 5 indicating the user's rating.
 * @param comment the comment from the user.
 * @returns {Promise} Resolves when callstats feedback has been submitted
 * successfully.
 */
Statistics.prototype.sendFeedback = function(overall, comment) {
    // Statistics.analytics.sendEvent is currently fire and forget, without
    // confirmation of successful send.
    Statistics.analytics.sendEvent(
        FEEDBACK,
        {
            rating: overall,
            comment
        });

    return CallStats.sendFeedback(this.options.confID, overall, comment);
};

Statistics.LOCAL_JID = require('../../service/statistics/constants').LOCAL_JID;

/**
 * Reports global error to CallStats.
 *
 * @param {Error} error
 */
Statistics.reportGlobalError = function(error) {
    if (error instanceof JitsiTrackError && error.gum) {
        Statistics.sendGetUserMediaFailed(error);
    } else {
        Statistics.sendLog(error);
    }
};

/**
 * Sends event to analytics and logs a message to the logger/console. Console
 * messages might also be logged to callstats automatically.
 *
 * @param {string | Object} event the event name, or an object which
 * represents the entire event.
 * @param {Object} properties properties to attach to the event (if an event
 * name as opposed to an event object is provided).
 */
Statistics.sendAnalyticsAndLog = function(event, properties = {}) {
    if (!event) {
        logger.warn('No event or event name given.');

        return;
    }

    let eventToLog;

    // Also support an API with a single object as an event.
    if (typeof event === 'object') {
        eventToLog = event;
    } else {
        eventToLog = {
            name: event,
            properties
        };
    }

    logger.log(JSON.stringify(eventToLog));

    // We do this last, because it may modify the object which is passed.
    this.analytics.sendEvent(event, properties);
};

/**
 * Sends event to analytics.
 *
 * @param {string | Object} eventName the event name, or an object which
 * represents the entire event.
 * @param {Object} properties properties to attach to the event
 */
Statistics.sendAnalytics = function(eventName, properties = {}) {
    this.analytics.sendEvent(eventName, properties);
};
