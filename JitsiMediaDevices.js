import EventEmitter from 'events';

import * as MediaType from './service/RTC/MediaType';
import browser from './modules/browser';
import RTC from './modules/RTC/RTC';
import RTCEvents from './service/RTC/RTCEvents';
import Statistics from './modules/statistics/statistics';

import * as JitsiMediaDevicesEvents from './JitsiMediaDevicesEvents';

const AUDIO_PERMISSION_NAME = 'microphone';
const PERMISSION_GRANTED_STATUS = 'granted';
const VIDEO_PERMISSION_NAME = 'camera';

/**
 * Media devices utilities for Jitsi.
 */
class JitsiMediaDevices {
    /**
     * Initializes a {@code JitsiMediaDevices} object. There will be a single
     * instance of this class.
     */
    constructor() {
        this._eventEmitter = new EventEmitter();
        this._grantedPermissions = {};

        RTC.addListener(
            RTCEvents.DEVICE_LIST_CHANGED,
            devices =>
                this._eventEmitter.emit(
                    JitsiMediaDevicesEvents.DEVICE_LIST_CHANGED,
                    devices));
        RTC.addListener(
            RTCEvents.DEVICE_LIST_AVAILABLE,
            devices =>
                this._logOutputDevice(
                    this.getAudioOutputDevice(),
                    devices));
        RTC.addListener(
            RTCEvents.GRANTED_PERMISSIONS,
            grantedPermissions =>
                this._handleGrantedPermissions(grantedPermissions));

        // Test if the W3C Permissions API is implemented and the 'camera' and
        // 'microphone' permissions are implemented. (Testing for at least one
        // of them seems sufficient).
        this._permissionsApiSupported = new Promise(resolve => {
            if (!navigator.permissions) {
                resolve(false);

                return;
            }

            navigator.permissions.query({ name: VIDEO_PERMISSION_NAME })
                .then(() => resolve(true), () => resolve(false));
        });
    }

    /**
     * Updated the local granted permissions cache. A permissions might be
     * granted, denied, or undefined. This is represented by having its media
     * type key set to {@code true} or {@code false} respectively.
     *
     * @param {Object} grantedPermissions - Array with the permissions
     * which were granted.
     */
    _handleGrantedPermissions(grantedPermissions) {
        this._grantedPermissions = {
            ...this._grantedPermissions,
            ...grantedPermissions
        };
    }

    /**
     * Gathers data and sends it to statistics.
     * @param deviceID the device id to log
     * @param devices list of devices
     */
    _logOutputDevice(deviceID, devices) {
        const device
            = devices.find(
                d => d.kind === 'audiooutput' && d.deviceId === deviceID);

        if (device) {
            Statistics.sendActiveDeviceListEvent(
                RTC.getEventDataForActiveDevice(device));
        }
    }

    /**
     * Executes callback with list of media devices connected.
     * @param {function} callback
     */
    enumerateDevices(callback) {
        RTC.enumerateDevices(callback);
    }

    /**
     * Checks if its possible to enumerate available cameras/micropones.
     * @returns {Promise<boolean>} a Promise which will be resolved only once
     * the WebRTC stack is ready, either with true if the device listing is
     * available available or with false otherwise.
     */
    isDeviceListAvailable() {
        return RTC.isDeviceListAvailable();
    }

    /**
     * Returns true if changing the input (camera / microphone) or output
     * (audio) device is supported and false if not.
     * @param {string} [deviceType] - type of device to change. Default is
     *      undefined or 'input', 'output' - for audio output device change.
     * @returns {boolean} true if available, false otherwise.
     */
    isDeviceChangeAvailable(deviceType) {
        return RTC.isDeviceChangeAvailable(deviceType);
    }

