import { getLogger } from 'jitsi-meet-logger';

import * as ConferenceEvents from '../../JitsiConferenceEvents';
import * as ConnectionQualityEvents from '../../service/connectivity/ConnectionQualityEvents';
import * as MediaType from '../../service/RTC/MediaType';
import { createAudioOutputProblemEvent } from '../../service/statistics/AnalyticsEvents';

import Statistics from './statistics';

const logger = getLogger(__filename);

/**
 * Number of remote samples that will be used for comparison with local ones.
 */
const NUMBER_OF_REMOTE_SAMPLES = 3;

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
        this._lastReceivedAudioLevel = {};
        this._reportedParticipants = [];
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
        if (this._reportedParticipants.indexOf(userID) !== -1) {
            return;
        }

        if (!Array.isArray(this._lastReceivedAudioLevel[userID])) {
            this._lastReceivedAudioLevel[userID] = [ ];
        } else if (this._lastReceivedAudioLevel[userID].length >= NUMBER_OF_REMOTE_SAMPLES) {
            this._lastReceivedAudioLevel[userID].shift();
        }

        this._lastReceivedAudioLevel[userID].push(avgAudioLevels);

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

        Object.keys(this._lastReceivedAudioLevel).forEach(userID => {
            if (this._reportedParticipants.indexOf(userID) !== -1) {
                // Do not report the participant again.
                return;
            }

            const remoteAudioLevels = this._lastReceivedAudioLevel[userID];
            const participant = this._conference.getParticipantById(userID);

            if (participant) {
                const tracks = participant.getTracksByMediaType(MediaType.AUDIO);

                if (tracks.length > 0 && participant.isAudioMuted()) {
                    // We don't need to report an error if everything seems fine with the participant and its tracks but
                    // the participant is audio muted.
                    return;
                }
            }

            if ((!(userID in avgAudioLevels) || avgAudioLevels[userID] === 0)
                    && Array.isArray(remoteAudioLevels)
                    && remoteAudioLevels.length === NUMBER_OF_REMOTE_SAMPLES
                    && remoteAudioLevels.every(audioLevel => audioLevel > 0)) {
                const remoteAudioLevelsString = JSON.stringify(remoteAudioLevels);

                Statistics.sendAnalytics(
                    createAudioOutputProblemEvent(userID, avgAudioLevels[userID], remoteAudioLevelsString));
                logger.warn(`A potential problem is detected with the audio output for participant ${
                    userID}, local audio levels: ${avgAudioLevels[userID]}, remote audio levels: ${
                    remoteAudioLevelsString}`);
                this._reportedParticipants.push(userID);
                this._clearUserData();
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
        delete this._lastReceivedAudioLevel[userID];
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
        this._lastReceivedAudioLevel = undefined;
        this._reportedParticipants = undefined;
        this._conference = undefined;
    }
}
