import EventEmitter from 'events';
import RTC from '../RTC/RTC';
import { VAD_SCORE_PUBLISHED } from './DetectionEvents';

/**
 * Connects an audio JitsiLocalTrack to a vadProcessor using WebAudio ScriptProcessorNode.
 * Once an object is created audio from the local track flows through the ScriptProcessorNode as raw PCM.
 * The PCM is processed by the injected vad module and a voice activity detection score is obtained, the
 * score is published to consumers via an EventEmitter.
 * After work is done with this service the destroy method needs to be called for a proper cleanup.
 */
export default class TrackVADEmitter extends EventEmitter {
    /**
     * Constructor.
     *
     * @param {number} procNodeSampleRate - Sample rate of the ScriptProcessorNode. Possible values  256, 512, 1024,
     *  2048, 4096, 8192, 16384. Passing other values will default to closes neighbor.
     * @param {Object} vadProcessor - adapter that allows us to calculate VAD score
     * for PCM samples.
     * @param {Object} jitsiLocalTrack - JitsiLocalTrack corresponding to micDeviceId.
     */
    constructor(procNodeSampleRate, vadProcessor, jitsiLocalTrack) {
        super();
        this._procNodeSampleRate = procNodeSampleRate;
        this._vadProcessor = vadProcessor;
        this._localTrack = jitsiLocalTrack;
        this._micDeviceId = jitsiLocalTrack.getDeviceId();
        this._bufferResidue = new Float32Array([]);
        this._audioContext = new AudioContext({ sampleRate: 44100 });

        this._vadSampleSize = vadProcessor.getSampleLength();
        this._onAudioProcess = this._onAudioProcess.bind(this);

        this._initializeAudioContext();
        this._connectAudioGraph();
    }

    /**
     * Factory method that sets up all the necessary components for the creation of the TrackVADEmitter.
     *
     * @param {string} micDeviceId - Target microphone device id.
     * @param {number} procNodeSampleRate - Sample rate of the proc node.
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
     * @returns {Promise<void>}
     */
    _initializeAudioContext() {
        this._audioSource = this._audioContext.createMediaStreamSource(this._localTrack.stream);

        // TODO AudioProcessingNode is deprecated check and replace with alternative.
        // We don't need stereo for determining the VAD score so we create a single channel processing node.
        this._audioProcessingNode = this._audioContext.createScriptProcessor(this._procNodeSampleRate, 1, 1);
        this._audioProcessingNode.onaudioprocess = this._onAudioProcess;
    }

    /**
     * TODO maybe move this logic to the VAD Processor.
     * ScriptProcessorNode callback, the input parameters contains the PCM audio that is then sent to rnnoise.
     * Rnnoise only accepts PCM samples of 480 bytes whereas the webaudio processor node can't sample at a multiple
     * of 480 thus after each _onAudioProcess callback there will remain and PCM buffer residue equal
     * to _procNodeSampleRate / 480 which will be added to the next sample buffer and so on.
     *
     * @param {AudioProcessingEvent} audioEvent - Audio event.
     * @returns {void}
     */
    _onAudioProcess(audioEvent) {
        // Prepend the residue PCM buffer from the previous process callback.
        const inData = audioEvent.inputBuffer.getChannelData(0);
        const completeInData = [ ...this._bufferResidue, ...inData ];
        const sampleTimestamp = Date.now();

        let i = 0;

        for (; i + this._vadSampleSize < completeInData.length; i += this._vadSampleSize) {
            const pcmSample = completeInData.slice(i, i + this._vadSampleSize);
            const vadScore = this._vadProcessor.calculateAudioFrameVAD(pcmSample);

            this.emit(VAD_SCORE_PUBLISHED, {
                timestamp: sampleTimestamp,
                score: vadScore,
                deviceId: this._micDeviceId
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
