import { getLogger } from '@jitsi/logger';

const logger = getLogger('modules/statistics/DominantSpeakerIdentification');

/**
 * Constants from the Java implementation
 */
const DECISION_INTERVAL_MS = 300;
const SPEAKER_IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes
const MAX_AUDIO_LEVEL = 127;
// const MIN_AUDIO_LEVEL = 0;

// Time interval parameters
const IMMEDIATE_FRAMES = 13;
const IMMEDIATE_THRESHOLD = 5;
const IMMEDIATE_C = 3.0;

const MEDIUM_FRAMES = 7;
const MEDIUM_C = 2.0;

// const LONG_BLOCKS = 10;
// const LONG_THRESHOLD = 4;
const LONG_C = 0.0;

/**
 * Speaker state tracking
 */
class Speaker {
    private _audioLevels: number[];
    private _lastActivity: number;
    private _ssrc: number;
    private _timeProvider: () => number;

    energyScore: number;
    immediateActivity: number;
    longActivity: number;
    mediumActivity: number;
    mediumBlocks: number[];
    minLevel: number;

    /**
     * Creates a new instance of a Speaker.
     *
     * @param ssrc - The SSRC of the speaker
     * @param timeProvider - Function to get current time
     */
    constructor(ssrc: number, timeProvider: () => number) {
        this._audioLevels = [];
        this._lastActivity = timeProvider();
        this._ssrc = ssrc;
        this._timeProvider = timeProvider;
        this.energyScore = 0;
        this.immediateActivity = 0;
        this.longActivity = 0;
        this.mediumActivity = 0;
        this.mediumBlocks = [];
        this.minLevel = MAX_AUDIO_LEVEL;

    }

    get audioLevels() {
        return this._audioLevels;
    }

    get ssrc() {
        return this._ssrc;
    }

    /**
     * Add audio level measurement.
     *
     * @param level - The audio level (0-127)
     * @returns {void}
     */
    addAudioLevel(level: number) {
        this._audioLevels.push(level);
        this._lastActivity = this._timeProvider();

        // Update minimum level
        this.minLevel = Math.min(this.minLevel, level);

        // Keep only recent levels (immediate interval)
        if (this.audioLevels.length > IMMEDIATE_FRAMES) {
            this.audioLevels.shift();
        }

        // Update energy score with exponential smoothing
        const alpha = 0.1;

        this.energyScore = alpha * level + (1 - alpha) * this.energyScore;
    }

    /**
     * Check if speaker is active based on audio level.
     *
     * @param level - The audio level (0-127).
     * @returns {boolean} - True if the speaker is active, false otherwise.
     */
    isActive(level: number): boolean {
        // If we haven't seen any audio levels yet, use a simple threshold
        if (this.minLevel === MAX_AUDIO_LEVEL) {
            return level > 10; // Simple threshold for initial activity detection
        }

        const threshold = this.minLevel + (MAX_AUDIO_LEVEL - this.minLevel) * 0.1;

        return level > threshold;
    }

    /**
     * Check if speaker has been idle too long.
     *
     * @returns {boolean} - True if the speaker is idle, false otherwise.
     */
    isIdle(): boolean {
        return this._timeProvider() - this._lastActivity > SPEAKER_IDLE_TIMEOUT_MS;
    }
}

/**
 * Dominant Speaker Identification implementation
 * Based on "Dominant Speaker Identification for Multipoint Videoconferencing" paper
 */
export default class DominantSpeakerIdentification {
    private _currentDominantSpeaker: number | null;
    private _lastDecisionTime: number;
    private _speakers: Map<number, Speaker>;
    private _timeProvider: () => number;

    constructor(timeProvider?: () => number) {
        this._currentDominantSpeaker = null;
        this._lastDecisionTime = 0;
        this._speakers = new Map();
        this._timeProvider = timeProvider || (() => Date.now());
    }

