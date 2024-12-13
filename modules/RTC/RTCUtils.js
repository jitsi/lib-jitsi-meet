import { getLogger } from '@jitsi/logger';
import { cloneDeep } from 'lodash-es';
import 'webrtc-adapter';

import JitsiTrackError from '../../JitsiTrackError';
import * as JitsiTrackErrors from '../../JitsiTrackErrors';
import { CameraFacingMode } from '../../service/RTC/CameraFacingMode';
import RTCEvents from '../../service/RTC/RTCEvents';
import Resolutions from '../../service/RTC/Resolutions';
import { VideoType } from '../../service/RTC/VideoType';
import { AVAILABLE_DEVICE } from '../../service/statistics/AnalyticsEvents';
import browser from '../browser';
import Statistics from '../statistics/statistics';
import Listenable from '../util/Listenable';

import screenObtainer from './ScreenObtainer';

const logger = getLogger(__filename);

const AVAILABLE_DEVICES_POLL_INTERVAL_TIME = 3000; // ms

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
            min: 180
        },
        width: {
            ideal: 1280,
            max: 1280,
            min: 320
        },
        frameRate: {
            min: 15,
            max: 30
        }
    }
};

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

// Enables stereo.
let stereo = null;

const featureDetectionAudioEl = document.createElement('audio');
const isAudioOutputDeviceChangeAvailable
    = typeof featureDetectionAudioEl.setSinkId !== 'undefined';

let availableDevices = [];
let availableDevicesPollTimer;

/**
 * An empty function.
 */
function emptyFuncton() {
    // no-op
}

/**
 * Creates a constraints object to be passed into a call to getUserMedia.
 *
 * @param {Array} um - An array of user media types to get. The accepted types are "video", "audio", and "desktop."
 * @param {Object} options - Various values to be added to the constraints.
 * @param {string} options.cameraDeviceId - The device id for the video capture device to get video from.
 * @param {Object} options.constraints - Default constraints object to use as a base for the returned constraints.
 * @param {Object} options.desktopStream - The desktop source id from which to capture a desktop sharing video.
 * @param {string} options.facingMode - Which direction the camera is pointing to (applicable on mobile)
 * @param {string} options.micDeviceId - The device id for the audio capture device to get audio from.
 * @private
 * @returns {Object}
 */
