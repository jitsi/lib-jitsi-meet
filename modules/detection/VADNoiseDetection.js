import { EventEmitter } from 'events';

import { calculateAverage, filterPositiveValues } from '../util/MathUtil';

import { VAD_NOISY_DEVICE, DETECTOR_STATE_CHANGE } from './DetectionEvents';

/**
 * The average value VAD needs to be under over a period of time to be considered noise.
 * @type {number}
 */
const VAD_NOISE_AVG_THRESHOLD = 0.2;

/**
 * The average values that audio input need to be over to be considered loud.
 * @type {number}
 */
const NOISY_AUDIO_LEVEL_THRESHOLD = 0.040;

/**
 * The value that a VAD score needs to be under in order for processing to begin.
 * @type {number}
 */
const VAD_SCORE_TRIGGER = 0.2;

/**
 * The value that a VAD score needs to be under in order for processing to begin.
 * @type {number}
 */
const AUDIO_LEVEL_SCORE_TRIGGER = 0.020;

/**
 * Time span over which we calculate an average score used to determine if we trigger the event.
 * @type {number}
 */
const PROCESS_TIME_FRAME_SPAN_MS = 1500;

/**
 * Detect if provided VAD score and PCM data is considered noise.
 */
export default class VADNoiseDetection extends EventEmitter {
    /**
     * Creates <tt>VADNoiseDetection</tt>
     *
     * @constructor
     */
    constructor() {
        super();

        /**
         * Flag which denotes the current state of the detection service i.e.if there is already a processing operation
         * ongoing.
         */
        this._processing = false;

        /**
         * Buffer that keeps the VAD scores for a period of time.
         */
        this._scoreArray = [];

        /**
         * Buffer that keeps audio level samples for a period of time.
         */
        this._audioLvlArray = [];

        /**
         * Current state of the service, if it's not active no processing will occur.
         */
        this._active = false;

        this._calculateNoisyScore = this._calculateNoisyScore.bind(this);
    }

    /**
     * Compute cumulative VAD score and PCM audio levels once the PROCESS_TIME_FRAME_SPAN_MS timeout has elapsed.
     * If the score is above the set threshold fire the event.
     * @returns {void}
     * @fires VAD_NOISY_DEVICE
     */
    _calculateNoisyScore() {
        const scoreAvg = calculateAverage(this._scoreArray);
        const audioLevelAvg = calculateAverage(this._audioLvlArray);

        if (scoreAvg < VAD_NOISE_AVG_THRESHOLD && audioLevelAvg > NOISY_AUDIO_LEVEL_THRESHOLD) {
            this.emit(VAD_NOISY_DEVICE);

            this._setActiveState(false);
        }

        // We reset the context in case a new process phase needs to be triggered.
        this.reset();
    }

    /**
     * Record the vad score and average volume in the appropriate buffers.
     *
     * @param {number} vadScore
     * @param {number} avgAudioLvl - average audio level of the PCM sample associated with the VAD score.s
     */
    _recordValues(vadScore, avgAudioLvl) {
        this._scoreArray.push(vadScore);
        this._audioLvlArray.push(avgAudioLvl);
    }

    /**
     * Set the active state of the detection service and notify any listeners.
     *
     * @param {boolean} active
     * @fires DETECTOR_STATE_CHANGE
     */
    _setActiveState(active) {
        this._active = active;
        this.emit(DETECTOR_STATE_CHANGE, this._active);
    }

    /**
     * Change the state according to the muted status of the tracked device.
     *
     * @param {boolean} isMuted - Is the device muted or not.
     */
    changeMuteState(isMuted) {
        // This service only needs to run when the microphone is not muted.
        this._setActiveState(!isMuted);
        this.reset();
    }

    /**
     * Check whether or not the service is active or not.
     *
     * @returns {boolean}
     */
    isActive() {
        return this._active;
    }

    /**
     * Reset the processing context, clear buffers, cancel the timeout trigger.
     *
     * @returns {void}
     */
    reset() {
        this._processing = false;
        this._scoreArray = [];
        this._audioLvlArray = [];
        clearTimeout(this._processTimeout);
    }

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
    processVADScore(vadScore) {
        if (!this._active) {
            return;
        }

        // There is a processing phase on going, add score to buffer array.
        if (this._processing) {
            // Filter and calculate sample average so we don't have to process one large array at a time.
            const posAudioLevels = filterPositiveValues(vadScore.pcmData);

            this._recordValues(vadScore.score, calculateAverage(posAudioLevels));

            return;
        }

        // If the VAD score for the sample is low and audio level has a high enough level we can start listening for
        // noise
        if (vadScore.score < VAD_SCORE_TRIGGER) {
            const posAudioLevels = filterPositiveValues(vadScore.pcmData);
            const avgAudioLvl = calculateAverage(posAudioLevels);

            if (avgAudioLvl > AUDIO_LEVEL_SCORE_TRIGGER) {
                this._processing = true;
                this._recordValues(vadScore.score, avgAudioLvl);

                // Once the preset timeout executes the final score will be calculated.
                this._processTimeout = setTimeout(this._calculateNoisyScore, PROCESS_TIME_FRAME_SPAN_MS);
            }
        }
    }
}
