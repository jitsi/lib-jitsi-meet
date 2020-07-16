const XMPPEvents = {
    /**
     * Indicates error while adding ice candidate.
     */
    ADD_ICE_CANDIDATE_FAILED: 'xmpp.add_ice_candidate_failed',

    // Designates an event indicating that the focus has asked us to mute our
    // audio.
    AUDIO_MUTED_BY_FOCUS: 'xmpp.audio_muted_by_focus',
    AUTHENTICATION_REQUIRED: 'xmpp.authentication_required',
    BRIDGE_DOWN: 'xmpp.bridge_down',

    /**
     * Triggered when 'session-accept' is received from the responder.
     */
    CALL_ACCEPTED: 'xmpp.callaccepted.jingle',

    // Designates an event indicating that an offer (e.g. Jingle
    // session-initiate) was received.
    CALL_INCOMING: 'xmpp.callincoming.jingle',

    // Triggered when Jicofo kills our media session, this can happen while
    // we're still in the MUC, when it decides to terminate the media session.
    // For example when the session is idle for too long, because we're the only
    // person in the conference room.
    CALL_ENDED: 'xmpp.callended.jingle',
    CHAT_ERROR_RECEIVED: 'xmpp.chat_error_received',

    // The conference properties (as advertised by jicofo) have changed
    CONFERENCE_PROPERTIES_CHANGED: 'xmpp.conference_properties_changed',

    /**
     * This event is triggered when the ICE connects for the first time.
     */
    CONNECTION_ESTABLISHED: 'xmpp.connection.connected',

    // Designates an event indicating that the connection to the XMPP server
    // failed.
    CONNECTION_FAILED: 'xmpp.connection.failed',

    // Designates an event indicating that the media (ICE) connection was
    // interrupted. This should go to the RTC module.
    CONNECTION_INTERRUPTED: 'xmpp.connection.interrupted',

    // Designates an event indicating that the media (ICE) connection was
    // restored. This should go to the RTC module.
    CONNECTION_RESTORED: 'xmpp.connection.restored',

    // Designates an event indicating that the media (ICE) connection failed.
    // This should go to the RTC module.
    CONNECTION_ICE_FAILED: 'xmpp.connection.ice.failed',

    /**
     * Designates an event indicating connection status changes.
     */
    CONNECTION_STATUS_CHANGED: 'xmpp.connection.status.changed',

    // Designates an event indicating that the display name of a participant
    // has changed.
    DISPLAY_NAME_CHANGED: 'xmpp.display_name_changed',

    /**
     * Chat room instance have been added to Strophe.emuc plugin.
     */
    EMUC_ROOM_ADDED: 'xmpp.emuc_room_added',

    /**
     * Chat room instance have been removed from Strophe.emuc plugin.
     */
    EMUC_ROOM_REMOVED: 'xmpp.emuc_room_removed',
    ETHERPAD: 'xmpp.etherpad',
    FOCUS_DISCONNECTED: 'xmpp.focus_disconnected',
    FOCUS_LEFT: 'xmpp.focus_left',
    GRACEFUL_SHUTDOWN: 'xmpp.graceful_shutdown',

    /**
     * Event fired when 'transport-replace' Jingle message has been received,
     * before the new offer is set on the PeerConnection.
     */
    ICE_RESTARTING: 'rtc.ice_restarting',

    /**
     * Event fired after the 'transport-replace' message has been processed
     * and the new offer has been set successfully.
     */
    ICE_RESTART_SUCCESS: 'rtc.ice_restart_success',

    /**
     * Designates an event indicating that we were kicked from the XMPP MUC.
     * @param {boolean} isSelfPresence - whether it is for local participant
     * or another participant.
     * @param {string} actorJid - the jid of the participant who was initator
     * of the kick.
     * @param {?string} participantJid - when it is not a kick for local participant,
     * this is the jid of the participant which was kicked.
     */
    KICKED: 'xmpp.kicked',

    // Designates an event indicating that our role in the XMPP MUC has changed.
    LOCAL_ROLE_CHANGED: 'xmpp.localrole_changed',

    /**
     * Event fired when the unique meeting id is set.
     */
    MEETING_ID_SET: 'xmpp.meeting_id_set',

    // Designates an event indicating that an XMPP message in the MUC was
    // received.
    MESSAGE_RECEIVED: 'xmpp.message_received',

    // Designates an event indicating that an invite XMPP message in the MUC was
    // received.
    INVITE_MESSAGE_RECEIVED: 'xmpp.invite_message_received',

    // Designates an event indicating that a private XMPP message in the MUC was
    // received.
    PRIVATE_MESSAGE_RECEIVED: 'xmpp.private_message_received',

    // Designates an event indicating that a bot participant type had changed
    MUC_MEMBER_BOT_TYPE_CHANGED: 'xmpp.muc_member_bot_type_changed',

    // Designates an event indicating that the XMPP MUC was destroyed.
    MUC_DESTROYED: 'xmpp.muc_destroyed',

    // Designates an event indicating that we have joined the XMPP MUC.
    MUC_JOINED: 'xmpp.muc_joined',

    // Designates an event indicating that a participant joined the XMPP MUC.
    MUC_MEMBER_JOINED: 'xmpp.muc_member_joined',

    // Designates an event indicating that a participant left the XMPP MUC.
    MUC_MEMBER_LEFT: 'xmpp.muc_member_left',

    // Designates an event indicating that a participant joined the lobby XMPP MUC.
    MUC_LOBBY_MEMBER_JOINED: 'xmpp.muc_lobby_member_joined',

    // Designates an event indicating that a participant in the lobby XMPP MUC has been updated
    MUC_LOBBY_MEMBER_UPDATED: 'xmpp.muc_lobby_member_updated',

    // Designates an event indicating that a participant left the XMPP MUC.
    MUC_LOBBY_MEMBER_LEFT: 'xmpp.muc_lobby_member_left',

    // Designates an event indicating that a participant was denied access to a conference from the lobby XMPP MUC.
    MUC_DENIED_ACCESS: 'xmpp.muc_denied access',

    // Designates an event indicating that local participant left the muc
    MUC_LEFT: 'xmpp.muc_left',

    // Designates an event indicating that the MUC role of a participant has
    // changed.
    MUC_ROLE_CHANGED: 'xmpp.muc_role_changed',

    // Designates an event indicating that the MUC has been locked or unlocked.
    MUC_LOCK_CHANGED: 'xmpp.muc_lock_changed',

    // Designates an event indicating that the MUC members only config has changed.
    MUC_MEMBERS_ONLY_CHANGED: 'xmpp.muc_members_only_changed',

    // Designates an event indicating that a participant in the XMPP MUC has
    // advertised that they have audio muted (or unmuted).
    PARTICIPANT_AUDIO_MUTED: 'xmpp.audio_muted',

    // Designates an event indicating that a participant in the XMPP MUC has
    // advertised that they have video muted (or unmuted).
    PARTICIPANT_VIDEO_MUTED: 'xmpp.video_muted',

    // Designates an event indicating that the video type (e.g. 'camera' or
    // 'screen') for a participant has changed.
    // Note: currently this event fires every time we receive presence from
    // someone (regardless of whether or not the "video type" changed).
    PARTICIPANT_VIDEO_TYPE_CHANGED: 'xmpp.video_type',

    /**
     * Indicates that the features of the participant has been changed.
     */
    PARTCIPANT_FEATURES_CHANGED: 'xmpp.partcipant_features_changed',
    PASSWORD_REQUIRED: 'xmpp.password_required',
    PEERCONNECTION_READY: 'xmpp.peerconnection_ready',

    /**
     * Indicates that phone number changed.
     */
    PHONE_NUMBER_CHANGED: 'conference.phoneNumberChanged',
    PRESENCE_RECEIVED: 'xmpp.presence_received',
    PRESENCE_STATUS: 'xmpp.presence_status',
    PROMPT_FOR_LOGIN: 'xmpp.prompt_for_login',

    // xmpp is connected and obtained user media
    READY_TO_JOIN: 'xmpp.ready_to_join',

    /**
     * Indicates that recording state changed.
     */
    RECORDER_STATE_CHANGED: 'xmpp.recorderStateChanged',

    // Designates an event indicating that we received statistics from a
    // participant in the MUC.
    REMOTE_STATS: 'xmpp.remote_stats',

    /**
     * Indicates that the offer / answer renegotiation has failed.
     */
    RENEGOTIATION_FAILED: 'xmpp.renegotiation_failed',
    RESERVATION_ERROR: 'xmpp.room_reservation_error',
    ROOM_CONNECT_ERROR: 'xmpp.room_connect_error',
    ROOM_CONNECT_NOT_ALLOWED_ERROR: 'xmpp.room_connect_error.not_allowed',
    ROOM_JOIN_ERROR: 'xmpp.room_join_error',
    ROOM_CONNECT_MEMBERS_ONLY_ERROR: 'xmpp.room_connect_error.members_only',

    /**
     * Indicates that max users limit has been reached.
     */
    ROOM_MAX_USERS_ERROR: 'xmpp.room_max_users_error',

    // Designates an event indicating that we sent an XMPP message to the MUC.
    SENDING_CHAT_MESSAGE: 'xmpp.sending_chat_message',

    // Designates an event indicating that we sent a private XMPP message to
    // a specific user of the muc.
    SENDING_PRIVATE_CHAT_MESSAGE: 'xmpp.sending_private_chat_message',

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
    SESSION_ACCEPT_TIMEOUT: 'xmpp.session_accept_timeout',

    /**
     * Event fired when speaker stats update message is received.
     */
    SPEAKER_STATS_RECEIVED: 'xmpp.speaker_stats_received',

    /**
     * Event fired when conference creation timestamp is received.
     */
    CONFERENCE_TIMESTAMP_RECEIVED: 'xmpp.conference_timestamp_received',

    // Designates an event indicating that we should join the conference with
    // audio and/or video muted.
    START_MUTED_FROM_FOCUS: 'xmpp.start_muted_from_focus',

    // Designates an event indicating that the subject of the XMPP MUC has
    // changed.
    SUBJECT_CHANGED: 'xmpp.subject_changed',

    // FIXME: how does it belong to XMPP ? - it's detected by the PeerConnection
    // suspending detected
    SUSPEND_DETECTED: 'xmpp.suspend_detected',

    /**
     * Notifies for transcription status changes. The event provides the
     * following parameters to its listeners:
     *
     * @param {String} status - The new status.
     */
    TRANSCRIPTION_STATUS_CHANGED: 'xmpp.transcription_status_changed',

    /**
     * Event fired when 'transport-info' with new ICE candidates is received.
     */
    TRANSPORT_INFO: 'xmpp.transportinfo.jingle',

    /**
     * Indicates that video SIP GW state changed.
     *
     * @param {VideoSIPGWConstants} status - Any of the following statuses:
     * STATUS_BUSY, STATUS_AVAILABLE or STATUS_UNDEFINED.
     */
    VIDEO_SIP_GW_AVAILABILITY_CHANGED: 'xmpp.videoSIPGWAvailabilityChanged',

    /**
     * Indicates that video SIP GW Session state changed.
     * The statuses are any of the following statuses:
     * STATE_ON, STATE_OFF, STATE_PENDING, STATE_RETRYING, STATE_FAILED.
     * {@see VideoSIPGWConstants}
     *
     * @param {options} event - {address, oldState, newState, displayName}.
     */
    VIDEO_SIP_GW_SESSION_STATE_CHANGED:
        'xmpp.videoSIPGWSessionStateChanged',

    // Designates an event indicating that the local ICE connection state has
    // changed.
    ICE_CONNECTION_STATE_CHANGED: 'xmpp.ice_connection_state_changed',

    /**
     * Event which is emitted when the body in an XMPP message in the MUC
     * contains JSON
     */
    JSON_MESSAGE_RECEIVED: 'xmmp.json_message_received'
};

module.exports = XMPPEvents;
