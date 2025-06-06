import type JitsiConference from '../../JitsiConference';
import { JitsiConferenceEvents } from '../../JitsiConferenceEvents';
import { JitsiTrackEvents } from '../../JitsiTrackEvents';
import type JitsiLocalTrack from '../RTC/JitsiLocalTrack';
import type TraceablePeerConnection from '../RTC/TraceablePeerConnection';
import EventEmitter from '../util/EventEmitter';

import * as DetectionEvents from './DetectionEvents';

// We wait a certain time interval for constant silence input from the current device to account for
// potential abnormalities and for a better use experience i.e. don't generate event the instant
// an audio track is added to the tcr.
// Potential improvement - add this as a configurable parameter.
const SILENCE_PERIOD_MS = 4000;

/**
 * Detect if there is no audio input on the current TraceAblePeerConnection selected track. The no audio
 * state must be constant for a configured amount of time in order for the event to be triggered.
 * @fires DetectionEvents.AUDIO_INPUT_STATE_CHANGE
 * @fires DetectionEvents.NO_AUDIO_INPUT
 */
export default class NoAudioSignalDetection extends EventEmitter {
    private _conference: JitsiConference;
    private _timeoutTrigger: Timeout | null;
    private _hasAudioInput: boolean | null;
    private _audioTrack: JitsiLocalTrack | null;
    private _eventFired: boolean;

    /**
     * Creates new NoAudioSignalDetection.
     *
     * @param conference the JitsiConference instance that created us.
     * @constructor
     */
    constructor(conference: JitsiConference) {
        super();

        this._conference = conference;
        this._timeoutTrigger = null;
        this._hasAudioInput = null;
        this._audioTrack = null;
        this._eventFired = false;

        conference.on(JitsiConferenceEvents.TRACK_ADDED, this._trackAdded.bind(this));
    }

    /**
     * Clear the timeout state.
     */
    private _clearTriggerTimeout(): void {
        if (this._timeoutTrigger) {
            clearTimeout(this._timeoutTrigger);
            this._timeoutTrigger = null;
        }
    }

    /**
     * Generated event triggered by a change in the current conference audio input state.
     *
     * @param {number} audioLevel - The audio level of the ssrc.
     * @fires DetectionEvents.AUDIO_INPUT_STATE_CHANGE
     */
    private _handleAudioInputStateChange(audioLevel: number): void {
        // Current audio input state of the active local track in the conference, true for audio input false for no
        // audio input.
        const status = audioLevel !== 0;

        // If this is the first audio event picked up or the current status is different from the previous trigger
        // the event.
        if (this._hasAudioInput === null || this._hasAudioInput !== status) {
            this._hasAudioInput = status;
            this.emit(DetectionEvents.AUDIO_INPUT_STATE_CHANGE, this._hasAudioInput);
        }
    }

    /**
     * Generate event triggered by a prolonged period of no audio input.
     *
     * @param {number} audioLevel - The audio level of the ssrc.
     * @fires DetectionEvents.NO_AUDIO_INPUT
     */
    private _handleNoAudioInputDetection(audioLevel: number): void {
        if (this._eventFired) {
            return;
        }

        if (audioLevel === 0 && !this._timeoutTrigger) {
            this._timeoutTrigger = setTimeout(() => {
                this._eventFired = true;

                this.emit(DetectionEvents.NO_AUDIO_INPUT);
            }, SILENCE_PERIOD_MS);
        } else if (audioLevel !== 0 && this._timeoutTrigger) {
            this._clearTriggerTimeout();
        }
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
    private _audioLevel(tpc: TraceablePeerConnection, ssrc: number, audioLevel: number, isLocal: boolean): void {
        // We are interested in the local audio streams
        if (!isLocal || !this._audioTrack) {
            return;
        }

        // Get currently active local tracks from the TraceablePeerConnection
        const localSSRCs = tpc.localSSRCs.get(this._audioTrack.rtcId);

        // Only target the current active track in the tpc. For some reason audio levels for previous
        // devices are also picked up from the PeerConnection so we filter them out.
        if (!localSSRCs?.ssrcs.includes(ssrc)) {
            return;
        }

        // First handle audio input state change. In case the state changed to no input the no audio input event
        // can try to fire again.
        this._handleAudioInputStateChange(audioLevel);
        this._handleNoAudioInputDetection(audioLevel);
    }

    /**
     * Notifies NoAudioSignalDetection that a JitsiTrack was added to the associated JitsiConference.
     * Only take into account local audio tracks.
     *
     * @param {JitsiTrack} track - The added JitsiTrack.
     */
    private _trackAdded(track: JitsiLocalTrack): void {
        if (track.isLocalAudioTrack()) {
            // Reset state for the new track.
            this._audioTrack = track;
            this._eventFired = false;
            this._clearTriggerTimeout();

            // Listen for the audio levels on the newly added audio track
            track.on(
                JitsiTrackEvents.NO_AUDIO_INPUT,
                (audioLevel: number) => {
                    this._handleNoAudioInputDetection(audioLevel);
                }
            );
            track.on(
                JitsiTrackEvents.TRACK_AUDIO_LEVEL_CHANGED,
                (audioLevel: number) => {
                    this._handleNoAudioInputDetection(audioLevel);
                    this._handleAudioInputStateChange(audioLevel);
                }
            );
        }
    }
}
