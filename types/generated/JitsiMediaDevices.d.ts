declare var _default: JitsiMediaDevices;
export default _default;
/**
 * Media devices utilities for Jitsi.
 */
declare class JitsiMediaDevices {
    _eventEmitter: any;
    _grantedPermissions: {};
    _permissionsApiSupported: any;
    /**
     * Updated the local granted permissions cache. A permissions might be
     * granted, denied, or undefined. This is represented by having its media
     * type key set to {@code true} or {@code false} respectively.
     *
     * @param {Object} grantedPermissions - Array with the permissions
     * which were granted.
     */
    _handleGrantedPermissions(grantedPermissions: any): void;
    /**
     * Gathers data and sends it to statistics.
     * @param deviceID the device id to log
     * @param devices list of devices
     */
    _logOutputDevice(deviceID: any, devices: any): void;
    /**
     * Executes callback with list of media devices connected.
     * @param {function} callback
     */
    enumerateDevices(callback: Function): void;
    /**
     * Checks if its possible to enumerate available cameras/micropones.
     * @returns {Promise<boolean>} a Promise which will be resolved only once
     * the WebRTC stack is ready, either with true if the device listing is
     * available available or with false otherwise.
     */
    isDeviceListAvailable(): Promise<boolean>;
    /**
     * Returns true if changing the input (camera / microphone) or output
     * (audio) device is supported and false if not.
     * @param {string} [deviceType] - type of device to change. Default is
     *      undefined or 'input', 'output' - for audio output device change.
     * @returns {boolean} true if available, false otherwise.
     */
    isDeviceChangeAvailable(deviceType?: string): boolean;
    /**
     * Checks if the permission for the given device was granted.
     *
     * @param {'audio'|'video'} [type] - type of devices to check,
     *      undefined stands for both 'audio' and 'video' together
     * @returns {Promise<boolean>}
     */
    isDevicePermissionGranted(type?: 'audio' | 'video'): Promise<boolean>;
    /**
     * Returns true if it is possible to be simultaneously capturing audio
     * from more than one device.
     *
     * @returns {boolean}
     */
    isMultipleAudioInputSupported(): boolean;
    /**
     * Returns currently used audio output device id, 'default' stands
     * for default device
     * @returns {string}
     */
    getAudioOutputDevice(): string;
    /**
     * Sets current audio output device.
     * @param {string} deviceId - id of 'audiooutput' device from
     *      navigator.mediaDevices.enumerateDevices(), 'default' is for
     *      default device
     * @returns {Promise} - resolves when audio output is changed, is rejected
     *      otherwise
     */
    setAudioOutputDevice(deviceId: string): Promise<any>;
    /**
     * Adds an event handler.
     * @param {string} event - event name
     * @param {function} handler - event handler
     */
    addEventListener(event: string, handler: Function): void;
    /**
     * Removes event handler.
     * @param {string} event - event name
     * @param {function} handler - event handler
     */
    removeEventListener(event: string, handler: Function): void;
    /**
     * Emits an event.
     * @param {string} event - event name
     */
    emitEvent(event: string, ...args: any[]): void;
}
