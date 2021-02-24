/**
 * The <tt>P2PDominantSpeakerDetection</tt> is activated only when p2p is
 * currently used.
 * Listens for changes in the audio level changes of the local p2p audio track
 * or remote p2p one and fires dominant speaker events to be able to use
 * features depending on those events (speaker stats), to make them work without
 * the video bridge.
 */
export default class P2PDominantSpeakerDetection {
    /**
     * Creates P2PDominantSpeakerDetection
     * @param conference the JitsiConference instance that created us.
     * @constructor
     */
    constructor(conference: any);
    conference: any;
    myUserID: any;
    /**
     * Receives audio level events for all streams in the conference.
     *
     * @param {String} id - The participant id
     * @param {number} audioLevel - The audio level.
     */
    _audioLevel(id: string, audioLevel: number): void;
}
