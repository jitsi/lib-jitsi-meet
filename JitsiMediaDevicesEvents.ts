/**
 * The events for the media devices.
 */

export enum JitsiMediaDevicesEvents {
    /**
     * Indicates that the list of available media devices has been changed. The
     * event provides the following parameters to its listeners:
     *
     * @param {MediaDeviceInfo[]} devices - array of MediaDeviceInfo or
     *  MediaDeviceInfo-like objects that are currently connected.
     *  @see https://developer.mozilla.org/en-US/docs/Web/API/MediaDeviceInfo
     */
    DEVICE_LIST_CHANGED = 'mediaDevices.devicechange',

    /**
     * Event emitted when the user granted/blocked a permission for the camera / mic.
     * Used to keep track of the granted permissions on browsers which don't
     * support the Permissions API.
     */
    PERMISSIONS_CHANGED = 'rtc.permissions_changed',

    /**
     * Indicates that the environment is currently showing permission prompt to
     * access camera and/or microphone. The event provides the following
     * parameters to its listeners:
     *
     * @param {'chrome'|'opera'|'firefox'|'safari'|'nwjs'
     *  |'react-native'|'android'} environmentType - type of browser or
     *  other execution environment.
     */
    PERMISSION_PROMPT_IS_SHOWN = 'mediaDevices.permissionPromptIsShown',

    SLOW_GET_USER_MEDIA = 'mediaDevices.slowGetUserMedia'
};

// exported for backward compatibility
export const DEVICE_LIST_CHANGED = JitsiMediaDevicesEvents.DEVICE_LIST_CHANGED;
export const PERMISSIONS_CHANGED = JitsiMediaDevicesEvents.PERMISSIONS_CHANGED;
export const PERMISSION_PROMPT_IS_SHOWN = JitsiMediaDevicesEvents.PERMISSION_PROMPT_IS_SHOWN;
export const SLOW_GET_USER_MEDIA = JitsiMediaDevicesEvents.SLOW_GET_USER_MEDIA;
