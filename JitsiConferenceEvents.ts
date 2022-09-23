/**
 * The events for the conference.
 */

export enum JitsiConferenceEvents {
    /**
     * Event indicates that the current conference audio input switched between audio
     * input states,i.e. with or without audio input.
     */
    AUDIO_INPUT_STATE_CHANGE = 'conference.audio_input_state_changed',

    /**
     * Event indicates that the permission for unmuting audio has changed based on the number of audio senders in the call
     * and the audio sender limit configured in Jicofo.
     */
    AUDIO_UNMUTE_PERMISSIONS_CHANGED = 'conference.audio_unmute_permissions_changed',

    /**
     * Indicates that authentication status changed.
     */
    AUTH_STATUS_CHANGED = 'conference.auth_status_changed',

    /**
     * Fired just before the statistics module is disposed and it's the last chance
     * to submit some logs to the statistics service (ex. CallStats if enabled),
     * before it's disconnected.
     */
    BEFORE_STATISTICS_DISPOSED = 'conference.beforeStatisticsDisposed',

    /**
     * Indicates that an error occurred.
     */
    CONFERENCE_ERROR = 'conference.error',

    /**
     * Indicates that conference failed.
     */
    CONFERENCE_FAILED = 'conference.failed',

    /**
     * Indicates that conference is in progress of joining.
     */
    CONFERENCE_JOIN_IN_PROGRESS = 'conference.join_in_progress',

    /**
     * Indicates that conference has been joined. The event does NOT provide any
     * parameters to its listeners.
     */
    CONFERENCE_JOINED = 'conference.joined',

    /**
     * Indicates that conference has been left.
     */
    CONFERENCE_LEFT = 'conference.left',

    /**
     * Indicates that the conference unique identifier has been set.
     */
    CONFERENCE_UNIQUE_ID_SET = 'conference.unique_id_set',

    /**
     * Indicates that the connection to the conference has been established
     * XXX This is currently fired when the *ICE* connection enters 'connected'
     * state for the first time.
     */
    CONNECTION_ESTABLISHED = 'conference.connectionEstablished',

    /**
     * Indicates that the connection to the conference has been interrupted for some
     * reason.
     * XXX This is currently fired when the *ICE* connection is interrupted.
     */
    CONNECTION_INTERRUPTED = 'conference.connectionInterrupted',

    /**
     * Indicates that the connection to the conference has been restored.
     * XXX This is currently fired when the *ICE* connection is restored.
     */
    CONNECTION_RESTORED = 'conference.connectionRestored',

    /**
     * A connection to the video bridge's data channel has been established.
     */
    DATA_CHANNEL_OPENED = 'conference.dataChannelOpened',

    /**
     * A user has changed it display name
     */
    DISPLAY_NAME_CHANGED = 'conference.displayNameChanged',

    /**
     * The dominant speaker was changed.
     */
    DOMINANT_SPEAKER_CHANGED = 'conference.dominantSpeaker',

    /**
     * UTC conference timestamp when first participant joined.
     */
    CONFERENCE_CREATED_TIMESTAMP = 'conference.createdTimestamp',

    /**
     * Indicates that DTMF support changed.
     */
    DTMF_SUPPORT_CHANGED = 'conference.dtmfSupportChanged',

    /**
     * Indicates that a message from another participant is received on data
     * channel.
     */
    ENDPOINT_MESSAGE_RECEIVED = 'conference.endpoint_message_received',

    /**
     * Indicates that a message for the remote endpoint statistics has been received on the bridge channel.
     */
    ENDPOINT_STATS_RECEIVED = 'conference.endpoint_stats_received',

    /**
     * NOTE This is lib-jitsi-meet internal event and can be removed at any time !
     *
     * Event emitted when conference transits, between one to one and multiparty JVB
     * conference. If the conference switches to P2P it's neither one to one nor
     * a multiparty JVB conference, but P2P (the status argument of this event will
     * be <tt>false</tt>).
     *
     * The first argument is a boolean which carries the previous value and
     * the seconds argument is a boolean with the new status. The event is emitted
     * only if the previous and the new values are different.
     *
     * @type {string}
     */
    JVB121_STATUS = 'conference.jvb121Status',

