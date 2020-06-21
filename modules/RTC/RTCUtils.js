/* global
          __filename,
          MediaStreamTrack,
          RTCIceCandidate: true,
          RTCPeerConnection,
          RTCSessionDescription: true
*/

import { AVAILABLE_DEVICE } from '../../service/statistics/AnalyticsEvents';
import CameraFacingMode from '../../service/RTC/CameraFacingMode';
import EventEmitter from 'events';
import { getLogger } from 'jitsi-meet-logger';
import GlobalOnErrorHandler from '../util/GlobalOnErrorHandler';
import JitsiTrackError from '../../JitsiTrackError';
import Listenable from '../util/Listenable';
import * as MediaType from '../../service/RTC/MediaType';
import Resolutions from '../../service/RTC/Resolutions';
import browser from '../browser';
import RTCEvents from '../../service/RTC/RTCEvents';
import screenObtainer from './ScreenObtainer';
import SDPUtil from '../xmpp/SDPUtil';
import Statistics from '../statistics/statistics';
import VideoType from '../../service/RTC/VideoType';

const logger = getLogger(__filename);

// Require adapter only for certain browsers. This is being done for
// react-native, which has its own shims, and while browsers are being migrated
// over to use adapter's shims.
if (browser.usesAdapter()) {
    require('webrtc-adapter');
}

const eventEmitter = new EventEmitter();

const AVAILABLE_DEVICES_POLL_INTERVAL_TIME = 3000; // ms

/**
 * Default resolution to obtain for video tracks if no resolution is specified.
 * This default is used for old gum flow only, as new gum flow uses
 * {@link DEFAULT_CONSTRAINTS}.
 */
const OLD_GUM_DEFAULT_RESOLUTION = 720;

/**
 * Default devices to obtain when no specific devices are specified. This
 * default is used for old gum flow only.
 */
const OLD_GUM_DEFAULT_DEVICES = [ 'audio', 'video' ];

/**
 * Default MediaStreamConstraints to use for calls to getUserMedia.
 *
 * @private
 */
const DEFAULT_CONSTRAINTS = {
    video: {
        height: {
            ideal: 720,
            max: 720,
            min: 240
        }
    }
};

/**
 * The default frame rate for Screen Sharing.
 */
const SS_DEFAULT_FRAME_RATE = 5;

// Currently audio output device change is supported only in Chrome and
// default output always has 'default' device ID
let audioOutputDeviceId = 'default'; // default device
// whether user has explicitly set a device to use
let audioOutputChanged = false;

// Disables all audio processing
let disableAP = false;

// Disables Acoustic Echo Cancellation
let disableAEC = false;

// Disables Noise Suppression
let disableNS = false;

// Disables Automatic Gain Control
let disableAGC = false;

// Disables Highpass Filter
let disableHPF = false;

const featureDetectionAudioEl = document.createElement('audio');
const isAudioOutputDeviceChangeAvailable
    = typeof featureDetectionAudioEl.setSinkId !== 'undefined';

let availableDevices;
let availableDevicesPollTimer;

/**
 * Initialize wrapper function for enumerating devices.
 * TODO: remove this, it should no longer be needed.
 *
 * @returns {?Function}
 */
function initEnumerateDevicesWithCallback() {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        return callback => {
            navigator.mediaDevices.enumerateDevices()
                .then(callback, () => callback([]));
        };
    }
}

/**
 *
 * @param constraints
 * @param isNewStyleConstraintsSupported
 * @param resolution
 */
