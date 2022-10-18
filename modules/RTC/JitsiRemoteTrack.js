import * as JitsiTrackEvents from '../../JitsiTrackEvents';
import { createTtfmEvent } from '../../service/statistics/AnalyticsEvents';
import TrackStreamingStatusImpl, { TrackStreamingStatus } from '../connectivity/TrackStreamingStatus';
import FeatureFlags from '../flags/FeatureFlags';
import Statistics from '../statistics/statistics';

import JitsiTrack from './JitsiTrack';

const logger = require('@jitsi/logger').getLogger(__filename);

const RTCEvents = require('../../service/RTC/RTCEvents');

let ttfmTrackerAudioAttached = false;
let ttfmTrackerVideoAttached = false;

/**
 * List of container events that we are going to process. _onContainerEventHandler will be added as listener to the
 * container for every event in the list.
 */
const containerEvents = [ 'abort', 'canplaythrough', 'ended', 'error' ];

/* eslint-disable max-params */

/**
 * Represents a single media track (either audio or video).
 */
export default class JitsiRemoteTrack extends JitsiTrack {
    /**
     * Creates new JitsiRemoteTrack instance.
     * @param {RTC} rtc the RTC service instance.
     * @param {JitsiConference} conference the conference to which this track
     *        belongs to
     * @param {string} ownerEndpointId the endpoint ID of the track owner
     * @param {MediaStream} stream WebRTC MediaStream, parent of the track
     * @param {MediaStreamTrack} track underlying WebRTC MediaStreamTrack for
     *        the new JitsiRemoteTrack
     * @param {MediaType} mediaType the type of the media
     * @param {VideoType} videoType the type of the video if applicable
     * @param {number} ssrc the SSRC number of the Media Stream
     * @param {boolean} muted the initial muted state
     * @param {boolean} isP2P indicates whether or not this track belongs to a
     * P2P session
     * @param {String} sourceName the source name signaled for the track
     * @throws {TypeError} if <tt>ssrc</tt> is not a number.
     * @constructor
     */
    constructor(
            rtc,
            conference,
            ownerEndpointId,
            stream,
            track,
            mediaType,
            videoType,
            ssrc,
            muted,
            isP2P,
            sourceName) {
        super(
            conference,
            stream,
            track,
            () => {
                // Nothing to do if the track is inactive.
            },
            mediaType,
            videoType);
        this.rtc = rtc;

        // Prevent from mixing up type of SSRC which should be a number
        if (typeof ssrc !== 'number') {
            throw new TypeError(`SSRC ${ssrc} is not a number`);
        }
        this.ssrc = ssrc;
        this.ownerEndpointId = ownerEndpointId;
        this.muted = muted;
        this.isP2P = isP2P;
        this._sourceName = sourceName;
        this._trackStreamingStatus = null;
        this._trackStreamingStatusImpl = null;

        /**
         * This holds the timestamp indicating when remote video track entered forwarded sources set. Track entering
         * forwardedSources will have streaming status restoring and when we start receiving video will become active,
         * but if video is not received for certain time {@link DEFAULT_RESTORING_TIMEOUT} that track streaming status
         * will become interrupted.
         */
        this._enteredForwardedSourcesTimestamp = null;

        this.addEventListener = this.on = this._addEventListener.bind(this);
        this.removeEventListener = this.off = this._removeEventListener.bind(this);

        logger.debug(`New remote track added: ${this}`);

        // we want to mark whether the track has been ever muted
        // to detect ttfm events for startmuted conferences, as it can
        // significantly increase ttfm values
        this.hasBeenMuted = muted;

        // Bind 'onmute' and 'onunmute' event handlers
        if (this.rtc && this.track) {
            this._bindTrackHandlers();
        }
        this._containerHandlers = {};
        containerEvents.forEach(event => {
            this._containerHandlers[event] = this._containerEventHandler.bind(this, event);
        });
    }

