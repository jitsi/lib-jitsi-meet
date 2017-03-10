/* global __filename, module */
import EventEmitter from 'events';
import { getLogger } from 'jitsi-meet-logger';
import * as JitsiTrackEvents from '../../JitsiTrackEvents';
import * as MediaType from '../../service/RTC/MediaType';
import RTCBrowserType from './RTCBrowserType';
import RTCUtils from './RTCUtils';

const logger = getLogger(__filename);

/**
 * Maps our handler types to MediaStreamTrack properties.
 */
const trackHandler2Prop = {
    'track_mute': 'onmute',// Not supported on FF
    'track_unmute': 'onunmute',
    'track_ended': 'onended'
};

/**
 * This implements 'onended' callback normally fired by WebRTC after the stream
 * is stopped. There is no such behaviour yet in FF, so we have to add it.
 * @param jitsiTrack our track object holding the original WebRTC stream object
 * to which 'onended' handling will be added.
 */
function implementOnEndedHandling(jitsiTrack) {
    const stream = jitsiTrack.getOriginalStream();

    if(!stream) {
        return;
    }

    const originalStop = stream.stop;
    stream.stop = function() {
        originalStop.apply(stream);
        if (jitsiTrack.isActive()) {
            stream.onended();
        }
    };
}

/**
 * Adds onended/oninactive handler to a MediaStream.
 * @param mediaStream a MediaStream to attach onended/oninactive handler
 * @param handler the handler
 */
function addMediaStreamInactiveHandler(mediaStream, handler) {
    // Temasys will use onended
    if (typeof mediaStream.active === 'undefined') {
        mediaStream.onended = handler;
    } else {
        mediaStream.oninactive = handler;
    }
}

/**
 * Represents a single media track (either audio or video).
 * @constructor
 * @param rtc the rtc instance
 * @param stream the WebRTC MediaStream instance
 * @param track the WebRTC MediaStreamTrack instance, must be part of
 * the given <tt>stream</tt>.
 * @param streamInactiveHandler the function that will handle
 *        onended/oninactive events of the stream.
 * @param trackMediaType the media type of the JitsiTrack
 * @param videoType the VideoType for this track if any
 * @param ssrc the SSRC of this track if known
 */
function JitsiTrack(conference, stream, track, streamInactiveHandler, trackMediaType,
                    videoType, ssrc) {
    /**
     * Array with the HTML elements that are displaying the streams.
     * @type {Array}
     */
    this.containers = [];
    this.conference = conference;
    this.stream = stream;
    this.ssrc = ssrc;
    this.eventEmitter = new EventEmitter();
    this.audioLevel = -1;
    this.type = trackMediaType;
    this.track = track;
    this.videoType = videoType;
    this.handlers = {};

    /**
     * Indicates whether this JitsiTrack has been disposed. If true, this
     * JitsiTrack is to be considered unusable and operations involving it are
     * to fail (e.g. {@link JitsiConference#addTrack(JitsiTrack)},
     * {@link JitsiConference#removeTrack(JitsiTrack)}).
     * @type {boolean}
     */
    this.disposed = false;
    this._setHandler('inactive', streamInactiveHandler);
}

/**
 * Sets handler to the WebRTC MediaStream or MediaStreamTrack object depending
 * on the passed type.
 * @param {string} type the type of the handler that is going to be set
 * @param {Function} handler the handler.
 */
JitsiTrack.prototype._setHandler = function(type, handler) {
    this.handlers[type] = handler;
    if(!this.stream) {
        return;
    }

    if(type === 'inactive') {
        if (RTCBrowserType.isFirefox()) {
            implementOnEndedHandling(this);
        }
        addMediaStreamInactiveHandler(this.stream, handler);
    } else if(trackHandler2Prop.hasOwnProperty(type)) {
        this.stream.getVideoTracks().forEach(track => {
            track[trackHandler2Prop[type]] = handler;
        }, this);
    }
};

/**
 * Sets the stream property of JitsiTrack object and sets all stored handlers
 * to it.
 * @param {MediaStream} stream the new stream.
 */
JitsiTrack.prototype._setStream = function(stream) {
    this.stream = stream;
    Object.keys(this.handlers).forEach(function(type) {
        typeof this.handlers[type] === 'function'
            && this._setHandler(type, this.handlers[type]);
    }, this);
};