function setResolutionConstraints(
        constraints,
        isNewStyleConstraintsSupported,
        resolution) {
    if (Resolutions[resolution]) {
        if (isNewStyleConstraintsSupported) {
            constraints.video.width = {
                ideal: Resolutions[resolution].width
            };
            constraints.video.height = {
                ideal: Resolutions[resolution].height
            };
        }

        constraints.video.mandatory.minWidth = Resolutions[resolution].width;
        constraints.video.mandatory.minHeight = Resolutions[resolution].height;
    }

    if (constraints.video.mandatory.minWidth) {
        constraints.video.mandatory.maxWidth
            = constraints.video.mandatory.minWidth;
    }

    if (constraints.video.mandatory.minHeight) {
        constraints.video.mandatory.maxHeight
            = constraints.video.mandatory.minHeight;
    }
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
 * @param {Object} options.frameRate - used only for dekstop sharing.
 * @param {Object} options.frameRate.min - Minimum fps
 * @param {Object} options.frameRate.max - Maximum fps
 * @param {bool}   options.screenShareAudio - Used by electron clients to
 * enable system audio screen sharing.
 */
function getConstraints(um, options = {}) {
    const constraints = {
        audio: false,
        video: false
    };

    // Don't mix new and old style settings for Chromium as this leads
    // to TypeError in new Chromium versions. @see
    // https://bugs.chromium.org/p/chromium/issues/detail?id=614716
    // This is a temporary solution, in future we will fully split old and
    // new style constraints when new versions of Chromium and Firefox will
    // have stable support of new constraints format. For more information
    // @see https://github.com/jitsi/lib-jitsi-meet/pull/136
    const isNewStyleConstraintsSupported
        = browser.isFirefox()
            || browser.isSafari()
            || browser.isReactNative();

    if (um.indexOf('video') >= 0) {
        // same behaviour as true
        constraints.video = { mandatory: {},
            optional: [] };

        if (options.cameraDeviceId) {
            if (isNewStyleConstraintsSupported) {
                // New style of setting device id.
                constraints.video.deviceId = options.cameraDeviceId;
            }

            // Old style.
            constraints.video.mandatory.sourceId = options.cameraDeviceId;
        } else {
            // Prefer the front i.e. user-facing camera (to the back i.e.
            // environment-facing camera, for example).
            // TODO: Maybe use "exact" syntax if options.facingMode is defined,
            // but this probably needs to be decided when updating other
            // constraints, as we currently don't use "exact" syntax anywhere.
            const facingMode = options.facingMode || CameraFacingMode.USER;

            if (isNewStyleConstraintsSupported) {
                constraints.video.facingMode = facingMode;
            }
            constraints.video.optional.push({
                facingMode
            });
        }

        if (options.minFps || options.maxFps || options.fps) {
            // for some cameras it might be necessary to request 30fps
            // so they choose 30fps mjpg over 10fps yuy2
            if (options.minFps || options.fps) {
                // Fall back to options.fps for backwards compatibility
                options.minFps = options.minFps || options.fps;
                constraints.video.mandatory.minFrameRate = options.minFps;
            }
            if (options.maxFps) {
                constraints.video.mandatory.maxFrameRate = options.maxFps;
            }
        }

        setResolutionConstraints(
            constraints, isNewStyleConstraintsSupported, options.resolution);
    }
    if (um.indexOf('audio') >= 0) {
        if (browser.isReactNative()) {
            // The react-native-webrtc project that we're currently using
            // expects the audio constraint to be a boolean.
            constraints.audio = true;
        } else if (browser.isFirefox()) {
            if (options.micDeviceId) {
                constraints.audio = {
                    mandatory: {},
                    deviceId: options.micDeviceId, // new style
                    optional: [ {
                        sourceId: options.micDeviceId // old style
                    } ] };
            } else {
                constraints.audio = true;
            }
        } else {
            // same behaviour as true
            constraints.audio = { mandatory: {},
                optional: [] };
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
                { echoCancellation: !disableAEC && !disableAP },
                { googEchoCancellation: !disableAEC && !disableAP },
                { googAutoGainControl: !disableAGC && !disableAP },
                { googNoiseSuppression: !disableNS && !disableAP },
                { googHighpassFilter: !disableHPF && !disableAP },
                { googNoiseSuppression2: !disableNS && !disableAP },
                { googEchoCancellation2: !disableAEC && !disableAP },
                { googAutoGainControl2: !disableAGC && !disableAP }
            );
        }
    }
    if (um.indexOf('screen') >= 0) {
        if (browser.isChrome()) {
            constraints.video = {
                mandatory: getSSConstraints({
                    ...options,
                    source: 'screen'
                }),
                optional: []
            };

        } else if (browser.isFirefox()) {
            constraints.video = {
                mozMediaSource: 'window',
                mediaSource: 'window',
                frameRate: options.frameRate || {
                    min: SS_DEFAULT_FRAME_RATE,
                    max: SS_DEFAULT_FRAME_RATE
                }
            };

        } else {
            const errmsg
                = '\'screen\' WebRTC media source is supported only in Chrome'
                    + ' and Firefox';

            GlobalOnErrorHandler.callErrorHandler(new Error(errmsg));
            logger.error(errmsg);
        }
    }
    if (um.indexOf('desktop') >= 0) {
        constraints.video = {
            mandatory: getSSConstraints({
                ...options,
                source: 'desktop'
            }),
            optional: []
        };

        // Audio screen sharing for electron only works for screen type devices.
        // i.e. when the user shares the whole desktop.
        if (browser.isElectron() && options.screenShareAudio
            && (options.desktopStream.indexOf('screen') >= 0)) {

            // Provide constraints as described by the electron desktop capturer
            // documentation here:
            // https://www.electronjs.org/docs/api/desktop-capturer
            constraints.audio = { mandatory: {
                chromeMediaSource: constraints.video.mandatory.chromeMediaSource
            } };

            delete constraints.video.mandatory.chromeMediaSourceId;
        }
    }

    if (options.bandwidth) {
        if (!constraints.video) {
            // same behaviour as true
            constraints.video = { mandatory: {},
                optional: [] };
        }
        constraints.video.optional.push({ bandwidth: options.bandwidth });
    }

    // we turn audio for both audio and video tracks, the fake audio & video
    // seems to work only when enabled in one getUserMedia call, we cannot get
    // fake audio separate by fake video this later can be a problem with some
    // of the tests
    if (browser.isFirefox() && options.firefox_fake_device) {
        // seems to be fixed now, removing this experimental fix, as having
        // multiple audio tracks brake the tests
        // constraints.audio = true;
        constraints.fake = true;
    }

    return constraints;
}

/**
 * Creates a constraints object to be passed into a call to getUserMedia.
 *
 * @param {Array} um - An array of user media types to get. The accepted
 * types are "video", "audio", and "desktop."
 * @param {Object} options - Various values to be added to the constraints.
 * @param {string} options.cameraDeviceId - The device id for the video
 * capture device to get video from.
 * @param {Object} options.constraints - Default constraints object to use
 * as a base for the returned constraints.
 * @param {Object} options.desktopStream - The desktop source id from which
 * to capture a desktop sharing video.
 * @param {string} options.facingMode - Which direction the camera is
 * pointing to.
 * @param {string} options.micDeviceId - The device id for the audio capture
 * device to get audio from.
 * @param {Object} options.frameRate - used only for dekstop sharing.
 * @param {Object} options.frameRate.min - Minimum fps
 * @param {Object} options.frameRate.max - Maximum fps
 * @private
 * @returns {Object}
 */
