var JitsiTrack = require("./JitsiTrack");
var JitsiTrackEvents = require("../../JitsiTrackEvents");
var RTCUtils = require("./RTCUtils");

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
 * @param initialTrackForParticipant {boolean} if true this track will be the
 * first track from it type (audio or video) received for the participant. Used
 * only for TTFM.
 * @constructor
 */
function JitsiRemoteTrack(conference, ownerJid, stream, track, mediaType,
                          videoType, ssrc, muted) {
    JitsiTrack.call(
        this, conference, stream, track, function () {}, mediaType, videoType,
        ssrc);
    this.conference = conference;
    this.peerjid = ownerJid;
    this.muted = muted;
    var participant = this.conference.getParticipantById(
        this.getParticipantId());
    // filter the tracks that we don't want to log for the TTFM statistics.
    // Currently if the track havent been muted and this is the first media
    // from it type (audio or video) received for this participant we can use
    // it as a TTFM candidate. We want to track only the first received stream
    // per participant and we want to discard muted tracks because the ttfm
    // value will be increased with the time when the track have been muted.
    this.isTTFMCandidate = !(muted && participant._hadTrack[this.getType()]);
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

    if(value)
        this.isTTFMCandidate = false;

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
 * Returns the synchronization source identifier (SSRC) of this remote track.
 * @returns {string} the SSRC of this remote track
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

/**
 * Attach time to first media tracker only if there is conference and only
 * for the first element.
 * @param container the HTML container which can be 'video' or 'audio' element.
 *        It can also be 'object' element if Temasys plugin is in use and this
 *        method has been called previously on video or audio HTML element.
 * @private
 */
JitsiRemoteTrack.prototype._attachTTFMTracker = function (container) {
    if(container.jitsiTTFMListenerAdded) {
        clearJitsiTrackPropsFromContainer(container);
    }
    if(!this.conference._canBeFirstMedia(this))
        return;
    // Update the information about the current attached track.
    // FIXME: This will work only for 1 conference on the page. If we have
    // multiple conferences on the page we should add id for the conference
    container.jitsiUserId = this.getParticipantId();
    container.jitsiTrackType = this.getType();
    // Make sure we are attaching only one listener per container.
    if(container.jitsiTTFMListenerAdded)
        return;
    container.jitsiTTFMListenerAdded = true;
    RTCUtils.addPlayListener(container,
        this.conference._playCallback.bind(this.conference, container));
};

/**
 * Clears jitsi track properties from passed html element.
 * @param container {HTMLElement} the html element
 */
function clearJitsiTrackPropsFromContainer(container) {
    container.jitsiUserId = null;
    container.jitsiTrackType = null;
}

/**
 * Detach time to first media tracker
 * @param container the HTML container which can be 'video' or 'audio' element.
 *        It can also be 'object' element if Temasys plugin is in use and this
 *        method has been called previously on video or audio HTML element.
 * @private
 */
JitsiRemoteTrack.prototype._detachTTFMTracker = function (container) {
    clearJitsiTrackPropsFromContainer(container);
    //FIXME: remove the listener
};

module.exports = JitsiRemoteTrack;
