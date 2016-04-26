/* global __filename, Promise */
var logger = require("jitsi-meet-logger").getLogger(__filename);
var JitsiTrack = require("./JitsiTrack");
var RTCBrowserType = require("./RTCBrowserType");
var JitsiTrackEvents = require('../../JitsiTrackEvents');
var JitsiTrackErrors = require("../../JitsiTrackErrors");
var RTCUtils = require("./RTCUtils");
var VideoType = require('../../service/RTC/VideoType');

/**
 * Represents a single media track(either audio or video).
 * One <tt>JitsiLocalTrack</tt> corresponds to one WebRTC MediaStreamTrack.
 * @param stream WebRTC MediaStream, parent of the track
 * @param track underlying WebRTC MediaStreamTrack for new JitsiRemoteTrack
 * @param mediaType the MediaType of the JitsiRemoteTrack
 * @param videoType the VideoType of the JitsiRemoteTrack
 * @param resolution the video resoultion if it's a video track
 * @param deviceId the ID of the local device for this track
 * @constructor
 */
function JitsiLocalTrack(stream, track, mediaType, videoType, resolution,
                         deviceId) {
    JitsiTrack.call(this,
        null /* RTC */, stream, track,
        function () {
            if(!this.dontFireRemoveEvent)
                this.eventEmitter.emit(
                    JitsiTrackEvents.LOCAL_TRACK_STOPPED);
            this.dontFireRemoveEvent = false;
        }.bind(this) /* inactiveHandler */,
        mediaType, videoType, null /* ssrc */);
    this.dontFireRemoveEvent = false;
    this.resolution = resolution;
    this.deviceId = deviceId;
    this.startMuted = false;
    this.disposed = false;
    //FIXME: This dependacy is not necessary.
    this.conference = null;
    this.initialMSID = this.getMSID();
    this.inMuteOrUnmuteProgress = false;
}

JitsiLocalTrack.prototype = Object.create(JitsiTrack.prototype);
JitsiLocalTrack.prototype.constructor = JitsiLocalTrack;

/**
 * Mutes the track. Will reject the Promise if there is mute/unmute operation
 * in progress.
 * @returns {Promise}
 */
JitsiLocalTrack.prototype.mute = function () {
    return createMuteUnmutePromise(this, true);
};

/**
 * Unmutes the track. Will reject the Promise if there is mute/unmute operation
 * in progress.
 * @returns {Promise}
 */
JitsiLocalTrack.prototype.unmute = function () {
    return createMuteUnmutePromise(this, false);
};

/**
 * Creates Promise for mute/unmute operation.
 * @param track the track that will be muted/unmuted
 * @param mute whether to mute or unmute the track
 */
function createMuteUnmutePromise(track, mute)
{
    return new Promise(function (resolve, reject) {

        if(this.inMuteOrUnmuteProgress) {
            reject(new Error(JitsiTrackErrors.TRACK_MUTE_UNMUTE_IN_PROGRESS));
            return;
        }
        this.inMuteOrUnmuteProgress = true;

        this._setMute(mute,
            function(){
                this.inMuteOrUnmuteProgress = false;
                resolve();
            }.bind(this),
            function(status){
                this.inMuteOrUnmuteProgress = false;
                reject(status);
            }.bind(this));
    }.bind(track));
}

/**
 * Mutes / unmutes the track.
 * @param mute {boolean} if true the track will be muted. Otherwise the track
 * will be unmuted.
 */
