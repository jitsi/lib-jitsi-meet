import EventEmitter from 'events';

import * as MediaType from './service/RTC/MediaType';
import browser from './modules/browser';
import RTC from './modules/RTC/RTC';
import RTCEvents from './service/RTC/RTCEvents';
import Statistics from './modules/statistics/statistics';

import * as JitsiMediaDevicesEvents from './JitsiMediaDevicesEvents';

const eventEmitter = new EventEmitter();

/**
 * Gathers data and sends it to statistics.
 * @param deviceID the device id to log
 * @param devices list of devices
 */
function logOutputDevice(deviceID, devices) {
    const device
        = devices.find(
            d => d.kind === 'audiooutput' && d.deviceId === deviceID);

    if (device) {
        Statistics.sendActiveDeviceListEvent(
            RTC.getEventDataForActiveDevice(device));
    }
}

const JitsiMediaDevices = {
    /**
     * Executes callback with list of media devices connected.
     * @param {function} callback
     */
    enumerateDevices(callback) {
        RTC.enumerateDevices(callback);
    },

    /**
     * Checks if its possible to enumerate available cameras/micropones.
     * @returns {Promise<boolean>} a Promise which will be resolved only once
     * the WebRTC stack is ready, either with true if the device listing is
     * available available or with false otherwise.
     */
    isDeviceListAvailable() {
        return RTC.isDeviceListAvailable();
    },

    /**
     * Returns true if changing the input (camera / microphone) or output
     * (audio) device is supported and false if not.
     * @param {string} [deviceType] - type of device to change. Default is
     *      undefined or 'input', 'output' - for audio output device change.
     * @returns {boolean} true if available, false otherwise.
     */
    isDeviceChangeAvailable(deviceType) {
        return RTC.isDeviceChangeAvailable(deviceType);
    },

    /**
     * Returns true if user granted permission to media devices.
     * @param {'audio'|'video'} [type] - type of devices to check,
     *      undefined stands for both 'audio' and 'video' together
     * @returns {boolean}
     */
    isDevicePermissionGranted(type) {
        const permissions = RTC.getDeviceAvailability();

        switch (type) {
        case MediaType.VIDEO:
            return permissions.video === true;
        case MediaType.AUDIO:
            return permissions.audio === true;
        default:
            return permissions.video === true && permissions.audio === true;
        }
    },

    /**
     * Returns true if it is possible to be simultaneously capturing audio
     * from more than one device.
     *
     * @returns {boolean}
     */
    isMultipleAudioInputSupported() {
        return !browser.isFirefox();
    },

    /**
     * Returns currently used audio output device id, 'default' stands
     * for default device
     * @returns {string}
     */
    getAudioOutputDevice() {
        return RTC.getAudioOutputDevice();
    },

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
            logOutputDevice(deviceId, RTC.getCurrentlyAvailableMediaDevices());
        }

        return RTC.setAudioOutputDevice(deviceId);
    },

    /**
     * Adds an event handler.
     * @param {string} event - event name
     * @param {function} handler - event handler
     */
    addEventListener(event, handler) {
        eventEmitter.addListener(event, handler);
    },

    /**
     * Removes event handler.
     * @param {string} event - event name
     * @param {function} handler - event handler
     */
    removeEventListener(event, handler) {
        eventEmitter.removeListener(event, handler);
    },

    /**
     * Emits an event.
     * @param {string} event - event name
     */
    emitEvent(event, ...args) {
        eventEmitter.emit(event, ...args);
    },

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
};


RTC.addListener(
    RTCEvents.DEVICE_LIST_CHANGED,
    devices =>
        eventEmitter.emit(
            JitsiMediaDevicesEvents.DEVICE_LIST_CHANGED,
            devices));
RTC.addListener(
    RTCEvents.DEVICE_LIST_AVAILABLE,
    devices =>
        logOutputDevice(
            JitsiMediaDevices.getAudioOutputDevice(),
            devices));

export default JitsiMediaDevices;
