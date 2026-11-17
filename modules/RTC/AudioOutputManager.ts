import { getLogger } from '@jitsi/logger';

import { JitsiTrackEvents } from '../../JitsiTrackEvents';

import type JitsiTrack from './JitsiTrack';

const logger = getLogger('rtc:AudioOutputManager');

/**
 * How long switching an element to another audio output device may take before it counts as failed, in ms.
 */
export const DEFAULT_SWITCH_TIMEOUT = 5000;

export interface IAudioOutputOptions {
    switchTimeout?: number;
}

interface ISwitchResult {
    errors: Error[];
    failed: JitsiTrack[];
    switched: number;
}

// Changes when an audio output is added, removed or renamed, including an entry for the default output that names the
// OS default in its label.
const getAudioOutputsKey = (devices: MediaDeviceInfo[]) => devices
    .filter(device => device.kind === 'audiooutput')
    .map(({ deviceId, groupId, label }) => `${deviceId}|${groupId}|${label}`)
    .sort()
    .join();

// The application selects the default output as 'default'; the Audio Output Devices API uses '' for it.
const isDefault = (deviceId?: string) => !deviceId || deviceId === 'default';

const isSinkApplied = (element: HTMLMediaElement, deviceId: string) =>
    element.sinkId === deviceId || (isDefault(element.sinkId) && isDefault(deviceId));

/**
 * Keeps every element that plays audio on the selected audio output device, and reports the ones that could not be
 * switched to it.
 */
export class AudioOutputManager {
    private _audioOutputsKey?: string;
    private _changing = false;
    private _deviceId = 'default';
    private _elements = new Map<HTMLMediaElement, JitsiTrack | undefined>();
    private _enabled = false;
    private _pendingDevices?: MediaDeviceInfo[];
    private _queue: Promise<unknown> = Promise.resolve();
    private _selection = 0;
    private _switchTimeout = DEFAULT_SWITCH_TIMEOUT;

    /**
     * Whether the audio output device is switched by this manager.
     *
     * @returns {boolean}
     */
    get enabled(): boolean {
        return this._enabled;
    }

    /**
     * Runs a change of the audio output device once the changes before it have finished. A change that a newer one
     * replaced while it waited rejects without changing anything.
     *
     * @param {string} deviceId - The device id.
     * @param {number} selection - The number of the change.
     * @returns {Promise<JitsiTrack[]>}
     */
    private async _changeDevice(deviceId: string, selection: number): Promise<JitsiTrack[]> {
        if (selection !== this._selection) {
            throw new DOMException(`The audio output change to ${deviceId} was superseded`, 'SupersededError');
        }

        const previous = this._deviceId;

        this._changing = true;
        try {
            // A new element, so that the device is checked even if it was the last one checked.
            await this._switchElement(document.createElement('audio'), deviceId);
            this._deviceId = deviceId;

            const { errors, failed, switched } = await this._switchAll(deviceId);

            if (errors.length && !switched) {
                this._deviceId = previous;
                this._reconcile();
                throw errors[0];
            }
            logger.info(`Audio output set to ${deviceId}, ${failed.length} track(s) did not switch`);

            return failed;
        } finally {
            this._changing = false;

            // A device list that changed during this change is handled now, or by a newer change that is waiting.
            const devices = this._pendingDevices;

            if (devices && selection === this._selection) {
                this._pendingDevices = undefined;
                this.onDeviceListChanged(devices);
            }
        }
    }

