import EventEmitter from 'events';
import { getLogger } from 'jitsi-meet-logger';

import * as DetectionEvents from './DetectionEvents';
import TrackVADEmitter from './TrackVADEmitter';

const logger = getLogger(__filename);

/**
 * Sample rate used by TrackVADEmitter, this value determines how often the ScriptProcessorNode is going to call the
 * process audio function and with what sample size.
 * Basically lower values mean more callbacks with lower processing times bigger values less callbacks with longer
 * processing times. This value is somewhere in the middle, so we strike a balance between flooding with callbacks
 * and processing time. Possible values  256, 512, 1024, 2048, 4096, 8192, 16384. Passing other values will default
 * to closes neighbor.
 */
const SCRIPT_NODE_SAMPLE_RATE = 4096;

/**
 * Voice activity detection reporting service. The service create TrackVADEmitters for the provided devices and
 * publishes an average of their VAD score over the specified interval via EventEmitter.
 * The service is not reusable if destroyed a new one needs to be created, i.e. when a new device is added to the system
 * a new service needs to be created and the old discarded.
 */
export default class VADReportingService extends EventEmitter {

    /**
     *
     * @param {number} intervalDelay - Delay at which to publish VAD score for monitored devices.
     *
     * @constructor
     */
    constructor(intervalDelay) {
        super();

        /**
         * Map containing context for devices currently being monitored by the reporting service.
         */
        this._contextMap = new Map();


        /**
         * State flag, check if the instance was destroyed.
         */
        this._destroyed = false;

        /**
         * Delay at which to publish VAD score for monitored devices.
         */
        this._intervalDelay = intervalDelay;

        /**
         * Identifier for the interval publishing stats on the set interval.
         */
        this._intervalId = null;


        logger.log(`Constructed VADReportingService with publish interval of: ${intervalDelay}`);
    }

    /**
     * Factory methods that creates the TrackVADEmitters for the associated array of devices and instantiates
     * a VADReportingService.
     *
     * @param {Array<MediaDeviceInfo>} micDeviceList - Device list that is monitored inside the service.
     * @param {number} intervalDelay - Delay at which to publish VAD score for monitored devices.
     * @param {Object} createVADProcessor - Function that creates a Voice activity detection processor. The processor
     * needs to implement the following functions:
     * - <tt>getSampleLength()</tt> - Returns the sample size accepted by getSampleLength.
     * - <tt>getRequiredPCMFrequency()</tt> - Returns the PCM frequency at which the processor operates.
     * - <tt>calculateAudioFrameVAD(pcmSample)</tt> - Process a 32 float pcm sample of getSampleLength size.
     *
     * @returns {Promise<VADReportingService>}
     */
    static create(micDeviceList, intervalDelay, createVADProcessor) {
        const vadReportingService = new VADReportingService(intervalDelay);
        const emitterPromiseArray = [];

        const audioDeviceList = micDeviceList.filter(device => device.kind === 'audioinput');

        // Create a TrackVADEmitter for each provided audio input device.
        for (const micDevice of audioDeviceList) {
            logger.log(`Initializing VAD context for mic: ${micDevice.label} -> ${micDevice.deviceId}`);

            const emitterPromise = createVADProcessor()
            .then(rnnoiseProcessor =>
                TrackVADEmitter.create(micDevice.deviceId, SCRIPT_NODE_SAMPLE_RATE, rnnoiseProcessor))
            .then(emitter => {
                emitter.on(
                    DetectionEvents.VAD_SCORE_PUBLISHED,
                    vadReportingService._devicePublishVADScore.bind(vadReportingService)
                );
                emitter.start();

                return {
                    vadEmitter: emitter,
                    deviceInfo: micDevice,
                    scoreArray: []
                };
            });

            emitterPromiseArray.push(emitterPromise);
        }

        // Once all the TrackVADEmitter promises are resolved get the ones that were successfully initialized and start
        // monitoring them.
        return Promise.allSettled(emitterPromiseArray).then(outcomeArray => {

            const successfulPromises = outcomeArray.filter(p => p.status === 'fulfilled');
            const rejectedPromises = outcomeArray.filter(p => p.status === 'rejected');


            const availableDeviceContexts = successfulPromises.map(p => p.value);
            const rejectReasons = rejectedPromises.map(p => p.value);

            for (const reason of rejectReasons) {
                logger.error('Failed to acquire audio device with error: ', reason);
            }

            vadReportingService._setVADContextArray(availableDeviceContexts);
            vadReportingService._startPublish();

            return vadReportingService;
        });
    }

