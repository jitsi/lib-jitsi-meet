import EventEmitter from 'events';

import RTC from '../RTC/RTC';
import { createAudioContext } from '../webaudio/WebAudioUtils';

import { VAD_SCORE_PUBLISHED } from './DetectionEvents';

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
     * Constructor.
     *
     * @param {number} procNodeSampleRate - Sample rate of the ScriptProcessorNode. Possible values  256, 512, 1024,
     *  2048, 4096, 8192, 16384. Passing other values will default to closes neighbor.
     * @param {Object} vadProcessor - VAD processor that allows us to calculate VAD score for PCM samples.
     * @param {JitsiLocalTrack} jitsiLocalTrack - JitsiLocalTrack corresponding to micDeviceId.
     */
    constructor(procNodeSampleRate, vadProcessor, jitsiLocalTrack) {
        super();

        /**
         * Sample rate of the ScriptProcessorNode.
         */
        this._procNodeSampleRate = procNodeSampleRate;

        /**
         * VAD Processor that allows us to calculate VAD score for PCM samples
         */
        this._vadProcessor = vadProcessor;

        /**
         * The JitsiLocalTrack instance.
         */
        this._localTrack = jitsiLocalTrack;

        /**
         * Buffer to hold residue PCM resulting after a ScriptProcessorNode callback
         */
        this._bufferResidue = new Float32Array([]);

        /**
         * The AudioContext instance with the preferred sample frequency.
         */
        this._audioContext = createAudioContext({ sampleRate: vadProcessor.getRequiredPCMFrequency() });

        /**
         * PCM Sample size expected by the VAD Processor instance. We cache it here as this value is used extensively,
         * saves a couple of function calls.
         */
        this._vadSampleSize = vadProcessor.getSampleLength();

        /**
         * Event listener function that will be called by the ScriptProcessNode with raw PCM data, depending on the set
         * sample rate.
         */
        this._onAudioProcess = this._onAudioProcess.bind(this);

        this._initializeAudioContext();
    }

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
    static create(micDeviceId, procNodeSampleRate, vadProcessor) {
        return RTC.obtainAudioAndVideoPermissions({
            devices: [ 'audio' ],
            micDeviceId
        }).then(localTrack => {
            // We only expect one audio track when specifying a device id.
            if (!localTrack[0]) {
                throw new Error(`Failed to create jitsi local track for device id: ${micDeviceId}`);
            }

            return new TrackVADEmitter(procNodeSampleRate, vadProcessor, localTrack[0]);

            // We have no exception handling at this point as there is nothing to clean up, the vadProcessor
            // life cycle is handled by whoever created this instance.
        });
    }

    /**
     * Sets up the audio graph in the AudioContext.
     *
     * @returns {void}
     */
    _initializeAudioContext() {
        this._audioSource = this._audioContext.createMediaStreamSource(this._localTrack.stream);

        // TODO AudioProcessingNode is deprecated in the web audio specifications and the recommended replacement
        // is audio worklet, however at the point of implementation AudioProcessingNode was still de de facto way
        // of achieving this functionality and supported in all major browsers as opposed to audio worklet which
        // was only available in Chrome. This todo is just a reminder that we should replace AudioProcessingNode
        // with audio worklet when it's mature enough and has more browser support.
        // We don't need stereo for determining the VAD score so we create a single channel processing node.
        this._audioProcessingNode = this._audioContext.createScriptProcessor(this._procNodeSampleRate, 1, 1);
    }

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
    _onAudioProcess(audioEvent) {
        // Prepend the residue PCM buffer from the previous process callback.
        const inData = audioEvent.inputBuffer.getChannelData(0);
        const completeInData = [ ...this._bufferResidue, ...inData ];
        const sampleTimestamp = Date.now();

        let i = 0;

        for (; i + this._vadSampleSize < completeInData.length; i += this._vadSampleSize) {
            const pcmSample = completeInData.slice(i, i + this._vadSampleSize);

            // The VAD processor might change the values inside the array so we make a copy.
            const vadScore = this._vadProcessor.calculateAudioFrameVAD(pcmSample.slice());

            this.emit(VAD_SCORE_PUBLISHED, {
                timestamp: sampleTimestamp,
                score: vadScore,
                pcmData: pcmSample,
                deviceId: this._localTrack.getDeviceId()
            });
        }

        this._bufferResidue = completeInData.slice(i, completeInData.length);
    }

    /**
     * Connects the nodes in the AudioContext to start the flow of audio data.
     *
     * @returns {void}
     */
    _connectAudioGraph() {
        this._audioProcessingNode.onaudioprocess = this._onAudioProcess;
        this._audioSource.connect(this._audioProcessingNode);
        this._audioProcessingNode.connect(this._audioContext.destination);
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
        this._localTrack.stopStream();
    }

    /**
     * Get the associated track device ID.
     *
     * @returns {string}
     */
    getDeviceId() {
        return this._localTrack.getDeviceId();
    }


    /**
     * Get the associated track label.
     *
     * @returns {string}
     */
    getTrackLabel() {
        return this._localTrack.getDeviceLabel();
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
        this._bufferResidue = [];
    }

    /**
     * Destroy TrackVADEmitter instance (release resources and stop callbacks).
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
