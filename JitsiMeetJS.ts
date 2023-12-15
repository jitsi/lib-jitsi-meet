import Logger from '@jitsi/logger';

import * as JitsiConferenceErrors from './JitsiConferenceErrors';
import * as JitsiConferenceEvents from './JitsiConferenceEvents';
import JitsiConnection from './JitsiConnection';
import * as JitsiConnectionErrors from './JitsiConnectionErrors';
import * as JitsiConnectionEvents from './JitsiConnectionEvents';
import JitsiMediaDevices from './JitsiMediaDevices';
import * as JitsiMediaDevicesEvents from './JitsiMediaDevicesEvents';
import JitsiTrackError from './JitsiTrackError';
import * as JitsiTrackErrors from './JitsiTrackErrors';
import * as JitsiTrackEvents from './JitsiTrackEvents';
import * as JitsiTranscriptionStatus from './JitsiTranscriptionStatus';
import RTC from './modules/RTC/RTC';
import RTCStats from './modules/RTCStats/RTCStats';
import browser from './modules/browser';
import NetworkInfo from './modules/connectivity/NetworkInfo';
import { TrackStreamingStatus } from './modules/connectivity/TrackStreamingStatus';
import getActiveAudioDevice from './modules/detection/ActiveDeviceDetector';
import * as DetectionEvents from './modules/detection/DetectionEvents';
import TrackVADEmitter from './modules/detection/TrackVADEmitter';
import FeatureFlags from './modules/flags/FeatureFlags';
import ProxyConnectionService
    from './modules/proxyconnection/ProxyConnectionService';
import recordingConstants from './modules/recording/recordingConstants';
import Settings from './modules/settings/Settings';
import LocalStatsCollector from './modules/statistics/LocalStatsCollector';
import Statistics from './modules/statistics/statistics';
import ScriptUtil from './modules/util/ScriptUtil';
import * as VideoSIPGWConstants from './modules/videosipgw/VideoSIPGWConstants';
import AudioMixer from './modules/webaudio/AudioMixer';
import { MediaType } from './service/RTC/MediaType';
import * as ConnectionQualityEvents
    from './service/connectivity/ConnectionQualityEvents';
import * as E2ePingEvents from './service/e2eping/E2ePingEvents';
import { createGetUserMediaEvent } from './service/statistics/AnalyticsEvents';
import *  as RTCStatsEvents from './modules/RTCStats/RTCStatsEvents';
import { VideoType } from './service/RTC/VideoType';

const logger = Logger.getLogger(__filename);

/**
 * The amount of time to wait until firing
 * {@link JitsiMediaDevicesEvents.PERMISSION_PROMPT_IS_SHOWN} event.
 */
const USER_MEDIA_SLOW_PROMISE_TIMEOUT = 1000;

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

    attributes['audio_requested'] = options.devices.includes('audio');
    attributes['video_requested'] = options.devices.includes('video');
    attributes['screen_sharing_requested'] = options.devices.includes('desktop');

    if (attributes.video_requested) {
        attributes.resolution = options.resolution;
    }

    return attributes;
}

interface ICreateLocalTrackOptions {
    cameraDeviceId?: string;
    devices?: any[];
    firePermissionPromptIsShownEvent?: boolean;
    fireSlowPromiseEvent?: boolean;
    micDeviceId?: string;
    resolution?: string;
}

interface IJitsiMeetJSOptions {
    enableAnalyticsLogging?: boolean;
    enableWindowOnErrorHandler?: boolean;
    externalStorage?: Storage;
    flags?: {
        runInLiteMode?: boolean;
        ssrcRewritingEnabled?: boolean;
    }
}

interface ICreateLocalTrackFromMediaStreamOptions {
    stream: MediaStream,
    sourceType: string,
    mediaType: MediaType,
    videoType?: VideoType
}

/**
 * The public API of the Jitsi Meet library (a.k.a. {@code JitsiMeetJS}).
 */
