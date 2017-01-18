/* global __filename, Promise */
var CameraFacingMode = require('../../service/RTC/CameraFacingMode');
var JitsiTrack = require("./JitsiTrack");
import JitsiTrackError from "../../JitsiTrackError";
import * as JitsiTrackErrors from "../../JitsiTrackErrors";
import * as JitsiTrackEvents from "../../JitsiTrackEvents";
var logger = require("jitsi-meet-logger").getLogger(__filename);
var MediaType = require('../../service/RTC/MediaType');
var RTCBrowserType = require("./RTCBrowserType");
var RTCEvents = require("../../service/RTC/RTCEvents");
import RTCUtils from "./RTCUtils";
var Statistics = require("../statistics/statistics");
var VideoType = require('../../service/RTC/VideoType');

/**
 * Represents a single media track(either audio or video).
 * One <tt>JitsiLocalTrack</tt> corresponds to one WebRTC MediaStreamTrack.
 * @param stream WebRTC MediaStream, parent of the track
 * @param track underlying WebRTC MediaStreamTrack for new JitsiRemoteTrack
 * @param mediaType the MediaType of the JitsiRemoteTrack
 * @param videoType the VideoType of the JitsiRemoteTrack
 * @param resolution the video resolution if it's a video track
 * @param deviceId the ID of the local device for this track
 * @param facingMode the camera facing mode used in getUserMedia call
 * @constructor
 */
function JitsiLocalTrack(stream, track, mediaType, videoType, resolution,
                         deviceId, facingMode) {
    var self = this;

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

    // FIXME: currently firefox is ignoring our constraints about resolutions
    // so we do not store it, to avoid wrong reporting of local track resolution
    if (RTCBrowserType.isFirefox())
        this.resolution = null;

    this.deviceId = deviceId;
    this.startMuted = false;
    this.initialMSID = this.getMSID();
    this.inMuteOrUnmuteProgress = false;

    /**
     * The facing mode of the camera from which this JitsiLocalTrack instance
     * was obtained.
     */
    this._facingMode = facingMode;

    // Currently there is no way to know the MediaStreamTrack ended due to to
    // device disconnect in Firefox through e.g. "readyState" property. Instead
    // we will compare current track's label with device labels from
    // enumerateDevices() list.
    this._trackEnded = false;

    /**
     * The value of bytes sent received from the statistics module.
     */
    this._bytesSent = null;

    /**
     * Used only for detection of audio problems. We want to check only once
     * whether the track is sending bytes ot not. This flag is set to false
     * after the check.
     */
    this._testByteSent = true;

    // Currently there is no way to determine with what device track was
    // created (until getConstraints() support), however we can associate tracks
    // with real devices obtained from enumerateDevices() call as soon as it's
    // called.
    this._realDeviceId = this.deviceId === '' ? undefined : this.deviceId;

    /**
     * Indicates that we have called RTCUtils.stopMediaStream for the
     * MediaStream related to this JitsiTrack object.
     */
    this.stopStreamInProgress = false;

    /**
     * On mute event we are waiting for 3s to check if the stream is going to
     * be still muted before firing the event for camera issue detected
     * (NO_DATA_FROM_SOURCE).
     */
    this._noDataFromSourceTimeout = null;

    this._onDeviceListChanged = function (devices) {
        self._setRealDeviceIdFromDeviceList(devices);

        // Mark track as ended for those browsers that do not support
        // "readyState" property. We do not touch tracks created with default
        // device ID "".
        if (typeof self.getTrack().readyState === 'undefined'
            && typeof self._realDeviceId !== 'undefined'
            && !devices.find(function (d) {
                return d.deviceId === self._realDeviceId;
            })) {
            self._trackEnded = true;
        }
    };

    // Subscribe each created local audio track to
    // RTCEvents.AUDIO_OUTPUT_DEVICE_CHANGED event. This is different from
    // handling this event for remote tracks (which are handled in RTC.js),
    // because there might be local tracks not attached to a conference.
    if (this.isAudioTrack() && RTCUtils.isDeviceChangeAvailable('output')) {
        this._onAudioOutputDeviceChanged = this.setAudioOutput.bind(this);

        RTCUtils.addListener(RTCEvents.AUDIO_OUTPUT_DEVICE_CHANGED,
            this._onAudioOutputDeviceChanged);
    }

    RTCUtils.addListener(RTCEvents.DEVICE_LIST_CHANGED,
        this._onDeviceListChanged);

    this._initNoDataFromSourceHandlers();
}

JitsiLocalTrack.prototype = Object.create(JitsiTrack.prototype);
JitsiLocalTrack.prototype.constructor = JitsiLocalTrack;

/**
 * Returns if associated MediaStreamTrack is in the 'ended' state
 * @returns {boolean}
 */
