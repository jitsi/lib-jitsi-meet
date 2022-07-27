/**
 * Participant connection statuses.
 *
 * @type {{
 *      ACTIVE: string,
 *      INACTIVE: string,
 *      INTERRUPTED: string,
 *      RESTORING: string
 * }}
 */
export const ParticipantConnectionStatus: {
    ACTIVE: string;
    INACTIVE: string;
    INTERRUPTED: string;
    RESTORING: string;
};
/**
 * Class is responsible for emitting
 * JitsiConferenceEvents.PARTICIPANT_CONN_STATUS_CHANGED events.
 */
export default class ParticipantConnectionStatusHandler {
    /**
     * Calculates the new {@link ParticipantConnectionStatus} based on
     * the values given for some specific remote user. It is assumed that
     * the conference is currently in the JVB mode (in contrary to the P2P mode)
     * @param {boolean} isConnectionActiveByJvb true if the JVB did not get any
     * data from the user for the last 15 seconds.
     * @param {boolean} isInLastN indicates whether the user is in the last N
     * set. When set to false it means that JVB is not sending any video for
     * the user.
     * @param {boolean} isRestoringTimedout if true it means that the user has
     * been outside of last N too long to be considered
     * {@link ParticipantConnectionStatus.RESTORING}.
     * @param {boolean} isVideoMuted true if the user is video muted and we
     * should not expect to receive any video.
     * @param {boolean} isVideoTrackFrozen if the current browser support video
     * frozen detection then it will be set to true when the video track is
     * frozen. If the current browser does not support frozen detection the it's
     * always false.
     * @return {ParticipantConnectionStatus} the new connection status for
     * the user for whom the values above were provided.
     * @private
     */
    private static _getNewStateForJvbMode;
    /**
     * In P2P mode we don't care about any values coming from the JVB and
     * the connection status can be only active or interrupted.
     * @param {boolean} isVideoMuted the user if video muted
     * @param {boolean} isVideoTrackFrozen true if the video track for
     * the remote user is currently frozen. If the current browser does not
     * support video frozen detection then it's always false.
     * @return {ParticipantConnectionStatus}
     * @private
     */
    private static _getNewStateForP2PMode;
    /**
     * Creates new instance of <tt>ParticipantConnectionStatus</tt>.
     *
     * @constructor
     * @param {RTC} rtc the RTC service instance
     * @param {JitsiConference} conference parent conference instance
     * @param {Object} options
     * @param {number} [options.p2pRtcMuteTimeout=2500] custom value for
     * {@link ParticipantConnectionStatus.p2pRtcMuteTimeout}.
     * @param {number} [options.rtcMuteTimeout=10000] custom value for
     * {@link ParticipantConnectionStatus.rtcMuteTimeout}.
     * @param {number} [options.outOfLastNTimeout=500] custom value for
     * {@link ParticipantConnectionStatus.outOfLastNTimeout}.
     */
    constructor(rtc: any, conference: any, options: {
        p2pRtcMuteTimeout?: number;
        rtcMuteTimeout?: number;
        outOfLastNTimeout?: number;
    });
    rtc: any;
    conference: any;
    /**
     * A map of the "endpoint ID"(which corresponds to the resource part
     * of MUC JID(nickname)) to the timeout callback IDs scheduled using
     * window.setTimeout.
     * @type {Object.<string, number>}
     */
    trackTimers: {
        [x: string]: number;
    };
    /**
     * This map holds the endpoint connection status received from the JVB
     * (as it might be different than the one stored in JitsiParticipant).
     * Required for getting back in sync when remote video track is removed.
     * @type {Object.<string, boolean>}
     */
    connStatusFromJvb: {
        [x: string]: boolean;
    };
    /**
     * If video track frozen detection through RTC mute event is supported,
     * we wait some time until video track is considered frozen. But because
     * when the user falls out of last N it is expected for the video to
     * freeze this timeout must be significantly reduced in "out of last N"
     * case.
     *
     * Basically this value is used instead of {@link rtcMuteTimeout} when
     * user is not in last N.
     * @type {number}
     */
    outOfLastNTimeout: number;
    /**
     * How long we are going to wait for the corresponding signaling mute event after the RTC video track muted
     * event is fired on the Media stream, before the connection interrupted is fired. The default value is
     * {@link DEFAULT_P2P_RTC_MUTE_TIMEOUT}.
     *
     * @type {number} amount of time in milliseconds.
     */
    p2pRtcMuteTimeout: number;
    /**
     * How long we're going to wait after the RTC video track muted event
     * for the corresponding signalling mute event, before the connection
     * interrupted is fired. The default value is
     * {@link DEFAULT_RTC_MUTE_TIMEOUT}.
     *
     * @type {number} amount of time in milliseconds
     */
    rtcMuteTimeout: number;
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
    rtcMutedTimestamp: {
        [x: string]: number;
    };
    /**
     * This map holds the timestamps indicating when participant's video
     * entered lastN set. Participants entering lastN will have connection
     * status restoring and when we start receiving video will become
     * active, but if video is not received for certain time
     * {@link DEFAULT_RESTORING_TIMEOUT} that participant connection status
     * will become interrupted.
     *
     * @type {Map<string, number>}
     */
    enteredLastNTimestamp: Map<string, number>;
    /**
     * A map of the "endpoint ID"(which corresponds to the resource part
     * of MUC JID(nickname)) to the restoring timeout callback IDs
     * scheduled using window.setTimeout.
     *
     * @type {Map<string, number>}
     */
    restoringTimers: Map<string, number>;
    /**
     * A map that holds the current connection status (along with all the internal events that happen
     * while in that state).
     *
     * The goal is to send this information to the analytics backend for post-mortem analysis.
     */
    connectionStatusMap: Map<any, any>;
    /**
     * Gets the video frozen timeout for given user.
     * @param {string} id endpoint/participant ID
     * @return {number} how long are we going to wait since RTC video muted
     * even, before a video track is considered frozen.
     * @private
     */
    private _getVideoFrozenTimeout;
    /**
     * Initializes <tt>ParticipantConnectionStatus</tt> and bind required event
     * listeners.
     */
    init(): void;
    _onEndpointConnStatusChanged: any;
    _onP2PStatus: any;
    _onUserLeft: any;
    _onTrackRtcMuted: any;
    _onTrackRtcUnmuted: any;
    _onRemoteTrackAdded: any;
    _onRemoteTrackRemoved: any;
    _onSignallingMuteChanged: any;
    _onTrackVideoTypeChanged: any;
    /**
     * On change in Last N set check all leaving and entering participants to
     * change their corresponding statuses.
     *
     * @param {Array<string>} leavingLastN - The array of ids leaving lastN.
     * @param {Array<string>} enteringLastN - The array of ids entering lastN.
     * @private
     */
    private _onLastNChanged;
    _onLastNValueChanged: any;
    /**
     * Removes all event listeners and disposes of all resources held by this
     * instance.
     */
    dispose(): void;
    /**
     * Handles RTCEvents.ENDPOINT_CONN_STATUS_CHANGED triggered when we receive
     * notification over the data channel from the bridge about endpoint's
     * connection status update.
     * @param {string} endpointId - The endpoint ID(MUC nickname/resource JID).
     * @param {boolean} isActive - true if the connection is OK or false otherwise.
     */
    onEndpointConnStatusChanged(endpointId: string, isActive: boolean): void;
    /**
     * Changes connection status.
     * @param {JitsiParticipant} participant
     * @param newStatus
     */
    _changeConnectionStatus(participant: any, newStatus: any): void;
    /**
     * Reset the postponed "connection interrupted" event which was previously
     * scheduled as a timeout on RTC 'onmute' event.
     *
     * @param {string} participantId - The participant for which the "connection
     * interrupted" timeout was scheduled.
     */
    clearTimeout(participantId: string): void;
    /**
     * Clears the timestamp of the RTC muted event for participant's video track
     * @param {string} participantId the id of the conference participant which
     * is the same as the Colibri endpoint ID of the video channel allocated for
     * the user on the videobridge.
     */
    clearRtcMutedTimestamp(participantId: string): void;
    /**
     * Bind signalling mute event listeners for video {JitsiRemoteTrack} when
     * a new one is added to the conference.
     *
     * @param {JitsiTrack} remoteTrack - The {JitsiTrack} which is being added to
     * the conference.
     */
    onRemoteTrackAdded(remoteTrack: any): void;
    /**
     * Removes all event listeners bound to the remote video track and clears
     * any related timeouts.
     *
     * @param {JitsiRemoteTrack} remoteTrack - The remote track which is being
     * removed from the conference.
     */
    onRemoteTrackRemoved(remoteTrack: any): void;
    /**
     * Checks if given participant's video is considered frozen.
     * @param {JitsiParticipant} participant - The participant.
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
    isVideoTrackFrozen(participant: any): boolean;
    /**
     * Goes over every participant and updates connectivity status.
     * Should be called when a parameter which affects all of the participants
     * is changed (P2P for example).
     */
    refreshConnectionStatusForAll(): void;
    /**
     * Figures out (and updates) the current connectivity status for
     * the participant identified by the given id.
     *
     * @param {string} id - The participant's id (MUC nickname or Colibri endpoint ID).
     */
    figureOutConnectionStatus(id: string): void;
    /**
     * Computes the duration of the current connection status for the participant with the specified id (i.e. 15 seconds
     * in the INTERRUPTED state) and sends a participant connection status event.
     * @param {string} id - The jid of the participant.
     * @param {Number} nowMs - The current time (in millis).
     * @returns {void}
     */
    maybeSendParticipantConnectionStatusEvent(id: string, nowMs: number): void;
    /**
     * Clears the restoring timer for participant's video track and the
     * timestamp for entering lastN.
     *
     * @param {string} participantId - The id of the conference participant which
     * is the same as the Colibri endpoint ID of the video channel allocated for
     * the user on the videobridge.
     */
    _clearRestoringTimer(participantId: string): void;
    /**
     * Checks whether a track had stayed enough in restoring state, compares
     * current time and the time the track entered in lastN. If it hasn't
     * timedout and there is no timer added, add new timer in order to give it
     * more time to become active or mark it as interrupted on next check.
     *
     * @param {string} participantId - The id of the conference participant which
     * is the same as the Colibri endpoint ID of the video channel allocated for
     * the user on the videobridge.
     * @returns {boolean} <tt>true</tt> if the track was in restoring state
     * more than the timeout ({@link DEFAULT_RESTORING_TIMEOUT}.) in order to
     * set its status to interrupted.
     * @private
     */
    private _isRestoringTimedout;
    /**
     * Sends a last/final participant connection status event for the participant that left the conference.
     * @param {string} id - The id of the participant that left the conference.
     * @returns {void}
     */
    onUserLeft(id: string): void;
    /**
     * Handles RTC 'onmute' event for the video track.
     *
     * @param {JitsiRemoteTrack} track - The video track for which 'onmute' event
     * will be processed.
     */
    onTrackRtcMuted(track: any): void;
    /**
     * Handles RTC 'onunmute' event for the video track.
     *
     * @param {JitsiRemoteTrack} track - The video track for which 'onunmute'
     * event will be processed.
     */
    onTrackRtcUnmuted(track: any): void;
    /**
     * Here the signalling "mute"/"unmute" events are processed.
     *
     * @param {JitsiRemoteTrack} track - The remote video track for which
     * the signalling mute/unmute event will be processed.
     */
    onSignallingMuteChanged(track: any): void;
    /**
     * Sends a participant connection status event as a result of the video type
     * changing.
     * @param {JitsiRemoteTrack} track - The track.
     * @param {VideoType} type - The video type.
     * @returns {void}
     */
    onTrackVideoTypeChanged(track: any, type: any): void;
}
