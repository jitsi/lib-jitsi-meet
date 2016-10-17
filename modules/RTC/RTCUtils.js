/* global $,
          attachMediaStream,
          MediaStreamTrack,
          RTCIceCandidate,
          RTCPeerConnection,
          RTCSessionDescription,
          mozRTCIceCandidate,
          mozRTCPeerConnection,
          mozRTCSessionDescription,
          webkitMediaStream,
          webkitRTCPeerConnection,
          webkitURL
*/

var logger = require("jitsi-meet-logger").getLogger(__filename);
var RTCBrowserType = require("./RTCBrowserType");
var Resolutions = require("../../service/RTC/Resolutions");
var RTCEvents = require("../../service/RTC/RTCEvents");
var SDPUtil = require("../xmpp/SDPUtil");
var EventEmitter = require("events");
var screenObtainer = require("./ScreenObtainer");
import JitsiTrackError from "../../JitsiTrackError";
var MediaType = require("../../service/RTC/MediaType");
var VideoType = require("../../service/RTC/VideoType");
var CameraFacingMode = require("../../service/RTC/CameraFacingMode");
var GlobalOnErrorHandler = require("../util/GlobalOnErrorHandler");

// XXX Don't require Temasys unless it's to be used because it doesn't run on
// React Native, for example.
const AdapterJS
    = RTCBrowserType.isTemasysPluginUsed()
        ? require("./adapter.screenshare")
        : undefined;

var eventEmitter = new EventEmitter();

var AVAILABLE_DEVICES_POLL_INTERVAL_TIME = 3000; // ms

var devices = {
    audio: false,
    video: false
};

// Currently audio output device change is supported only in Chrome and
// default output always has 'default' device ID
var audioOutputDeviceId = 'default'; // default device
// whether user has explicitly set a device to use
var audioOutputChanged = false;
// Disables Acoustic Echo Cancellation
var disableAEC = false;
// Disables Noise Suppression
var disableNS = false;

var featureDetectionAudioEl = document.createElement('audio');
var isAudioOutputDeviceChangeAvailable =
    typeof featureDetectionAudioEl.setSinkId !== 'undefined';

var currentlyAvailableMediaDevices;

var rawEnumerateDevicesWithCallback = undefined;
/**
 * "rawEnumerateDevicesWithCallback" will be initialized only after WebRTC is
 * ready. Otherwise it is too early to assume that the devices listing is not
 * supported.
 */
function initRawEnumerateDevicesWithCallback() {
    rawEnumerateDevicesWithCallback = navigator.mediaDevices
        && navigator.mediaDevices.enumerateDevices
        ? function(callback) {
            navigator.mediaDevices.enumerateDevices().then(
                callback, function () {
                    callback([]);
            });
        }
        // Safari:
        // "ReferenceError: Can't find variable: MediaStreamTrack"
        // when Temasys plugin is not installed yet, have to delay this call
        // until WebRTC is ready.
        : (MediaStreamTrack && MediaStreamTrack.getSources)
        ? function (callback) {
            MediaStreamTrack.getSources(function (sources) {
                callback(sources.map(convertMediaStreamTrackSource));
            });
        }
        : undefined;
}

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

