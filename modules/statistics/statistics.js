import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import { JitsiTrackEvents } from '../../JitsiTrackEvents';
import { FEEDBACK } from '../../service/statistics/AnalyticsEvents';
import * as StatisticsEvents from '../../service/statistics/Events';
import RTCStats from '../RTCStats/RTCStats';
import browser from '../browser';
import EventEmitter from '../util/EventEmitter';
import WatchRTC from '../watchRTC/WatchRTC';

import analytics from './AnalyticsAdapter';
import LocalStats from './LocalStatsCollector';
import { PerformanceObserverStats } from './PerformanceObserverStats';
import RTPStats from './RTPStatsCollector';

const logger = require('@jitsi/logger').getLogger(__filename);

/**
 * Stores all active {@link Statistics} instances.
 * @type {Set<Statistics>}
 */
let _instances;

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

    if (typeof options.longTasksStatsInterval === 'number') {
        Statistics.longTasksStatsInterval = options.longTasksStatsInterval;
    }

    Statistics.disableThirdPartyRequests = options.disableThirdPartyRequests;

    LocalStats.init();
    WatchRTC.init(options);
    RTCStats.init(options);
};

/**
 * The options to configure Statistics.
 * @typedef {Object} StatisticsOptions
 * @property {string} userName - The user name to use
 * @property {string} roomName - The room name we are currently in.
 *
 * @param {JitsiConference} conference - The conference instance from which the statistics were initialized.
 * @param {StatisticsOptions} options - The options to use creating the
 * Statistics.
 */
export default function Statistics(conference, options) {
    /**
     * {@link RTPStats} mapped by {@link TraceablePeerConnection.id} which
     * collect RTP statistics for each peerconnection.
     * @type {Map<string, RTPStats}
     */
    this.rtpStatsMap = new Map();
    this.eventEmitter = new EventEmitter();
    this.conference = conference;
    this.xmpp = conference?.xmpp;
    this.options = options || {};

    Statistics.instances.add(this);

    RTCStats.start(this.conference);

    // WatchRTC is not required to work for react native
    if (!browser.isReactNative()) {
        WatchRTC.start(this.options.roomName, this.options.userName);
    }

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

Statistics.startLocalStats = function(track, callback) {
    if (browser.isIosBrowser()) {
        // On iOS browsers audio is lost if the audio input device is in use by another app
        // https://bugs.webkit.org/show_bug.cgi?id=233473
        // The culprit was using the AudioContext, so now we close the AudioContext during
        // the track being muted, and re-instantiate it afterwards.
        track.addEventListener(
        JitsiTrackEvents.NO_DATA_FROM_SOURCE,

        /**
         * Closes AudioContext on no audio data, and enables it on data received again.
         *
         * @param {boolean} value - Whether we receive audio data or not.
         */
        async value => {
            if (value) {
                for (const localStat of Statistics.localStats) {
                    localStat.stop();
                }

                await LocalStats.disconnectAudioContext();
            } else {
                LocalStats.connectAudioContext();
                for (const localStat of Statistics.localStats) {
                    localStat.start();
                }
            }
        });
    }

    if (!Statistics.audioLevelsEnabled) {
        return;
    }

    track.addEventListener(
        JitsiTrackEvents.LOCAL_TRACK_STOPPED,
        () => {
            Statistics.stopLocalStats(track);
        });

    const stream = track.getOriginalStream();
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

Statistics.prototype.addEncodeTimeStatsListener = function(listener) {
    this.eventEmitter.on(StatisticsEvents.ENCODE_TIME_STATS, listener);
};

Statistics.prototype.removeEncodeTimeStatsListener = function(listener) {
    this.eventEmitter.removeListener(StatisticsEvents.ENCODE_TIME_STATS, listener);
};

Statistics.prototype.addByteSentStatsListener = function(listener) {
    this.eventEmitter.on(StatisticsEvents.BYTE_SENT_STATS, listener);
};

Statistics.prototype.removeByteSentStatsListener = function(listener) {
    this.eventEmitter.removeListener(StatisticsEvents.BYTE_SENT_STATS,
        listener);
};

/**
 * Add a listener that would be notified on a LONG_TASKS_STATS event.
 *
 * @param {Function} listener a function that would be called when notified.
 * @returns {void}
 */
Statistics.prototype.addLongTasksStatsListener = function(listener) {
    this.eventEmitter.on(StatisticsEvents.LONG_TASKS_STATS, listener);
};

/**
 * Creates an instance of {@link PerformanceObserverStats} and starts the
 * observer that records the stats periodically.
 *
 * @returns {void}
 */
Statistics.prototype.attachLongTasksStats = function() {
    if (!browser.supportsPerformanceObserver()) {
        logger.warn('Performance observer for long tasks not supported by browser!');

        return;
    }

    this.performanceObserverStats = new PerformanceObserverStats(
        this.eventEmitter,
        Statistics.longTasksStatsInterval);

    this.conference.on(
        JitsiConferenceEvents.CONFERENCE_JOINED,
        () => this.performanceObserverStats.startObserver());
    this.conference.on(
        JitsiConferenceEvents.CONFERENCE_LEFT,
        () => this.performanceObserverStats.stopObserver());
};

/**
 * Obtains the current value of the LongTasks event statistics.
 *
 * @returns {Object|null} stats object if the observer has been
 * created, null otherwise.
 */
Statistics.prototype.getLongTasksStats = function() {
    return this.performanceObserverStats
        ? this.performanceObserverStats.getLongTasksStats()
        : null;
};

/**
 * Removes the given listener for the LONG_TASKS_STATS event.
 *
 * @param {Function} listener the listener we want to remove.
 * @returns {void}
 */
Statistics.prototype.removeLongTasksStatsListener = function(listener) {
    this.eventEmitter.removeListener(StatisticsEvents.LONG_TASKS_STATS, listener);
};

/**
 * Updates the list of speakers for which the audio levels are to be calculated. This is needed for the jvb pc only.
 *
 * @param {Array<string>} speakerList The list of remote endpoint ids.
 * @returns {void}
 */
Statistics.prototype.setSpeakerList = function(speakerList) {
    for (const rtpStats of Array.from(this.rtpStatsMap.values())) {
        if (!rtpStats.peerconnection.isP2P) {
            rtpStats.setSpeakerList(speakerList);
        }
    }
};

Statistics.prototype.dispose = function() {
    try {
        this.eventEmitter.emit(StatisticsEvents.BEFORE_DISPOSED);

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

Statistics.stopLocalStats = function(track) {
    if (!Statistics.audioLevelsEnabled) {
        return;
    }

    const stream = track.getOriginalStream();

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

/**
 * Sends the given feedback
 *
 * @param overall an integer between 1 and 5 indicating the user's rating.
 * @param comment the comment from the user.
 * @returns {Promise} Resolves immediately.
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

    return Promise.resolve();
};

Statistics.LOCAL_JID = require('../../service/statistics/constants').LOCAL_JID;

/**
 * Sends event to analytics and logs a message to the logger/console.
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
