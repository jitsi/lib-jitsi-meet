import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';

// We wait a certain time interval for constant silence input from the current device to account for
// potential abnormalities and for a better use experience i.e. don't generate event the instant
// an audio track is added to the tcr.
// Potential improvement - add this as a configurable parameter.
const SILENCE_PERIOD_MS = 4000;

/**
 * Detect if there is no audio input on the current TraceAblePeerConnection selected track. The no audio
 * state must be constant for a configured amount of time in order for the event to be triggered.
 */
export default class NoAudioSignalDetection {
    /**
     * @param conference the JitsiConference instance that created us.
     * @param callback callback that notifies the conference when no audio event is triggered
     * @constructor
     */
    constructor(conference, callback) {
        this._conference = conference;
        this._callback = callback;
        this._timeoutTrigger = null;

        conference.statistics.addAudioLevelListener(this._audioLevel.bind(this));
        conference.on(JitsiConferenceEvents.TRACK_ADDED, this._trackAdded.bind(this));
    }

    /**
     * Clear the timeout state.
     */
    _clearTriggerTimeout() {
        clearTimeout(this._timeoutTrigger);
        this._timeoutTrigger = null;
    }


    /**
     * Receives audio level events for all send and receive streams on the current TraceablePeerConnection.
     *
     * @param {TraceablePeerConnection} tpc - TraceablePeerConnection of the owning conference.
     * @param {number} ssrc - The synchronization source identifier (SSRC) of the endpoint/participant/stream
     * being reported.
     * @param {number} audioLevel - The audio level of the ssrc.
     * @param {boolean} isLocal - true for local/send streams or false for remote/receive streams.
     */
    _audioLevel(tpc, ssrc, audioLevel, isLocal) {
        // We are interested in the local audio stream if the event was not triggered on this device.
        if (!isLocal || !this._audioTrack || this._eventFired) {
            return;
        }

        // Get currently active local tracks from the TraceablePeerConnection
        const localSSRCs = tpc.localSSRCs.get(this._audioTrack.rtcId);

        // Check that currently selected audio stream has ssrc in the TraceablePeerConnection
        if (!localSSRCs) {
            return;
        }

        // Only target the current active track in the tpc. For some reason audio levels for previous
        // devices are also picked up from the PeerConnection so we filter them out.
        const isCurrentTrack = localSSRCs.ssrcs.includes(ssrc);

        if (!isCurrentTrack) {
            return;
        }

        if (audioLevel === 0 && !this._timeoutTrigger) {
            this._timeoutTrigger = setTimeout(() => {
                this._eventFired = true;
                this._callback();
            }, SILENCE_PERIOD_MS);
        } else if (audioLevel !== 0 && this._timeoutTrigger) {
            this._clearTriggerTimeout();
        }
    }

    /**
     * Notifies NoAudioSignalDetection that a JitsiTrack was added to the associated JitsiConference.
     * Only take into account local audio tracks.
     *
     * @param {JitsiTrack} track - The added JitsiTrack.
     */
    _trackAdded(track) {
        if (track.isLocalAudioTrack()) {
            // Reset state for the new track.
            this._audioTrack = track;
            this._eventFired = false;
            this._clearTriggerTimeout();
        }
    }
}