function newGetConstraints(um = [], options = {}) {
    // Create a deep copy of the constraints to avoid any modification of
    // the passed in constraints object.
    const constraints = JSON.parse(JSON.stringify(
        options.constraints || DEFAULT_CONSTRAINTS));

    if (um.indexOf('video') >= 0) {
        if (!constraints.video) {
            constraints.video = {};
        }

        if (options.cameraDeviceId) {
            constraints.video.deviceId = options.cameraDeviceId;
        } else {
            const facingMode = options.facingMode || CameraFacingMode.USER;

            constraints.video.facingMode = facingMode;
        }
    } else {
        constraints.video = false;
    }

    if (um.indexOf('audio') >= 0) {
        if (!constraints.audio || typeof constraints.audio === 'boolean') {
            constraints.audio = {};
        }

        // Use the standard audio constraints on non-chromium browsers.
        if (browser.isFirefox() || browser.isSafari()) {
            constraints.audio = {
                deviceId: options.micDeviceId,
                autoGainControl: !disableAGC && !disableAP,
                echoCancellation: !disableAEC && !disableAP,
                noiseSuppression: !disableNS && !disableAP
            };
        } else {
            // NOTE(brian): the new-style ('advanced' instead of 'optional')
            // doesn't seem to carry through the googXXX constraints
            // Changing back to 'optional' here (even with video using
            // the 'advanced' style) allows them to be passed through
            // but also requires the device id to capture to be set in optional
            // as sourceId otherwise the constraints are considered malformed.
            if (!constraints.audio.optional) {
                constraints.audio.optional = [];
            }
            constraints.audio.optional.push(
                { sourceId: options.micDeviceId },
                { echoCancellation: !disableAEC && !disableAP },
                { googEchoCancellation: !disableAEC && !disableAP },
                { googAutoGainControl: !disableAGC && !disableAP },
                { googNoiseSuppression: !disableNS && !disableAP },
                { googHighpassFilter: !disableHPF && !disableAP },
                { googNoiseSuppression2: !disableNS && !disableAP },
                { googEchoCancellation2: !disableAEC && !disableAP },
                { googAutoGainControl2: !disableAGC && !disableAP }
            );
        }
    } else {
        constraints.audio = false;
    }

    if (um.indexOf('desktop') >= 0) {
        if (!constraints.video || typeof constraints.video === 'boolean') {
            constraints.video = {};
        }

        constraints.video = {
            mandatory: getSSConstraints({
                ...options,
                source: 'desktop'
            })
        };
    }

    return constraints;
}

/**
 * Generates GUM constraints for screen sharing.
 *
 * @param {Object} options - The options passed to
 * <tt>obtainAudioAndVideoPermissions</tt>.
 * @returns {Object} - GUM constraints.
 *
 * TODO: Currently only the new GUM flow and Chrome is using the method. We
 * should make it work for all use cases.
 */
function getSSConstraints(options = {}) {
    const {
        desktopStream,
        frameRate = {
            min: SS_DEFAULT_FRAME_RATE,
            max: SS_DEFAULT_FRAME_RATE
        }
    } = options;
    const { max, min } = frameRate;

    const constraints = {
        chromeMediaSource: options.source,
        maxWidth: window.screen.width,
        maxHeight: window.screen.height
    };

    if (typeof min === 'number') {
        constraints.minFrameRate = min;
    }

    if (typeof max === 'number') {
        constraints.maxFrameRate = max;
    }

    if (typeof desktopStream !== 'undefined') {
        constraints.chromeMediaSourceId = desktopStream;
    }

    return constraints;
}

/**
 * Generates constraints for screen sharing when using getDisplayMedia.
 * The constraints(MediaTrackConstraints) are applied to the resulting track.
 *
 * @returns {Object} - MediaTrackConstraints constraints.
 */
function getTrackSSConstraints(options = {}) {
    // we used to set height and width in the constraints, but this can lead
    // to inconsistencies if the browser is on a lower resolution screen
    // and we share a screen with bigger resolution, so they are now not set
    const constraints = {
        frameRate: SS_DEFAULT_FRAME_RATE
    };
    const { desktopSharingFrameRate } = options;

    if (desktopSharingFrameRate && desktopSharingFrameRate.max) {
        constraints.frameRate = desktopSharingFrameRate.max;
    }

    return constraints;
}

/**
 * Updates the granted permissions based on the options we requested and the
 * streams we received.
 * @param um the options we requested to getUserMedia.
 * @param stream the stream we received from calling getUserMedia.
 */
function updateGrantedPermissions(um, stream) {
    const audioTracksReceived
        = Boolean(stream) && stream.getAudioTracks().length > 0;
    const videoTracksReceived
        = Boolean(stream) && stream.getVideoTracks().length > 0;
    const grantedPermissions = {};

    if (um.indexOf('video') !== -1) {
        grantedPermissions.video = videoTracksReceived;
    }
    if (um.indexOf('audio') !== -1) {
        grantedPermissions.audio = audioTracksReceived;
    }

    eventEmitter.emit(RTCEvents.GRANTED_PERMISSIONS, grantedPermissions);
}

/**
 * Checks if new list of available media devices differs from previous one.
 * @param {MediaDeviceInfo[]} newDevices - list of new devices.
 * @returns {boolean} - true if list is different, false otherwise.
 */
