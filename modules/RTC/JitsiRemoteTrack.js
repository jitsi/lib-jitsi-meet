var JitsiTrack = require("./JitsiTrack");
var JitsiTrackEvents = require("../../JitsiTrackEvents");

/**
 * Represents a single media track (either audio or video).
 * @param RTC the rtc instance.
 * @param ownerJid the MUC JID of the track owner
 * @param stream WebRTC MediaStream, parent of the track
 * @param track underlying WebRTC MediaStreamTrack for new JitsiRemoteTrack
 * @param mediaType the MediaType of the JitsiRemoteTrack
 * @param videoType the VideoType of the JitsiRemoteTrack
 * @param ssrc the SSRC number of the Media Stream
 * @param muted intial muted state of the JitsiRemoteTrack
 * @constructor
 */
function JitsiRemoteTrack(RTC, ownerJid, stream, track, mediaType, videoType,
                          ssrc, muted) {    
    JitsiTrack.call(
        this, RTC, stream, track, function () {}, mediaType, videoType, ssrc);
    this.rtc = RTC;
    this.peerjid = ownerJid;
    this.muted = muted;
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
 * @returns {boolean|*|JitsiRemoteTrack.muted} <tt>true</tt> if the track is
 * muted and <tt>false</tt> otherwise.
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