    /**
     * You are kicked from the conference.
     * @param {JitsiParticipant} the participant that initiated the kick.
     */
    KICKED = 'conference.kicked',

    /**
     * Participant was kicked from the conference.
     * @param {JitsiParticipant} the participant that initiated the kick.
     * @param {JitsiParticipant} the participant that was kicked.
     */
    PARTICIPANT_KICKED = 'conference.participant_kicked',

    /**
     * The Last N set is changed.
     *
     * @param {Array<string>|null} leavingEndpointIds the ids of all the endpoints
     * which are leaving Last N
     * @param {Array<string>|null} enteringEndpointIds the ids of all the endpoints
     * which are entering Last N
     */
    LAST_N_ENDPOINTS_CHANGED = 'conference.lastNEndpointsChanged',

    /**
     * The forwarded sources set is changed.
     *
     * @param {Array<string>} leavingForwardedSources the sourceNames of all the tracks which are leaving forwarded
     * sources
     * @param {Array<string>} enteringForwardedSources the sourceNames of all the tracks which are entering forwarded
     * sources
     */
    FORWARDED_SOURCES_CHANGED = 'conference.forwardedSourcesChanged',

    /**
     * Indicates that the room has been locked or unlocked.
     */
    LOCK_STATE_CHANGED = 'conference.lock_state_changed',

    /**
     * Indicates that the region of the media server (jitsi-videobridge) that we
     * are connected to changed (or was initially set).
     * @type {string} the region.
     */
    SERVER_REGION_CHANGED = 'conference.server_region_changed',

    /**
     * An event(library-private) fired when a new media session is added to the conference.
     * @type {string}
     * @private
     */
    _MEDIA_SESSION_STARTED = 'conference.media_session.started',

    /**
     * An event(library-private) fired when the conference switches the currently active media session.
     * @type {string}
     * @private
     */
    _MEDIA_SESSION_ACTIVE_CHANGED = 'conference.media_session.active_changed',

    /**
     * Indicates that the conference had changed to members only enabled/disabled.
     * The first argument of this event is a <tt>boolean</tt> which when set to
     * <tt>true</tt> means that the conference is running in members only mode.
     * You may need to use Lobby if supported to ask for permissions to enter the conference.
     */
    MEMBERS_ONLY_CHANGED = 'conference.membersOnlyChanged',

    /**
     * New text message was received.
     */
    MESSAGE_RECEIVED = 'conference.messageReceived',

    /**
     * Event indicates that the current selected input device has no signal
     */
    NO_AUDIO_INPUT = 'conference.no_audio_input',

    /**
     * Event indicates that the current microphone used by the conference is noisy.
     */
    NOISY_MIC = 'conference.noisy_mic',

    /**
     * Indicates that a message from the local user or from the Prosody backend
     * was received on the data channel.
     */
    NON_PARTICIPANT_MESSAGE_RECEIVED = 'conference.non_participant_message_received',

    /**
     * New private text message was received.
     */
    PRIVATE_MESSAGE_RECEIVED = 'conference.privateMessageReceived',

    /**
     * Event fired when JVB sends notification about interrupted/restored user's
     * ICE connection status or we detect local problem with the video track.
     * First argument is the ID of the participant and
     * the seconds is a string indicating if the connection is currently
     * - active - the connection is active
     * - inactive - the connection is inactive, was intentionally interrupted by
     * the bridge
     * - interrupted - a network problem occurred
     * - restoring - the connection was inactive and is restoring now
     *
     * The current status value can be obtained by calling
     * JitsiParticipant.getConnectionStatus().
     */
    PARTICIPANT_CONN_STATUS_CHANGED = 'conference.participant_conn_status_changed',

