/* global config, require, attachMediaStream, getUserMedia,
   RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, MediaStreamTrack,
   mozRTCPeerConnection, mozRTCSessionDescription, mozRTCIceCandidate,
   webkitRTCPeerConnection, webkitMediaStream, webkitURL
*/
/* jshint -W101, -W020 */

var logger = require("jitsi-meet-logger").getLogger(__filename);
var RTCBrowserType = require("./RTCBrowserType");
var Resolutions = require("../../service/RTC/Resolutions");
var RTCEvents = require("../../service/RTC/RTCEvents");
var AdapterJS = require("./adapter.screenshare");
var SDPUtil = require("../xmpp/SDPUtil");
var EventEmitter = require("events");
var screenObtainer = require("./ScreenObtainer");
var JitsiTrackErrors = require("../../JitsiTrackErrors");

var eventEmitter = new EventEmitter();

var devices = {
    audio: true,
    video: true
};

/**
 * Registry of physical audio and video devices.
 */
var enumeratedDevices = {
    audio: [],
    video: [],
    audiooutput: []
};

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
    if (options.fps) {
        // for some cameras it might be necessary to request 30fps
        // so they choose 30fps mjpg over 10fps yuy2
        if (!constraints.video) {
            // same behaviour as true;
            constraints.video = {mandatory: {}, optional: []};
        }
        constraints.video.mandatory.minFrameRate = options.fps;
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

// In case of IE we continue from 'onReady' callback
// passed to RTCUtils constructor. It will be invoked by Temasys plugin
// once it is initialized.
function onReady (options, GUM) {
    rtcReady = true;
    eventEmitter.emit(RTCEvents.RTC_READY, true);
    screenObtainer.init(options, GUM);
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

/**
 * Indicates support of "mediaDevices.enumerateDevices" feature.
 */
var isEnumerateDevicesAvailable = navigator.mediaDevices && navigator.mediaDevices.enumerateDevices;
/**
 * Indicates support of "MediaStreamTrack.getSources" feature.
 */
var isGetSourcesAvailable = MediaStreamTrack && MediaStreamTrack.getSources;
/**
 * Indicates support of "mediaDevices.ondevicechange" event.
 */
var isDeviceChangeEventAvailable = false; // FIXME noone support it


/**
 * Get list of devices using "mediaDevices.enumerateDevices".
 * @param {function(devices)} callback
 */
function enumerateDevices (callback) {
    navigator.mediaDevices.enumerateDevices().then(function (devices) {
        callback(devices);
    }, function (err) {
        logger.error('cannot enumerate devices: ', err);
        callback([]);
    });
}

/**
 * Use old MediaStreamTrack to get devices list and
 * convert it to enumerateDevices format.
 * @param {Function} callback function to call when received devices list.
 */
function enumerateDevicesThroughMediaStreamTrack (callback) {
    MediaStreamTrack.getSources(function (sources) {
        var devices = sources.map(function (source) {
            var kind = (source.kind || '').toLowerCase();
            return {
                facing: source.facing || null,
                label: source.label,
                kind: kind ? kind + 'input': null,
                deviceId: source.id,
                groupId: source.groupId || null
            };
        });

        callback(devices);
    });
}

/**
 * @const Device info properties which should be used to compare devices.
 */
var COMPARABLE_DEVICE_PROPERTIES = [
    'kind', 'deviceId', 'groupId', 'label', 'facing'
];

/**
 * Compare 2 devices infos and check if they are equal.
 * @param {object} deviceA
 * @param {object} deviceB
 * @returns {boolean} true if deviceA and deviceB describe same device.
 */
function isSameDevice (deviceA, deviceB) {
    for (var i = 0; i < COMPARABLE_DEVICE_PROPERTIES.length; i += 1) {
        var prop = COMPARABLE_DEVICE_PROPERTIES[i];

        if (deviceA[prop] !== deviceB[prop]) {
            return false;
        }
    }

    return true;
}

/**
 * Compare 2 arrays with device infos and check if they are equal.
 * @param {object[]} arrA
 * @param {object[]} arrB
 * @returns {boolean} true if arrays are equal.
 */
function isSameDevicesArray (arrA, arrB) {
    if (arrA.length !== arrB.length) {
        return false;
    }

    for (var i = 0; i < arrA.length; i += 1) {
        if (!isSameDevice(arrA[i], arrB[i])) {
            return false;
        }
    }

    return true;
}

/**
 * @const How often we should check if devices list changes.
 */
var DEVICES_POLL_INTERVAL_MS = 3000;

/**
 * Read list of available physical devices and compare it with previous one.
 * If list changed emit RTCEvents.DEVICES_LIST_CHANGED event.
 */
function updateAvailableDevices () {
    var getDevices;
    if (isEnumerateDevicesAvailable) {
        getDevices = enumerateDevices;
    } else if (isGetSourcesAvailable) {
        getDevices = enumerateDevicesThroughMediaStreamTrack;
    }

    if (!getDevices) {
        return;
    }

    getDevices(function (devices) {
        var updated = false;

        var newAudioDevices = devices.filter(function (device) {
            return device.kind === 'audioinput';
        });
        if (!isSameDevicesArray(enumeratedDevices.audio, newAudioDevices)) {
            enumeratedDevices.audio = newAudioDevices;
            updated = true;
        }

        var newVideoDevices = devices.filter(function (device) {
            return device.kind === 'videoinput';
        });
        if (!isSameDevicesArray(enumeratedDevices.video, newVideoDevices)) {
            enumeratedDevices.video = newVideoDevices;
            updated = true;
        }

        var newAudioOutputDevices = devices.filter(function (device) {
            return device.kind === 'audiooutput';
        });
        if (!isSameDevicesArray(enumeratedDevices.audiooutput, newAudioOutputDevices)) {
            enumeratedDevices.audiooutput = newAudioOutputDevices;
            updated = true;
        }

        if (updated) {
            eventEmitter.emit(RTCEvents.DEVICES_LIST_CHANGED);
        }
    });
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
    // If this is FF, the stream parameter is *not* a MediaStream object, it's
    // an object with two properties: audioStream, videoStream.
    if (window.webkitMediaStream) {
        var audioVideo = streams.audioVideo;
        if (audioVideo) {
            var audioTracks = audioVideo.getAudioTracks();
            if(audioTracks.length) {
                audioStream = new webkitMediaStream();
                for (var i = 0; i < audioTracks.length; i++) {
                    audioStream.addTrack(audioTracks[i]);
                }
            }

            var videoTracks = audioVideo.getVideoTracks();
            if(videoTracks.length) {
                videoStream = new webkitMediaStream();
                for (var j = 0; j < videoTracks.length; j++) {
                    videoStream.addTrack(videoTracks[j]);
                }
            }
        }

        if (streams && streams.desktopStream)
            desktopStream = streams.desktopStream;

    }
    else if (RTCBrowserType.isFirefox() || RTCBrowserType.isTemasysPluginUsed()) {   // Firefox and Temasys plugin
        if (streams && streams.audio)
            audioStream = streams.audio;

        if (streams && streams.video)
            videoStream = streams.video;

        if(streams && streams.desktop)
            desktopStream = streams.desktop;
    }

    if (desktopStream)
        res.push({stream: desktopStream,
            type: "video", videoType: "desktop"});

    if(audioStream)
        res.push({stream: audioStream, type: "audio", videoType: null});

    if(videoStream)
        res.push({stream: videoStream, type: "video", videoType: "camera",
            resolution: resolution});

    return res;
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
                this.getUserMedia = navigator.mozGetUserMedia.bind(navigator);
                this.pc_constraints = {};
                this.attachMediaStream = function (element, stream) {
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
                };
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
                this.getUserMedia = navigator.webkitGetUserMedia.bind(navigator);

                this.attachMediaStream = function (element, stream) {

                    // saves the created url for the stream, so we can reuse it
                    // and not keep creating urls
                    if (!stream.jitsiObjectURL) {
                        stream.jitsiObjectURL
                            = webkitURL.createObjectURL(stream);
                    }

                    element.src = stream.jitsiObjectURL;

                    return element;
                };
                this.getStreamID = function (stream) {
                    // streams from FF endpoints have the characters '{' and '}'
                    // that make jQuery choke.
                    return SDPUtil.filter_special_chars(stream.id);
                };
                this.getVideoSrc = function (element) {
                    if (!element)
                        return null;
                    return element.getAttribute("src");
                };
                this.setVideoSrc = function (element, src) {
                    if (!src) {
                        src = '';
                    }
                    if (element)
                        element.setAttribute("src", src);
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
                    self.attachMediaStream = function (element, stream) {

                        if (stream.id === "dummyAudio" || stream.id === "dummyVideo") {
                            return;
                        }

                        var isVideoStream = !!stream.getVideoTracks().length;
                        if (isVideoStream && !$(element).is(':visible')) {
                            throw new Error('video element must be visible to attach video stream');
                        }

                        return attachMediaStream(element, stream);
                    };
                    self.getStreamID = function (stream) {
                        var id = SDPUtil.filter_special_chars(stream.label);
                        return id;
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
                    logger.error('Browser does not appear to be WebRTC-capable');
                } catch (e) {
                }
                reject('Browser does not appear to be WebRTC-capable');
                return;
            }

            // Call onReady() if Temasys plugin is not used
            if (!RTCBrowserType.isTemasysPluginUsed()) {
                onReady(options, this.getUserMediaWithConstraints);
                resolve();
            }
        }.bind(this)).then(function () {
            // monitor list of available physical devices
            // if that's possible

            if (isEnumerateDevicesAvailable) {

                // wrap getUserMedia so we can start monitoring available
                // devices after first getUserMedia call
                var getUserMedia = RTCUtils.getUserMedia;
                var initialized = false;
                this.getUserMedia = function (constraints, success, error) {
                    getUserMedia(constraints, function (stream) {
                        if (!initialized) {
                            initialized = true;

                            // update available devices
                            updateAvailableDevices();

                            // and monitor devices list changes
                            if (isDeviceChangeEventAvailable) {
                                navigator.mediaDevices.ondevicechange = updateAvailableDevices;
                            } else {
                                window.setInterval(updateAvailableDevices, DEVICES_POLL_INTERVAL_MS);
                            }
                        }

                        success(stream);
                    }, function (e) {
                        maybeApply(error, [e]);
                    });
                };

            } else if (isGetSourcesAvailable) {
                updateAvailableDevices();
                window.setInterval(updateAvailableDevices, DEVICES_POLL_INTERVAL_MS);
            } else {
                logger.info("Cannot retrieve list of devices");
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
                    logger.warn('Failed to get access to local media. Error ', error, constraints);

                    setAvailableDevices(um, false);
                    maybeApply(failure_callback, [error, resolution]);
                });
        } catch (e) {
            logger.error('GUM failed: ', e);
            maybeApply(failure_callback, [e]);
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
                    deviceGUM.desktop = screenObtainer.obtainStream.bind(screenObtainer);
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

    getDevicesList: function () {
        return enumeratedDevices;
    }
};

module.exports = RTCUtils;