function compareAvailableMediaDevices(newDevices) {
    if (newDevices.length !== availableDevices.length) {
        return true;
    }

    /* eslint-disable newline-per-chained-call */

    return (
        newDevices.map(mediaDeviceInfoToJSON).sort().join('')
            !== availableDevices
                .map(mediaDeviceInfoToJSON).sort().join(''));

    /* eslint-enable newline-per-chained-call */

    /**
     *
     * @param info
     */
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
 * Sends analytics event with the passed device list.
 *
 * @param {Array<MediaDeviceInfo>} deviceList - List with info about the
 * available devices.
 * @returns {void}
 */
function sendDeviceListToAnalytics(deviceList) {
    const audioInputDeviceCount
        = deviceList.filter(d => d.kind === 'audioinput').length;
    const audioOutputDeviceCount
        = deviceList.filter(d => d.kind === 'audiooutput').length;
    const videoInputDeviceCount
        = deviceList.filter(d => d.kind === 'videoinput').length;
    const videoOutputDeviceCount
        = deviceList.filter(d => d.kind === 'videooutput').length;

    deviceList.forEach(device => {
        const attributes = {
            'audio_input_device_count': audioInputDeviceCount,
            'audio_output_device_count': audioOutputDeviceCount,
            'video_input_device_count': videoInputDeviceCount,
            'video_output_device_count': videoOutputDeviceCount,
            'device_id': device.deviceId,
            'device_group_id': device.groupId,
            'device_kind': device.kind,
            'device_label': device.label
        };

        Statistics.sendAnalytics(AVAILABLE_DEVICE, attributes);
    });
}

/**
 * Event handler for the 'devicechange' event.
 *
 * @param {MediaDeviceInfo[]} devices - list of media devices.
 * @emits RTCEvents.DEVICE_LIST_CHANGED
 */
function onMediaDevicesListChanged(devicesReceived) {
    availableDevices = devicesReceived.slice(0);
    logger.info(
        'list of media devices has changed:',
        availableDevices);

    sendDeviceListToAnalytics(availableDevices);

    // Used by tracks to update the real device id before the consumer of lib-jitsi-meet receives the new device list.
    eventEmitter.emit(RTCEvents.DEVICE_LIST_WILL_CHANGE, devicesReceived);

    eventEmitter.emit(RTCEvents.DEVICE_LIST_CHANGED, devicesReceived);
}

/**
 * Handles the newly created Media Streams.
 * @param streams the new Media Streams
 * @param resolution the resolution of the video streams
 * @returns {*[]} object that describes the new streams
 */
function handleLocalStream(streams, resolution) {
    let audioStream, desktopStream, videoStream;
    const res = [];

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
        const audioVideo = streams.audioVideo;

        if (audioVideo) {
            const audioTracks = audioVideo.getAudioTracks();

            if (audioTracks.length) {
                audioStream = new MediaStream();
                for (let i = 0; i < audioTracks.length; i++) {
                    audioStream.addTrack(audioTracks[i]);
                }
            }

            const videoTracks = audioVideo.getVideoTracks();

            if (videoTracks.length) {
                videoStream = new MediaStream();
                for (let j = 0; j < videoTracks.length; j++) {
                    videoStream.addTrack(videoTracks[j]);
                }
            }
        } else {
            // On other types of browser (e.g. Firefox) we choose (namely,
            // obtainAudioAndVideoPermissions) to call getUserMedia per device
            // (type).
            audioStream = streams.audio;
            videoStream = streams.video;
        }

        desktopStream = streams.desktop;
    }

    if (desktopStream) {
        const { stream, sourceId, sourceType } = desktopStream;

        res.push({
            stream,
            sourceId,
            sourceType,
            track: stream.getVideoTracks()[0],
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
            resolution
        });
    }

    return res;
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
    let srcObjectPropertyName = 'srcObject';

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
    let src;

    if (stream) {
        src = stream.jitsiObjectURL;

        // Save the created URL for stream so we can reuse it and not keep
        // creating URLs.
        if (!src) {
            stream.jitsiObjectURL = src = URL.createObjectURL(stream);
        }
    }
    element.src = src || '';
}

/**
 *
 */
class RTCUtils extends Listenable {
    /**
     *
     */
    constructor() {
        super(eventEmitter);
    }

    /**
     * Depending on the browser, sets difference instance methods for
     * interacting with user media and adds methods to native WebRTC-related
     * objects. Also creates an instance variable for peer connection
     * constraints.
     *
     * @param {Object} options
     * @returns {void}
     */
    init(options = {}) {
        if (typeof options.disableAEC === 'boolean') {
            disableAEC = options.disableAEC;
            logger.info(`Disable AEC: ${disableAEC}`);
        }
        if (typeof options.disableNS === 'boolean') {
            disableNS = options.disableNS;
            logger.info(`Disable NS: ${disableNS}`);
        }
        if (typeof options.disableAP === 'boolean') {
            disableAP = options.disableAP;
            logger.info(`Disable AP: ${disableAP}`);
        }
        if (typeof options.disableAGC === 'boolean') {
            disableAGC = options.disableAGC;
            logger.info(`Disable AGC: ${disableAGC}`);
        }
        if (typeof options.disableHPF === 'boolean') {
            disableHPF = options.disableHPF;
            logger.info(`Disable HPF: ${disableHPF}`);
        }

        availableDevices = undefined;
        window.clearInterval(availableDevicesPollTimer);
        availableDevicesPollTimer = undefined;

        this.enumerateDevices = initEnumerateDevicesWithCallback();

        if (browser.usesNewGumFlow()) {
            this.RTCPeerConnectionType = RTCPeerConnection;

            this.attachMediaStream
                = wrapAttachMediaStream((element, stream) => {
                    if (element) {
                        element.srcObject = stream;
                    }
                });

            this.getStreamID = ({ id }) => id;
            this.getTrackID = ({ id }) => id;
        } else if (browser.isChromiumBased() // this is chrome < 61
                || browser.isReactNative()) {

            this.RTCPeerConnectionType = RTCPeerConnection;

            this.attachMediaStream
                = wrapAttachMediaStream((element, stream) => {
                    defaultSetVideoSrc(element, stream);

                    return element;
                });

            this.getStreamID = function({ id }) {
                // A. MediaStreams from FF endpoints have the characters '{' and
                // '}' that make jQuery choke.
                // B. The react-native-webrtc implementation that we use at the
                // time of this writing returns a number for the id of
                // MediaStream. Let's just say that a number contains no special
                // characters.
                return (
                    typeof id === 'number'
                        ? id
                        : SDPUtil.filterSpecialChars(id));
            };
            this.getTrackID = ({ id }) => id;

            if (!MediaStream.prototype.getVideoTracks) {
                MediaStream.prototype.getVideoTracks = function() {
                    return this.videoTracks;
                };
            }
            if (!MediaStream.prototype.getAudioTracks) {
                MediaStream.prototype.getAudioTracks = function() {
                    return this.audioTracks;
                };
            }
        } else {
            const message = 'Endpoint does not appear to be WebRTC-capable';

            logger.error(message);
            throw new Error(message);
        }

        this._initPCConstraints();

        screenObtainer.init(
            options,
            this.getUserMediaWithConstraints.bind(this));

        if (this.isDeviceListAvailable()) {
            this.enumerateDevices(ds => {
                availableDevices = ds.splice(0);

                logger.debug('Available devices: ', availableDevices);
                sendDeviceListToAnalytics(availableDevices);

                eventEmitter.emit(
                    RTCEvents.DEVICE_LIST_AVAILABLE,
                    availableDevices);


                // Use a shared callback to handle both the devicechange event
                // and the polling implementations. This prevents duplication
                // and works around a chrome bug (verified to occur on 68) where
                // devicechange fires twice in a row, which can cause async post
                // devicechange processing to collide.
                const updateKnownDevices = () => this.enumerateDevices(pds => {
                    if (compareAvailableMediaDevices(pds)) {
                        onMediaDevicesListChanged(pds);
                    }
                });

                if (browser.supportsDeviceChangeEvent()) {
                    navigator.mediaDevices.addEventListener(
                        'devicechange',
                        updateKnownDevices);
                } else {
                    // Periodically poll enumerateDevices() method to check if
                    // list of media devices has changed.
                    availableDevicesPollTimer = window.setInterval(
                        updateKnownDevices,
                        AVAILABLE_DEVICES_POLL_INTERVAL_TIME);
                }
            });
        }
    }

