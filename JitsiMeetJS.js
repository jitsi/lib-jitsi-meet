/* global __filename */

import AuthUtil from './modules/util/AuthUtil';
import * as ConnectionQualityEvents
    from './service/connectivity/ConnectionQualityEvents';
import GlobalOnErrorHandler from './modules/util/GlobalOnErrorHandler';
import * as JitsiConferenceErrors from './JitsiConferenceErrors';
import * as JitsiConferenceEvents from './JitsiConferenceEvents';
import JitsiConnection from './JitsiConnection';
import * as JitsiConnectionErrors from './JitsiConnectionErrors';
import * as JitsiConnectionEvents from './JitsiConnectionEvents';
import JitsiMediaDevices from './JitsiMediaDevices';
import * as JitsiMediaDevicesEvents from './JitsiMediaDevicesEvents';
import JitsiRecorderErrors from './JitsiRecorderErrors';
import JitsiTrackError from './JitsiTrackError';
import * as JitsiTrackErrors from './JitsiTrackErrors';
import * as JitsiTrackEvents from './JitsiTrackEvents';
import * as JitsiTranscriptionStatus from './JitsiTranscriptionStatus';
import LocalStatsCollector from './modules/statistics/LocalStatsCollector';
import Recording from './modules/xmpp/recording';
import Logger from 'jitsi-meet-logger';
import * as MediaType from './service/RTC/MediaType';
import Resolutions from './service/RTC/Resolutions';
import { ParticipantConnectionStatus }
    from './modules/connectivity/ParticipantConnectionStatus';
import RTC from './modules/RTC/RTC';
import RTCBrowserType from './modules/RTC/RTCBrowserType';
import RTCUIHelper from './modules/RTC/RTCUIHelper';
import ScriptUtil from './modules/util/ScriptUtil';
import Settings from './modules/settings/Settings';
import Statistics from './modules/statistics/statistics';
import * as VideoSIPGWConstants from './modules/videosipgw/VideoSIPGWConstants';

const logger = Logger.getLogger(__filename);

// The amount of time to wait until firing
// JitsiMediaDevicesEvents.PERMISSION_PROMPT_IS_SHOWN event
const USER_MEDIA_PERMISSION_PROMPT_TIMEOUT = 1000;

/**
 *
 * @param resolution
 */
function getLowerResolution(resolution) {
    if (!Resolutions[resolution]) {
        return null;
    }
    const order = Resolutions[resolution].order;
    let res = null;
    let resName = null;

    Object.keys(Resolutions).forEach(r => {
        const value = Resolutions[r];

        if (!res || (res.order < value.order && value.order < order)) {
            resName = r;
            res = value;
        }
    });

    return resName;
}

/**
 * Checks the available devices in options and concatenate the data to the
 * name, which will be used as analytics event name. Adds resolution for the
 * devices.
 * @param name name of event
 * @param options gum options
 * @returns {*}
 */
function addDeviceTypeToAnalyticsEvent(name, options) {
    let ret = name;

    if (options.devices.indexOf('audio') !== -1) {
        ret += '.audio';
    }
    if (options.devices.indexOf('desktop') !== -1) {
        ret += '.desktop';
    }
    if (options.devices.indexOf('video') !== -1) {
        // we have video add resolution
        ret += `.video.${options.resolution}`;
    }

    return ret;
}

/**
 * The public API of the Jitsi Meet library (a.k.a. JitsiMeetJS).
 */
