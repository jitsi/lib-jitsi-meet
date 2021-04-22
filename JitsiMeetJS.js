/* global __filename */

import Logger from 'jitsi-meet-logger';

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
import browser from './modules/browser';
import NetworkInfo from './modules/connectivity/NetworkInfo';
import { ParticipantConnectionStatus }
    from './modules/connectivity/ParticipantConnectionStatus';
import getActiveAudioDevice from './modules/detection/ActiveDeviceDetector';
import * as DetectionEvents from './modules/detection/DetectionEvents';
import TrackVADEmitter from './modules/detection/TrackVADEmitter';
import ProxyConnectionService
    from './modules/proxyconnection/ProxyConnectionService';
import recordingConstants from './modules/recording/recordingConstants';
import Settings from './modules/settings/Settings';
import LocalStatsCollector from './modules/statistics/LocalStatsCollector';
import precallTest from './modules/statistics/PrecallTest';
import Statistics from './modules/statistics/statistics';
import AuthUtil from './modules/util/AuthUtil';
import GlobalOnErrorHandler from './modules/util/GlobalOnErrorHandler';
import ScriptUtil from './modules/util/ScriptUtil';
import * as VideoSIPGWConstants from './modules/videosipgw/VideoSIPGWConstants';
import AudioMixer from './modules/webaudio/AudioMixer';
import * as MediaType from './service/RTC/MediaType';
import * as ConnectionQualityEvents
    from './service/connectivity/ConnectionQualityEvents';
import * as E2ePingEvents from './service/e2eping/E2ePingEvents';
import { createGetUserMediaEvent } from './service/statistics/AnalyticsEvents';

const logger = Logger.getLogger(__filename);

/**
 * The amount of time to wait until firing
 * {@link JitsiMediaDevicesEvents.PERMISSION_PROMPT_IS_SHOWN} event.
 */
const USER_MEDIA_SLOW_PROMISE_TIMEOUT = 1000;

/**
 * Extracts from an 'options' objects with a specific format (TODO what IS the
 * format?) the attributes which are to be logged in analytics events.
 *
 * @param options gum options (???)
 * @returns {*} the attributes to attach to analytics events.
 */
function getAnalyticsAttributesFromOptions(options) {
    const attributes = {
        'audio_requested':
            options.devices.includes('audio'),
        'video_requested':
            options.devices.includes('video'),
        'screen_sharing_requested':
            options.devices.includes('desktop')
    };

    if (attributes.video_requested) {
        attributes.resolution = options.resolution;
    }

    return attributes;
}

/**
 * Tries to deal with the following problem: {@code JitsiMeetJS} is not only
 * this module, it's also a global (i.e. attached to {@code window}) namespace
 * for all globals of the projects in the Jitsi Meet family. If lib-jitsi-meet
 * is loaded through an HTML {@code script} tag, {@code JitsiMeetJS} will
 * automatically be attached to {@code window} by webpack. Unfortunately,
 * webpack's source code does not check whether the global variable has already
 * been assigned and overwrites it. Which is OK for the module
 * {@code JitsiMeetJS} but is not OK for the namespace {@code JitsiMeetJS}
 * because it may already contain the values of other projects in the Jitsi Meet
 * family. The solution offered here works around webpack by merging all
 * existing values of the namespace {@code JitsiMeetJS} into the module
 * {@code JitsiMeetJS}.
 *
 * @param {Object} module - The module {@code JitsiMeetJS} (which will be
 * exported and may be attached to {@code window} by webpack later on).
 * @private
 * @returns {Object} - A {@code JitsiMeetJS} module which contains all existing
 * value of the namespace {@code JitsiMeetJS} (if any).
 */
function _mergeNamespaceAndModule(module) {
    return (
        typeof window.JitsiMeetJS === 'object'
            ? Object.assign({}, window.JitsiMeetJS, module)
            : module);
}

/**
 * The public API of the Jitsi Meet library (a.k.a. {@code JitsiMeetJS}).
 */
