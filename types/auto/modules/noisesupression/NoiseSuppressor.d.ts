/**
 * The noise suppressor takes a MediaStream and denoises it using a processor in this case rnnoise.
 * TODO - Currently the deprecated ScriptProcessorNode is used, this will be replaced with AudioWorklet
 * along with VAD* related services which also rely on ScriptProcessorNode in a future initiative.
 *
 */
export default class NoiseSuppressor {
    /**
     * Constructor.
     *
     * @param {number} procNodeSampleRate - Sample rate of the ScriptProcessorNode. Possible values  256, 512, 1024,
     *  2048, 4096, 8192, 16384. Passing other values will default to closes neighbor.
     * @param {Object} denoiseProcessor - processor which performs the actual denoising.
     * @param {MediaStream} streamToDenoise
     */
    constructor(procNodeSampleRate: number, denoiseProcessor: any, streamToDenoise: MediaStream);
    _procNodeSampleRate: number;
    _denoiseProcessor: any;
    _streamToDenoise: MediaStream;
    /**
     * PCM Sample size expected by the denoise processor.
     */
    _denoiseSampleSize: any;
    /**
     * In order to avoid unnecessary memory related operations a circular buffer was used.
     * Because the script processors input array does not match or is a multiple of the sample
     * size required by the denoise processor not all the input data will be denoised on a call
     * of `_onAudioProcess`, thus some residue will be left for the next call.
     * A problem arises when the circular buffer reaches the end and a rollover is required, namely
     * the residue could potentially be split between the end of buffer and the beginning and would
     * require some complicated logic to handle. Using the lcm as the size of the buffer will
     * guarantee that by the time the buffer reaches the end the residue will be a multiple of the
     * `procNodeSampleRate` and the residue won't be split.
     */
    _circularBufferLength: number;
    _circularBuffer: Float32Array;
    /**
     * The circular buffer uses a couple of indexes to track data segments. Input data from the stream is
     * copied to the circular buffer as it comes in, one `procNodeSampleRate` sized sample at a time.
     * _inputBufferLength denotes the current length of all gathered raw audio segments.
     */
    _inputBufferLength: number;
    /**
     * Denoising is done directly on the circular buffer using subArray views, but because
     * `procNodeSampleRate` and `_denoiseSampleSize` have different sizes, denoised samples lag behind
     * the current gathered raw audio samples so we need a different index, `_denoisedBufferLength`.
     */
    _denoisedBufferLength: number;
    /**
     * Once enough data has been denoised (size of procNodeSampleRate) it's sent to the
     * ScriptProcessorNode's output buffer, `_denoisedBufferIndx` indicates the start index on the
     * circular buffer of denoised data not yet sent.
     */
    _denoisedBufferIndx: number;
    /**
     * The AudioContext instance with the preferred sample frequency.
     */
    _audioContext: AudioContext;
    /**
     * ScriptProcessorNode callback. The input parameters contains the PCM audio that is then sent to rnnoise.
     * Rnnoise only accepts PCM samples of 480 bytes whereas the webaudio processor node can't sample at a multiple
     * of 480 thus after each _onAudioProcess callback there will remain and PCM buffer residue equal
     * to _procNodeSampleRate / 480 which will be added to the next sample buffer and so on.
     *
     * @param {AudioProcessingEvent} audioEvent - Audio event.
     * @returns {void}
     */
    _onAudioProcess(audioEvent: AudioProcessingEvent): void;
    /**
     * Sets up the audio graph in the AudioContext.
     *
     * @returns {void}
     */
    _initializeAudioContext(): void;
    _audioSource: MediaStreamAudioSourceNode;
    _audioDestination: MediaStreamAudioDestinationNode;
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
     * Get the MediaStream from the audio graphs destination, which should be denoised.
     *
     * @returns {MediaStream}
     */
    getDenoisedStream(): MediaStream;
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
     * Destroy and cleanup resources.
     *
     * @returns {void}
     */
    destroy(): void;
    _destroyed: boolean;
}
