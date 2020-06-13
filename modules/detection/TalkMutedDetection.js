import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';

/**
 * The value which we use to say, every sound over this threshold
 * is talking on the mic.
 * @type {number}
 */
const SPEECH_DETECT_THRESHOLD = 0.6;

/**
 * Detect user trying to speek while is locally muted and fires an event.
 */
export default class TalkMutedDetection {
    /**
     * Creates TalkMutedDetection
     * @param conference the JitsiConference instance that created us.
     * @param callback the callback to call when detected that the local user is
     * talking while her microphone is muted.
     * @constructor
     */
    constructor(conference, callback) {
        /**
         * The callback to call when detected that the local user is talking
         * while her microphone is muted.
         *
         * @private
         */
        this._callback = callback;

        /**
         * The indicator which determines whether <tt>callback</tt> has been
         * invoked for the current local audio track of <tt>conference</tt> so
         * that it is invoked once only.
         *
         * @private
         */
        this._eventFired = false;

        // XXX I went back and forth on the subject of where to put the access
        // to statistics. On the one had, (1) statistics is likely intended to
        // be private to conference and (2) there is a desire to keep the
        // dependencies of modules to the minimum (i.e. not have
        // TalkMutedDetection depend on statistics). On the other hand, (1)
        // statistics is technically not private because
        // JitsiConferenceEventManager accesses it and (2) TalkMutedDetection
        // works exactly because it knows that there are no audio levels for
        // JitsiLocalTrack but there are audio levels for the local participant
        // through statistics.
        conference.statistics.addAudioLevelListener(
            this._audioLevel.bind(this));

        conference.on(
            JitsiConferenceEvents.TRACK_MUTE_CHANGED,
            this._trackMuteChanged.bind(this));
        conference.on(
            JitsiConferenceEvents.TRACK_ADDED,
            this._trackAdded.bind(this));
    }

    /* eslint-disable max-params */
    /**
     * Receives audio level events for all send and receive streams.
     *
     * @param {TraceablePeerConnection} pc - WebRTC PeerConnection object of the
     * @param {number} ssrc - The synchronization source identifier (SSRC) of
     * the endpoint/participant/stream being reported.
     * @param {number} audioLevel - The audio level of <tt>ssrc</tt>.
     * @param {boolean} isLocal - <tt>true</tt> if <tt>ssrc</tt> represents a
     * local/send stream or <tt>false</tt> for a remote/receive stream.
     */
    _audioLevel(tpc, ssrc, audioLevel, isLocal) {
        // We are interested in the local audio stream only and if event is not
        // sent yet.
        if (!isLocal || !this.audioTrack || this._eventFired) {
            return;
        }

        if (this.audioTrack.isMuted()
            && audioLevel > SPEECH_DETECT_THRESHOLD) {
            this._eventFired = true;
            this._callback();
        }
    }
    /* eslint-enable max-params */

    /**
     * Determines whether a specific {@link JitsiTrack} represents a local audio
     * track.
     *
     * @param {JitsiTrack} track - The <tt>JitsiTrack</tt> to be checked whether
     * it represents a local audio track.
     * @private
     * @return {boolean} - <tt>true</tt> if the specified <tt>track</tt>
     * represents a local audio track; otherwise, <tt>false</tt>.
     */
    _isLocalAudioTrack(track) {
        return track.isAudioTrack() && track.isLocal();
    }

    /**
     * Notifies this <tt>TalkMutedDetection</tt> that a {@link JitsiTrack} was
     * added to the associated {@link JitsiConference}. Looks for the local
     * audio track only.
     *
     * @param {JitsiTrack} track - The added <tt>JitsiTrack</tt>.
     * @private
     */
    _trackAdded(track) {
        if (this._isLocalAudioTrack(track)) {
            this.audioTrack = track;
        }
    }

    /**
     * Notifies this <tt>TalkMutedDetection</tt> that the mute state of a
     * {@link JitsiTrack} has changed. Looks for the local audio track only.
     *
     * @param {JitsiTrack} track - The <tt>JitsiTrack</tt> whose mute state has
     * changed.
     * @private
     */
    _trackMuteChanged(track) {
        if (this._isLocalAudioTrack(track) && track.isMuted()) {
            this._eventFired = false;
        }
    }
}
