import { getLogger } from '@jitsi/logger';

import * as JitsiTrackEvents from '../../JitsiTrackEvents';
import { MediaType } from '../../service/RTC/MediaType';
import browser from '../browser';
import EventEmitter from '../util/EventEmitter';

import RTCUtils from './RTCUtils';

const logger = getLogger('modules/RTC/JitsiTrack');

/**
 * Maps our handler types to MediaStreamTrack properties.
 */
const trackHandler2Prop = {
    'track_ended': 'onended',
    'track_mute': 'onmute', // Not supported on FF
    'track_unmute': 'onunmute'
};

/**
 * Represents a single media track (either audio or video).
 */
export default class JitsiTrack extends EventEmitter {
    /* eslint-disable max-params */
    /**
     * Represents a single media track (either audio or video).
     * @constructor
     * @param conference the rtc instance
     * @param stream the WebRTC MediaStream instance
     * @param track the WebRTC MediaStreamTrack instance, must be part of
     * the given <tt>stream</tt>.
     * @param streamInactiveHandler the function that will handle
     *        onended/oninactive events of the stream.
     * @param trackMediaType the media type of the JitsiTrack
     * @param videoType the VideoType for this track if any
     */
    constructor(
            conference,
            stream,
            track,
            streamInactiveHandler,
            trackMediaType,
            videoType) {
        super();

        /**
         * Array with the HTML elements that are displaying the streams.
         * @type {Array}
         */
        this.containers = [];
        this.conference = conference;
        this.audioLevel = -1;
        this.type = trackMediaType;
        this.track = track;
        this.videoType = videoType;
        this.handlers = new Map();

        /**
         * Indicates whether this JitsiTrack has been disposed. If true, this
         * JitsiTrack is to be considered unusable and operations involving it
         * are to fail (e.g. {@link JitsiConference#addTrack(JitsiTrack)},
         * {@link JitsiConference#removeTrack(JitsiTrack)}).
         * @type {boolean}
         */
        this.disposed = false;

        /**
         * The inactive handler which will be triggered when the underlying
         * <tt>MediaStream</tt> ends.
         *
         * @private
         * @type {Function}
         */
        this._streamInactiveHandler = streamInactiveHandler;

        this._setStream(stream);
    }

    /**
     * Adds onended/oninactive handler to a MediaStream or a MediaStreamTrack.
     * Firefox doesn't fire a inactive event on the MediaStream, instead it fires
     * a onended event on the MediaStreamTrack.
     * @param {Function} handler the handler
     */
    _addMediaStreamInactiveHandler(handler) {
        if (browser.isFirefox() || browser.isWebKitBased()) {
            this.track.onended = handler;
        } else {
            this.stream.oninactive = handler;
        }
    }

    /**
     * Attach time to first media tracker only if there is conference and only
     * for the first element.
     *
     * @param {HTMLElement} container the HTML container which can be 'video' or
     * 'audio' element.
     * @private
     */
    _attachTTFMTracker(container) { // eslint-disable-line no-unused-vars
        // Should be defined by the classes that are extending JitsiTrack
    }

    /**
     * Called when the track has been attached to a new container.
     *
     * @param {HTMLElement} container the HTML container which can be 'video' or
     * 'audio' element.
     * @private
     */
    _onTrackAttach(container) { // eslint-disable-line no-unused-vars
        // Should be defined by the classes that are extending JitsiTrack
    }

    /**
     * Called when the track has been detached from a container.
     *
     * @param {HTMLElement} container the HTML container which can be 'video' or
     * 'audio' element.
     * @private
     */
    _onTrackDetach(container) { // eslint-disable-line no-unused-vars
        // Should be defined by the classes that are extending JitsiTrack
    }

    /**
     * Sets handler to the WebRTC MediaStream or MediaStreamTrack object
     * depending on the passed type.
     * @param {string} type the type of the handler that is going to be set
     * @param {Function} handler the handler.
     */
    _setHandler(type, handler) {
        if (!trackHandler2Prop.hasOwnProperty(type)) {
            logger.error(`Invalid handler type ${type}`);

            return;
        }
        if (handler) {
            this.handlers.set(type, handler);
        } else {
            this.handlers.delete(type);
        }

        if (this.stream) {
            for (const track of this.stream.getTracks()) {
                track[trackHandler2Prop[type]] = handler;
            }
        }
    }

    /**
     * Sets the stream property of JitsiTrack object and sets all stored
     * handlers to it.
     *
     * @param {MediaStream} stream the new stream.
     * @protected
     */
    _setStream(stream) {
        if (this.stream === stream) {
            return;
        }

        this.stream = stream;

        // TODO Practically, that's like the opposite of _unregisterHandlers
        // i.e. may be abstracted into a function/method called
        // _registerHandlers for clarity and easing the maintenance of the two
        // pieces of source code.
        if (this.stream) {
            for (const type of this.handlers.keys()) {
                this._setHandler(type, this.handlers.get(type));
            }
            if (this._streamInactiveHandler) {
                this._addMediaStreamInactiveHandler(this._streamInactiveHandler);
            }
        }
    }

