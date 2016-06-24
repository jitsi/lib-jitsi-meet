/**
 * Enumeration with the events for the media devices.
 * @type {{string: string}}
 */
var JitsiMediaDevicesEvents = {
    /**
     * Indicates that the list of available media devices has been changed. The
     * event provides the following parameters to its listeners:
     *
     * @param {MediaDeviceInfo[]} devices - array of MediaDeviceInfo or
     *  MediaDeviceInfo-like objects that are currently connected.
     *  @see https://developer.mozilla.org/en-US/docs/Web/API/MediaDeviceInfo
     */
    DEVICE_LIST_CHANGED: "mediaDevices.devicechange"
};

module.exports = JitsiMediaDevicesEvents;
