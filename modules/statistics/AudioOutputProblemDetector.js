import { getLogger } from 'jitsi-meet-logger';

import * as ConferenceEvents from '../../JitsiConferenceEvents';
import * as ConnectionQualityEvents from '../../service/connectivity/ConnectionQualityEvents';
import * as MediaType from '../../service/RTC/MediaType';
import { createAudioOutputProblemEvent } from '../../service/statistics/AnalyticsEvents';

import Statistics from './statistics';

const logger = getLogger(__filename);

/**
 * Number of local samples that will be used for comparison before and after the remote sample is received.
 */
const NUMBER_OF_LOCAL_SAMPLES = 2;

/**
 * Collects the average audio levels per participant from the local stats and the stats received by every remote
 * participant and compares them to detect potential audio problem for a participant.
 */
export default class AudioOutputProblemDetector {

    /**
     * Creates new <tt>AudioOutputProblemDetector</tt> instance.
     *
     * @param {JitsiCofnerence} conference - The conference instance to be monitored.
     */
    constructor(conference) {
        this._conference = conference;
        this._localAudioLevelCache = {};
        this._reportedParticipants = [];
        this._audioProblemCandidates = {};
        this._numberOfRemoteAudioLevelsReceived = {};
        this._onLocalAudioLevelsReport = this._onLocalAudioLevelsReport.bind(this);
        this._onRemoteAudioLevelReceived = this._onRemoteAudioLevelReceived.bind(this);
        this._clearUserData = this._clearUserData.bind(this);
        this._conference.on(ConnectionQualityEvents.REMOTE_STATS_UPDATED, this._onRemoteAudioLevelReceived);
        this._conference.statistics.addConnectionStatsListener(this._onLocalAudioLevelsReport);
        this._conference.on(ConferenceEvents.USER_LEFT, this._clearUserData);
    }

    /**
     * A listener for audio level data received by a remote participant.
     *
     * @param {string} userID - The user id of the participant that sent the data.
     * @param {number} audioLevel - The average audio level value.
     * @returns {void}
     */
    _onRemoteAudioLevelReceived(userID, { avgAudioLevels }) {
        const numberOfReports = (this._numberOfRemoteAudioLevelsReceived[userID] + 1) || 0;

        this._numberOfRemoteAudioLevelsReceived[userID] = numberOfReports;

        if (this._reportedParticipants.indexOf(userID) !== -1 || (userID in this._audioProblemCandidates)
                || avgAudioLevels <= 0 || numberOfReports < 3) {
            return;
        }

        const participant = this._conference.getParticipantById(userID);

        if (participant) {
            const tracks = participant.getTracksByMediaType(MediaType.AUDIO);

            if (tracks.length > 0 && participant.isAudioMuted()) {
                // We don't need to report an error if everything seems fine with the participant and its tracks but
                // the participant is audio muted. Since those are average audio levels we potentially can receive non
                // zero values for muted track.
                return;
            }
        }

        const localAudioLevels = this._localAudioLevelCache[userID];

        if (!Array.isArray(localAudioLevels) || localAudioLevels.every(audioLevel => audioLevel === 0)) {
            this._audioProblemCandidates[userID] = {
                remoteAudioLevels: avgAudioLevels,
                localAudioLevels: []
            };
        }
    }

    /**
     * A listener for audio level data retrieved by the local stats.
     *
     * @param {TraceablePeerConnection} tpc - The <tt>TraceablePeerConnection</tt> instance used to gather the data.
     * @param {Object} avgAudioLevels - The average audio levels per participant.
     * @returns {void}
     */
    _onLocalAudioLevelsReport(tpc, { avgAudioLevels }) {
        if (tpc !== this._conference.getActivePeerConnection()) {
            return;
        }

        Object.keys(avgAudioLevels).forEach(userID => {
            if (this._reportedParticipants.indexOf(userID) !== -1) {
                return;
            }

            const localAudioLevels = this._localAudioLevelCache[userID];

            if (!Array.isArray(localAudioLevels)) {
                this._localAudioLevelCache[userID] = [ ];
            } else if (localAudioLevels.length >= NUMBER_OF_LOCAL_SAMPLES) {
                localAudioLevels.shift();
            }

            this._localAudioLevelCache[userID].push(avgAudioLevels[userID]);
        });


        Object.keys(this._audioProblemCandidates).forEach(userID => {
            const { localAudioLevels, remoteAudioLevels } = this._audioProblemCandidates[userID];

            localAudioLevels.push(avgAudioLevels[userID]);

            if (localAudioLevels.length === NUMBER_OF_LOCAL_SAMPLES) {
                if (localAudioLevels.every(audioLevel => typeof audioLevel === 'undefined' || audioLevel === 0)) {
                    const localAudioLevelsString = JSON.stringify(localAudioLevels);

                    Statistics.sendAnalytics(
                        createAudioOutputProblemEvent(userID, localAudioLevelsString, remoteAudioLevels));
                    logger.warn(`A potential problem is detected with the audio output for participant ${
                        userID}, local audio levels: ${localAudioLevelsString}, remote audio levels: ${
                        remoteAudioLevels}`);
                    this._reportedParticipants.push(userID);
                    this._clearUserData(userID);
                }

                delete this._audioProblemCandidates[userID];
            }
        });
    }

    /**
     * Clears the data stored for a participant.
     *
     * @param {string} userID - The id of the participant.
     * @returns {void}
     */
    _clearUserData(userID) {
        delete this._localAudioLevelCache[userID];
    }

    /**
     * Disposes the allocated resources.
     *
     * @returns {void}
     */
    dispose() {
        this._conference.off(ConnectionQualityEvents.REMOTE_STATS_UPDATED, this._onRemoteAudioLevelReceived);
        this._conference.off(ConferenceEvents.USER_LEFT, this._clearUserData);
        this._conference.statistics.removeConnectionStatsListener(this._onLocalAudioLevelsReport);
        this._localAudioLevelCache = undefined;
        this._audioProblemCandidates = undefined;
        this._reportedParticipants = undefined;
        this._numberOfRemoteAudioLevelsReceived = undefined;
        this._conference = undefined;
    }
}