function getConstraints(um = [], options = {}) {
    // Create a deep copy of the constraints to avoid any modification of the passed in constraints object.
    const constraints = cloneDeep(options.constraints || DEFAULT_CONSTRAINTS);

    if (um.indexOf('video') >= 0) {
        if (!constraints.video) {
            constraints.video = {};
        }

        // The "resolution" option is a shortcut and takes precendence.
        if (Resolutions[options.resolution]) {
            const r = Resolutions[options.resolution];

            constraints.video.height = { ideal: r.height };
            constraints.video.width = { ideal: r.width };
        }

        if (!constraints.video.frameRate) {
            constraints.video.frameRate = DEFAULT_CONSTRAINTS.video.frameRate;
        }

        // Override the constraints on Safari because of the following webkit bug.
        // https://bugs.webkit.org/show_bug.cgi?id=210932
        // Camera doesn't start on older macOS versions if min/max constraints are specified.
        // TODO: remove this hack when the bug fix is available on Mojave, Sierra and High Sierra.
        if (browser.isWebKitBased()) {
            if (constraints.video.height && constraints.video.height.ideal) {
                constraints.video.height = { ideal: constraints.video.height.ideal };
            } else {
                logger.warn('Ideal camera height missing, camera may not start properly');
            }
            if (constraints.video.width && constraints.video.width.ideal) {
                constraints.video.width = { ideal: constraints.video.width.ideal };
            } else {
                logger.warn('Ideal camera width missing, camera may not start properly');
            }
        }
        if (options.cameraDeviceId) {
            constraints.video.deviceId = { exact: options.cameraDeviceId };
        } else if (browser.isMobileDevice()) {
            constraints.video.facingMode = options.facingMode || CameraFacingMode.USER;
        }
    } else {
        constraints.video = false;
    }

    if (um.indexOf('audio') >= 0) {
        if (!constraints.audio || typeof constraints.audio === 'boolean') {
            constraints.audio = {};
        }

        constraints.audio = {
            autoGainControl: !disableAGC && !disableAP,
            echoCancellation: !disableAEC && !disableAP,
            noiseSuppression: !disableNS && !disableAP
        };

        if (options.micDeviceId) {
            constraints.audio.deviceId = { exact: options.micDeviceId };
        }

        if (stereo) {
            Object.assign(constraints.audio, { channelCount: 2 });
        }
    } else {
        constraints.audio = false;
    }

    return constraints;
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
 *
 */
class RTCUtils extends Listenable {
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
        if (typeof options.audioQuality?.stereo === 'boolean') {
            stereo = options.audioQuality.stereo;
            logger.info(`Stereo: ${stereo}`);
        }

        window.clearInterval(availableDevicesPollTimer);
        availableDevicesPollTimer = undefined;

        if (!browser.isReactNative()) {
            this.attachMediaStream
                = wrapAttachMediaStream((element, stream) => {
                    if (element) {
                        element.srcObject = stream;
                    }
                });
        }

        this.pcConstraints = {};

        screenObtainer.init(options);

        if (this.isDeviceListAvailable()) {
            this.enumerateDevices(ds => {
                availableDevices = ds.slice(0);

                logger.debug('Available devices: ', availableDevices);
                sendDeviceListToAnalytics(availableDevices);

                this.eventEmitter.emit(
                    RTCEvents.DEVICE_LIST_AVAILABLE,
                    availableDevices);

                if (browser.supportsDeviceChangeEvent()) {
                    navigator.mediaDevices.addEventListener(
                        'devicechange',
                        () => this.enumerateDevices(emptyFuncton));
                } else {
                    // Periodically poll enumerateDevices() method to check if
                    // list of media devices has changed.
                    availableDevicesPollTimer = window.setInterval(
                        () => this.enumerateDevices(emptyFuncton),
                        AVAILABLE_DEVICES_POLL_INTERVAL_TIME);
                }
            });
        }
    }

    /**
     *
     * @param {Function} callback
     */
    enumerateDevices(callback) {
        navigator.mediaDevices.enumerateDevices()
            .then(devices => {
                this._updateKnownDevices(devices);
                callback(devices);
            })
            .catch(error => {
                logger.warn(`Failed to  enumerate devices. ${error}`);
                this._updateKnownDevices([]);
                callback([]);
            });
    }

    /**
     * Acquires a media stream via getUserMedia that
     * matches the given constraints
     *
     * @param {array} umDevices which devices to acquire (e.g. audio, video)
     * @param {Object} constraints - Stream specifications to use.
     * @param {number} timeout - The timeout in ms for GUM.
     * @returns {Promise}
     */
    _getUserMedia(umDevices, constraints = {}, timeout = 0) {
        return new Promise((resolve, reject) => {
            let gumTimeout, timeoutExpired = false;

            if (typeof timeout === 'number' && !isNaN(timeout) && timeout > 0) {
                gumTimeout = setTimeout(() => {
                    timeoutExpired = true;
                    gumTimeout = undefined;
                    reject(new JitsiTrackError(JitsiTrackErrors.TIMEOUT));
                }, timeout);
            }

            navigator.mediaDevices.getUserMedia(constraints)
                .then(stream => {
                    logger.log('onUserMediaSuccess');
                    this._updateGrantedPermissions(umDevices, stream);
                    if (!timeoutExpired) {
                        if (typeof gumTimeout !== 'undefined') {
                            clearTimeout(gumTimeout);
                        }
                        resolve(stream);
                    }
                })
                .catch(error => {
                    logger.warn(`Failed to get access to local media. ${error} ${JSON.stringify(constraints)}`);
                    const jitsiError = new JitsiTrackError(error, constraints, umDevices);

                    if (!timeoutExpired) {
                        if (typeof gumTimeout !== 'undefined') {
                            clearTimeout(gumTimeout);
                        }
                        reject(jitsiError);
                    }

                    if (jitsiError.name === JitsiTrackErrors.PERMISSION_DENIED) {
                        this._updateGrantedPermissions(umDevices, undefined);
                    }

                    // else {
                    // Probably the error is not caused by the lack of permissions and we don't need to update them.
                    // }
                });
        });
    }

    /**
     * Acquire a display stream via the screenObtainer. This requires extra
     * logic compared to use screenObtainer versus normal device capture logic
     * in RTCUtils#_getUserMedia.
     *
     * @param {Object} options - Optional parameters.
     * @returns {Promise} A promise which will be resolved with an object which
     * contains the acquired display stream. If desktop sharing is not supported
     * then a rejected promise will be returned.
     */
    _getDesktopMedia(options) {
        if (!screenObtainer.isSupported()) {
            return Promise.reject(new Error('Desktop sharing is not supported!'));
        }

        return new Promise((resolve, reject) => {
            screenObtainer.obtainStream(
                stream => {
                    resolve(stream);
                },
                error => {
                    reject(error);
                },
                options);
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
     * Event handler for the 'devicechange' event.
     *
     * @param {MediaDeviceInfo[]} devices - list of media devices.
     * @emits RTCEvents.DEVICE_LIST_CHANGED
     */
    _onMediaDevicesListChanged(devicesReceived) {
        availableDevices = devicesReceived.slice(0);
        logger.info('list of media devices has changed:', availableDevices);

        sendDeviceListToAnalytics(availableDevices);

        // Used by tracks to update the real device id before the consumer of lib-jitsi-meet receives the
        // new device list.
        this.eventEmitter.emit(RTCEvents.DEVICE_LIST_WILL_CHANGE, availableDevices);

        this.eventEmitter.emit(RTCEvents.DEVICE_LIST_CHANGED, availableDevices);
    }

    /**
     * Update known devices.
     *
     * @param {Array<Object>} pds - The new devices.
     * @returns {void}
     *
     * NOTE: Use this function as a shared callback to handle both the devicechange event and the
     * polling implementations.
     * This prevents duplication and works around a chrome bug (verified to occur on 68) where devicechange
     * fires twice in a row, which can cause async post devicechange processing to collide.
     */
    _updateKnownDevices(pds) {
        if (compareAvailableMediaDevices(pds)) {
            this._onMediaDevicesListChanged(pds);
        }
    }

    /**
     * Updates the granted permissions based on the options we requested and the
     * streams we received.
     * @param um the options we requested to getUserMedia.
     * @param stream the stream we received from calling getUserMedia.
     */
    _updateGrantedPermissions(um, stream) {
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

        this.eventEmitter.emit(RTCEvents.PERMISSIONS_CHANGED, grantedPermissions);
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
     * @param {Array<string>} options.desktopSharingSources - The types of sources ("screen", "window", etc)
     * from which the user can select what to share.
     * @returns {Promise} The promise, when successful, will return an array of
     * meta data for the requested device type, which includes the stream and
     * track. If an error occurs, it will be deferred to the caller for
     * handling.
     */
    obtainAudioAndVideoPermissions(options) {
        const {
            timeout,
            ...otherOptions
        } = options;

        const mediaStreamsMetaData = [];
        let constraints = {};

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
            const umDevices = otherOptions.devices || [];
            const isDesktopDeviceRequested
                = umDevices.indexOf('desktop') !== -1;

            if (!isDesktopDeviceRequested) {
                return Promise.resolve();
            }

            const {
                desktopSharingSourceDevice,
                desktopSharingSources
            } = otherOptions;

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
                const deviceConstraints = {
                    video: {
                        deviceId: matchingDevice.deviceId

                        // frameRate is omited here on purpose since this is a device that we'll pretend is a screen.
                    }
                };

                return this._getUserMedia(requestedDevices, deviceConstraints, timeout)
                    .then(stream => {
                        return {
                            sourceType: 'device',
                            stream
                        };
                    });
            }

            return this._getDesktopMedia({ desktopSharingSources });
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
            const umDevices = otherOptions.devices || [ 'audio', 'video' ];
            const requestedCaptureDevices = umDevices.filter(device => device === 'audio' || device === 'video');

            if (!requestedCaptureDevices.length) {
                return Promise.resolve();
            }

            constraints = getConstraints(requestedCaptureDevices, otherOptions);

            logger.info('Got media constraints: ', JSON.stringify(constraints));

            return this._getUserMedia(requestedCaptureDevices, constraints, timeout);
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
                    constraints: constraints.audio,
                    stream: audioStream,
                    track: audioStream.getAudioTracks()[0],
                    effects: otherOptions.effects
                });
            }

            const videoTracks = avStream.getVideoTracks();

            if (videoTracks.length) {
                const videoStream = new MediaStream(videoTracks);

                mediaStreamsMetaData.push({
                    constraints: constraints.video,
                    stream: videoStream,
                    track: videoStream.getVideoTracks()[0],
                    videoType: VideoType.CAMERA,
                    effects: otherOptions.effects
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
        if (deviceType === 'output' || deviceType === 'audiooutput') {
            return isAudioOutputDeviceChangeAvailable;
        }

        return true;
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

                this.eventEmitter.emit(RTCEvents.AUDIO_OUTPUT_DEVICE_CHANGED,
                    deviceId);
            });
    }

    /**
     * Sets the capture frame rate for desktop tracks.
     *
     * @param {number} maxFps - max fps to be used as the capture frame rate.
     * @returns {void}
     */
    setDesktopSharingFrameRate(maxFps) {
        screenObtainer.setDesktopSharingFrameRate(maxFps);
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
            deviceId: device.deviceId,
            kind: device.kind,
            label: device.label,
            groupId: device.groupId
        };

        deviceList.push(deviceData);

        return { deviceList };
    }

    /**
     * Returns <tt>true<tt/> if a WebRTC MediaStream identified by given stream
     * ID is considered a valid "user" stream which means that it's not a
     * "receive only" stream nor a "mixed" JVB stream.
     *
     * Clients that implement Unified Plan, such as Firefox use recvonly
     * "streams/channels/tracks" for receiving remote stream/tracks, as opposed
     * to Plan B where there are only 3 channels: audio, video and data.
     *
     * @param {string} streamId The id of WebRTC MediaStream.
     * @returns {boolean}
     */
    isUserStreamById(streamId) {
        return streamId && streamId !== 'mixedmslabel' && streamId !== 'default';
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
        origAttachMediaStream.apply(rtcUtils, arguments);

        if (stream
                && rtcUtils.isDeviceChangeAvailable('output')
                && stream.getAudioTracks
                && stream.getAudioTracks().length

                // we skip setting audio output if there was no explicit change
                && audioOutputChanged) {
            return element.setSinkId(rtcUtils.getAudioOutputDevice()).catch(ex => {
                const err
                    = new JitsiTrackError(ex, null, [ 'audiooutput' ]);

                logger.warn(
                    'Failed to set audio output device for the element.'
                        + ' Default audio output device will be used'
                        + ' instead',
                    element?.id,
                    err);

                throw err;
            });
        }

        return Promise.resolve();
    };
}

export default rtcUtils;
