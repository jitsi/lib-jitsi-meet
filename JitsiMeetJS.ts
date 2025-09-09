import Logger from '@jitsi/logger';
import { merge } from 'lodash-es';

import JitsiConference from './JitsiConference';
import * as JitsiConferenceErrors from './JitsiConferenceErrors';
import { JitsiConferenceEvents } from './JitsiConferenceEvents';
import JitsiConnection from './JitsiConnection';
import * as JitsiConnectionErrors from './JitsiConnectionErrors';
import { JitsiConnectionEvents } from './JitsiConnectionEvents';
import JitsiMediaDevices from './JitsiMediaDevices';
import { JitsiMediaDevicesEvents } from './JitsiMediaDevicesEvents';
import JitsiTrackError from './JitsiTrackError';
import * as JitsiTrackErrors from './JitsiTrackErrors';
import { JitsiTrackEvents } from './JitsiTrackEvents';
import * as JitsiTranscriptionStatus from './JitsiTranscriptionStatus';
import JitsiLocalTrack from './modules/RTC/JitsiLocalTrack';
import RTC from './modules/RTC/RTC';
import RTCStats from './modules/RTCStats/RTCStats';
import { RTCStatsEvents } from './modules/RTCStats/RTCStatsEvents';
import browser from './modules/browser';
import NetworkInfo from './modules/connectivity/NetworkInfo';
import { TrackStreamingStatus } from './modules/connectivity/TrackStreamingStatus';
import getActiveAudioDevice from './modules/detection/ActiveDeviceDetector';
import { DetectionEvents } from './modules/detection/DetectionEvents';
import TrackVADEmitter from './modules/detection/TrackVADEmitter';
import ProxyConnectionService
    from './modules/proxyconnection/ProxyConnectionService';
import recordingConstants from './modules/recording/recordingConstants';
import Settings from './modules/settings/Settings';
import LocalStatsCollector from './modules/statistics/LocalStatsCollector';
import runPreCallTest, { IIceServer, IPreCallResult } from './modules/statistics/PreCallTest';
import Statistics from './modules/statistics/statistics';
import Deferred from './modules/util/Deferred';
import ScriptUtil from './modules/util/ScriptUtil';
import * as VideoSIPGWConstants from './modules/videosipgw/VideoSIPGWConstants';
import AudioMixer from './modules/webaudio/AudioMixer';
import { MediaType } from './service/RTC/MediaType';
import { VideoType } from './service/RTC/VideoType';
import { ConnectionQualityEvents } from './service/connectivity/ConnectionQualityEvents';
import { E2ePingEvents } from './service/e2eping/E2ePingEvents';
import { createGetUserMediaEvent } from './service/statistics/AnalyticsEvents';
import { COMMIT_HASH } from './version';

const logger = Logger.getLogger('core:JitsiMeetJS');

// Settin the default log levels to info early so that we avoid overriding a log level set externally.
Logger.setLogLevel(Logger.levels.INFO);

/**
 * Indicates whether GUM has been executed or not.
 */
let hasGUMExecuted = false;

/**
 * Extracts from an 'options' objects with a specific format (TODO what IS the
 * format?) the attributes which are to be logged in analytics events.
 *
 * @param options gum options (???)
 * @returns {*} the attributes to attach to analytics events.
 */
function getAnalyticsAttributesFromOptions(options) {
    const attributes: any = {};

    /* eslint-disable */

    attributes.audio_requested = options.devices.includes(MediaType.AUDIO);
    attributes.video_requested = options.devices.includes(MediaType.VIDEO);
    attributes.screen_sharing_requested = options.devices.includes(VideoType.DESKTOP);

    if (attributes.video_requested) {
        attributes.resolution = options.resolution;
    }

    /* eslint-enable */

    return attributes;
}

interface ICreateLocalTrackOptions {
    cameraDeviceId?: string;
    devices?: any[];
    fireSlowPromiseEvent?: boolean;
    micDeviceId?: string;
    resolution?: string;
}

type desktopSharingSourceType = 'screen' | 'window';

interface IJitsiMeetJSOptions {
    analytics?: {
        rtcstatsLogFlushSizeBytes?: number;
        rtcstatsStoreLogs?: boolean;
    };
    desktopSharingSources?: Array<desktopSharingSourceType>;
    enableAnalyticsLogging?: boolean;
    enableWindowOnErrorHandler?: boolean;
    externalStorage?: Storage;
    flags?: {
        runInLiteMode?: boolean;
        ssrcRewritingEnabled?: boolean;
    };
}

