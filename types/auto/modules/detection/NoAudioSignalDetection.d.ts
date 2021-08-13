/// <reference types="node" />
/**
 * Detect if there is no audio input on the current TraceAblePeerConnection selected track. The no audio
 * state must be constant for a configured amount of time in order for the event to be triggered.
 * @fires DetectionEvents.AUDIO_INPUT_STATE_CHANGE
 * @fires DetectionEvents.NO_AUDIO_INPUT
 */
export default class NoAudioSignalDetection extends EventEmitter {
    /**
     * Creates new NoAudioSignalDetection.
     *
     * @param conference the JitsiConference instance that created us.
     * @constructor
     */
    constructor(conference: any);
    _conference: any;
    _timeoutTrigger: NodeJS.Timeout;
    _hasAudioInput: boolean;
    /**
     * Clear the timeout state.
     */
    _clearTriggerTimeout(): void;
    /**
     * Generated event triggered by a change in the current conference audio input state.
     *
     * @param {*} audioLevel - The audio level of the ssrc.
     * @fires DetectionEvents.AUDIO_INPUT_STATE_CHANGE
     */
    _handleAudioInputStateChange(audioLevel: any): void;
    /**
     * Generate event triggered by a prolonged period of no audio input.
     *
     * @param {number} audioLevel - The audio level of the ssrc.
     * @fires DetectionEvents.NO_AUDIO_INPUT
     */
    _handleNoAudioInputDetection(audioLevel: number): void;
    _eventFired: boolean;
    /**
     * Receives audio level events for all send and receive streams on the current TraceablePeerConnection.
     *
     * @param {TraceablePeerConnection} tpc - TraceablePeerConnection of the owning conference.
     * @param {number} ssrc - The synchronization source identifier (SSRC) of the endpoint/participant/stream
     * being reported.
     * @param {number} audioLevel - The audio level of the ssrc.
     * @param {boolean} isLocal - true for local/send streams or false for remote/receive streams.
     */
    _audioLevel(tpc: any, ssrc: number, audioLevel: number, isLocal: boolean): void;
    /**
     * Notifies NoAudioSignalDetection that a JitsiTrack was added to the associated JitsiConference.
     * Only take into account local audio tracks.
     *
     * @param {JitsiTrack} track - The added JitsiTrack.
     */
    _trackAdded(track: any): void;
    _audioTrack: any;
}
import EventEmitter from "events";