JitsiLocalTrack.prototype.isEnded = function () {
    return  this.getTrack().readyState === 'ended' || this._trackEnded;
};

/**
 * Sets handlers to the MediaStreamTrack object that will detect camera issues.
 */
JitsiLocalTrack.prototype._initNoDataFromSourceHandlers = function () {
    if(this.isVideoTrack() && this.videoType === VideoType.CAMERA) {
        let _onNoDataFromSourceError
            = this._onNoDataFromSourceError.bind(this);
        this._setHandler("track_mute", () => {
            if(this._checkForCameraIssues()) {
                let now = window.performance.now();
                this._noDataFromSourceTimeout
                    = setTimeout(_onNoDataFromSourceError, 3000);
                this._setHandler("track_unmute", () => {
                    this._clearNoDataFromSourceMuteResources();
                    Statistics.sendEventToAll(
                        this.getType() + ".track_unmute",
                        {value: window.performance.now() - now});
                });
            }
        });
        this._setHandler("track_ended", _onNoDataFromSourceError);
    }
};

/**
 * Clears all timeouts and handlers set on MediaStreamTrack mute event.
 * FIXME: Change the name of the method with better one.
 */
JitsiLocalTrack.prototype._clearNoDataFromSourceMuteResources = function () {
    if(this._noDataFromSourceTimeout) {
        clearTimeout(this._noDataFromSourceTimeout);
        this._noDataFromSourceTimeout = null;
    }
    this._setHandler("track_unmute", undefined);
};

/**
 * Called when potential camera issue is detected. Clears the handlers and
 * timeouts set on MediaStreamTrack muted event. Verifies that the camera
 * issue persists and fires NO_DATA_FROM_SOURCE event.
 */
JitsiLocalTrack.prototype._onNoDataFromSourceError = function () {
    this._clearNoDataFromSourceMuteResources();
    if(this._checkForCameraIssues())
        this._fireNoDataFromSourceEvent();
};

/**
 * Fires JitsiTrackEvents.NO_DATA_FROM_SOURCE and logs it to analytics and
 * callstats.
 */
JitsiLocalTrack.prototype._fireNoDataFromSourceEvent = function () {
    this.eventEmitter.emit(JitsiTrackEvents.NO_DATA_FROM_SOURCE);
    let eventName = this.getType() + ".no_data_from_source";
    Statistics.analytics.sendEvent(eventName);
    let log = {name: eventName};
    if (this.isAudioTrack()) {
        log.isReceivingData = this._isReceivingData();
    }
    Statistics.sendLog(JSON.stringify(log));
};

/**
 * Sets real device ID by comparing track information with device information.
 * This is temporary solution until getConstraints() method will be implemented
 * in browsers.
 * @param {MediaDeviceInfo[]} devices - list of devices obtained from
 *  enumerateDevices() call
 */
JitsiLocalTrack.prototype._setRealDeviceIdFromDeviceList = function (devices) {
    var track = this.getTrack(),
        device = devices.find(function (d) {
            return d.kind === track.kind + 'input' && d.label === track.label;
        });

    if (device) {
        this._realDeviceId = device.deviceId;
    }
};

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
 *
 * @param {JitsiLocalTrack} track - The track that will be muted/unmuted.
 * @param {boolean} mute - Whether to mute or unmute the track.
 * @returns {Promise}
 */
function createMuteUnmutePromise(track, mute) {
    if (track.inMuteOrUnmuteProgress) {
        return Promise.reject(
            new JitsiTrackError(JitsiTrackErrors.TRACK_MUTE_UNMUTE_IN_PROGRESS)
        );
    }

    track.inMuteOrUnmuteProgress = true;

    return track._setMute(mute)
        .then(function() {
            track.inMuteOrUnmuteProgress = false;
        })
        .catch(function(status) {
            track.inMuteOrUnmuteProgress = false;
            throw status;
        });
}

/**
 * Mutes / unmutes the track.
 *
 * @param {boolean} mute - If true the track will be muted. Otherwise the track
 * will be unmuted.
 * @private
 * @returns {Promise}
 */
