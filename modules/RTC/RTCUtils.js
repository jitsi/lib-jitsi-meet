/* global config, require, attachMediaStream, getUserMedia,
   RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, MediaStreamTrack,
   mozRTCPeerConnection, mozRTCSessionDescription, mozRTCIceCandidate,
   webkitRTCPeerConnection, webkitMediaStream, webkitURL
*/
/* jshint -W101 */

var logger = require("jitsi-meet-logger").getLogger(__filename);
var RTCBrowserType = require("./RTCBrowserType");
var Resolutions = require("../../service/RTC/Resolutions");
var RTCEvents = require("../../service/RTC/RTCEvents");
var AdapterJS = require("./adapter.screenshare");
var SDPUtil = require("../xmpp/SDPUtil");
var EventEmitter = require("events");
var screenObtainer = require("./ScreenObtainer");
var JitsiTrackErrors = require("../../JitsiTrackErrors");
var JitsiTrackError = require("../../JitsiTrackError");
var MediaType = require("../../service/RTC/MediaType");
var VideoType = require("../../service/RTC/VideoType");
var GlobalOnErrorHandler = require("../util/GlobalOnErrorHandler");

var eventEmitter = new EventEmitter();

var AVAILABLE_DEVICES_POLL_INTERVAL_TIME = 3000; // ms

var devices = {
    audio: false,
    video: false
};

// Currently audio output device change is supported only in Chrome and
// default output always has 'default' device ID
var audioOutputDeviceId = 'default'; // default device
// Disables Acoustic Echo Cancellation
var disableAEC = false;
// Disables Noise Suppression
var disableNS = false;

var featureDetectionAudioEl = document.createElement('audio');
var isAudioOutputDeviceChangeAvailable =
    typeof featureDetectionAudioEl.setSinkId !== 'undefined';

var constraintsNewFormatSupported = !!(navigator.mediaDevices &&
    navigator.mediaDevices.getSupportedConstraints);
var supportedGetUserMediaConstraints = constraintsNewFormatSupported
    ? navigator.mediaDevices.getSupportedConstraints()
    : {};

var currentlyAvailableMediaDevices = [];

var rawEnumerateDevicesWithCallback = navigator.mediaDevices
    && navigator.mediaDevices.enumerateDevices
        ? function(callback) {
            navigator.mediaDevices.enumerateDevices().then(callback, function () {
                callback([]);
            });
        }
        : (MediaStreamTrack && MediaStreamTrack.getSources)
            ? function (callback) {
                MediaStreamTrack.getSources(function (sources) {
                    callback(sources.map(convertMediaStreamTrackSource));
                });
            }
            : undefined;

// TODO: currently no browser supports 'devicechange' event even in nightly
// builds so no feature/browser detection is used at all. However in future this
// should be changed to some expression. Progress on 'devicechange' event
// implementation for Chrome/Opera/NWJS can be tracked at
// https://bugs.chromium.org/p/chromium/issues/detail?id=388648, for Firefox -
// at https://bugzilla.mozilla.org/show_bug.cgi?id=1152383. More information on
// 'devicechange' event can be found in spec -
// http://w3c.github.io/mediacapture-main/#event-mediadevices-devicechange
// TODO: check MS Edge
var isDeviceChangeEventSupported = false;

var rtcReady = false;

function setOldFormatResolutionConstraints(constraints, resolution) {
    var isAndroid = RTCBrowserType.isAndroid();

    if (Resolutions[resolution]) {
        constraints.video.mandatory.minWidth = Resolutions[resolution].width;
        constraints.video.mandatory.minHeight = Resolutions[resolution].height;
    }
    else if (isAndroid) {
        // FIXME can't remember if the purpose of this was to always request
        //       low resolution on Android ? if yes it should be moved up front
        constraints.video.mandatory.minWidth = 320;
        constraints.video.mandatory.minHeight = 180;
        constraints.video.mandatory.maxFrameRate = 15;
    }

    if (constraints.video.mandatory.minWidth)
        constraints.video.mandatory.maxWidth =
            constraints.video.mandatory.minWidth;
    if (constraints.video.mandatory.minHeight)
        constraints.video.mandatory.maxHeight =
            constraints.video.mandatory.minHeight;
}

/**
 * Construct resolution constraints according to W3C spec.
 * @param {Object} constraints
 * @param {string} resolution
 */
function setNewFormatResolutionConstraints(constraints, resolution) {
    if (!supportedGetUserMediaConstraints.width ||
        !supportedGetUserMediaConstraints.height) {
        return;
    }

    var maxWidth = resolution && Resolutions[resolution]
        ? Resolutions[resolution].width
        : 4096;
    var maxHeight = resolution && Resolutions[resolution]
        ? Resolutions[resolution].height
        : 3072;

    // TODO: check if specific handling is needed for Android.

    if (!constraints.video.advanced) {
        Object.assign(constraints.video, { advanced: [] });
    }

    Object.assign(constraints.video, {
        advanced: constraints.video.advanced.concat(
            Object.keys(Resolutions)
                .map(function (key) {
                    return Resolutions[key];
                })
                .sort(function (a, b) {
                    return a.order < b.order;
                })
                .map(function (res) {
                    // If exact resolution was passed, limit constraints to it.
                    if (res.width <= maxWidth && res.height <= maxHeight) {
                        // TODO: replace with "exact" syntax as soon as it's fixed for Chrome
                        // (@see https://bugs.chromium.org/p/chromium/issues/detail?id=620665).
                        // "Max" doesn't help here, because Chrome for some
                        // reason selects the lowest resolution.
                        return {
                            width: { min: res.width },
                            height: { min: res.height }
                        };
                    }
                })
                .filter(function (item) {
                    return typeof item !== 'undefined';
                })
        )
    });

    if (supportedGetUserMediaConstraints.aspectRatio) {
        // Prefer 16:9 aspect ratio over 4:3.
        constraints.video.advanced.push({ aspectRatio: 16/9 });
        constraints.video.advanced.push({ aspectRatio: 4/3 });
    }
}

