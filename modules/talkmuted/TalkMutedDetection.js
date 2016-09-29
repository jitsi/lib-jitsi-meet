import * as JitsiConferenceEvents from "../../JitsiConferenceEvents";

export default class TalkMutedDetection {
    /**
     * Creates TalkMutedDetection
     * @param conference the JitsiConference instance that created us.
     * @param callback the callback to call when detected local user is talking
     * while its microphone is muted.
     * @constructor
     */
    constructor(conference, callback) {
        this.callback = callback;

        conference.statistics.addAudioLevelListener(
            this.audioLevelListener.bind(this));
        conference.eventEmitter.on(
            JitsiConferenceEvents.TRACK_MUTE_CHANGED,
            this.muteChanged.bind(this));
        conference.eventEmitter.on(
            JitsiConferenceEvents.TRACK_ADDED,
            this.onTrackAdded.bind(this));

        // we track firing the event, in order to avoid sending too many events
        this.eventFired = false;
    }

    /**
     * Adds local tracks. We are interested only in the audio one.
     * @param track
     */
    onTrackAdded(track) {
        if (!track.isAudioTrack())
            return;

        this.audioTrack = track;
    }

    /**
     * Receives audio level events for all send/receive streams.
     * @param ssrc the ssrc of the stream
     * @param level the current audio level
     * @param isLocal whether this is local or remote stream (sent or received)
     */
    audioLevelListener(ssrc, level, isLocal) {
        // we are interested only in local audio stream
        // and if event is not already sent
        if (!isLocal || !this.audioTrack || this.eventFired)
            return;

        if (this.audioTrack.isMuted() && level > 0.6) {
            this.eventFired = true;
            this.callback();
        }
    }

    /**
     * Mute changed for a track.
     * @param track the track which mute state has changed.
     */
    muteChanged(track) {
        if (track.isLocal() && track.isAudioTrack() && track.isMuted())
            this.eventFired = false;
    }
}