    /* eslint-enable max-params */
    /**
     * Attaches the track handlers.
     *
     * @returns {void}
     */
    _bindTrackHandlers() {
        this.track.addEventListener('mute', () => this._onTrackMute());
        this.track.addEventListener('unmute', () => this._onTrackUnmute());
        this.track.addEventListener('ended', () => {
            logger.debug(`"onended" event(${Date.now()}): ${this}`);
        });
    }

    /**
     * Overrides addEventListener method to init TrackStreamingStatus instance when there are listeners for the
     * {@link JitsiTrackEvents.TRACK_STREAMING_STATUS_CHANGED} event.
     *
     * @param {string} event - event name
     * @param {function} handler - event handler
     */
    _addEventListener(event, handler) {
        super.addListener(event, handler);

        if (FeatureFlags.isSourceNameSignalingEnabled()
            && event === JitsiTrackEvents.TRACK_STREAMING_STATUS_CHANGED
            && this.listenerCount(JitsiTrackEvents.TRACK_STREAMING_STATUS_CHANGED)
            && !this._trackStreamingStatusImpl
        ) {
            this._initTrackStreamingStatus();
            logger.debug(`Initializing track streaming status: ${this._sourceName}`);
        }
    }

    /**
     * Overrides removeEventListener method to dispose TrackStreamingStatus instance.
     *
     * @param {string} event - event name
     * @param {function} handler - event handler
     */
    _removeEventListener(event, handler) {
        super.removeListener(event, handler);

        if (FeatureFlags.isSourceNameSignalingEnabled()
            && event === JitsiTrackEvents.TRACK_STREAMING_STATUS_CHANGED
            && !this.listenerCount(JitsiTrackEvents.TRACK_STREAMING_STATUS_CHANGED)
        ) {
            this._disposeTrackStreamingStatus();
            logger.debug(`Disposing track streaming status: ${this._sourceName}`);
        }
    }

    /**
     * Callback invoked when the track is muted. Emits an event notifying
     * listeners of the mute event.
     *
     * @private
     * @returns {void}
     */
    _onTrackMute() {
        logger.debug(`"onmute" event(${Date.now()}): ${this}`);

        this.rtc.eventEmitter.emit(RTCEvents.REMOTE_TRACK_MUTE, this);
    }

    /**
     * Callback invoked when the track is unmuted. Emits an event notifying
     * listeners of the mute event.
     *
     * @private
     * @returns {void}
     */
    _onTrackUnmute() {
        logger.debug(`"onunmute" event(${Date.now()}): ${this}`);

        this.rtc.eventEmitter.emit(RTCEvents.REMOTE_TRACK_UNMUTE, this);
    }

    /**
     * Removes attached event listeners and dispose TrackStreamingStatus .
     *
     * @returns {Promise}
     */
    dispose() {
        if (FeatureFlags.isSourceNameSignalingEnabled()) {
            this._disposeTrackStreamingStatus();
        }

        return super.dispose();
    }

    /**
     * Sets current muted status and fires an events for the change.
     * @param value the muted status.
     */
    setMute(value) {
        if (this.muted === value) {
            return;
        }

        if (value) {
            this.hasBeenMuted = true;
        }

        // we can have a fake video stream
        if (this.stream) {
            this.stream.muted = value;
        }

        this.muted = value;
        this.emit(JitsiTrackEvents.TRACK_MUTE_CHANGED, this);
    }

    /**
     * Returns the current muted status of the track.
     * @returns {boolean|*|JitsiRemoteTrack.muted} <tt>true</tt> if the track is
     * muted and <tt>false</tt> otherwise.
     */
    isMuted() {
        return this.muted;
    }

    /**
     * Returns the participant id which owns the track.
     *
     * @returns {string} the id of the participants. It corresponds to the
     * Colibri endpoint id/MUC nickname in case of Jitsi-meet.
     */
    getParticipantId() {
        return this.ownerEndpointId;
    }