JitsiLocalTrack.prototype._setMute = function (mute) {
    if (this.isMuted() === mute) {
        return Promise.resolve();
    }

    var promise = Promise.resolve();
    var self = this;

    // Local track can be used out of conference, so we need to handle that
    // case and mark that track should start muted or not when added to
    // conference.
    if(!this.conference || !this.conference.room) {
        this.startMuted = mute;
    }

    this.dontFireRemoveEvent = false;

    // FIXME FF does not support 'removeStream' method used to mute
    if (window.location.protocol !== "https:" ||
        this.isAudioTrack() ||
        this.videoType === VideoType.DESKTOP ||
        RTCBrowserType.isFirefox()) {
        if(this.track)
            this.track.enabled = !mute;
    } else {
        if(mute) {
            this.dontFireRemoveEvent = true;
            promise = new Promise( (resolve, reject) => {
                this._removeStreamFromConferenceAsMute(() => {
                    //FIXME: Maybe here we should set the SRC for the containers
                    // to something
                    this._stopMediaStream();
                    this._setStream(null);
                    resolve();
                }, (err) => {
                    reject(err);
                });
            });
        } else {
            // This path is only for camera.
            var streamOptions = {
                cameraDeviceId: this.getDeviceId(),
                devices: [ MediaType.VIDEO ],
                facingMode: this.getCameraFacingMode()
            };
            if (this.resolution)
                streamOptions.resolution = this.resolution;

            promise = RTCUtils.obtainAudioAndVideoPermissions(streamOptions)
                .then(function (streamsInfo) {
                    var mediaType = self.getType();
                    var streamInfo = streamsInfo.find(function(info) {
                        return info.mediaType === mediaType;
                    });

                    if(!streamInfo) {
                        throw new JitsiTrackError(
                            JitsiTrackErrors.TRACK_NO_STREAM_FOUND);
                    }else {
                        self._setStream(streamInfo.stream);
                        self.track = streamInfo.track;
                        // This is not good when video type changes after
                        // unmute, but let's not crash here
                        if (self.videoType !== streamInfo.videoType) {
                            logger.warn(
                                "Video type has changed after unmute!",
                                self.videoType, streamInfo.videoType);
                            self.videoType = streamInfo.videoType;
                        }
                    }

                    self.containers = self.containers.map(function(cont) {
                        return RTCUtils.attachMediaStream(cont, self.stream);
                    });

                   return self._addStreamToConferenceAsUnmute();
                });
        }
    }

    return promise
        .then(function() {
            return self._sendMuteStatus(mute);
        })
        .then(function() {
            self.eventEmitter.emit(JitsiTrackEvents.TRACK_MUTE_CHANGED, this);
        });
};

/**
 * Adds stream to conference and marks it as "unmute" operation.
 *
 * @private
 * @returns {Promise}
 */
JitsiLocalTrack.prototype._addStreamToConferenceAsUnmute = function () {
    if (!this.conference || !this.conference.room) {
        return Promise.resolve();
    }

    var self = this;

    return new Promise(function(resolve, reject) {
        self.conference.room.addStream(
            self.stream,
            resolve,
            (error) => reject(new Error(error)),
            {
                mtype: self.type,
                type: "unmute",
                ssrc: self.ssrc,
                msid: self.getMSID()
            });
    });
};

/**
 * Removes stream from conference and marks it as "mute" operation.
 * @param {Function} successCallback will be called on success
 * @param {Function} errorCallback will be called on error
 * @private
 */
JitsiLocalTrack.prototype._removeStreamFromConferenceAsMute =
function (successCallback, errorCallback) {
    if (!this.conference || !this.conference.room) {
        successCallback();
        return;
    }

    this.conference.room.removeStream(
        this.stream,
        successCallback,
        (error) => errorCallback(new Error(error)),
        {
            mtype: this.type,
            type: "mute",
            ssrc: this.ssrc
        });
};

/**
 * Sends mute status for a track to conference if any.
 *
 * @param {boolean} mute - If track is muted.
 * @private
 * @returns {Promise}
 */
JitsiLocalTrack.prototype._sendMuteStatus = function(mute) {
    if (!this.conference || !this.conference.room) {
        return Promise.resolve();
    }

    var self = this;

    return new Promise(function(resolve) {
        self.conference.room[
            self.isAudioTrack()
                ? 'setAudioMute'
                : 'setVideoMute'](mute, resolve);
    });
};

/**
 * @inheritdoc
 *
 * Stops sending the media track. And removes it from the HTML.
 * NOTE: Works for local tracks only.
 *
 * @extends JitsiTrack#dispose
 * @returns {Promise}
 */
