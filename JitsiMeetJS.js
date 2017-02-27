var logger = require("jitsi-meet-logger").getLogger(__filename);
var AuthUtil = require("./modules/util/AuthUtil");
var JitsiConnection = require("./JitsiConnection");
var JitsiMediaDevices = require("./JitsiMediaDevices");
import * as JitsiConferenceErrors from "./JitsiConferenceErrors";
import * as JitsiConferenceEvents from "./JitsiConferenceEvents";
import * as JitsiConnectionErrors from "./JitsiConnectionErrors";
import * as JitsiConnectionEvents from "./JitsiConnectionEvents";
import * as JitsiMediaDevicesEvents from "./JitsiMediaDevicesEvents";
import * as ConnectionQualityEvents from "./service/connectivity/ConnectionQualityEvents";
import JitsiTrackError from "./JitsiTrackError";
import * as JitsiTrackErrors from "./JitsiTrackErrors";
import * as JitsiTrackEvents from "./JitsiTrackEvents";
var JitsiRecorderErrors = require("./JitsiRecorderErrors");
var Logger = require("jitsi-meet-logger");
import * as MediaType from "./service/RTC/MediaType";
import RTC from "./modules/RTC/RTC";
var RTCUIHelper = require("./modules/RTC/RTCUIHelper");
var Statistics = require("./modules/statistics/statistics");
var Resolutions = require("./service/RTC/Resolutions");
var ScriptUtil = require("./modules/util/ScriptUtil");
var GlobalOnErrorHandler = require("./modules/util/GlobalOnErrorHandler");
var RTCBrowserType = require("./modules/RTC/RTCBrowserType");
import Settings from "./modules/settings/Settings";

// The amount of time to wait until firing
// JitsiMediaDevicesEvents.PERMISSION_PROMPT_IS_SHOWN event
var USER_MEDIA_PERMISSION_PROMPT_TIMEOUT = 500;

function getLowerResolution(resolution) {
    if(!Resolutions[resolution])
        return null;
    var order = Resolutions[resolution].order;
    var res = null;
    var resName = null;
    for(let i in Resolutions) {
        var tmp = Resolutions[i];
        if (!res || (res.order < tmp.order && tmp.order < order)) {
            resName = i;
            res = tmp;
        }
    }
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
    if (options.devices.indexOf("audio") !== -1) {
        name += ".audio";
    }
    if (options.devices.indexOf("desktop") !== -1) {
        name += ".desktop";
    }
    if (options.devices.indexOf("video") !== -1) {
        // we have video add resolution
        name += ".video." + options.resolution;
    }

    return name;
}

/**
 * Namespace for the interface of Jitsi Meet Library.
 */
