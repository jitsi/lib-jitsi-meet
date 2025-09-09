import { getLogger } from '@jitsi/logger';

import JitsiConference from '../../JitsiConference';
import { JitsiTrackEvents } from '../../JitsiTrackEvents';
import { AnalyticsEvents } from '../../service/statistics/AnalyticsEvents';
import { StatisticsEvents } from '../../service/statistics/Events';
import { LOCAL_JID } from '../../service/statistics/constants';
import JitsiTrack from '../RTC/JitsiTrack';
import TraceablePeerConnection from '../RTC/TraceablePeerConnection';
import RTCStats from '../RTCStats/RTCStats';
import browser from '../browser';
import EventEmitter from '../util/EventEmitter';
import WatchRTC from '../watchRTC/WatchRTC';
import XMPP from '../xmpp/xmpp';

import analytics from './AnalyticsAdapter';
import LocalStats from './LocalStatsCollector';
import RTPStats from './RTPStatsCollector';

const logger = getLogger('modules/statistics/statistics');

export type IStatisticsOptions = {
    aliasName?: string;
    applicationName?: string;
    callStatsID?: string;
    callStatsSecret?: string;
    confID?: string;
    customScriptUrl?: string;
    roomName?: string;
    userName?: string;
};

/**
 * Statistics class provides various functionality related to collecting and reporting statistics.
 */
export default class Statistics {
    /**
     * Stores all active Statistics instances.
     * @type {Set<Statistics>}
     */
    static _instances: Set<Statistics>;

    /**
     * Static getter for instances property
     * Returns the Set holding all active Statistics instances. Lazily
     * initializes the Set to allow any Set polyfills to be applied.
     * @type {Set<Statistics>}
     */
    static get instances(): Set<Statistics> {
        if (!Statistics._instances) {
            Statistics._instances = new Set();
        }

        return Statistics._instances;
    }

    /**
     * Flag indicating whether audio levels are enabled or not.
     * @static
     * @type {boolean}
     */
    static audioLevelsEnabled: boolean = false;

    /**
     * The interval for audio levels stats collection.
     * @static
     * @type {number}
     */
    static audioLevelsInterval: number = 200;

    /**
     * The interval for peer connection stats collection.
     * @static
     * @type {number}
     */
    static pcStatsInterval: number = 10000;

    /**
     * Flag indicating whether third party requests are disabled.
     * @static
     * @type {boolean}
     */
    static disableThirdPartyRequests: boolean = false;

    /**
     * Analytics adapter for sending events.
     * @static
     * @type {Object}
     */
    static analytics: {
        addPermanentProperties: (properties: Record<string, any>) => void;
        sendEvent: (eventName: string | Record<string, any>, properties?: Record<string, any>) => void;
    } = analytics;

    /**
     * Array holding local statistics collectors.
     * @static
     * @type {Array}
     */
    static localStats: LocalStats[] = [];

    /**
     * Local JID constant.
     * @static
     * @type {string}
     */
    static LOCAL_JID: string = LOCAL_JID;

    /**
     * Init statistic options
     * @static
     * @param {Object} options - The options to initialize statistics with
     */
    static init(options: {
        audioLevelsInterval?: number;
        disableAudioLevels?: boolean;
        disableThirdPartyRequests?: boolean;
        pcStatsInterval?: number;
    }): void {
        Statistics.audioLevelsEnabled = !options.disableAudioLevels;
        if (typeof options.pcStatsInterval === 'number') {
            Statistics.pcStatsInterval = options.pcStatsInterval;
        }
        if (typeof options.audioLevelsInterval === 'number') {
            Statistics.audioLevelsInterval = options.audioLevelsInterval;
        }
        Statistics.disableThirdPartyRequests = options.disableThirdPartyRequests;
        LocalStats.init();
        WatchRTC.init(options);
    }