/**
 * Returns constraints object for use with gUM.
 * @param {string[]} um required user media types
 * @param {Object} [options={}] optional parameters
 * @param {string} options.resolution
 * @param {number} options.bandwidth
 * @param {number} options.fps
 * @param {number} options.minFps
 * @param {number} options.maxFps
 * @param {string} options.desktopStream
 * @param {string} options.cameraDeviceId
 * @param {string} options.micDeviceId
 * @param {'user'|'environment'} options.facingMode
 * @param {boolean} options.firefox_fake_device
 * @returns {Object}
 */
function getConstraints(um, options) {
    return constraintsNewFormatSupported
        ? getNewFormatConstraints(um, options)
        : getOldFormatConstraints(um, options);
}

/**
 * Constructs new style gUM constraints object according to W3C spec (@see
 * https://www.w3.org/TR/mediacapture-streams/#constrainable-interface).
 * For params @see getConstraints function.
 * @param um
 * @param options
 * @returns {Object}
 */
function getNewFormatConstraints(um, options) {
    var constraints = {
        audio: false,
        video: false
    };

    if (um.indexOf('video') >= 0) {
        constraints.video = {};

        if (options.cameraDeviceId &&
            supportedGetUserMediaConstraints.deviceId) {
            Object.assign(constraints.video, {
                deviceId: options.cameraDeviceId
            });
        } else if (supportedGetUserMediaConstraints.facingMode) {
            // Prefer the front i.e. user-facing camera (to the back i.e.
            // environment-facing camera, for example), if no specific device ID
            // was passed.
            Object.assign(constraints.video, {
                facingMode: options.facingMode || 'user'
            });
        }

        if ((options.minFps || options.maxFps || options.fps) &&
            supportedGetUserMediaConstraints.frameRate) {
            // For some cameras it might be necessary to request 30fps
            // so they choose 30fps mjpg over 10fps yuy2.
            Object.assign(constraints.video, {
                frameRate: {
                    min: options.minFps,
                    ideal: options.fps,
                    max: options.maxFps
                }
            });
        }

        setNewFormatResolutionConstraints(constraints, options.resolution);
    }

    if (um.indexOf('audio') >= 0) {
        constraints.audio = {};

        if (options.micDeviceId &&
            supportedGetUserMediaConstraints.deviceId) {
            Object.assign(constraints.audio, {
                deviceId: options.micDeviceId
            });
        }

        if (supportedGetUserMediaConstraints.echoCancellation) {
            Object.assign(constraints.audio, {
                echoCancellation: !disableAEC
            });
        }

        if (supportedGetUserMediaConstraints.mozAutoGainControl) {
            Object.assign(constraints.audio, {
                mozAutoGainControl: true
            });
        }

        if (supportedGetUserMediaConstraints.mozNoiseSuppression) {
            Object.assign(constraints.audio, {
                mozNoiseSuppression: !disableNS
            });
        }

        // Current "getSupportedConstraints" for Chrome doesn't return Chrome-
        // specific filters, so use browser detection instead of feature
        // detection here.
        // There is a chance that those constraints are actually not working:
        // https://bugs.chromium.org/p/chromium/issues/detail?id=605673
        // TODO: fix this as soon as those filters are standardized.
        if (RTCBrowserType.isChrome()) {
            Object.assign(constraints.audio, {
                googAutoGainControl: true,
                googNoiseSupression: !disableNS,
                googHighpassFilter: true,
                googNoiseSuppression2: !disableNS,
                googEchoCancellation2: !disableAEC,
                googAutoGainControl2: true
            });
        }
    }

    if (um.indexOf('screen') >= 0) {
        if (supportedGetUserMediaConstraints.mediaSource) {
            constraints.video = {
                mediaSource: "window"
            };

            if (supportedGetUserMediaConstraints.width) {
                Object.assign(constraints.video, {
                    width: { max: window.screen.width }
                });
            }

            if (supportedGetUserMediaConstraints.height) {
                Object.assign(constraints.video, {
                    height: { max: window.screen.height }
                });
            }

            if (supportedGetUserMediaConstraints.frameRate) {
                Object.assign(constraints.video, {
                    frameRate: { max: 3 }
                });
            }
        } else {
            var errmsg = "'screen' WebRTC media source is not supported";
            GlobalOnErrorHandler.callErrorHandler(new Error(errmsg));
            logger.error(errmsg);
        }
    }

    if (um.indexOf('desktop') >= 0) {
        // We can't use new style constraints with non-standard Chrome props:
        // https://bugs.chromium.org/p/chromium/issues/detail?id=605673
        // TODO: fix this in future.
        constraints.video = {
            mandatory: {
                chromeMediaSource: "desktop",
                chromeMediaSourceId: options.desktopStream,
                maxWidth: window.screen.width,
                maxHeight: window.screen.height,
                maxFrameRate: 3
            },
            optional: []
        };
    }

    // TODO: check for "bandwidth" constraint

    // We turn audio for both audio and video tracks, the fake audio & video
    // seems to work only when enabled in one getUserMedia call, we cannot get
    // fake audio separate by fake video this later can be a problem with some
    // of the tests.
    if (RTCBrowserType.isFirefox() && options.firefox_fake_device) {
        // seems to be fixed now, removing this experimental fix, as having
        // multiple audio tracks brake the tests
        //constraints.audio = true;
        constraints.fake = true;
    }

    return constraints;
}

/**
 * Returns old style gUM constraints with "mandatory" and "optional" sections.
 * For params @see getConstraints function.
 * @param um
 * @param options
 * @returns {Object}
 */