    /**
     * Indicates that the features of the participant has been changed.
     * TODO: there is a spelling mistake in this event name and associated constants
     */
    PARTCIPANT_FEATURES_CHANGED = 'conference.partcipant_features_changed',

    /**
     * Indicates that a the value of a specific property of a specific participant
     * has changed.
     */
    PARTICIPANT_PROPERTY_CHANGED = 'conference.participant_property_changed',

    /**
     * Indicates that the conference has switched between JVB and P2P connections.
     * The first argument of this event is a <tt>boolean</tt> which when set to
     * <tt>true</tt> means that the conference is running on the P2P connection.
     */
    P2P_STATUS = 'conference.p2pStatus',

    /**
     * Indicates that phone number changed.
     */
    PHONE_NUMBER_CHANGED = 'conference.phoneNumberChanged',

    /**
     * The conference properties changed.
     * @type {string}
     */
    PROPERTIES_CHANGED = 'conference.propertiesChanged',

    /**
     * Indicates that recording state changed.
     */
    RECORDER_STATE_CHANGED = 'conference.recorderStateChanged',

    /**
     * Indicates that video SIP GW state changed.
     * @param {VideoSIPGWConstants} status.
     */
    VIDEO_SIP_GW_AVAILABILITY_CHANGED = 'conference.videoSIPGWAvailabilityChanged',

    /**
     * Indicates that video SIP GW Session state changed.
     * @param {options} event - {
     *     {string} address,
     *     {VideoSIPGWConstants} oldState,
     *     {VideoSIPGWConstants} newState,
     *     {string} displayName}
     * }.
     */
    VIDEO_SIP_GW_SESSION_STATE_CHANGED = 'conference.videoSIPGWSessionStateChanged',

    /**
     * Indicates that start muted settings changed.
     */
    START_MUTED_POLICY_CHANGED = 'conference.start_muted_policy_changed',

    /**
     * Indicates that the local user has started muted.
     */
    STARTED_MUTED = 'conference.started_muted',

    /**
     * Indicates that subject of the conference has changed.
     */
    SUBJECT_CHANGED = 'conference.subjectChanged',

    /**
     * Indicates that DTMF support changed.
     */
    SUSPEND_DETECTED = 'conference.suspendDetected',

    /**
     * Event indicates that local user is talking while he muted himself
     */
    TALK_WHILE_MUTED = 'conference.talk_while_muted',

    /**
     * A new media track was added to the conference. The event provides the
     * following parameters to its listeners:
     *
     * @param {JitsiTrack} track the added JitsiTrack
     */
    TRACK_ADDED = 'conference.trackAdded',

    /**
     * Audio levels of a media track ( attached to the conference) was changed.
     */
    TRACK_AUDIO_LEVEL_CHANGED = 'conference.audioLevelsChanged',

    /**
     * A media track ( attached to the conference) mute status was changed.
     * @param {JitsiParticipant|null} the participant that initiated the mute
     * if it is a remote mute.
     */
    TRACK_MUTE_CHANGED = 'conference.trackMuteChanged',

    /**
     * The media track was removed from the conference. The event provides the
     * following parameters to its listeners:
     *
     * @param {JitsiTrack} track the removed JitsiTrack
     */
    TRACK_REMOVED = 'conference.trackRemoved',

    /**
     * The source-add for unmuting of a media track was rejected by Jicofo.
     *
     */
    TRACK_UNMUTE_REJECTED = 'conference.trackUnmuteRejected',

    /**
     * Notifies for transcription status changes. The event provides the
     * following parameters to its listeners:
     *
     * @param {String} status - The new status.
     */
    TRANSCRIPTION_STATUS_CHANGED = 'conference.transcriptionStatusChanged',

    /**
     * A new user joined the conference.
     */
    USER_JOINED = 'conference.userJoined',

    /**
     * A user has left the conference.
     */
    USER_LEFT = 'conference.userLeft',

    /**
     * User role changed.
     */
    USER_ROLE_CHANGED = 'conference.roleChanged',