    /**
     * Checks if the permission for the given device was granted.
     *
     * @param {'audio'|'video'} [type] - type of devices to check,
     *      undefined stands for both 'audio' and 'video' together
     * @returns {Promise<boolean>}
     */
    isDevicePermissionGranted(type) {
        return new Promise(resolve => {
            // Shortcut: first check if we already know the permission was
            // granted.
            if (type in this._grantedPermissions) {
                resolve(this._grantedPermissions[type]);

                return;
            }

            // Check using the Permissions API.
            this._permissionsApiSupported.then(supported => {
                if (!supported) {
                    // Workaround on Safari for audio input device
                    // selection to work. Safari doesn't support the
                    // permissions query.
                    if (browser.isSafari()) {
                        resolve(true);

                        return;
                    }
                    resolve(false);

                    return;
                }

                const promises = [];

                switch (type) {
                case MediaType.VIDEO:
                    promises.push(
                        navigator.permissions.query({
                            name: VIDEO_PERMISSION_NAME
                        }));
                    break;
                case MediaType.AUDIO:
                    promises.push(
                        navigator.permissions.query({
                            name: AUDIO_PERMISSION_NAME
                        }));
                    break;
                default:
                    promises.push(
                        navigator.permissions.query({
                            name: VIDEO_PERMISSION_NAME
                        }));
                    promises.push(
                        navigator.permissions.query({
                            name: AUDIO_PERMISSION_NAME
                        }));
                }

                Promise.all(promises).then(
                    results => resolve(results.every(permissionStatus => {
                        // The status attribute is deprecated, and state
                        // should be used instead, but check both for now
                        // for backwards compatibility.
                        const grantStatus = permissionStatus.state
                            || permissionStatus.status;

                        return grantStatus === PERMISSION_GRANTED_STATUS;
                    })),
                    () => resolve(false)
                );
            });
        });
    }

    /**
     * Returns true if it is possible to be simultaneously capturing audio
     * from more than one device.
     *
     * @returns {boolean}
     */
    isMultipleAudioInputSupported() {
        return !browser.isFirefox();
    }

    /**
     * Returns currently used audio output device id, 'default' stands
     * for default device
     * @returns {string}
     */
    getAudioOutputDevice() {
        return RTC.getAudioOutputDevice();
    }

    /**
     * Sets current audio output device.
     * @param {string} deviceId - id of 'audiooutput' device from
     *      navigator.mediaDevices.enumerateDevices(), 'default' is for
     *      default device
     * @returns {Promise} - resolves when audio output is changed, is rejected
     *      otherwise
     */
    setAudioOutputDevice(deviceId) {
        const availableDevices = RTC.getCurrentlyAvailableMediaDevices();

        if (availableDevices && availableDevices.length > 0) {
            // if we have devices info report device to stats
            // normally this will not happen on startup as this method is called
            // too early. This will happen only on user selection of new device
            this._logOutputDevice(
                deviceId, RTC.getCurrentlyAvailableMediaDevices());
        }

        return RTC.setAudioOutputDevice(deviceId);
    }

    /**
     * Adds an event handler.
     * @param {string} event - event name
     * @param {function} handler - event handler
     */
    addEventListener(event, handler) {
        this._eventEmitter.addListener(event, handler);
    }

    /**
     * Removes event handler.
     * @param {string} event - event name
     * @param {function} handler - event handler
     */
    removeEventListener(event, handler) {
        this._eventEmitter.removeListener(event, handler);
    }

    /**
     * Emits an event.
     * @param {string} event - event name
     */
    emitEvent(event, ...args) {
        this._eventEmitter.emit(event, ...args);
    }

    /**
     * Returns whether or not the current browser can support capturing video,
     * be it camera or desktop, and displaying received video.
     *
     * @returns {boolean}
     */
    supportsVideo() {
        // Defer to the browser capabilities to allow exposure of the api to the
        // consumer but prevent other files from having to import
        // JitsiMediaDevices.
        return browser.supportsVideo();
    }
}

export default new JitsiMediaDevices();