function getOldFormatConstraints(um, options) {
    var constraints = {audio: false, video: false};

    if (um.indexOf('video') >= 0) {
        // same behaviour as true
        constraints.video = { mandatory: {}, optional: [] };

        if (options.cameraDeviceId) {
            // Don't mix new and old style settings for Chrome.
            if (!RTCBrowserType.isChrome()) {
                // new style of settings device id
                constraints.video.deviceId = options.cameraDeviceId;
            }
            // old style
            constraints.video.optional.push({
                sourceId: options.cameraDeviceId
            });
        } else {
            // Prefer the front i.e. user-facing camera (to the back i.e.
            // environment-facing camera, for example), if no specific device ID
            // was passed.

            // Don't mix new and old style settings for Chrome.
            if (!RTCBrowserType.isChrome()) {
                constraints.video.facingMode = options.facingMode || 'user';
            }

            constraints.video.optional.push({
                facingMode: options.facingMode || 'user'
            });
        }

        constraints.video.optional.push({ googLeakyBucket: true });

        setOldFormatResolutionConstraints(constraints, options.resolution);
    }
    if (um.indexOf('audio') >= 0) {
        if (RTCBrowserType.isReactNative()) {
            // The react-native-webrtc project that we're currently using
            // expects the audio constraint to be a boolean.
            constraints.audio = true;
        } else if (!RTCBrowserType.isFirefox()) {
            // same behaviour as true
            constraints.audio = { mandatory: {}, optional: []};
            if (options.micDeviceId) {
                // Don't mix new and old style settings for Chrome.
                if (!RTCBrowserType.isChrome()) {
                    // new style of settings device id
                    constraints.audio.deviceId = options.micDeviceId;
                }
                // old style
                constraints.audio.optional.push({
                    sourceId: options.micDeviceId
                });
            }
            // if it is good enough for hangouts...
            constraints.audio.optional.push(
                {googEchoCancellation: !disableAEC},
                {googAutoGainControl: true},
                {googNoiseSupression: !disableNS},
                {googHighpassFilter: true},
                {googNoiseSuppression2: !disableNS},
                {googEchoCancellation2: !disableAEC},
                {googAutoGainControl2: true}
            );
        } else {
            if (options.micDeviceId) {
                constraints.audio = {
                    mandatory: {},
                    deviceId: options.micDeviceId, // new style
                    optional: [{
                        sourceId: options.micDeviceId // old style
                    }]};
            } else {
                constraints.audio = true;
            }
        }
    }
    if (um.indexOf('screen') >= 0) {
        if (RTCBrowserType.isChrome()) {
            constraints.video = {
                mandatory: {
                    chromeMediaSource: "screen",
                    googLeakyBucket: true,
                    maxWidth: window.screen.width,
                    maxHeight: window.screen.height,
                    maxFrameRate: 3
                },
                optional: []
            };
        } else if (RTCBrowserType.isTemasysPluginUsed()) {
            constraints.video = {
                optional: [
                    {
                        sourceId: AdapterJS.WebRTCPlugin.plugin.screensharingKey
                    }
                ]
            };
        } else if (RTCBrowserType.isFirefox()) {
            constraints.video = {
                mozMediaSource: "window",
                mediaSource: "window"
            };

        } else {
            var errmsg
                = "'screen' WebRTC media source is supported only in Chrome"
                    + " and with Temasys plugin";
            GlobalOnErrorHandler.callErrorHandler(new Error(errmsg));
            logger.error(errmsg);
        }
    }
    if (um.indexOf('desktop') >= 0) {
        constraints.video = {
            mandatory: {
                chromeMediaSource: "desktop",
                chromeMediaSourceId: options.desktopStream,
                googLeakyBucket: true,
                maxWidth: window.screen.width,
                maxHeight: window.screen.height,
                maxFrameRate: 3
            },
            optional: []
        };
    }

    if (options.bandwidth) {
        if (!constraints.video) {
            //same behaviour as true
            constraints.video = {mandatory: {}, optional: []};
        }
        constraints.video.optional.push({bandwidth: options.bandwidth});
    }

    if(options.minFps || options.maxFps || options.fps) {
        // for some cameras it might be necessary to request 30fps
        // so they choose 30fps mjpg over 10fps yuy2
        if (!constraints.video) {
            // same behaviour as true;
            constraints.video = {mandatory: {}, optional: []};
        }
        if(options.minFps || options.fps) {
            options.minFps = options.minFps || options.fps; //Fall back to options.fps for backwards compatibility
            constraints.video.mandatory.minFrameRate = options.minFps;
        }
        if(options.maxFps) {
            constraints.video.mandatory.maxFrameRate = options.maxFps;
        }
    }

    // we turn audio for both audio and video tracks, the fake audio & video seems to work
    // only when enabled in one getUserMedia call, we cannot get fake audio separate by fake video
    // this later can be a problem with some of the tests
    if(RTCBrowserType.isFirefox() && options.firefox_fake_device)
    {
        // seems to be fixed now, removing this experimental fix, as having
        // multiple audio tracks brake the tests
        //constraints.audio = true;
        constraints.fake = true;
    }

    return constraints;
}

function setAvailableDevices(um, available) {
    if (um.indexOf("video") != -1) {
        devices.video = available;
    }
    if (um.indexOf("audio") != -1) {
        devices.audio = available;
    }

    eventEmitter.emit(RTCEvents.AVAILABLE_DEVICES_CHANGED, devices);
}

/**
 * Checks if new list of available media devices differs from previous one.
 * @param {MediaDeviceInfo[]} newDevices - list of new devices.
 * @returns {boolean} - true if list is different, false otherwise.
 */
function compareAvailableMediaDevices(newDevices) {
    if (newDevices.length !== currentlyAvailableMediaDevices.length) {
        return true;
    }

    return newDevices.map(mediaDeviceInfoToJSON).sort().join('') !==
        currentlyAvailableMediaDevices.map(mediaDeviceInfoToJSON).sort().join('');

    function mediaDeviceInfoToJSON(info) {
        return JSON.stringify({
            kind: info.kind,
            deviceId: info.deviceId,
            groupId: info.groupId,
            label: info.label,
            facing: info.facing
        });
    }
}

/**
 * Periodically polls enumerateDevices() method to check if list of media
 * devices has changed. This is temporary workaround until 'devicechange' event
 * will be supported by browsers.
 */
