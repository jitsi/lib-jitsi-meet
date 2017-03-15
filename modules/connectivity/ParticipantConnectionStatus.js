/* global __filename */
import { getLogger } from 'jitsi-meet-logger';
import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import * as JitsiTrackEvents from '../../JitsiTrackEvents';
import * as MediaType from '../../service/RTC/MediaType';
import RTCBrowserType from '../RTC/RTCBrowserType';
import RTCEvents from '../../service/RTC/RTCEvents';
import Statistics from '../statistics/statistics';

const logger = getLogger(__filename);

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
 */
export default class ParticipantConnectionStatus {
    /**
     * Creates new instance of <tt>ParticipantConnectionStatus</tt>.
     *
     * @constructor
     * @param {RTC} rtc the RTC service instance
     * @param {JitsiConference} conference parent conference instance
     * @param {number} rtcMuteTimeout (optional) custom value for
     * {@link ParticipantConnectionStatus.rtcMuteTimeout}.
     */
    constructor(rtc, conference, rtcMuteTimeout) {
        this.rtc = rtc;
        this.conference = conference;

        /**
         * A map of the "endpoint ID"(which corresponds to the resource part
         * of MUC JID(nickname)) to the timeout callback IDs scheduled using
         * window.setTimeout.
         * @type {Object.<string, number>}
         */
        this.trackTimers = {};

        /**
         * This map holds the endpoint connection status received from the JVB
         * (as it might be different than the one stored in JitsiParticipant).
         * Required for getting back in sync when remote video track is removed.
         * @type {Object.<string, boolean>}
         */
        this.connStatusFromJvb = { };

        /**
         * How long we're going to wait after the RTC video track muted event
         * for the corresponding signalling mute event, before the connection
         * interrupted is fired. The default value is
         * {@link DEFAULT_RTC_MUTE_TIMEOUT}.
         *
         * @type {number} amount of time in milliseconds
         */
        this.rtcMuteTimeout
            = typeof rtcMuteTimeout === 'number'
                ? rtcMuteTimeout : DEFAULT_RTC_MUTE_TIMEOUT;

        /**
         * This map holds a timestamp indicating  when participant's video track
         * was RTC muted (it is assumed that each participant can have only 1
         * video track at a time). The purpose of storing the timestamp is to
         * avoid the transition to disconnected status in case of legitimate
         * video mute operation where the signalling video muted event can
         * arrive shortly after RTC muted event.
         *
         * The key is participant's ID which is the same as endpoint id in
         * the Colibri conference allocated on the JVB.
         *
         * The value is a timestamp measured in milliseconds obtained with
         * <tt>Date.now()</tt>.
         *
         * FIXME merge this logic with NO_DATA_FROM_SOURCE event
         *       implemented in JitsiLocalTrack by extending the event to
         *       the remote track and allowing to set different timeout for
         *       local and remote tracks.
         *
         * @type {Object.<string, number>}
         */
        this.rtcMutedTimestamp = { };
        logger.info(`RtcMuteTimeout set to: ${this.rtcMuteTimeout}`);
    }

    /**
     * Initializes <tt>ParticipantConnectionStatus</tt> and bind required event
     * listeners.
     */
    init() {

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
                JitsiConferenceEvents.TRACK_ADDED,
                this._onRemoteTrackAdded);

            this._onRemoteTrackRemoved = this.onRemoteTrackRemoved.bind(this);
            this.conference.on(
                JitsiConferenceEvents.TRACK_REMOVED,
                this._onRemoteTrackRemoved);