    /**
     * Return false;
     */
    isLocal() {
        return false;
    }

    /**
     * Returns the synchronization source identifier (SSRC) of this remote
     * track.
     *
     * @returns {number} the SSRC of this remote track.
     */
    getSSRC() {
        return this.ssrc;
    }


    /**
     * Returns the tracks source name
     *
     * @returns {string} the track's source name
     */
    getSourceName() {
        return this._sourceName;
    }

    /**
     * Update the properties when the track is remapped to another source.
     *
     * @param {string} owner The endpoint ID of the new owner.
     * @param {string} name The new source name.
     */
    setNewSource(owner, name) {
        this.ownerEndpointId = owner;
        this._sourceName = name;
        this.emit(JitsiTrackEvents.TRACK_OWNER_CHANGED, owner);
    }

    /**
     * Changes the video type of the track.
     *
     * @param {string} type - The new video type("camera", "desktop").
     */
    _setVideoType(type) {
        if (this.videoType === type) {
            return;
        }
        this.videoType = type;
        this.emit(JitsiTrackEvents.TRACK_VIDEOTYPE_CHANGED, type);
    }

    /**
     * Handles track play events.
     */
    _playCallback() {
        if (!this.conference.room) {
            return;
        }

        const type = this.isVideoTrack() ? 'video' : 'audio';

        const now = window.performance.now();

        console.log(`(TIME) Render ${type}:\t`, now);
        this.conference.getConnectionTimes()[`${type}.render`] = now;

        // The conference can be started without calling GUM
        // FIXME if there would be a module for connection times this kind
        // of logic (gumDuration or ttfm) should end up there
        const gumStart = window.connectionTimes['obtainPermissions.start'];
        const gumEnd = window.connectionTimes['obtainPermissions.end'];
        const gumDuration
            = !isNaN(gumEnd) && !isNaN(gumStart) ? gumEnd - gumStart : 0;

        // Subtract the muc.joined-to-session-initiate duration because jicofo
        // waits until there are 2 participants to start Jingle sessions.
        const ttfm = now
            - (this.conference.getConnectionTimes()['session.initiate']
                - this.conference.getConnectionTimes()['muc.joined'])
            - gumDuration;

        this.conference.getConnectionTimes()[`${type}.ttfm`] = ttfm;
        console.log(`(TIME) TTFM ${type}:\t`, ttfm);

        Statistics.sendAnalytics(createTtfmEvent(
            {
                'media_type': type,
                muted: this.hasBeenMuted,
                value: ttfm
            }));

    }

    /**
     * Attach time to first media tracker only if there is conference and only
     * for the first element.
     * @param container the HTML container which can be 'video' or 'audio'
     * element.
     * @private
     */
    _attachTTFMTracker(container) {
        if ((ttfmTrackerAudioAttached && this.isAudioTrack())
            || (ttfmTrackerVideoAttached && this.isVideoTrack())) {
            return;
        }

        if (this.isAudioTrack()) {
            ttfmTrackerAudioAttached = true;
        }
        if (this.isVideoTrack()) {
            ttfmTrackerVideoAttached = true;
        }

        container.addEventListener('canplay', this._playCallback.bind(this));
    }

    /**
     * Called when the track has been attached to a new container.
     *
     * @param {HTMLElement} container the HTML container which can be 'video' or 'audio' element.
     * @private
     */
    _onTrackAttach(container) {
        containerEvents.forEach(event => {
            container.addEventListener(event, this._containerHandlers[event]);
        });
    }

    /**
     * Called when the track has been detached from a container.
     *
     * @param {HTMLElement} container the HTML container which can be 'video' or 'audio' element.
     * @private
     */
    _onTrackDetach(container) {
        containerEvents.forEach(event => {
            container.removeEventListener(event, this._containerHandlers[event]);
        });
    }

    /**
     * An event handler for events triggered by the attached container.
     *
     * @param {string} type - The type of the event.
     */
    _containerEventHandler(type) {
        logger.debug(`${type} handler was called for a container with attached ${this}`);
    }

