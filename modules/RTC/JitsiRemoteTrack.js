/* global Strophe */
var JitsiTrack = require("./JitsiTrack");
var JitsiTrackEvents = require("../../JitsiTrackEvents");

/**
 * Represents a single media track (either audio or video).
 * @param RTC the rtc instance.
 * @param data object with the stream and some details
 *             about it(participant id, video type, etc.)
 * @param sid sid for the Media Stream
 * @param ssrc ssrc for the Media Stream
 * @param eventEmitter the event emitter
 * @constructor
 */
function JitsiRemoteTrack(RTC, data, sid, ssrc) {
    JitsiTrack.call(this, RTC, data.stream,
        function () {}, data.jitsiTrackType);
    this.rtc = RTC;
    this.sid = sid;
    this.stream = data.stream;
    this.peerjid = data.peerjid;
    this.videoType = data.videoType;
    this.ssrc = ssrc;
    this.muted = false;
    if((this.type === JitsiTrack.AUDIO && data.audiomuted)
      || (this.type === JitsiTrack.VIDEO && data.videomuted)) {
        this.muted = true;
    }
}

JitsiRemoteTrack.prototype = Object.create(JitsiTrack.prototype);
JitsiRemoteTrack.prototype.constructor = JitsiRemoteTrack;

/**
 * Sets current muted status and fires an events for the change.
 * @param value the muted status.
 */
JitsiRemoteTrack.prototype.setMute = function (value) {

    if(this.muted === value)
        return;

    // we can have a fake video stream
    if(this.stream)
        this.stream.muted = value;

    this.muted = value;
    this.eventEmitter.emit(JitsiTrackEvents.TRACK_MUTE_CHANGED);
};

/**
 * Returns the current muted status of the track.
 * @returns {boolean|*|JitsiRemoteTrack.muted} <tt>true</tt> if the track
 *                                      is muted and <tt>false</tt> otherwise.
 */
JitsiRemoteTrack.prototype.isMuted = function () {
    return this.muted;
};

/**
 * Returns the participant id which owns the track.
 * @returns {string} the id of the participants.
 */
JitsiRemoteTrack.prototype.getParticipantId = function() {
    return Strophe.getResourceFromJid(this.peerjid);
};

/**
 * Return false;
 */
JitsiRemoteTrack.prototype.isLocal = function () {
    return false;
};

/**
 * Return false;
 */
JitsiRemoteTrack.prototype.getSSRC = function () {
    return this.ssrc;
};

/**
 * Changes the video type of the track
 * @param type the new video type("camera", "desktop")
 */
JitsiRemoteTrack.prototype._setVideoType = function (type) {
    if(this.videoType === type)
        return;
    this.videoType = type;
    this.eventEmitter.emit(JitsiTrackEvents.TRACK_VIDEOTYPE_CHANGED, type);
};

delete JitsiRemoteTrack.prototype.dispose;

module.exports = JitsiRemoteTrack;