            // Listened which will be bound to JitsiRemoteTrack to listen for
            // signalling mute/unmute events.
            this._onSignallingMuteChanged
                = this.onSignallingMuteChanged.bind(this);
        }
    }

    /**
     * Removes all event listeners and disposes of all resources held by this
     * instance.
     */
    dispose() {

        this.rtc.removeListener(
            RTCEvents.ENDPOINT_CONN_STATUS_CHANGED,
            this._onEndpointConnStatusChanged);

        if (RTCBrowserType.isVideoMuteOnConnInterruptedSupported()) {
            this.rtc.removeListener(
                RTCEvents.REMOTE_TRACK_MUTE,
                this._onTrackRtcMuted);
            this.rtc.removeListener(
                RTCEvents.REMOTE_TRACK_UNMUTE,
                this._onTrackRtcUnmuted);

            this.conference.off(
                JitsiConferenceEvents.TRACK_ADDED,
                this._onRemoteTrackAdded);
            this.conference.off(
                JitsiConferenceEvents.TRACK_REMOVED,
                this._onRemoteTrackRemoved);
        }

        Object.keys(this.trackTimers).forEach(participantId => {
            this.clearTimeout(participantId);
            this.clearRtcMutedTimestamp(participantId);
        });

        // Clear RTC connection status cache
        this.connStatusFromJvb = {};
    }

    /**
     * Handles RTCEvents.ENDPOINT_CONN_STATUS_CHANGED triggered when we receive
     * notification over the data channel from the bridge about endpoint's
     * connection status update.
     * @param endpointId {string} the endpoint ID(MUC nickname/resource JID)
     * @param isActive {boolean} true if the connection is OK or false otherwise
     */
    onEndpointConnStatusChanged(endpointId, isActive) {

        logger.debug(
            `Detector RTCEvents.ENDPOINT_CONN_STATUS_CHANGED(${Date.now()}): ${
                endpointId}: ${isActive}`);

        // Filter out events for the local JID for now
        if (endpointId !== this.conference.myUserId()) {
            // Store the status received over the data channels
            this.connStatusFromJvb[endpointId] = isActive;
            this.figureOutConnectionStatus(endpointId);
        }
    }

    /**
     *
     * @param participant
     * @param newStatus
     */
    _changeConnectionStatus(participant, newStatus) {
        if (participant.isConnectionActive() !== newStatus) {

            const endpointId = participant.getId();

            participant._setIsConnectionActive(newStatus);

            logger.debug(
                `Emit endpoint conn status(${Date.now()}) ${endpointId}: ${
                    newStatus}`);

            // Log the event on CallStats
            Statistics.sendLog(
                JSON.stringify({
                    id: 'peer.conn.status',
                    participant: endpointId,
                    status: newStatus
                }));

            // and analytics
            Statistics.analytics.sendEvent('peer.conn.status',
                { label: newStatus });

            this.conference.eventEmitter.emit(
                JitsiConferenceEvents.PARTICIPANT_CONN_STATUS_CHANGED,
                endpointId, newStatus);
        }
    }

    /**
     * Reset the postponed "connection interrupted" event which was previously
     * scheduled as a timeout on RTC 'onmute' event.
     *
     * @param participantId the participant for which the "connection
     * interrupted" timeout was scheduled
     */
    clearTimeout(participantId) {
        if (this.trackTimers[participantId]) {
            window.clearTimeout(this.trackTimers[participantId]);
            this.trackTimers[participantId] = null;
        }
    }

    /**
     * Clears the timestamp of the RTC muted event for participant's video track
     * @param participantId the id of the conference participant which is
     * the same as the Colibri endpoint ID of the video channel allocated for
     * the user on the videobridge.
     */
    clearRtcMutedTimestamp(participantId) {
        this.rtcMutedTimestamp[participantId] = null;
    }

    /**
     * Bind signalling mute event listeners for video {JitsiRemoteTrack} when
     * a new one is added to the conference.
     *
     * @param {JitsiTrack} remoteTrack the {JitsiTrack} which is being added to
     * the conference.
     */
    onRemoteTrackAdded(remoteTrack) {
        if (!remoteTrack.isLocal()
                && remoteTrack.getType() === MediaType.VIDEO) {

            logger.debug(
                `Detector on remote track added for: ${
                    remoteTrack.getParticipantId()}`);

            remoteTrack.on(
                JitsiTrackEvents.TRACK_MUTE_CHANGED,
                this._onSignallingMuteChanged);
        }
    }

    /**
     * Removes all event listeners bound to the remote video track and clears
     * any related timeouts.
     *
     * @param {JitsiRemoteTrack} remoteTrack the remote track which is being
     * removed from the conference.
     */
    onRemoteTrackRemoved(remoteTrack) {
        if (!remoteTrack.isLocal()
                && remoteTrack.getType() === MediaType.VIDEO) {

            const endpointId = remoteTrack.getParticipantId();

            logger.debug(`Detector on remote track removed: ${endpointId}`);

            remoteTrack.off(
                JitsiTrackEvents.TRACK_MUTE_CHANGED,
                this._onSignallingMuteChanged);

            this.clearTimeout(endpointId);
            this.clearRtcMutedTimestamp(endpointId);

            this.figureOutConnectionStatus(endpointId);
        }
    }

    /**
     * Checks if given participant's video is considered frozen.
     * @param {JitsiParticipant} participant
     * @return {boolean} <tt>true</tt> if the video has frozen for given
     * participant or <tt>false</tt> when it's either not considered frozen
     * (yet) or if freeze detection is not supported by the current browser.
     *
     * FIXME merge this logic with NO_DATA_FROM_SOURCE event
     *       implemented in JitsiLocalTrack by extending the event to
     *       the remote track and allowing to set different timeout for
     *       local and remote tracks.
     *
     */
    isVideoTrackFrozen(participant) {
        if (!RTCBrowserType.isVideoMuteOnConnInterruptedSupported()) {
            return false;
        }

        const hasAnyVideoRTCMuted = participant.hasAnyVideoTrackWebRTCMuted();
        const rtcMutedTimestamp
            = this.rtcMutedTimestamp[participant.getId()];

        return hasAnyVideoRTCMuted
            && typeof rtcMutedTimestamp === 'number'
            && (Date.now() - rtcMutedTimestamp) >= this.rtcMuteTimeout;
    }

    /**
     * Figures out (and updates) the current connectivity status for
     * the participant identified by the given id.
     *
     * @param {string} id the participant's id (MUC nickname or Colibri endpoint
     * ID).
     */
    figureOutConnectionStatus(id) {
        const participant = this.conference.getParticipantById(id);

        if (!participant) {
            // Probably the participant is no longer in the conference
            // (at the time of writing this code, participant is
            // detached from the conference and TRACK_REMOVED events are
            // fired),
            // so we don't care, but let's print the warning for
            // debugging purpose
            logger.warn(`figure out conn status - no participant for: ${id}`);

            return;
        }

        const isVideoMuted = participant.isVideoMuted();
        const isVideoTrackFrozen = this.isVideoTrackFrozen(participant);
        const isInLastN = this.rtc.isInLastN(id);
        let isConnActiveByJvb = this.connStatusFromJvb[id];

        // If no status was received from the JVB it means that it's active
        // (the bridge does not send notification unless there is a problem).
        if (typeof isConnActiveByJvb !== 'boolean') {
            logger.debug('Assuming connection active by JVB - no notification');
            isConnActiveByJvb = true;
        }

        const isConnectionActive
            = isConnActiveByJvb
                && (isVideoMuted || (isInLastN && !isVideoTrackFrozen));

        logger.debug(
            `Figure out conn status, is video muted: ${isVideoMuted
                 } is active(jvb): ${isConnActiveByJvb
                 } video track frozen: ${isVideoTrackFrozen
                 } is in last N: ${isInLastN
                 } => ${isConnectionActive}`);

        this._changeConnectionStatus(participant, isConnectionActive);
    }

    /**
     * Handles RTC 'onmute' event for the video track.
     *
     * @param {JitsiRemoteTrack} track the video track for which 'onmute' event
     * will be processed.
     */
    onTrackRtcMuted(track) {
        const participantId = track.getParticipantId();
        const participant = this.conference.getParticipantById(participantId);

        logger.debug(`Detector track RTC muted: ${participantId}`);
        if (!participant) {
            logger.error(`No participant for id: ${participantId}`);

            return;
        }
        this.rtcMutedTimestamp[participantId] = Date.now();
        if (!participant.isVideoMuted()) {
            // If the user is not muted according to the signalling we'll give
            // it some time, before the connection interrupted event is
            // triggered.
            this.clearTimeout(participantId);
            this.trackTimers[participantId] = window.setTimeout(() => {
                logger.debug(`RTC mute timeout for: ${participantId}`);
                this.clearTimeout(participantId);
                this.figureOutConnectionStatus(participantId);
            }, this.rtcMuteTimeout);
        }
    }

    /**
     * Handles RTC 'onunmute' event for the video track.
     *
     * @param {JitsiRemoteTrack} track the video track for which 'onunmute'
     * event will be processed.
     */
    onTrackRtcUnmuted(track) {
        const participantId = track.getParticipantId();

        logger.debug(`Detector track RTC unmuted: ${participantId}`);

        this.clearTimeout(participantId);
        this.clearRtcMutedTimestamp(participantId);

        this.figureOutConnectionStatus(participantId);
    }

    /**
     * Here the signalling "mute"/"unmute" events are processed.
     *
     * @param {JitsiRemoteTrack} track the remote video track for which
     * the signalling mute/unmute event will be processed.
     */
    onSignallingMuteChanged(track) {
        const participantId = track.getParticipantId();

        logger.debug(
            `Detector on track signalling mute changed: ${participantId}`,
            track.isMuted());

        this.figureOutConnectionStatus(participantId);
    }
}
