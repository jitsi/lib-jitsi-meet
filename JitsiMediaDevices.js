import * as JitsiMediaDevicesEvents from './JitsiMediaDevicesEvents';
import RTC from './modules/RTC/RTC';
import browser from './modules/browser';
import Listenable from './modules/util/Listenable';
import { MediaType } from './service/RTC/MediaType';
import RTCEvents from './service/RTC/RTCEvents';

const AUDIO_PERMISSION_NAME = 'microphone';
const PERMISSION_GRANTED_STATUS = 'granted';
const VIDEO_PERMISSION_NAME = 'camera';

/**
 * Media devices utilities for Jitsi.
 */
class JitsiMediaDevices extends Listenable {
    /**
     * Initializes a {@code JitsiMediaDevices} object. There will be a single
     * instance of this class.
     */
    constructor() {
        super();
        this._permissions = {};
    }

    /**
     * Initialize. Start listening for device changes and initialize permissions checks.
     */
    init() {
        RTC.addListener(
            RTCEvents.DEVICE_LIST_CHANGED,
            devices =>
                this.eventEmitter.emit(
                    JitsiMediaDevicesEvents.DEVICE_LIST_CHANGED,
                    devices));

        // We would still want to update the permissions cache in case the permissions API is not supported.
        RTC.addListener(
            RTCEvents.PERMISSIONS_CHANGED,
            permissions => this._handlePermissionsChange(permissions));

        // Test if the W3C Permissions API is implemented and the 'camera' and 'microphone' permissions are
        // implemented. If supported add onchange listeners.
        this._permissionsApiSupported = new Promise(resolve => {
            if (!navigator.permissions) {
                resolve(false);

                return;
            }

            const self = this;

            const promises = [];

            promises.push(navigator.permissions.query({ name: VIDEO_PERMISSION_NAME })
                .then(status => {
                    this._handlePermissionsChange({
                        [MediaType.VIDEO]: this._parsePermissionState(status)
                    });
                    status.onchange = function() {
                        try {
                            self._handlePermissionsChange({
                                [MediaType.VIDEO]: self._parsePermissionState(this)
                            });
                        } catch (error) {
                            // Nothing to do.
                        }
                    };

                    return true;
                })
                .catch(() => false));

            promises.push(navigator.permissions.query({ name: AUDIO_PERMISSION_NAME })
                .then(status => {
                    this._handlePermissionsChange({
                        [MediaType.AUDIO]: this._parsePermissionState(status)
                    });
                    status.onchange = function() {
                        try {
                            self._handlePermissionsChange({
                                [MediaType.AUDIO]: self._parsePermissionState(this)
                            });
                        } catch (error) {
                            // Nothing to do.
                        }
                    };

                    return true;
                })
                .catch(() => false));

            Promise.all(promises).then(results => resolve(results.every(supported => supported)));

        });
    }

    /**
     * Parses a PermissionState object and returns true for granted and false otherwise.
     *
     * @param {PermissionState} permissionStatus - The PermissionState object retrieved from the Permissions API.
     * @returns {boolean} - True for granted and false for denied.
     * @throws {TypeError}
     */
    _parsePermissionState(permissionStatus = {}) {
        // The status attribute is deprecated, and state
        // should be used instead, but check both for now
        // for backwards compatibility.
        const status = permissionStatus.state || permissionStatus.status;

        if (typeof status !== 'string') {
            throw new TypeError();
        }

        return status === PERMISSION_GRANTED_STATUS;
    }

    /**
     * Updates the local granted/denied permissions cache. A permissions might be
     * granted, denied, or undefined. This is represented by having its media
     * type key set to {@code true} or {@code false} respectively.
     *
     * @param {Object} permissions - Object with the permissions.
     */
    _handlePermissionsChange(permissions) {
        const hasPermissionsChanged
            = [ MediaType.AUDIO, MediaType.VIDEO ]
                .some(type => type in permissions && permissions[type] !== this._permissions[type]);

        if (hasPermissionsChanged) {
            this._permissions = {
                ...this._permissions,
                ...permissions
            };
            this.eventEmitter.emit(JitsiMediaDevicesEvents.PERMISSIONS_CHANGED, this._permissions);

            if (this._permissions[MediaType.AUDIO] || this._permissions[MediaType.VIDEO]) {
                // Triggering device list update when the permissions are granted in order to update
                // the labels the devices.
                // eslint-disable-next-line no-empty-function
                this.enumerateDevices(() => {});
            }
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
            if (type in this._permissions) {
                resolve(this._permissions[type]);

                return;
            }

            // Check using the Permissions API.
            this._permissionsApiSupported.then(supported => {
                if (!supported) {
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
                        try {
                            return this._parsePermissionState(permissionStatus);
                        } catch {
                            return false;
                        }
                    })),
                    () => resolve(false)
                );
            });
        });
    }

    /**
     * Returns true if it is possible to be simultaneously capturing audio from more than one device.
     *
     * @returns {boolean}
     */
    isMultipleAudioInputSupported() {
        return !(
            (browser.isFirefox() && browser.isVersionLessThan('101'))
            || browser.isIosBrowser()
        );
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
        return RTC.setAudioOutputDevice(deviceId);
    }
}

export default new JitsiMediaDevices();