function pollForAvailableMediaDevices() {
    // Here we use plain navigator.mediaDevices.enumerateDevices instead of
    // wrapped because we just need to know the fact the devices changed, labels
    // do not matter. This fixes situation when we have no devices initially,
    // and then plug in a new one.
    if (rawEnumerateDevicesWithCallback) {
        rawEnumerateDevicesWithCallback(function (devices) {
            if (compareAvailableMediaDevices(devices)) {
                onMediaDevicesListChanged(devices);
            }

            window.setTimeout(pollForAvailableMediaDevices,
                AVAILABLE_DEVICES_POLL_INTERVAL_TIME);
        });
    }
}

/**
 * Event handler for the 'devicechange' event.
 * @param {MediaDeviceInfo[]} devices - list of media devices.
 * @emits RTCEvents.DEVICE_LIST_CHANGED
 */
function onMediaDevicesListChanged(devices) {
    currentlyAvailableMediaDevices = devices.slice(0);
    logger.info('list of media devices has changed:', currentlyAvailableMediaDevices);

    var videoInputDevices = currentlyAvailableMediaDevices.filter(function (d) {
            return d.kind === 'videoinput';
        }),
        audioInputDevices = currentlyAvailableMediaDevices.filter(function (d) {
            return d.kind === 'audioinput';
        }),
        videoInputDevicesWithEmptyLabels = videoInputDevices.filter(
            function (d) {
                return d.label === '';
            }),
        audioInputDevicesWithEmptyLabels = audioInputDevices.filter(
            function (d) {
                return d.label === '';
            });

    if (videoInputDevices.length &&
        videoInputDevices.length === videoInputDevicesWithEmptyLabels.length) {
        setAvailableDevices(['video'], false);
    }

    if (audioInputDevices.length &&
        audioInputDevices.length === audioInputDevicesWithEmptyLabels.length) {
        setAvailableDevices(['audio'], false);
    }

    eventEmitter.emit(RTCEvents.DEVICE_LIST_CHANGED, devices);
}

// In case of IE we continue from 'onReady' callback
// passed to RTCUtils constructor. It will be invoked by Temasys plugin
// once it is initialized.
function onReady (options, GUM) {
    rtcReady = true;
    eventEmitter.emit(RTCEvents.RTC_READY, true);
    screenObtainer.init(options, GUM);

    if (isDeviceChangeEventSupported && RTCUtils.isDeviceListAvailable()) {
        navigator.mediaDevices.addEventListener('devicechange', function () {
            RTCUtils.enumerateDevices(onMediaDevicesListChanged);
        });
    } else if (RTCUtils.isDeviceListAvailable()) {
        pollForAvailableMediaDevices();
    }
}

/**
 * Apply function with arguments if function exists.
 * Do nothing if function not provided.
 * @param {function} [fn] function to apply
 * @param {Array} [args=[]] arguments for function
 */
function maybeApply(fn, args) {
  if (fn) {
    fn.apply(null, args || []);
  }
}

var getUserMediaStatus = {
  initialized: false,
  callbacks: []
};

/**
 * Wrap `getUserMedia` to allow others to know if it was executed at least
 * once or not. Wrapper function uses `getUserMediaStatus` object.
 * @param {Function} getUserMedia native function
 * @returns {Function} wrapped function
 */
function wrapGetUserMedia(getUserMedia) {
  return function (constraints, successCallback, errorCallback) {
    getUserMedia(constraints, function (stream) {
      maybeApply(successCallback, [stream]);
      if (!getUserMediaStatus.initialized) {
        getUserMediaStatus.initialized = true;
        getUserMediaStatus.callbacks.forEach(function (callback) {
          callback();
        });
        getUserMediaStatus.callbacks.length = 0;
      }
    }, function (error) {
      maybeApply(errorCallback, [error]);
    });
  };
}

/**
 * Execute function after getUserMedia was executed at least once.
 * @param {Function} callback function to execute after getUserMedia
 */
function afterUserMediaInitialized(callback) {
    if (getUserMediaStatus.initialized) {
        callback();
    } else {
        getUserMediaStatus.callbacks.push(callback);
    }
}

/**
 * Wrapper function which makes enumerateDevices to wait
 * until someone executes getUserMedia first time.
 * @param {Function} enumerateDevices native function
 * @returns {Funtion} wrapped function
 */
function wrapEnumerateDevices(enumerateDevices) {
    return function (callback) {
        // enumerate devices only after initial getUserMedia
        afterUserMediaInitialized(function () {
            enumerateDevices().then(callback, function (err) {
                logger.error('cannot enumerate devices: ', err);
                callback([]);
            });
        });
    };
}

/**
 * Use old MediaStreamTrack to get devices list and
 * convert it to enumerateDevices format.
 * @param {Function} callback function to call when received devices list.
 */
function enumerateDevicesThroughMediaStreamTrack (callback) {
    MediaStreamTrack.getSources(function (sources) {
        callback(sources.map(convertMediaStreamTrackSource));
    });
}

/**
 * Converts MediaStreamTrack Source to enumerateDevices format.
 * @param {Object} source
 */
function convertMediaStreamTrackSource(source) {
    var kind = (source.kind || '').toLowerCase();

    return {
        facing: source.facing || null,
        label: source.label,
        // theoretically deprecated MediaStreamTrack.getSources should
        // not return 'audiooutput' devices but let's handle it in any
        // case
        kind: kind
            ? (kind === 'audiooutput' ? kind : kind + 'input')
            : null,
        deviceId: source.id,
        groupId: source.groupId || null
    };
}

function obtainDevices(options) {
    if(!options.devices || options.devices.length === 0) {
        return options.successCallback(options.streams || {});
    }

    var device = options.devices.splice(0, 1);
    var devices = [];
    devices.push(device);
    options.deviceGUM[device](function (stream) {
            options.streams = options.streams || {};
            options.streams[device] = stream;
            obtainDevices(options);
        },
        function (error) {
            Object.keys(options.streams).forEach(function(device) {
                RTCUtils.stopMediaStream(options.streams[device]);
            });
            logger.error(
                "failed to obtain " + device + " stream - stop", error);

            options.errorCallback(error);
        });
}