function setResolutionConstraints(constraints, resolution) {
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
 * @param {string[]} um required user media types
 *
 * @param {Object} [options={}] optional parameters
 * @param {string} options.resolution
 * @param {number} options.bandwidth
 * @param {number} options.fps
 * @param {string} options.desktopStream
 * @param {string} options.cameraDeviceId
 * @param {string} options.micDeviceId
 * @param {CameraFacingMode} options.facingMode
 * @param {bool} firefox_fake_device
 */
function getConstraints(um, options) {
    var constraints = {audio: false, video: false};

    // Don't mix new and old style settings for Chromium as this leads
    // to TypeError in new Chromium versions. @see
    // https://bugs.chromium.org/p/chromium/issues/detail?id=614716
    // This is a temporary solution, in future we will fully split old and
    // new style constraints when new versions of Chromium and Firefox will
    // have stable support of new constraints format. For more information
    // @see https://github.com/jitsi/lib-jitsi-meet/pull/136
    var isNewStyleConstraintsSupported =
        RTCBrowserType.isFirefox() ||
        RTCBrowserType.isReactNative() ||
        RTCBrowserType.isTemasysPluginUsed();

    if (um.indexOf('video') >= 0) {
        // same behaviour as true
        constraints.video = { mandatory: {}, optional: [] };

        if (options.cameraDeviceId) {
            if (isNewStyleConstraintsSupported) {
                // New style of setting device id.
                constraints.video.deviceId = options.cameraDeviceId;
            }
            // Old style.
            constraints.video.optional.push({
                sourceId: options.cameraDeviceId
            });
        } else {
            // Prefer the front i.e. user-facing camera (to the back i.e.
            // environment-facing camera, for example).
            // TODO: Maybe use "exact" syntax if options.facingMode is defined,
            // but this probably needs to be decided when updating other
            // constraints, as we currently don't use "exact" syntax anywhere.
            var facingMode = options.facingMode || CameraFacingMode.USER;

            if (isNewStyleConstraintsSupported) {
                constraints.video.facingMode = facingMode;
            }
            constraints.video.optional.push({
                facingMode: facingMode
            });
        }

        constraints.video.optional.push({ googLeakyBucket: true });

        setResolutionConstraints(constraints, options.resolution);
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
                if (isNewStyleConstraintsSupported) {
                    // New style of setting device id.
                    constraints.audio.deviceId = options.micDeviceId;
                }
                // Old style.
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

/**
 * Sets the availbale devices based on the options we requested and the
 * streams we received.
 * @param um the options we requested to getUserMedia.
 * @param stream the stream we received from calling getUserMedia.
 */
function setAvailableDevices(um, stream) {
    var audioTracksReceived = stream && !!stream.getAudioTracks().length;
    var videoTracksReceived = stream && !!stream.getVideoTracks().length;

    if (um.indexOf("video") != -1) {
        devices.video = videoTracksReceived;
    }
    if (um.indexOf("audio") != -1) {
        devices.audio = audioTracksReceived;
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
            // We don't fire RTCEvents.DEVICE_LIST_CHANGED for the first time
            // we call enumerateDevices(). This is the initial step.
            if (typeof currentlyAvailableMediaDevices === 'undefined') {
                currentlyAvailableMediaDevices = devices.slice(0);
            } else if (compareAvailableMediaDevices(devices)) {
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
function onMediaDevicesListChanged(devicesReceived) {
    currentlyAvailableMediaDevices = devicesReceived.slice(0);
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
        devices.video = false;
    }

    if (audioInputDevices.length &&
        audioInputDevices.length === audioInputDevicesWithEmptyLabels.length) {
        devices.audio = false;
    }

    eventEmitter.emit(RTCEvents.DEVICE_LIST_CHANGED, devicesReceived);
}

// In case of IE we continue from 'onReady' callback
// passed to RTCUtils constructor. It will be invoked by Temasys plugin
// once it is initialized.
function onReady (options, GUM) {
    rtcReady = true;
    eventEmitter.emit(RTCEvents.RTC_READY, true);
    screenObtainer.init(options, GUM);

    // Initialize rawEnumerateDevicesWithCallback
    initRawEnumerateDevicesWithCallback();

    if (RTCUtils.isDeviceListAvailable() && rawEnumerateDevicesWithCallback) {
        rawEnumerateDevicesWithCallback(function (devices) {
            currentlyAvailableMediaDevices = devices.splice(0);

            eventEmitter.emit(RTCEvents.DEVICE_LIST_AVAILABLE,
                currentlyAvailableMediaDevices);

            if (isDeviceChangeEventSupported) {
                navigator.mediaDevices.addEventListener(
                    'devicechange',
                    function () {
                        RTCUtils.enumerateDevices(
                            onMediaDevicesListChanged);
                    });
            } else {
                pollForAvailableMediaDevices();
            }
        });
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
                // eslint-disable-next-line new-cap
                audioStream = new webkitMediaStream();
                for (var i = 0; i < audioTracks.length; i++) {
                    audioStream.addTrack(audioTracks[i]);
                }
            }

            var videoTracks = audioVideo.getVideoTracks();
            if (videoTracks.length) {
                // eslint-disable-next-line new-cap
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
                && stream.getAudioTracks().length
                // we skip setting audio output if there was no explicit change
                && audioOutputChanged) {
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
    };
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
                /* eslint-disable no-native-reassign */
                RTCSessionDescription = mozRTCSessionDescription;
                RTCIceCandidate = mozRTCIceCandidate;
                /* eslint-enable no-native-reassign */
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
                AdapterJS.webRTCReady(function () {

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

                    onReady(options,
                        self.getUserMediaWithConstraints.bind(self));
                    resolve();
                });
            } else {
                var errmsg = 'Browser does not appear to be WebRTC-capable';
                logger.error(errmsg);
                reject(new Error(errmsg));
                return;
            }

            // Call onReady() if Temasys plugin is not used
            if (!RTCBrowserType.isTemasysPluginUsed()) {
                onReady(options, this.getUserMediaWithConstraints.bind(this));
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
        var constraints = getConstraints(um, options);

        logger.info("Get media constraints", constraints);

        try {
            this.getUserMedia(constraints,
                function (stream) {
                    logger.log('onUserMediaSuccess');
                    setAvailableDevices(um, stream);
                    success_callback(stream);
                },
                function (error) {
                    setAvailableDevices(um, undefined);
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
        var dsOptions = options.desktopSharingExtensionExternalInstallation;
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
                        screenObtainer,
                        dsOptions);
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

                                // we are missing one of the media we requested
                                // in order to get the actual error that caused
                                // this missing media we will call one more time
                                // getUserMedia so we can obtain the actual
                                // error (Example usecases are requesting
                                // audio and video and video device is missing
                                // or device is denied to be used and chrome is
                                // set to not ask for permissions)
                                self.getUserMediaWithConstraints(
                                    devices,
                                    function () {
                                        // we already failed to obtain this
                                        // media, so we are not supposed in any
                                        // way to receive success for this call
                                        // any way we will throw an error to be
                                        // sure the promise will finish
                                        reject(new JitsiTrackError(
                                            { name: "UnknownError" },
                                            getConstraints(
                                                options.devices, options),
                                            devices)
                                        );
                                    },
                                    function (error) {
                                        // rejects with real error for not
                                        // obtaining the media
                                        reject(error);
                                    },options);

                                return;
                            }
                            if(hasDesktop) {
                                screenObtainer.obtainStream(
                                    dsOptions,
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
                        dsOptions,
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
    _isDeviceListAvailable: function () {
        if (!rtcReady)
            throw new Error("WebRTC not ready yet");
        var isEnumerateDevicesAvailable
            = navigator.mediaDevices && navigator.mediaDevices.enumerateDevices;
        if (isEnumerateDevicesAvailable) {
            return true;
        }
        return (typeof MediaStreamTrack !== "undefined" &&
            MediaStreamTrack.getSources)? true : false;
    },
    /**
     * Returns a promise which can be used to make sure that the WebRTC stack
     * has been initialized.
     *
     * @returns {Promise} which is resolved only if the WebRTC stack is ready.
     * Note that currently we do not detect stack initialization failure and
     * the promise is never rejected(unless unexpected error occurs).
     */
    onRTCReady: function() {
        if (rtcReady) {
            return Promise.resolve();
        } else {
            return new Promise(function (resolve) {
                var listener = function () {
                    eventEmitter.removeListener(RTCEvents.RTC_READY, listener);
                    resolve();
                };
                eventEmitter.addListener(RTCEvents.RTC_READY, listener);
                // We have no failed event, so... it either resolves or nothing
                // happens
            });
        }
    },
    /**
     * Checks if its possible to enumerate available cameras/microphones.
     *
     * @returns {Promise<boolean>} a Promise which will be resolved only once
     * the WebRTC stack is ready, either with true if the device listing is
     * available available or with false otherwise.
     */
    isDeviceListAvailable: function () {
        return this.onRTCReady().then(function() {
            return this._isDeviceListAvailable();
        }.bind(this));
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

        // The MediaStream implementation of the react-native-webrtc project has
        // an explicit release method that is to be invoked in order to release
        // used resources such as memory.
        if (mediaStream.release) {
            mediaStream.release();
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
                audioOutputChanged = true;

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
    },

    /**
     * Returns list of available media devices if its obtained, otherwise an
     * empty array is returned/
     * @returns {Array} list of available media devices.
     */
    getCurrentlyAvailableMediaDevices: function () {
        return currentlyAvailableMediaDevices;
    },

    /**
     * Returns event data for device to be reported to stats.
     * @returns {MediaDeviceInfo} device.
     */
    getEventDataForActiveDevice: function (device) {
        var devices = [];
        var deviceData = {
            "deviceId": device.deviceId,
            "kind":     device.kind,
            "label":    device.label,
            "groupId":  device.groupId
        };
        devices.push(deviceData);
        return { deviceList: devices };
    }
};

module.exports = RTCUtils;
