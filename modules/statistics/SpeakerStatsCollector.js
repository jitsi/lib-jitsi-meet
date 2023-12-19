import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import { XMPPEvents } from '../../service/xmpp/XMPPEvents';

import SpeakerStats from './SpeakerStats';


/**
 * The value to use for the "type" field for messages sent
 * over the data channel that contain a face landmark.
 */

const FACE_LANDMARK_MESSAGE_TYPE = 'face-landmarks';

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

        conference.on(
            JitsiConferenceEvents.ENDPOINT_MESSAGE_RECEIVED,
                (participant, { type, faceLandmarks }) => {
                    if (type === FACE_LANDMARK_MESSAGE_TYPE) {
                        this._onFaceLandmarkAdd(participant.getId(), faceLandmarks);
                    }
                });
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
     * @param {string} dominantSpeakerId - The user id of the new dominant speaker.
     * @param {Array[string]} previous - The array with previous speakers.
     * @param {boolean} silence - Indecates whether the dominant speaker is silent or not.
     * @returns {void}
     * @private
     */
    _onDominantSpeaker(dominantSpeakerId, previous, silence) {
        const oldDominantSpeaker
            = this.stats.users[this.stats.dominantSpeakerId];
        const newDominantSpeaker = this.stats.users[dominantSpeakerId];

        oldDominantSpeaker && oldDominantSpeaker.setDominantSpeaker(false);
        newDominantSpeaker && newDominantSpeaker.setDominantSpeaker(true, silence);
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
     * Processes a new face landmark object of a remote user.
     *
     * @param {string} userId - The user id of the user that left.
     * @param {Object} data - The face landmark object.
     * @returns {void}
     * @private
     */
    _onFaceLandmarkAdd(userId, data) {
        const savedUser = this.stats.users[userId];

        if (savedUser && data) {
            savedUser.addFaceLandmarks(data);
        }
    }

    /**
     * Return a copy of the tracked SpeakerStats models.
     *
     * @returns {Object} The keys are the user ids and the values are the
     * associated user's SpeakerStats model.
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

                speakerStatsToUpdate.totalDominantSpeakerTime
                    = newStats[userId].totalDominantSpeakerTime;

                if (Array.isArray(newStats[userId].faceLandmarks)) {
                    speakerStatsToUpdate.setFaceLandmarks(newStats[userId].faceLandmarks);
                }
            }
        }
    }
}
