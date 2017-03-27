/* global __filename, Promise */

import CameraFacingMode from '../../service/RTC/CameraFacingMode';
import { getLogger } from 'jitsi-meet-logger';
import JitsiTrack from './JitsiTrack';
import JitsiTrackError from '../../JitsiTrackError';
import * as JitsiTrackErrors from '../../JitsiTrackErrors';
import * as JitsiTrackEvents from '../../JitsiTrackEvents';
import * as MediaType from '../../service/RTC/MediaType';
import RTCBrowserType from './RTCBrowserType';
import RTCEvents from '../../service/RTC/RTCEvents';
import RTCUtils from './RTCUtils';
import Statistics from '../statistics/statistics';
import VideoType from '../../service/RTC/VideoType';

const logger = getLogger(__filename);

/* eslint-disable max-params */

/**
 * Represents a single media track(either audio or video).
 * One <tt>JitsiLocalTrack</tt> corresponds to one WebRTC MediaStreamTrack.
 * @param {number} rtcId the ID assigned by the RTC module
 * @param stream WebRTC MediaStream, parent of the track
 * @param track underlying WebRTC MediaStreamTrack for new JitsiRemoteTrack
 * @param mediaType the MediaType of the JitsiRemoteTrack
 * @param videoType the VideoType of the JitsiRemoteTrack
 * @param resolution the video resolution if it's a video track
 * @param deviceId the ID of the local device for this track
 * @param facingMode the camera facing mode used in getUserMedia call
 * @constructor
 */
function JitsiLocalTrack(
        rtcId,
        stream,
        track,
        mediaType,
        videoType,
        resolution,
        deviceId,
        facingMode) {

    /**
     * The ID assigned by the RTC module on instance creation.
     * @type {number}
     */
    this.rtcId = rtcId;
    JitsiTrack.call(
        this,
        null /* RTC */,
        stream,
        track,
        () => {
            if (!this.dontFireRemoveEvent) {
                this.eventEmitter.emit(JitsiTrackEvents.LOCAL_TRACK_STOPPED);
            }
            this.dontFireRemoveEvent = false;
        } /* inactiveHandler */,
        mediaType,
        videoType);
    this.dontFireRemoveEvent = false;
    this.resolution = resolution;

    // FIXME: currently firefox is ignoring our constraints about resolutions
    // so we do not store it, to avoid wrong reporting of local track resolution
    if (RTCBrowserType.isFirefox()) {
        this.resolution = null;
    }

    this.deviceId = deviceId;
    this.startMuted = false;
    this.storedMSID = this.getMSID();
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

    this._onDeviceListChanged = devices => {
        this._setRealDeviceIdFromDeviceList(devices);

        // Mark track as ended for those browsers that do not support
        // "readyState" property. We do not touch tracks created with default
        // device ID "".
        if (typeof this.getTrack().readyState === 'undefined'
                && typeof this._realDeviceId !== 'undefined'
                && !devices.find(d => d.deviceId === this._realDeviceId)) {
            this._trackEnded = true;
        }
    };

    // Subscribe each created local audio track to
    // RTCEvents.AUDIO_OUTPUT_DEVICE_CHANGED event. This is different from
    // handling this event for remote tracks (which are handled in RTC.js),
    // because there might be local tracks not attached to a conference.
    if (this.isAudioTrack() && RTCUtils.isDeviceChangeAvailable('output')) {
        this._onAudioOutputDeviceChanged = this.setAudioOutput.bind(this);
        RTCUtils.addListener(
            RTCEvents.AUDIO_OUTPUT_DEVICE_CHANGED,
            this._onAudioOutputDeviceChanged);
    }

    RTCUtils.addListener(
        RTCEvents.DEVICE_LIST_CHANGED,
        this._onDeviceListChanged);

    this._initNoDataFromSourceHandlers();
}

/* eslint-enable max-params */

JitsiLocalTrack.prototype = Object.create(JitsiTrack.prototype);
JitsiLocalTrack.prototype.constructor = JitsiLocalTrack;

/**
 * Returns if associated MediaStreamTrack is in the 'ended' state
 * @returns {boolean}
 */
JitsiLocalTrack.prototype.isEnded = function() {
    return this.getTrack().readyState === 'ended' || this._trackEnded;
};

