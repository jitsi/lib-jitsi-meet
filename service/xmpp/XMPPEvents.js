var XMPPEvents = {
    /**
     * Indicates error while adding ice candidate.
     */
    ADD_ICE_CANDIDATE_FAILED: "xmpp.add_ice_candidate_failed",
    // Designates an event indicating that the focus has asked us to mute our
    // audio.
    AUDIO_MUTED_BY_FOCUS: "xmpp.audio_muted_by_focus",
    AUTHENTICATION_REQUIRED: "xmpp.authentication_required",
    BRIDGE_DOWN: "xmpp.bridge_down",
    // Designates an event indicating that an offer (e.g. Jingle
    // session-initiate) was received.
    CALL_INCOMING: "xmpp.callincoming.jingle",
    // Triggered when Jicofo kills our media session, this can happen while
    // we're still in the MUC, when it decides to terminate the media session.
    // For example when the session is idle for too long, because we're the only
    // person in the conference room.
    CALL_ENDED: "xmpp.callended.jingle",
    CHAT_ERROR_RECEIVED: "xmpp.chat_error_received",
    CONFERENCE_SETUP_FAILED: "xmpp.conference_setup_failed",
    // Designates an event indicating that the connection to the XMPP server
    // failed.
    CONNECTION_FAILED: "xmpp.connection.failed",
    // Designates an event indicating that the media (ICE) connection was
    // interrupted. This should go to the RTC module.
    CONNECTION_INTERRUPTED: "xmpp.connection.interrupted",
    // Designates an event indicating that the media (ICE) connection was
    // restored. This should go to the RTC module.
    CONNECTION_RESTORED: "xmpp.connection.restored",
    // Designates an event indicating that the media (ICE) connection failed.
    // This should go to the RTC module.
    CONNECTION_ICE_FAILED: "xmpp.connection.ice.failed",
    // TODO: only used in a hack, should probably be removed.
    CREATE_ANSWER_ERROR: 'xmpp.create_answer_error',
    /**
     * Indicates error while create answer call.
     */
    CREATE_ANSWER_FAILED: "xmpp.create_answer_failed",
    /**
     * Indicates error while create offer call.
     */
    CREATE_OFFER_FAILED: "xmpp.create_offer_failed",
    // Designates an event indicating that the display name of a participant
    // has changed.
    DISPLAY_NAME_CHANGED: "xmpp.display_name_changed",
    /**
     * Chat room instance have been added to Strophe.emuc plugin.
     */
    EMUC_ROOM_ADDED: "xmpp.emuc_room_added",
    /**
     * Chat room instance have been removed from Strophe.emuc plugin.
     */
    EMUC_ROOM_REMOVED: "xmpp.emuc_room_removed",
    ETHERPAD: "xmpp.etherpad",
    FOCUS_DISCONNECTED: 'xmpp.focus_disconnected',
    FOCUS_LEFT: "xmpp.focus_left",
    GRACEFUL_SHUTDOWN: "xmpp.graceful_shutdown",
    /**
     * Event fired when 'transport-replace' Jingle message has been received,
     * before the new offer is set on the PeerConnection.
     */
    ICE_RESTARTING: "rtc.ice_restarting",
    /* Event fired when XMPP error is returned to any request, it is meant to be
     * used to report 'signaling' errors to CallStats
     *
     * {
     *   code: {XMPP error code}
     *   reason: {XMPP error condition}
     *   source = request.tree()
     *   session = {JingleSession instance}
     * }
     */
    JINGLE_ERROR: 'xmpp.jingle_error',
    // Event fired when we have failed to set initial offer
    JINGLE_FATAL_ERROR: 'xmpp.jingle_fatal_error',
    // Designates an event indicating that we were kicked from the XMPP MUC.
    KICKED: "xmpp.kicked",
    // Designates an event indicating that our role in the XMPP MUC has changed.
    LOCAL_ROLE_CHANGED: "xmpp.localrole_changed",
    // Designates an event indicating that an XMPP message in the MUC was
    // received.
    MESSAGE_RECEIVED: "xmpp.message_received",
    // Designates an event indicating that the XMPP MUC was destroyed.
    MUC_DESTROYED: "xmpp.muc_destroyed",
    // Designates an event indicating that we have joined the XMPP MUC.
    MUC_JOINED: "xmpp.muc_joined",
    // Designates an event indicating that a participant joined the XMPP MUC.
    MUC_MEMBER_JOINED: "xmpp.muc_member_joined",
    // Designates an event indicating that a participant left the XMPP MUC.
    MUC_MEMBER_LEFT: "xmpp.muc_member_left",
    // Designates an event indicating that local participant left the muc
    MUC_LEFT: "xmpp.muc_left",
    // Designates an event indicating that the MUC role of a participant has
    // changed.
    MUC_ROLE_CHANGED: "xmpp.muc_role_changed",
    // Designates an event indicating that the MUC has been locked or unlocked.
    MUC_LOCK_CHANGED: "xmpp.muc_lock_changed",
    // Designates an event indicating that a participant in the XMPP MUC has
    // advertised that they have audio muted (or unmuted).
    PARTICIPANT_AUDIO_MUTED: "xmpp.audio_muted",
    // Designates an event indicating that a participant in the XMPP MUC has
    // advertised that they have video muted (or unmuted).
    PARTICIPANT_VIDEO_MUTED: "xmpp.video_muted",
    // Designates an event indicating that the video type (e.g. 'camera' or
    // 'screen') for a participant has changed.
    // Note: currently this event fires every time we receive presence from
    // someone (regardless of whether or not the "video type" changed).
    PARTICIPANT_VIDEO_TYPE_CHANGED: "xmpp.video_type",
    /**
     * Indicates that the features of the participant has been changed.
     */
    PARTCIPANT_FEATURES_CHANGED: "xmpp.partcipant_features_changed",
    PASSWORD_REQUIRED: "xmpp.password_required",
    PEERCONNECTION_READY: "xmpp.peerconnection_ready",
    /**
     * Indicates that phone number changed.
     */
    PHONE_NUMBER_CHANGED: "conference.phoneNumberChanged",
    PRESENCE_STATUS: "xmpp.presence_status",
    PROMPT_FOR_LOGIN: 'xmpp.prompt_for_login',
    // xmpp is connected and obtained user media
    READY_TO_JOIN: 'xmpp.ready_to_join',
    /**
     * Indicates that recording state changed.
     */
    RECORDER_STATE_CHANGED: "xmpp.recorderStateChanged",
    // Designates an event indicating that we received statistics from a
    // participant in the MUC.
    REMOTE_STATS: "xmpp.remote_stats",
    /**
     * Event fired when we remote track is added to the conference.
     * The following structure is passed as an argument:
     * {
     *   stream: the WebRTC MediaStream instance
     *   track: the WebRTC MediaStreamTrack
     *   mediaType: the MediaType instance
     *   owner: the MUC JID of the stream owner
     *   muted: a boolean indicating initial 'muted' status of the track or
      *         'null' if unknown
     **/
    REMOTE_TRACK_ADDED: "xmpp.remote_track_added",
    /**
     * Indicates that the remote track has been removed from the conference.
     * 1st event argument is the ID of the parent WebRTC stream to which
     * the track being removed belongs to.
     * 2nd event argument is the ID of the removed track.
     */
    REMOTE_TRACK_REMOVED: "xmpp.remote_track_removed",
    RESERVATION_ERROR: "xmpp.room_reservation_error",
    ROOM_CONNECT_ERROR: 'xmpp.room_connect_error',
    ROOM_CONNECT_NOT_ALLOWED_ERROR: 'xmpp.room_connect_error.not_allowed',
    ROOM_JOIN_ERROR: 'xmpp.room_join_error',
    /**
     * Indicates that max users limit has been reached.
     */
    ROOM_MAX_USERS_ERROR: "xmpp.room_max_users_error",
    // Designates an event indicating that we sent an XMPP message to the MUC.
    SENDING_CHAT_MESSAGE: "xmpp.sending_chat_message",
    /**
     * Indicates that the local sendrecv streams in local SDP are changed.
     */
    SENDRECV_STREAMS_CHANGED: "xmpp.sendrecv_streams_changed",
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
    SESSION_ACCEPT_TIMEOUT: "xmpp.session_accept_timeout",
    // TODO: only used in a hack, should probably be removed.
    SET_LOCAL_DESCRIPTION_ERROR: 'xmpp.set_local_description_error',

    /**
     * Indicates error while set local description.
     */
    SET_LOCAL_DESCRIPTION_FAILED: "xmpp.set_local_description_failed",
    // TODO: only used in a hack, should probably be removed.
    SET_REMOTE_DESCRIPTION_ERROR: 'xmpp.set_remote_description_error',
    /**
     * Indicates error while set remote description.
     */
    SET_REMOTE_DESCRIPTION_FAILED: "xmpp.set_remote_description_failed",
    // Designates an event indicating that we should join the conference with
    // audio and/or video muted.
    START_MUTED_FROM_FOCUS: "xmpp.start_muted_from_focus",
    // Designates an event indicating that the subject of the XMPP MUC has
    // changed.
    SUBJECT_CHANGED: "xmpp.subject_changed",
    // suspending detected
    SUSPEND_DETECTED: "xmpp.suspend_detected",
    // Designates an event indicating that the local ICE username fragment of
    // the jingle session has changed.
    LOCAL_UFRAG_CHANGED: "xmpp.local_ufrag_changed",
    // Designates an event indicating that the local ICE username fragment of
    // the jingle session has changed.
    REMOTE_UFRAG_CHANGED: "xmpp.remote_ufrag_changed",
    // Designates an event indicating that the local ICE connection state has
    // changed.
    ICE_CONNECTION_STATE_CHANGED: "xmpp.ice_connection_state_changed"
};
module.exports = XMPPEvents;
