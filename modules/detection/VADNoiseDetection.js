import { EventEmitter } from 'events';

import { VAD_NOISY_DEVICE } from './DetectionEvents';

/**
 * The average value VAD needs to be under over a period of time to be considered noise.
 * @type {number}
 */
const VAD_NOISE_AVG_THRESHOLD = 0.3;

/**
 * The average values that audio input need to be over to be considered loud.
 * @type {number}
 */
const NOISY_AUDIO_LEVEL_THRESHOLD = 0.010;

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

        this._calculateVADScore = this._calculateVADScore.bind(this);
    }

    /**
     * Calculates the average value of a Float32Array.
     *
     * @param {Float32Array} scoreArray - Array of vad scores.
     * @returns {number} - Score average.
     */
    _calculateAverage(scoreArray) {
        return scoreArray.length > 0 ? scoreArray.reduce((a, b) => a + b) / scoreArray.length : 0;
    }

    /**
     * Returns only the positive values from a pcm data array.
     *
     * @param {Float32Array} scoreArray - Array of vad scores.
     * @returns {number} - Score average.
     */
    _filterPositiveAudioLevels(pcmData) {
        return pcmData.filter(sample => sample >= 0);

    }

    /**
     * Compute cumulative VAD score and PCM audio levels once the PROCESS_TIME_FRAME_SPAN_MS timeout has elapsed.
     * If the score is above the set threshold fire the event.
     * @returns {void}
     * @fires VAD_NOISY_DEVICE
     */
    _calculateVADScore() {
        const scoreAvg = this._calculateAverage(this._scoreArray);
        const audioLevelAvg = this._calculateAverage(this._audioLvlArray);

        if (scoreAvg < VAD_NOISE_AVG_THRESHOLD && audioLevelAvg > NOISY_AUDIO_LEVEL_THRESHOLD) {
            this.emit(VAD_NOISY_DEVICE, {});

            this._active = false;
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
     *  Detection only needs to work when the microphone is not muted.
     *
     * @param {*} isMuted
     */
    changeMuteState(isMuted) {
        this._active = !isMuted;
        this.reset();
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
            const posAudioLevels = this._filterPositiveAudioLevels(vadScore.pcmData);

            this._recordValues(vadScore.score, this._calculateAverage(posAudioLevels));

            return;
        }

        // If the VAD score for the sample is low and audio level has a high enough level we can start listening for
        // noise
        if (vadScore.score < VAD_SCORE_TRIGGER) {

            const posAudioLevels = this._filterPositiveAudioLevels(vadScore.pcmData);
            const avgAudioLvl = this._calculateAverage(posAudioLevels);

            if (avgAudioLvl > AUDIO_LEVEL_SCORE_TRIGGER) {
                this._processing = true;
                this._recordValues(vadScore.score, avgAudioLvl);

                // Once the preset timeout executes the final score will be caculated.
                this._processTimeout = setTimeout(this._calculateVADScore, PROCESS_TIME_FRAME_SPAN_MS);

            }
        }
    }
}