JitsiLocalTrack.prototype._setMute = function (mute, resolve, reject) {
    if (this.isMuted() === mute) {
        resolve();
        return;
    }
    if(!this.rtc) {
        this.startMuted = mute;
        resolve();
        return;
    }
    var isAudio = this.isAudioTrack();
    this.dontFireRemoveEvent = false;

    var setStreamToNull = false;
    // the callback that will notify that operation had finished
    var callbackFunction = function() {

        if(setStreamToNull)
            this.stream = null;
        this.eventEmitter.emit(JitsiTrackEvents.TRACK_MUTE_CHANGED);

        resolve();
    }.bind(this);

    if ((window.location.protocol != "https:") ||
        (isAudio) || this.videoType === VideoType.DESKTOP ||
        // FIXME FF does not support 'removeStream' method used to mute
        RTCBrowserType.isFirefox()) {

        if (this.track)
            this.track.enabled = !mute;
        if(isAudio)
            this.rtc.room.setAudioMute(mute, callbackFunction);
        else
            this.rtc.room.setVideoMute(mute, callbackFunction);
    } else {
        if (mute) {
            this.dontFireRemoveEvent = true;
            this.rtc.room.removeStream(this.stream, function () {},
                {mtype: this.type, type: "mute", ssrc: this.ssrc});
            RTCUtils.stopMediaStream(this.stream);
            setStreamToNull = true;
            if(isAudio)
                this.rtc.room.setAudioMute(mute, callbackFunction);
            else
                this.rtc.room.setVideoMute(mute, callbackFunction);
            //FIXME: Maybe here we should set the SRC for the containers to something
        } else {
            var self = this;
            // FIXME why are we doing all this audio type checks and
            // convoluted scenarios if we're going this way only
            // for VIDEO media and CAMERA type of video ?
            var streamOptions = {
                devices: (isAudio ? ["audio"] : ["video"]),
                resolution: self.resolution
            };
            if (isAudio) {
                streamOptions['micDeviceId'] = self.deviceId;
            } else if(self.videoType === VideoType.CAMERA) {
                streamOptions['cameraDeviceId'] = self.deviceId;
            }
            RTCUtils.obtainAudioAndVideoPermissions(streamOptions)
                .then(function (streamsInfo) {
                    var streamInfo = null;
                    for(var i = 0; i < streamsInfo.length; i++) {
                        if(streamsInfo[i].mediaType === self.getType()) {
                            streamInfo = streamsInfo[i];
                            self.stream = streamInfo.stream;
                            self.track = streamInfo.track;
                            // This is not good when video type changes after
                            // unmute, but let's not crash here
                            if (self.videoType != streamInfo.videoType) {
                                logger.error(
                                    "Video type has changed after unmute!",
                                    self.videoType, streamInfo.videoType);
                                self.videoType = streamInfo.videoType;
                            }
                            break;
                        }
                    }

                    if(!streamInfo) {
                        reject(new Error('track.no_stream_found'));
                        return;
                    }

                    for(var i = 0; i < self.containers.length; i++)
                    {
                        self.containers[i]
                            = RTCUtils.attachMediaStream(
                                    self.containers[i], self.stream);
                    }

                    self.rtc.room.addStream(self.stream,
                        function () {
                            if(isAudio)
                                self.rtc.room.setAudioMute(
                                    mute, callbackFunction);
                            else
                                self.rtc.room.setVideoMute(
                                    mute, callbackFunction);
                        }, {
                            mtype: self.type,
                            type: "unmute",
                            ssrc: self.ssrc,
                            msid: self.getMSID()});
                }).catch(function (error) {
                    reject(error);
                });
        }
    }
};

/**
 * Stops sending the media track. And removes it from the HTML.
 * NOTE: Works for local tracks only.
 * @returns {Promise}
 */
JitsiLocalTrack.prototype.dispose = function () {
    var promise = Promise.resolve();

    if (this.conference){
        promise = this.conference.removeTrack(this);
    }

    if (this.stream) {
        RTCUtils.stopMediaStream(this.stream);
        this.detach();
    }
    this.disposed = true;

    return promise;
};

/**
 * Returns <tt>true</tt> - if the stream is muted
 * and <tt>false</tt> otherwise.
 * @returns {boolean} <tt>true</tt> - if the stream is muted
 * and <tt>false</tt> otherwise.
 */
JitsiLocalTrack.prototype.isMuted = function () {
    // this.stream will be null when we mute local video on Chrome
    if (!this.stream)
        return true;
    if (this.isVideoTrack() && !this.isActive()) {
        return true;
    } else {
        return !this.track || !this.track.enabled;
    }
};

/**
 * Private method. Updates rtc property of the track.
 * @param rtc the rtc instance.
 */
JitsiLocalTrack.prototype._setRTC = function (rtc) {
    this.rtc = rtc;
    // We want to keep up with postponed events which should have been fired
    // on "attach" call, but for local track we not always have the conference
    // before attaching. However this may result in duplicated events if they
    // have been triggered on "attach" already.
    for(var i = 0; i < this.containers.length; i++)
    {
        this._maybeFireTrackAttached(this.containers[i]);
    }
};

/**
 * Updates the SSRC associated with the MediaStream in JitsiLocalTrack object.
 * @ssrc the new ssrc
 */
JitsiLocalTrack.prototype._setSSRC = function (ssrc) {
    this.ssrc = ssrc;
};


//FIXME: This dependacy is not necessary. This is quick fix.
/**
 * Sets the JitsiConference object associated with the track. This is temp
 * solution.
 * @param conference the JitsiConference object
 */
JitsiLocalTrack.prototype._setConference = function(conference) {
    this.conference = conference;
};

/**
 * Gets the SSRC of this local track if it's available already or <tt>null</tt>
 * otherwise. That's because we don't know the SSRC until local description is
 * created.
 * In case of video and simulcast returns the the primarySSRC.
 * @returns {string} or {null}
 */
JitsiLocalTrack.prototype.getSSRC = function () {
    if(this.ssrc && this.ssrc.groups && this.ssrc.groups.length)
        return this.ssrc.groups[0].primarySSRC;
    else if(this.ssrc && this.ssrc.ssrcs && this.ssrc.ssrcs.length)
        return this.ssrc.ssrcs[0];
    else
        return null;
};

/**
 * Return true;
 */
JitsiLocalTrack.prototype.isLocal = function () {
    return true;
};

module.exports = JitsiLocalTrack;
