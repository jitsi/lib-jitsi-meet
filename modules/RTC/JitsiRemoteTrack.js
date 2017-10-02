import JitsiTrack from './JitsiTrack';
import * as JitsiTrackEvents from '../../JitsiTrackEvents';
import RTCBrowserType from './RTCBrowserType';
import Statistics from '../statistics/statistics';

const logger = require('jitsi-meet-logger').getLogger(__filename);
const RTCEvents = require('../../service/RTC/RTCEvents');

let ttfmTrackerAudioAttached = false;
let ttfmTrackerVideoAttached = false;

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
            isP2P) {
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

        // we want to mark whether the track has been ever muted
        // to detect ttfm events for startmuted conferences, as it can
        // significantly increase ttfm values
        this.hasBeenMuted = muted;

        // Bind 'onmute' and 'onunmute' event handlers
        if (this.rtc && this.track) {
            this._bindMuteHandlers();
        }
    }

    /* eslint-enable max-params */
    /**
     * Attaches the track muted handlers.
     *
     * @returns {void}
     */
    _bindMuteHandlers() {
        // Use feature detection for finding what event handling function is
        // supported. On Internet Explorer, which uses uses temasys/firebreath,
        // the track will have attachEvent instead of addEventListener.
        //
        // FIXME it would be better to use recently added '_setHandler' method,
        // but:
        // 1. It does not allow to set more than one handler to the event
        // 2. It does mix MediaStream('inactive') with MediaStreamTrack events
        // 3. Allowing to bind more than one event handler requires too much
        //    refactoring around camera issues detection.
        if (this.track.addEventListener) {
            this.track.addEventListener('mute', () => this._onTrackMute());
            this.track.addEventListener('unmute', () => this._onTrackUnmute());
        } else if (this.track.attachEvent) {
            // FIXME Internet Explorer is not emitting out mute/unmute events.
            this.track.attachEvent('onmute', () => this._onTrackMute());
            this.track.attachEvent('onunmute', () => this._onTrackUnmute());
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
        logger.debug(
            `"onmute" event(${Date.now()}): `,
            this.getParticipantId(), this.getType(), this.getSSRC());

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
        logger.debug(
            `"onunmute" event(${Date.now()}): `,
            this.getParticipantId(), this.getType(), this.getSSRC());

        this.rtc.eventEmitter.emit(RTCEvents.REMOTE_TRACK_UNMUTE, this);
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

        const ttfm = now
            - (this.conference.getConnectionTimes()['session.initiate']
            - this.conference.getConnectionTimes()['muc.joined'])
            - gumDuration;

        this.conference.getConnectionTimes()[`${type}.ttfm`] = ttfm;
        console.log(`(TIME) TTFM ${type}:\t`, ttfm);
        let eventName = `${type}.ttfm`;

        if (this.hasBeenMuted) {
            eventName += '.muted';
        }
        Statistics.analytics.sendEvent(eventName, { value: ttfm });
    }

    /**
     * Attach time to first media tracker only if there is conference and only
     * for the first element.
     * @param container the HTML container which can be 'video' or 'audio'
     * element. It can also be 'object' element if Temasys plugin is in use and
     * this method has been called previously on video or audio HTML element.
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

        if (RTCBrowserType.isTemasysPluginUsed()) {
            // XXX Don't require Temasys unless it's to be used because it
            // doesn't run on React Native, for example.
            const AdapterJS = require('./adapter.screenshare');

            // FIXME: this is not working for IE11
            AdapterJS.addEvent(
                container,
                'play',
                this._playCallback.bind(this));
        } else {
            container.addEventListener(
                'canplay',
                this._playCallback.bind(this));
        }
    }

    /**
     * Creates a text representation of this remote track instance.
     * @return {string}
     */
    toString() {
        return `RemoteTrack[${
            this.ownerEndpointId}, ${
            this.getType()}, p2p: ${
            this.isP2P}]`;
    }
}