/**
 * Sets handlers to the MediaStreamTrack object that will detect camera issues.
 */
JitsiLocalTrack.prototype._initNoDataFromSourceHandlers = function() {
    if (this.isVideoTrack() && this.videoType === VideoType.CAMERA) {
        const _onNoDataFromSourceError
            = this._onNoDataFromSourceError.bind(this);

        this._setHandler('track_mute', () => {
            if (this._checkForCameraIssues()) {
                const now = window.performance.now();

                this._noDataFromSourceTimeout
                    = setTimeout(_onNoDataFromSourceError, 3000);
                this._setHandler('track_unmute', () => {
                    this._clearNoDataFromSourceMuteResources();
                    Statistics.sendEventToAll(
                        `${this.getType()}.track_unmute`,
                        { value: window.performance.now() - now });
                });
            }
        });
        this._setHandler('track_ended', _onNoDataFromSourceError);
    }
};

/**
 * Clears all timeouts and handlers set on MediaStreamTrack mute event.
 * FIXME: Change the name of the method with better one.
 */
JitsiLocalTrack.prototype._clearNoDataFromSourceMuteResources = function() {
    if (this._noDataFromSourceTimeout) {
        clearTimeout(this._noDataFromSourceTimeout);
        this._noDataFromSourceTimeout = null;
    }
    this._setHandler('track_unmute', undefined);
};

/**
 * Called when potential camera issue is detected. Clears the handlers and
 * timeouts set on MediaStreamTrack muted event. Verifies that the camera
 * issue persists and fires NO_DATA_FROM_SOURCE event.
 */
JitsiLocalTrack.prototype._onNoDataFromSourceError = function() {
    this._clearNoDataFromSourceMuteResources();
    if (this._checkForCameraIssues()) {
        this._fireNoDataFromSourceEvent();
    }
};

/**
 * Fires JitsiTrackEvents.NO_DATA_FROM_SOURCE and logs it to analytics and
 * callstats.
 */