    /**
     * Unregisters all event handlers bound to the underlying media stream/track
     * @public
     */
    _unregisterHandlers() {
        if (!this.stream) {
            logger.warn(
                `${this}: unable to unregister handlers - no stream object`);

            return;
        }

        for (const type of this.handlers.keys()) {
            // FIXME Why only video tracks?
            for (const videoTrack of this.stream.getVideoTracks()) {
                videoTrack[trackHandler2Prop[type]] = undefined;
            }
        }
        if (this._streamInactiveHandler) {
            this._addMediaStreamInactiveHandler(undefined);
        }
    }

    /**
     * Attaches the MediaStream of this track to an HTML container.
     * Adds the container to the list of containers that are displaying the
     * track.
     *
     * @param container the HTML container which can be 'video' or 'audio'
     * element.
     *
     * @returns {void}
     */
    attach(container) {
        let result = Promise.resolve();

        if (this.stream) {
            this._onTrackAttach(container);
            result = RTCUtils.attachMediaStream(container, this.stream);
        }
        this.containers.push(container);
        this._attachTTFMTracker(container);

        return result;
    }

    /**
     * Removes this JitsiTrack from the passed HTML container.
     *
     * @param container the HTML container to detach from this JitsiTrack. If
     * <tt>null</tt> or <tt>undefined</tt>, all containers are removed. A
     * container can be a 'video', 'audio' or 'object' HTML element instance to
     * which this JitsiTrack is currently attached.
     */
    detach(container) {
        for (let cs = this.containers, i = cs.length - 1; i >= 0; --i) {
            const c = cs[i];

            if (!container) {
                this._onTrackDetach(c);
                RTCUtils.attachMediaStream(c, null).catch(() => {
                    logger.error(`Detach for ${this} failed!`);
                });
            }
            if (!container || c === container) {
                cs.splice(i, 1);
            }
        }

        if (container) {
            this._onTrackDetach(container);
            RTCUtils.attachMediaStream(container, null).catch(() => {
                logger.error(`Detach for ${this} failed!`);
            });
        }
    }

    /**
     * Removes attached event listeners.
     *
     * @returns {Promise}
     */
    dispose() {
        const p = Promise.resolve();

        if (this.disposed) {
            return p;
        }

        this.detach();
        this.removeAllListeners();

        this.disposed = true;

        return p;
    }

    /**
     * Returns id of the track.
     * @returns {string|null} id of the track or null if this is fake track.
     */
    getId() {
        return this.getStreamId();
    }

    /**
     * Returns the WebRTC MediaStream instance.
     */
    getOriginalStream() {
        return this.stream;
    }

    /**
     * Returns the source name of the track.
     * @returns {String|undefined}
     */
    getSourceName() { // eslint-disable-line no-unused-vars
        // Should be defined by the classes that are extending JitsiTrack
    }

    /**
     * Returns the primary SSRC associated with the track.
     * @returns {number}
     */
    getSsrc() { // eslint-disable-line no-unused-vars
        // Should be defined by the classes that are extending JitsiTrack
    }

    /**
     * Returns the ID of the underlying WebRTC Media Stream(if any)
     * @returns {String|null}
     */
    getStreamId() {
        return this.stream ? this.stream.id : null;
    }

    /**
     * Return the underlying WebRTC MediaStreamTrack
     * @returns {MediaStreamTrack}
     */
    getTrack() {
        return this.track;
    }

    /**
     * Return the underlying WebRTC MediaStreamTrack label
     * @returns {string}
     */
    getTrackLabel() {
        return this.track.label;
    }

    /**
     * Returns the ID of the underlying WebRTC MediaStreamTrack(if any)
     * @returns {String|null}
     */
    getTrackId() {
        return this.track ? this.track.id : null;
    }

    /**
     * Returns the type (audio or video) of this track.
     */
    getType() {
        return this.type;
    }

    /**
     * Return meaningful usage label for this track depending on it's media and
     * eventual video type.
     * @returns {string}
     */
    getUsageLabel() {
        if (this.isAudioTrack()) {
            return 'mic';
        }

        return this.videoType ? this.videoType : 'default';
    }

    /**
     * Returns the video type (camera or desktop) of this track.
     */
    getVideoType() {
        return this.videoType;
    }

    /**
     * Returns the height of the track in normalized landscape format.
     */
    getHeight() {
        return Math.min(this.track.getSettings().height, this.track.getSettings().width);
    }