    /**
     * Returns a string with a description of the current status of the track.
     *
     * @returns {string}
     */
    _getStatus() {
        const { enabled, muted, readyState } = this.track;

        return `readyState: ${readyState}, muted: ${muted}, enabled: ${enabled}`;
    }

    /**
     * Initializes trackStreamingStatusImpl.
     */
    _initTrackStreamingStatus() {
        const config = this.conference.options.config;

        this._trackStreamingStatus = TrackStreamingStatus.ACTIVE;

        this._trackStreamingStatusImpl = new TrackStreamingStatusImpl(
            this.rtc,
            this.conference,
            this,
            {
                // These options are not public API, leaving it here only as an entry point through config for
                // tuning up purposes. Default values should be adjusted as soon as optimal values are discovered.
                p2pRtcMuteTimeout: config._p2pConnStatusRtcMuteTimeout,
                rtcMuteTimeout: config._peerConnStatusRtcMuteTimeout,
                outOfForwardedSourcesTimeout: config._peerConnStatusOutOfLastNTimeout
            });

        this._trackStreamingStatusImpl.init();

        // In some edge cases, both browser 'unmute' and bridge's forwarded sources events are received before a
        // LargeVideoUpdate is scheduled for auto-pinning a new screenshare track. If there are no layout changes and
        // no further track events are received for the SS track, a black tile will be displayed for screenshare on
        // stage. Fire a TRACK_STREAMING_STATUS_CHANGED event if the media is already being received for the remote
        // track to prevent this from happening.
        !this._trackStreamingStatusImpl.isVideoTrackFrozen()
            && this.rtc.eventEmitter.emit(
                JitsiTrackEvents.TRACK_STREAMING_STATUS_CHANGED,
                this,
                this._trackStreamingStatus);
    }

    /**
     * Disposes trackStreamingStatusImpl and clears trackStreamingStatus.
     */
    _disposeTrackStreamingStatus() {
        if (this._trackStreamingStatusImpl) {
            this._trackStreamingStatusImpl.dispose();
            this._trackStreamingStatusImpl = null;
            this._trackStreamingStatus = null;
        }
    }

    /**
     * Updates track's streaming status.
     *
     * @param {string} state the current track streaming state. {@link TrackStreamingStatus}.
     */
    _setTrackStreamingStatus(status) {
        this._trackStreamingStatus = status;
    }

    /**
     * Returns track's streaming status.
     *
     * @returns {string} the streaming status <tt>TrackStreamingStatus</tt> of the track. Returns null
     * if trackStreamingStatusImpl hasn't been initialized.
     *
     * {@link TrackStreamingStatus}.
     */
    getTrackStreamingStatus() {
        return this._trackStreamingStatus;
    }

    /**
     * Clears the timestamp of when the track entered forwarded sources.
     */
    _clearEnteredForwardedSourcesTimestamp() {
        this._enteredForwardedSourcesTimestamp = null;
    }

    /**
     * Updates the timestamp of when the track entered forwarded sources.
     *
     * @param {number} timestamp the time in millis
     */
    _setEnteredForwardedSourcesTimestamp(timestamp) {
        this._enteredForwardedSourcesTimestamp = timestamp;
    }

    /**
     * Returns the timestamp of when the track entered forwarded sources.
     *
     * @returns {number} the time in millis
     */
    _getEnteredForwardedSourcesTimestamp() {
        return this._enteredForwardedSourcesTimestamp;
    }

    /**
     * Creates a text representation of this remote track instance.
     * @return {string}
     */
    toString() {
        return `RemoteTrack[userID: ${this.getParticipantId()}, type: ${this.getType()}, ssrc: ${
            this.getSSRC()}, p2p: ${this.isP2P}, sourceName: ${this._sourceName}, status: {${this._getStatus()}}]`;
    }
}