    /**
     * Get current time - can be overridden for testing.
     * @returns {number} Current timestamp
     */
    private getCurrentTime(): number {
        return this._timeProvider();
    }

    /**
     * Returns the current dominant speaker SSRC.
     *
     * @return {number|null} - The SSRC of the current dominant speaker, or null if none.
     * @readonly
     */
    get currentDominantSpeaker(): number | null {
        return this._currentDominantSpeaker;
    }

    /**
     * Returns the map of tracked speakers.
     *
     * @return {Map<number, Speaker>} - The map of speakers keyed by SSRC.
     * @readonly
     */
    get speakers(): Map<number, Speaker> {
        return this._speakers;
    }

    /**
     * Sets the current dominant speaker SSRC.
     * Only used for testing purposes.
     *
     * @param {number|null} ssrc - The SSRC of the new dominant speaker, or null if none.
     * @internal
     */
    set currentDominantSpeaker(ssrc: number) {
        if (this._currentDominantSpeaker !== ssrc) {
            this._currentDominantSpeaker = ssrc;
        }
    }

    /**
     * Calculates binomial coefficient.
     */
    binomialCoeff(n: number, k: number): number {
        if (k > n) return 0;
        if (k === 0 || k === n) return 1;

        let result = 1;

        for (let i = 1; i <= k; i++) {
            result = result * (n - i + 1) / i;
        }

        return result;
    }

    /**
     * Calculates speech activity score for immediate interval.
     *
     * @param {Speaker} speaker - The speaker object.
     * @returns {number} - The immediate activity score.
     */
    calculateImmediateActivity(speaker: Speaker): number {
        if (speaker.audioLevels.length < IMMEDIATE_THRESHOLD) {
            return 0;
        }

        let activeFrames = 0;

        for (const level of speaker.audioLevels) {
            if (speaker.isActive(level)) {
                activeFrames++;
            }
        }

        if (activeFrames >= IMMEDIATE_THRESHOLD) {
            const coeff = this.binomialCoeff(speaker.audioLevels.length, activeFrames);

            return coeff > 0 ? Math.log(coeff) : 0;
        }

        return 0;
    }

    /**
     * Calculates speech activity score for medium interval.
     *
     * @param speaker - The speaker object.
     * @returns {number} - The medium activity score.
     */
    calculateMediumActivity(speaker: Speaker): number {
        // Medium interval is based on immediate intervals
        const immediateScore = this.calculateImmediateActivity(speaker);

        // Add to medium blocks
        speaker.mediumBlocks.push(immediateScore > 0 ? 1 : 0);

        // Keep only recent medium blocks
        if (speaker.mediumBlocks.length > MEDIUM_FRAMES) {
            speaker.mediumBlocks.shift();
        }

        if (speaker.mediumBlocks.length < MEDIUM_FRAMES) {
            return 0;
        }

        const activeBlocks = speaker.mediumBlocks.reduce((sum, block) => sum + block, 0);

        if (activeBlocks >= Math.ceil(MEDIUM_FRAMES * 0.6)) {
            const coeff = this.binomialCoeff(speaker.mediumBlocks.length, Math.ceil(MEDIUM_FRAMES * 0.6));

            return coeff > 0 ? Math.log(coeff) : 0;
        }

        return 0;
    }

    /**
     * Calculates speech activity score for long interval.
     *
     * @param {Speakerspeaker - The speaker object.
     * @returns {number} - The long activity score.
     */
    calculateLongActivity(speaker: Speaker): number {
        const mediumScore = this.calculateMediumActivity(speaker);

        return mediumScore > 0 ? mediumScore : 0;
    }

    /**
     * Removes speakers that have been idle too long.
     *
     * @returns {void}
     */
    cleanupIdleSpeakers(): void {
        for (const [ ssrc, speaker ] of this._speakers) {
            if (speaker.isIdle()) {
                this._speakers.delete(ssrc);
                if (this._currentDominantSpeaker === ssrc) {
                    this._currentDominantSpeaker = null;
                }
            }
        }
    }

