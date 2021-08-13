/// <reference types="node" />
/**
 * Connects an audio JitsiLocalTrack to a vadProcessor using WebAudio ScriptProcessorNode.
 * Once an object is created audio from the local track flows through the ScriptProcessorNode as raw PCM.
 * The PCM is processed by the injected vad module and a voice activity detection score is obtained, the
 * score is published to consumers via an EventEmitter.
 * After work is done with this service the destroy method needs to be called for a proper cleanup.
 *
 * @fires VAD_SCORE_PUBLISHED
 */
export default class TrackVADEmitter extends EventEmitter {
    /**
     * Factory method that sets up all the necessary components for the creation of the TrackVADEmitter.
     *
     * @param {string} micDeviceId - Target microphone device id.
     * @param {number} procNodeSampleRate - Sample rate of the proc node.
     * @param {Object} vadProcessor -Module that calculates the voice activity score for a certain audio PCM sample.
     * The processor needs to implement the following functions:
     * - <tt>getSampleLength()</tt> - Returns the sample size accepted by getSampleLength.
     * - <tt>getRequiredPCMFrequency()</tt> - Returns the PCM frequency at which the processor operates.
     * - <tt>calculateAudioFrameVAD(pcmSample)</tt> - Process a 32 float pcm sample of getSampleLength size.
     * @returns {Promise<TrackVADEmitter>} - Promise resolving in a new instance of TrackVADEmitter.
     */
    static create(micDeviceId: string, procNodeSampleRate: number, vadProcessor: any): Promise<TrackVADEmitter>;
    /**
     * Constructor.
     *
     * @param {number} procNodeSampleRate - Sample rate of the ScriptProcessorNode. Possible values  256, 512, 1024,
     *  2048, 4096, 8192, 16384. Passing other values will default to closes neighbor.
     * @param {Object} vadProcessor - VAD processor that allows us to calculate VAD score for PCM samples.
     * @param {JitsiLocalTrack} jitsiLocalTrack - JitsiLocalTrack corresponding to micDeviceId.
     */
    constructor(procNodeSampleRate: number, vadProcessor: any, jitsiLocalTrack: any);
    /**
     * Sample rate of the ScriptProcessorNode.
     */
    _procNodeSampleRate: number;
    /**
     * VAD Processor that allows us to calculate VAD score for PCM samples
     */
    _vadProcessor: any;
    /**
     * The JitsiLocalTrack instance.
     */
    _localTrack: any;
    /**
     * Buffer to hold residue PCM resulting after a ScriptProcessorNode callback
     */
    _bufferResidue: Float32Array;
    /**
     * The AudioContext instance with the preferred sample frequency.
     */
    _audioContext: AudioContext;
    /**
     * PCM Sample size expected by the VAD Processor instance. We cache it here as this value is used extensively,
     * saves a couple of function calls.
     */
    _vadSampleSize: any;
    /**
     * ScriptProcessorNode callback, the input parameters contains the PCM audio that is then sent to rnnoise.
     * Rnnoise only accepts PCM samples of 480 bytes whereas the webaudio processor node can't sample at a multiple
     * of 480 thus after each _onAudioProcess callback there will remain and PCM buffer residue equal
     * to _procNodeSampleRate / 480 which will be added to the next sample buffer and so on.\
     *
     *
     * @param {AudioProcessingEvent} audioEvent - Audio event.
     * @returns {void}
     * @fires VAD_SCORE_PUBLISHED
     */
    _onAudioProcess(audioEvent: AudioProcessingEvent): void;
    /**
     * Sets up the audio graph in the AudioContext.
     *
     * @returns {void}
     */
    _initializeAudioContext(): void;
    _audioSource: MediaStreamAudioSourceNode;
    _audioProcessingNode: ScriptProcessorNode;
    /**
     * Connects the nodes in the AudioContext to start the flow of audio data.
     *
     * @returns {void}
     */
    _connectAudioGraph(): void;
    /**
     * Disconnects the nodes in the AudioContext.
     *
     * @returns {void}
     */
    _disconnectAudioGraph(): void;
    /**
     * Cleanup potentially acquired resources.
     *
     * @returns {void}
     */
    _cleanupResources(): void;
    /**
     * Get the associated track device ID.
     *
     * @returns {string}
     */
    getDeviceId(): string;
    /**
     * Get the associated track label.
     *
     * @returns {string}
     */
    getTrackLabel(): string;
    /**
     * Start the emitter by connecting the audio graph.
     *
     * @returns {void}
     */
    start(): void;
    /**
     * Stops the emitter by disconnecting the audio graph.
     *
     * @returns {void}
     */
    stop(): void;
    /**
     * Destroy TrackVADEmitter instance (release resources and stop callbacks).
     *
     * @returns {void}
     */
    destroy(): void;
    _destroyed: boolean;
}
import EventEmitter from "events";