    /**
     * Handles a switch that settled after it was reported as failed. Browsers can't cancel it, so the element may
     * have landed on the selected device, which its track is told about, or on one that is no longer selected, in
     * which case it is switched again.
     *
     * @param {HTMLMediaElement} element - The element.
     * @param {string} deviceId - The device it switched to.
     * @returns {void}
     */
    private _onLateSwitch(element: HTMLMediaElement, deviceId: string): void {
        logger.info(`${element.id} switched to audio output ${deviceId} after the time limit`);
        if (!this._elements.has(element)) {
            return;
        }
        if (isSinkApplied(element, this._deviceId)) {
            this._elements.get(element)?.emit(JitsiTrackEvents.TRACK_AUDIO_OUTPUT_CHANGED, this._deviceId);
        } else {
            this._switchElement(element, this._deviceId).catch(() => undefined);
        }
    }

    /**
     * Moves the elements that are not on the selected device back to it, e.g. the ones attached while a change was
     * being reverted.
     *
     * @returns {void}
     */
    private _reconcile(): void {
        for (const element of this._elements.keys()) {
            !isSinkApplied(element, this._deviceId)
                && this._switchElement(element, this._deviceId).catch(() => undefined);
        }
    }

    /**
     * Reloads the stream of an element whose switch was aborted. An element can stay silent after an aborted switch
     * while media keeps arriving; reassigning srcObject rebuilds its playback on the current device.
     *
     * @param {HTMLMediaElement} element - The element.
     * @param {MediaProvider|null} stream - The stream the element played when the switch started.
     * @param {Error} error - The switch error.
     * @returns {void}
     */
    private _reload(element: HTMLMediaElement, stream: MediaProvider | null, error: Error): void {
        // Other errors reject before switching; a detached element or one given another stream is left alone.
        if (error?.name !== 'AbortError' || !stream || element.srcObject !== stream) {
            return;
        }

        const wasPlaying = !element.paused;

        logger.info(`Reloading the stream of ${element.id} after a failed audio output device change`);
        element.srcObject = null;
        element.srcObject = stream;
        wasPlaying && element.play()?.catch(e => logger.warn(`Failed to resume ${element.id}`, e));
    }

    /**
     * Switches every element to a device and reports each track's outcome with
     * {@link JitsiTrackEvents.TRACK_AUDIO_OUTPUT_CHANGED} and {@link JitsiTrackEvents.TRACK_AUDIO_OUTPUT_FAILED}.
     *
     * @param {string} deviceId - The device id.
     * @returns {Promise<ISwitchResult>}
     */
    private async _switchAll(deviceId: string): Promise<ISwitchResult> {
        const entries = [ ...this._elements ];
        const results = await Promise.allSettled(entries.map(([ element ]) => this._switchElement(element, deviceId)));
        const errors: Error[] = [];
        const failures = new Map<JitsiTrack, Error>();
        const switched = new Set<JitsiTrack>();

        results.forEach((result, i) => {
            const track = entries[i][1];

            if (result.status === 'fulfilled') {
                track && switched.add(track);
            } else {
                errors.push(result.reason);
                track && !failures.has(track) && failures.set(track, result.reason);
            }
        });
        switched.forEach(track => track.emit(JitsiTrackEvents.TRACK_AUDIO_OUTPUT_CHANGED, deviceId));
        failures.forEach((error, track) => track.emit(JitsiTrackEvents.TRACK_AUDIO_OUTPUT_FAILED, error));

        return {
            errors,
            failed: [ ...failures.keys() ],
            switched: results.length - errors.length
        };
    }

    /**
     * Switches an element to a device. A switch that has not settled after the switch timeout is rejected.
     *
     * @param {HTMLMediaElement} element - The element.
     * @param {string} deviceId - The device id.
     * @returns {Promise<void>}
     */
    private _switchElement(element: HTMLMediaElement, deviceId: string): Promise<void> {
        if (isSinkApplied(element, deviceId)) {
            return Promise.resolve();
        }

        const stream = element.srcObject;
        const switching = element.setSinkId(isDefault(deviceId) ? '' : deviceId);
        let timeout: number | undefined;

        return Promise.race([
            switching,
            new Promise<void>((_, reject) => {
                timeout = window.setTimeout(() => {
                    reject(new DOMException(`setSinkId did not settle in ${this._switchTimeout} ms`, 'TimeoutError'));
                    switching.then(
                        () => this._onLateSwitch(element, deviceId),
                        error => logger.info(`${element.id} failed to switch to ${deviceId} after the time limit`,
                            error));
                }, this._switchTimeout);
            })
        ])
            .finally(() => window.clearTimeout(timeout))
            .catch(error => {
                logger.warn(`Failed to switch ${element.id} to audio output ${deviceId}`, error);
                this._reload(element, stream, error);

                throw error;
            });
    }

