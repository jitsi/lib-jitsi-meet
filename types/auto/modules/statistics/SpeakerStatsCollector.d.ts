/**
 * A collection for tracking speaker stats. Attaches listeners
 * to the conference to automatically update on tracked events.
 */
export default class SpeakerStatsCollector {
    /**
     * Initializes a new SpeakerStatsCollector instance.
     *
     * @constructor
     * @param {JitsiConference} conference - The conference to track.
     * @returns {void}
     */
    constructor(conference: any);
    stats: {
        users: {};
        dominantSpeakerId: any;
    };
    conference: any;
    /**
     * Reacts to dominant speaker change events by changing its speaker stats
     * models to reflect the current dominant speaker.
     *
     * @param {string} dominantSpeakerId - The user id of the new dominant speaker.
     * @param {Array[string]} previous - The array with previous speakers.
     * @param {boolean} silence - Indecates whether the dominant speaker is silent or not.
     * @returns {void}
     * @private
     */
    private _onDominantSpeaker;
    /**
     * Reacts to user join events by creating a new SpeakerStats model.
     *
     * @param {string} userId - The user id of the new user.
     * @param {JitsiParticipant} - The JitsiParticipant model for the new user.
     * @returns {void}
     * @private
     */
    private _onUserJoin;
    /**
     * Reacts to user leave events by updating the associated user's
     * SpeakerStats model.
     *
     * @param {string} userId - The user id of the user that left.
     * @returns {void}
     * @private
     */
    private _onUserLeave;
    /**
     * Reacts to user name change events by updating the last known name
     * tracked in the associated SpeakerStats model.
     *
     * @param {string} userId - The user id of the user that left.
     * @returns {void}
     * @private
     */
    private _onDisplayNameChange;
    /**
     * Processes a new face landmark object of a remote user.
     *
     * @param {string} userId - The user id of the user that left.
     * @param {Object} data - The face landmark object.
     * @returns {void}
     * @private
     */
    private _onFaceLandmarkAdd;
    /**
     * Return a copy of the tracked SpeakerStats models.
     *
     * @returns {Object} The keys are the user ids and the values are the
     * associated user's SpeakerStats model.
     */
    getStats(): any;
    /**
     * Updates of the current stats is requested, passing the new values.
     *
     * @param {Object} newStats - The new values used to update current one.
     * @private
     */
    private _updateStats;
}
