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

var featureDetectionAudioEl = document.createElement('audio');
var isAudioOutputDeviceChangeAvailable =
    typeof featureDetectionAudioEl.setSinkId !== 'undefined';

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
 * @param {bool} firefox_fake_device
 */
function getConstraints(um, options) {
    var constraints = {audio: false, video: false};

    if (um.indexOf('video') >= 0) {
        // same behaviour as true
        constraints.video = { mandatory: {}, optional: [] };

        if (options.cameraDeviceId) {
            // new style of settings device id (FF only)
            constraints.video.deviceId = options.cameraDeviceId;
            // old style
            constraints.video.optional.push({
                sourceId: options.cameraDeviceId
            });
        }

        constraints.video.optional.push({ googLeakyBucket: true });

        setResolutionConstraints(constraints, options.resolution);
    }
    if (um.indexOf('audio') >= 0) {
        if (!RTCBrowserType.isFirefox()) {
            // same behaviour as true
            constraints.audio = { mandatory: {}, optional: []};
            if (options.micDeviceId) {
                // new style of settings device id (FF only)
                constraints.audio.deviceId = options.micDeviceId;
                // old style
                constraints.audio.optional.push({
                    sourceId: options.micDeviceId
                });
            }
            // if it is good enough for hangouts...
            constraints.audio.optional.push(
                {googEchoCancellation: true},
                {googAutoGainControl: true},
                {googNoiseSupression: true},
                {googHighpassFilter: true},
                {googNoisesuppression2: true},
                {googEchoCancellation2: true},
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
            GlobalOnErrorHandler.callErrorHandler(new Error(
                "'screen' WebRTC media source is supported only in Chrome" +
                " and with Temasys plugin"));
            logger.error(
                "'screen' WebRTC media source is supported only in Chrome" +
                " and with Temasys plugin");
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
            options.errorCallback(JitsiTrackErrors.parseError(error, devices));
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

        if (RTCUtils.isDeviceChangeAvailable('output') &&
            stream.getAudioTracks && stream.getAudioTracks().length) {
            element.setSinkId(RTCUtils.getAudioOutputDevice())
                .catch(function (ex) {
                    GlobalOnErrorHandler.callUnhandledRejectionHandler(
                        {promise: this, reason: ex});
                    logger.error('Failed to set audio output on element',
                        element, ex);
                });
        }

        return res;
    }
}

//Options parameter is to pass config options. Currently uses only "useIPv6".
var RTCUtils = {
    init: function (options) {
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
                    if (!element)
                        return;
                    element.mozSrcObject = stream;
                    element.play();

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
                this.getVideoSrc = function (element) {
                    if (!element)
                        return null;
                    return element.mozSrcObject;
                };
                this.setVideoSrc = function (element, src) {
                    if (element)
                        element.mozSrcObject = src;
                };
                RTCSessionDescription = mozRTCSessionDescription;
                RTCIceCandidate = mozRTCIceCandidate;
            } else if (RTCBrowserType.isChrome() || RTCBrowserType.isOpera() || RTCBrowserType.isNWJS()) {
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

                    // saves the created url for the stream, so we can reuse it
                    // and not keep creating urls
                    if (!stream.jitsiObjectURL) {
                        stream.jitsiObjectURL
                            = webkitURL.createObjectURL(stream);
                    }

                    element.src = stream.jitsiObjectURL;

                    return element;
                });
                this.getStreamID = function (stream) {
                    // Streams from FF endpoints have the characters '{' and '}'
                    // that make jQuery choke.
                    return SDPUtil.filter_special_chars(stream.id);
                };
                this.getVideoSrc = function (element) {
                    return element ? element.getAttribute("src") : null;
                };
                this.setVideoSrc = function (element, src) {
                    if (element)
                        element.setAttribute("src", src || '');
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
                AdapterJS.webRTCReady(function (isPlugin) {

                    self.peerconnection = RTCPeerConnection;
                    self.getUserMedia = window.getUserMedia;
                    self.enumerateDevices = enumerateDevicesThroughMediaStreamTrack;
                    self.attachMediaStream = wrapAttachMediaStream(function (element, stream) {

                        if (stream.id === "dummyAudio" || stream.id === "dummyVideo") {
                            return;
                        }

                        var isVideoStream = !!stream.getVideoTracks().length;
                        if (isVideoStream && !$(element).is(':visible')) {
                            throw new Error('video element must be visible to attach video stream');
                        }

                        return attachMediaStream(element, stream);
                    });
                    self.getStreamID = function (stream) {
                        return SDPUtil.filter_special_chars(stream.label);
                    };
                    self.getVideoSrc = function (element) {
                        if (!element) {
                            logger.warn("Attempt to get video SRC of null element");
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
                    self.setVideoSrc = function (element, src) {
                        //logger.info("Set video src: ", element, src);
                        if (!src) {
                            attachMediaStream(element, null);
                        } else {
                            AdapterJS.WebRTCPlugin.WaitForPluginReady();
                            var stream
                                = AdapterJS.WebRTCPlugin.plugin
                                    .getStreamWithId(
                                        AdapterJS.WebRTCPlugin.pageId, src);
                            attachMediaStream(element, stream);
                        }
                    };

                    onReady(options, self.getUserMediaWithConstraints);
                    resolve();
                });
            } else {
                try {
                    logger.error(
                        'Browser does not appear to be WebRTC-capable');
                } catch (e) {
                }
                reject(
                    new Error('Browser does not appear to be WebRTC-capable'));
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
                        failure_callback(error, resolution);
                    }
                });
        } catch (e) {
            logger.error('GUM failed: ', e);
            if (failure_callback) {
                failure_callback(e);
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
            if (RTCBrowserType.isFirefox() ||
                RTCBrowserType.isTemasysPluginUsed()) {
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
                            if((options.devices.indexOf("audio") !== -1 &&
                                !stream.getAudioTracks().length) ||
                                (options.devices.indexOf("video") !== -1 &&
                                !stream.getVideoTracks().length))
                            {
                                self.stopMediaStream(stream);
                                reject(JitsiTrackErrors.parseError(
                                    new Error("Unable to get the audio and " +
                                        "video tracks."),
                                    options.devices));
                                return;
                            }
                            if(hasDesktop) {
                                screenObtainer.obtainStream(
                                    function (desktopStream) {
                                        successCallback({audioVideo: stream,
                                            desktopStream: desktopStream});
                                    }, function (error) {
                                        self.stopMediaStream(stream);
                                        reject(
                                            JitsiTrackErrors.parseError(error,
                                                options.devices));
                                    });
                            } else {
                                successCallback({audioVideo: stream});
                            }
                        },
                        function (error) {
                            reject(JitsiTrackErrors.parseError(error,
                                options.devices));
                        },
                        options);
                } else if (hasDesktop) {
                    screenObtainer.obtainStream(
                        function (stream) {
                            successCallback({desktopStream: stream});
                        }, function (error) {
                            reject(
                                JitsiTrackErrors.parseError(error,
                                    ["desktop"]));
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
        if (mediaStream.jitsiObjectURL) {
            webkitURL.revokeObjectURL(mediaStream.jitsiObjectURL);
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