export default {

    version: '{#COMMIT_HASH#}',

    JitsiConnection,
    constants: {
        participantConnectionStatus: ParticipantConnectionStatus,
        recordingStatus: Recording.status,
        recordingTypes: Recording.types,
        sipVideoGW: VideoSIPGWConstants,
        transcriptionStatus: JitsiTranscriptionStatus
    },
    events: {
        conference: JitsiConferenceEvents,
        connection: JitsiConnectionEvents,
        track: JitsiTrackEvents,
        mediaDevices: JitsiMediaDevicesEvents,
        connectionQuality: ConnectionQualityEvents
    },
    errors: {
        conference: JitsiConferenceErrors,
        connection: JitsiConnectionErrors,
        recorder: JitsiRecorderErrors,
        track: JitsiTrackErrors
    },
    errorTypes: {
        JitsiTrackError
    },
    logLevels: Logger.levels,
    mediaDevices: JitsiMediaDevices,
    analytics: Statistics.analytics,
    init(options) {
        Statistics.init(options);

        // Initialize global window.connectionTimes
        // FIXME do not use 'window'
        if (!window.connectionTimes) {
            window.connectionTimes = {};
        }

        if (options.enableAnalyticsLogging !== true) {
            this.analytics.dispose();
        }

        if (options.enableWindowOnErrorHandler) {
            GlobalOnErrorHandler.addHandler(
                this.getGlobalOnErrorHandler.bind(this));
        }

        // Log deployment-specific information, if available.
        // Defined outside the application by individual deployments
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

        return RTC.init(options || {});
    },

    /**
     * Returns whether the desktop sharing is enabled or not.
     * @returns {boolean}
     */
    isDesktopSharingEnabled() {
        return RTC.isDesktopSharingEnabled();
    },
    setLogLevel(level) {
        Logger.setLogLevel(level);
    },

    /**
     * Sets the log level to the <tt>Logger</tt> instance with given id.
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
     * @param globalTransport
     * @see Logger.addGlobalTransport
     */
    addGlobalLogTransport(globalTransport) {
        Logger.addGlobalTransport(globalTransport);
    },

    /**
     * Removes global logging transport from the library logging framework.
     * @param globalTransport
     * @see Logger.removeGlobalTransport
     */
    removeGlobalLogTransport(globalTransport) {
        Logger.removeGlobalTransport(globalTransport);
    },

    /**
     * Creates the media tracks and returns them trough the callback.
     * @param options Object with properties / settings specifying the tracks
     * which should be created. should be created or some additional
     * configurations about resolution for example.
     * @param {Array} options.devices the devices that will be requested
     * @param {string} options.resolution resolution constraints
     * @param {bool} options.dontCreateJitsiTrack if <tt>true</tt> objects with
     * the following structure {stream: the Media Stream, type: "audio" or
     * "video", videoType: "camera" or "desktop"} will be returned trough the
     * Promise, otherwise JitsiTrack objects will be returned.
     * @param {string} options.cameraDeviceId
     * @param {string} options.micDeviceId
     * @param {object} options.desktopSharingExtensionExternalInstallation -
     * enables external installation process for desktop sharing extension if
     * the inline installation is not posible. The following properties should
     * be provided:
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
     * @param {boolean} (firePermissionPromptIsShownEvent) - if event
     *      JitsiMediaDevicesEvents.PERMISSION_PROMPT_IS_SHOWN should be fired
     * @returns {Promise.<{Array.<JitsiTrack>}, JitsiConferenceError>}
     *     A promise that returns an array of created JitsiTracks if resolved,
     *     or a JitsiConferenceError if rejected.
     */
    createLocalTracks(options = {}, firePermissionPromptIsShownEvent) {
        let promiseFulfilled = false;

        if (firePermissionPromptIsShownEvent === true) {
            window.setTimeout(() => {
                if (!promiseFulfilled) {
                    JitsiMediaDevices.emitEvent(
                        JitsiMediaDevicesEvents.PERMISSION_PROMPT_IS_SHOWN,
                        RTCBrowserType.getBrowserName());
                }
            }, USER_MEDIA_PERMISSION_PROMPT_TIMEOUT);
        }

        if (!window.connectionTimes) {
            window.connectionTimes = {};
        }
        window.connectionTimes['obtainPermissions.start']
            = window.performance.now();

        return RTC.obtainAudioAndVideoPermissions(options)
            .then(tracks => {
                promiseFulfilled = true;

                window.connectionTimes['obtainPermissions.end']
                    = window.performance.now();

                Statistics.analytics.sendEvent(addDeviceTypeToAnalyticsEvent(
                    'getUserMedia.success', options), { value: options });

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

                return tracks;
            })
            .catch(error => {
                promiseFulfilled = true;

                if (error.name === JitsiTrackErrors.UNSUPPORTED_RESOLUTION) {
                    const oldResolution = options.resolution || '720';
                    const newResolution = getLowerResolution(oldResolution);

                    if (newResolution !== null) {
                        options.resolution = newResolution;

                        logger.debug(
                            'Retry createLocalTracks with resolution',
                            newResolution);

                        Statistics.analytics.sendEvent(
                            `getUserMedia.fail.resolution.${oldResolution}`);

                        return this.createLocalTracks(options);
                    }
                }

                if (JitsiTrackErrors.CHROME_EXTENSION_USER_CANCELED
                        === error.name) {
                    // User cancelled action is not really an error, so only
                    // log it as an event to avoid having conference classified
                    // as partially failed
                    const logObject = {
                        id: 'chrome_extension_user_canceled',
                        message: error.message
                    };

                    Statistics.sendLog(JSON.stringify(logObject));
                    Statistics.analytics.sendEvent(
                        'getUserMedia.userCancel.extensionInstall');
                } else if (JitsiTrackErrors.NOT_FOUND === error.name) {
                    // logs not found devices with just application log to cs
                    const logObject = {
                        id: 'usermedia_missing_device',
                        status: error.gum.devices
                    };

                    Statistics.sendLog(JSON.stringify(logObject));
                    Statistics.analytics.sendEvent(
                        `getUserMedia.deviceNotFound.${
                            error.gum.devices.join('.')}`);
                } else {
                    // Report gUM failed to the stats
                    Statistics.sendGetUserMediaFailed(error);
                    const event
                        = addDeviceTypeToAnalyticsEvent(
                            'getUserMedia.failed',
                            options);

                    Statistics.analytics.sendEvent(
                        `${event}.${error.name}`,
                        { value: options });
                }

                window.connectionTimes['obtainPermissions.end']
                    = window.performance.now();

                return Promise.reject(error);
            });
    },

    /**
     * Checks if its possible to enumerate available cameras/micropones.
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
     * @params {string} [deviceType] - type of device to change. Default is
     *      undefined or 'input', 'output' - for audio output device change.
     * @returns {boolean} true if available, false otherwise.
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

    /* eslint-enable max-params */

    /**
     * Returns current machine id saved from the local storage.
     * @returns {string} the machine id
     */
    getMachineId() {
        return Settings.machineId;
    },

    /**
     * Represents a hub/namespace for utility functionality which may be of
     * interest to lib-jitsi-meet clients.
     */
    util: {
        AuthUtil,
        RTCUIHelper,
        ScriptUtil
    }
};
