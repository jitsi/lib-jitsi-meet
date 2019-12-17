import { EventEmitter } from 'events';
import { getLogger } from 'jitsi-meet-logger';

import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';

import { VAD_SCORE_PUBLISHED } from './DetectionEvents';
import TrackVADEmitter from './TrackVADEmitter';

const logger = getLogger(__filename);

/**
 * Sample rate of TrackVADEmitter, it defines how many audio samples are processed at a time.
 * @type {number}
 */
const VAD_EMITTER_SAMPLE_RATE = 4096;

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
    constructor(conference, createVADProcessor) {
        super();

        /**
         * Member function that instantiates a VAD processor.
         */
        this._createVADProcessor = createVADProcessor;

        /**
         * Current {@link TrackVADEmitter}. VAD Emitter uses a {@link JitsiLocalTrack} and VAD processor to generate
         * period voice probability scores.
         */
        this._vadEmitter = null;

        /**
         * Instance of {@link VADTalkMutedDetection} that can be hooked up to the service.
         */
        this._vadTMDetection = null;

        /**
         * Instance of {@link VADNoiseDetection} that can be hooked up to the service.
         */
        this._vadNoiseDetection = null;

        /**
         * Promise used to chain create and destroy operations associated with TRACK_ADDED and TRACK_REMOVED events
         * coming from the conference.
         * Because we have an async created component (VAD Processor) we need to make sure that it's initialized before
         * we destroy it ( when changing the device for instance), or when we use it from an external point of entry
         * i.e. (TRACK_MUTE_CHANGED event callback).
         */
        this._vadInitTracker = Promise.resolve();

        /**
         * Listens for {@link TrackVADEmitter} events and processes them.
         */
        this._processVADScore = this._processVADScore.bind(this);

        conference.on(JitsiConferenceEvents.TRACK_ADDED, this._trackAdded.bind(this));
        conference.on(JitsiConferenceEvents.TRACK_REMOVED, this._trackRemoved.bind(this));
        conference.on(JitsiConferenceEvents.TRACK_MUTE_CHANGED, this._trackMuteChanged.bind(this));
    }

    /**
     * Set the VADTalkMutedDetection object that uses data from TrackVADEmitter.
     *
     * @param {*} vadTMDetector
     */
    setVADTalkMutedDetection(vadTMDetection) {
        this._vadTMDetection = vadTMDetection;
    }

    /**
     * Set the VADNoiseDetection instance that uses data from TrackVADEmitter.
     *
     * @param {@} vadNoisyDetector
     */
    setVADNoiseDetection(vadNoiseDetection) {
        this._vadNoiseDetection = vadNoiseDetection;
    }

    /**
     * Start the {@link TrackVADEmitter} and attach the event listener.
     * @returns {void}
     */
    _startVADEmitter() {
        this._vadEmitter.on(VAD_SCORE_PUBLISHED, this._processVADScore);
        this._vadEmitter.start();
    }

    /**
     * Stop the {@link TrackVADEmitter} and detach the event listener.
     * @returns {void}
     */
    _stopVADEmitter() {
        this._vadEmitter.removeListener(VAD_SCORE_PUBLISHED, this._processVADScore);
        this._vadEmitter.stop();
    }

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
    _processVADScore(vadScore) {
        if (this._vadTMDetection) {
            this._vadTMDetection.processVADScore(vadScore);
        }

        if (this._vadNoiseDetection) {
            this._vadNoiseDetection.processVADScore(vadScore);
        }
    }

    /**
     * Notifies the detector that a track was added to the associated {@link JitsiConference}.
     * Only take into account local audio tracks.
     * @param {JitsiTrack} track - The added track.
     * @returns {void}
     * @listens TRACK_ADDED
     */
    _trackAdded(track) {
        if (track.isLocalAudioTrack()) {
            // Keep a track promise so we take into account successive TRACK_ADD events being generated so that we
            // destroy/create the processing context in the proper order.
            this._vadInitTracker = this._vadInitTracker.then(() => this._createVADProcessor())
                .then(vadProcessor =>
                    TrackVADEmitter.create(track.getDeviceId(), VAD_EMITTER_SAMPLE_RATE, vadProcessor)
                )
                .then(vadEmitter => {
                    logger.debug('Created VAD emitter for track: ', track.getTrackLabel());

                    this._vadEmitter = vadEmitter;

                    this._startVADEmitter();
                });
        }
    }

    /**
     * Notifies the detector that the mute state of a {@link JitsiConference} track has changed. Only takes into account
     * local audio tracks.
     * @param {JitsiTrack} track - The track whose mute state has changed.
     * @returns {void}
     * @listens TRACK_MUTE_CHANGED
     */
    _trackMuteChanged(track) {
        if (track.isLocalAudioTrack()) {
            // On a mute toggle reset the state.
            this._vadInitTracker = this._vadInitTracker.then(() => {
                // Set mute status for the VADTalkMutedDetection module.
                if (this._vadTMDetection) {
                    this._vadTMDetection.changeMuteState(track.isMuted());
                }

                if (this._vadNoiseDetection) {
                    this._vadNoiseDetection.changeMuteState(track.isMuted());
                }
            });
        }
    }

    /**
     * Notifies the detector that a track associated with the {@link JitsiConference} was removed. Only takes into
     * account local audio tracks. Cleans up resources associated with the track and resets the processing context.
     *
     * @param {JitsiTrack} track - The removed track.
     * @returns {void}
     * @listens TRACK_REMOVED
     */
    _trackRemoved(track) {
        if (track.isLocalAudioTrack()) {
            // Use the promise to make sure operations are in sequence.
            this._vadInitTracker = this._vadInitTracker.then(() => {
                logger.debug('Removing track from VAD detection - ', track.getTrackLabel());

                if (this._vadEmitter) {
                    this._stopVADEmitter();
                    this._vadEmitter.destroy();
                    this._vadEmitter = null;
                }

                if (this._vadTMDetection) {
                    this._vadTMDetection.reset();
                }

                if (this._vadNoiseDetection) {
                    this._vadNoiseDetection.reset();
                }
            });
        }
    }


}
