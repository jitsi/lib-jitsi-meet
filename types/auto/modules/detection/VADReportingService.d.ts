/// <reference types="node" />
/**
 * Voice activity detection reporting service. The service create TrackVADEmitters for the provided devices and
 * publishes an average of their VAD score over the specified interval via EventEmitter.
 * The service is not reusable if destroyed a new one needs to be created, i.e. when a new device is added to the system
 * a new service needs to be created and the old discarded.
 */
export default class VADReportingService extends EventEmitter {
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
    static create(micDeviceList: Array<MediaDeviceInfo>, intervalDelay: number, createVADProcessor: any): Promise<VADReportingService>;
    /**
     *
     * @param {number} intervalDelay - Delay at which to publish VAD score for monitored devices.
     *
     * @constructor
     */
    constructor(intervalDelay: number);
    /**
     * Map containing context for devices currently being monitored by the reporting service.
     */
    _contextMap: Map<any, any>;
    /**
     * State flag, check if the instance was destroyed.
     */
    _destroyed: boolean;
    /**
     * Delay at which to publish VAD score for monitored devices.
     */
    _intervalDelay: number;
    /**
     * Identifier for the interval publishing stats on the set interval.
     */
    _intervalId: NodeJS.Timer;
    /**
     * Destroy TrackVADEmitters and clear the context map.
     *
     * @returns {void}
     */
    _clearContextMap(): void;
    /**
     * Set the watched device contexts.
     *
     * @param {Array<VADDeviceContext>} vadContextArray - List of mics.
     * @returns {void}
     */
    _setVADContextArray(vadContextArray: Array<any>): void;
    /**
     * Start the setInterval reporting process.
     *
     * @returns {void}.
     */
    _startPublish(): void;
    /**
     * Function called at set interval with selected compute. The result will be published on the set callback.
     *
     * @returns {void}
     * @fires VAD_REPORT_PUBLISHED
     */
    _reportVadScore(): void;
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
    _devicePublishVADScore(vadScore: {
        timestamp: Date;
        score: number;
        deviceId: string;
    }): void;
    /**
     * Destroy the VADReportingService, stops the setInterval reporting, destroys the emitters and clears the map.
     * After this call the instance is no longer usable.
     *
     * @returns {void}.
     */
    destroy(): void;
}
import EventEmitter from "events";