export default {

    version: '{#COMMIT_HASH#}',

    JitsiConnection,

    /**
     * {@code ProxyConnectionService} is used to connect a remote peer to a
     * local Jitsi participant without going through a Jitsi conference. It is
     * currently used for room integration development, specifically wireless
     * screensharing. Its API is experimental and will likely change; usage of
     * it is advised against.
     */
    ProxyConnectionService,

    constants: {
        recording: recordingConstants,
        sipVideoGW: VideoSIPGWConstants,
        transcriptionStatus: JitsiTranscriptionStatus,
        trackStreamingStatus: TrackStreamingStatus
    },
    events: {
        conference: JitsiConferenceEvents,
        connection: JitsiConnectionEvents,
        detection: DetectionEvents,
        track: JitsiTrackEvents,
        mediaDevices: JitsiMediaDevicesEvents,
        connectionQuality: ConnectionQualityEvents,
        e2eping: E2ePingEvents,
        rtcstats: RTCStatsEvents
    },
    errors: {
        conference: JitsiConferenceErrors,
        connection: JitsiConnectionErrors,
        track: JitsiTrackErrors
    },
    errorTypes: {
        JitsiTrackError
    },
    logLevels: Logger.levels,
    mediaDevices: JitsiMediaDevices as unknown,
    analytics: Statistics.analytics as unknown,
    init(options: IJitsiMeetJSOptions = {}) {
        // @ts-ignore
        logger.info(`This appears to be ${browser.getName()}, ver: ${browser.getVersion()}`);

        Settings.init(options.externalStorage);
        Statistics.init(options);
        const flags = options.flags || {};

        // Configure the feature flags.
        FeatureFlags.init(flags);

        // Initialize global window.connectionTimes
        // FIXME do not use 'window'
        if (!window.connectionTimes) {
            window.connectionTimes = {};
        }

        if (options.enableAnalyticsLogging !== true) {
            logger.warn('Analytics disabled, disposing.');
            this.analytics.dispose();
        }

        return RTC.init(options);
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
     * Returns whether the current execution environment supports WebRTC (for
     * use within this library).
     *
     * @returns {boolean} {@code true} if WebRTC is supported in the current
     * execution environment (for use within this library); {@code false},
     * otherwise.
     */
    isWebRtcSupported() {
        return RTC.isWebRtcSupported();
    },

    setLogLevel(level) {
        Logger.setLogLevel(level);
    },

    /**
     * Expose rtcstats to the public API.
     */
    rtcstats: {
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
        }
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
     * Registers new global logger transport to the library logging framework.
     *
     * @param globalTransport
     * @see Logger.addGlobalTransport
     */
    addGlobalLogTransport(globalTransport) {
        Logger.addGlobalTransport(globalTransport);
    },

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
     * Creates the media tracks and returns them trough the callback.
     *
     * @param options Object with properties / settings specifying the tracks
     * which should be created. should be created or some additional
     * configurations about resolution for example.
     * @param {Array} options.effects optional effects array for the track
     * @param {boolean} options.firePermissionPromptIsShownEvent - if event
     * JitsiMediaDevicesEvents.PERMISSION_PROMPT_IS_SHOWN should be fired
     * @param {boolean} options.fireSlowPromiseEvent - if event
     * JitsiMediaDevicesEvents.USER_MEDIA_SLOW_PROMISE_TIMEOUT should be fired
     * @param {Array} options.devices the devices that will be requested
     * @param {string} options.resolution resolution constraints
     * @param {string} options.cameraDeviceId
     * @param {string} options.micDeviceId
     * @param {intiger} interval - the interval (in ms) for
     * checking whether the desktop sharing extension is installed or not
     * @param {Function} checkAgain - returns boolean. While checkAgain()==true
     * createLocalTracks will wait and check on every "interval" ms for the
     * extension. If the desktop extension is not install and checkAgain()==true
     * createLocalTracks will finish with rejected Promise.
     * @param {Function} listener - The listener will be called to notify the
     * user of lib-jitsi-meet that createLocalTracks is starting external
     * extension installation process.
     * NOTE: If the inline installation process is not possible and external
     * installation is enabled the listener property will be called to notify
     * the start of external installation process. After that createLocalTracks
     * will start to check for the extension on every interval ms until the
     * plugin is installed or until checkAgain return false. If the extension
     * is found createLocalTracks will try to get the desktop sharing track and
     * will finish the execution. If checkAgain returns false, createLocalTracks
     * will finish the execution with rejected Promise.
     *
     * @deprecated old firePermissionPromptIsShownEvent
     * @returns {Promise.<{Array.<JitsiTrack>}, JitsiConferenceError>} A promise
     * that returns an array of created JitsiTracks if resolved, or a
     * JitsiConferenceError if rejected.
     */
    createLocalTracks(options: ICreateLocalTrackOptions = {}, oldfirePermissionPromptIsShownEvent) {
        let promiseFulfilled = false;

        const { firePermissionPromptIsShownEvent, fireSlowPromiseEvent, ...restOptions } = options;
        const firePermissionPrompt = firePermissionPromptIsShownEvent || oldfirePermissionPromptIsShownEvent;

        if (firePermissionPrompt && !RTC.arePermissionsGrantedForAvailableDevices()) {
            // @ts-ignore
            JitsiMediaDevices.emit(JitsiMediaDevicesEvents.PERMISSION_PROMPT_IS_SHOWN, browser.getName());
        } else if (fireSlowPromiseEvent) {
            window.setTimeout(() => {
                if (!promiseFulfilled) {
                    JitsiMediaDevices.emit(JitsiMediaDevicesEvents.SLOW_GET_USER_MEDIA);
                }
            }, USER_MEDIA_SLOW_PROMISE_TIMEOUT);
        }

        let isFirstGUM = false;
        let startTS = window.performance.now();

        if (!window.connectionTimes) {
            window.connectionTimes = {};
        }

        if (!hasGUMExecuted) {
            hasGUMExecuted = true;
            isFirstGUM = true;
            window.connectionTimes['firstObtainPermissions.start'] = startTS;
        }
        window.connectionTimes['obtainPermissions.start'] = startTS;

        return RTC.obtainAudioAndVideoPermissions(restOptions)
            .then(tracks => {
                promiseFulfilled = true;

                let endTS = window.performance.now();

                window.connectionTimes['obtainPermissions.end'] = endTS;

                if (isFirstGUM) {
                    window.connectionTimes['firstObtainPermissions.end'] = endTS;
                }

                Statistics.sendAnalytics(
                    createGetUserMediaEvent(
                        'success',
                        getAnalyticsAttributesFromOptions(restOptions)));

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
                promiseFulfilled = true;

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

                let endTS = window.performance.now();

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
    createLocalTracksFromMediaStreams(tracksInfo) {
        return RTC.createLocalTracks(tracksInfo.map((trackInfo) => {
            const tracks = trackInfo.stream.getTracks()
                .filter(track => track.kind === trackInfo.mediaType);

            if (!tracks || tracks.length === 0) {
                throw new JitsiTrackError(JitsiTrackErrors.TRACK_NO_STREAM_TRACKS_FOUND, null, null);
            }

            if (tracks.length > 1) {
                throw new JitsiTrackError(JitsiTrackErrors.TRACK_TOO_MANY_TRACKS_IN_STREAM, null, null);
            }

            trackInfo.track = tracks[0];

            return trackInfo;
        }));
    },

    /**
     * Create a TrackVADEmitter service that connects an audio track to an VAD (voice activity detection) processor in
     * order to obtain VAD scores for individual PCM audio samples.
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
     * Go through all audio devices on the system and return one that is active, i.e. has audio signal.
     *
     * @returns Promise<Object> - Object containing information about the found device.
     */
    getActiveAudioDevice() {
        return getActiveAudioDevice();
    },

    /**
     * Checks if its possible to enumerate available cameras/microphones.
     *
     * @returns {Promise<boolean>} a Promise which will be resolved only once
     * the WebRTC stack is ready, either with true if the device listing is
     * available available or with false otherwise.
     * @deprecated use JitsiMeetJS.mediaDevices.isDeviceListAvailable instead
     */
    isDeviceListAvailable() {
        logger.warn('This method is deprecated, use '
            + 'JitsiMeetJS.mediaDevices.isDeviceListAvailable instead');

        return this.mediaDevices.isDeviceListAvailable();
    },

    /**
     * Returns true if changing the input (camera / microphone) or output
     * (audio) device is supported and false if not.
     *
     * @param {string} [deviceType] - type of device to change. Default is
     * {@code undefined} or 'input', 'output' - for audio output device change.
     * @returns {boolean} {@code true} if available; {@code false}, otherwise.
     * @deprecated use JitsiMeetJS.mediaDevices.isDeviceChangeAvailable instead
     */
    isDeviceChangeAvailable(deviceType) {
        logger.warn('This method is deprecated, use '
            + 'JitsiMeetJS.mediaDevices.isDeviceChangeAvailable instead');

        return this.mediaDevices.isDeviceChangeAvailable(deviceType);
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
     * Checks if local tracks can collect stats and collection is enabled.
     *
     * @param {boolean} True if stats are being collected for local tracks.
     */
    isCollectingLocalStats() {
        return Statistics.audioLevelsEnabled && LocalStatsCollector.isLocalStatsSupported();
    },

    /**
     * Executes callback with list of media devices connected.
     *
     * @param {function} callback
     * @deprecated use JitsiMeetJS.mediaDevices.enumerateDevices instead
     */
    enumerateDevices(callback) {
        logger.warn('This method is deprecated, use '
            + 'JitsiMeetJS.mediaDevices.enumerateDevices instead');
        this.mediaDevices.enumerateDevices(callback);
    },

    /**
     * Informs lib-jitsi-meet about the current network status.
     *
     * @param {object} state - The network info state.
     * @param {boolean} state.isOnline - {@code true} if the internet connectivity is online or {@code false}
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
    }
};