    /**
     * Creates instance objects for peer connection constraints both for p2p
     * and outside of p2p.
     */
    _initPCConstraints() {
        if (browser.isFirefox()) {
            this.pcConstraints = {};
        } else if (browser.isChromiumBased() || browser.isReactNative()) {
            this.pcConstraints = { optional: [
                { googHighStartBitrate: 0 },
                { googPayloadPadding: true },
                { googScreencastMinBitrate: 100 },
                { googCpuOveruseDetection: true },
                { googCpuOveruseEncodeUsage: true },
                { googCpuUnderuseThreshold: 55 },
                { googCpuOveruseThreshold: 85 }
            ] };

            this.p2pPcConstraints
                = JSON.parse(JSON.stringify(this.pcConstraints));
        }

        this.p2pPcConstraints = this.p2pPcConstraints || this.pcConstraints;
    }

    /* eslint-disable max-params */

    /**
    * @param {string[]} um required user media types
    * @param {Object} [options] optional parameters
    * @param {string} options.resolution
    * @param {number} options.bandwidth
    * @param {number} options.fps
    * @param {string} options.desktopStream
    * @param {string} options.cameraDeviceId
    * @param {string} options.micDeviceId
    * @param {Object} options.frameRate - used only for dekstop sharing.
    * @param {Object} options.frameRate.min - Minimum fps
    * @param {Object} options.frameRate.max - Maximum fps
    * @param {bool}   options.screenShareAudio - Used by electron clients to
    * enable system audio screen sharing.
    * @returns {Promise} Returns a media stream on success or a JitsiTrackError
    * on failure.
    **/
    getUserMediaWithConstraints(um, options = {}) {
        const constraints = getConstraints(um, options);

        logger.info('Get media constraints', constraints);

        return new Promise((resolve, reject) => {
            navigator.mediaDevices.getUserMedia(constraints)
            .then(stream => {
                logger.log('onUserMediaSuccess');
                updateGrantedPermissions(um, stream);
                resolve(stream);
            })
            .catch(error => {
                logger.warn('Failed to get access to local media. '
                    + ` ${error} ${constraints} `);
                updateGrantedPermissions(um, undefined);
                reject(new JitsiTrackError(error, constraints, um));
            });
        });
    }

    /**
     * Acquires a media stream via getUserMedia that
     * matches the given constraints
     *
     * @param {array} umDevices which devices to acquire (e.g. audio, video)
     * @param {Object} constraints - Stream specifications to use.
     * @returns {Promise}
     */
    _newGetUserMediaWithConstraints(umDevices, constraints = {}) {
        return new Promise((resolve, reject) => {
            navigator.mediaDevices.getUserMedia(constraints)
                .then(stream => {
                    logger.log('onUserMediaSuccess');
                    updateGrantedPermissions(umDevices, stream);
                    resolve(stream);
                })
                .catch(error => {
                    logger.warn('Failed to get access to local media. '
                        + ` ${error} ${constraints} `);
                    updateGrantedPermissions(umDevices, undefined);
                    reject(new JitsiTrackError(error, constraints, umDevices));
                });
        });
    }