JitsiLocalTrack.prototype.dispose = function () {
    var self = this;
    var promise = Promise.resolve();

    if (this.conference){
        promise = this.conference.removeTrack(this);
    }

    if (this.stream) {
        this._stopMediaStream();
        this.detach();
    }

    RTCUtils.removeListener(RTCEvents.DEVICE_LIST_CHANGED,
        this._onDeviceListChanged);

    if (this._onAudioOutputDeviceChanged) {
        RTCUtils.removeListener(RTCEvents.AUDIO_OUTPUT_DEVICE_CHANGED,
            this._onAudioOutputDeviceChanged);
    }

    return promise
        .then(function() {
            return JitsiTrack.prototype.dispose.call(self); // super.dispose();
        });
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
 * Updates the SSRC associated with the MediaStream in JitsiLocalTrack object.
 * @ssrc the new ssrc
 */
JitsiLocalTrack.prototype._setSSRC = function (ssrc) {
    this.ssrc = ssrc;
};


/**
 * Sets the JitsiConference object associated with the track. This is temp
 * solution.
 * @param conference the JitsiConference object
 */
JitsiLocalTrack.prototype._setConference = function(conference) {
    this.conference = conference;

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
 * Returns <tt>true</tt>.
 * @returns {boolean} <tt>true</tt>
 */
JitsiLocalTrack.prototype.isLocal = function () {
    return true;
};

/**
 * Returns device id associated with track.
 * @returns {string}
 */
JitsiLocalTrack.prototype.getDeviceId = function () {
    return this._realDeviceId || this.deviceId;
};

/**
 * Sets the value of bytes sent statistic.
 * @param bytesSent {integer} the new value (FIXME: what is an integer in js?)
 * NOTE: used only for audio tracks to detect audio issues.
 */
JitsiLocalTrack.prototype._setByteSent = function (bytesSent) {
    this._bytesSent = bytesSent;
    // FIXME it's a shame that PeerConnection and ICE status does not belong
    // to the RTC module and it has to be accessed through
    // the conference(and through the XMPP chat room ???) instead
    let iceConnectionState
        = this.conference ? this.conference.getConnectionState() : null;
    if(this._testByteSent && "connected" === iceConnectionState) {
        setTimeout(function () {
            if(this._bytesSent <= 0){
                //we are not receiving anything from the microphone
                this._fireNoDataFromSourceEvent();
            }
        }.bind(this), 3000);
        this._testByteSent = false;
    }
};

/**
 * Returns facing mode for video track from camera. For other cases (e.g. audio
 * track or 'desktop' video track) returns undefined.
 *
 * @returns {CameraFacingMode|undefined}
 */
JitsiLocalTrack.prototype.getCameraFacingMode = function () {
    if (this.isVideoTrack() && this.videoType === VideoType.CAMERA) {
        // MediaStreamTrack#getSettings() is not implemented in many browsers,
        // so we need feature checking here. Progress on the respective
        // browser's implementation can be tracked at
        // https://bugs.chromium.org/p/webrtc/issues/detail?id=2481 for Chromium
        // and https://bugzilla.mozilla.org/show_bug.cgi?id=1213517 for Firefox.
        // Even if a browser implements getSettings() already, it might still
        // not return anything for 'facingMode'.
        var trackSettings;

        try {
            trackSettings = this.track.getSettings();
        } catch (e) {
            // XXX React-native-webrtc, for example, defines
            // MediaStreamTrack#getSettings() but the implementation throws a
            // "Not implemented" Error.
        }
        if (trackSettings && 'facingMode' in trackSettings) {
            return trackSettings.facingMode;
        }

        if (typeof this._facingMode !== 'undefined') {
            return this._facingMode;
        }

        // In most cases we are showing a webcam. So if we've gotten here, it
        // should be relatively safe to assume that we are probably showing
        // the user-facing camera.
        return CameraFacingMode.USER;
    }

    return undefined;
};

/**
 * Stops the associated MediaStream.
 */
JitsiLocalTrack.prototype._stopMediaStream = function () {
    this.stopStreamInProgress = true;
    RTCUtils.stopMediaStream(this.stream);
    this.stopStreamInProgress = false;
};

/**
 * Detects camera issues on ended and mute events from MediaStreamTrack.
 * @returns {boolean} true if an issue is detected and false otherwise
 */
JitsiLocalTrack.prototype._checkForCameraIssues = function () {
    if(!this.isVideoTrack() || this.stopStreamInProgress ||
        this.videoType === VideoType.DESKTOP)
        return false;

    return !this._isReceivingData();
};

/**
 * Checks whether the attached MediaStream is receiving data from source or
 * not. If the stream property is null(because of mute or another reason) this
 * method will return false.
 * NOTE: This method doesn't indicate problem with the streams directly.
 * For example in case of video mute the method will return false or if the
 * user has disposed the track.
 * @returns {boolean} true if the stream is receiving data and false otherwise.
 */
JitsiLocalTrack.prototype._isReceivingData = function () {
    if(!this.stream)
        return false;
    // In older version of the spec there is no muted property and
    // readyState can have value muted. In the latest versions
    // readyState can have values "live" and "ended" and there is
    // muted boolean property. If the stream is muted that means that
    // we aren't receiving any data from the source. We want to notify
    // the users for error if the stream is muted or ended on it's
    // creation.
    return this.stream.getTracks().some(track =>
        ((!("readyState" in track) || track.readyState === "live")
            && (!("muted" in track) || track.muted !== true)));
};

module.exports = JitsiLocalTrack;
