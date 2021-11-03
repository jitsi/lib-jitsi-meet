/* global __filename, Promise */

import { getLogger } from 'jitsi-meet-logger';

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
import CameraFacingMode from '../../service/RTC/CameraFacingMode';
import * as MediaType from '../../service/RTC/MediaType';
import RTCEvents from '../../service/RTC/RTCEvents';
import VideoType from '../../service/RTC/VideoType';
import {
    NO_BYTES_SENT,
    TRACK_UNMUTED,
    createNoDataFromSourceEvent
} from '../../service/statistics/AnalyticsEvents';
import browser from '../browser';
import Statistics from '../statistics/statistics';

import JitsiTrack from './JitsiTrack';
import RTCUtils from './RTCUtils';

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
     * @param trackInfo.effects the effects array contains the effect instance to use
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
        videoType,
        effects = []
    }) {
        super(
            /* conference */ null,
            stream,
            track,
            /* streamInactiveHandler */ () => this.emit(LOCAL_TRACK_STOPPED),
            mediaType,
            videoType);

        this._setEffectInProgress = false;
        const effect = effects.find(e => e.isEnabled(this));

        if (effect) {
            this._startStreamEffect(effect);
        }

        const displaySurface = videoType === VideoType.DESKTOP
            ? track.getSettings().displaySurface
            : null;

        /**
         * Track metadata.
         */
        this.metadata = {
            timestamp: Date.now(),
            ...displaySurface ? { displaySurface } : {}
        };


        /**
         * The ID assigned by the RTC module on instance creation.
         *
         * @type {number}
         */
        this.rtcId = rtcId;
        this.sourceId = sourceId;
        this.sourceType = sourceType;

        // Get the resolution from the track itself because it cannot be
        // certain which resolution webrtc has fallen back to using.
        this.resolution = track.getSettings().height;
        this.maxEnabledResolution = resolution;

        // Cache the constraints of the track in case of any this track
        // model needs to call getUserMedia again, such as when unmuting.
        this._constraints = track.getConstraints();

        // Safari returns an empty constraints object, construct the constraints using getSettings.
        if (!Object.keys(this._constraints).length && videoType === VideoType.CAMERA) {
            this._constraints = {
                height: track.getSettings().height,
                width: track.getSettings().width
            };
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

        this._trackMutedTS = 0;

        this._onDeviceListWillChange = devices => {
            const oldRealDeviceId = this._realDeviceId;

            this._setRealDeviceIdFromDeviceList(devices);

            if (
                // Mark track as ended for those browsers that do not support
                // "readyState" property. We do not touch tracks created with
                // default device ID "".
                (typeof this.getTrack().readyState === 'undefined'
                    && typeof this._realDeviceId !== 'undefined'
                    && !devices.find(d => d.deviceId === this._realDeviceId))

                // If there was an associated realDeviceID and after the device change the realDeviceId is undefined
                // then the associated device has been disconnected and the _trackEnded flag needs to be set. In
                // addition on some Chrome versions the readyState property is set after the device change event is
                // triggered which causes issues in jitsi-meet with the selection of a new device because we don't
                // detect that the old one was removed.
                || (typeof oldRealDeviceId !== 'undefined' && typeof this._realDeviceId === 'undefined')
            ) {
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
     * Get the duration of the track.
     *
     * @returns {Number} the duration of the track in seconds
     */
    getDuration() {
        return (Date.now() / 1000) - (this.metadata.timestamp / 1000);
    }

    /**
     * Returns if associated MediaStreamTrack is in the 'ended' state
     *
     * @returns {boolean}
     */
    isEnded() {
        if (this.isVideoTrack() && this.isMuted()) {
            // If a video track is muted the readyState will be ended, that's why we need to rely only on the
            // _trackEnded flag.
            return this._trackEnded;
        }

        return this.getTrack().readyState === 'ended' || this._trackEnded;
    }

    /**
     * Sets handlers to the MediaStreamTrack object that will detect camera
     * issues.
     */
    _initNoDataFromSourceHandlers() {
        if (!this._isNoDataFromSourceEventsEnabled()) {
            return;
        }

        this._setHandler('track_mute', () => {
            this._trackMutedTS = window.performance.now();
            this._fireNoDataFromSourceEvent();
        });

        this._setHandler('track_unmute', () => {
            this._fireNoDataFromSourceEvent();
            Statistics.sendAnalyticsAndLog(
                TRACK_UNMUTED,
                {
                    'media_type': this.getType(),
                    'track_type': 'local',
                    value: window.performance.now() - this._trackMutedTS
                });
        });

        if (this.isVideoTrack() && this.videoType === VideoType.CAMERA) {
            this._setHandler('track_ended', () => {
                if (!this.isReceivingData()) {
                    this._fireNoDataFromSourceEvent();
                }
            });
        }
    }

    /**
     * Returns true if no data from source events are enabled for this JitsiLocalTrack and false otherwise.
     *
     * @returns {boolean} - True if no data from source events are enabled for this JitsiLocalTrack and false otherwise.
     */
    _isNoDataFromSourceEventsEnabled() {
        // Disable the events for screen sharing.
        return !this.isVideoTrack() || this.videoType !== VideoType.DESKTOP;
    }

    /**
     * Fires NO_DATA_FROM_SOURCE event and logs it to analytics and callstats.
     */
    _fireNoDataFromSourceEvent() {
        const value = !this.isReceivingData();

        this.emit(NO_DATA_FROM_SOURCE, value);

        // FIXME: Should we report all of those events
        Statistics.sendAnalytics(createNoDataFromSourceEvent(this.getType(), value));
        Statistics.sendLog(JSON.stringify({
            name: NO_DATA_FROM_SOURCE,
            log: value
        }));
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
        } else {
            this._realDeviceId = undefined;
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
     * Starts the effect process and returns the modified stream.
     *
     * @private
     * @param {*} effect - Represents effect instance
     * @returns {void}
     */
    _startStreamEffect(effect) {
        this._streamEffect = effect;
        this._originalStream = this.stream;
        this._setStream(this._streamEffect.startEffect(this._originalStream));
        this.track = this.stream.getTracks()[0];
    }

    /**
     * Stops the effect process and returns the original stream.
     *
     * @private
     * @returns {void}
     */
    _stopStreamEffect() {
        if (this._streamEffect) {
            this._streamEffect.stopEffect();
            this._setStream(this._originalStream);
            this._originalStream = null;
            this.track = this.stream ? this.stream.getTracks()[0] : null;
        }
    }

    /**
     * Stops the currently used effect (if there is one) and starts the passed effect (if there is one).
     *
     * @param {Object|undefined} effect - The new effect to be set.
     */
    _switchStreamEffect(effect) {
        if (this._streamEffect) {
            this._stopStreamEffect();
            this._streamEffect = undefined;
        }
        if (effect) {
            this._startStreamEffect(effect);
        }
    }

    /**
     * Sets the effect and switches between the modified stream and original one.
     *
     * @param {Object} effect - Represents the effect instance to be used.
     * @returns {Promise}
     */
    setEffect(effect) {
        if (typeof this._streamEffect === 'undefined' && typeof effect === 'undefined') {
            return Promise.resolve();
        }

        if (typeof effect !== 'undefined' && !effect.isEnabled(this)) {
            return Promise.reject(new Error('Incompatible effect instance!'));
        }

        if (this._setEffectInProgress === true) {
            return Promise.reject(new Error('setEffect already in progress!'));
        }

        // In case we have an audio track that is being enhanced with an effect, we still want it to be applied,
        // even if the track is muted. Where as for video the actual track doesn't exists if it's muted.
        if (this.isMuted() && !this.isAudioTrack()) {
            this._streamEffect = effect;

            return Promise.resolve();
        }

        const conference = this.conference;

        if (!conference) {
            this._switchStreamEffect(effect);
            if (this.isVideoTrack()) {
                this.containers.forEach(cont => RTCUtils.attachMediaStream(cont, this.stream));
            }

            return Promise.resolve();
        }

        this._setEffectInProgress = true;

        // TODO: Create new JingleSessionPC method for replacing a stream in JitsiLocalTrack without offer answer.
        return conference.removeTrack(this)
            .then(() => {
                this._switchStreamEffect(effect);
                if (this.isVideoTrack()) {
                    this.containers.forEach(cont => RTCUtils.attachMediaStream(cont, this.stream));
                }

                return conference.addTrack(this);
            })
            .then(() => {
                this._setEffectInProgress = false;
            })
            .catch(error => {
                // Any error will be not recovarable and will trigger CONFERENCE_FAILED event. But let's try to cleanup
                // everyhting related to the effect functionality.
                this._setEffectInProgress = false;
                this._switchStreamEffect();
                logger.error('Failed to switch to the new stream!', error);
                throw error;
            });
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

            // If we have a stream effect that implements its own mute functionality, prioritize it before
            // normal mute e.g. the stream effect that implements system audio sharing has a custom
            // mute state in which if the user mutes, system audio still has to go through.
            if (this._streamEffect && this._streamEffect.setMuted) {
                this._streamEffect.setMuted(muted);
            } else if (this.track) {
                this.track.enabled = !muted;
            }
        } else if (muted) {
            promise = new Promise((resolve, reject) => {
                logMuteInfo();
                this._removeStreamFromConferenceAsMute(
                    () => {
                        if (this._streamEffect) {
                            this._stopStreamEffect();
                        }

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
                effects: this._streamEffect ? [ this._streamEffect ] : [],
                facingMode: this.getCameraFacingMode()
            };

            promise
                = RTCUtils.obtainAudioAndVideoPermissions(Object.assign(
                    {},
                    streamOptions,
                    { constraints: { video: this._constraints } }));

            promise = promise.then(streamsInfo => {
                // The track kind for presenter track is video as well.
                const mediaType = this.getType() === MediaType.PRESENTER ? MediaType.VIDEO : this.getType();
                const streamInfo = streamsInfo.find(info => info.track.kind === mediaType);

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

                if (this._streamEffect) {
                    this._startStreamEffect(this._streamEffect);
                }

                this.containers.map(
                    cont => RTCUtils.attachMediaStream(cont, this.stream));

                return this._addStreamToConferenceAsUnmute();
            });
        }

        return promise
            .then(() => {
                this._sendMuteStatus(muted);
                this.emit(TRACK_MUTE_CHANGED, this);
            });
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
     * @returns {void}
     */
    _sendMuteStatus(mute) {
        if (this.conference) {
            this.conference._setTrackMuteStatus(this, mute) && this.conference.room.sendPresence();
        }
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

        // Remove the effect instead of stopping it so that the original stream is restored
        // on both the local track and on the peerconnection.
        if (this._streamEffect) {
            promise = this.setEffect();
        }

        if (this.conference) {
            promise = promise.then(() => this.conference.removeTrack(this));
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

        // If currently used stream effect has its own muted state, use that.
        if (this._streamEffect && this._streamEffect.isMuted) {
            return this._streamEffect.isMuted();
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
                        ${bytesSent}`);

                    Statistics.analytics.sendEvent(NO_BYTES_SENT, { 'media_type': this.getType() });
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
            const trackSettings = this.track.getSettings?.();

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
    isReceivingData() {
        if (this.isVideoTrack()
            && (this.isMuted() || this._stopStreamInProgress || this.videoType === VideoType.DESKTOP)) {
            return true;
        }

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

        // For video blur enabled use the original video stream
        const stream = this._effectEnabled ? this._originalStream : this.stream;

        return stream.getTracks().some(track =>
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