/**
 * Handles the newly created Media Streams.
 * @param streams the new Media Streams
 * @param resolution the resolution of the video streams
 * @returns {*[]} object that describes the new streams
 */
function handleLocalStream(streams, resolution) {
    var audioStream, videoStream, desktopStream, res = [];

    // XXX The function obtainAudioAndVideoPermissions has examined the type of
    // the browser, its capabilities, etc. and has taken the decision whether to
    // invoke getUserMedia per device (e.g. Firefox) or once for both audio and
    // video (e.g. Chrome). In order to not duplicate the logic here, examine
    // the specified streams and figure out what we've received based on
    // obtainAudioAndVideoPermissions' decision.
    if (streams) {
        // As mentioned above, certian types of browser (e.g. Chrome) support
        // (with a result which meets our requirements expressed bellow) calling
        // getUserMedia once for both audio and video.
        var audioVideo = streams.audioVideo;
        if (audioVideo) {
            var audioTracks = audioVideo.getAudioTracks();
            if (audioTracks.length) {
                audioStream = new webkitMediaStream();
                for (var i = 0; i < audioTracks.length; i++) {
                    audioStream.addTrack(audioTracks[i]);
                }
            }

            var videoTracks = audioVideo.getVideoTracks();
            if (videoTracks.length) {
                videoStream = new webkitMediaStream();
                for (var j = 0; j < videoTracks.length; j++) {
                    videoStream.addTrack(videoTracks[j]);
                }
            }
        } else {
          // On other types of browser (e.g. Firefox) we choose (namely,
          // obtainAudioAndVideoPermissions) to call getUsermedia per device
          // (type).
          audioStream = streams.audio;
          videoStream = streams.video;
        }
        // Again, different choices on different types of browser.
        desktopStream = streams.desktopStream || streams.desktop;
    }

    if (desktopStream) {
        res.push({
            stream: desktopStream,
            track: desktopStream.getVideoTracks()[0],
            mediaType: MediaType.VIDEO,
            videoType: VideoType.DESKTOP
        });
    }
    if (audioStream) {
        res.push({
            stream: audioStream,
            track: audioStream.getAudioTracks()[0],
            mediaType: MediaType.AUDIO,
            videoType: null
        });
    }
    if (videoStream) {
        res.push({
            stream: videoStream,
            track: videoStream.getVideoTracks()[0],
            mediaType: MediaType.VIDEO,
            videoType: VideoType.CAMERA,
            resolution: resolution
        });
    }

    return res;
}

/**
 * Wraps original attachMediaStream function to set current audio output device
 * if this is supported.
 * @param {Function} origAttachMediaStream
 * @returns {Function}
 */
function wrapAttachMediaStream(origAttachMediaStream) {
    return function(element, stream) {
        var res = origAttachMediaStream.apply(RTCUtils, arguments);

        if (stream
                && RTCUtils.isDeviceChangeAvailable('output')
                && stream.getAudioTracks
                && stream.getAudioTracks().length) {
            element.setSinkId(RTCUtils.getAudioOutputDevice())
                .catch(function (ex) {
                    var err = new JitsiTrackError(ex, null, ['audiooutput']);

                    GlobalOnErrorHandler.callUnhandledRejectionHandler(
                        {promise: this, reason: err});

                    logger.warn('Failed to set audio output device for the ' +
                        'element. Default audio output device will be used ' +
                        'instead',
                        element, err);
                });
        }

        return res;
    }
}

/**
 * Represents a default implementation of {@link RTCUtils#getVideoSrc} which
 * tries to be browser-agnostic through feature checking. Note though that it
 * was not completely clear from the predating browser-specific implementations
 * what &quot;videoSrc&quot; was because one implementation would return
 * <tt>MediaStream</tt> (e.g. Firefox), another a <tt>string</tt> representation
 * of the <tt>URL</tt> of the <tt>MediaStream</tt> (e.g. Chrome) and the return
 * value was only used by {@link RTCUIHelper#getVideoId} which itself did not
 * appear to be used anywhere. Generally, the implementation will try to follow
 * the related standards i.e. work with the <tt>srcObject</tt> and <tt>src</tt>
 * properties of the specified <tt>element</tt> taking into account vender
 * prefixes.
 *
 * @param element the element to get the associated video source/src of
 * @return the video source/src of the specified <tt>element</tt>
 */
function defaultGetVideoSrc(element) {
    // https://www.w3.org/TR/mediacapture-streams/
    //
    // User Agents that support this specification must support the srcObject
    // attribute of the HTMLMediaElement interface defined in [HTML51].

    // https://www.w3.org/TR/2015/WD-html51-20150506/semantics.html#dom-media-srcobject
    //
    // There are three ways to specify a media resource: the srcObject IDL
    // attribute, the src content attribute, and source elements. The IDL
    // attribute takes priority, followed by the content attribute, followed by
    // the elements.

    // srcObject
    var srcObject = element.srcObject || element.mozSrcObject;
    if (srcObject) {
        // Try the optimized path to the URL of a MediaStream.
        var url = srcObject.jitsiObjectURL;
        if (url) {
            return url.toString();
        }
        // Go via the unoptimized path to the URL of a MediaStream then.
        var URL = (window.URL || webkitURL);
        if (URL) {
            url = URL.createObjectURL(srcObject);
            try {
                return url.toString();
            } finally {
                URL.revokeObjectURL(url);
            }
        }
    }

    // src
    return element.src;
}