    /**
     * Returns the width of the track in normalized landscape format.
     */
    getWidth() {
        return Math.max(this.track.getSettings().height, this.track.getSettings().width);
    }

    /**
     * Checks whether the MediaStream is active/not ended.
     * When there is no check for active we don't have information and so
     * will return that stream is active (in case of FF).
     * @returns {boolean} whether MediaStream is active.
     */
    isActive() {
        if (typeof this.stream.active !== 'undefined') {
            return this.stream.active;
        }

        return true;
    }

    /**
     * Check if this is an audio track.
     */
    isAudioTrack() {
        return this.getType() === MediaType.AUDIO;
    }

    /**
     * Checks whether this is a local track.
     * @abstract
     * @return {boolean} 'true' if it's a local track or 'false' otherwise.
     */
    isLocal() {
        throw new Error('Not implemented by subclass');
    }

    /**
     * Check whether this is a local audio track.
     *
     * @return {boolean} -  true if track represents a local audio track, false otherwise.
     */
    isLocalAudioTrack() {
        return this.isAudioTrack() && this.isLocal();
    }

    /**
     * Check if this is a video track.
     */
    isVideoTrack() {
        return this.getType() === MediaType.VIDEO;
    }

    /**
     * Checks whether the underlying WebRTC <tt>MediaStreamTrack</tt> is muted
     * according to it's 'muted' field status.
     * @return {boolean} <tt>true</tt> if the underlying
     * <tt>MediaStreamTrack</tt> is muted or <tt>false</tt> otherwise.
     */
    isWebRTCTrackMuted() {
        return this.track && this.track.muted;
    }

    /**
     * Sets the audio level for the stream
     * @param {number} audioLevel value between 0 and 1
     * @param {TraceablePeerConnection} [tpc] the peerconnection instance which
     * is source for the audio level. It can be <tt>undefined</tt> for
     * a local track if the audio level was measured outside of the
     * peerconnection (see /modules/statistics/LocalStatsCollector.js).
     */
    setAudioLevel(audioLevel, tpc) {
        let newAudioLevel = audioLevel;

        // When using getSynchornizationSources on the audio receiver to gather audio levels for
        // remote tracks, browser reports last known audio levels even when the remote user is
        // audio muted, we need to reset the value to zero here so that the audio levels are cleared.
        // Remote tracks have the tpc info present while local tracks do not.
        if (browser.supportsReceiverStats() && typeof tpc !== 'undefined' && this.isMuted()) {
            newAudioLevel = 0;
        }

        if (this.audioLevel !== newAudioLevel) {
            this.audioLevel = newAudioLevel;
            this.emit(
                JitsiTrackEvents.TRACK_AUDIO_LEVEL_CHANGED,
                newAudioLevel,
                tpc);

        // LocalStatsCollector reports a value of 0.008 for muted mics
        // and a value of 0 when there is no audio input.
        } else if (this.audioLevel === 0
            && newAudioLevel === 0
            && this.isLocal()
            && !this.isWebRTCTrackMuted()) {
            this.emit(
                JitsiTrackEvents.NO_AUDIO_INPUT,
                newAudioLevel);
        }
    }

    /**
     * Sets new audio output device for track's DOM elements. Video tracks are
     * ignored.
     * @param {string} audioOutputDeviceId - id of 'audiooutput' device from
     *      navigator.mediaDevices.enumerateDevices(), '' for default device
     * @emits JitsiTrackEvents.TRACK_AUDIO_OUTPUT_CHANGED
     * @returns {Promise}
     */
    setAudioOutput(audioOutputDeviceId) {
        if (!RTCUtils.isDeviceChangeAvailable('output')) {
            return Promise.reject(
                new Error('Audio output device change is not supported'));
        }

        // All audio communication is done through audio tracks, so ignore
        // changing audio output for video tracks at all.
        if (this.isVideoTrack()) {
            return Promise.resolve();
        }

        return (
            Promise.all(
                this.containers.map(
                    element =>
                        element.setSinkId(audioOutputDeviceId)
                            .catch(error => {
                                logger.warn(
                                    'Failed to change audio output device on'
                                        + ' element. Default or previously set'
                                        + ' audio output device will be used.',
                                    element,
                                    error);
                                throw error;
                            }))
            )
                .then(() => {
                    this.emit(
                        JitsiTrackEvents.TRACK_AUDIO_OUTPUT_CHANGED,
                        audioOutputDeviceId);
                }));
    }

    /**
     * Assigns the source name to a track.
     * @param {String} name - The name to be assigned to the track.
     * @returns {void}
     */
    setSourceName(name) { // eslint-disable-line no-unused-vars
        // Should be defined by the classes that are extending JitsiTrack
    }
}
