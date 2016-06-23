var EventEmitter = require("events");
var RTCEvents = require('./service/RTC/RTCEvents');
var RTC = require("./modules/RTC/RTC");
var MediaType = require('./service/RTC/MediaType');
var JitsiMediaDevicesEvents = require('./JitsiMediaDevicesEvents');
var Statistics = require("./modules/statistics/statistics");

var eventEmitter = new EventEmitter();

RTC.addListener(RTCEvents.DEVICE_LIST_CHANGED,
    function (devices, isInitial) {

        if (isInitial) {
            // log output device
            logOutputDevice(
                JitsiMediaDevices.getAudioOutputDevice(),
                devices);

            // skip initial event
            return;
        }

        eventEmitter.emit(JitsiMediaDevicesEvents.DEVICE_LIST_CHANGED, devices);
    });

/**
 * Gathers data and sends it to statistics.
 * @param deviceID the device id to log
 * @param devices list of devices
 */
function logOutputDevice (deviceID, devices) {
    var device = devices.find(function (d) {
        return d.kind === 'audiooutput' && d.deviceId === deviceID;
    });

    Statistics.sendАctiveDeviceListEvent(
        RTC.getEventDataForActiveDevice(device));
}

var JitsiMediaDevices = {
    /**
     * Executes callback with list of media devices connected.
     * @param {function} callback
     */
    enumerateDevices: function (callback) {
        RTC.enumerateDevices(callback);
    },
    /**
     * Checks if its possible to enumerate available cameras/micropones.
     * @returns {boolean} true if available, false otherwise.
     */
    isDeviceListAvailable: function () {
        return RTC.isDeviceListAvailable();
    },
    /**
     * Returns true if changing the input (camera / microphone) or output
     * (audio) device is supported and false if not.
     * @param {string} [deviceType] - type of device to change. Default is
     *      undefined or 'input', 'output' - for audio output device change.
     * @returns {boolean} true if available, false otherwise.
     */
    isDeviceChangeAvailable: function (deviceType) {
        return RTC.isDeviceChangeAvailable(deviceType);
    },
    /**
     * Returns true if user granted permission to media devices.
     * @param {'audio'|'video'} [type] - type of devices to check,
     *      undefined stands for both 'audio' and 'video' together
     * @returns {boolean}
     */
    isDevicePermissionGranted: function (type) {
        var permissions = RTC.getDeviceAvailability();

        switch(type) {
            case MediaType.VIDEO:
                return permissions.video === true;
            case MediaType.AUDIO:
                return permissions.audio === true;
            default:
                return permissions.video === true && permissions.audio === true;
        }
    },
    /**
     * Returns currently used audio output device id, 'default' stands
     * for default device
     * @returns {string}
     */
    getAudioOutputDevice: function () {
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
    setAudioOutputDevice: function (deviceId) {

        if (RTC.getCurrentlyAvailableMediaDevices().length > 0)
        {
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
    addEventListener: function (event, handler) {
        eventEmitter.addListener(event, handler);
    },
    /**
     * Removes event handler.
     * @param {string} event - event name
     * @param {function} handler - event handler
     */
    removeEventListener: function (event, handler) {
        eventEmitter.removeListener(event, handler);
    }
};

module.exports = JitsiMediaDevices;