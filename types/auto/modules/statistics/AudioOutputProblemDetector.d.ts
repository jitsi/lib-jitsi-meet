/**
 * Collects the average audio levels per participant from the local stats and the stats received by every remote
 * participant and compares them to detect potential audio problem for a participant.
 */
export default class AudioOutputProblemDetector {
    /**
     * Creates new <tt>AudioOutputProblemDetector</tt> instance.
     *
     * @param {JitsiConference} conference - The conference instance to be monitored.
     */
    constructor(conference: any);
    _conference: any;
    _localAudioLevelCache: {};
    _reportedParticipants: any[];
    _audioProblemCandidates: {};
    _numberOfRemoteAudioLevelsReceived: {};
    /**
     * A listener for audio level data retrieved by the local stats.
     *
     * @param {TraceablePeerConnection} tpc - The <tt>TraceablePeerConnection</tt> instance used to gather the data.
     * @param {Object} avgAudioLevels - The average audio levels per participant.
     * @returns {void}
     */
    _onLocalAudioLevelsReport(tpc: any, { avgAudioLevels }: any): void;
    /**
     * A listener for audio level data received by a remote participant.
     *
     * @param {string} userID - The user id of the participant that sent the data.
     * @param {number} audioLevel - The average audio level value.
     * @returns {void}
     */
    _onRemoteAudioLevelReceived(userID: string, { avgAudioLevels }: number): void;
    /**
     * Clears the data stored for a participant.
     *
     * @param {string} userID - The id of the participant.
     * @returns {void}
     */
    _clearUserData(userID: string): void;
    /**
     * Disposes the allocated resources.
     *
     * @returns {void}
     */
    dispose(): void;
}
