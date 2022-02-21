export declare enum XMPPEvents {
    /**
     * Indicates error while adding ice candidate.
     */
    ADD_ICE_CANDIDATE_FAILED = "xmpp.add_ice_candidate_failed",
    AUDIO_MUTED_BY_FOCUS = "xmpp.audio_muted_by_focus",
    VIDEO_MUTED_BY_FOCUS = "xmpp.video_muted_by_focus",
    AUTHENTICATION_REQUIRED = "xmpp.authentication_required",
    BRIDGE_DOWN = "xmpp.bridge_down",
    /**
     * Triggered when 'session-accept' is received from the responder.
     */
    CALL_ACCEPTED = "xmpp.callaccepted.jingle",
    CALL_INCOMING = "xmpp.callincoming.jingle",
    CALL_ENDED = "xmpp.callended.jingle",
    CHAT_ERROR_RECEIVED = "xmpp.chat_error_received",
    SETTINGS_ERROR_RECEIVED = "xmpp.settings_error_received",
    CONFERENCE_PROPERTIES_CHANGED = "xmpp.conference_properties_changed",
    /**
     * This event is triggered when the ICE connects for the first time.
     */
    CONNECTION_ESTABLISHED = "xmpp.connection.connected",
    CONNECTION_FAILED = "xmpp.connection.failed",
    CONNECTION_INTERRUPTED = "xmpp.connection.interrupted",
    CONNECTION_RESTORED = "xmpp.connection.restored",
    CONNECTION_ICE_FAILED = "xmpp.connection.ice.failed",
    CONNECTION_RESTARTED = "xmpp.connection.restart",
    /**
     * Designates an event indicating connection status changes.
     */
    CONNECTION_STATUS_CHANGED = "xmpp.connection.status.changed",
    DISPLAY_NAME_CHANGED = "xmpp.display_name_changed",
    /**
     * Chat room instance have been added to Strophe.emuc plugin.
     */
    EMUC_ROOM_ADDED = "xmpp.emuc_room_added",
    /**
     * Chat room instance have been removed from Strophe.emuc plugin.
     */
    EMUC_ROOM_REMOVED = "xmpp.emuc_room_removed",
    ETHERPAD = "xmpp.etherpad",
    FOCUS_DISCONNECTED = "xmpp.focus_disconnected",
    FOCUS_LEFT = "xmpp.focus_left",
    GRACEFUL_SHUTDOWN = "xmpp.graceful_shutdown",
    /**
     * Event fired when 'transport-replace' Jingle message has been received,
     * before the new offer is set on the PeerConnection.
     */
    ICE_RESTARTING = "rtc.ice_restarting",
    /**
     * Event fired after the 'transport-replace' message has been processed
     * and the new offer has been set successfully.
     */
    ICE_RESTART_SUCCESS = "rtc.ice_restart_success",
    /**
     * Designates an event indicating that we were kicked from the XMPP MUC.
     * @param {boolean} isSelfPresence - whether it is for local participant
     * or another participant.
     * @param {string} actorJid - the jid of the participant who was initiator
     * of the kick.
     * @param {?string} participantJid - when it is not a kick for local participant,
     * this is the jid of the participant which was kicked.
     */
    KICKED = "xmpp.kicked",
    LOCAL_ROLE_CHANGED = "xmpp.localrole_changed",
    /**
     * Event fired when the unique meeting id is set.
     */
    MEETING_ID_SET = "xmpp.meeting_id_set",
    MESSAGE_RECEIVED = "xmpp.message_received",
    INVITE_MESSAGE_RECEIVED = "xmpp.invite_message_received",
    PRIVATE_MESSAGE_RECEIVED = "xmpp.private_message_received",
    MUC_MEMBER_BOT_TYPE_CHANGED = "xmpp.muc_member_bot_type_changed",
    MUC_DESTROYED = "xmpp.muc_destroyed",
    MUC_JOIN_IN_PROGRESS = "xmpp.muc_join_in_progress",
    MUC_JOINED = "xmpp.muc_joined",
    MUC_MEMBER_JOINED = "xmpp.muc_member_joined",
    MUC_MEMBER_LEFT = "xmpp.muc_member_left",
    MUC_LOBBY_MEMBER_JOINED = "xmpp.muc_lobby_member_joined",
    MUC_LOBBY_MEMBER_UPDATED = "xmpp.muc_lobby_member_updated",
    MUC_LOBBY_MEMBER_LEFT = "xmpp.muc_lobby_member_left",
    MUC_DENIED_ACCESS = "xmpp.muc_denied access",
    MUC_LEFT = "xmpp.muc_left",
    MUC_ROLE_CHANGED = "xmpp.muc_role_changed",
    MUC_LOCK_CHANGED = "xmpp.muc_lock_changed",
    MUC_MEMBERS_ONLY_CHANGED = "xmpp.muc_members_only_changed",
    PARTICIPANT_AUDIO_MUTED = "xmpp.audio_muted",
    PARTICIPANT_VIDEO_MUTED = "xmpp.video_muted",
    PARTICIPANT_VIDEO_TYPE_CHANGED = "xmpp.video_type",
    /**
     * Indicates that the features of the participant has been changed.
     */
    PARTICIPANT_FEATURES_CHANGED = "xmpp.participant_features_changed",
    PASSWORD_REQUIRED = "xmpp.password_required",
    /**
     * Indicates that phone number changed.
     */
    PHONE_NUMBER_CHANGED = "conference.phoneNumberChanged",
    PRESENCE_RECEIVED = "xmpp.presence_received",
    PRESENCE_STATUS = "xmpp.presence_status",
    PROMPT_FOR_LOGIN = "xmpp.prompt_for_login",
    READY_TO_JOIN = "xmpp.ready_to_join",
    /**
     * Indicates that recording state changed.
     */
    RECORDER_STATE_CHANGED = "xmpp.recorderStateChanged",
    REMOTE_STATS = "xmpp.remote_stats",
    /**
     * Indicates that the offer / answer renegotiation has failed.
     */
    RENEGOTIATION_FAILED = "xmpp.renegotiation_failed",
    RESERVATION_ERROR = "xmpp.room_reservation_error",
    ROOM_CONNECT_ERROR = "xmpp.room_connect_error",
    ROOM_CONNECT_NOT_ALLOWED_ERROR = "xmpp.room_connect_error.not_allowed",
    ROOM_JOIN_ERROR = "xmpp.room_join_error",
    ROOM_CONNECT_MEMBERS_ONLY_ERROR = "xmpp.room_connect_error.members_only",
    /**
     * Indicates that max users limit has been reached.
     */
    ROOM_MAX_USERS_ERROR = "xmpp.room_max_users_error",
    SENDING_CHAT_MESSAGE = "xmpp.sending_chat_message",
    SENDING_PRIVATE_CHAT_MESSAGE = "xmpp.sending_private_chat_message",
    /**
     * Event fired after receiving the confirmation about session accept.
     */
    SESSION_ACCEPT = "xmpp.session_accept",
    /**
     * Event fired if we receive an error after sending the session accept.
     */
    SESSION_ACCEPT_ERROR = "xmpp.session_accept_error",
    /**
     * Event fired when we do not get our 'session-accept' acknowledged by
     * Jicofo. It most likely means that there is serious problem with our
     * connection or XMPP server and we should reload the conference.
     *
     * We have seen that to happen in BOSH requests race condition when the BOSH
     * request table containing the 'session-accept' was discarded by Prosody.
     * Jicofo does send the RESULT immediately without any condition, so missing
     * packets means that most likely it has never seen our IQ.
     */
    SESSION_ACCEPT_TIMEOUT = "xmpp.session_accept_timeout",
    /**
     * Event fired after successful sending of jingle source-add.
     */
    SOURCE_ADD = "xmpp.source_add",
    /**
     * Event fired after receiving an error sending of jingle source-add.
     */
    SOURCE_ADD_ERROR = "xmpp.source_add_error",
    /**
     * Event fired after successful sending of jingle source-remove.
     */
    SOURCE_REMOVE = "xmpp.source_remove",
    /**
     * Event fired after receiving an error sending of jingle source-remove.
     */
    SOURCE_REMOVE_ERROR = "xmpp.source_remove_error",
    /**
     * Event fired when speaker stats update message is received.
     */
    SPEAKER_STATS_RECEIVED = "xmpp.speaker_stats_received",
    /**
     * Event fired when conference creation timestamp is received.
     */
    CONFERENCE_TIMESTAMP_RECEIVED = "xmpp.conference_timestamp_received",
    /**
     * Event fired when we receive a message for AV moderation approved for the local participant.
     */
    AV_MODERATION_APPROVED = "xmpp.av_moderation.approved",
    /**
    * Event fired when we receive a message for AV moderation rejected for the local participant.
    */
    AV_MODERATION_REJECTED = "xmpp.av_moderation.rejected",
    /**
     * Event fired when we receive a message for AV moderation.
     */
    AV_MODERATION_RECEIVED = "xmpp.av_moderation.received",
    /**
     * Event fired when the moderation enable/disable changes.
     */
    AV_MODERATION_CHANGED = "xmpp.av_moderation.changed",
    /**
     * Event fired when we receive message that a new jid was approved.
     */
    AV_MODERATION_PARTICIPANT_APPROVED = "xmpp.av_moderation.participant.approved",
    /**
     * Event fired when we receive message that a new jid was approved.
     */
    AV_MODERATION_PARTICIPANT_REJECTED = "xmpp.av_moderation.participant.rejected",
    /**
     * Event fired when a participant is requested to join a given (breakout) room.
     */
    BREAKOUT_ROOMS_MOVE_TO_ROOM = "xmpp.breakout-rooms.move-to-room",
    /**
     * Event fired when we receive a message for breakout rooms.
     */
    BREAKOUT_ROOMS_EVENT = "xmpp.breakout-rooms.event",
    /**
     * Event fired when the breakout rooms data was updated.
     */
    BREAKOUT_ROOMS_UPDATED = "xmpp.breakout-rooms.updated",
    START_MUTED_FROM_FOCUS = "xmpp.start_muted_from_focus",
    SUBJECT_CHANGED = "xmpp.subject_changed",
    SUSPEND_DETECTED = "xmpp.suspend_detected",
    /**
     * Notifies for transcription status changes. The event provides the
     * following parameters to its listeners:
     *
     * @param {String} status - The new status.
     */
    TRANSCRIPTION_STATUS_CHANGED = "xmpp.transcription_status_changed",
    /**
     * Event fired when 'transport-info' with new ICE candidates is received.
     */
    TRANSPORT_INFO = "xmpp.transportinfo.jingle",
    /**
     * Indicates that video SIP GW state changed.
     *
     * @param {VideoSIPGWConstants} status - Any of the following statuses:
     * STATUS_BUSY, STATUS_AVAILABLE or STATUS_UNDEFINED.
     */
    VIDEO_SIP_GW_AVAILABILITY_CHANGED = "xmpp.videoSIPGWAvailabilityChanged",
    /**
     * Indicates that video SIP GW Session state changed.
     * The statuses are any of the following statuses:
     * STATE_ON, STATE_OFF, STATE_PENDING, STATE_RETRYING, STATE_FAILED.
     * {@see VideoSIPGWConstants}
     *
     * @param {options} event - {address, oldState, newState, displayName}.
     */
    VIDEO_SIP_GW_SESSION_STATE_CHANGED = "xmpp.videoSIPGWSessionStateChanged",
    ICE_CONNECTION_STATE_CHANGED = "xmpp.ice_connection_state_changed",
    /**
     * Event which is emitted when the body in an XMPP message in the MUC
     * contains JSON
     * TODO: this event contains a typo (xmmp vs xmpp) but it's unlikely this can be changed now
     */
    JSON_MESSAGE_RECEIVED = "xmmp.json_message_received"
}
export declare const ADD_ICE_CANDIDATE_FAILED = XMPPEvents.ADD_ICE_CANDIDATE_FAILED;
export declare const AUDIO_MUTED_BY_FOCUS = XMPPEvents.AUDIO_MUTED_BY_FOCUS;
export declare const VIDEO_MUTED_BY_FOCUS = XMPPEvents.VIDEO_MUTED_BY_FOCUS;
export declare const AUTHENTICATION_REQUIRED = XMPPEvents.AUTHENTICATION_REQUIRED;
export declare const BRIDGE_DOWN = XMPPEvents.BRIDGE_DOWN;
export declare const CALL_ACCEPTED = XMPPEvents.CALL_ACCEPTED;
export declare const CALL_INCOMING = XMPPEvents.CALL_INCOMING;
export declare const CALL_ENDED = XMPPEvents.CALL_ENDED;
export declare const CHAT_ERROR_RECEIVED = XMPPEvents.CHAT_ERROR_RECEIVED;
export declare const SETTINGS_ERROR_RECEIVED = XMPPEvents.SETTINGS_ERROR_RECEIVED;
export declare const CONFERENCE_PROPERTIES_CHANGED = XMPPEvents.CONFERENCE_PROPERTIES_CHANGED;
export declare const CONNECTION_ESTABLISHED = XMPPEvents.CONNECTION_ESTABLISHED;
export declare const CONNECTION_FAILED = XMPPEvents.CONNECTION_FAILED;
export declare const CONNECTION_INTERRUPTED = XMPPEvents.CONNECTION_INTERRUPTED;
export declare const CONNECTION_RESTORED = XMPPEvents.CONNECTION_RESTORED;
export declare const CONNECTION_ICE_FAILED = XMPPEvents.CONNECTION_ICE_FAILED;
export declare const CONNECTION_RESTARTED = XMPPEvents.CONNECTION_RESTARTED;
export declare const CONNECTION_STATUS_CHANGED = XMPPEvents.CONNECTION_STATUS_CHANGED;
export declare const DISPLAY_NAME_CHANGED = XMPPEvents.DISPLAY_NAME_CHANGED;
export declare const EMUC_ROOM_ADDED = XMPPEvents.EMUC_ROOM_ADDED;
export declare const EMUC_ROOM_REMOVED = XMPPEvents.EMUC_ROOM_REMOVED;
export declare const ETHERPAD = XMPPEvents.ETHERPAD;
export declare const FOCUS_DISCONNECTED = XMPPEvents.FOCUS_DISCONNECTED;
export declare const FOCUS_LEFT = XMPPEvents.FOCUS_LEFT;
export declare const GRACEFUL_SHUTDOWN = XMPPEvents.GRACEFUL_SHUTDOWN;
export declare const ICE_RESTARTING = XMPPEvents.ICE_RESTARTING;
export declare const ICE_RESTART_SUCCESS = XMPPEvents.ICE_RESTART_SUCCESS;
export declare const KICKED = XMPPEvents.KICKED;
export declare const LOCAL_ROLE_CHANGED = XMPPEvents.LOCAL_ROLE_CHANGED;
export declare const MEETING_ID_SET = XMPPEvents.MEETING_ID_SET;
export declare const MESSAGE_RECEIVED = XMPPEvents.MESSAGE_RECEIVED;
export declare const INVITE_MESSAGE_RECEIVED = XMPPEvents.INVITE_MESSAGE_RECEIVED;
export declare const PRIVATE_MESSAGE_RECEIVED = XMPPEvents.PRIVATE_MESSAGE_RECEIVED;
export declare const MUC_MEMBER_BOT_TYPE_CHANGED = XMPPEvents.MUC_MEMBER_BOT_TYPE_CHANGED;
export declare const MUC_DESTROYED = XMPPEvents.MUC_DESTROYED;
export declare const MUC_JOIN_IN_PROGRESS = XMPPEvents.MUC_JOIN_IN_PROGRESS;
export declare const MUC_JOINED = XMPPEvents.MUC_JOINED;
export declare const MUC_MEMBER_JOINED = XMPPEvents.MUC_MEMBER_JOINED;
export declare const MUC_MEMBER_LEFT = XMPPEvents.MUC_MEMBER_LEFT;
export declare const MUC_LOBBY_MEMBER_JOINED = XMPPEvents.MUC_LOBBY_MEMBER_JOINED;
export declare const MUC_LOBBY_MEMBER_UPDATED = XMPPEvents.MUC_LOBBY_MEMBER_UPDATED;
export declare const MUC_LOBBY_MEMBER_LEFT = XMPPEvents.MUC_LOBBY_MEMBER_LEFT;
export declare const MUC_DENIED_ACCESS = XMPPEvents.MUC_DENIED_ACCESS;
export declare const MUC_LEFT = XMPPEvents.MUC_LEFT;
export declare const MUC_ROLE_CHANGED = XMPPEvents.MUC_ROLE_CHANGED;
export declare const MUC_LOCK_CHANGED = XMPPEvents.MUC_LOCK_CHANGED;
export declare const MUC_MEMBERS_ONLY_CHANGED = XMPPEvents.MUC_MEMBERS_ONLY_CHANGED;
export declare const PARTICIPANT_AUDIO_MUTED = XMPPEvents.PARTICIPANT_AUDIO_MUTED;
export declare const PARTICIPANT_VIDEO_MUTED = XMPPEvents.PARTICIPANT_VIDEO_MUTED;
export declare const PARTICIPANT_VIDEO_TYPE_CHANGED = XMPPEvents.PARTICIPANT_VIDEO_TYPE_CHANGED;
export declare const PARTICIPANT_FEATURES_CHANGED = XMPPEvents.PARTICIPANT_FEATURES_CHANGED;
export declare const PASSWORD_REQUIRED = XMPPEvents.PASSWORD_REQUIRED;
export declare const PHONE_NUMBER_CHANGED = XMPPEvents.PHONE_NUMBER_CHANGED;
export declare const PRESENCE_RECEIVED = XMPPEvents.PRESENCE_RECEIVED;
export declare const PRESENCE_STATUS = XMPPEvents.PRESENCE_STATUS;
export declare const PROMPT_FOR_LOGIN = XMPPEvents.PROMPT_FOR_LOGIN;
export declare const READY_TO_JOIN = XMPPEvents.READY_TO_JOIN;
export declare const RECORDER_STATE_CHANGED = XMPPEvents.RECORDER_STATE_CHANGED;
export declare const REMOTE_STATS = XMPPEvents.REMOTE_STATS;
export declare const RENEGOTIATION_FAILED = XMPPEvents.RENEGOTIATION_FAILED;
export declare const RESERVATION_ERROR = XMPPEvents.RESERVATION_ERROR;
export declare const ROOM_CONNECT_ERROR = XMPPEvents.ROOM_CONNECT_ERROR;
export declare const ROOM_CONNECT_NOT_ALLOWED_ERROR = XMPPEvents.ROOM_CONNECT_NOT_ALLOWED_ERROR;
export declare const ROOM_JOIN_ERROR = XMPPEvents.ROOM_JOIN_ERROR;
export declare const ROOM_CONNECT_MEMBERS_ONLY_ERROR = XMPPEvents.ROOM_CONNECT_MEMBERS_ONLY_ERROR;
export declare const ROOM_MAX_USERS_ERROR = XMPPEvents.ROOM_MAX_USERS_ERROR;
export declare const SENDING_CHAT_MESSAGE = XMPPEvents.SENDING_CHAT_MESSAGE;
export declare const SENDING_PRIVATE_CHAT_MESSAGE = XMPPEvents.SENDING_PRIVATE_CHAT_MESSAGE;
export declare const SESSION_ACCEPT = XMPPEvents.SESSION_ACCEPT;
export declare const SESSION_ACCEPT_ERROR = XMPPEvents.SESSION_ACCEPT_ERROR;
export declare const SESSION_ACCEPT_TIMEOUT = XMPPEvents.SESSION_ACCEPT_TIMEOUT;
export declare const SOURCE_ADD = XMPPEvents.SOURCE_ADD;
export declare const SOURCE_ADD_ERROR = XMPPEvents.SOURCE_ADD_ERROR;
export declare const SOURCE_REMOVE = XMPPEvents.SOURCE_REMOVE;
export declare const SOURCE_REMOVE_ERROR = XMPPEvents.SOURCE_REMOVE_ERROR;
export declare const SPEAKER_STATS_RECEIVED = XMPPEvents.SPEAKER_STATS_RECEIVED;
export declare const CONFERENCE_TIMESTAMP_RECEIVED = XMPPEvents.CONFERENCE_TIMESTAMP_RECEIVED;
export declare const AV_MODERATION_APPROVED = XMPPEvents.AV_MODERATION_APPROVED;
export declare const AV_MODERATION_REJECTED = XMPPEvents.AV_MODERATION_REJECTED;
export declare const AV_MODERATION_RECEIVED = XMPPEvents.AV_MODERATION_RECEIVED;
export declare const AV_MODERATION_CHANGED = XMPPEvents.AV_MODERATION_CHANGED;
export declare const AV_MODERATION_PARTICIPANT_APPROVED = XMPPEvents.AV_MODERATION_PARTICIPANT_APPROVED;
export declare const AV_MODERATION_PARTICIPANT_REJECTED = XMPPEvents.AV_MODERATION_PARTICIPANT_REJECTED;
export declare const BREAKOUT_ROOMS_MOVE_TO_ROOM = XMPPEvents.BREAKOUT_ROOMS_MOVE_TO_ROOM;
export declare const BREAKOUT_ROOMS_EVENT = XMPPEvents.BREAKOUT_ROOMS_EVENT;
export declare const BREAKOUT_ROOMS_UPDATED = XMPPEvents.BREAKOUT_ROOMS_UPDATED;
export declare const START_MUTED_FROM_FOCUS = XMPPEvents.START_MUTED_FROM_FOCUS;
export declare const SUBJECT_CHANGED = XMPPEvents.SUBJECT_CHANGED;
export declare const SUSPEND_DETECTED = XMPPEvents.SUSPEND_DETECTED;
export declare const TRANSCRIPTION_STATUS_CHANGED = XMPPEvents.TRANSCRIPTION_STATUS_CHANGED;
export declare const TRANSPORT_INFO = XMPPEvents.TRANSPORT_INFO;
export declare const VIDEO_SIP_GW_AVAILABILITY_CHANGED = XMPPEvents.VIDEO_SIP_GW_AVAILABILITY_CHANGED;
export declare const VIDEO_SIP_GW_SESSION_STATE_CHANGED = XMPPEvents.VIDEO_SIP_GW_SESSION_STATE_CHANGED;
export declare const ICE_CONNECTION_STATE_CHANGED = XMPPEvents.ICE_CONNECTION_STATE_CHANGED;
export declare const JSON_MESSAGE_RECEIVED = XMPPEvents.JSON_MESSAGE_RECEIVED;
export default XMPPEvents;
