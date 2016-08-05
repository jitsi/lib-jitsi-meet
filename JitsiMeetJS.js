var logger = require("jitsi-meet-logger").getLogger(__filename);
var AuthUtil = require("./modules/util/AuthUtil");
var JitsiConnection = require("./JitsiConnection");
var JitsiMediaDevices = require("./JitsiMediaDevices");
var JitsiConferenceEvents = require("./JitsiConferenceEvents");
var JitsiConnectionEvents = require("./JitsiConnectionEvents");
var JitsiMediaDevicesEvents = require('./JitsiMediaDevicesEvents');
var JitsiConnectionErrors = require("./JitsiConnectionErrors");
var JitsiConferenceErrors = require("./JitsiConferenceErrors");
var JitsiTrackEvents = require("./JitsiTrackEvents");
var JitsiTrackErrors = require("./JitsiTrackErrors");
var JitsiTrackError = require("./JitsiTrackError");
var JitsiRecorderErrors = require("./JitsiRecorderErrors");
var Logger = require("jitsi-meet-logger");
var MediaType = require("./service/RTC/MediaType");
var RTC = require("./modules/RTC/RTC");
var RTCUIHelper = require("./modules/RTC/RTCUIHelper");
var Statistics = require("./modules/statistics/statistics");
var AnalyticsAdapter = require("./modules/statistics/AnalyticsAdapter");
var Resolutions = require("./service/RTC/Resolutions");
var ScriptUtil = require("./modules/util/ScriptUtil");
var GlobalOnErrorHandler = require("./modules/util/GlobalOnErrorHandler");
var RTCBrowserType = require("./modules/RTC/RTCBrowserType");

// The amount of time to wait until firing
// JitsiMediaDevicesEvents.PERMISSION_PROMPT_IS_SHOWN event
var USER_MEDIA_PERMISSION_PROMPT_TIMEOUT = 500;

function getLowerResolution(resolution) {
    if(!Resolutions[resolution])
        return null;
    var order = Resolutions[resolution].order;
    var res = null;
    var resName = null;
    for(var i in Resolutions) {
        var tmp = Resolutions[i];
        if (!res || (res.order < tmp.order && tmp.order < order)) {
            resName = i;
            res = tmp;
        }
    }
    return resName;
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
        mediaDevices: JitsiMediaDevicesEvents
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
    analytics: AnalyticsAdapter,
    init: function (options) {
        var logObject, attr;
        Statistics.audioLevelsEnabled = !options.disableAudioLevels;

        if(typeof options.audioLevelsInterval === 'number') {
            Statistics.audioLevelsInterval = options.audioLevelsInterval;
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
            }
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

        return RTC.obtainAudioAndVideoPermissions(options || {})
            .then(function(tracks) {
                promiseFulfilled = true;

                if(!RTC.options.disableAudioLevels)
                    for(var i = 0; i < tracks.length; i++) {
                        var track = tracks[i];
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

                        return LibJitsiMeet.createLocalTracks(options);
                    }
                }

                if (JitsiTrackErrors.CHROME_EXTENSION_USER_CANCELED ===
                        error.name) {
                    // User cancelled action is not really an error, so only
                    // log it as an event to avoid having conference classified
                    // as partially failed
                    var logObject = {
                        id: "chrome_extension_user_canceled",
                        message: error.message
                    };
                    Statistics.sendLog(JSON.stringify(logObject));
                } else {
                    // Report gUM failed to the stats
                    Statistics.sendGetUserMediaFailed(error);
                }

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
     * Represents a hub/namespace for utility functionality which may be of
     * interest to LibJitsiMeet clients.
     */
    util: {
        ScriptUtil: ScriptUtil,
        RTCUIHelper: RTCUIHelper,
        AuthUtil: AuthUtil
    }
};

//Setups the promise object.
window.Promise = window.Promise || require("es6-promise").Promise;

module.exports = LibJitsiMeet;
