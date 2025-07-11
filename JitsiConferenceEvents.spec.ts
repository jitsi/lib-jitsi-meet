import * as exported from "./JitsiConferenceEvents";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/JitsiConferenceEvents members", () => {
    const {
        AUDIO_INPUT_STATE_CHANGE,
        AUDIO_UNMUTE_PERMISSIONS_CHANGED,
        AUTH_STATUS_CHANGED,
        BEFORE_STATISTICS_DISPOSED,
        BRIDGE_BWE_STATS_RECEIVED,
        CONFERENCE_ERROR,
        CONFERENCE_FAILED,
        CONFERENCE_JOIN_IN_PROGRESS,
        CONFERENCE_JOINED,
        CONFERENCE_LEFT,
        CONFERENCE_UNIQUE_ID_SET,
        CONFERENCE_VISITOR_CODECS_CHANGED,
        CONNECTION_ESTABLISHED,
        CONNECTION_INTERRUPTED,
        CONNECTION_RESTORED,
        DATA_CHANNEL_OPENED,
        DATA_CHANNEL_CLOSED,
        DISPLAY_NAME_CHANGED,
        DOMINANT_SPEAKER_CHANGED,
        CONFERENCE_CREATED_TIMESTAMP,
        DTMF_SUPPORT_CHANGED,
        E2EE_VERIFICATION_AVAILABLE,
        E2EE_VERIFICATION_READY,
        E2EE_VERIFICATION_COMPLETED,
        ENCODE_TIME_STATS_RECEIVED,
        ENDPOINT_MESSAGE_RECEIVED,
        ENDPOINT_STATS_RECEIVED,
        FILE_SHARING_FILES_RECEIVED,
        FILE_SHARING_FILE_ADDED,
        FILE_SHARING_FILE_REMOVED,
        JVB121_STATUS,
        KICKED,
        PARTICIPANT_KICKED,
        PARTICIPANT_SOURCE_UPDATED,
        PERMISSIONS_RECEIVED,
        LAST_N_ENDPOINTS_CHANGED,
        FORWARDED_SOURCES_CHANGED,
        LOCK_STATE_CHANGED,
        SERVER_REGION_CHANGED,
        _MEDIA_SESSION_STARTED,
        _MEDIA_SESSION_ACTIVE_CHANGED,
        MEMBERS_ONLY_CHANGED,
        MESSAGE_RECEIVED,
        NO_AUDIO_INPUT,
        NOISY_MIC,
        NON_PARTICIPANT_MESSAGE_RECEIVED,
        PRIVATE_MESSAGE_RECEIVED,
        PARTCIPANT_FEATURES_CHANGED,
        PARTICIPANT_PROPERTY_CHANGED,
        P2P_STATUS,
        PHONE_NUMBER_CHANGED,
        PROPERTIES_CHANGED,
        RECORDER_STATE_CHANGED,
        VIDEO_CODEC_CHANGED,
        VIDEO_SIP_GW_AVAILABILITY_CHANGED,
        VIDEO_SIP_GW_SESSION_STATE_CHANGED,
        START_MUTED_POLICY_CHANGED,
        SUBJECT_CHANGED,
        SUSPEND_DETECTED,
        TALK_WHILE_MUTED,
        TRACK_ADDED,
        TRACK_AUDIO_LEVEL_CHANGED,
        TRACK_MUTE_CHANGED,
        TRACK_REMOVED,
        TRACK_UNMUTE_REJECTED,
        TRANSCRIPTION_STATUS_CHANGED,
        USER_JOINED,
        USER_LEFT,
        USER_ROLE_CHANGED,
        USER_STATUS_CHANGED,
        VIDEO_UNMUTE_PERMISSIONS_CHANGED,
        VISITORS_MESSAGE,
        VISITORS_REJECTION,
        VISITORS_SUPPORTED_CHANGED,
        BOT_TYPE_CHANGED,
        LOBBY_USER_JOINED,
        LOBBY_USER_UPDATED,
        LOBBY_USER_LEFT,
        AV_MODERATION_APPROVED,
        AV_MODERATION_REJECTED,
        AV_MODERATION_CHANGED,
        AV_MODERATION_PARTICIPANT_APPROVED,
        AV_MODERATION_PARTICIPANT_REJECTED,
        BREAKOUT_ROOMS_MOVE_TO_ROOM,
        BREAKOUT_ROOMS_UPDATED,
        METADATA_UPDATED,
        SILENT_STATUS_CHANGED,
        REACTION_RECEIVED,
        JitsiConferenceEvents,
        ...others
    } = exported;

    it( "known members", () => {
        expect( AUDIO_INPUT_STATE_CHANGE ).toBe( 'conference.audio_input_state_changed' );
        expect( AUDIO_UNMUTE_PERMISSIONS_CHANGED ).toBe( 'conference.audio_unmute_permissions_changed' );
        expect( AUTH_STATUS_CHANGED ).toBe( 'conference.auth_status_changed' );
        expect( BEFORE_STATISTICS_DISPOSED ).toBe( 'conference.beforeStatisticsDisposed' );
        expect( BRIDGE_BWE_STATS_RECEIVED ).toBe( 'conference.bridgeBweStatsReceived' );
        expect( CONFERENCE_ERROR ).toBe( 'conference.error' );
        expect( CONFERENCE_FAILED ).toBe( 'conference.failed' );
        expect( CONFERENCE_JOIN_IN_PROGRESS ).toBe( 'conference.join_in_progress' );
        expect( CONFERENCE_JOINED ).toBe( 'conference.joined' );
        expect( CONFERENCE_LEFT ).toBe( 'conference.left' );
        expect( CONFERENCE_UNIQUE_ID_SET ).toBe( 'conference.unique_id_set' );
        expect( CONFERENCE_VISITOR_CODECS_CHANGED ).toBe( 'conference.visitor_codecs_changed' );
        expect( CONNECTION_ESTABLISHED ).toBe( 'conference.connectionEstablished' );
        expect( CONNECTION_INTERRUPTED ).toBe( 'conference.connectionInterrupted' );
        expect( CONNECTION_RESTORED ).toBe( 'conference.connectionRestored' );
        expect( DATA_CHANNEL_OPENED ).toBe( 'conference.dataChannelOpened' );
        expect( DATA_CHANNEL_CLOSED ).toBe( 'conference.dataChannelClosed' );
        expect( DISPLAY_NAME_CHANGED ).toBe( 'conference.displayNameChanged' );
        expect( DOMINANT_SPEAKER_CHANGED ).toBe( 'conference.dominantSpeaker' );
        expect( CONFERENCE_CREATED_TIMESTAMP ).toBe( 'conference.createdTimestamp' );
        expect( DTMF_SUPPORT_CHANGED ).toBe( 'conference.dtmfSupportChanged' );
        expect( ENDPOINT_MESSAGE_RECEIVED ).toBe( 'conference.endpoint_message_received' );
        expect( ENDPOINT_STATS_RECEIVED ).toBe( 'conference.endpoint_stats_received' );
        expect( FILE_SHARING_FILES_RECEIVED ).toBe( 'conference.file_sharing.files_received' );
        expect( FILE_SHARING_FILE_ADDED ).toBe( 'conference.file_sharing.file_added' );
        expect( FILE_SHARING_FILE_REMOVED ).toBe( 'conference.file_sharing.file_removed' );
        expect( JVB121_STATUS ).toBe( 'conference.jvb121Status' );
        expect( KICKED ).toBe( 'conference.kicked' );
        expect( PARTICIPANT_KICKED ).toBe( 'conference.participant_kicked' );
        expect( PARTICIPANT_SOURCE_UPDATED ).toBe( 'conference.participant_source_updated' );
        expect( PERMISSIONS_RECEIVED ).toBe( 'conference.permissions_received' );
        expect( LAST_N_ENDPOINTS_CHANGED ).toBe( 'conference.lastNEndpointsChanged' );
        expect( FORWARDED_SOURCES_CHANGED ).toBe( 'conference.forwardedSourcesChanged' );
        expect( LOCK_STATE_CHANGED ).toBe( 'conference.lock_state_changed' );
        expect( SERVER_REGION_CHANGED ).toBe( 'conference.server_region_changed' );
        expect( _MEDIA_SESSION_STARTED ).toBe( 'conference.media_session.started' );
        expect( _MEDIA_SESSION_ACTIVE_CHANGED ).toBe( 'conference.media_session.active_changed' );
        expect( MEMBERS_ONLY_CHANGED ).toBe( 'conference.membersOnlyChanged' );
        expect( MESSAGE_RECEIVED ).toBe( 'conference.messageReceived' );
        expect( NO_AUDIO_INPUT ).toBe( 'conference.no_audio_input' );
        expect( NOISY_MIC ).toBe( 'conference.noisy_mic' );
        expect( NON_PARTICIPANT_MESSAGE_RECEIVED ).toBe( 'conference.non_participant_message_received' );
        expect( PRIVATE_MESSAGE_RECEIVED ).toBe( 'conference.privateMessageReceived' );
        expect( PARTCIPANT_FEATURES_CHANGED ).toBe( 'conference.partcipant_features_changed' );
        expect( PARTICIPANT_PROPERTY_CHANGED ).toBe( 'conference.participant_property_changed' );
        expect( P2P_STATUS ).toBe( 'conference.p2pStatus' );
        expect( PHONE_NUMBER_CHANGED ).toBe( 'conference.phoneNumberChanged' );
        expect( PROPERTIES_CHANGED ).toBe( 'conference.propertiesChanged' );
        expect( RECORDER_STATE_CHANGED ).toBe( 'conference.recorderStateChanged' );
        expect( VIDEO_CODEC_CHANGED ).toBe( 'conference.videoCodecChanged' );
        expect( VIDEO_SIP_GW_AVAILABILITY_CHANGED ).toBe( 'conference.videoSIPGWAvailabilityChanged' );
        expect( VIDEO_SIP_GW_SESSION_STATE_CHANGED ).toBe( 'conference.videoSIPGWSessionStateChanged' );
        expect( VISITORS_SUPPORTED_CHANGED ).toBe( 'conference.visitorsSupported' );
        expect( START_MUTED_POLICY_CHANGED ).toBe( 'conference.start_muted_policy_changed' );
        expect( SUBJECT_CHANGED ).toBe( 'conference.subjectChanged' );
        expect( SUSPEND_DETECTED ).toBe( 'conference.suspendDetected' );
        expect( TALK_WHILE_MUTED ).toBe( 'conference.talk_while_muted' );
        expect( TRACK_ADDED ).toBe( 'conference.trackAdded' );
        expect( TRACK_AUDIO_LEVEL_CHANGED ).toBe( 'conference.audioLevelsChanged' );
        expect( TRACK_MUTE_CHANGED ).toBe( 'conference.trackMuteChanged' );
        expect( TRACK_REMOVED ).toBe( 'conference.trackRemoved' );
        expect( TRACK_UNMUTE_REJECTED ).toBe( 'conference.trackUnmuteRejected' );
        expect( TRANSCRIPTION_STATUS_CHANGED ).toBe( 'conference.transcriptionStatusChanged' );
        expect( USER_JOINED ).toBe( 'conference.userJoined' );
        expect( USER_LEFT ).toBe( 'conference.userLeft' );
        expect( USER_ROLE_CHANGED ).toBe( 'conference.roleChanged' );
        expect( USER_STATUS_CHANGED ).toBe( 'conference.statusChanged' );
        expect( VIDEO_UNMUTE_PERMISSIONS_CHANGED ).toBe( 'conference.video_unmute_permissions_changed' );
        expect( VISITORS_MESSAGE ).toBe( 'conference.visitors_message' );
        expect( VISITORS_REJECTION ).toBe( 'conference.visitors_rejection' );
        expect( BOT_TYPE_CHANGED ).toBe( 'conference.bot_type_changed' );
        expect( LOBBY_USER_JOINED ).toBe( 'conference.lobby.userJoined' );
        expect( LOBBY_USER_UPDATED ).toBe( 'conference.lobby.userUpdated' );
        expect( LOBBY_USER_LEFT ).toBe( 'conference.lobby.userLeft' );
        expect( AV_MODERATION_APPROVED ).toBe( 'conference.av_moderation.approved' );
        expect( AV_MODERATION_REJECTED ).toBe( 'conference.av_moderation.rejected' );
        expect( AV_MODERATION_CHANGED ).toBe( 'conference.av_moderation.changed' );
        expect( AV_MODERATION_PARTICIPANT_APPROVED ).toBe( 'conference.av_moderation.participant.approved' );
        expect( AV_MODERATION_PARTICIPANT_REJECTED ).toBe( 'conference.av_moderation.participant.rejected' );
        expect( BREAKOUT_ROOMS_MOVE_TO_ROOM ).toBe( 'conference.breakout-rooms.move-to-room' );
        expect( BREAKOUT_ROOMS_UPDATED ).toBe( 'conference.breakout-rooms.updated' );
        expect( METADATA_UPDATED ).toBe( 'conference.metadata.updated' );
        expect( SILENT_STATUS_CHANGED ).toBe( 'conference.silentStatusChanged' );
        expect( ENCODE_TIME_STATS_RECEIVED ).toBe( 'conference.encode_time_stats_received' );

        expect( JitsiConferenceEvents ).toBeDefined();

        expect( JitsiConferenceEvents.AUDIO_INPUT_STATE_CHANGE ).toBe( 'conference.audio_input_state_changed' );
        expect( JitsiConferenceEvents.AUDIO_UNMUTE_PERMISSIONS_CHANGED ).toBe( 'conference.audio_unmute_permissions_changed' );
        expect( JitsiConferenceEvents.AUTH_STATUS_CHANGED ).toBe( 'conference.auth_status_changed' );
        expect( JitsiConferenceEvents.BEFORE_STATISTICS_DISPOSED ).toBe( 'conference.beforeStatisticsDisposed' );
        expect( JitsiConferenceEvents.BRIDGE_BWE_STATS_RECEIVED ).toBe( 'conference.bridgeBweStatsReceived' );
        expect( JitsiConferenceEvents.CONFERENCE_ERROR ).toBe( 'conference.error' );
        expect( JitsiConferenceEvents.CONFERENCE_FAILED ).toBe( 'conference.failed' );
        expect( JitsiConferenceEvents.CONFERENCE_JOIN_IN_PROGRESS ).toBe( 'conference.join_in_progress' );
        expect( JitsiConferenceEvents.CONFERENCE_JOINED ).toBe( 'conference.joined' );
        expect( JitsiConferenceEvents.CONFERENCE_LEFT ).toBe( 'conference.left' );
        expect( JitsiConferenceEvents.CONFERENCE_UNIQUE_ID_SET ).toBe( 'conference.unique_id_set' );
        expect( JitsiConferenceEvents.CONNECTION_ESTABLISHED ).toBe( 'conference.connectionEstablished' );
        expect( JitsiConferenceEvents.CONNECTION_INTERRUPTED ).toBe( 'conference.connectionInterrupted' );
        expect( JitsiConferenceEvents.CONNECTION_RESTORED ).toBe( 'conference.connectionRestored' );
        expect( JitsiConferenceEvents.DATA_CHANNEL_OPENED ).toBe( 'conference.dataChannelOpened' );
        expect( JitsiConferenceEvents.DATA_CHANNEL_CLOSED ).toBe( 'conference.dataChannelClosed' );
        expect( JitsiConferenceEvents.DISPLAY_NAME_CHANGED ).toBe( 'conference.displayNameChanged' );
        expect( JitsiConferenceEvents.DOMINANT_SPEAKER_CHANGED ).toBe( 'conference.dominantSpeaker' );
        expect( JitsiConferenceEvents.CONFERENCE_CREATED_TIMESTAMP ).toBe( 'conference.createdTimestamp' );
        expect( JitsiConferenceEvents.DTMF_SUPPORT_CHANGED ).toBe( 'conference.dtmfSupportChanged' );
        expect( JitsiConferenceEvents.ENCODE_TIME_STATS_RECEIVED ).toBe( 'conference.encode_time_stats_received' );
        expect( JitsiConferenceEvents.ENDPOINT_MESSAGE_RECEIVED ).toBe( 'conference.endpoint_message_received' );
        expect( JitsiConferenceEvents.ENDPOINT_STATS_RECEIVED ).toBe( 'conference.endpoint_stats_received' );
        expect( JitsiConferenceEvents.FILE_SHARING_FILES_RECEIVED ).toBe( 'conference.file_sharing.files_received' );
        expect( JitsiConferenceEvents.FILE_SHARING_FILE_ADDED ).toBe( 'conference.file_sharing.file_added' );
        expect( JitsiConferenceEvents.FILE_SHARING_FILE_REMOVED ).toBe( 'conference.file_sharing.file_removed' );
        expect( JitsiConferenceEvents.JVB121_STATUS ).toBe( 'conference.jvb121Status' );
        expect( JitsiConferenceEvents.KICKED ).toBe( 'conference.kicked' );
        expect( JitsiConferenceEvents.PARTICIPANT_KICKED ).toBe( 'conference.participant_kicked' );
        expect( JitsiConferenceEvents.LAST_N_ENDPOINTS_CHANGED ).toBe( 'conference.lastNEndpointsChanged' );
        expect( JitsiConferenceEvents.FORWARDED_SOURCES_CHANGED ).toBe( 'conference.forwardedSourcesChanged' );
        expect( JitsiConferenceEvents.LOCK_STATE_CHANGED ).toBe( 'conference.lock_state_changed' );
        expect( JitsiConferenceEvents.SERVER_REGION_CHANGED ).toBe( 'conference.server_region_changed' );
        expect( JitsiConferenceEvents._MEDIA_SESSION_STARTED ).toBe( 'conference.media_session.started' );
        expect( JitsiConferenceEvents._MEDIA_SESSION_ACTIVE_CHANGED ).toBe( 'conference.media_session.active_changed' );
        expect( JitsiConferenceEvents.MEMBERS_ONLY_CHANGED ).toBe( 'conference.membersOnlyChanged' );
        expect( JitsiConferenceEvents.MESSAGE_RECEIVED ).toBe( 'conference.messageReceived' );
        expect( JitsiConferenceEvents.NO_AUDIO_INPUT ).toBe( 'conference.no_audio_input' );
        expect( JitsiConferenceEvents.NOISY_MIC ).toBe( 'conference.noisy_mic' );
        expect( JitsiConferenceEvents.NON_PARTICIPANT_MESSAGE_RECEIVED ).toBe( 'conference.non_participant_message_received' );
        expect( JitsiConferenceEvents.PRIVATE_MESSAGE_RECEIVED ).toBe( 'conference.privateMessageReceived' );
        expect( JitsiConferenceEvents.PARTCIPANT_FEATURES_CHANGED ).toBe( 'conference.partcipant_features_changed' );
        expect( JitsiConferenceEvents.PARTICIPANT_PROPERTY_CHANGED ).toBe( 'conference.participant_property_changed' );
        expect( JitsiConferenceEvents.P2P_STATUS ).toBe( 'conference.p2pStatus' );
        expect( JitsiConferenceEvents.PHONE_NUMBER_CHANGED ).toBe( 'conference.phoneNumberChanged' );
        expect( JitsiConferenceEvents.PROPERTIES_CHANGED ).toBe( 'conference.propertiesChanged' );
        expect( JitsiConferenceEvents.RECORDER_STATE_CHANGED ).toBe( 'conference.recorderStateChanged' );
        expect( JitsiConferenceEvents.VIDEO_SIP_GW_AVAILABILITY_CHANGED ).toBe( 'conference.videoSIPGWAvailabilityChanged' );
        expect( JitsiConferenceEvents.VIDEO_SIP_GW_SESSION_STATE_CHANGED ).toBe( 'conference.videoSIPGWSessionStateChanged' );
        expect( JitsiConferenceEvents.START_MUTED_POLICY_CHANGED ).toBe( 'conference.start_muted_policy_changed' );
        expect( JitsiConferenceEvents.SUBJECT_CHANGED ).toBe( 'conference.subjectChanged' );
        expect( JitsiConferenceEvents.SUSPEND_DETECTED ).toBe( 'conference.suspendDetected' );
        expect( JitsiConferenceEvents.TALK_WHILE_MUTED ).toBe( 'conference.talk_while_muted' );
        expect( JitsiConferenceEvents.TRACK_ADDED ).toBe( 'conference.trackAdded' );
        expect( JitsiConferenceEvents.TRACK_AUDIO_LEVEL_CHANGED ).toBe( 'conference.audioLevelsChanged' );
        expect( JitsiConferenceEvents.TRACK_MUTE_CHANGED ).toBe( 'conference.trackMuteChanged' );
        expect( JitsiConferenceEvents.TRACK_REMOVED ).toBe( 'conference.trackRemoved' );
        expect( JitsiConferenceEvents.TRACK_UNMUTE_REJECTED ).toBe( 'conference.trackUnmuteRejected' );
        expect( JitsiConferenceEvents.TRANSCRIPTION_STATUS_CHANGED ).toBe( 'conference.transcriptionStatusChanged' );
        expect( JitsiConferenceEvents.USER_JOINED ).toBe( 'conference.userJoined' );
        expect( JitsiConferenceEvents.USER_LEFT ).toBe( 'conference.userLeft' );
        expect( JitsiConferenceEvents.USER_ROLE_CHANGED ).toBe( 'conference.roleChanged' );
        expect( JitsiConferenceEvents.USER_STATUS_CHANGED ).toBe( 'conference.statusChanged' );
        expect( JitsiConferenceEvents.VIDEO_UNMUTE_PERMISSIONS_CHANGED ).toBe( 'conference.video_unmute_permissions_changed' );
        expect( JitsiConferenceEvents.VISITORS_SUPPORTED_CHANGED ).toBe( 'conference.visitorsSupported' );
        expect( JitsiConferenceEvents.BOT_TYPE_CHANGED ).toBe( 'conference.bot_type_changed' );
        expect( JitsiConferenceEvents.LOBBY_USER_JOINED ).toBe( 'conference.lobby.userJoined' );
        expect( JitsiConferenceEvents.LOBBY_USER_UPDATED ).toBe( 'conference.lobby.userUpdated' );
        expect( JitsiConferenceEvents.LOBBY_USER_LEFT ).toBe( 'conference.lobby.userLeft' );
        expect( JitsiConferenceEvents.AV_MODERATION_APPROVED ).toBe( 'conference.av_moderation.approved' );
        expect( JitsiConferenceEvents.AV_MODERATION_REJECTED ).toBe( 'conference.av_moderation.rejected' );
        expect( JitsiConferenceEvents.AV_MODERATION_CHANGED ).toBe( 'conference.av_moderation.changed' );
        expect( JitsiConferenceEvents.AV_MODERATION_PARTICIPANT_APPROVED ).toBe( 'conference.av_moderation.participant.approved' );
        expect( JitsiConferenceEvents.AV_MODERATION_PARTICIPANT_REJECTED ).toBe( 'conference.av_moderation.participant.rejected' );
        expect( JitsiConferenceEvents.BREAKOUT_ROOMS_MOVE_TO_ROOM ).toBe( 'conference.breakout-rooms.move-to-room' );
        expect( JitsiConferenceEvents.BREAKOUT_ROOMS_UPDATED ).toBe( 'conference.breakout-rooms.updated' );
        expect( JitsiConferenceEvents.METADATA_UPDATED ).toBe( 'conference.metadata.updated' );
        expect( JitsiConferenceEvents.SILENT_STATUS_CHANGED ).toBe( 'conference.silentStatusChanged' );
        expect( JitsiConferenceEvents.E2EE_VERIFICATION_READY ).toBe( 'conference.e2ee.verification.ready' );
        expect( JitsiConferenceEvents.E2EE_VERIFICATION_COMPLETED ).toBe( 'conference.e2ee.verification.completed' );
        expect( JitsiConferenceEvents.E2EE_VERIFICATION_AVAILABLE ).toBe( 'conference.e2ee.verification.available' );
        expect( JitsiConferenceEvents.REACTION_RECEIVED ).toBe( 'conference.reactionReceived' );
    } );

it( "unknown members", () => {
    const keys = Object.keys( others );
    expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
} );
} );
