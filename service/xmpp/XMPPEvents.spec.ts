import * as exported from "./XMPPEvents";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/xmpp/XMPPEvents members", () => {
    const {
        XMPPEvents,
        ...others
    } = exported;

    it( "known members", () => {
        expect( XMPPEvents ).toBeDefined();

        expect( XMPPEvents.ADD_ICE_CANDIDATE_FAILED ).toBe( 'xmpp.add_ice_candidate_failed' );
        expect( XMPPEvents.AUDIO_MUTED_BY_FOCUS ).toBe( 'xmpp.audio_muted_by_focus' );
        expect( XMPPEvents.VIDEO_MUTED_BY_FOCUS ).toBe( 'xmpp.video_muted_by_focus' );
        expect( XMPPEvents.AUTHENTICATION_REQUIRED ).toBe( 'xmpp.authentication_required' );
        expect( XMPPEvents.BRIDGE_DOWN ).toBe( 'xmpp.bridge_down' );
        expect( XMPPEvents.CALL_ACCEPTED ).toBe( 'xmpp.callaccepted.jingle' );
        expect( XMPPEvents.CALL_INCOMING ).toBe( 'xmpp.callincoming.jingle' );
        expect( XMPPEvents.CALL_ENDED ).toBe( 'xmpp.callended.jingle' );
        expect( XMPPEvents.CHAT_ERROR_RECEIVED ).toBe( 'xmpp.chat_error_received' );
        expect( XMPPEvents.SETTINGS_ERROR_RECEIVED ).toBe( 'xmpp.settings_error_received' );
        expect( XMPPEvents.CONFERENCE_PROPERTIES_CHANGED ).toBe( 'xmpp.conference_properties_changed' );
        expect( XMPPEvents.CONNECTION_ESTABLISHED ).toBe( 'xmpp.connection.connected' );
        expect( XMPPEvents.CONNECTION_FAILED ).toBe( 'xmpp.connection.failed' );
        expect( XMPPEvents.CONNECTION_INTERRUPTED ).toBe( 'xmpp.connection.interrupted' );
        expect( XMPPEvents.CONNECTION_RESTORED ).toBe( 'xmpp.connection.restored' );
        expect( XMPPEvents.CONNECTION_ICE_FAILED ).toBe( 'xmpp.connection.ice.failed' );
        expect( XMPPEvents.CONNECTION_RESTARTED ).toBe( 'xmpp.connection.restart' );
        expect( XMPPEvents.CONNECTION_STATUS_CHANGED ).toBe( 'xmpp.connection.status.changed' );
        expect( XMPPEvents.DISPLAY_NAME_CHANGED ).toBe( 'xmpp.display_name_changed' );
        expect( XMPPEvents.EMUC_ROOM_ADDED ).toBe( 'xmpp.emuc_room_added' );
        expect( XMPPEvents.EMUC_ROOM_REMOVED ).toBe( 'xmpp.emuc_room_removed' );
        expect( XMPPEvents.ETHERPAD ).toBe( 'xmpp.etherpad' );
        expect( XMPPEvents.FOCUS_DISCONNECTED ).toBe( 'xmpp.focus_disconnected' );
        expect( XMPPEvents.FOCUS_LEFT ).toBe( 'xmpp.focus_left' );
        expect( XMPPEvents.GRACEFUL_SHUTDOWN ).toBe( 'xmpp.graceful_shutdown' );
        expect( XMPPEvents.ICE_RESTARTING ).toBe( 'rtc.ice_restarting' );
        expect( XMPPEvents.ICE_RESTART_SUCCESS ).toBe( 'rtc.ice_restart_success' );
        expect( XMPPEvents.KICKED ).toBe( 'xmpp.kicked' );
        expect( XMPPEvents.LOCAL_ROLE_CHANGED ).toBe( 'xmpp.localrole_changed' );
        expect( XMPPEvents.MEETING_ID_SET ).toBe( 'xmpp.meeting_id_set' );
        expect( XMPPEvents.MESSAGE_RECEIVED ).toBe( 'xmpp.message_received' );
        expect( XMPPEvents.INVITE_MESSAGE_RECEIVED ).toBe( 'xmpp.invite_message_received' );
        expect( XMPPEvents.PRIVATE_MESSAGE_RECEIVED ).toBe( 'xmpp.private_message_received' );
        expect( XMPPEvents.MUC_MEMBER_BOT_TYPE_CHANGED ).toBe( 'xmpp.muc_member_bot_type_changed' );
        expect( XMPPEvents.MUC_DESTROYED ).toBe( 'xmpp.muc_destroyed' );
        expect( XMPPEvents.MUC_JOIN_IN_PROGRESS ).toBe( 'xmpp.muc_join_in_progress' );
        expect( XMPPEvents.MUC_JOINED ).toBe( 'xmpp.muc_joined' );
        expect( XMPPEvents.MUC_MEMBER_JOINED ).toBe( 'xmpp.muc_member_joined' );
        expect( XMPPEvents.MUC_MEMBER_LEFT ).toBe( 'xmpp.muc_member_left' );
        expect( XMPPEvents.MUC_LOBBY_MEMBER_JOINED ).toBe( 'xmpp.muc_lobby_member_joined' );
        expect( XMPPEvents.MUC_LOBBY_MEMBER_UPDATED ).toBe( 'xmpp.muc_lobby_member_updated' );
        expect( XMPPEvents.MUC_LOBBY_MEMBER_LEFT ).toBe( 'xmpp.muc_lobby_member_left' );
        expect( XMPPEvents.MUC_DENIED_ACCESS ).toBe( 'xmpp.muc_denied access' );
        expect( XMPPEvents.MUC_LEFT ).toBe( 'xmpp.muc_left' );
        expect( XMPPEvents.MUC_ROLE_CHANGED ).toBe( 'xmpp.muc_role_changed' );
        expect( XMPPEvents.MUC_LOCK_CHANGED ).toBe( 'xmpp.muc_lock_changed' );
        expect( XMPPEvents.MUC_MEMBERS_ONLY_CHANGED ).toBe( 'xmpp.muc_members_only_changed' );
        expect( XMPPEvents.PARTICIPANT_AUDIO_MUTED ).toBe( 'xmpp.audio_muted' );
        expect( XMPPEvents.PARTICIPANT_VIDEO_MUTED ).toBe( 'xmpp.video_muted' );
        expect( XMPPEvents.PARTICIPANT_VIDEO_TYPE_CHANGED ).toBe( 'xmpp.video_type' );
        expect( XMPPEvents.PARTICIPANT_FEATURES_CHANGED ).toBe( 'xmpp.participant_features_changed' );
        expect( XMPPEvents.PASSWORD_REQUIRED ).toBe( 'xmpp.password_required' );
        expect( XMPPEvents.PHONE_NUMBER_CHANGED ).toBe( 'conference.phoneNumberChanged' );
        expect( XMPPEvents.PRESENCE_RECEIVED ).toBe( 'xmpp.presence_received' );
        expect( XMPPEvents.PRESENCE_STATUS ).toBe( 'xmpp.presence_status' );
        expect( XMPPEvents.PROMPT_FOR_LOGIN ).toBe( 'xmpp.prompt_for_login' );
        expect( XMPPEvents.READY_TO_JOIN ).toBe( 'xmpp.ready_to_join' );
        expect( XMPPEvents.RECORDER_STATE_CHANGED ).toBe( 'xmpp.recorderStateChanged' );
        expect( XMPPEvents.REMOTE_STATS ).toBe( 'xmpp.remote_stats' );
        expect( XMPPEvents.RENEGOTIATION_FAILED ).toBe( 'xmpp.renegotiation_failed' );
        expect( XMPPEvents.RESERVATION_ERROR ).toBe( 'xmpp.room_reservation_error' );
        expect( XMPPEvents.ROOM_CONNECT_ERROR ).toBe( 'xmpp.room_connect_error' );
        expect( XMPPEvents.ROOM_CONNECT_NOT_ALLOWED_ERROR ).toBe( 'xmpp.room_connect_error.not_allowed' );
        expect( XMPPEvents.ROOM_JOIN_ERROR ).toBe( 'xmpp.room_join_error' );
        expect( XMPPEvents.ROOM_CONNECT_MEMBERS_ONLY_ERROR ).toBe( 'xmpp.room_connect_error.members_only' );
        expect( XMPPEvents.ROOM_MAX_USERS_ERROR ).toBe( 'xmpp.room_max_users_error' );
        expect( XMPPEvents.SENDING_CHAT_MESSAGE ).toBe( 'xmpp.sending_chat_message' );
        expect( XMPPEvents.SENDING_PRIVATE_CHAT_MESSAGE ).toBe( 'xmpp.sending_private_chat_message' );
        expect( XMPPEvents.SESSION_ACCEPT ).toBe( 'xmpp.session_accept' );
        expect( XMPPEvents.SESSION_ACCEPT_ERROR ).toBe( 'xmpp.session_accept_error' );
        expect( XMPPEvents.SESSION_ACCEPT_TIMEOUT ).toBe( 'xmpp.session_accept_timeout' );
        expect( XMPPEvents.SOURCE_ADD ).toBe( 'xmpp.source_add' );
        expect( XMPPEvents.SOURCE_ADD_ERROR ).toBe( 'xmpp.source_add_error' );
        expect( XMPPEvents.SOURCE_REMOVE ).toBe( 'xmpp.source_remove' );
        expect( XMPPEvents.SOURCE_REMOVE_ERROR ).toBe( 'xmpp.source_remove_error' );
        expect( XMPPEvents.SPEAKER_STATS_RECEIVED ).toBe( 'xmpp.speaker_stats_received' );
        expect( XMPPEvents.CONFERENCE_TIMESTAMP_RECEIVED ).toBe( 'xmpp.conference_timestamp_received' );
        expect( XMPPEvents.AV_MODERATION_APPROVED ).toBe( 'xmpp.av_moderation.approved' );
        expect( XMPPEvents.AV_MODERATION_REJECTED ).toBe( 'xmpp.av_moderation.rejected' );
        expect( XMPPEvents.AV_MODERATION_RECEIVED ).toBe( 'xmpp.av_moderation.received' );
        expect( XMPPEvents.AV_MODERATION_CHANGED ).toBe( 'xmpp.av_moderation.changed' );
        expect( XMPPEvents.AV_MODERATION_PARTICIPANT_APPROVED ).toBe( 'xmpp.av_moderation.participant.approved' );
        expect( XMPPEvents.AV_MODERATION_PARTICIPANT_REJECTED ).toBe( 'xmpp.av_moderation.participant.rejected' );
        expect( XMPPEvents.BREAKOUT_ROOMS_MOVE_TO_ROOM ).toBe( 'xmpp.breakout-rooms.move-to-room' );
        expect( XMPPEvents.BREAKOUT_ROOMS_EVENT ).toBe( 'xmpp.breakout-rooms.event' );
        expect( XMPPEvents.BREAKOUT_ROOMS_UPDATED ).toBe( 'xmpp.breakout-rooms.updated' );
        expect( XMPPEvents.START_MUTED_FROM_FOCUS ).toBe( 'xmpp.start_muted_from_focus' );
        expect( XMPPEvents.SUBJECT_CHANGED ).toBe( 'xmpp.subject_changed' );
        expect( XMPPEvents.SUSPEND_DETECTED ).toBe( 'xmpp.suspend_detected' );
        expect( XMPPEvents.TRANSCRIPTION_STATUS_CHANGED ).toBe( 'xmpp.transcription_status_changed' );
        expect( XMPPEvents.TRANSPORT_INFO ).toBe( 'xmpp.transportinfo.jingle' );
        expect( XMPPEvents.VIDEO_SIP_GW_AVAILABILITY_CHANGED ).toBe( 'xmpp.videoSIPGWAvailabilityChanged' );
        expect( XMPPEvents.VIDEO_SIP_GW_SESSION_STATE_CHANGED ).toBe( 'xmpp.videoSIPGWSessionStateChanged' );
        expect( XMPPEvents.ICE_CONNECTION_STATE_CHANGED ).toBe( 'xmpp.ice_connection_state_changed' );
        expect( XMPPEvents.JSON_MESSAGE_RECEIVED ).toBe( 'xmmp.json_message_received' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );