/* global */

const JitsiTrack = require('./JitsiTrack');

import * as JitsiTrackEvents from '../../JitsiTrackEvents';
const logger = require('jitsi-meet-logger').getLogger(__filename);
const RTCBrowserType = require('./RTCBrowserType');
const RTCEvents = require('../../service/RTC/RTCEvents');
const Statistics = require('../statistics/statistics');

let ttfmTrackerAudioAttached = false;
let ttfmTrackerVideoAttached = false;

/**
 * Represents a single media track (either audio or video).
 * @param {RTC} rtc the RTC service instance.
 * @param {JitsiConference} conference the conference to which this track
 *        belongs to
 * @param {string} ownerEndpointId the endpoint ID of the track owner
 * @param {MediaStream} stream WebRTC MediaStream, parent of the track
 * @param {MediaStreamTrack} track underlying WebRTC MediaStreamTrack for
 *        the new JitsiRemoteTrack
 * @param {MediaType} mediaType the type of the media
 * @param {VideoType} videoType the type of the video if applicable
 * @param {string} ssrc the SSRC number of the Media Stream
 * @param {boolean} muted the initial muted state
 * @constructor
 */
function JitsiRemoteTrack(rtc, conference, ownerEndpointId, stream, track,
                          mediaType, videoType, ssrc, muted) {
    JitsiTrack.call(
        this,
        conference,
        stream,
        track,
        () => {
            // Nothing to do if the track is inactive.
        },
        mediaType,
        videoType,
        ssrc);
    this.rtc = rtc;
    this.ownerEndpointId = ownerEndpointId;
    this.muted = muted;
    // we want to mark whether the track has been ever muted
    // to detect ttfm events for startmuted conferences, as it can significantly
    // increase ttfm values
    this.hasBeenMuted = muted;
    // Bind 'onmute' and 'onunmute' event handlers
    if (this.rtc && this.track) {
        this._bindMuteHandlers();
    }
}

JitsiRemoteTrack.prototype = Object.create(JitsiTrack.prototype);
JitsiRemoteTrack.prototype.constructor = JitsiRemoteTrack;

JitsiRemoteTrack.prototype._bindMuteHandlers = function() {
    // Bind 'onmute'
    // FIXME it would be better to use recently added '_setHandler' method, but
    // 1. It does not allow to set more than one handler to the event
    // 2. It does mix MediaStream('inactive') with MediaStreamTrack events
    // 3. Allowing to bind more than one event handler requires too much
    //    refactoring around camera issues detection.
    this.track.addEventListener('mute', () => {

        logger.debug(
            `"onmute" event(${Date.now()}): `,
            this.getParticipantId(), this.getType(), this.getSSRC());

        this.rtc.eventEmitter.emit(RTCEvents.REMOTE_TRACK_MUTE, this);
    });

    // Bind 'onunmute'
    this.track.addEventListener('unmute', () => {

        logger.debug(
            `"onunmute" event(${Date.now()}): `,
            this.getParticipantId(), this.getType(), this.getSSRC());

        this.rtc.eventEmitter.emit(RTCEvents.REMOTE_TRACK_UNMUTE, this);
    });
};

/**
 * Sets current muted status and fires an events for the change.
 * @param value the muted status.
 */
JitsiRemoteTrack.prototype.setMute = function(value) {
    if(this.muted === value) {
        return;
    }

    if(value) {
        this.hasBeenMuted = true;
    }

    // we can have a fake video stream
    if(this.stream) {
        this.stream.muted = value;
    }

    this.muted = value;
    this.eventEmitter.emit(JitsiTrackEvents.TRACK_MUTE_CHANGED, this);
};

/**
 * Returns the current muted status of the track.
 * @returns {boolean|*|JitsiRemoteTrack.muted} <tt>true</tt> if the track is
 * muted and <tt>false</tt> otherwise.
 */
JitsiRemoteTrack.prototype.isMuted = function() {
    return this.muted;
};

/**
 * Returns the participant id which owns the track.
 * @returns {string} the id of the participants. It corresponds to the Colibri
 * endpoint id/MUC nickname in case of Jitsi-meet.
 */
JitsiRemoteTrack.prototype.getParticipantId = function() {
    return this.ownerEndpointId;
};

/**
 * Return false;
 */
JitsiRemoteTrack.prototype.isLocal = function() {
    return false;
};

/**
 * Returns the synchronization source identifier (SSRC) of this remote track.
 * @returns {string} the SSRC of this remote track
 */
JitsiRemoteTrack.prototype.getSSRC = function() {
    return this.ssrc;
};

/**
 * Changes the video type of the track
 * @param type the new video type("camera", "desktop")
 */
JitsiRemoteTrack.prototype._setVideoType = function(type) {
    if(this.videoType === type) {
        return;
    }
    this.videoType = type;
    this.eventEmitter.emit(JitsiTrackEvents.TRACK_VIDEOTYPE_CHANGED, type);
};

JitsiRemoteTrack.prototype._playCallback = function() {
    const type = this.isVideoTrack() ? 'video' : 'audio';

    const now = window.performance.now();

    console.log(`(TIME) Render ${type}:\t`, now);
    this.conference.getConnectionTimes()[`${type}.render`] = now;

    const ttfm = now
        - (this.conference.getConnectionTimes()['session.initiate']
        - this.conference.getConnectionTimes()['muc.joined'])
        - (window.connectionTimes['obtainPermissions.end']
        - window.connectionTimes['obtainPermissions.start']);

    this.conference.getConnectionTimes()[`${type}.ttfm`] = ttfm;
    console.log(`(TIME) TTFM ${type}:\t`, ttfm);
    let eventName = `${type}.ttfm`;

    if(this.hasBeenMuted) {
        eventName += '.muted';
    }
    Statistics.analytics.sendEvent(eventName, {value: ttfm});
};

/**
 * Attach time to first media tracker only if there is conference and only
 * for the first element.
 * @param container the HTML container which can be 'video' or 'audio' element.
 *        It can also be 'object' element if Temasys plugin is in use and this
 *        method has been called previously on video or audio HTML element.
 * @private
 */
JitsiRemoteTrack.prototype._attachTTFMTracker = function(container) {
    if((ttfmTrackerAudioAttached && this.isAudioTrack())
        || (ttfmTrackerVideoAttached && this.isVideoTrack())) {
        return;
    }

    if (this.isAudioTrack()) {
        ttfmTrackerAudioAttached = true;
    }
    if (this.isVideoTrack()) {
        ttfmTrackerVideoAttached = true;
    }

    if (RTCBrowserType.isTemasysPluginUsed()) {
        // XXX Don't require Temasys unless it's to be used because it doesn't
        // run on React Native, for example.
        const AdapterJS = require('./adapter.screenshare');

        // FIXME: this is not working for IE11
        AdapterJS.addEvent(container, 'play', this._playCallback.bind(this));
    } else {
        container.addEventListener('canplay', this._playCallback.bind(this));
    }
};

module.exports = JitsiRemoteTrack;
