/* global __filename, Promise */

import { getLogger } from 'jitsi-meet-logger';
import JitsiTrack from './JitsiTrack';
import JitsiTrackError from '../../JitsiTrackError';
import {
    TRACK_IS_DISPOSED,
    TRACK_NO_STREAM_FOUND
} from '../../JitsiTrackErrors';
import {
    LOCAL_TRACK_STOPPED,
    NO_DATA_FROM_SOURCE,
    TRACK_MUTE_CHANGED
} from '../../JitsiTrackEvents';
import browser from '../browser';
import RTCUtils from './RTCUtils';
import CameraFacingMode from '../../service/RTC/CameraFacingMode';
import * as MediaType from '../../service/RTC/MediaType';
import RTCEvents from '../../service/RTC/RTCEvents';
import VideoType from '../../service/RTC/VideoType';
import {
    TRACK_UNMUTED,
    createNoDataFromSourceEvent
} from '../../service/statistics/AnalyticsEvents';
import Statistics from '../statistics/statistics';

const logger = getLogger(__filename);

/**
 * Represents a single media track(either audio or video).
 * One <tt>JitsiLocalTrack</tt> corresponds to one WebRTC MediaStreamTrack.
 */
export default class JitsiLocalTrack extends JitsiTrack {
    /**
     * Constructs new JitsiLocalTrack instance.
     *
     * @constructor
     * @param {Object} trackInfo
     * @param {number} trackInfo.rtcId the ID assigned by the RTC module
     * @param trackInfo.stream WebRTC MediaStream, parent of the track
     * @param trackInfo.track underlying WebRTC MediaStreamTrack for new
     * JitsiRemoteTrack
     * @param trackInfo.mediaType the MediaType of the JitsiRemoteTrack
     * @param trackInfo.videoType the VideoType of the JitsiRemoteTrack
     * @param trackInfo.resolution the video resolution if it's a video track
     * @param trackInfo.deviceId the ID of the local device for this track
     * @param trackInfo.facingMode the camera facing mode used in getUserMedia
     * call
     * @param {sourceId} trackInfo.sourceId - The id of the desktop sharing
     * source. NOTE: defined for desktop sharing tracks only.
     */
    constructor({
        deviceId,
        facingMode,
        mediaType,
        resolution,
        rtcId,
        sourceId,
        sourceType,
        stream,
        track,
        videoType
    }) {
        super(
            /* conference */ null,
            stream,
            track,
            /* streamInactiveHandler */ () => this.emit(LOCAL_TRACK_STOPPED),
            mediaType,
            videoType);

        /**
         * The ID assigned by the RTC module on instance creation.
         *
         * @type {number}
         */
        this.rtcId = rtcId;
        this.sourceId = sourceId;
        this.sourceType = sourceType;

        if (browser.usesNewGumFlow()) {
            // Get the resolution from the track itself because it cannot be
            // certain which resolution webrtc has fallen back to using.
            this.resolution = track.getSettings().height;

            // Cache the constraints of the track in case of any this track
            // model needs to call getUserMedia again, such as when unmuting.
            this._constraints = track.getConstraints();
        } else {
            // FIXME Currently, Firefox is ignoring our constraints about
            // resolutions so we do not store it, to avoid wrong reporting of
            // local track resolution.
            this.resolution = browser.isFirefox() ? null : resolution;
        }

        this.deviceId = deviceId;

        /**
         * The <tt>Promise</tt> which represents the progress of a previously
         * queued/scheduled {@link _setMuted} (from the point of view of
         * {@link _queueSetMuted}).
         *
         * @private
         * @type {Promise}
         */
        this._prevSetMuted = Promise.resolve();

        /**
         * The facing mode of the camera from which this JitsiLocalTrack
         * instance was obtained.
         *
         * @private
         * @type {CameraFacingMode|undefined}
         */
        this._facingMode = facingMode;

        // Currently there is no way to know the MediaStreamTrack ended due to
        // to device disconnect in Firefox through e.g. "readyState" property.
        // Instead we will compare current track's label with device labels from
        // enumerateDevices() list.
        this._trackEnded = false;

        /**
         * Indicates whether data has been sent or not.
         */
        this._hasSentData = false;

        /**
         * Used only for detection of audio problems. We want to check only once
         * whether the track is sending data ot not. This flag is set to false
         * after the check.
         */
        this._testDataSent = true;

        // Currently there is no way to determine with what device track was
        // created (until getConstraints() support), however we can associate
        // tracks with real devices obtained from enumerateDevices() call as
        // soon as it's called.
        // NOTE: this.deviceId corresponds to the device id specified in GUM constraints and this._realDeviceId seems to
        // correspond to the id of a matching device from the available device list.
        this._realDeviceId = this.deviceId === '' ? undefined : this.deviceId;

        /**
         * On mute event we are waiting for 3s to check if the stream is going
         * to be still muted before firing the event for camera issue detected
         * (NO_DATA_FROM_SOURCE).
         */
        this._noDataFromSourceTimeout = null;

        this._onDeviceListWillChange = devices => {
            this._setRealDeviceIdFromDeviceList(devices);

            // Mark track as ended for those browsers that do not support
            // "readyState" property. We do not touch tracks created with
            // default device ID "".
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

        RTCUtils.addListener(RTCEvents.DEVICE_LIST_WILL_CHANGE, this._onDeviceListWillChange);

        this._initNoDataFromSourceHandlers();
    }

    /**
     * Returns if associated MediaStreamTrack is in the 'ended' state
     *
     * @returns {boolean}
     */
    isEnded() {
        return this.getTrack().readyState === 'ended' || this._trackEnded;
    }

    /**
     * Sets handlers to the MediaStreamTrack object that will detect camera
     * issues.
     */
    _initNoDataFromSourceHandlers() {
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
                        Statistics.sendAnalyticsAndLog(
                            TRACK_UNMUTED,
                            {
                                'media_type': this.getType(),
                                'track_type': 'local',
                                value: window.performance.now() - now
                            });
                    });
                }
            });
            this._setHandler('track_ended', _onNoDataFromSourceError);
        }
    }

    /**
     * Clears all timeouts and handlers set on MediaStreamTrack mute event.
     * FIXME: Change the name of the method with better one.
     */
    _clearNoDataFromSourceMuteResources() {
        if (this._noDataFromSourceTimeout) {
            clearTimeout(this._noDataFromSourceTimeout);
            this._noDataFromSourceTimeout = null;
        }
        this._setHandler('track_unmute', undefined);
    }

    /**
     * Called when potential camera issue is detected. Clears the handlers and
     * timeouts set on MediaStreamTrack muted event. Verifies that the camera
     * issue persists and fires NO_DATA_FROM_SOURCE event.
     */
    _onNoDataFromSourceError() {
        this._clearNoDataFromSourceMuteResources();
        if (this._checkForCameraIssues()) {
            this._fireNoDataFromSourceEvent();
        }
    }

    /**
     * Fires NO_DATA_FROM_SOURCE event and logs it to analytics and callstats.
     */
    _fireNoDataFromSourceEvent() {
        this.emit(NO_DATA_FROM_SOURCE);

        Statistics.sendAnalytics(createNoDataFromSourceEvent(this.getType()));
        const log = { name: NO_DATA_FROM_SOURCE };

        if (this.isAudioTrack()) {
            log.isReceivingData = this._isReceivingData();
        }
        Statistics.sendLog(JSON.stringify(log));
    }

    /**
     * Sets real device ID by comparing track information with device
     * information. This is temporary solution until getConstraints() method
     * will be implemented in browsers.
     *
     * @param {MediaDeviceInfo[]} devices - list of devices obtained from
     * enumerateDevices() call
     */
    _setRealDeviceIdFromDeviceList(devices) {
        const track = this.getTrack();
        const kind = `${track.kind}input`;
        let device = devices.find(d => d.kind === kind && d.label === track.label);

        if (!device && this._realDeviceId === 'default') { // the default device has been changed.
            // If the default device was 'A' and the default device is changed to 'B' the label for the track will
            // remain 'Default - A' but the label for the device in the device list will be updated to 'A'. That's
            // why in order to match it we need to remove the 'Default - ' part.
            const label = (track.label || '').replace('Default - ', '');

            device = devices.find(d => d.kind === kind && d.label === label);
        }

        if (device) {
            this._realDeviceId = device.deviceId;
        }
    }

    /**
     * Sets the stream property of JitsiLocalTrack object and sets all stored
     * handlers to it.
     *
     * @param {MediaStream} stream the new stream.
     * @protected
     */
    _setStream(stream) {
        super._setStream(stream);

        if (stream) {
            // Store the MSID for video mute/unmute purposes.
            this.storedMSID = this.getMSID();
            logger.debug(`Setting new MSID: ${this.storedMSID} on ${this}`);
        } else {
            logger.debug(`Setting 'null' stream on ${this}`);
        }
    }

    /**
     * Asynchronously mutes this track.
     *
     * @returns {Promise}
     */
    mute() {
        return this._queueSetMuted(true);
    }

    /**
     * Asynchronously unmutes this track.
     *
     * @returns {Promise}
     */
    unmute() {
        return this._queueSetMuted(false);
    }

    /**
     * Initializes a new Promise to execute {@link #_setMuted}. May be called
     * multiple times in a row and the invocations of {@link #_setMuted} and,
     * consequently, {@link #mute} and/or {@link #unmute} will be resolved in a
     * serialized fashion.
     *
     * @param {boolean} muted - The value to invoke <tt>_setMuted</tt> with.
     * @returns {Promise}
     */
    _queueSetMuted(muted) {
        const setMuted = this._setMuted.bind(this, muted);

        this._prevSetMuted = this._prevSetMuted.then(setMuted, setMuted);

        return this._prevSetMuted;
    }

    /**
     * Mutes / unmutes this track.
     *
     * @param {boolean} muted - If <tt>true</tt>, this track will be muted;
     * otherwise, this track will be unmuted.
     * @private
     * @returns {Promise}
     */
    _setMuted(muted) {
        if (this.isMuted() === muted) {
            return Promise.resolve();
        }

        if (this.disposed) {
            return Promise.reject(new JitsiTrackError(TRACK_IS_DISPOSED));
        }

        let promise = Promise.resolve();

        // A function that will print info about muted status transition
        const logMuteInfo = () => logger.info(`Mute ${this}: ${muted}`);

        if (this.isAudioTrack()
                || this.videoType === VideoType.DESKTOP
                || !browser.doesVideoMuteByStreamRemove()) {
            logMuteInfo();
            if (this.track) {
                this.track.enabled = !muted;
            }
        } else if (muted) {
            promise = new Promise((resolve, reject) => {
                logMuteInfo();
                this._removeStreamFromConferenceAsMute(
                    () => {
                        // FIXME: Maybe here we should set the SRC for the
                        // containers to something
                        // We don't want any events to be fired on this stream
                        this._unregisterHandlers();
                        this.stopStream();
                        this._setStream(null);
                        resolve();
                    },
                    reject);
            });
        } else {
            logMuteInfo();

            // This path is only for camera.
            const streamOptions = {
                cameraDeviceId: this.getDeviceId(),
                devices: [ MediaType.VIDEO ],
                facingMode: this.getCameraFacingMode()
            };

            if (browser.usesNewGumFlow()) {
                promise
                    = RTCUtils.newObtainAudioAndVideoPermissions(Object.assign(
                        {},
                        streamOptions,
                        { constraints: { video: this._constraints } }));
            } else {
                if (this.resolution) {
                    streamOptions.resolution = this.resolution;
                }

                promise
                    = RTCUtils.obtainAudioAndVideoPermissions(streamOptions);
            }

            promise.then(streamsInfo => {
                const mediaType = this.getType();
                const streamInfo
                    = browser.usesNewGumFlow()
                        ? streamsInfo.find(
                            info => info.track.kind === mediaType)
                        : streamsInfo.find(
                            info => info.mediaType === mediaType);

                if (streamInfo) {
                    this._setStream(streamInfo.stream);
                    this.track = streamInfo.track;

                    // This is not good when video type changes after
                    // unmute, but let's not crash here
                    if (this.videoType !== streamInfo.videoType) {
                        logger.warn(
                            `${this}: video type has changed after unmute!`,
                            this.videoType, streamInfo.videoType);
                        this.videoType = streamInfo.videoType;
                    }
                } else {
                    throw new JitsiTrackError(TRACK_NO_STREAM_FOUND);
                }

                this.containers.map(
                    cont => RTCUtils.attachMediaStream(cont, this.stream));

                return this._addStreamToConferenceAsUnmute();
            });
        }

        return promise
            .then(() => this._sendMuteStatus(muted))
            .then(() => this.emit(TRACK_MUTE_CHANGED, this));
    }

    /**
     * Adds stream to conference and marks it as "unmute" operation.
     *
     * @private
     * @returns {Promise}
     */
    _addStreamToConferenceAsUnmute() {
        if (!this.conference) {
            return Promise.resolve();
        }

        // FIXME it would be good to not included conference as part of this
        // process. Only TraceablePeerConnections to which the track is attached
        // should care about this action. The TPCs to which the track is not
        // attached can sync up when track is re-attached.
        // A problem with that is that the "modify sources" queue is part of
        // the JingleSessionPC and it would be excluded from the process. One
        // solution would be to extract class between TPC and JingleSessionPC
        // which would contain the queue and would notify the signaling layer
        // when local SSRCs are changed. This would help to separate XMPP from
        // the RTC module.
        return new Promise((resolve, reject) => {
            this.conference._addLocalTrackAsUnmute(this)
                .then(resolve, error => reject(new Error(error)));
        });
    }

    /**
     * Removes stream from conference and marks it as "mute" operation.
     *
     * @param {Function} successCallback will be called on success
     * @param {Function} errorCallback will be called on error
     * @private
     */
    _removeStreamFromConferenceAsMute(successCallback, errorCallback) {
        if (!this.conference) {
            successCallback();

            return;
        }
        this.conference._removeLocalTrackAsMute(this).then(
            successCallback,
            error => errorCallback(new Error(error)));
    }

    /**
     * Sends mute status for a track to conference if any.
     *
     * @param {boolean} mute - If track is muted.
     * @private
     * @returns {Promise}
     */
    _sendMuteStatus(mute) {
        if (!this.conference || !this.conference.room) {
            return Promise.resolve();
        }

        return new Promise(resolve => {
            this.conference.room[
                this.isAudioTrack()
                    ? 'setAudioMute'
                    : 'setVideoMute'](mute, resolve);
        });
    }

    /**
     * @inheritdoc
     *
     * Stops sending the media track. And removes it from the HTML.
     * NOTE: Works for local tracks only.
     *
     * @extends JitsiTrack#dispose
     * @returns {Promise}
     */
    dispose() {
        let promise = Promise.resolve();

        if (this.conference) {
            promise = this.conference.removeTrack(this);
        }

        if (this.stream) {
            this.stopStream();
            this.detach();
        }

        RTCUtils.removeListener(RTCEvents.DEVICE_LIST_WILL_CHANGE, this._onDeviceListWillChange);

        if (this._onAudioOutputDeviceChanged) {
            RTCUtils.removeListener(RTCEvents.AUDIO_OUTPUT_DEVICE_CHANGED,
                this._onAudioOutputDeviceChanged);
        }

        return promise.then(() => super.dispose());
    }

    /**
     * Returns <tt>true</tt> - if the stream is muted and <tt>false</tt>
     * otherwise.
     *
     * @returns {boolean} <tt>true</tt> - if the stream is muted and
     * <tt>false</tt> otherwise.
     */
    isMuted() {
        // this.stream will be null when we mute local video on Chrome
        if (!this.stream) {
            return true;
        }
        if (this.isVideoTrack() && !this.isActive()) {
            return true;
        }

        return !this.track || !this.track.enabled;
    }

    /**
     * Sets the JitsiConference object associated with the track. This is temp
     * solution.
     *
     * @param conference the JitsiConference object
     */
    _setConference(conference) {
        this.conference = conference;

        // We want to keep up with postponed events which should have been fired
        // on "attach" call, but for local track we not always have the
        // conference before attaching. However this may result in duplicated
        // events if they have been triggered on "attach" already.
        for (let i = 0; i < this.containers.length; i++) {
            this._maybeFireTrackAttached(this.containers[i]);
        }
    }

    /**
     * Returns <tt>true</tt>.
     *
     * @returns {boolean} <tt>true</tt>
     */
    isLocal() {
        return true;
    }

    /**
     * Returns device id associated with track.
     *
     * @returns {string}
     */
    getDeviceId() {
        return this._realDeviceId || this.deviceId;
    }

    /**
     * Returns the participant id which owns the track.
     *
     * @returns {string} the id of the participants. It corresponds to the
     * Colibri endpoint id/MUC nickname in case of Jitsi-meet.
     */
    getParticipantId() {
        return this.conference && this.conference.myUserId();
    }

    /**
     * Handles bytes sent statistics.
     *
     * @param {TraceablePeerConnection} tpc the source of the "bytes sent" stat
     * @param {number} bytesSent the new value
     * NOTE: used only for audio tracks to detect audio issues.
     */
    _onByteSentStatsReceived(tpc, bytesSent) {
        if (bytesSent > 0) {
            this._hasSentData = true;
        }
        const iceConnectionState = tpc.getConnectionState();

        if (this._testDataSent && iceConnectionState === 'connected') {
            setTimeout(() => {
                if (!this._hasSentData) {
                    logger.warn(`${this} 'bytes sent' <= 0: \
                        ${this._bytesSent}`);

                    // we are not receiving anything from the microphone
                    this._fireNoDataFromSourceEvent();
                }
            }, 3000);
            this._testDataSent = false;
        }
    }

    /**
     * Returns facing mode for video track from camera. For other cases (e.g.
     * audio track or 'desktop' video track) returns undefined.
     *
     * @returns {CameraFacingMode|undefined}
     */
    getCameraFacingMode() {
        if (this.isVideoTrack() && this.videoType === VideoType.CAMERA) {
            // MediaStreamTrack#getSettings() is not implemented in many
            // browsers, so we need feature checking here. Progress on the
            // respective browser's implementation can be tracked at
            // https://bugs.chromium.org/p/webrtc/issues/detail?id=2481 for
            // Chromium and https://bugzilla.mozilla.org/show_bug.cgi?id=1213517
            // for Firefox. Even if a browser implements getSettings() already,
            // it might still not return anything for 'facingMode'.
            let trackSettings;

            try {
                trackSettings = this.track.getSettings();
            } catch (e) {
                // XXX React-native-webrtc, for example, defines
                // MediaStreamTrack#getSettings() but the implementation throws
                // a "Not implemented" Error.
            }
            if (trackSettings && 'facingMode' in trackSettings) {
                return trackSettings.facingMode;
            }

            if (typeof this._facingMode !== 'undefined') {
                return this._facingMode;
            }

            // In most cases we are showing a webcam. So if we've gotten here,
            // it should be relatively safe to assume that we are probably
            // showing the user-facing camera.
            return CameraFacingMode.USER;
        }

        return undefined;
    }

    /**
     * Stops the associated MediaStream.
     */
    stopStream() {

        /**
         * Indicates that we are executing {@link #stopStream} i.e.
         * {@link RTCUtils#stopMediaStream} for the <tt>MediaStream</tt>
         * associated with this <tt>JitsiTrack</tt> instance.
         *
         * @private
         * @type {boolean}
         */
        this._stopStreamInProgress = true;

        try {
            RTCUtils.stopMediaStream(this.stream);
        } finally {
            this._stopStreamInProgress = false;
        }
    }

    /**
     * Switches the camera facing mode if the WebRTC implementation supports the
     * custom MediaStreamTrack._switchCamera method. Currently, the method in
     * question is implemented in react-native-webrtc only. When such a WebRTC
     * implementation is executing, the method is the preferred way to switch
     * between the front/user-facing and the back/environment-facing cameras
     * because it will likely be (as is the case of react-native-webrtc)
     * noticeably faster that creating a new MediaStreamTrack via a new
     * getUserMedia call with the switched facingMode constraint value.
     * Moreover, the approach with a new getUserMedia call may not even work:
     * WebRTC on Android and iOS is either very slow to open the camera a second
     * time or plainly freezes attempting to do that.
     */
    _switchCamera() {
        if (this.isVideoTrack()
                && this.videoType === VideoType.CAMERA
                && typeof this.track._switchCamera === 'function') {
            this.track._switchCamera();

            this._facingMode
                = this._facingMode === CameraFacingMode.ENVIRONMENT
                    ? CameraFacingMode.USER
                    : CameraFacingMode.ENVIRONMENT;
        }
    }

    /**
     * Detects camera issues, i.e. returns true if we expect this track to be
     * receiving data from its source, but it isn't receiving data.
     *
     * @returns {boolean} true if an issue is detected and false otherwise
     */
    _checkForCameraIssues() {
        if (!this.isVideoTrack()
                || this._stopStreamInProgress
                || this.videoType === VideoType.DESKTOP) {
            return false;
        }

        return !this._isReceivingData();
    }

    /**
     * Checks whether the attached MediaStream is receiving data from source or
     * not. If the stream property is null(because of mute or another reason)
     * this method will return false.
     * NOTE: This method doesn't indicate problem with the streams directly.
     * For example in case of video mute the method will return false or if the
     * user has disposed the track.
     *
     * @returns {boolean} true if the stream is receiving data and false
     * this otherwise.
     */
    _isReceivingData() {
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
    }

    /**
     * Creates a text representation of this local track instance.
     *
     * @return {string}
     */
    toString() {
        return `LocalTrack[${this.rtcId},${this.getType()}]`;
    }
}
