/* global Promise */
var JitsiTrack = require("./JitsiTrack");
var RTCBrowserType = require("./RTCBrowserType");
var JitsiTrackEvents = require('../../JitsiTrackEvents');
var JitsiTrackErrors = require("../../JitsiTrackErrors");
var RTCUtils = require("./RTCUtils");

/**
 * Represents a single media track (either audio or video).
 * @constructor
 */
function JitsiLocalTrack(stream, videoType,
  resolution, deviceId)
{
    this.videoType = videoType;
    this.dontFireRemoveEvent = false;
    this.resolution = resolution;
    this.deviceId = deviceId;
    this.startMuted = false;
    this.ssrc = null;
    this.disposed = false;
    //FIXME: This dependacy is not necessary.
    this.conference = null;
    JitsiTrack.call(this, null, stream,
        function () {
            if(!this.dontFireRemoveEvent)
                this.eventEmitter.emit(
                    JitsiTrackEvents.LOCAL_TRACK_STOPPED);
            this.dontFireRemoveEvent = false;
        }.bind(this));
    this.initialMSID = this.getMSID();
    this.inMuteOrUnmuteProcess = false;
}

JitsiLocalTrack.prototype = Object.create(JitsiTrack.prototype);
JitsiLocalTrack.prototype.constructor = JitsiLocalTrack;

/**
 * Mutes the track. Will reject the Promise if there is mute/unmute operation
 * in progress.
 * @returns {Promise}
 */
JitsiLocalTrack.prototype.mute = function () {
    return new Promise(function (resolve, reject) {

        if(this.inMuteOrUnmuteProcess) {
            reject(new Error(JitsiTrackErrors.TRACK_MUTE_UNMUTE_IN_PROGRESS));
            return;
        }
        this.inMuteOrUnmuteProcess = true;

        this._setMute(true,
            function(){
                this.inMuteOrUnmuteProcess = false;
                resolve();
            }.bind(this),
            function(status){
                this.inMuteOrUnmuteProcess = false;
                reject(status);
            }.bind(this));
    }.bind(this));
}

/**
 * Unmutes the stream. Will reject the Promise if there is mute/unmute operation
 * in progress.
 * @returns {Promise}
 */
JitsiLocalTrack.prototype.unmute = function () {
    return new Promise(function (resolve, reject) {

        if(this.inMuteOrUnmuteProcess) {
            reject(new Error(JitsiTrackErrors.TRACK_MUTE_UNMUTE_IN_PROGRESS));
            return;
        }
        this.inMuteOrUnmuteProcess = true;

        this._setMute(false,
            function(){
                this.inMuteOrUnmuteProcess = false;
                resolve();
            }.bind(this),
            function(status){
                this.inMuteOrUnmuteProcess = false;
                reject(status);
            }.bind(this));
    }.bind(this));
}

/**
 * Mutes / unmutes the track.
 * @param mute {boolean} if true the track will be muted. Otherwise the track will be unmuted.
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
    var isAudio = this.type === JitsiTrack.AUDIO;
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
        (isAudio) || this.videoType === "desktop" ||
        // FIXME FF does not support 'removeStream' method used to mute
        RTCBrowserType.isFirefox()) {

        var tracks = this._getTracks();
        for (var idx = 0; idx < tracks.length; idx++) {
            tracks[idx].enabled = !mute;
        }
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
            var streamOptions = {
                devices: (isAudio ? ["audio"] : ["video"]),
                resolution: self.resolution
            };
            if (isAudio) {
              streamOptions['micDeviceId'] = self.deviceId;
          } else if(self.videoType === 'camera') {
              streamOptions['cameraDeviceId'] = self.deviceId;
            }
            RTCUtils.obtainAudioAndVideoPermissions(streamOptions)
                .then(function (streams) {
                    var stream = null;
                    for(var i = 0; i < streams.length; i++) {
                        stream = streams[i];
                        if(stream.type === self.type) {
                            self.stream = stream.stream;
                            self.videoType = stream.videoType;
                            break;
                        }
                    }

                    if(!stream) {
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
                });
        }
    }
}

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
    if (!this.stream)
        return true;
    var tracks = [];
    var isAudio = this.type === JitsiTrack.AUDIO;
    if (isAudio) {
        tracks = this.stream.getAudioTracks();
    } else {
        if (!this.isActive())
            return true;
        tracks = this.stream.getVideoTracks();
    }
    for (var idx = 0; idx < tracks.length; idx++) {
        if(tracks[idx].enabled)
            return false;
    }
    return true;
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
}


//FIXME: This dependacy is not necessary. This is quick fix.
/**
 * Sets the JitsiConference object associated with the track. This is temp
 * solution.
 * @param conference the JitsiConference object
 */
JitsiLocalTrack.prototype._setConference = function(conference) {
    this.conference = conference;
}

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
}

module.exports = JitsiLocalTrack;