    /**
     * Destroy TrackVADEmitters and clear the context map.
     *
     * @returns {void}
     */
    _clearContextMap() {
        for (const vadContext of this._contextMap.values()) {
            vadContext.vadEmitter.destroy();
        }
        this._contextMap.clear();
    }

    /**
     * Set the watched device contexts.
     *
     * @param {Array<VADDeviceContext>} vadContextArray - List of mics.
     * @returns {void}
     */
    _setVADContextArray(vadContextArray) {
        for (const vadContext of vadContextArray) {
            this._contextMap.set(vadContext.deviceInfo.deviceId, vadContext);
        }
    }

    /**
     * Start the setInterval reporting process.
     *
     * @returns {void}.
     */
    _startPublish() {
        logger.log('VADReportingService started publishing.');
        this._intervalId = setInterval(() => {
            this._reportVadScore();
        }, this._intervalDelay);
    }

    /**
     * Function called at set interval with selected compute. The result will be published on the set callback.
     *
     * @returns {void}
     * @fires VAD_REPORT_PUBLISHED
     */
    _reportVadScore() {
        const vadComputeScoreArray = [];
        const computeTimestamp = Date.now();

        // Go through each device and compute cumulated VAD score.

        for (const [ deviceId, vadContext ] of this._contextMap) {
            const nrOfVADScores = vadContext.scoreArray.length;
            let vadSum = 0;

            vadContext.scoreArray.forEach(vadScore => {
                vadSum += vadScore.score;
            });

            // TODO For now we just calculate the average score for each device, more compute algorithms will be added.
            const avgVAD = vadSum / nrOfVADScores;

            vadContext.scoreArray = [];

            vadComputeScoreArray.push({
                timestamp: computeTimestamp,
                score: avgVAD,
                deviceId
            });
        }

        logger.log('VADReportingService reported.', vadComputeScoreArray);

        /**
         * Once the computation for all the tracked devices is done, fire an event containing all the necessary
         * information.
         *
         * @event VAD_REPORT_PUBLISHED
         * @type Array<Object> with the following structure:
         * @property {Date} timestamp - Timestamo at which the compute took place.
         * @property {number} avgVAD - Average VAD score over monitored period of time.
         * @property {string} deviceId - Associate local audio device ID.
         */
        this.emit(DetectionEvents.VAD_REPORT_PUBLISHED, vadComputeScoreArray);
    }

    /**
     * Callback method passed to vad emitters in order to publish their score.
     *
     * @param {Object} vadScore -VAD score emitted by.
     * @param {Date}   vadScore.timestamp - Exact time at which processed PCM sample was generated.
     * @param {number} vadScore.score - VAD score on a scale from 0 to 1 (i.e. 0.7).
     * @param {string} vadScore.deviceId - Device id of the associated track.
     * @returns {void}
     * @listens VAD_SCORE_PUBLISHED
     */
    _devicePublishVADScore(vadScore) {
        const context = this._contextMap.get(vadScore.deviceId);

        if (context) {
            context.scoreArray.push(vadScore);
        }
    }

    /**
     * Destroy the VADReportingService, stops the setInterval reporting, destroys the emitters and clears the map.
     * After this call the instance is no longer usable.
     *
     * @returns {void}.
     */
    destroy() {
        if (this._destroyed) {
            return;
        }

        logger.log('Destroying VADReportingService.');

        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
        this._clearContextMap();
        this._destroyed = true;
    }
}
