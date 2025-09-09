import * as exported from "./JitsiConferenceEvents";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/JitsiConferenceEvents members", () => {
    const {
        JitsiConferenceEvents,
        ...others
    } = exported;

    it( "known members", () => {
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
