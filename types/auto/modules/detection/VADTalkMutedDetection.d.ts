/**
 * Detect if provided VAD score which is generated on a muted device is voice and fires an event.
 */
export default class VADTalkMutedDetection extends EventEmitter {
    /**
     * Creates <tt>VADTalkMutedDetection</tt>
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
     * Current mute state of the audio track being monitored.
     */
    _active: boolean;
    /**
     * Compute cumulative VAD score function called once the PROCESS_TIME_FRAME_SPAN_MS timeout has elapsed.
     * @returns {void}
     * @fires VAD_TALK_WHILE_MUTED
     */
    _calculateVADScore(): void;
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
     * Listens for {@link TrackVADEmitter} events and processes them.
     *
     * @param {Object} vadScore -VAD score emitted by {@link TrackVADEmitter}
     * @param {Date}   vadScore.timestamp - Exact time at which processed PCM sample was generated.
     * @param {number} vadScore.score - VAD score on a scale from 0 to 1 (i.e. 0.7)
     * @param {string} vadScore.deviceId - Device id of the associated track.
     * @listens VAD_SCORE_PUBLISHED
     */
    processVADScore(vadScore: {
        timestamp: Date;
        score: number;
        deviceId: string;
    }): void;
    _processTimeout: NodeJS.Timeout;
    /**
     * Reset the processing context, clear buffer, cancel the timeout trigger.
     *
     * @returns {void}
     */
    reset(): void;
}
import { EventEmitter } from "events";
