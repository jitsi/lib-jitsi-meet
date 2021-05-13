import EventEmitter from 'events';
import { createAudioContext } from '../webaudio/WebAudioUtils';
import { getLogger } from 'jitsi-meet-logger';

const logger = getLogger(__filename);

export default class AudioFeedbackDetection extends EventEmitter {

    constructor(audioFeedbackDetector, stream) {
        super();

        this._audioFeedbackDetector = audioFeedbackDetector;

        logger.info("Required sample rate : " + audioFeedbackDetector.getSampleRate());
        logger.info("Required number of samples : " + audioFeedbackDetector.getNumberOfBufferSamples());

        this._audioContext = createAudioContext( {sampleRate: audioFeedbackDetector.getSampleRate() } );

        this._onAudioEvent = this._onAudioEvent.bind(this);

        this._audioSource = this._audioContext.createMediaStreamSource(stream);

        this._audioProcessNode = this._audioContext.createScriptProcessor(/*audioFeedbackDetector.getNumberOfBufferSamples()*/ 16384, 1, 1);
    
        this.startFeedbackDetection = this.startFeedbackDetection.bind(this);
    }

    _onAudioEvent(audioEvent) {

        const inputData = audioEvent.inputBuffer.getChannelData(0);
        const buffer = inputData.subarray(0, 16000);

        const scores = this._audioFeedbackDetector.getAudioFeedbackScore(buffer);

        logger.info(scores);
    }

    startFeedbackDetection() {
        this._audioProcessNode.onaudioprocess = this._onAudioEvent;
        this._audioSource.connect(this._audioProcessNode);
        this._audioProcessNode.connect(this._audioContext.destination);
    }
}