/**
 * Returns the type (audio or video) of this track.
 */
JitsiTrack.prototype.getType = function() {
    return this.type;
};

/**
 * Check if this is an audio track.
 */
JitsiTrack.prototype.isAudioTrack = function() {
    return this.getType() === MediaType.AUDIO;
};

/**
 * Checks whether the underlying WebRTC <tt>MediaStreamTrack</tt> is muted
 * according to it's 'muted' field status.
 * @return {boolean} <tt>true</tt> if the underlying <tt>MediaStreamTrack</tt>
 * is muted or <tt>false</tt> otherwise.
 */
JitsiTrack.prototype.isWebRTCTrackMuted = function() {
    return this.track && this.track.muted;
};

/**
 * Check if this is a video track.
 */
JitsiTrack.prototype.isVideoTrack = function() {
    return this.getType() === MediaType.VIDEO;
};

/**
 * Checks whether this is a local track.
 * @abstract
 * @return {boolean} 'true' if it's a local track or 'false' otherwise.
 */
JitsiTrack.prototype.isLocal = function() {
    throw new Error('Not implemented by subclass');
};

/**
 * Returns the WebRTC MediaStream instance.
 */
JitsiTrack.prototype.getOriginalStream = function() {
    return this.stream;
};

/**
 * Returns the ID of the underlying WebRTC Media Stream(if any)
 * @returns {String|null}
 */
JitsiTrack.prototype.getStreamId = function() {
    return this.stream ? this.stream.id : null;
};

/**
 * Return the underlying WebRTC MediaStreamTrack
 * @returns {MediaStreamTrack}
 */
JitsiTrack.prototype.getTrack = function() {
    return this.track;
};

/**
 * Returns the ID of the underlying WebRTC MediaStreamTrack(if any)
 * @returns {String|null}
 */
JitsiTrack.prototype.getTrackId = function() {
    return this.track ? this.track.id : null;
};

/**
 * Return meaningful usage label for this track depending on it's media and
 * eventual video type.
 * @returns {string}
 */
JitsiTrack.prototype.getUsageLabel = function() {
    if (this.isAudioTrack()) {
        return 'mic';
    }
    return this.videoType ? this.videoType : 'default';

};

/**
 * Eventually will trigger RTCEvents.TRACK_ATTACHED event.
 * @param container the video/audio container to which this stream is attached
 *        and for which event will be fired.
 * @private
 */
JitsiTrack.prototype._maybeFireTrackAttached = function(container) {
    if (this.conference && container) {
        this.conference._onTrackAttach(this, container);
    }
};

/**
 * Attaches the MediaStream of this track to an HTML container.
 * Adds the container to the list of containers that are displaying the track.
 * Note that Temasys plugin will replace original audio/video element with
 * 'object' when stream is being attached to the container for the first time.
 *
 * * NOTE * if given container element is not visible when the stream is being
 * attached it will be shown back given that Temasys plugin is currently in use.
 *
 * @param container the HTML container which can be 'video' or 'audio' element.
 *        It can also be 'object' element if Temasys plugin is in use and this
 *        method has been called previously on video or audio HTML element.
 *
 * @returns potentially new instance of container if it was replaced by the
 *          library. That's the case when Temasys plugin is in use.
 */
JitsiTrack.prototype.attach = function(container) {
    if(this.stream) {
        container = RTCUtils.attachMediaStream(container, this.stream);
    }
    this.containers.push(container);

    this._maybeFireTrackAttached(container);

    this._attachTTFMTracker(container);

    return container;
};

/**
 * Removes this JitsiTrack from the passed HTML container.
 *
 * @param container the HTML container to detach from this JitsiTrack. If
 * <tt>null</tt> or <tt>undefined</tt>, all containers are removed. A container
 * can be a 'video', 'audio' or 'object' HTML element instance to which this
 * JitsiTrack is currently attached.
 */
JitsiTrack.prototype.detach = function(container) {
    for (let cs = this.containers, i = cs.length - 1; i >= 0; --i) {
        const c = cs[i];
        if (!container) {
            RTCUtils.attachMediaStream(c, null);
        }
        if (!container || c === container) {
            cs.splice(i, 1);
        }
    }

    if (container) {
        RTCUtils.attachMediaStream(container, null);
    }
};

