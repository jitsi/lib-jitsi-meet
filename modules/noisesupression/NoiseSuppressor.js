import { leastCommonMultiple } from '../util/MathUtil';
import { createAudioContext } from '../webaudio/WebAudioUtils';

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
    constructor(procNodeSampleRate, denoiseProcessor, streamToDenoise) {
        this._procNodeSampleRate = procNodeSampleRate;
        this._denoiseProcessor = denoiseProcessor;
        this._streamToDenoise = streamToDenoise;

        /**
         * PCM Sample size expected by the denoise processor.
         */
        this._denoiseSampleSize = this._denoiseProcessor.getSampleLength();

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
        this._circularBufferLength = leastCommonMultiple(procNodeSampleRate, this._denoiseSampleSize);
        this._circularBuffer = new Float32Array(this._circularBufferLength);

        /**
         * The circular buffer uses a couple of indexes to track data segments. Input data from the stream is
         * copied to the circular buffer as it comes in, one `procNodeSampleRate` sized sample at a time.
         * _inputBufferLength denotes the current length of all gathered raw audio segments.
         */
        this._inputBufferLength = 0;

        /**
         * Denoising is done directly on the circular buffer using subArray views, but because
         * `procNodeSampleRate` and `_denoiseSampleSize` have different sizes, denoised samples lag behind
         * the current gathered raw audio samples so we need a different index, `_denoisedBufferLength`.
         */
        this._denoisedBufferLength = 0;

        /**
         * Once enough data has been denoised (size of procNodeSampleRate) it's sent to the
         * ScriptProcessorNode's output buffer, `_denoisedBufferIndx` indicates the start index on the
         * circular buffer of denoised data not yet sent.
         */
        this._denoisedBufferIndx = 0;

        /**
         * The AudioContext instance with the preferred sample frequency.
         */
        this._audioContext = createAudioContext({ sampleRate: this._denoiseProcessor.getRequiredPCMFrequency() });

        /**
         * Event listener function that will be called by the ScriptProcessNode with raw PCM data,
         * depending on the set sample rate.
         */
        this._onAudioProcess = this._onAudioProcess.bind(this);

        this._initializeAudioContext();
    }

    /**
     * Sets up the audio graph in the AudioContext.
     *
     * @returns {void}
     */
    _initializeAudioContext() {
        this._audioSource = this._audioContext.createMediaStreamSource(this._streamToDenoise);
        this._audioDestination = this._audioContext.createMediaStreamDestination();
        this._audioProcessingNode = this._audioContext.createScriptProcessor(this._procNodeSampleRate, 1, 1);
    }

    /**
     * ScriptProcessorNode callback. The input parameters contains the PCM audio that is then sent to rnnoise.
     * Rnnoise only accepts PCM samples of 480 bytes whereas the webaudio processor node can't sample at a multiple
     * of 480 thus after each _onAudioProcess callback there will remain and PCM buffer residue equal
     * to _procNodeSampleRate / 480 which will be added to the next sample buffer and so on.
     *
     * @param {AudioProcessingEvent} audioEvent - Audio event.
     * @returns {void}
     */
    _onAudioProcess(audioEvent) {
        const inData = audioEvent.inputBuffer.getChannelData(0);
        const outData = audioEvent.outputBuffer.getChannelData(0);

        // Append new raw PCM sample.
        this._circularBuffer.set(inData, this._inputBufferLength);
        this._inputBufferLength += inData.length;

        // New raw samples were just added, start denoising frames, _denoisedBufferLength gives us
        // the position at which the previous denoise iteration ended, basically it takes into account
        // residue data.
        for (;this._denoisedBufferLength + this._denoiseSampleSize <= this._inputBufferLength;
            this._denoisedBufferLength += this._denoiseSampleSize) {
            // Create view of circular buffer so it can be modified in place, removing the need for
            // extra copies.
            const denoiseFrame = this._circularBuffer.subarray(
                this._denoisedBufferLength,
                this._denoisedBufferLength + this._denoiseSampleSize
            );

            this._denoiseProcessor.calculateAudioFrameVAD(denoiseFrame, true);
        }

        // Determine how much denoised audio is available, if the start index of denoised samples is smaller
        // then _denoisedBufferLength that means a rollover occured.
        let unsentDenoisedDataLength;

        if (this._denoisedBufferIndx > this._denoisedBufferLength) {
            unsentDenoisedDataLength = this._circularBufferLength - this._denoisedBufferIndx;
        } else {
            unsentDenoisedDataLength = this._denoisedBufferLength - this._denoisedBufferIndx;
        }

        // Only copy denoised data to output when there's enough of it to fit the exact buffer length.
        // e.g. if the buffer size is 1024 samples but we only denoised 960 (this happens on the first iteration)
        // nothing happens, then on the next iteration 1920 samples will be denoised so we send 1024 which leaves
        // 896 for the next iteration and so on.
        if (unsentDenoisedDataLength >= outData.length) {
            const denoisedFrame = this._circularBuffer.subarray(
                this._denoisedBufferIndx,
                this._denoisedBufferIndx + outData.length
            );

            outData.set(denoisedFrame, 0);
            this._denoisedBufferIndx += outData.length;
        }

        // When the end of the circular buffer has been reached, start from the beggining. By the time the index
        // starts over, the data from the begging is stale (has already been processed) and can be safely
        // overwritten.
        if (this._denoisedBufferIndx === this._circularBufferLength) {
            this._denoisedBufferIndx = 0;
        }

        // Because the circular buffer's length is the lcm of both input size and the processor's sample size,
        // by the time we reach the end with the input index the denoise length index will be there as well.
        if (this._inputBufferLength === this._circularBufferLength) {
            this._inputBufferLength = 0;
            this._denoisedBufferLength = 0;
        }
    }

    /**
     * Connects the nodes in the AudioContext to start the flow of audio data.
     *
     * @returns {void}
     */
    _connectAudioGraph() {
        this._audioProcessingNode.onaudioprocess = this._onAudioProcess;
        this._audioSource.connect(this._audioProcessingNode);
        this._audioProcessingNode.connect(this._audioDestination);
    }

    /**
     * Disconnects the nodes in the AudioContext.
     *
     * @returns {void}
     */
    _disconnectAudioGraph() {
        // Even thought we disconnect the processing node it seems that some callbacks remain queued,
        // resulting in calls with and uninitialized context.
        // eslint-disable-next-line no-empty-function
        this._audioProcessingNode.onaudioprocess = () => {};
        this._audioDestination.disconnect();
        this._audioProcessingNode.disconnect();
        this._audioSource.disconnect();
    }

    /**
     * Cleanup potentially acquired resources.
     *
     * @returns {void}
     */
    _cleanupResources() {
        this._disconnectAudioGraph();
        this._audioContext.close();
    }

    /**
     * Get the MediaStream from the audio graphs destination, which should be denoised.
     *
     * @returns {MediaStream}
     */
    getDenoisedStream() {
        return this._audioDestination.stream;
    }

    /**
     * Start the emitter by connecting the audio graph.
     *
     * @returns {void}
     */
    start() {
        this._connectAudioGraph();
    }

    /**
     * Stops the emitter by disconnecting the audio graph.
     *
     * @returns {void}
     */
    stop() {
        this._disconnectAudioGraph();
    }

    /**
     * Destroy and cleanup resources.
     *
     * @returns {void}
     */
    destroy() {
        if (this._destroyed) {
            return;
        }

        this._cleanupResources();
        this._destroyed = true;
    }
}