export default _mergeNamespaceAndModule({

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
        participantConnectionStatus: ParticipantConnectionStatus,
        recording: recordingConstants,
        sipVideoGW: VideoSIPGWConstants,
        transcriptionStatus: JitsiTranscriptionStatus
    },
    events: {
        conference: JitsiConferenceEvents,
        connection: JitsiConnectionEvents,
        detection: DetectionEvents,
        track: JitsiTrackEvents,
        mediaDevices: JitsiMediaDevicesEvents,
        connectionQuality: ConnectionQualityEvents,
        e2eping: E2ePingEvents
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
    mediaDevices: JitsiMediaDevices,
    analytics: Statistics.analytics,
    init(options = {}) {
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

        if (options.enableWindowOnErrorHandler) {
            GlobalOnErrorHandler.addHandler(
                this.getGlobalOnErrorHandler.bind(this));
        }

        // Log deployment-specific information, if available. Defined outside
        // the application by individual deployments
        const aprops = options.deploymentInfo;

        if (aprops && Object.keys(aprops).length > 0) {
            const logObject = {};

            for (const attr in aprops) {
                if (aprops.hasOwnProperty(attr)) {
                    logObject[attr] = aprops[attr];
                }
            }

            logObject.id = 'deployment_info';
            Statistics.sendLog(JSON.stringify(logObject));
        }

        if (this.version) {
            const logObject = {
                id: 'component_version',
                component: 'lib-jitsi-meet',
                version: this.version
            };

            Statistics.sendLog(JSON.stringify(logObject));
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
    createLocalTracks(options = {}, oldfirePermissionPromptIsShownEvent) {
        let promiseFulfilled = false;

        const { firePermissionPromptIsShownEvent, fireSlowPromiseEvent, ...restOptions } = options;
        const firePermissionPrompt = firePermissionPromptIsShownEvent || oldfirePermissionPromptIsShownEvent;

        if (firePermissionPrompt && !RTC.arePermissionsGrantedForAvailableDevices()) {
            JitsiMediaDevices.emitEvent(
                JitsiMediaDevicesEvents.PERMISSION_PROMPT_IS_SHOWN,
                browser.getName());
        } else if (fireSlowPromiseEvent) {
            window.setTimeout(() => {
                if (!promiseFulfilled) {
                    JitsiMediaDevices.emitEvent(JitsiMediaDevicesEvents.SLOW_GET_USER_MEDIA);
                }
            }, USER_MEDIA_SLOW_PROMISE_TIMEOUT);
        }

        if (!window.connectionTimes) {
            window.connectionTimes = {};
        }
        window.connectionTimes['obtainPermissions.start']
            = window.performance.now();

        return RTC.obtainAudioAndVideoPermissions(restOptions)
            .then(tracks => {
                promiseFulfilled = true;

                window.connectionTimes['obtainPermissions.end']
                    = window.performance.now();

                Statistics.sendAnalytics(
                    createGetUserMediaEvent(
                        'success',
                        getAnalyticsAttributesFromOptions(restOptions)));

                if (!RTC.options.disableAudioLevels) {
                    for (let i = 0; i < tracks.length; i++) {
                        const track = tracks[i];
                        const mStream = track.getOriginalStream();

                        if (track.getType() === MediaType.AUDIO) {
                            Statistics.startLocalStats(mStream,
                                track.setAudioLevel.bind(track));
                            track.addEventListener(
                                JitsiTrackEvents.LOCAL_TRACK_STOPPED,
                                () => {
                                    Statistics.stopLocalStats(mStream);
                                });
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

                // set the contentHint to "detail" for desktop tracks
                // eslint-disable-next-line prefer-const
                for (const track of tracks) {
                    if (track.type === MediaType.VIDEO
                        && track.videoType === 'desktop') {
                        this.setVideoTrackContentHints(track.track, 'detail');
                    }
                }

                return tracks;
            })
            .catch(error => {
                promiseFulfilled = true;

                if (error.name === JitsiTrackErrors.SCREENSHARING_USER_CANCELED) {
                    // User cancelled action is not really an error, so only
                    // log it as an event to avoid having conference classified
                    // as partially failed
                    const logObject = {
                        id: 'screensharing_user_canceled',
                        message: error.message
                    };

                    Statistics.sendLog(JSON.stringify(logObject));

                    Statistics.sendAnalytics(
                        createGetUserMediaEvent(
                            'warning',
                            {
                                reason: 'extension install user canceled'
                            }));
                } else if (error.name === JitsiTrackErrors.NOT_FOUND) {
                    // logs not found devices with just application log to cs
                    const logObject = {
                        id: 'usermedia_missing_device',
                        status: error.gum.devices
                    };

                    Statistics.sendLog(JSON.stringify(logObject));

                    const attributes
                        = getAnalyticsAttributesFromOptions(options);

                    attributes.reason = 'device not found';
                    attributes.devices = error.gum.devices.join('.');
                    Statistics.sendAnalytics(
                        createGetUserMediaEvent('error', attributes));
                } else {
                    // Report gUM failed to the stats
                    Statistics.sendGetUserMediaFailed(error);

                    const attributes
                        = getAnalyticsAttributesFromOptions(options);

                    attributes.reason = error.name;
                    Statistics.sendAnalytics(
                        createGetUserMediaEvent('error', attributes));
                }

                window.connectionTimes['obtainPermissions.end']
                    = window.performance.now();

                return Promise.reject(error);
            });
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
        return Statistics.audioLevelsEnabled
            && LocalStatsCollector.isLocalStatsSupported();
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

    /* eslint-disable max-params */

    /**
     * @returns function that can be used to be attached to window.onerror and
     * if options.enableWindowOnErrorHandler is enabled returns
     * the function used by the lib.
     * (function(message, source, lineno, colno, error)).
     */
    getGlobalOnErrorHandler(message, source, lineno, colno, error) {
        logger.error(
            `UnhandledError: ${message}`,
            `Script: ${source}`,
            `Line: ${lineno}`,
            `Column: ${colno}`,
            'StackTrace: ', error);
        Statistics.reportGlobalError(error);
    },

    /**
     * Informs lib-jitsi-meet about the current network status.
     *
     * @param {boolean} isOnline - {@code true} if the internet connectivity is online or {@code false}
     * otherwise.
     */
    setNetworkInfo({ isOnline }) {
        NetworkInfo.updateNetworkInfo({ isOnline });
    },

    /**
     * Set the contentHint on the transmitted stream track to indicate
     * charaterstics in the video stream, which informs PeerConnection
     * on how to encode the track (to prefer motion or individual frame detail)
     * @param {MediaStreamTrack} track - the track that is transmitted
     * @param {String} hint - contentHint value that needs to be set on the track
     */
    setVideoTrackContentHints(track, hint) {
        if ('contentHint' in track) {
            track.contentHint = hint;
            if (track.contentHint !== hint) {
                logger.debug('Invalid video track contentHint');
            }
        } else {
            logger.debug('MediaStreamTrack contentHint attribute not supported');
        }
    },

    precallTest,

    /* eslint-enable max-params */

    /**
     * Represents a hub/namespace for utility functionality which may be of
     * interest to lib-jitsi-meet clients.
     */
    util: {
        AuthUtil,
        ScriptUtil,
        browser
    }
});
