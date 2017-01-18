/**
 * The events for the conference.
 */

/**
 * Indicates that authentication status changed.
 */
export const AUTH_STATUS_CHANGED = "conference.auth_status_changed";
/**
 * Indicates that available devices changed.
 */
export const AVAILABLE_DEVICES_CHANGED = "conference.availableDevicesChanged";
/**
 * A participant avatar has changed.
 */
export const AVATAR_CHANGED = "conference.avatarChanged";

/**
 * Fired just before the statistics module is disposed and it's the last chance
 * to submit some logs to the statistics service (ex. CallStats if enabled),
 * before it's disconnected.
 */
export const BEFORE_STATISTICS_DISPOSED = "conference.beforeStatisticsDisposed";

/**
 * Indicates that an error occured.
 */
export const CONFERENCE_ERROR = "conference.error";
/**
 * Indicates that conference failed.
 */
export const CONFERENCE_FAILED = "conference.failed";
/**
 * Indicates that conference has been joined. The event does NOT provide any
 * parameters to its listeners.
 */
export const CONFERENCE_JOINED = "conference.joined";
/**
 * Indicates that conference has been left.
 */
export const CONFERENCE_LEFT = "conference.left";
/**
 * Indicates that the connection to the conference has been interrupted for some
 * reason.
 */
export const CONNECTION_INTERRUPTED = "conference.connectionInterrupted";
/**
 * Indicates that the connection to the conference has been restored.
 */
export const CONNECTION_RESTORED = "conference.connectionRestored";
/**
 * New local connection statistics are received.
 * @deprecated Use ConnectionQualityEvents.LOCAL_STATS_UPDATED instead.
 */
export const CONNECTION_STATS = "conference.connectionStats";
/**
 * A user has changed it display name
 */
export const DISPLAY_NAME_CHANGED = "conference.displayNameChanged";
/**
 * The dominant speaker was changed.
 */
export const DOMINANT_SPEAKER_CHANGED = "conference.dominantSpeaker";
/**
 * Indicates that DTMF support changed.
 */
export const DTMF_SUPPORT_CHANGED = "conference.dtmfSupportChanged";
/**
 * Indicates that a message from another participant is received on data
 * channel.
 */
export const ENDPOINT_MESSAGE_RECEIVED = "conference.endpoint_message_received";
/**
 * You are included / excluded in somebody's last N set
 */
export const IN_LAST_N_CHANGED = "conference.inLastNChanged";
/**
 * You are kicked from the conference.
 */
export const KICKED = "conferenece.kicked";
/**
 * The Last N set is changed.
 */
export const LAST_N_ENDPOINTS_CHANGED = "conference.lastNEndpointsChanged";
/**
 * Indicates that the room has been locked or unlocked.
 */
export const LOCK_STATE_CHANGED = "conference.lock_state_changed";
/**
 * New text message was received.
 */
export const MESSAGE_RECEIVED = "conference.messageReceived";
/**
 * Event fired when JVB sends notification about interrupted/restored user's
 * ICE connection status. First argument is the ID of the participant and
 * the seconds is a boolean indicating if the connection is currently
 * active(true = active, false = interrupted).
 * The current status value can be obtained by calling
 * JitsiParticipant.isConnectionActive().
 */
export const PARTICIPANT_CONN_STATUS_CHANGED
    = "conference.participant_conn_status_changed";
/**
 * Indicates that the features of the participant has been changed.
 */
export const PARTCIPANT_FEATURES_CHANGED
    = "conference.partcipant_features_changed";
/**
 * Indicates that a the value of a specific property of a specific participant
 * has changed.
 */
export const PARTICIPANT_PROPERTY_CHANGED
    = "conference.participant_property_changed";
/**
 * Indicates that phone number changed.
 */
export const PHONE_NUMBER_CHANGED = "conference.phoneNumberChanged";
/**
 * Indicates that recording state changed.
 */
export const RECORDER_STATE_CHANGED = "conference.recorderStateChanged";
/**
 * Indicates that start muted settings changed.
 */
export const START_MUTED_POLICY_CHANGED
    = "conference.start_muted_policy_changed";
/**
 * Indicates that the local user has started muted.
 */
export const STARTED_MUTED = "conference.started_muted";
/**
 * Indicates that subject of the conference has changed.
 */
export const SUBJECT_CHANGED = "conference.subjectChanged";
/**
 * Indicates that DTMF support changed.
 */
export const SUSPEND_DETECTED = "conference.suspendDetected";
/**
 * Event indicates that local user is talking while he muted himself
 */
export const TALK_WHILE_MUTED = "conference.talk_while_muted";
/**
 * A new media track was added to the conference. The event provides the
 * following parameters to its listeners:
 *
 * @param {JitsiTrack} track the added JitsiTrack
 */
export const TRACK_ADDED = "conference.trackAdded";
/**
 * Audio levels of a media track ( attached to the conference) was changed.
 */
export const TRACK_AUDIO_LEVEL_CHANGED = "conference.audioLevelsChanged";
/**
 * A media track ( attached to the conference) mute status was changed.
 */
export const TRACK_MUTE_CHANGED = "conference.trackMuteChanged";
/**
 * The media track was removed from the conference. The event provides the
 * following parameters to its listeners:
 *
 * @param {JitsiTrack} track the removed JitsiTrack
 */
export const TRACK_REMOVED = "conference.trackRemoved";
/**
 * A new user joinned the conference.
 */
export const USER_JOINED = "conference.userJoined";
/**
 * A user has left the conference.
 */
export const USER_LEFT = "conference.userLeft";
/**
 * User role changed.
 */
export const USER_ROLE_CHANGED = "conference.roleChanged";
/**
 * User status changed.
 */
export const USER_STATUS_CHANGED = "conference.statusChanged";