    /**
     * Acquire a display stream via the screenObtainer. This requires extra
     * logic compared to use screenObtainer versus normal device capture logic
     * in RTCUtils#_newGetUserMediaWithConstraints.
     *
     * @param {Object} options
     * @param {string[]} options.desktopSharingSources
     * @param {Object} options.desktopSharingFrameRate
     * @param {Object} options.desktopSharingFrameRate.min - Minimum fps
     * @param {Object} options.desktopSharingFrameRate.max - Maximum fps
     * @returns {Promise} A promise which will be resolved with an object which
     * contains the acquired display stream. If desktop sharing is not supported
     * then a rejected promise will be returned.
     */
    _newGetDesktopMedia(options) {
        if (!screenObtainer.isSupported() || !browser.supportsVideo()) {
            return Promise.reject(
                new Error('Desktop sharing is not supported!'));
        }

        return new Promise((resolve, reject) => {
            screenObtainer.obtainStream(
                this._parseDesktopSharingOptions(options),
                stream => {
                    resolve(stream);
                },
                error => {
                    reject(error);
                });
        });
    }

    /* eslint-enable max-params */

    /**
     * Creates the local MediaStreams.
     * @param {Object} [options] optional parameters
     * @param {Array} options.devices the devices that will be requested
     * @param {string} options.resolution resolution constraints
     * @param {string} options.cameraDeviceId
     * @param {string} options.micDeviceId
     * @param {Object} options.desktopSharingFrameRate
     * @param {Object} options.desktopSharingFrameRate.min - Minimum fps
     * @param {Object} options.desktopSharingFrameRate.max - Maximum fps
     * @returns {*} Promise object that will receive the new JitsiTracks
     */
    obtainAudioAndVideoPermissions(options = {}) {
        options.devices = options.devices || [ ...OLD_GUM_DEFAULT_DEVICES ];
        options.resolution = options.resolution || OLD_GUM_DEFAULT_RESOLUTION;

        const requestingDesktop = options.devices.includes('desktop');

        if (requestingDesktop && !screenObtainer.isSupported()) {
            return Promise.reject(
                new Error('Desktop sharing is not supported!'));
        }

        return this._getAudioAndVideoStreams(options).then(streams =>
            handleLocalStream(streams, options.resolution));
    }

    /**
     * Performs one call to getUserMedia for audio and/or video and another call
     * for desktop.
     *
     * @param {Object} options - An object describing how the gUM request should
     * be executed. See {@link obtainAudioAndVideoPermissions} for full options.
     * @returns {*} Promise object that will receive the new JitsiTracks on
     * success or a JitsiTrackError on failure.
     */
    _getAudioAndVideoStreams(options) {
        const requestingDesktop = options.devices.includes('desktop');

        options.devices = options.devices.filter(device =>
            device !== 'desktop');

        const gumPromise = options.devices.length
            ? this.getUserMediaWithConstraints(options.devices, options)
            : Promise.resolve(null);

        return gumPromise
            .then(avStream => {
                // If any requested devices are missing, call gum again in
                // an attempt to obtain the actual error. For example, the
                // requested video device is missing or permission was
                // denied.
                const missingTracks
                    = this._getMissingTracks(options.devices, avStream);

                if (missingTracks.length) {
                    this.stopMediaStream(avStream);

                    return this.getUserMediaWithConstraints(
                        missingTracks, options)

                        // GUM has already failed earlier and this success
                        // handling should not be reached.
                        .then(() => Promise.reject(new JitsiTrackError(
                            { name: 'UnknownError' },
                            getConstraints(options.devices, options),
                            missingTracks)));
                }

                return avStream;
            })
            .then(audioVideo => {
                if (!requestingDesktop) {
                    return { audioVideo };
                }

                if (options.desktopSharingSourceDevice) {
                    this.stopMediaStream(audioVideo);

                    throw new Error('Using a camera as screenshare source is'
                        + 'not supported on this browser.');
                }

                return new Promise((resolve, reject) => {
                    screenObtainer.obtainStream(
                        this._parseDesktopSharingOptions(options),
                        desktop => resolve({
                            audioVideo,
                            desktop
                        }),
                        error => {
                            if (audioVideo) {
                                this.stopMediaStream(audioVideo);
                            }
                            reject(error);
                        });
                });
            });
    }

    /**
     * Private utility for determining if the passed in MediaStream contains
     * tracks of the type(s) specified in the requested devices.
     *
     * @param {string[]} requestedDevices - The track types that are expected to
     * be includes in the stream.
     * @param {MediaStream} stream - The MediaStream to check if it has the
     * expected track types.
     * @returns {string[]} An array of string with the missing track types. The
     * array will be empty if all requestedDevices are found in the stream.
     */
    _getMissingTracks(requestedDevices = [], stream) {
        const missingDevices = [];

        const audioDeviceRequested = requestedDevices.includes('audio');
        const audioTracksReceived
            = stream && stream.getAudioTracks().length > 0;

        if (audioDeviceRequested && !audioTracksReceived) {
            missingDevices.push('audio');
        }

        const videoDeviceRequested = requestedDevices.includes('video');
        const videoTracksReceived
            = stream && stream.getVideoTracks().length > 0;

        if (videoDeviceRequested && !videoTracksReceived) {
            missingDevices.push('video');
        }

        return missingDevices;
    }

    /**
     * Returns an object formatted for specifying desktop sharing parameters.
     *
     * @param {Object} options - Takes in the same options object as
     * {@link obtainAudioAndVideoPermissions}.
     * @returns {Object}
     */
    _parseDesktopSharingOptions(options) {
        return {
            desktopSharingSources: options.desktopSharingSources,
            gumOptions: {
                frameRate: options.desktopSharingFrameRate
            },
            trackOptions: getTrackSSConstraints(options)
        };
    }

