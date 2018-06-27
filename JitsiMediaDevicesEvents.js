/**
 * The events for the media devices.
 */

/**
 * Indicates that the list of available media devices has been changed. The
 * event provides the following parameters to its listeners:
 *
 * @param {MediaDeviceInfo[]} devices - array of MediaDeviceInfo or
 *  MediaDeviceInfo-like objects that are currently connected.
 *  @see https://developer.mozilla.org/en-US/docs/Web/API/MediaDeviceInfo
 */
export const DEVICE_LIST_CHANGED = 'mediaDevices.devicechange';

/**
 * Indicates that the environment is currently showing permission prompt to
 * access camera and/or microphone. The event provides the following
 * parameters to its listeners:
 *
 * @param {'chrome'|'opera'|'firefox'|'safari'|'nwjs'
 *  |'react-native'|'android'} environmentType - type of browser or
 *  other execution environment.
 */
export const PERMISSION_PROMPT_IS_SHOWN
    = 'mediaDevices.permissionPromptIsShown';
