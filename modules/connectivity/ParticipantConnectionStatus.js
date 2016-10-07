/* global __filename, module, require */
var logger = require('jitsi-meet-logger').getLogger(__filename);
var MediaType = require('../../service/RTC/MediaType');
var RTCBrowserType = require('../RTC/RTCBrowserType');
var RTCEvents = require('../../service/RTC/RTCEvents');

import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import * as JitsiTrackEvents from '../../JitsiTrackEvents';
import Statistics from '../statistics/statistics';

/**
 * Default value of 2000 milliseconds for
 * {@link ParticipantConnectionStatus.rtcMuteTimeout}.
 *
 * @type {number}
 */
const DEFAULT_RTC_MUTE_TIMEOUT = 2000;

/**
 * Class is responsible for emitting
 * JitsiConferenceEvents.PARTICIPANT_CONN_STATUS_CHANGED events.
 *
 * @constructor
 * @param {RTC} rtc the RTC service instance
 * @param {JitsiConference} conference parent conference instance
 * @param {number} rtcMuteTimeout (optional) custom value for
 * {@link ParticipantConnectionStatus.rtcMuteTimeout}.
 */
function ParticipantConnectionStatus(rtc, conference, rtcMuteTimeout) {
    this.rtc = rtc;
    this.conference = conference;
    /**
     * A map of the "endpoint ID"(which corresponds to the resource part of MUC
     * JID(nickname)) to the timeout callback IDs scheduled using
     * window.setTimeout.
     * @type {Object.<string, number>}
     */
    this.trackTimers = {};
    /**
     * How long we're going to wait after the RTC video track muted event for
     * the corresponding signalling mute event, before the connection
     * interrupted is fired. The default value is
     * {@link DEFAULT_RTC_MUTE_TIMEOUT}.
     *
     * @type {number} amount of time in milliseconds
     */
    this.rtcMuteTimeout
        = typeof rtcMuteTimeout === 'number'
            ? rtcMuteTimeout : DEFAULT_RTC_MUTE_TIMEOUT;
    logger.info("RtcMuteTimeout set to: " + this.rtcMuteTimeout);
}

/**
 * Initializes <tt>ParticipantConnectionStatus</tt> and bind required event
 * listeners.
 */
ParticipantConnectionStatus.prototype.init = function() {

    this._onEndpointConnStatusChanged
        = this.onEndpointConnStatusChanged.bind(this);

    this.rtc.addListener(
        RTCEvents.ENDPOINT_CONN_STATUS_CHANGED,
        this._onEndpointConnStatusChanged);

    // On some browsers MediaStreamTrack trigger "onmute"/"onunmute"
    // events for video type tracks when they stop receiving data which is
    // often a sign that remote user is having connectivity issues
    if (RTCBrowserType.isVideoMuteOnConnInterruptedSupported()) {

        this._onTrackRtcMuted = this.onTrackRtcMuted.bind(this);
        this.rtc.addListener(
            RTCEvents.REMOTE_TRACK_MUTE, this._onTrackRtcMuted);

        this._onTrackRtcUnmuted = this.onTrackRtcUnmuted.bind(this);
        this.rtc.addListener(
            RTCEvents.REMOTE_TRACK_UNMUTE, this._onTrackRtcUnmuted);

        // Track added/removed listeners are used to bind "mute"/"unmute"
        // event handlers
        this._onRemoteTrackAdded = this.onRemoteTrackAdded.bind(this);
        this.conference.on(
            JitsiConferenceEvents.TRACK_ADDED, this._onRemoteTrackAdded);
        this._onRemoteTrackRemoved = this.onRemoteTrackRemoved.bind(this);
        this.conference.on(
            JitsiConferenceEvents.TRACK_REMOVED, this._onRemoteTrackRemoved);

        // Listened which will be bound to JitsiRemoteTrack to listen for
        // signalling mute/unmute events.
        this._onSignallingMuteChanged = this.onSignallingMuteChanged.bind(this);
    }
};