    /**
     * Gets streams from specified device types. This function intentionally
     * ignores errors for upstream to catch and handle instead.
     *
     * @param {Object} options - A hash describing what devices to get and
     * relevant constraints.
     * @param {string[]} options.devices - The types of media to capture. Valid
     * values are "desktop", "audio", and "video".
     * @param {Object} options.desktopSharingFrameRate
     * @param {Object} options.desktopSharingFrameRate.min - Minimum fps
     * @param {Object} options.desktopSharingFrameRate.max - Maximum fps
     * @param {String} options.desktopSharingSourceDevice - The device id or
     * label for a video input source that should be used for screensharing.
     * @returns {Promise} The promise, when successful, will return an array of
     * meta data for the requested device type, which includes the stream and
     * track. If an error occurs, it will be deferred to the caller for
     * handling.
     */
    newObtainAudioAndVideoPermissions(options) {
        logger.info('Using the new gUM flow');

        const mediaStreamsMetaData = [];

        // Declare private functions to be used in the promise chain below.
        // These functions are declared in the scope of this function because
        // they are not being used anywhere else, so only this function needs to
        // know about them.

        /**
         * Executes a request for desktop media if specified in options.
         *
         * @returns {Promise}
         */
        const maybeRequestDesktopDevice = function() {
            const umDevices = options.devices || [];
            const isDesktopDeviceRequested
                = umDevices.indexOf('desktop') !== -1;

            if (!isDesktopDeviceRequested) {
                return Promise.resolve();
            }

            const {
                desktopSharingSourceDevice,
                desktopSharingSources,
                desktopSharingFrameRate
            } = options;

            // Attempt to use a video input device as a screenshare source if
            // the option is defined.
            if (desktopSharingSourceDevice) {
                const matchingDevice
                    = availableDevices && availableDevices.find(device =>
                        device.kind === 'videoinput'
                            && (device.deviceId === desktopSharingSourceDevice
                            || device.label === desktopSharingSourceDevice));

                if (!matchingDevice) {
                    return Promise.reject(new JitsiTrackError(
                        { name: 'ConstraintNotSatisfiedError' },
                        {},
                        [ desktopSharingSourceDevice ]
                    ));
                }

                const requestedDevices = [ 'video' ];

                // Leverage the helper used by {@link _newGetDesktopMedia} to
                // get constraints for the desktop stream.
                const { gumOptions, trackOptions }
                    = this._parseDesktopSharingOptions(options);

                const constraints = {
                    video: {
                        ...gumOptions,
                        deviceId: matchingDevice.deviceId
                    }
                };

                return this._newGetUserMediaWithConstraints(
                    requestedDevices, constraints)
                    .then(stream => {
                        const track = stream && stream.getTracks()[0];
                        const applyConstrainsPromise
                            = track && track.applyConstraints
                                ? track.applyConstraints(trackOptions)
                                : Promise.resolve();

                        return applyConstrainsPromise
                            .then(() => {
                                return {
                                    sourceType: 'device',
                                    stream
                                };
                            });
                    });
            }

            return this._newGetDesktopMedia({
                desktopSharingSources,
                desktopSharingFrameRate
            });
        }.bind(this);

        /**
         * Creates a meta data object about the passed in desktopStream and
         * pushes the meta data to the internal array mediaStreamsMetaData to be
         * returned later.
         *
         * @param {MediaStreamTrack} desktopStream - A track for a desktop
         * capture.
         * @returns {void}
         */
        const maybeCreateAndAddDesktopTrack = function(desktopStream) {
            if (!desktopStream) {
                return;
            }

            const { stream, sourceId, sourceType } = desktopStream;

            const desktopAudioTracks = stream.getAudioTracks();

            if (desktopAudioTracks.length) {
                const desktopAudioStream = new MediaStream(desktopAudioTracks);

                mediaStreamsMetaData.push({
                    stream: desktopAudioStream,
                    sourceId,
                    sourceType,
                    track: desktopAudioStream.getAudioTracks()[0]
                });
            }

            const desktopVideoTracks = stream.getVideoTracks();

            if (desktopVideoTracks.length) {
                const desktopVideoStream = new MediaStream(desktopVideoTracks);

                mediaStreamsMetaData.push({
                    stream: desktopVideoStream,
                    sourceId,
                    sourceType,
                    track: desktopVideoStream.getVideoTracks()[0],
                    videoType: VideoType.DESKTOP
                });
            }
        };

        /**
         * Executes a request for audio and/or video, as specified in options.
         * By default both audio and video will be captured if options.devices
         * is not defined.
         *
         * @returns {Promise}
         */
        const maybeRequestCaptureDevices = function() {
            const umDevices = options.devices || [ 'audio', 'video' ];
            const requestedCaptureDevices = umDevices.filter(device =>
                device === 'audio'
                || (device === 'video' && browser.supportsVideo()));

            if (!requestedCaptureDevices.length) {
                return Promise.resolve();
            }

            const constraints = newGetConstraints(
                requestedCaptureDevices, options);

            logger.info('Got media constraints: ', constraints);

            return this._newGetUserMediaWithConstraints(
                requestedCaptureDevices, constraints);
        }.bind(this);

        /**
         * Splits the passed in media stream into separate audio and video
         * streams and creates meta data objects for each and pushes them to the
         * internal array mediaStreamsMetaData to be returned later.
         *
         * @param {MediaStreamTrack} avStream - A track for with audio and/or
         * video track.
         * @returns {void}
         */
        const maybeCreateAndAddAVTracks = function(avStream) {
            if (!avStream) {
                return;
            }

            const audioTracks = avStream.getAudioTracks();

            if (audioTracks.length) {
                const audioStream = new MediaStream(audioTracks);

                mediaStreamsMetaData.push({
                    stream: audioStream,
                    track: audioStream.getAudioTracks()[0],
                    effects: options.effects
                });
            }

            const videoTracks = avStream.getVideoTracks();

            if (videoTracks.length) {
                const videoStream = new MediaStream(videoTracks);

                mediaStreamsMetaData.push({
                    stream: videoStream,
                    track: videoStream.getVideoTracks()[0],
                    videoType: VideoType.CAMERA,
                    effects: options.effects
                });
            }
        };

        return maybeRequestDesktopDevice()
            .then(maybeCreateAndAddDesktopTrack)
            .then(maybeRequestCaptureDevices)
            .then(maybeCreateAndAddAVTracks)
            .then(() => mediaStreamsMetaData)
            .catch(error => {
                mediaStreamsMetaData.forEach(({ stream }) => {
                    this.stopMediaStream(stream);
                });

                return Promise.reject(error);
            });
    }

