export = SpeakerStats;
/**
 * A model for keeping track of each user's total
 * time as a dominant speaker. The model also
 * keeps track of the user's last known name
 * in case the user has left the meeting,
 * which is also tracked.
 */
declare class SpeakerStats {
    /**
     * Initializes a new SpeakerStats instance.
     *
     * @constructor
     * @param {string} userId - The id of the user being tracked.
     * @param {string} displayName - The name of the user being tracked.
     * @param {boolean} isLocalStats - True if the stats model tracks
     * the local user.
     * @returns {void}
     */
    constructor(userId: string, displayName: string, isLocalStats: boolean);
    _userId: string;
    _isLocalStats: boolean;
    totalDominantSpeakerTime: number;
    _dominantSpeakerStart: number;
    _hasLeft: boolean;
    _faceExpressions: {
        happy: number;
        neutral: number;
        surprised: number;
        angry: number;
        fearful: number;
        disgusted: number;
        sad: number;
    };
    /**
     * Get the user id being tracked.
     *
     * @returns {string} The user id.
     */
    getUserId(): string;
    /**
     * Get the name of the user being tracked.
     *
     * @returns {string} The user name.
     */
    getDisplayName(): string;
    /**
     * Updates the last known name of the user being tracked.
     *
     * @param {string} - The user name.
     * @returns {void}
     */
    setDisplayName(newName: any): void;
    displayName: any;
    /**
     * Returns true if the stats are tracking the local user.
     *
     * @returns {boolean}
     */
    isLocalStats(): boolean;
    /**
     * Returns true if the tracked user is currently a dominant speaker.
     *
     * @returns {boolean}
     */
    isDominantSpeaker(): boolean;
    /**
     * Returns true if the tracked user is currently a dominant speaker.
     *
     * @param {boolean} - If true, the user will being accumulating time
     * as dominant speaker. If false, the user will not accumulate time
     * and will record any time accumulated since starting as dominant speaker.
     * @returns {void}
     */
    setDominantSpeaker(isNowDominantSpeaker: any): void;
    /**
     * Get how long the tracked user has been dominant speaker.
     *
     * @returns {number} - The speaker time in milliseconds.
     */
    getTotalDominantSpeakerTime(): number;
    /**
     * Get whether or not the user is still in the meeting.
     *
     * @returns {boolean} True if the user is no longer in the meeting.
     */
    hasLeft(): boolean;
    /**
     * Set the user as having left the meeting.
     *
     * @returns {void}
     */
    markAsHasLeft(): void;
    /**
     * Gets the face expressions of the user.
     *
     * @returns {Object}
     */
    getFaceExpressions(): any;
    /**
     * Sets the face expressions of the user.
     *
     * @param {Object} faceExpressions - object with face expressions.
     * @returns {void}
     */
    setFaceExpressions(faceExpressions: any): void;
    /**
     * Adds a new face expression to speaker stats.
     *
     * @param  {string} faceExpression
     * @param {number} duration
     */
    addFaceExpression(faceExpression: string, duration: number): void;
}
