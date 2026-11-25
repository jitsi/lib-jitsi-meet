import { JitsiMediaDevicesEvents } from './JitsiMediaDevicesEvents';
import { isAudioOutputManagerEnabled as isManagerEnabled } from './modules/RTC/AudioOutputManager';
import type JitsiTrack from './modules/RTC/JitsiTrack';
import RTC from './modules/RTC/RTC';
import browser from './modules/browser';
import Listenable from './modules/util/Listenable';
import { IPermissionStatus, MediaPermissionState, PermissionDenialReason } from './service/RTC/MediaPermission';
import { MediaType } from './service/RTC/MediaType';
import { RTCEvents } from './service/RTC/RTCEvents';

const AUDIO_PERMISSION_NAME = 'microphone' as PermissionName;

/**
 * How long (in ms) after the user's answer at the prompt a change of the Permissions API to denied is that answer.
 */
const PROMPT_ANSWER_CHANGE_TIME = 2000;
const PERMISSION_GRANTED_STATUS = 'granted';
const VIDEO_PERMISSION_NAME = 'camera' as PermissionName;

/**
 * Media devices utilities for Jitsi.
 * @noInheritDoc
 */
export default class JitsiMediaDevices extends Listenable {
    private _initialized: boolean;
    private _permissions: { [key: string]: boolean; };
    private _permissionsApiStates: { [key: string]: PermissionState; };
    private _permissionsApiSupported: Promise<boolean>;
    private _permissionStatus: { [key: string]: IPermissionStatus; };
    private _userDenialTimes: { [key: string]: number; };

    /**
     * Initializes a `JitsiMediaDevices` object. There will be a single
     * instance of this class.
     */
    constructor() {
        super();
        this._initialized = false;
        this._permissions = {};
        this._permissionsApiStates = {};
        this._permissionsApiSupported = Promise.resolve(false);
        this._permissionStatus = {};
        this._userDenialTimes = {};
    }

    /**
     * Parses a PermissionState object and returns true for granted and false otherwise.
     *
     * @param {PermissionState} permissionStatus - The PermissionState object retrieved from the Permissions API.
     * @returns {boolean} - True for granted and false for denied.
     * @throws {TypeError}
     */
    private _parsePermissionState(permissionStatus: PermissionStatus = {} as PermissionStatus): boolean {
        const status = permissionStatus.state;

        if (typeof status !== 'string') {
            throw new TypeError();
        }

        return status === PERMISSION_GRANTED_STATUS;
    }