/**
 * Attach time to first media tracker only if there is conference and only
 * for the first element.
 * @param container the HTML container which can be 'video' or 'audio' element.
 *        It can also be 'object' element if Temasys plugin is in use and this
 *        method has been called previously on video or audio HTML element.
 * @private
 */
// eslint-disable-next-line no-unused-vars
JitsiTrack.prototype._attachTTFMTracker = function(container) {
    // Should be defined by the classes that are extending JitsiTrack
};

/**
 * Removes attached event listeners.
 *
 * @returns {Promise}
 */
JitsiTrack.prototype.dispose = function() {
    this.eventEmitter.removeAllListeners();

    this.disposed = true;

    return Promise.resolve();
};

/**
 * Returns true if this is a video track and the source of the video is a
 * screen capture as opposed to a camera.
 */
JitsiTrack.prototype.isScreenSharing = function() {
    // FIXME: Should be fixed or removed.
};

/**
 * Returns id of the track.
 * @returns {string|null} id of the track or null if this is fake track.
 */
JitsiTrack.prototype.getId = function() {
    if(this.stream) {
        return RTCUtils.getStreamID(this.stream);
    }
    return null;

};

/**
 * Checks whether the MediaStream is active/not ended.
 * When there is no check for active we don't have information and so
 * will return that stream is active (in case of FF).
 * @returns {boolean} whether MediaStream is active.
 */
JitsiTrack.prototype.isActive = function() {
    if(typeof this.stream.active !== 'undefined') {
        return this.stream.active;
    }
    return true;

};

/**
 * Attaches a handler for events(For example - "audio level changed".).
 * All possible event are defined in JitsiTrackEvents.
 * @param eventId the event ID.
 * @param handler handler for the event.
 */
JitsiTrack.prototype.on = function(eventId, handler) {
    if(this.eventEmitter) {
        this.eventEmitter.on(eventId, handler);
    }
};

/**
 * Removes event listener
 * @param eventId the event ID.
 * @param [handler] optional, the specific handler to unbind
 */
JitsiTrack.prototype.off = function(eventId, handler) {
    if(this.eventEmitter) {
        this.eventEmitter.removeListener(eventId, handler);
    }
};

// Common aliases for event emitter
JitsiTrack.prototype.addEventListener = JitsiTrack.prototype.on;
JitsiTrack.prototype.removeEventListener = JitsiTrack.prototype.off;

/**
 * Sets the audio level for the stream
 * @param audioLevel the new audio level
 */
JitsiTrack.prototype.setAudioLevel = function(audioLevel) {
    if(this.audioLevel !== audioLevel) {
        this.eventEmitter.emit(JitsiTrackEvents.TRACK_AUDIO_LEVEL_CHANGED,
            audioLevel);
        this.audioLevel = audioLevel;
    }
};

/**
 * Returns the msid of the stream attached to the JitsiTrack object or null if
 * no stream is attached.
 */
JitsiTrack.prototype.getMSID = function() {
    const streamId = this.getStreamId();
    const trackId = this.getTrackId();
    return streamId && trackId ? `${streamId} ${trackId}` : null;
};

/**
 * Sets new audio output device for track's DOM elements. Video tracks are
 * ignored.
 * @param {string} audioOutputDeviceId - id of 'audiooutput' device from
 *      navigator.mediaDevices.enumerateDevices(), '' for default device
 * @emits JitsiTrackEvents.TRACK_AUDIO_OUTPUT_CHANGED
 * @returns {Promise}
 */
JitsiTrack.prototype.setAudioOutput = function(audioOutputDeviceId) {
    const self = this;

    if (!RTCUtils.isDeviceChangeAvailable('output')) {
        return Promise.reject(
            new Error('Audio output device change is not supported'));
    }

    // All audio communication is done through audio tracks, so ignore changing
    // audio output for video tracks at all.
    if (this.isVideoTrack()) {
        return Promise.resolve();
    }

    return Promise.all(this.containers.map(element => element.setSinkId(audioOutputDeviceId)
            .catch(error => {
                logger.warn(
                    'Failed to change audio output device on element. Default'
                    + ' or previously set audio output device will be used.',
                    element, error);
                throw error;
            })))
    .then(() => {
        self.eventEmitter.emit(JitsiTrackEvents.TRACK_AUDIO_OUTPUT_CHANGED,
            audioOutputDeviceId);
    });
};

module.exports = JitsiTrack;