/**
 * Removes all event listeners and disposes of all resources held by this
 * instance.
 */
ParticipantConnectionStatus.prototype.dispose = function () {

    this.rtc.removeListener(
        RTCEvents.ENDPOINT_CONN_STATUS_CHANGED,
        this._onEndpointConnStatusChanged);

    if (RTCBrowserType.isVideoMuteOnConnInterruptedSupported()) {
        this.rtc.removeListener(
            RTCEvents.REMOTE_TRACK_MUTE, this._onTrackRtcMuted);
        this.rtc.removeListener(
            RTCEvents.REMOTE_TRACK_UNMUTE, this._onTrackRtcUnmuted);
        this.conference.off(
            JitsiConferenceEvents.TRACK_ADDED, this._onRemoteTrackAdded);
        this.conference.off(
            JitsiConferenceEvents.TRACK_REMOVED, this._onRemoteTrackRemoved);
    }

    Object.keys(this.trackTimers).forEach(function (participantId) {
        this.clearTimeout(participantId);
    }.bind(this));
};

/**
 * Handles RTCEvents.ENDPOINT_CONN_STATUS_CHANGED triggered when we receive
 * notification over the data channel from the bridge about endpoint's
 * connection status update.
 * @param endpointId {string} the endpoint ID(MUC nickname/resource JID)
 * @param isActive {boolean} true if the connection is OK or false otherwise
 */
ParticipantConnectionStatus.prototype.onEndpointConnStatusChanged
= function(endpointId, isActive) {

    logger.debug(
        'Detector RTCEvents.ENDPOINT_CONN_STATUS_CHANGED('
            + Date.now() +'): ' + endpointId + ': ' + isActive);

    // Filter out events for the local JID for now
    if (endpointId !== this.conference.myUserId()) {
        var participant = this.conference.getParticipantById(endpointId);
        // Delay the 'active' event until the video track gets RTC unmuted event
        if (isActive
                && RTCBrowserType.isVideoMuteOnConnInterruptedSupported()
                && participant
                && participant.hasAnyVideoTrackWebRTCMuted()
                && !participant.isVideoMuted()) {
            logger.debug(
                'Ignoring RTCEvents.ENDPOINT_CONN_STATUS_CHANGED -'
                    + ' will wait for unmute event');
        } else {
            this._changeConnectionStatus(endpointId, isActive);
        }
    }
};

ParticipantConnectionStatus.prototype._changeConnectionStatus
= function (endpointId, newStatus) {
    var participant = this.conference.getParticipantById(endpointId);
    if (!participant) {
        // This will happen when participant exits the conference with broken
        // ICE connection and we join after that. The bridge keeps sending
        // that notification until the conference does not expire.
        logger.warn(
            'Missed participant connection status update - ' +
                'no participant for endpoint: ' + endpointId);
        return;
    }
    if (participant.isConnectionActive() !== newStatus) {

        participant._setIsConnectionActive(newStatus);

        logger.debug(
            'Emit endpoint conn status(' + Date.now() + '): ',
            endpointId, newStatus);

        // Log the event on CallStats
        Statistics.sendLog(
            JSON.stringify({
                id: 'peer.conn.status',
                participant: endpointId,
                status: newStatus
            }));

        // and analytics
        Statistics.analytics.sendEvent('peer.conn.status',
            {label: newStatus});

        this.conference.eventEmitter.emit(
            JitsiConferenceEvents.PARTICIPANT_CONN_STATUS_CHANGED,
            endpointId, newStatus);
    }
};

/**
 * Reset the postponed "connection interrupted" event which was previously
 * scheduled as a timeout on RTC 'onmute' event.
 *
 * @param participantId the participant for which the "connection interrupted"
 * timeout was scheduled
 */
ParticipantConnectionStatus.prototype.clearTimeout = function (participantId) {
    if (this.trackTimers[participantId]) {
        window.clearTimeout(this.trackTimers[participantId]);
        this.trackTimers[participantId] = null;
    }
};