    /**
     * Makes an element follow the selected audio output device while it plays audio. The caller has already assigned
     * the stream to the element.
     *
     * @param {HTMLMediaElement} element - The element.
     * @param {MediaStream|null} stream - The element's new stream, null when it is detached.
     * @param {JitsiTrack} [track] - The track the stream belongs to.
     * @returns {Promise<void>} - Rejected when the element could not be switched to the selected device.
     */
    public attach(element: HTMLMediaElement, stream: MediaStream | null, track?: JitsiTrack): Promise<void> {
        if (!stream?.getAudioTracks().length) {
            this._elements.delete(element);

            return Promise.resolve();
        }
        this._elements.set(element, track);

        return this._switchElement(element, this._deviceId);
    }

    /**
     * Starts switching the audio output device through this manager.
     *
     * @param {IAudioOutputOptions} options - The options.
     * @returns {void}
     */
    public enable({ switchTimeout }: IAudioOutputOptions = {}): void {
        this._enabled = true;
        if (typeof switchTimeout === 'number' && switchTimeout > 0) {
            this._switchTimeout = switchTimeout;
        }
        logger.info(`Enabled, switch timeout ${this._switchTimeout} ms`);
    }

    /**
     * Returns the selected audio output device.
     *
     * @returns {string}
     */
    public getDevice(): string {
        return this._deviceId;
    }

    /**
     * Switches the elements again when the audio output devices change, e.g. the OS default output.
     *
     * @param {MediaDeviceInfo[]} devices - The available devices.
     * @returns {void}
     */
    public onDeviceListChanged(devices: MediaDeviceInfo[] = []): void {
        // Handled once the running change has finished, so that the elements aren't switched twice meanwhile.
        if (this._changing) {
            this._pendingDevices = devices;

            return;
        }

        const audioOutputsKey = getAudioOutputsKey(devices);

        if (audioOutputsKey === this._audioOutputsKey) {
            return;
        }
        this._audioOutputsKey = audioOutputsKey;

        // The selected output was unplugged; the application picks another one.
        if (!isDefault(this._deviceId)
                && !devices.some(device => device.kind === 'audiooutput' && device.deviceId === this._deviceId)) {
            return;
        }
        this._switchAll(this._deviceId)
            .catch(error => logger.warn('Failed to switch the audio output after the devices changed', error));
    }

    /**
     * Selects an audio output device and switches every element to it. Changes run one after the other.
     *
     * @param {string} deviceId - The device id, 'default' for the default device.
     * @returns {Promise<JitsiTrack[]>} - Resolves with the tracks that still play out of the previous device, [] when
     * every element switched. Rejected, with nothing changed, when the device cannot be used or no element could be
     * switched to it, and with an error named SupersededError when a newer change replaced it before it started.
     */
    public setDevice(deviceId: string): Promise<JitsiTrack[]> {
        const selection = ++this._selection;
        const change = this._queue.then(() => this._changeDevice(deviceId, selection));

        this._queue = change.catch(() => undefined);

        return change;
    }
}

const audioOutputManager = new AudioOutputManager();

/**
 * Returns whether the audio output device is switched by the audio output manager (config audioOutput.manager).
 *
 * @returns {boolean}
 */
export function isAudioOutputManagerEnabled(): boolean {
    return audioOutputManager.enabled;
}

export default audioOutputManager;