    /**
     * Checks whether it is possible to enumerate available cameras/microphones.
     *
     * @returns {boolean} {@code true} if the device listing is available;
     * {@code false}, otherwise.
     */
    isDeviceListAvailable() {
        return Boolean(
            navigator.mediaDevices
                && navigator.mediaDevices.enumerateDevices);
    }

    /**
     * Returns true if changing the input (camera / microphone) or output
     * (audio) device is supported and false if not.
     * @params {string} [deviceType] - type of device to change. Default is
     *      undefined or 'input', 'output' - for audio output device change.
     * @returns {boolean} true if available, false otherwise.
     */
    isDeviceChangeAvailable(deviceType) {
        return deviceType === 'output' || deviceType === 'audiooutput'
            ? isAudioOutputDeviceChangeAvailable
            : true;
    }

    /**
     * A method to handle stopping of the stream.
     * One point to handle the differences in various implementations.
     * @param mediaStream MediaStream object to stop.
     */
    stopMediaStream(mediaStream) {
        if (!mediaStream) {
            return;
        }

        mediaStream.getTracks().forEach(track => {
            if (track.stop) {
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
        const url = mediaStream.jitsiObjectURL;

        if (url) {
            delete mediaStream.jitsiObjectURL;
            URL.revokeObjectURL(url);
        }
    }

    /**
     * Returns whether the desktop sharing is enabled or not.
     * @returns {boolean}
     */
    isDesktopSharingEnabled() {
        return screenObtainer.isSupported();
    }

    /**
     * Sets current audio output device.
     * @param {string} deviceId - id of 'audiooutput' device from
     *      navigator.mediaDevices.enumerateDevices(), 'default' for default
     *      device
     * @returns {Promise} - resolves when audio output is changed, is rejected
     *      otherwise
     */
    setAudioOutputDevice(deviceId) {
        if (!this.isDeviceChangeAvailable('output')) {
            return Promise.reject(
                new Error('Audio output device change is not supported'));
        }

        return featureDetectionAudioEl.setSinkId(deviceId)
            .then(() => {
                audioOutputDeviceId = deviceId;
                audioOutputChanged = true;

                logger.log(`Audio output device set to ${deviceId}`);

                eventEmitter.emit(RTCEvents.AUDIO_OUTPUT_DEVICE_CHANGED,
                    deviceId);
            });
    }

    /**
     * Returns currently used audio output device id, '' stands for default
     * device
     * @returns {string}
     */
    getAudioOutputDevice() {
        return audioOutputDeviceId;
    }

    /**
     * Returns list of available media devices if its obtained, otherwise an
     * empty array is returned/
     * @returns {Array} list of available media devices.
     */
    getCurrentlyAvailableMediaDevices() {
        return availableDevices;
    }

    /**
     * Returns event data for device to be reported to stats.
     * @returns {MediaDeviceInfo} device.
     */
    getEventDataForActiveDevice(device) {
        const deviceList = [];
        const deviceData = {
            'deviceId': device.deviceId,
            'kind': device.kind,
            'label': device.label,
            'groupId': device.groupId
        };

        deviceList.push(deviceData);

        return { deviceList };
    }

    /**
     * Configures the given PeerConnection constraints to either enable or
     * disable (according to the value of the 'enable' parameter) the
     * 'googSuspendBelowMinBitrate' option.
     * @param constraints the constraints on which to operate.
     * @param enable {boolean} whether to enable or disable the suspend video
     * option.
     */
    setSuspendVideo(constraints, enable) {
        if (!constraints.optional) {
            constraints.optional = [];
        }

        // Get rid of all "googSuspendBelowMinBitrate" constraints (we assume
        // that the elements of constraints.optional contain a single property).
        constraints.optional
            = constraints.optional.filter(
                c => !c.hasOwnProperty('googSuspendBelowMinBitrate'));

        if (enable) {
            constraints.optional.push({ googSuspendBelowMinBitrate: 'true' });
        }
    }
}

const rtcUtils = new RTCUtils();

/**
 * Wraps original attachMediaStream function to set current audio output device
 * if this is supported.
 * @param {Function} origAttachMediaStream
 * @returns {Function}
 */
function wrapAttachMediaStream(origAttachMediaStream) {
    return function(element, stream) {
        // eslint-disable-next-line prefer-rest-params
        const res = origAttachMediaStream.apply(rtcUtils, arguments);

        if (stream
                && rtcUtils.isDeviceChangeAvailable('output')
                && stream.getAudioTracks
                && stream.getAudioTracks().length

                // we skip setting audio output if there was no explicit change
                && audioOutputChanged) {
            element.setSinkId(rtcUtils.getAudioOutputDevice())
                .catch(function(ex) {
                    const err
                        = new JitsiTrackError(ex, null, [ 'audiooutput' ]);

                    GlobalOnErrorHandler.callUnhandledRejectionHandler({
                        promise: this, // eslint-disable-line no-invalid-this
                        reason: err
                    });

                    logger.warn(
                        'Failed to set audio output device for the element.'
                            + ' Default audio output device will be used'
                            + ' instead',
                        element,
                        err);
                });
        }

        return res;
    };
}

export default rtcUtils;