/**
 * Represents a default implementation of setting a <tt>MediaStream</tt> as the
 * source of a video element that tries to be browser-agnostic through feature
 * checking. Note though that it was not completely clear from the predating
 * browser-specific implementations what &quot;videoSrc&quot; was because one
 * implementation of {@link RTCUtils#getVideoSrc} would return
 * <tt>MediaStream</tt> (e.g. Firefox), another a <tt>string</tt> representation
 * of the <tt>URL</tt> of the <tt>MediaStream</tt> (e.g. Chrome) and the return
 * value was only used by {@link RTCUIHelper#getVideoId} which itself did not
 * appear to be used anywhere. Generally, the implementation will try to follow
 * the related standards i.e. work with the <tt>srcObject</tt> and <tt>src</tt>
 * properties of the specified <tt>element</tt> taking into account vender
 * prefixes.
 *
 * @param element the element whose video source/src is to be set to the
 * specified <tt>stream</tt>
 * @param {MediaStream} stream the <tt>MediaStream</tt> to set as the video
 * source/src of <tt>element</tt>
 */
function defaultSetVideoSrc(element, stream) {
    // srcObject
    var srcObjectPropertyName = 'srcObject';
    if (!(srcObjectPropertyName in element)) {
        srcObjectPropertyName = 'mozSrcObject';
        if (!(srcObjectPropertyName in element)) {
            srcObjectPropertyName = null;
        }
    }
    if (srcObjectPropertyName) {
        element[srcObjectPropertyName] = stream;
        return;
    }

    // src
    var src;
    if (stream) {
        src = stream.jitsiObjectURL;
        // Save the created URL for stream so we can reuse it and not keep
        // creating URLs.
        if (!src) {
            stream.jitsiObjectURL
                = src
                    = (URL || webkitURL).createObjectURL(stream);
        }
    }
    element.src = src || '';
}