var LibJitsiMeet = {

    version: '{#COMMIT_HASH#}',

    JitsiConnection: JitsiConnection,
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
        JitsiTrackError: JitsiTrackError
    },
    logLevels: Logger.levels,
    mediaDevices: JitsiMediaDevices,
    analytics: null,
    init: function (options) {
        let logObject, attr;
        Statistics.init(options);

        this.analytics = Statistics.analytics;
        if(options.enableAnalyticsLogging === true) {
            this.analytics.init(RTCBrowserType.getBrowserName());
        }

        if (options.enableWindowOnErrorHandler) {
            GlobalOnErrorHandler.addHandler(
                this.getGlobalOnErrorHandler.bind(this));
        }

        // Log deployment-specific information, if available.
        if (window.jitsiRegionInfo
            && Object.keys(window.jitsiRegionInfo).length > 0) {
            logObject = {};
            for (attr in window.jitsiRegionInfo) {
                if (window.jitsiRegionInfo.hasOwnProperty(attr)) {
                    logObject[attr] = window.jitsiRegionInfo[attr];
                }
            }

            logObject.id = "deployment_info";
            Statistics.sendLog(JSON.stringify(logObject));
        }

        if(this.version) {
            logObject = {
                id: "component_version",
                component: "lib-jitsi-meet",
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
    isDesktopSharingEnabled: function () {
        return RTC.isDesktopSharingEnabled();
    },
    setLogLevel: function (level) {
        Logger.setLogLevel(level);
    },
    /**
     * Sets the log level to the <tt>Logger</tt> instance with given id.
     * @param {Logger.levels} level the logging level to be set
     * @param {string} id the logger id to which new logging level will be set.
     * Usually it's the name of the JavaScript source file including the path
     * ex. "modules/xmpp/ChatRoom.js"
     */
    setLogLevelById: function (level, id) {
        Logger.setLogLevelById(level, id);
    },
    /**
     * Registers new global logger transport to the library logging framework.
     * @param globalTransport
     * @see Logger.addGlobalTransport
     */
    addGlobalLogTransport: function (globalTransport) {
        Logger.addGlobalTransport(globalTransport);
    },
    /**
     * Removes global logging transport from the library logging framework.
     * @param globalTransport
     * @see Logger.removeGlobalTransport
     */
    removeGlobalLogTransport: function (globalTransport) {
        Logger.removeGlobalTransport(globalTransport);
    },
    /**
     * Creates the media tracks and returns them trough the callback.
     * @param options Object with properties / settings specifying the tracks which should be created.
     * should be created or some additional configurations about resolution for example.
     * @param {Array} options.devices the devices that will be requested
     * @param {string} options.resolution resolution constraints
     * @param {bool} options.dontCreateJitsiTrack if <tt>true</tt> objects with the following structure {stream: the Media Stream,
     * type: "audio" or "video", videoType: "camera" or "desktop"}
     * will be returned trough the Promise, otherwise JitsiTrack objects will be returned.
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
    createLocalTracks: function (options, firePermissionPromptIsShownEvent) {
        var promiseFulfilled = false;

        if (firePermissionPromptIsShownEvent === true) {
            window.setTimeout(function () {
                if (!promiseFulfilled) {
                    JitsiMediaDevices.emitEvent(
                        JitsiMediaDevicesEvents.PERMISSION_PROMPT_IS_SHOWN,
                        RTCBrowserType.getBrowserName());
                }
            }, USER_MEDIA_PERMISSION_PROMPT_TIMEOUT);
        }

        if(!window.connectionTimes)
            window.connectionTimes = {};
        window.connectionTimes["obtainPermissions.start"] =
            window.performance.now();

        return RTC.obtainAudioAndVideoPermissions(options || {})
            .then(function(tracks) {
                promiseFulfilled = true;

                window.connectionTimes["obtainPermissions.end"] =
                    window.performance.now();

                Statistics.analytics.sendEvent(addDeviceTypeToAnalyticsEvent(
                    "getUserMedia.success", options), {value: options});

                if(!RTC.options.disableAudioLevels)
                    for(let i = 0; i < tracks.length; i++) {
                        const track = tracks[i];
                        var mStream = track.getOriginalStream();
                        if(track.getType() === MediaType.AUDIO){
                            Statistics.startLocalStats(mStream,
                                track.setAudioLevel.bind(track));
                            track.addEventListener(
                                JitsiTrackEvents.LOCAL_TRACK_STOPPED,
                                function(){
                                    Statistics.stopLocalStats(mStream);
                                });
                        }
                    }

                // set real device ids
                var currentlyAvailableMediaDevices
                    = RTC.getCurrentlyAvailableMediaDevices();
                if (currentlyAvailableMediaDevices) {
                    for(let i = 0; i < tracks.length; i++) {
                        const track = tracks[i];
                        track._setRealDeviceIdFromDeviceList(
                            currentlyAvailableMediaDevices);
                    }
                }

                return tracks;
            }).catch(function (error) {
                promiseFulfilled = true;

                if(error.name === JitsiTrackErrors.UNSUPPORTED_RESOLUTION) {
                    var oldResolution = options.resolution || '360',
                        newResolution = getLowerResolution(oldResolution);

                    if (newResolution !== null) {
                        options.resolution = newResolution;

                        logger.debug("Retry createLocalTracks with resolution",
                            newResolution);

                        Statistics.analytics.sendEvent(
                            "getUserMedia.fail.resolution." + oldResolution);

                        return LibJitsiMeet.createLocalTracks(options);
                    }
                }

                if (JitsiTrackErrors.CHROME_EXTENSION_USER_CANCELED ===
                        error.name) {
                    // User cancelled action is not really an error, so only
                    // log it as an event to avoid having conference classified
                    // as partially failed
                    const logObject = {
                        id: "chrome_extension_user_canceled",
                        message: error.message
                    };
                    Statistics.sendLog(JSON.stringify(logObject));
                    Statistics.analytics.sendEvent(
                        "getUserMedia.userCancel.extensionInstall");
                } else if (JitsiTrackErrors.NOT_FOUND === error.name) {
                    // logs not found devices with just application log to cs
                    const logObject = {
                        id: "usermedia_missing_device",
                        status: error.gum.devices
                    };
                    Statistics.sendLog(JSON.stringify(logObject));
                    Statistics.analytics.sendEvent(
                        "getUserMedia.deviceNotFound."
                            + error.gum.devices.join('.'));
                } else {
                    // Report gUM failed to the stats
                    Statistics.sendGetUserMediaFailed(error);
                    Statistics.analytics.sendEvent(
                        addDeviceTypeToAnalyticsEvent(
                            "getUserMedia.failed", options) + '.' + error.name,
                        {value: options});
                }

                window.connectionTimes["obtainPermissions.end"] =
                    window.performance.now();

                return Promise.reject(error);
            }.bind(this));
    },
    /**
     * Checks if its possible to enumerate available cameras/micropones.
     * @returns {Promise<boolean>} a Promise which will be resolved only once
     * the WebRTC stack is ready, either with true if the device listing is
     * available available or with false otherwise.
     * @deprecated use JitsiMeetJS.mediaDevices.isDeviceListAvailable instead
     */
    isDeviceListAvailable: function () {
        logger.warn('This method is deprecated, use ' +
            'JitsiMeetJS.mediaDevices.isDeviceListAvailable instead');
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
    isDeviceChangeAvailable: function (deviceType) {
        logger.warn('This method is deprecated, use ' +
            'JitsiMeetJS.mediaDevices.isDeviceChangeAvailable instead');
        return this.mediaDevices.isDeviceChangeAvailable(deviceType);
    },
    /**
     * Executes callback with list of media devices connected.
     * @param {function} callback
     * @deprecated use JitsiMeetJS.mediaDevices.enumerateDevices instead
     */
    enumerateDevices: function (callback) {
        logger.warn('This method is deprecated, use ' +
            'JitsiMeetJS.mediaDevices.enumerateDevices instead');
        this.mediaDevices.enumerateDevices(callback);
    },
    /**
     * @returns function that can be used to be attached to window.onerror and
     * if options.enableWindowOnErrorHandler is enabled returns
     * the function used by the lib.
     * (function(message, source, lineno, colno, error)).
     */
    getGlobalOnErrorHandler: function (message, source, lineno, colno, error) {
        logger.error(
            'UnhandledError: ' + message,
            'Script: ' + source,
            'Line: ' + lineno,
            'Column: ' + colno,
            'StackTrace: ', error);
        Statistics.reportGlobalError(error);
    },

    /**
     * Returns current machine id saved from the local storage.
     * @returns {string} the machine id
     */
    getMachineId: function() {
        return Settings.getMachineId();
    },

    /**
     * Represents a hub/namespace for utility functionality which may be of
     * interest to LibJitsiMeet clients.
     */
    util: {
        ScriptUtil: ScriptUtil,
        RTCUIHelper: RTCUIHelper,
        AuthUtil: AuthUtil
    }
};

module.exports = LibJitsiMeet;