    /**
     * Updates the local granted/denied permissions cache. A permissions might be
     * granted, denied, or undefined. This is represented by having its media
     * type key set to `true` or `false` respectively.
     *
     * @param {Object} permissions - Object with the permissions.
     */
    private _handlePermissionsChange(permissions: { [key: string]: boolean; }): void {
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
                this.enumerateDevices(() => {
                    // Empty callback - device list update triggered
                });
            }
        }
    }

    /**
     * Updates the permission statuses and emits {@link JitsiMediaDevicesEvents.PERMISSION_STATUS_CHANGED} when one
     * of them changed.
     *
     * @param {Object} statuses - The new statuses, by media type.
     * @returns {void}
     */
    private _handlePermissionStatusChange(statuses: { [key: string]: IPermissionStatus; }): void {
        const changed = [ MediaType.AUDIO, MediaType.VIDEO ].filter(type => statuses[type]
            && (statuses[type].state !== this._permissionStatus[type]?.state
                || statuses[type].reason !== this._permissionStatus[type]?.reason));

        if (!changed.length) {
            return;
        }

        for (const type of changed) {
            this._permissionStatus[type] = statuses[type];
        }
        this.eventEmitter.emit(JitsiMediaDevicesEvents.PERMISSION_STATUS_CHANGED, Object.fromEntries(
            Object.entries(this._permissionStatus).map(([ type, status ]) => [ type, { ...status } ])));
    }

    /**
     * Updates the permission status from the state reported by the Permissions API.
     *
     * @param {MediaType} type - The media type.
     * @param {PermissionStatus} status - The status from the Permissions API.
     * @param {boolean} isChange - Whether the state changed, as opposed to being read for the first time.
     * @returns {void}
     */
    private _onPermissionsApiState(type: MediaType, status: PermissionStatus, isChange: boolean): void {
        const { state } = status;
        const current = this._permissionStatus[type];

        this._permissionsApiStates[type] = state;

        // A getUserMedia result from before the first read is more accurate, e.g. the Permissions API says granted
        // while the OS blocks the device.
        if (!isChange && current) {
            return;
        }

        // The change that follows a block at the prompt keeps the user as the reason, any later one is a block in the
        // site settings.
        const blockedAtPrompt = current?.reason === PermissionDenialReason.USER
            && Date.now() - this._userDenialTimes[type] < PROMPT_ANSWER_CHANGE_TIME;

        this._handlePermissionStatusChange({
            [type]: state === MediaPermissionState.DENIED
                ? {
                    reason: blockedAtPrompt ? PermissionDenialReason.USER : PermissionDenialReason.BROWSER,
                    state: MediaPermissionState.DENIED
                }
                : { state: state as MediaPermissionState }
        });
    }

    /**
     * Updates the permission statuses from a getUserMedia result. A user who closed the prompt without answering
     * will see it again, so the state follows the Permissions API when it still says prompt.
     *
     * @param {Object} statuses - The statuses derived from the getUserMedia result, by media type.
     * @returns {void}
     */
    private _onGumPermissionStatus(statuses: { [key: string]: IPermissionStatus; }): void {
        const adjusted: { [key: string]: IPermissionStatus; } = {};

        for (const [ type, status ] of Object.entries(statuses)) {
            const current = this._permissionStatus[type];
            const answeredAtPrompt = current?.reason === PermissionDenialReason.USER
                && (current.state === MediaPermissionState.DENIED
                    || Date.now() - this._userDenialTimes[type] < PROMPT_ANSWER_CHANGE_TIME);

            // The site is blocked once the user blocked it at the prompt, so a request that follows, e.g. a retry of
            // each device, fails at once, possibly before the Permissions API reports the block.
            if (status.reason === PermissionDenialReason.BROWSER && answeredAtPrompt) {
                adjusted[type] = {
                    reason: PermissionDenialReason.USER,
                    state: MediaPermissionState.DENIED
                };
                continue;
            }
            if (status.reason === PermissionDenialReason.USER) {
                this._userDenialTimes[type] = Date.now();
            }
            adjusted[type] = status.reason === PermissionDenialReason.USER
                    && this._permissionsApiStates[type] === MediaPermissionState.PROMPT
                ? { reason: status.reason, state: MediaPermissionState.PROMPT }
                : status;
        }

        this._handlePermissionStatusChange(adjusted);
    }

    /**
     * Initialize. Start listening for device changes and initialize permissions checks.
     * @internal
     */
    init(): void {
        if (this._initialized) {
            return;
        }
        this._initialized = true;

        RTC.addListener(
            RTCEvents.DEVICE_LIST_CHANGED,
            devices =>
                this.eventEmitter.emit(
                    JitsiMediaDevicesEvents.DEVICE_LIST_CHANGED,
                    devices));

        // We would still want to update the permissions cache in case the permissions API is not supported.
        RTC.addListener(
            RTCEvents.PERMISSIONS_CHANGED,
            (permissions, statuses) => {
                this._handlePermissionsChange(permissions);
                statuses && this._onGumPermissionStatus(statuses);
            });

        // Test if the W3C Permissions API is implemented and the 'camera' and 'microphone' permissions are
        // implemented. If supported add onchange listeners.
        this._permissionsApiSupported = new Promise(resolve => {
            if (!navigator.permissions) {
                resolve(false);

                return;
            }

            const promises: Promise<boolean>[] = [];

            promises.push(navigator.permissions.query({ name: VIDEO_PERMISSION_NAME })
                .then(status => {
                    this._handlePermissionsChange({
                        [MediaType.VIDEO]: this._parsePermissionState(status)
                    });
                    this._onPermissionsApiState(MediaType.VIDEO, status, false);
                    status.onchange = () => {
                        try {
                            this._handlePermissionsChange({
                                [MediaType.VIDEO]: this._parsePermissionState(status)
                            });
                            this._onPermissionsApiState(MediaType.VIDEO, status, true);
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
                    this._onPermissionsApiState(MediaType.AUDIO, status, false);
                    status.onchange = () => {
                        try {
                            this._handlePermissionsChange({
                                [MediaType.AUDIO]: this._parsePermissionState(status)
                            });
                            this._onPermissionsApiState(MediaType.AUDIO, status, true);
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
     * Executes callback with list of media devices connected.
     * @param {function} callback
     */
    enumerateDevices(callback: (devices: MediaDeviceInfo[]) => void): void {
        RTC.enumerateDevices(callback);
    }

    /**
     * Returns whether the audio output device is switched by the audio output manager (config audioOutput.manager),
     * which determines what {@link setAudioOutputDevice} resolves with.
     *
     * @returns {boolean}
     */
    isAudioOutputManagerEnabled(): boolean {
        return isManagerEnabled();
    }

    /**
     * Returns true if changing the input (camera / microphone) or output
     * (audio) device is supported and false if not.
     * @param {string} [deviceType] - type of device to change. Default is
     *      undefined or 'input', 'output' - for audio output device change.
     * @returns {boolean} true if available, false otherwise.
     */
    isDeviceChangeAvailable(deviceType?: string): boolean {
        return RTC.isDeviceChangeAvailable(deviceType);
    }

    /**
     * Checks if the permission for the given device was granted.
     *
     * @param {'audio'|'video'} [type] - type of devices to check,
     *      undefined stands for both 'audio' and 'video' together
     * @returns {Promise<boolean>}
     */
    isDevicePermissionGranted(type?: MediaType): Promise<boolean> {
        return new Promise(resolve => {
            // Shortcut: first check if we already know the permission was
            // granted.
            const types = type ? [ type ] : [ MediaType.AUDIO, MediaType.VIDEO ];

            if (types.every(t => t in this._permissions)) {
                resolve(types.every(t => this._permissions[t]));

                return;
            }

            // Check using the Permissions API.
            this._permissionsApiSupported.then(supported => {
                if (!supported) {
                    resolve(false);

                    return;
                }

                const promises: Promise<PermissionStatus>[] = [];

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
     * Gets the permission status of a capture device, combining the Permissions API with the getUserMedia results.
     *
     * @param {MediaType} type - The media type, audio or video.
     * @returns {Promise<IPermissionStatus|undefined>} - Undefined while nothing is known yet, e.g. when the
     * Permissions API isn't supported and getUserMedia wasn't called.
     */
    async getPermissionStatus(type: MediaType): Promise<IPermissionStatus | undefined> {
        await this._permissionsApiSupported;

        const status = this._permissionStatus[type];

        return status && { ...status };
    }

    /**
     * Returns true if it is possible to be simultaneously capturing audio from more than one device.
     *
     * @returns {boolean}
     */
    isMultipleAudioInputSupported(): boolean {
        return !(
            (browser.isFirefox() && browser.isVersionLessThan(101))
            || browser.isIosBrowser()
        );
    }

    /**
     * Returns currently used audio output device id, 'default' stands
     * for default device
     * @returns {string}
     */
    getAudioOutputDevice(): string {
        return RTC.getAudioOutputDevice();
    }

    /**
     * Sets current audio output device.
     * @param {string} deviceId - id of 'audiooutput' device from
     *      navigator.mediaDevices.enumerateDevices(), 'default' is for
     *      default device
     * @returns {Promise} - resolves when audio output is changed, is rejected
     *      otherwise. With the audio output manager (config audioOutput.manager), resolves once every audio element
     *      has switched, with the tracks that still play out of the previous device ([] when all switched), and is
     *      rejected, with nothing changed, when the device cannot be used or no element could be switched to it.
     *      A newer change then ends the running one, which rejects with an error named SupersededError.
     */
    setAudioOutputDevice(deviceId: string): Promise<JitsiTrack[] | void> {
        return RTC.setAudioOutputDevice(deviceId);
    }
}
