import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import RTCEvents from '../../service/RTC/RTCEvents';

/**
 * The value which we use to say, every sound over this threshold
 * is talking on the mic.
 * @type {number}
 */
const SPEECH_DETECT_THRESHOLD = 0.6;

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
    constructor(conference) {
        this.conference = conference;

        conference.addEventListener(
            JitsiConferenceEvents.TRACK_AUDIO_LEVEL_CHANGED,
            this._audioLevel.bind(this));

        this.myUserID = this.conference.myUserId();
    }

    /**
     * Receives audio level events for all streams in the conference.
     *
     * @param {String} id - The participant id
     * @param {number} audioLevel - The audio level.
     */
    _audioLevel(id, audioLevel) {

        // we do not process if p2p is not active
        // or audio level is under certain threshold
        // or if the audio level is for local audio track which is muted
        if (!this.conference.isP2PActive()
            || audioLevel <= SPEECH_DETECT_THRESHOLD
            || (id === this.myUserID
                    && this.conference.getLocalAudioTrack().isMuted())) {
            return;
        }

        this.conference.rtc.eventEmitter.emit(
            RTCEvents.DOMINANT_SPEAKER_CHANGED,
            id);
    }
}