JitsiLocalTrack.prototype._fireNoDataFromSourceEvent = function() {
    this.eventEmitter.emit(JitsiTrackEvents.NO_DATA_FROM_SOURCE);
    const eventName = `${this.getType()}.no_data_from_source`;

    Statistics.analytics.sendEvent(eventName);
    const log = { name: eventName };

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
JitsiLocalTrack.prototype._setRealDeviceIdFromDeviceList = function(devices) {
    const track = this.getTrack();
    const device
        = devices.find(
            d => d.kind === `${track.kind}input` && d.label === track.label);

    if (device) {
        this._realDeviceId = device.deviceId;
    }
};

/**
 * Sets the stream property of JitsiLocalTrack object and sets all stored
 * handlers to it.
 * @param {MediaStream} stream the new stream.
 */
JitsiLocalTrack.prototype._setStream = function(stream) {
    JitsiTrack.prototype._setStream.call(this, stream);

    // Store the MSID for video mute/unmute purposes
    if (stream) {
        this.storedMSID = this.getMSID();
        logger.debug(`Setting new MSID: ${this.storedMSID} on ${this}`);
    } else {
        logger.debug(`Setting 'null' stream on ${this}`);
    }
};

/**
 * Mutes the track. Will reject the Promise if there is mute/unmute operation
 * in progress.
 * @returns {Promise}
 */
JitsiLocalTrack.prototype.mute = function() {
    return createMuteUnmutePromise(this, true);
};

/**
 * Unmutes the track. Will reject the Promise if there is mute/unmute operation
 * in progress.
 * @returns {Promise}
 */
JitsiLocalTrack.prototype.unmute = function() {
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
        .then(() => {
            track.inMuteOrUnmuteProgress = false;
        })
        .catch(status => {
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
JitsiLocalTrack.prototype._setMute = function(mute) {
    if (this.isMuted() === mute) {
        return Promise.resolve();
    }

    let promise = Promise.resolve();
    const self = this;

    // Local track can be used out of conference, so we need to handle that
    // case and mark that track should start muted or not when added to
    // conference.
    // Pawel: track's muted status should be taken into account when track is
    // being added to the conference/JingleSessionPC/TraceablePeerConnection.
    // There's no need to add such fields. It is logical that when muted track
    // is being added to a conference it "starts muted"...
    if (!this.conference || !this.conference.room) {
        this.startMuted = mute;
    }

    this.dontFireRemoveEvent = false;

    // A function that will print info about muted status transition
    const logMuteInfo = () => logger.info(`Mute ${this}: ${mute}`);

    if (this.isAudioTrack()
        || this.videoType === VideoType.DESKTOP
        || !RTCBrowserType.doesVideoMuteByStreamRemove()) {
        logMuteInfo();
        if (this.track) {
            this.track.enabled = !mute;
        }
    } else if (mute) {
        this.dontFireRemoveEvent = true;
        promise = new Promise((resolve, reject) => {
            logMuteInfo();
            this._removeStreamFromConferenceAsMute(() => {
                // FIXME: Maybe here we should set the SRC for the containers
                // to something
                this._stopMediaStream();
                this._setStream(null);
                resolve();
            }, err => {
                reject(err);
            });
        });
    } else {
        logMuteInfo();

        // This path is only for camera.
        const streamOptions = {
            cameraDeviceId: this.getDeviceId(),
            devices: [ MediaType.VIDEO ],
            facingMode: this.getCameraFacingMode()
        };

        if (this.resolution) {
            streamOptions.resolution = this.resolution;
        }

        promise = RTCUtils.obtainAudioAndVideoPermissions(streamOptions)
            .then(streamsInfo => {
                const mediaType = self.getType();
                const streamInfo
                    = streamsInfo.find(info => info.mediaType === mediaType);

                if (streamInfo) {
                    self._setStream(streamInfo.stream);
                    self.track = streamInfo.track;

                    // This is not good when video type changes after
                    // unmute, but let's not crash here
                    if (self.videoType !== streamInfo.videoType) {
                        logger.warn(
                            `${this}: video type has changed after unmute!`,
                            self.videoType, streamInfo.videoType);
                        self.videoType = streamInfo.videoType;
                    }
                } else {
                    throw new JitsiTrackError(
                        JitsiTrackErrors.TRACK_NO_STREAM_FOUND);
                }

                self.containers
                    = self.containers.map(
                        cont => RTCUtils.attachMediaStream(cont, self.stream));

                return self._addStreamToConferenceAsUnmute();
            });
    }

    return promise
        .then(() => this._sendMuteStatus(mute))
        .then(() => {
            this.eventEmitter.emit(JitsiTrackEvents.TRACK_MUTE_CHANGED, this);
        });
};

/**
 * Adds stream to conference and marks it as "unmute" operation.
 *
 * @private
 * @returns {Promise}
 */
JitsiLocalTrack.prototype._addStreamToConferenceAsUnmute = function() {
    if (!this.conference) {
        return Promise.resolve();
    }

    // FIXME it would be good to not included conference as part of this process
    // Only TraceablePeerConnections to which the track is attached should care
    // about this action. The TPCs to which the track is not attached can sync
    // up when track is re-attached.
    // A problem with that is that the "modify sources" queue is part of
    // the JingleSessionPC and it would be excluded from the process. One
    // solution would be to extract class between TPC and JingleSessionPC which
    // would contain the queue and would notify the signaling layer when local
    // SSRCs are changed. This would help to separate XMPP from the RTC module.
    return new Promise((resolve, reject) => {
        this.conference._addLocalTrackAsUnmute(this)
            .then(resolve, error => reject(new Error(error)));
    });
};

/**
 * Removes stream from conference and marks it as "mute" operation.
 * @param {Function} successCallback will be called on success
 * @param {Function} errorCallback will be called on error
 * @private
 */
JitsiLocalTrack.prototype._removeStreamFromConferenceAsMute
= function(successCallback, errorCallback) {
    if (!this.conference) {
        successCallback();

        return;
    }
    this.conference._removeLocalTrackAsMute(this).then(
        successCallback,
        error => errorCallback(new Error(error)));
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

    return new Promise(resolve => {
        this.conference.room[
            this.isAudioTrack()
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
JitsiLocalTrack.prototype.dispose = function() {
    const self = this;
    let promise = Promise.resolve();

    if (this.conference) {
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
        .then(() => JitsiTrack.prototype.dispose.call(self) // super.dispose();
        );
};

/**
 * Returns <tt>true</tt> - if the stream is muted
 * and <tt>false</tt> otherwise.
 * @returns {boolean} <tt>true</tt> - if the stream is muted
 * and <tt>false</tt> otherwise.
 */
JitsiLocalTrack.prototype.isMuted = function() {
    // this.stream will be null when we mute local video on Chrome
    if (!this.stream) {
        return true;
    }
    if (this.isVideoTrack() && !this.isActive()) {
        return true;
    }

    return !this.track || !this.track.enabled;

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
    for (let i = 0; i < this.containers.length; i++) {
        this._maybeFireTrackAttached(this.containers[i]);
    }
};

/**
 * Returns <tt>true</tt>.
 * @returns {boolean} <tt>true</tt>
 */
JitsiLocalTrack.prototype.isLocal = function() {
    return true;
};

/**
 * Returns device id associated with track.
 * @returns {string}
 */
JitsiLocalTrack.prototype.getDeviceId = function() {
    return this._realDeviceId || this.deviceId;
};

/**
 * Returns the participant id which owns the track.
 * @returns {string} the id of the participants. It corresponds to the Colibri
 * endpoint id/MUC nickname in case of Jitsi-meet.
 */
JitsiLocalTrack.prototype.getParticipantId = function() {
    return this.conference && this.conference.myUserId();
};

/**
 * Sets the value of bytes sent statistic.
 * @param {TraceablePeerConnection} tpc the source of the "bytes sent" stat
 * @param {number} bytesSent the new value
 * NOTE: used only for audio tracks to detect audio issues.
 */
JitsiLocalTrack.prototype._setByteSent = function(tpc, bytesSent) {
    this._bytesSent = bytesSent;
    const iceConnectionState = tpc.getConnectionState();

    if (this._testByteSent && iceConnectionState === 'connected') {
        setTimeout(() => {
            if (this._bytesSent <= 0) {
                logger.warn(`${this} 'bytes sent' <= 0: ${this._bytesSent}`);

                // we are not receiving anything from the microphone
                this._fireNoDataFromSourceEvent();
            }
        }, 3000);
        this._testByteSent = false;
    }
};

/**
 * Returns facing mode for video track from camera. For other cases (e.g. audio
 * track or 'desktop' video track) returns undefined.
 *
 * @returns {CameraFacingMode|undefined}
 */
JitsiLocalTrack.prototype.getCameraFacingMode = function() {
    if (this.isVideoTrack() && this.videoType === VideoType.CAMERA) {
        // MediaStreamTrack#getSettings() is not implemented in many browsers,
        // so we need feature checking here. Progress on the respective
        // browser's implementation can be tracked at
        // https://bugs.chromium.org/p/webrtc/issues/detail?id=2481 for Chromium
        // and https://bugzilla.mozilla.org/show_bug.cgi?id=1213517 for Firefox.
        // Even if a browser implements getSettings() already, it might still
        // not return anything for 'facingMode'.
        let trackSettings;

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
JitsiLocalTrack.prototype._stopMediaStream = function() {
    this.stopStreamInProgress = true;
    RTCUtils.stopMediaStream(this.stream);
    this.stopStreamInProgress = false;
};

/**
 * Detects camera issues on ended and mute events from MediaStreamTrack.
 * @returns {boolean} true if an issue is detected and false otherwise
 */
JitsiLocalTrack.prototype._checkForCameraIssues = function() {
    if (!this.isVideoTrack() || this.stopStreamInProgress
        || this.videoType === VideoType.DESKTOP) {
        return false;
    }

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
JitsiLocalTrack.prototype._isReceivingData = function() {
    if (!this.stream) {
        return false;
    }

    // In older version of the spec there is no muted property and
    // readyState can have value muted. In the latest versions
    // readyState can have values "live" and "ended" and there is
    // muted boolean property. If the stream is muted that means that
    // we aren't receiving any data from the source. We want to notify
    // the users for error if the stream is muted or ended on it's
    // creation.
    return this.stream.getTracks().some(track =>
        (!('readyState' in track) || track.readyState === 'live')
            && (!('muted' in track) || track.muted !== true));
};

/**
 * Creates a text representation of this local track instance.
 * @return {string}
 */
JitsiLocalTrack.prototype.toString = function() {
    return `LocalTrack[${this.rtcId},${this.getType()}]`;
};

module.exports = JitsiLocalTrack;
