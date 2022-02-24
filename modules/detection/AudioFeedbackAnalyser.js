import { EventEmitter } from 'events';
import { getLogger } from 'jitsi-meet-logger';
import * as RTC_EVENTS from '../../service/RTC/RTCEvents';
import RTC from '../RTC/RTC';
import RTCUtils from '../RTC/RTCUtils';
import AudioFeedbackDetection from './AudioFeedbackDetection';

const logger = getLogger(__filename);

export default class AudioFeedbackAnalyser extends EventEmitter {

    constructor(conference, createAudioFeedbackDetector) {
        super();

        this._createAudioFeedbackDetector = createAudioFeedbackDetector;

        RTCUtils.addListener(RTC_EVENTS.AUDIO_OUTPUT_DEVICE_CHANGED, this._onAudioOutputChanged.bind(this));

        this._setupAudioFeedbackDetection = this._setupAudioFeedbackDetection.bind(this);

        this._setupAudioFeedbackDetection(RTC.getAudioOutputDevice());

        this._audioFeedbackDetection = null;
    }

    _onAudioOutputChanged(deviceId) {
        this._setupAudioFeedbackDetection(deviceId);
    }

    _setupAudioFeedbackDetection(deviceId) {
        navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId
            }
        }).then(mediaStream => {

            logger.info(mediaStream);

            this._createAudioFeedbackDetector()
                .then(audioFeedbackDetector => {
                    this._audioFeedbackDetection = new AudioFeedbackDetection(audioFeedbackDetector,mediaStream);
                    this._startAudioFeedbackDetection();
                })
                .catch(error => {
                    logger.info("Failed to create feedback detector! " + error);
                });
        }).catch(error => {
            logger.info("ERROR " + error);
        });
    }

    _startAudioFeedbackDetection() {
        this._audioFeedbackDetection.startFeedbackDetection();
    }

    _stopAudioFeedbackDetection() {

    }
}
