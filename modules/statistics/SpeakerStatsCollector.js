import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import SpeakerStats from './SpeakerStats';
import XMPPEvents from '../../service/xmpp/XMPPEvents';

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
    constructor(conference) {
        this.stats = {
            users: {

                // userId: SpeakerStats
            },
            dominantSpeakerId: null
        };

        const userId = conference.myUserId();

        this.stats.users[userId] = new SpeakerStats(userId, null, true);
        this.conference = conference;

        conference.addEventListener(
            JitsiConferenceEvents.DOMINANT_SPEAKER_CHANGED,
            this._onDominantSpeaker.bind(this));
        conference.addEventListener(
            JitsiConferenceEvents.USER_JOINED,
            this._onUserJoin.bind(this));
        conference.addEventListener(
            JitsiConferenceEvents.USER_LEFT,
            this._onUserLeave.bind(this));
        conference.addEventListener(
            JitsiConferenceEvents.DISPLAY_NAME_CHANGED,
            this._onDisplayNameChange.bind(this));
        if (conference.xmpp) {
            conference.xmpp.addListener(
                XMPPEvents.SPEAKER_STATS_RECEIVED,
                this._updateStats.bind(this));
        }
    }

    /**
     * Reacts to dominant speaker change events by changing its speaker stats
     * models to reflect the current dominant speaker.
     *
     * @param {string} dominantSpeakerId - The user id of the new
     * dominant speaker.
     * @returns {void}
     * @private
     */
    _onDominantSpeaker(dominantSpeakerId) {
        const oldDominantSpeaker
            = this.stats.users[this.stats.dominantSpeakerId];
        const newDominantSpeaker = this.stats.users[dominantSpeakerId];

        oldDominantSpeaker && oldDominantSpeaker.setDominantSpeaker(false);
        newDominantSpeaker && newDominantSpeaker.setDominantSpeaker(true);
        this.stats.dominantSpeakerId = dominantSpeakerId;
    }

    /**
     * Reacts to user join events by creating a new SpeakerStats model.
     *
     * @param {string} userId - The user id of the new user.
     * @param {JitsiParticipant} - The JitsiParticipant model for the new user.
     * @returns {void}
     * @private
     */
    _onUserJoin(userId, participant) {
        if (participant.isHidden()) {
            return;
        }

        if (!this.stats.users[userId]) {
            this.stats.users[userId] = new SpeakerStats(userId, participant.getDisplayName());
        }
    }

    /**
     * Reacts to user leave events by updating the associated user's
     * SpeakerStats model.
     *
     * @param {string} userId - The user id of the user that left.
     * @returns {void}
     * @private
     */
    _onUserLeave(userId) {
        const savedUser = this.stats.users[userId];

        if (savedUser) {
            savedUser.markAsHasLeft();
        }
    }

    /**
     * Reacts to user name change events by updating the last known name
     * tracked in the associated SpeakerStats model.
     *
     * @param {string} userId - The user id of the user that left.
     * @returns {void}
     * @private
     */
    _onDisplayNameChange(userId, newName) {
        const savedUser = this.stats.users[userId];

        if (savedUser) {
            savedUser.setDisplayName(newName);
        }
    }

    /**
     * Return a copy of the tracked SpeakerStats models.
     *
     * @returns {Object} The keys are the user ids and the values are the
     * associated user's SpeakerStats model.
     * @private
     */
    getStats() {
        return this.stats.users;
    }

    /**
     * Updates of the current stats is requested, passing the new values.
     *
     * @param {Object} newStats - The new values used to update current one.
     * @private
     */
    _updateStats(newStats) {
        for (const userId in newStats) { // eslint-disable-line guard-for-in
            let speakerStatsToUpdate;
            const newParticipant = this.conference.getParticipantById(userId);

            // we want to ignore hidden participants
            if (!newParticipant || !newParticipant.isHidden()) {
                if (this.stats.users[userId]) {
                    speakerStatsToUpdate = this.stats.users[userId];

                    if (!speakerStatsToUpdate.getDisplayName()) {
                        speakerStatsToUpdate
                            .setDisplayName(newStats[userId].displayName);
                    }
                } else {
                    speakerStatsToUpdate = new SpeakerStats(
                        userId, newStats[userId].displayName);
                    this.stats.users[userId] = speakerStatsToUpdate;
                    speakerStatsToUpdate.markAsHasLeft();
                }
            }

            speakerStatsToUpdate.totalDominantSpeakerTime
                = newStats[userId].totalDominantSpeakerTime;
        }
    }
}
