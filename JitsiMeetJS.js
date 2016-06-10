var logger = require("jitsi-meet-logger").getLogger(__filename);
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
var Resolutions = require("./service/RTC/Resolutions");
var ScriptUtil = require("./modules/util/ScriptUtil");
var GlobalOnErrorHandler = require("./modules/util/GlobalOnErrorHandler");

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
    logLevels: Logger.levels,
    mediaDevices: JitsiMediaDevices,
    /**
     * Array of functions that will receive the GUM error.
     */
    _gumFailedHandler: [],
    init: function (options) {
        Statistics.audioLevelsEnabled = !options.disableAudioLevels;

        if (options.enableWindowOnErrorHandler) {
            GlobalOnErrorHandler.addHandler(
                this.getGlobalOnErrorHandler.bind(this));
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
     * @returns {Promise.<{Array.<JitsiTrack>}, JitsiConferenceError>}
     *     A promise that returns an array of created JitsiTracks if resolved,
     *     or a JitsiConferenceError if rejected.
     */
    createLocalTracks: function (options) {
        return RTC.obtainAudioAndVideoPermissions(options || {}).then(
            function(tracks) {
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
                this._gumFailedHandler.forEach(function (handler) {
                    handler(error);
                });

                if(!this._gumFailedHandler.length) {
                    Statistics.sendGetUserMediaFailed(error);
                }

                if(error.name === JitsiTrackErrors.UNSUPPORTED_RESOLUTION) {
                    var oldResolution = options.resolution || '360',
                        newResolution = getLowerResolution(oldResolution);

                    if (newResolution === null) {
                        return Promise.reject(error);
                    }

                    options.resolution = newResolution;

                    logger.debug("Retry createLocalTracks with resolution",
                                newResolution);

                    return LibJitsiMeet.createLocalTracks(options);
                }

                return Promise.reject(error);
            }.bind(this));
    },
    /**
     * Checks if its possible to enumerate available cameras/micropones.
     * @returns {boolean} true if available, false otherwise.
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
     * Array of functions that will receive the unhandled errors.
     */
    _globalOnErrorHandler: [],
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
        var globalOnErrorHandler = this._globalOnErrorHandler;
        if (globalOnErrorHandler.length) {
          globalOnErrorHandler.forEach(function (handler) {
              handler(error);
          });
        } else {
            Statistics.reportGlobalError.call(Statistics, error);
        }
    },

    /**
     * Represents a hub/namespace for utility functionality which may be of
     * interest to LibJitsiMeet clients.
     */
    util: {
        ScriptUtil: ScriptUtil,
        RTCUIHelper: RTCUIHelper
    }
};

// XXX JitsiConnection or the instances it initializes and is associated with
// (e.g. JitsiConference) may need a reference to LibJitsiMeet (aka
// JitsiMeetJS). An approach could be to declare LibJitsiMeet global (which is
// what we do in Jitsi Meet) but that could be seen as not such a cool decision
// certainly looks even worse within the lib-jitsi-meet library itself. That's
// why the decision is to provide LibJitsiMeet as a parameter of
// JitsiConnection.
LibJitsiMeet.JitsiConnection = JitsiConnection.bind(null, LibJitsiMeet);

// expose JitsiTrackError this way to give library consumers to do checks like
// if (error instanceof JitsiMeetJS.JitsiTrackError) { }
LibJitsiMeet.JitsiTrackError = JitsiTrackError;

//Setups the promise object.
window.Promise = window.Promise || require("es6-promise").Promise;

module.exports = LibJitsiMeet;
