/**
 * Detect if provided VAD score and PCM data is considered noise.
 */
export default class VADNoiseDetection extends EventEmitter {
    /**
     * Creates <tt>VADNoiseDetection</tt>
     *
     * @constructor
     */
    constructor();
    /**
     * Flag which denotes the current state of the detection service i.e.if there is already a processing operation
     * ongoing.
     */
    _processing: boolean;
    /**
     * Buffer that keeps the VAD scores for a period of time.
     */
    _scoreArray: any[];
    /**
     * Buffer that keeps audio level samples for a period of time.
     */
    _audioLvlArray: any[];
    /**
     * Current state of the service, if it's not active no processing will occur.
     */
    _active: boolean;
    /**
     * Compute cumulative VAD score and PCM audio levels once the PROCESS_TIME_FRAME_SPAN_MS timeout has elapsed.
     * If the score is above the set threshold fire the event.
     * @returns {void}
     * @fires VAD_NOISY_DEVICE
     */
    _calculateNoisyScore(): void;
    /**
     * Record the vad score and average volume in the appropriate buffers.
     *
     * @param {number} vadScore
     * @param {number} avgAudioLvl - average audio level of the PCM sample associated with the VAD score.s
     */
    _recordValues(vadScore: number, avgAudioLvl: number): void;
    /**
     * Set the active state of the detection service and notify any listeners.
     *
     * @param {boolean} active
     * @fires DETECTOR_STATE_CHANGE
     */
    _setActiveState(active: boolean): void;
    /**
     * Change the state according to the muted status of the tracked device.
     *
     * @param {boolean} isMuted - Is the device muted or not.
     */
    changeMuteState(isMuted: boolean): void;
    /**
     * Check whether or not the service is active or not.
     *
     * @returns {boolean}
     */
    isActive(): boolean;
    /**
     * Reset the processing context, clear buffers, cancel the timeout trigger.
     *
     * @returns {void}
     */
    reset(): void;
    /**
     * Listens for {@link TrackVADEmitter} events and processes them.
     *
     * @param {Object} vadScore -VAD score emitted by {@link TrackVADEmitter}
     * @param {Date}   vadScore.timestamp - Exact time at which processed PCM sample was generated.
     * @param {number} vadScore.score - VAD score on a scale from 0 to 1 (i.e. 0.7)
     * @param {Float32Array} vadScore.pcmData - Raw PCM Data associated with the VAD score.
     * @param {string} vadScore.deviceId - Device id of the associated track.
     * @listens VAD_SCORE_PUBLISHED
     */
    processVADScore(vadScore: {
        timestamp: Date;
        score: number;
        pcmData: Float32Array;
        deviceId: string;
    }): void;
    _processTimeout: NodeJS.Timeout;
}
import { EventEmitter } from "events";