//Options parameter is to pass config options. Currently uses only "useIPv6".
var RTCUtils = {
    init: function (options) {

        if (typeof(options.disableAEC) === "boolean") {
            disableAEC = options.disableAEC;
            logger.info("Disable AEC: " + disableAEC);
        }
        if (typeof(options.disableNS) === "boolean") {
            disableNS = options.disableNS;
            logger.info("Disable NS: " + disableNS);
        }

        return new Promise(function(resolve, reject) {
            if (RTCBrowserType.isFirefox()) {
                var FFversion = RTCBrowserType.getFirefoxVersion();
                if (FFversion < 40) {
                    logger.error(
                            "Firefox version too old: " + FFversion +
                            ". Required >= 40.");
                    reject(new Error("Firefox version too old: " + FFversion +
                    ". Required >= 40."));
                    return;
                }
                this.peerconnection = mozRTCPeerConnection;
                this.getUserMedia = wrapGetUserMedia(navigator.mozGetUserMedia.bind(navigator));
                this.enumerateDevices = wrapEnumerateDevices(
                    navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices)
                );
                this.pc_constraints = {};
                this.attachMediaStream = wrapAttachMediaStream(function (element, stream) {
                    //  srcObject is being standardized and FF will eventually
                    //  support that unprefixed. FF also supports the
                    //  "element.src = URL.createObjectURL(...)" combo, but that
                    //  will be deprecated in favour of srcObject.
                    //
                    // https://groups.google.com/forum/#!topic/mozilla.dev.media/pKOiioXonJg
                    // https://github.com/webrtc/samples/issues/302
                    if (element) {
                        defaultSetVideoSrc(element, stream);
                        if (stream)
                            element.play();
                    }
                    return element;
                });
                this.getStreamID = function (stream) {
                    var id = stream.id;
                    if (!id) {
                        var tracks = stream.getVideoTracks();
                        if (!tracks || tracks.length === 0) {
                            tracks = stream.getAudioTracks();
                        }
                        id = tracks[0].id;
                    }
                    return SDPUtil.filter_special_chars(id);
                };
                this.getVideoSrc = defaultGetVideoSrc;
                RTCSessionDescription = mozRTCSessionDescription;
                RTCIceCandidate = mozRTCIceCandidate;
            } else if (RTCBrowserType.isChrome() ||
                    RTCBrowserType.isOpera() ||
                    RTCBrowserType.isNWJS() ||
                    RTCBrowserType.isReactNative()) {
                this.peerconnection = webkitRTCPeerConnection;
                var getUserMedia = navigator.webkitGetUserMedia.bind(navigator);
                if (navigator.mediaDevices) {
                    this.getUserMedia = wrapGetUserMedia(getUserMedia);
                    this.enumerateDevices = wrapEnumerateDevices(
                        navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices)
                    );
                } else {
                    this.getUserMedia = getUserMedia;
                    this.enumerateDevices = enumerateDevicesThroughMediaStreamTrack;
                }
                this.attachMediaStream = wrapAttachMediaStream(function (element, stream) {
                    defaultSetVideoSrc(element, stream);
                    return element;
                });
                this.getStreamID = function (stream) {
                    // A. MediaStreams from FF endpoints have the characters '{'
                    // and '}' that make jQuery choke.
                    // B. The react-native-webrtc implementation that we use on
                    // React Native at the time of this writing returns a number
                    // for the id of MediaStream. Let's just say that a number
                    // contains no special characters.
                    var id = stream.id;
                    // XXX The return statement is affected by automatic
                    // semicolon insertion (ASI). No line terminator is allowed
                    // between the return keyword and the expression.
                    return (
                        (typeof id === 'number')
                            ? id
                            : SDPUtil.filter_special_chars(id));
                };
                this.getVideoSrc = defaultGetVideoSrc;
                // DTLS should now be enabled by default but..
                this.pc_constraints = {'optional': [
                    {'DtlsSrtpKeyAgreement': 'true'}
                ]};
                if (options.useIPv6) {
                    // https://code.google.com/p/webrtc/issues/detail?id=2828
                    this.pc_constraints.optional.push({googIPv6: true});
                }
                if (RTCBrowserType.isAndroid()) {
                    this.pc_constraints = {}; // disable DTLS on Android
                }
                if (!webkitMediaStream.prototype.getVideoTracks) {
                    webkitMediaStream.prototype.getVideoTracks = function () {
                        return this.videoTracks;
                    };
                }
                if (!webkitMediaStream.prototype.getAudioTracks) {
                    webkitMediaStream.prototype.getAudioTracks = function () {
                        return this.audioTracks;
                    };
                }
            }
            // Detect IE/Safari
            else if (RTCBrowserType.isTemasysPluginUsed()) {

                //AdapterJS.WebRTCPlugin.setLogLevel(
                //    AdapterJS.WebRTCPlugin.PLUGIN_LOG_LEVELS.VERBOSE);
                var self = this;
                AdapterJS.webRTCReady(function (isPlugin) {

                    self.peerconnection = RTCPeerConnection;
                    self.getUserMedia = window.getUserMedia;
                    self.enumerateDevices = enumerateDevicesThroughMediaStreamTrack;
                    self.attachMediaStream = wrapAttachMediaStream(function (element, stream) {
                        if (stream) {
                            if (stream.id === "dummyAudio"
                                    || stream.id === "dummyVideo") {
                                return;
                            }

                            // The container must be visible in order to play or
                            // attach the stream when Temasys plugin is in use
                            var containerSel = $(element);
                            if (RTCBrowserType.isTemasysPluginUsed()
                                    && !containerSel.is(':visible')) {
                                containerSel.show();
                            }
                            var video = !!stream.getVideoTracks().length;
                            if (video && !$(element).is(':visible')) {
                                throw new Error(
                                    'video element must be visible to attach'
                                        + ' video stream');
                            }
                        }

                        return attachMediaStream(element, stream);
                    });
                    self.getStreamID = function (stream) {
                        return SDPUtil.filter_special_chars(stream.label);
                    };
                    self.getVideoSrc = function (element) {
                        // There's nothing standard about getVideoSrc in the
                        // case of Temasys so there's no point to try to
                        // generalize it through defaultGetVideoSrc.
                        if (!element) {
                            logger.warn(
                                "Attempt to get video SRC of null element");
                            return null;
                        }
                        var children = element.children;
                        for (var i = 0; i !== children.length; ++i) {
                            if (children[i].name === 'streamId') {
                                return children[i].value;
                            }
                        }
                        //logger.info(element.id + " SRC: " + src);
                        return null;
                    };

                    onReady(options, self.getUserMediaWithConstraints);
                    resolve();
                });
            } else {
                var errmsg = 'Browser does not appear to be WebRTC-capable';
                try {
                    logger.error(errmsg);
                } catch (e) {
                }
                reject(new Error(errmsg));
                return;
            }

            // Call onReady() if Temasys plugin is not used
            if (!RTCBrowserType.isTemasysPluginUsed()) {
                onReady(options, this.getUserMediaWithConstraints);
                resolve();
            }
        }.bind(this));
    },
    /**
    * @param {string[]} um required user media types
    * @param {function} success_callback
    * @param {Function} failure_callback
    * @param {Object} [options] optional parameters
    * @param {string} options.resolution
    * @param {number} options.bandwidth
    * @param {number} options.fps
    * @param {string} options.desktopStream
    * @param {string} options.cameraDeviceId
    * @param {string} options.micDeviceId
    **/
    getUserMediaWithConstraints: function ( um, success_callback, failure_callback, options) {
        options = options || {};
        var resolution = options.resolution;
        var constraints = getConstraints(um, options);

        logger.info("Get media constraints", constraints);

        try {
            this.getUserMedia(constraints,
                function (stream) {
                    logger.log('onUserMediaSuccess');
                    setAvailableDevices(um, true);
                    success_callback(stream);
                },
                function (error) {
                    setAvailableDevices(um, false);
                    logger.warn('Failed to get access to local media. Error ',
                        error, constraints);

                    if (failure_callback) {
                        failure_callback(
                            new JitsiTrackError(error, constraints, um));
                    }
                });
        } catch (e) {
            logger.error('GUM failed: ', e);

            if (failure_callback) {
                failure_callback(new JitsiTrackError(e, constraints, um));
            }
        }
    },

    /**
     * Creates the local MediaStreams.
     * @param {Object} [options] optional parameters
     * @param {Array} options.devices the devices that will be requested
     * @param {string} options.resolution resolution constraints
     * @param {bool} options.dontCreateJitsiTrack if <tt>true</tt> objects with the following structure {stream: the Media Stream,
     * type: "audio" or "video", videoType: "camera" or "desktop"}
     * will be returned trough the Promise, otherwise JitsiTrack objects will be returned.
     * @param {string} options.cameraDeviceId
     * @param {string} options.micDeviceId
     * @returns {*} Promise object that will receive the new JitsiTracks
     */
    obtainAudioAndVideoPermissions: function (options) {
        var self = this;

        options = options || {};
        return new Promise(function (resolve, reject) {
            var successCallback = function (stream) {
                resolve(handleLocalStream(stream, options.resolution));
            };

            options.devices = options.devices || ['audio', 'video'];
            if(!screenObtainer.isSupported()
                && options.devices.indexOf("desktop") !== -1){
                reject(new Error("Desktop sharing is not supported!"));
            }
            if (RTCBrowserType.isFirefox()
                    // XXX The react-native-webrtc implementation that we
                    // utilize on React Native at the time of this writing does
                    // not support the MediaStream constructors defined by
                    // https://www.w3.org/TR/mediacapture-streams/#constructors
                    // and instead has a single constructor which expects (an
                    // NSNumber as) a MediaStream ID.
                    || RTCBrowserType.isReactNative()
                    || RTCBrowserType.isTemasysPluginUsed()) {
                var GUM = function (device, s, e) {
                    this.getUserMediaWithConstraints(device, s, e, options);
                };

                var deviceGUM = {
                    "audio": GUM.bind(self, ["audio"]),
                    "video": GUM.bind(self, ["video"])
                };

                if(screenObtainer.isSupported()){
                    deviceGUM["desktop"] = screenObtainer.obtainStream.bind(
                        screenObtainer);
                }
                // With FF/IE we can't split the stream into audio and video because FF
                // doesn't support media stream constructors. So, we need to get the
                // audio stream separately from the video stream using two distinct GUM
                // calls. Not very user friendly :-( but we don't have many other
                // options neither.
                //
                // Note that we pack those 2 streams in a single object and pass it to
                // the successCallback method.
                obtainDevices({
                    devices: options.devices,
                    streams: [],
                    successCallback: successCallback,
                    errorCallback: reject,
                    deviceGUM: deviceGUM
                });
            } else {
                var hasDesktop = options.devices.indexOf('desktop') > -1;
                if (hasDesktop) {
                    options.devices.splice(options.devices.indexOf("desktop"), 1);
                }
                options.resolution = options.resolution || '360';
                if(options.devices.length) {
                    this.getUserMediaWithConstraints(
                        options.devices,
                        function (stream) {
                            var audioDeviceRequested = options.devices.indexOf("audio") !== -1;
                            var videoDeviceRequested = options.devices.indexOf("video") !== -1;
                            var audioTracksReceived = !!stream.getAudioTracks().length;
                            var videoTracksReceived = !!stream.getVideoTracks().length;

                            if((audioDeviceRequested && !audioTracksReceived) ||
                                (videoDeviceRequested && !videoTracksReceived))
                            {
                                self.stopMediaStream(stream);

                                // We are getting here in case if we requested
                                // 'audio' or 'video' devices or both, but
                                // didn't get corresponding MediaStreamTrack in
                                // response stream. We don't know the reason why
                                // this happened, so reject with general error.
                                var devices = [];

                                if (audioDeviceRequested && !audioTracksReceived) {
                                    devices.push("audio");
                                }

                                if (videoDeviceRequested && !videoTracksReceived) {
                                    devices.push("video");
                                }

                                reject(new JitsiTrackError(
                                    { name: "UnknownError" },
                                    getConstraints(options.devices, options),
                                    devices)
                                );
                                return;
                            }
                            if(hasDesktop) {
                                screenObtainer.obtainStream(
                                    function (desktopStream) {
                                        successCallback({audioVideo: stream,
                                            desktopStream: desktopStream});
                                    }, function (error) {
                                        self.stopMediaStream(stream);

                                        reject(error);
                                    });
                            } else {
                                successCallback({audioVideo: stream});
                            }
                        },
                        function (error) {
                            reject(error);
                        },
                        options);
                } else if (hasDesktop) {
                    screenObtainer.obtainStream(
                        function (stream) {
                            successCallback({desktopStream: stream});
                        }, function (error) {
                            reject(error);
                        });
                }
            }
        }.bind(this));
    },
    addListener: function (eventType, listener) {
        eventEmitter.on(eventType, listener);
    },
    removeListener: function (eventType, listener) {
        eventEmitter.removeListener(eventType, listener);
    },
    getDeviceAvailability: function () {
        return devices;
    },
    isRTCReady: function () {
        return rtcReady;
    },
    /**
     * Checks if its possible to enumerate available cameras/micropones.
     * @returns {boolean} true if available, false otherwise.
     */
    isDeviceListAvailable: function () {
        var isEnumerateDevicesAvailable
            = navigator.mediaDevices && navigator.mediaDevices.enumerateDevices;
        if (isEnumerateDevicesAvailable) {
            return true;
        }
        return (MediaStreamTrack && MediaStreamTrack.getSources)? true : false;
    },
    /**
     * Returns true if changing the input (camera / microphone) or output
     * (audio) device is supported and false if not.
     * @params {string} [deviceType] - type of device to change. Default is
     *      undefined or 'input', 'output' - for audio output device change.
     * @returns {boolean} true if available, false otherwise.
     */
    isDeviceChangeAvailable: function (deviceType) {
        return deviceType === 'output' || deviceType === 'audiooutput'
            ? isAudioOutputDeviceChangeAvailable
            : RTCBrowserType.isChrome() ||
                RTCBrowserType.isFirefox() ||
                RTCBrowserType.isOpera() ||
                RTCBrowserType.isTemasysPluginUsed()||
                RTCBrowserType.isNWJS();
    },
    /**
     * A method to handle stopping of the stream.
     * One point to handle the differences in various implementations.
     * @param mediaStream MediaStream object to stop.
     */
    stopMediaStream: function (mediaStream) {
        mediaStream.getTracks().forEach(function (track) {
            // stop() not supported with IE
            if (!RTCBrowserType.isTemasysPluginUsed() && track.stop) {
                track.stop();
            }
        });

        // leave stop for implementation still using it
        if (mediaStream.stop) {
            mediaStream.stop();
        }

        // if we have done createObjectURL, lets clean it
        var url = mediaStream.jitsiObjectURL;
        if (url) {
            delete mediaStream.jitsiObjectURL;
            (URL || webkitURL).revokeObjectURL(url);
        }
    },
    /**
     * Returns whether the desktop sharing is enabled or not.
     * @returns {boolean}
     */
    isDesktopSharingEnabled: function () {
        return screenObtainer.isSupported();
    },
    /**
     * Sets current audio output device.
     * @param {string} deviceId - id of 'audiooutput' device from
     *      navigator.mediaDevices.enumerateDevices(), 'default' for default
     *      device
     * @returns {Promise} - resolves when audio output is changed, is rejected
     *      otherwise
     */
    setAudioOutputDevice: function (deviceId) {
        if (!this.isDeviceChangeAvailable('output')) {
            Promise.reject(
                new Error('Audio output device change is not supported'));
        }

        return featureDetectionAudioEl.setSinkId(deviceId)
            .then(function() {
                audioOutputDeviceId = deviceId;

                logger.log('Audio output device set to ' + deviceId);

                eventEmitter.emit(RTCEvents.AUDIO_OUTPUT_DEVICE_CHANGED,
                    deviceId);
            });
    },
    /**
     * Returns currently used audio output device id, '' stands for default
     * device
     * @returns {string}
     */
    getAudioOutputDevice: function () {
        return audioOutputDeviceId;
    }
};

module.exports = RTCUtils;