    /**
     * Calculates combined activity score for a speaker.
     *
     * @param {Speaker} speaker - The speaker object.
     * @returns {number} - The combined activity score.
     */
    getCombinedActivity(speaker: Speaker): number {
        return (speaker.immediateActivity * IMMEDIATE_C) + (speaker.mediumActivity * MEDIUM_C)
            + (speaker.longActivity * LONG_C);
    }

    /**
     * Determines the dominant speaker.
     *
     * @return {number|null} - The SSRC of the dominant speaker, or null if none.
     */
    getDominantSpeaker(): number | null {
        const now = this.getCurrentTime();

        // Only make decisions at specified intervals
        if (now - this._lastDecisionTime < DECISION_INTERVAL_MS) {
            return this._currentDominantSpeaker;
        }

        this._lastDecisionTime = now;

        if (this._speakers.size === 0) {
            this._currentDominantSpeaker = null;

            return null;
        }

        let bestSpeaker = null;
        let bestScore = -1;

        // Find speaker with highest combined activity
        for (const [ ssrc, speaker ] of this._speakers) {
            const score = this.getCombinedActivity(speaker);

            if (score > bestScore) {
                bestScore = score;
                bestSpeaker = ssrc;
            }
        }

        // Require significant activity to be considered dominant
        const MIN_ACTIVITY_THRESHOLD = 0.01;

        if (bestScore < MIN_ACTIVITY_THRESHOLD) {
            bestSpeaker = null;
        }

        // Only change dominant speaker if there's a clear winner
        const CHANGE_THRESHOLD = 1.2;

        if (this._currentDominantSpeaker && bestSpeaker !== this._currentDominantSpeaker && bestSpeaker !== null) {
            const currentSpeaker = this._speakers.get(this._currentDominantSpeaker);
            const currentScore = currentSpeaker ? this.getCombinedActivity(currentSpeaker) : 0;

            if (bestScore < currentScore * CHANGE_THRESHOLD) {
                return this._currentDominantSpeaker;
            }
        }

        const previousDominant = this._currentDominantSpeaker;

        this._currentDominantSpeaker = bestSpeaker;

        // Log speaker changes
        if (previousDominant !== this._currentDominantSpeaker) {
            logger.debug(`Dominant speaker changed from ${previousDominant} to ${this._currentDominantSpeaker}`);
        }

        return this._currentDominantSpeaker;
    }

    /**
     * Returns the current speaker statistics for debugging purposes.
     *
     * @returns {object} - The speaker statistics.
     */
    getSpeakerStats(): object {
        const stats = {};

        for (const [ ssrc, speaker ] of this._speakers) {
            stats[ssrc] = {
                combinedActivity: this.getCombinedActivity(speaker),
                energyScore: speaker.energyScore,
                immediateActivity: speaker.immediateActivity,
                longActivity: speaker.longActivity,
                mediumActivity: speaker.mediumActivity,
                minLevel: speaker.minLevel,
                recentLevels: speaker.audioLevels.slice(-5)
            };
        }

        return stats;
    }

    /**
     * Processes audio level for a speaker.
     *
     * @param {number} ssrc - The SSRC of the speaker.
     * @param {number} audioLevel - The audio level (0-127).
     * @returns {void}
     */
    processAudioLevel(ssrc: number, audioLevel: number): void {
        // Get or create speaker
        if (!this._speakers.has(ssrc)) {
            this._speakers.set(ssrc, new Speaker(ssrc, this._timeProvider));
        }

        const speaker = this._speakers.get(ssrc);

        speaker.addAudioLevel(audioLevel);

        // Update activity scores
        speaker.immediateActivity = this.calculateImmediateActivity(speaker);
        speaker.mediumActivity = this.calculateMediumActivity(speaker);
        speaker.longActivity = this.calculateLongActivity(speaker);

        // Clean up idle speakers
        this.cleanupIdleSpeakers();
    }
}
