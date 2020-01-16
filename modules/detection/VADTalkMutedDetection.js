import { EventEmitter } from 'events';

import { calculateAverage } from '../util/MathUtil';

import { VAD_TALK_WHILE_MUTED, DETECTOR_STATE_CHANGE } from './DetectionEvents';


/**
 * The threshold which the average VAD values for a span of time needs to exceed to trigger an event.
 * @type {number}
 */
const VAD_AVG_THRESHOLD = 0.6;

/**
 * The VAD score needed to trigger the processing algorithm, i.e. if a sample has the VAD score >= VAD_VOICE_LEVEL
 * we start processing all scores for a time span defined by const PROCESS_TIME_FRAME_SPAN_MS.
 * @type {number}
 */
const VAD_VOICE_LEVEL = 0.9;

/**
 * Sample rate of TrackVADEmitter, it defines how many audio samples are processed at a time.
 * @type {number}
 */

/**
 * Time span over which we calculate an average score used to determine if we trigger the event.
 * @type {number}
 */
const PROCESS_TIME_FRAME_SPAN_MS = 700;

/**
 * Detect if provided VAD score which is generated on a muted device is voice and fires an event.
 */
export default class VADTalkMutedDetection extends EventEmitter {
    /**
     * Creates <tt>VADTalkMutedDetection</tt>
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
         * Current mute state of the audio track being monitored.
         */
        this._active = false;

        this._calculateVADScore = this._calculateVADScore.bind(this);
    }

    /**
     * Compute cumulative VAD score function called once the PROCESS_TIME_FRAME_SPAN_MS timeout has elapsed.
     * @returns {void}
     * @fires VAD_TALK_WHILE_MUTED
     */
    _calculateVADScore() {
        const score = calculateAverage(this._scoreArray);

        if (score > VAD_AVG_THRESHOLD) {
            this.emit(VAD_TALK_WHILE_MUTED);

            // Event was fired. Stop event emitter and remove listeners so no residue events kick off after this point
            // and a single VAD_TALK_WHILE_MUTED is generated per mic muted state.
            this._setActiveState(false);
        }

        // We reset the context in case a new process phase needs to be triggered.
        this.reset();
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
        // This service only needs to run when the microphone is muted.
        this._setActiveState(isMuted);
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
     * Listens for {@link TrackVADEmitter} events and processes them.
     *
     * @param {Object} vadScore -VAD score emitted by {@link TrackVADEmitter}
     * @param {Date}   vadScore.timestamp - Exact time at which processed PCM sample was generated.
     * @param {number} vadScore.score - VAD score on a scale from 0 to 1 (i.e. 0.7)
     * @param {string} vadScore.deviceId - Device id of the associated track.
     * @listens VAD_SCORE_PUBLISHED
     */
    processVADScore(vadScore) {
        if (!this._active) {
            return;
        }

        // There is a processing phase on going, add score to buffer array.
        if (this._processing) {
            this._scoreArray.push(vadScore.score);

            return;
        }

        // Because we remove all listeners on the vadEmitter once the main event is triggered,
        // there is no need to check for rogue events.
        if (vadScore.score > VAD_VOICE_LEVEL) {
            this._processing = true;
            this._scoreArray.push(vadScore.score);

            // Start gathering VAD scores for the configured period of time.
            this._processTimeout = setTimeout(this._calculateVADScore, PROCESS_TIME_FRAME_SPAN_MS);
        }
    }

    /**
     * Reset the processing context, clear buffer, cancel the timeout trigger.
     *
     * @returns {void}
     */
    reset() {
        this._processing = false;
        this._scoreArray = [];
        clearTimeout(this._processTimeout);
    }
}