    /**
     * User status changed.
     */
    USER_STATUS_CHANGED = 'conference.statusChanged',

    /**
     * Event indicates that the permission for unmuting video has changed based on the number of video senders in the call
     * and the video sender limit configured in Jicofo.
     */
    VIDEO_UNMUTE_PERMISSIONS_CHANGED = 'conference.video_unmute_permissions_changed',

    /**
     * Event indicates that the bot participant type changed.
     */
    BOT_TYPE_CHANGED = 'conference.bot_type_changed',

    /**
     * A new user joined the lobby room.
     */
    LOBBY_USER_JOINED = 'conference.lobby.userJoined',

    /**
     * A user from the lobby room has been update.
     */
    LOBBY_USER_UPDATED = 'conference.lobby.userUpdated',

    /**
     * A user left the lobby room.
     */
    LOBBY_USER_LEFT = 'conference.lobby.userLeft',

    /**
     * The local participant was approved to be able to unmute.
     * @param {options} event - {
     *     {MediaType} mediaType
     * }.
     */
    AV_MODERATION_APPROVED = 'conference.av_moderation.approved',

    /**
     * The local participant was blocked to be able to unmute.
     * @param {options} event - {
     *     {MediaType} mediaType
     * }.
     */
    AV_MODERATION_REJECTED = 'conference.av_moderation.rejected',

    /**
     * AV Moderation was enabled/disabled. The actor is the participant that is currently in the meeting,
     * or undefined if that participant has left the meeting.
     *
     * @param {options} event - {
     *     {boolean} enabled,
     *     {MediaType} mediaType,
     *     {JitsiParticipant} actor
     * }.
     */
    AV_MODERATION_CHANGED = 'conference.av_moderation.changed',

    /**
     * AV Moderation, report for user being approved to unmute.
     * @param {options} event - {
     *     {JitsiParticipant} participant,
     *     {MediaType} mediaType
     * }.
     */
    AV_MODERATION_PARTICIPANT_APPROVED = 'conference.av_moderation.participant.approved',

    /**
     * AV Moderation, report for user being blocked to unmute.
     * @param {options} event - {
     *     {JitsiParticipant} participant,
     *     {MediaType} mediaType
     * }.
     */
    AV_MODERATION_PARTICIPANT_REJECTED = 'conference.av_moderation.participant.rejected',

    /**
     * A new face landmark object is added for a participant
     */
    FACE_LANDMARK_ADDED = 'conference.face_landmark.added',

    /**
     * Event fired when a participant is requested to join a given (breakout) room.
     */
    BREAKOUT_ROOMS_MOVE_TO_ROOM = 'conference.breakout-rooms.move-to-room',

    /**
     * Event fired when the breakout rooms data was updated.
     */
    BREAKOUT_ROOMS_UPDATED = 'conference.breakout-rooms.updated'
};