/**
 * Bind signalling mute event listeners for video {JitsiRemoteTrack} when
 * a new one is added to the conference.
 *
 * @param {JitsiTrack} remoteTrack the {JitsiTrack} which is being added to
 * the conference.
 */
ParticipantConnectionStatus.prototype.onRemoteTrackAdded
= function(remoteTrack) {
    if (!remoteTrack.isLocal() && remoteTrack.getType() === MediaType.VIDEO) {

        logger.debug(
            'Detector on remote track added: ', remoteTrack.getParticipantId());

        remoteTrack.on(
            JitsiTrackEvents.TRACK_MUTE_CHANGED,
            this._onSignallingMuteChanged);
    }
};

/**
 * Removes all event listeners bound to the remote video track and clears any
 * related timeouts.
 *
 * @param {JitsiRemoteTrack} remoteTrack the remote track which is being removed
 * from the conference.
 */
ParticipantConnectionStatus.prototype.onRemoteTrackRemoved
= function(remoteTrack) {
    if (!remoteTrack.isLocal() && remoteTrack.getType() === MediaType.VIDEO) {
        logger.debug(
            'Detector on remote track removed: ',
            remoteTrack.getParticipantId());
        remoteTrack.off(
            JitsiTrackEvents.TRACK_MUTE_CHANGED,
            this._onSignallingMuteChanged);
        this.clearTimeout(remoteTrack.getParticipantId());
    }
};

/**
 * Handles RTC 'onmute' event for the video track.
 *
 * @param {JitsiRemoteTrack} track the video track for which 'onmute' event will
 * be processed.
 */
ParticipantConnectionStatus.prototype.onTrackRtcMuted = function(track) {
    var participantId = track.getParticipantId();
    var participant = this.conference.getParticipantById(participantId);
    logger.debug('Detector track RTC muted: ', participantId);
    if (!participant) {
        logger.error('No participant for id: ' + participantId);
        return;
    }
    if (!participant.isVideoMuted()) {
        // If the user is not muted according to the signalling we'll give it
        // some time, before the connection interrupted event is triggered.
        this.trackTimers[participantId] = window.setTimeout(function () {
            if (!track.isMuted() && participant.isConnectionActive()) {
                logger.info(
                    'Connection interrupted through the RTC mute: '
                        + participantId, Date.now());
                this._changeConnectionStatus(participantId, false);
            }
            this.clearTimeout(participantId);
        }.bind(this), this.rtcMuteTimeout);
    }
};

/**
 * Handles RTC 'onunmute' event for the video track.
 *
 * @param {JitsiRemoteTrack} track the video track for which 'onunmute' event
 * will be processed.
 */
ParticipantConnectionStatus.prototype.onTrackRtcUnmuted = function(track) {
    logger.debug('Detector track RTC unmuted: ', track);
    var participantId = track.getParticipantId();
    if (!track.isMuted() &&
        !this.conference.getParticipantById(participantId)
            .isConnectionActive()) {
        logger.info(
            'Detector connection restored through the RTC unmute: '
                + participantId, Date.now());
        this._changeConnectionStatus(participantId, true);
    }
    this.clearTimeout(participantId);
};

/**
 * Here the signalling "mute"/"unmute" events are processed.
 *
 * @param {JitsiRemoteTrack} track the remote video track for which
 * the signalling mute/unmute event will be processed.
 */
ParticipantConnectionStatus.prototype.onSignallingMuteChanged
= function (track) {
    logger.debug(
        'Detector on track signalling mute changed: ', track, track.isMuted());
    var isMuted = track.isMuted();
    var participantId = track.getParticipantId();
    var participant = this.conference.getParticipantById(participantId);
    if (!participant) {
        logger.error('No participant for id: ' + participantId);
        return;
    }
    var isConnectionActive = participant.isConnectionActive();
    if (isMuted && isConnectionActive && this.trackTimers[participantId]) {
        logger.debug(
            'Signalling got in sync - cancelling task for: ' + participantId);
        this.clearTimeout(participantId);
    }
};

module.exports = ParticipantConnectionStatus;
