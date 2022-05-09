/**
 * Connects a TrackVADEmitter to the target conference local audio track and manages various services that use
 * the data to produce audio analytics (VADTalkMutedDetection and VADNoiseDetection).
 */
export default class VADAudioAnalyser extends EventEmitter {
    /**
     * Creates <tt>VADAudioAnalyser</tt>
     * @param {JitsiConference} conference - JitsiConference instance that created us.
     * @param {Object} createVADProcessor - Function that creates a Voice activity detection processor. The processor
     * needs to implement the following functions:
     * - <tt>getSampleLength()</tt> - Returns the sample size accepted by getSampleLength.
     * - <tt>getRequiredPCMFrequency()</tt> - Returns the PCM frequency at which the processor operates.
     * - <tt>calculateAudioFrameVAD(pcmSample)</tt> - Process a 32 float pcm sample of getSampleLength size.
     * @constructor
     */
    constructor(conference: any, createVADProcessor: any);
    /**
     * Member function that instantiates a VAD processor.
     */
    _createVADProcessor: any;
    /**
     * Current {@link TrackVADEmitter}. VAD Emitter uses a {@link JitsiLocalTrack} and VAD processor to generate
     * period voice probability scores.
     */
    _vadEmitter: TrackVADEmitter;
    /**
     * Current state of the _vadEmitter
     */
    _isVADEmitterRunning: boolean;
    /**
     * Array of currently attached VAD processing services.
     */
    _detectionServices: any[];
    /**
     * Promise used to chain create and destroy operations associated with TRACK_ADDED and TRACK_REMOVED events
     * coming from the conference.
     * Because we have an async created component (VAD Processor) we need to make sure that it's initialized before
     * we destroy it ( when changing the device for instance), or when we use it from an external point of entry
     * i.e. (TRACK_MUTE_CHANGED event callback).
     */
    _vadInitTracker: Promise<void>;
    /**
     * Listens for {@link TrackVADEmitter} events and directs them to attached services as needed.
     *
     * @param {Object} vadScore -VAD score emitted by {@link TrackVADEmitter}
     * @param {Date}   vadScore.timestamp - Exact time at which processed PCM sample was generated.
     * @param {number} vadScore.score - VAD score on a scale from 0 to 1 (i.e. 0.7)
     * @param {Float32Array} pcmData - Raw PCM data with which the VAD score was calculated.
     * @param {string} vadScore.deviceId - Device id of the associated track.
     * @listens VAD_SCORE_PUBLISHED
     */
    _processVADScore(vadScore: {
        timestamp: Date;
        score: number;
    }): void;
    /**
     * Attach a VAD detector service to the analyser and handle it's state changes.
     *
     * @param {Object} vadTMDetector
     */
    addVADDetectionService(vadService: any): void;
    /**
     * Start the {@link TrackVADEmitter} and attach the event listener.
     * @returns {void}
     */
    _startVADEmitter(): void;
    /**
     * Stop the {@link TrackVADEmitter} and detach the event listener.
     * @returns {void}
     */
    _stopVADEmitter(): void;
    /**
     * Change the isMuted state of all attached detection services.
     *
     * @param {boolean} isMuted
     */
    _changeDetectorsMuteState(isMuted: boolean): void;
    /**
     * Notifies the detector that a track was added to the associated {@link JitsiConference}.
     * Only take into account local audio tracks.
     * @param {JitsiTrack} track - The added track.
     * @returns {void}
     * @listens TRACK_ADDED
     */
    _trackAdded(track: any): void;
    /**
     * Notifies the detector that the mute state of a {@link JitsiConference} track has changed. Only takes into account
     * local audio tracks.
     * @param {JitsiTrack} track - The track whose mute state has changed.
     * @returns {void}
     * @listens TRACK_MUTE_CHANGED
     */
    _trackMuteChanged(track: any): void;
    /**
     * Notifies the detector that a track associated with the {@link JitsiConference} was removed. Only takes into
     * account local audio tracks. Cleans up resources associated with the track and resets the processing context.
     *
     * @param {JitsiTrack} track - The removed track.
     * @returns {void}
     * @listens TRACK_REMOVED
     */
    _trackRemoved(track: any): void;
}
import { EventEmitter } from "events";
import TrackVADEmitter from "./TrackVADEmitter";