    /**
     * Starts collecting local statistics for a track.
     * @static
     * @param {JitsiTrack} track - The track to collect statistics for
     * @param {Function} callback - The callback to invoke with audio levels
     */
    static startLocalStats(track: JitsiTrack, callback: (audioLevel: number) => void): void {
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
                async (value: boolean) => {
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
                }
            );
        }
        if (!Statistics.audioLevelsEnabled) {
            return;
        }
        track.addEventListener(
            JitsiTrackEvents.LOCAL_TRACK_STOPPED,
            () => {
                Statistics.stopLocalStats(track);
            }
        );
        const stream = track.getOriginalStream();
        const localStats = new LocalStats(stream, Statistics.audioLevelsInterval, callback);

        this.localStats.push(localStats);
        localStats.start();
    }

    /**
     * Stops collecting local statistics for a track.
     * @static
     * @param {JitsiTrack} track - The track to stop collecting statistics for
     */
    static stopLocalStats(track: JitsiTrack): void {
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
    }

    /**
     * Sends event to analytics and logs a message to the logger/console.
     * @static
     * @param {string | Object} event - The event name, or an object which represents the entire event
     * @param {Object} properties - Properties to attach to the event
     */
    static sendAnalyticsAndLog(event: string | Record<string, any>, properties: Record<string, any> = {}): void {
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
        logger.debug(JSON.stringify(eventToLog));
        // We do this last, because it may modify the object which is passed.
        this.analytics.sendEvent(event, properties);
    }

    /**
     * Sends event to analytics.
     * @static
     * @param {string | Object} eventName - The event name, or an object which represents the entire event
     * @param {Object} properties - Properties to attach to the event
     */
    static sendAnalytics(eventName: string | Record<string, any>, properties: Record<string, any> = {}): void {
        this.analytics.sendEvent(eventName, properties);
    }

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
    rtpStatsMap: Map<string, RTPStats>;
    eventEmitter: EventEmitter;
    conference: JitsiConference;
    xmpp: XMPP;
    options: IStatisticsOptions;

    constructor(conference: JitsiConference, options: IStatisticsOptions) {
        /**
         * {@link RTPStats} mapped by {@link TraceablePeerConnection.id} which
         * collect RTP statistics for each peerconnection.
         * @type {Map<string, RTPStats>}
         */
        this.rtpStatsMap = new Map();
        this.eventEmitter = new EventEmitter();
        this.conference = conference;
        this.xmpp = conference?.xmpp;
        this.options = options || ({} as IStatisticsOptions);
        Statistics.instances.add(this);
        RTCStats.attachToConference(this.conference);
        // WatchRTC is not required to work for react native
        if (!browser.isReactNative()) {
            WatchRTC.start(this.options.roomName, this.options.userName);
        }
    }

    /**
     * Starts collecting RTP stats for given peerconnection.
     * @param {TraceablePeerConnection} peerconnection
     */
    startRemoteStats(peerconnection: TraceablePeerConnection): void {
        this.stopRemoteStats(peerconnection);
        try {
            const rtpStats = new RTPStats(
                peerconnection,
                Statistics.audioLevelsInterval,
                Statistics.pcStatsInterval,
                this.eventEmitter
            );

            rtpStats.start(Statistics.audioLevelsEnabled);
            this.rtpStatsMap.set(String(peerconnection.id), rtpStats);
        } catch (e) {
            logger.error(`Failed to start collecting remote statistics: ${e}`);
        }
    }

    /**
     * Adds a listener for audio level events.
     * @param {Function} listener - The listener to add
     */
    addAudioLevelListener(listener: (...args: any[]) => void): void {
        if (!Statistics.audioLevelsEnabled) {
            return;
        }
        this.eventEmitter.on(StatisticsEvents.AUDIO_LEVEL, listener);
    }

    /**
     * Removes an audio level listener.
     * @param {Function} listener - The listener to remove
     */
    removeAudioLevelListener(listener: (...args: any[]) => void): void {
        if (!Statistics.audioLevelsEnabled) {
            return;
        }
        this.eventEmitter.removeListener(StatisticsEvents.AUDIO_LEVEL, listener);
    }

    /**
     * Adds a listener for before disposed events.
     * @param {Function} listener - The listener to add
     */
    addBeforeDisposedListener(listener: (...args: any[]) => void): void {
        this.eventEmitter.on(StatisticsEvents.BEFORE_DISPOSED, listener);
    }

    /**
     * Removes a before disposed listener.
     * @param {Function} listener - The listener to remove
     */
    removeBeforeDisposedListener(listener: (...args: any[]) => void): void {
        this.eventEmitter.removeListener(
            StatisticsEvents.BEFORE_DISPOSED, listener);
    }

    /**
     * Adds a listener for connection stats events.
     * @param {Function} listener - The listener to add
     */
    addConnectionStatsListener(listener: (...args: any[]) => void): void {
        this.eventEmitter.on(StatisticsEvents.CONNECTION_STATS, listener);
    }

    /**
     * Removes a connection stats listener.
     * @param {Function} listener - The listener to remove
     */
    removeConnectionStatsListener(listener: (...args: any[]) => void): void {
        this.eventEmitter.removeListener(
            StatisticsEvents.CONNECTION_STATS,
            listener);
    }

    /**
     * Adds a listener for encode time stats events.
     * @param {Function} listener - The listener to add
     */
    addEncodeTimeStatsListener(listener: (...args: any[]) => void): void {
        this.eventEmitter.on(StatisticsEvents.ENCODE_TIME_STATS, listener);
    }

    /**
     * Removes an encode time stats listener.
     * @param {Function} listener - The listener to remove
     */
    removeEncodeTimeStatsListener(listener: (...args: any[]) => void): void {
        this.eventEmitter.removeListener(StatisticsEvents.ENCODE_TIME_STATS, listener);
    }

    /**
     * Adds a listener for byte sent stats events.
     * @param {Function} listener - The listener to add
     */
    addByteSentStatsListener(listener: (...args: any[]) => void): void {
        this.eventEmitter.on(StatisticsEvents.BYTE_SENT_STATS, listener);
    }

    /**
     * Removes a byte sent stats listener.
     * @param {Function} listener - The listener to remove
     */
    removeByteSentStatsListener(listener: (...args: any[]) => void): void {
        this.eventEmitter.removeListener(StatisticsEvents.BYTE_SENT_STATS,
            listener);
    }

    /**
     * Updates the list of speakers for which the audio levels are to be calculated. This is needed for the jvb pc only.
     *
     * @param {Array<string>} speakerList The list of remote endpoint ids.
     * @returns {void}
     */
    setSpeakerList(speakerList: string[]): void {
        for (const rtpStats of Array.from(this.rtpStatsMap.values())) {
            if (!rtpStats.peerconnection.isP2P) {
                rtpStats.setSpeakerList(speakerList);
            }
        }
    }

    /**
     * Disposes of this instance, stopping any ongoing stats collection.
     */
    dispose(): void {
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
    }

    /**
     * Stops remote RTP stats for given peerconnection ID.
     * @param {string} tpcId {@link TraceablePeerConnection.id}
     * @private
     */
    _stopRemoteStats(tpcId: string): void {
        const rtpStats = this.rtpStatsMap.get(tpcId);

        if (rtpStats) {
            rtpStats.stop();
            this.rtpStatsMap.delete(tpcId);
        }
    }

    /**
     * Stops collecting RTP stats for given peerconnection
     * @param {TraceablePeerConnection} tpc
     */
    stopRemoteStats(tpc: TraceablePeerConnection): void {
        this._stopRemoteStats(String(tpc.id));
    }

    /**
     * Sends the given feedback
     *
     * @param {number} overall an integer between 1 and 5 indicating the user's rating.
     * @param {string} comment the comment from the user.
     * @returns {Promise} Resolves immediately.
     */
    sendFeedback(overall: number, comment: string): Promise<void> {
        // Statistics.analytics.sendEvent is currently fire and forget, without
        // confirmation of successful send.
        Statistics.analytics.sendEvent(
            AnalyticsEvents.FEEDBACK,
            {
                comment,
                rating: overall
            });

        return Promise.resolve();
    }
}