// exported for backward compatibility
export const AUDIO_INPUT_STATE_CHANGE = JitsiConferenceEvents.AUDIO_INPUT_STATE_CHANGE;
export const AUDIO_UNMUTE_PERMISSIONS_CHANGED = JitsiConferenceEvents.AUDIO_UNMUTE_PERMISSIONS_CHANGED;
export const AUTH_STATUS_CHANGED = JitsiConferenceEvents.AUTH_STATUS_CHANGED;
export const BEFORE_STATISTICS_DISPOSED = JitsiConferenceEvents.BEFORE_STATISTICS_DISPOSED;
export const CONFERENCE_ERROR = JitsiConferenceEvents.CONFERENCE_ERROR;
export const CONFERENCE_FAILED = JitsiConferenceEvents.CONFERENCE_FAILED;
export const CONFERENCE_JOIN_IN_PROGRESS = JitsiConferenceEvents.CONFERENCE_JOIN_IN_PROGRESS;
export const CONFERENCE_JOINED = JitsiConferenceEvents.CONFERENCE_JOINED;
export const CONFERENCE_LEFT = JitsiConferenceEvents.CONFERENCE_LEFT;
export const CONFERENCE_UNIQUE_ID_SET = JitsiConferenceEvents.CONFERENCE_UNIQUE_ID_SET;
export const CONNECTION_ESTABLISHED = JitsiConferenceEvents.CONNECTION_ESTABLISHED;
export const CONNECTION_INTERRUPTED = JitsiConferenceEvents.CONNECTION_INTERRUPTED;
export const CONNECTION_RESTORED = JitsiConferenceEvents.CONNECTION_RESTORED;
export const DATA_CHANNEL_OPENED = JitsiConferenceEvents.DATA_CHANNEL_OPENED;
export const DISPLAY_NAME_CHANGED = JitsiConferenceEvents.DISPLAY_NAME_CHANGED;
export const DOMINANT_SPEAKER_CHANGED = JitsiConferenceEvents.DOMINANT_SPEAKER_CHANGED;
export const CONFERENCE_CREATED_TIMESTAMP = JitsiConferenceEvents.CONFERENCE_CREATED_TIMESTAMP;
export const DTMF_SUPPORT_CHANGED = JitsiConferenceEvents.DTMF_SUPPORT_CHANGED;
export const ENDPOINT_MESSAGE_RECEIVED = JitsiConferenceEvents.ENDPOINT_MESSAGE_RECEIVED;
export const ENDPOINT_STATS_RECEIVED = JitsiConferenceEvents.ENDPOINT_STATS_RECEIVED;
export const JVB121_STATUS = JitsiConferenceEvents.JVB121_STATUS;
export const KICKED = JitsiConferenceEvents.KICKED;
export const PARTICIPANT_KICKED = JitsiConferenceEvents.PARTICIPANT_KICKED;
export const LAST_N_ENDPOINTS_CHANGED = JitsiConferenceEvents.LAST_N_ENDPOINTS_CHANGED;
export const FORWARDED_SOURCES_CHANGED = JitsiConferenceEvents.FORWARDED_SOURCES_CHANGED;
export const LOCK_STATE_CHANGED = JitsiConferenceEvents.LOCK_STATE_CHANGED;
export const SERVER_REGION_CHANGED = JitsiConferenceEvents.SERVER_REGION_CHANGED;
export const _MEDIA_SESSION_STARTED = JitsiConferenceEvents._MEDIA_SESSION_STARTED;
export const _MEDIA_SESSION_ACTIVE_CHANGED = JitsiConferenceEvents._MEDIA_SESSION_ACTIVE_CHANGED;
export const MEMBERS_ONLY_CHANGED = JitsiConferenceEvents.MEMBERS_ONLY_CHANGED;
export const MESSAGE_RECEIVED = JitsiConferenceEvents.MESSAGE_RECEIVED;
export const NO_AUDIO_INPUT = JitsiConferenceEvents.NO_AUDIO_INPUT;
export const NOISY_MIC = JitsiConferenceEvents.NOISY_MIC;
export const NON_PARTICIPANT_MESSAGE_RECEIVED = JitsiConferenceEvents.NON_PARTICIPANT_MESSAGE_RECEIVED;
export const PRIVATE_MESSAGE_RECEIVED = JitsiConferenceEvents.PRIVATE_MESSAGE_RECEIVED;
export const PARTICIPANT_CONN_STATUS_CHANGED = JitsiConferenceEvents.PARTICIPANT_CONN_STATUS_CHANGED;
export const PARTCIPANT_FEATURES_CHANGED = JitsiConferenceEvents.PARTCIPANT_FEATURES_CHANGED;
export const PARTICIPANT_PROPERTY_CHANGED = JitsiConferenceEvents.PARTICIPANT_PROPERTY_CHANGED;
export const P2P_STATUS = JitsiConferenceEvents.P2P_STATUS;
export const PHONE_NUMBER_CHANGED = JitsiConferenceEvents.PHONE_NUMBER_CHANGED;
export const PROPERTIES_CHANGED = JitsiConferenceEvents.PROPERTIES_CHANGED;
export const RECORDER_STATE_CHANGED = JitsiConferenceEvents.RECORDER_STATE_CHANGED;
export const VIDEO_SIP_GW_AVAILABILITY_CHANGED = JitsiConferenceEvents.VIDEO_SIP_GW_AVAILABILITY_CHANGED;
export const VIDEO_SIP_GW_SESSION_STATE_CHANGED = JitsiConferenceEvents.VIDEO_SIP_GW_SESSION_STATE_CHANGED;
export const START_MUTED_POLICY_CHANGED = JitsiConferenceEvents.START_MUTED_POLICY_CHANGED;
export const STARTED_MUTED = JitsiConferenceEvents.STARTED_MUTED;
export const SUBJECT_CHANGED = JitsiConferenceEvents.SUBJECT_CHANGED;
export const SUSPEND_DETECTED = JitsiConferenceEvents.SUSPEND_DETECTED;
export const TALK_WHILE_MUTED = JitsiConferenceEvents.TALK_WHILE_MUTED;
export const TRACK_ADDED = JitsiConferenceEvents.TRACK_ADDED;
export const TRACK_AUDIO_LEVEL_CHANGED = JitsiConferenceEvents.TRACK_AUDIO_LEVEL_CHANGED;
export const TRACK_MUTE_CHANGED = JitsiConferenceEvents.TRACK_MUTE_CHANGED;
export const TRACK_REMOVED = JitsiConferenceEvents.TRACK_REMOVED;
export const TRACK_UNMUTE_REJECTED = JitsiConferenceEvents.TRACK_UNMUTE_REJECTED;
export const TRANSCRIPTION_STATUS_CHANGED = JitsiConferenceEvents.TRANSCRIPTION_STATUS_CHANGED;
export const USER_JOINED = JitsiConferenceEvents.USER_JOINED;
export const USER_LEFT = JitsiConferenceEvents.USER_LEFT;
export const USER_ROLE_CHANGED = JitsiConferenceEvents.USER_ROLE_CHANGED;
export const USER_STATUS_CHANGED = JitsiConferenceEvents.USER_STATUS_CHANGED;
export const VIDEO_UNMUTE_PERMISSIONS_CHANGED = JitsiConferenceEvents.VIDEO_UNMUTE_PERMISSIONS_CHANGED;
export const BOT_TYPE_CHANGED = JitsiConferenceEvents.BOT_TYPE_CHANGED;
export const LOBBY_USER_JOINED = JitsiConferenceEvents.LOBBY_USER_JOINED;
export const LOBBY_USER_UPDATED = JitsiConferenceEvents.LOBBY_USER_UPDATED;
export const LOBBY_USER_LEFT = JitsiConferenceEvents.LOBBY_USER_LEFT;
export const AV_MODERATION_APPROVED = JitsiConferenceEvents.AV_MODERATION_APPROVED;
export const AV_MODERATION_REJECTED = JitsiConferenceEvents.AV_MODERATION_REJECTED;
export const AV_MODERATION_CHANGED = JitsiConferenceEvents.AV_MODERATION_CHANGED;
export const AV_MODERATION_PARTICIPANT_APPROVED = JitsiConferenceEvents.AV_MODERATION_PARTICIPANT_APPROVED;
export const AV_MODERATION_PARTICIPANT_REJECTED = JitsiConferenceEvents.AV_MODERATION_PARTICIPANT_REJECTED;
export const FACE_LANDMARK_ADDED = JitsiConferenceEvents.FACE_LANDMARK_ADDED;
export const BREAKOUT_ROOMS_MOVE_TO_ROOM = JitsiConferenceEvents.BREAKOUT_ROOMS_MOVE_TO_ROOM;
export const BREAKOUT_ROOMS_UPDATED = JitsiConferenceEvents.BREAKOUT_ROOMS_UPDATED;