interface ICreateLocalTrackFromMediaStreamOptions {
    mediaType: MediaType;
    sourceType: string;
    stream: MediaStream;
    track: any;
    videoType?: VideoType;
}

export interface IJoinConferenceOptions {
    conferenceOptions?: any;
    connectionOptions?: any;
    jaas?: {
        release?: boolean;
        useStaging?: boolean;
    };
    tracks?: JitsiLocalTrack[];
}

const mediaDevices = new JitsiMediaDevices();

/**
 * The public API of the Jitsi Meet library (a.k.a. `JitsiMeetJS`).
 */
const JitsiMeetJS = {
    JitsiConnection,

    /**
     * `ProxyConnectionService` is used to connect a remote peer to a local Jitsi participant without going
     * through a Jitsi conference. It is currently used for room integration development, specifically wireless
     * screensharing. Its API is experimental and will likely change; usage of it is advised against.
     */
    ProxyConnectionService,

    /**
     * Registers new global logger transport to the library logging framework.
     *
     * @param globalTransport
     * @see Logger.addGlobalTransport
     */
    addGlobalLogTransport(globalTransport) {
        Logger.addGlobalTransport(globalTransport);
    },

    /**
     * Analytics configuration.
     */
    analytics: Statistics.analytics as unknown,

    /**
     * Constants used throughout the library.
     */
    constants: {
        recording: recordingConstants,
        sipVideoGW: VideoSIPGWConstants,
        trackStreamingStatus: TrackStreamingStatus,
        transcriptionStatus: JitsiTranscriptionStatus,
    },

    /**
     * Create AudioMixer, which is essentially a wrapper over web audio ChannelMergerNode. It essentially allows the
     * user to mix multiple MediaStreams into a single one.
     *
     * @returns {AudioMixer}
     */
    createAudioMixer() {
        return new AudioMixer();
    },

    /**
     * Creates local media tracks.
     *
     * @param options Object with properties / settings specifying the tracks which should be created. should be
     * created or some additional configurations about resolution for example.
     * @param {Array} options.effects optional effects array for the track
     * @param {Array} options.devices the devices that will be requested
     * @param {string} options.resolution resolution constraints
     * @param {string} options.cameraDeviceId
     * @param {string} options.micDeviceId
     *
     * @returns {Promise.<{Array.<JitsiTrack>}, JitsiTrackError>} A promise that returns an array of created
     * JitsiTracks if resolved, or a JitsiTrackError if rejected.
     */
    createLocalTracks(options: ICreateLocalTrackOptions = {}): Promise<JitsiLocalTrack[] | JitsiTrackError> {
        let isFirstGUM = false;
        const startTS = window.performance.now();

        if (!window.connectionTimes) {
            window.connectionTimes = {};
        }

        if (!hasGUMExecuted) {
            hasGUMExecuted = true;
            isFirstGUM = true;
            window.connectionTimes['firstObtainPermissions.start'] = startTS;
        }
        window.connectionTimes['obtainPermissions.start'] = startTS;

        return RTC.obtainAudioAndVideoPermissions(options)
            .then(tracks => {
                const endTS = window.performance.now();

                window.connectionTimes['obtainPermissions.end'] = endTS;

                if (isFirstGUM) {
                    window.connectionTimes['firstObtainPermissions.end'] = endTS;
                }

                Statistics.sendAnalytics(
                    createGetUserMediaEvent(
                        'success',
                        getAnalyticsAttributesFromOptions(options)));

                if (this.isCollectingLocalStats()) {
                    for (let i = 0; i < tracks.length; i++) {
                        const track = tracks[i];

                        if (track.getType() === MediaType.AUDIO) {
                            Statistics.startLocalStats(track,
                                track.setAudioLevel.bind(track));
                        }
                    }
                }

                // set real device ids
                const currentlyAvailableMediaDevices
                    = RTC.getCurrentlyAvailableMediaDevices();

                if (currentlyAvailableMediaDevices) {
                    for (let i = 0; i < tracks.length; i++) {
                        const track = tracks[i];

                        track._setRealDeviceIdFromDeviceList(
                            currentlyAvailableMediaDevices);
                    }
                }

                return tracks;
            })
            .catch(error => {
                if (error.name === JitsiTrackErrors.SCREENSHARING_USER_CANCELED) {
                    Statistics.sendAnalytics(
                        createGetUserMediaEvent(
                            'warning',
                            {
                                reason: 'extension install user canceled'
                            }));
                } else if (error.name === JitsiTrackErrors.NOT_FOUND) {
                    const attributes
                        = getAnalyticsAttributesFromOptions(options);

                    attributes.reason = 'device not found';
                    attributes.devices = error.gum.devices.join('.');
                    Statistics.sendAnalytics(
                        createGetUserMediaEvent('error', attributes));
                } else {
                    const attributes
                        = getAnalyticsAttributesFromOptions(options);

                    attributes.reason = error.name;
                    Statistics.sendAnalytics(
                        createGetUserMediaEvent('error', attributes));
                }

                const endTS = window.performance.now();

                window.connectionTimes['obtainPermissions.end'] = endTS;

                if (isFirstGUM) {
                    window.connectionTimes['firstObtainPermissions.end'] = endTS;
                }

                return Promise.reject(error);
            });
    },

    /**
     * Manually create JitsiLocalTrack's from the provided track info, by exposing the RTC method
     *
     * @param {Array<ICreateLocalTrackFromMediaStreamOptions>} tracksInfo - array of track information
     * @returns {Array<JitsiLocalTrack>} - created local tracks
     */
    createLocalTracksFromMediaStreams(tracksInfo: ICreateLocalTrackFromMediaStreamOptions[]): JitsiLocalTrack[] {
        return RTC.createLocalTracks(tracksInfo.map(trackInfo => {
            const tracks = trackInfo.stream.getTracks()
                .filter(track => track.kind === trackInfo.mediaType);

            if (!tracks || tracks.length === 0) {
                // eslint-disable-next-line @typescript-eslint/only-throw-error
                throw new JitsiTrackError(JitsiTrackErrors.TRACK_NO_STREAM_TRACKS_FOUND, null, null);
            }

            if (tracks.length > 1) {
                // eslint-disable-next-line @typescript-eslint/only-throw-error
                throw new JitsiTrackError(JitsiTrackErrors.TRACK_TOO_MANY_TRACKS_IN_STREAM, null, null);
            }

            trackInfo.track = tracks[0];

            return trackInfo;
        }));
    },

    /**
     * Create a TrackVADEmitter service that connects an audio track to an VAD (voice activity detection) processor in
     * order to obtain VAD scores for individual PCM audio samples.
     *
     * @param {string} localAudioDeviceId - The target local audio device.
     * @param {number} sampleRate - Sample rate at which the emitter will operate. Possible values  256, 512, 1024,
     * 4096, 8192, 16384. Passing other values will default to closes neighbor.
     * I.e. Providing a value of 4096 means that the emitter will process 4096 PCM samples at a time, higher values mean
     * longer calls, lowers values mean more calls but shorter.
     * @param {Object} vadProcessor - VAD Processors that does the actual compute on a PCM sample.The processor needs
     * to implement the following functions:
     * - <tt>getSampleLength()</tt> - Returns the sample size accepted by calculateAudioFrameVAD.
     * - <tt>getRequiredPCMFrequency()</tt> - Returns the PCM frequency at which the processor operates.
     * i.e. (16KHz, 44.1 KHz etc.)
     * - <tt>calculateAudioFrameVAD(pcmSample)</tt> - Process a 32 float pcm sample of getSampleLength size.
     * @returns {Promise<TrackVADEmitter>}
     */
    createTrackVADEmitter(localAudioDeviceId, sampleRate, vadProcessor) {
        return TrackVADEmitter.create(localAudioDeviceId, sampleRate, vadProcessor);
    },

    errorTypes: {
        JitsiTrackError
    },
    errors: {
        conference: JitsiConferenceErrors,
        connection: JitsiConnectionErrors,
        track: JitsiTrackErrors
    },
    events: {
        conference: JitsiConferenceEvents,
        connection: JitsiConnectionEvents,
        connectionQuality: ConnectionQualityEvents,
        detection: DetectionEvents,
        e2eping: E2ePingEvents,
        mediaDevices: JitsiMediaDevicesEvents,
        rtcstats: RTCStatsEvents,
        track: JitsiTrackEvents
    },

    /**
     * Go through all audio devices on the system and return one that is active, i.e. has audio signal.
     *
     * @returns Promise<Object> - Object containing information about the found device.
     */
    getActiveAudioDevice() {
        return getActiveAudioDevice();
    },

    /**
     * Initializes the library.
     *
     * @param options - The options to use for initializing the library.
     * @returns {void}
     */
    init(options: IJitsiMeetJSOptions = {}) {
        // Start capturing and sending logs to the rtcstats server as soon as possible.
        const {
            analytics: {
                rtcstatsStoreLogs,
                rtcstatsLogFlushSizeBytes
            } = {}
        } = options;

        if (rtcstatsStoreLogs) {
            Logger.addGlobalTransport(RTCStats.getDefaultLogCollector(rtcstatsLogFlushSizeBytes));
        }

        // @ts-ignore
        logger.info(`This appears to be ${browser.getName()}, ver: ${browser.getVersion()}`);

        mediaDevices.init();
        Settings.init(options.externalStorage);
        Statistics.init(options);

        // Initialize global window.connectionTimes
        // FIXME do not use 'window'
        if (!window.connectionTimes) {
            window.connectionTimes = {};
        }

        if (options.enableAnalyticsLogging !== true) {
            logger.warn('Analytics disabled, disposing.');
            this.analytics.dispose();
        }

        RTC.init(options);
    },

    /**
     * Checks if local tracks can collect stats and collection is enabled.
     *
     * @returns {boolean} True if local stats are being collected.
     */
    isCollectingLocalStats() {
        return Statistics.audioLevelsEnabled && LocalStatsCollector.isLocalStatsSupported();
    },

    /**
     * Returns whether the desktop sharing is enabled or not.
     *
     * @returns {boolean}
     */
    isDesktopSharingEnabled() {
        return RTC.isDesktopSharingEnabled();
    },

    /**
     * Checks if the current environment supports having multiple audio
     * input devices in use simultaneously.
     *
     * @returns {boolean} True if multiple audio input devices can be used.
     */
    isMultipleAudioInputSupported() {
        return this.mediaDevices.isMultipleAudioInputSupported();
    },

    /**
     * Returns whether the current execution environment supports WebRTC (for
     * use within this library).
     *
     * @returns {boolean} `true` if WebRTC is supported in the current
     * execution environment (for use within this library); `false`,
     * otherwise.
     */
    isWebRtcSupported() {
        return RTC.isWebRtcSupported();
    },

    /**
     * Simple way to create a {JitsiConference}. All options are optional and sane defaults
     * will be chosen for JaaS users.
     *
     * @param roomName - The name of the conference.
     * @param appId - The application id (also known as tenant).
     * @param token - The token (JWT) to use for authentication.
     * @param options - The options to use for joining the conference.
     */
    async joinConference(
            roomName: string,
            appId: string = '',
            token: Nullable<string> = null,
            options: IJoinConferenceOptions = {}): Promise<JitsiConference> {
        const d = new Deferred();
        let connectionOptions = options.connectionOptions ?? {};

        // Provide a solid default config in case of JaaS.
        if (appId.startsWith('vpaas-magic-cookie')) {
            // Initialize RTCStats logging.
            Logger.addGlobalTransport(RTCStats.getDefaultLogCollector());

            const useStage = options.jaas?.useStaging ?? false;
            const jaasDomain = useStage ? 'staging.8x8.vc' : '8x8.vc';
            const opts = {
                analytics: {
                    rtcstatsEnabled: true,
                    rtcstatsEndpoint: `wss://rtcstats-server-${useStage ? 'pilot' : '8x8'}.jitsi.net/`,
                    rtcstatsSendSdp: true,
                },
                conferenceRequestUrl: `https://${jaasDomain}/${appId}/conference-request/v1?room=${roomName}`,
                hosts: {
                    domain: jaasDomain,
                    muc: `conference.${appId}.${jaasDomain}`
                },
                serviceUrl: `wss://${jaasDomain}/${appId}/xmpp-websocket?room=${roomName}`,
                websocketKeepAliveUrl: `https://${jaasDomain}/${appId}/_unlock?room=${roomName}`
            };

            connectionOptions = merge(connectionOptions, opts);
        }

        const conn = new JitsiConnection(appId, token, connectionOptions);

        function cleanupListeners() {
            conn.removeEventListener(
                JitsiConnectionEvents.CONNECTION_ESTABLISHED, onConnectionEstablished);
            conn.removeEventListener(
                JitsiConnectionEvents.CONNECTION_FAILED, onConnectionFailed);
        }

        function onConnectionEstablished() {
            cleanupListeners();

            const conf = conn.initJitsiConference(roomName, options.conferenceOptions ?? {});

            d.resolve(conf);

            // Make sure this runs after the promise was resolved so that local track events can be
            // listened to.
            queueMicrotask(() => {
                for (const track of options.tracks || []) {
                    conf.addTrack(track);
                }

                conf.join();

                // Default to receiving 720p for everyone.
                conf.setReceiverConstraints({
                    defaultConstraints: { maxHeight: 720 },
                    lastN: -1
                });
            });
        }

        function onConnectionFailed(error: string) {
            cleanupListeners();
            d.reject(error);
        }

        conn.addEventListener(
            JitsiConnectionEvents.CONNECTION_ESTABLISHED, onConnectionEstablished);
        conn.addEventListener(
            JitsiConnectionEvents.CONNECTION_FAILED, onConnectionFailed);
        conn.connect({ name: roomName });

        return d as unknown as Promise<JitsiConference>;
    },

    logLevels: Logger.levels,
    mediaDevices,

    /**
     * Removes global logging transport from the library logging framework.
     *
     * @param globalTransport
     * @see Logger.removeGlobalTransport
     */
    removeGlobalLogTransport(globalTransport) {
        Logger.removeGlobalTransport(globalTransport);
    },

    /**
     * Expose rtcstats to the public API.
     */
    rtcstats: {
        /**
         * Checks if the rtcstats trace is available.
         * The trace is the abstraction for the underlying rtcstats websocket connection.
         *
         * @returns {boolean} <tt>true</tt> if the rtcstats trace is available or
         * <tt>false</tt> otherwise.
         */
        isTraceAvailable() {
            return RTCStats.isTraceAvailable();
        },

        /**
         * Events generated by rtcstats, such as PeerConnections state,
         * and websocket connection state.
         *
         * @param {RTCStatsEvents} event - The event name.
         * @param {function} handler - The event handler.
         */
        on(event, handler) {
            RTCStats.events.on(event, handler);
        },

        /**
         * Sends identity data to the rtcstats server. This data is used
         * to identify the specifics of a particular client, it can be any object
         * and will show in the generated rtcstats dump under "identity" entries.
         *
         * @param {Object} identityData - Identity data to send.
         * @returns {void}
         */
        sendIdentityEntry(identityData) {
            RTCStats.sendIdentity(identityData);
        },

        /**
         * Sends a stats entry to rtcstats server.
         * @param {string} statsType - The type of stats to send.
         * @param {Object} data - The stats data to send.
         */
        sendStatsEntry(statsType, data) {
            RTCStats.sendStatsEntry(statsType, null, data);
        }
    },

    /**
     * Run a pre-call test to check the network conditions.
     *
     * @param {IIceServer} iceServers  - The ICE servers to use for the test,
     * @returns {Promise<PreCallResult | any>} - A Promise that resolves with the test results or rejects with an error
     * message.
     */
    runPreCallTest(iceServers: IIceServer[]): Promise<IPreCallResult | any> {
        return runPreCallTest(iceServers);
    },

    /**
    * Sets global options which will be used by all loggers. Changing these
    * works even after other loggers are created.
    *
    * @param options
    * @see Logger.setGlobalOptions
    */
    setGlobalLogOptions(options) {
        Logger.setGlobalOptions(options);
    },

    /**
     * Sets the log level to the <tt>Logger</tt> instance.
     *
     * @param {Logger.levels} level the logging level to be set
     * @see Logger.setLogLevel
     */
    setLogLevel(level) {
        Logger.setLogLevel(level);
    },

    /**
     * Sets the log level to the <tt>Logger</tt> instance with given id.
     *
     * @param {Logger.levels} level the logging level to be set
     * @param {string} id the logger id to which new logging level will be set.
     * Usually it's the name of the JavaScript source file including the path
     * ex. "modules/xmpp/ChatRoom.js"
     */
    setLogLevelById(level, id) {
        Logger.setLogLevelById(level, id);
    },

    /**
     * Informs lib-jitsi-meet about the current network status.
     *
     * @param {object} state - The network info state.
     * @param {boolean} state.isOnline - `true` if the internet connectivity is online or `false`
     * otherwise.
     */
    setNetworkInfo({ isOnline }) {
        NetworkInfo.updateNetworkInfo({ isOnline });
    },

    /**
     * Represents a hub/namespace for utility functionality which may be of
     * interest to lib-jitsi-meet clients.
     */
    util: {
        ScriptUtil,
        browser
    },
    version: COMMIT_HASH
};

export default JitsiMeetJS;
