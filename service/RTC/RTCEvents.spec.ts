import * as exported from "./RTCEvents";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/RTC/RTCEvents members", () => {
    const {
        CREATE_ANSWER_FAILED,
        CREATE_OFFER_FAILED,
        DATA_CHANNEL_OPEN,
        ENDPOINT_CONN_STATUS_CHANGED,
        DOMINANT_SPEAKER_CHANGED,
        LASTN_ENDPOINT_CHANGED,
        FORWARDED_SOURCES_CHANGED,
        PERMISSIONS_CHANGED,
        SENDER_VIDEO_CONSTRAINTS_CHANGED,
        LASTN_VALUE_CHANGED,
        LOCAL_TRACK_SSRC_UPDATED,
        LOCAL_TRACK_MAX_ENABLED_RESOLUTION_CHANGED,
        TRACK_ATTACHED,
        REMOTE_TRACK_ADDED,
        REMOTE_TRACK_MUTE,
        REMOTE_TRACK_REMOVED,
        REMOTE_TRACK_UNMUTE,
        SET_LOCAL_DESCRIPTION_FAILED,
        SET_REMOTE_DESCRIPTION_FAILED,
        AUDIO_OUTPUT_DEVICE_CHANGED,
        DEVICE_LIST_CHANGED,
        DEVICE_LIST_WILL_CHANGE,
        DEVICE_LIST_AVAILABLE,
        ENDPOINT_MESSAGE_RECEIVED,
        ENDPOINT_STATS_RECEIVED,
        LOCAL_UFRAG_CHANGED,
        REMOTE_UFRAG_CHANGED,
        RTCEvents,
        default: RTCEventsDefault,
        ...others
    } = exported;

    it( "known members", () => {
        expect( CREATE_ANSWER_FAILED ).toBe( 'rtc.create_answer_failed' );
        expect( CREATE_OFFER_FAILED ).toBe( 'rtc.create_offer_failed' );
        expect( DATA_CHANNEL_OPEN ).toBe( 'rtc.data_channel_open' );
        expect( ENDPOINT_CONN_STATUS_CHANGED ).toBe( 'rtc.endpoint_conn_status_changed' );
        expect( DOMINANT_SPEAKER_CHANGED ).toBe( 'rtc.dominant_speaker_changed' );
        expect( LASTN_ENDPOINT_CHANGED ).toBe( 'rtc.lastn_endpoint_changed' );
        expect( FORWARDED_SOURCES_CHANGED ).toBe( 'rtc.forwarded_sources_changed' );
        expect( PERMISSIONS_CHANGED ).toBe( 'rtc.permissions_changed' );
        expect( SENDER_VIDEO_CONSTRAINTS_CHANGED ).toBe( 'rtc.sender_video_constraints_changed' );
        expect( LASTN_VALUE_CHANGED ).toBe( 'rtc.lastn_value_changed' );
        expect( LOCAL_TRACK_SSRC_UPDATED ).toBe( 'rtc.local_track_ssrc_updated' );
        expect( LOCAL_TRACK_MAX_ENABLED_RESOLUTION_CHANGED ).toBe( 'rtc.local_track_max_enabled_resolution_changed' );
        expect( TRACK_ATTACHED ).toBe( 'rtc.track_attached' );
        expect( REMOTE_TRACK_ADDED ).toBe( 'rtc.remote_track_added' );
        expect( REMOTE_TRACK_MUTE ).toBe( 'rtc.remote_track_mute' );
        expect( REMOTE_TRACK_REMOVED ).toBe( 'rtc.remote_track_removed' );
        expect( REMOTE_TRACK_UNMUTE ).toBe( 'rtc.remote_track_unmute' );
        expect( SET_LOCAL_DESCRIPTION_FAILED ).toBe( 'rtc.set_local_description_failed' );
        expect( SET_REMOTE_DESCRIPTION_FAILED ).toBe( 'rtc.set_remote_description_failed' );
        expect( AUDIO_OUTPUT_DEVICE_CHANGED ).toBe( 'rtc.audio_output_device_changed' );
        expect( DEVICE_LIST_CHANGED ).toBe( 'rtc.device_list_changed' );
        expect( DEVICE_LIST_WILL_CHANGE ).toBe( 'rtc.device_list_will_change' );
        expect( DEVICE_LIST_AVAILABLE ).toBe( 'rtc.device_list_available' );
        expect( ENDPOINT_MESSAGE_RECEIVED ).toBe( 'rtc.endpoint_message_received' );
        expect( ENDPOINT_STATS_RECEIVED ).toBe( 'rtc.endpoint_stats_received' );
        expect( LOCAL_UFRAG_CHANGED ).toBe( 'rtc.local_ufrag_changed' );
        expect( REMOTE_UFRAG_CHANGED ).toBe( 'rtc.remote_ufrag_changed' );

        if ( RTCEvents ) {
            expect( RTCEvents.CREATE_ANSWER_FAILED ).toBe( 'rtc.create_answer_failed' );
            expect( RTCEvents.CREATE_OFFER_FAILED ).toBe( 'rtc.create_offer_failed' );
            expect( RTCEvents.DATA_CHANNEL_OPEN ).toBe( 'rtc.data_channel_open' );
            expect( RTCEvents.ENDPOINT_CONN_STATUS_CHANGED ).toBe( 'rtc.endpoint_conn_status_changed' );
            expect( RTCEvents.DOMINANT_SPEAKER_CHANGED ).toBe( 'rtc.dominant_speaker_changed' );
            expect( RTCEvents.LASTN_ENDPOINT_CHANGED ).toBe( 'rtc.lastn_endpoint_changed' );
            expect( RTCEvents.PERMISSIONS_CHANGED ).toBe( 'rtc.permissions_changed' );
            expect( RTCEvents.SENDER_VIDEO_CONSTRAINTS_CHANGED ).toBe( 'rtc.sender_video_constraints_changed' );
            expect( RTCEvents.LASTN_VALUE_CHANGED ).toBe( 'rtc.lastn_value_changed' );
            expect( RTCEvents.LOCAL_TRACK_SSRC_UPDATED ).toBe( 'rtc.local_track_ssrc_updated' );
            expect( RTCEvents.LOCAL_TRACK_MAX_ENABLED_RESOLUTION_CHANGED ).toBe( 'rtc.local_track_max_enabled_resolution_changed' );
            expect( RTCEvents.TRACK_ATTACHED ).toBe( 'rtc.track_attached' );
            expect( RTCEvents.REMOTE_TRACK_ADDED ).toBe( 'rtc.remote_track_added' );
            expect( RTCEvents.REMOTE_TRACK_MUTE ).toBe( 'rtc.remote_track_mute' );
            expect( RTCEvents.REMOTE_TRACK_REMOVED ).toBe( 'rtc.remote_track_removed' );
            expect( RTCEvents.REMOTE_TRACK_UNMUTE ).toBe( 'rtc.remote_track_unmute' );
            expect( RTCEvents.SET_LOCAL_DESCRIPTION_FAILED ).toBe( 'rtc.set_local_description_failed' );
            expect( RTCEvents.SET_REMOTE_DESCRIPTION_FAILED ).toBe( 'rtc.set_remote_description_failed' );
            expect( RTCEvents.AUDIO_OUTPUT_DEVICE_CHANGED ).toBe( 'rtc.audio_output_device_changed' );
            expect( RTCEvents.DEVICE_LIST_CHANGED ).toBe( 'rtc.device_list_changed' );
            expect( RTCEvents.DEVICE_LIST_WILL_CHANGE ).toBe( 'rtc.device_list_will_change' );
            expect( RTCEvents.DEVICE_LIST_AVAILABLE ).toBe( 'rtc.device_list_available' );
            expect( RTCEvents.ENDPOINT_MESSAGE_RECEIVED ).toBe( 'rtc.endpoint_message_received' );
            expect( RTCEvents.ENDPOINT_STATS_RECEIVED ).toBe( 'rtc.endpoint_stats_received' );
            expect( RTCEvents.LOCAL_UFRAG_CHANGED ).toBe( 'rtc.local_ufrag_changed' );
            expect( RTCEvents.REMOTE_UFRAG_CHANGED ).toBe( 'rtc.remote_ufrag_changed' );
        }

        if ( RTCEventsDefault ) {
            expect( RTCEventsDefault.CREATE_ANSWER_FAILED ).toBe( 'rtc.create_answer_failed' );
            expect( RTCEventsDefault.CREATE_OFFER_FAILED ).toBe( 'rtc.create_offer_failed' );
            expect( RTCEventsDefault.DATA_CHANNEL_OPEN ).toBe( 'rtc.data_channel_open' );
            expect( RTCEventsDefault.ENDPOINT_CONN_STATUS_CHANGED ).toBe( 'rtc.endpoint_conn_status_changed' );
            expect( RTCEventsDefault.DOMINANT_SPEAKER_CHANGED ).toBe( 'rtc.dominant_speaker_changed' );
            expect( RTCEventsDefault.LASTN_ENDPOINT_CHANGED ).toBe( 'rtc.lastn_endpoint_changed' );
            expect( RTCEventsDefault.PERMISSIONS_CHANGED ).toBe( 'rtc.permissions_changed' );
            expect( RTCEventsDefault.SENDER_VIDEO_CONSTRAINTS_CHANGED ).toBe( 'rtc.sender_video_constraints_changed' );
            expect( RTCEventsDefault.LASTN_VALUE_CHANGED ).toBe( 'rtc.lastn_value_changed' );
            expect( RTCEventsDefault.LOCAL_TRACK_SSRC_UPDATED ).toBe( 'rtc.local_track_ssrc_updated' );
            expect( RTCEventsDefault.LOCAL_TRACK_MAX_ENABLED_RESOLUTION_CHANGED ).toBe( 'rtc.local_track_max_enabled_resolution_changed' );
            expect( RTCEventsDefault.TRACK_ATTACHED ).toBe( 'rtc.track_attached' );
            expect( RTCEventsDefault.REMOTE_TRACK_ADDED ).toBe( 'rtc.remote_track_added' );
            expect( RTCEventsDefault.REMOTE_TRACK_MUTE ).toBe( 'rtc.remote_track_mute' );
            expect( RTCEventsDefault.REMOTE_TRACK_REMOVED ).toBe( 'rtc.remote_track_removed' );
            expect( RTCEventsDefault.REMOTE_TRACK_UNMUTE ).toBe( 'rtc.remote_track_unmute' );
            expect( RTCEventsDefault.SET_LOCAL_DESCRIPTION_FAILED ).toBe( 'rtc.set_local_description_failed' );
            expect( RTCEventsDefault.SET_REMOTE_DESCRIPTION_FAILED ).toBe( 'rtc.set_remote_description_failed' );
            expect( RTCEventsDefault.AUDIO_OUTPUT_DEVICE_CHANGED ).toBe( 'rtc.audio_output_device_changed' );
            expect( RTCEventsDefault.DEVICE_LIST_CHANGED ).toBe( 'rtc.device_list_changed' );
            expect( RTCEventsDefault.DEVICE_LIST_WILL_CHANGE ).toBe( 'rtc.device_list_will_change' );
            expect( RTCEventsDefault.DEVICE_LIST_AVAILABLE ).toBe( 'rtc.device_list_available' );
            expect( RTCEventsDefault.ENDPOINT_MESSAGE_RECEIVED ).toBe( 'rtc.endpoint_message_received' );
            expect( RTCEventsDefault.ENDPOINT_STATS_RECEIVED ).toBe( 'rtc.endpoint_stats_received' );
            expect( RTCEventsDefault.LOCAL_UFRAG_CHANGED ).toBe( 'rtc.local_ufrag_changed' );
            expect( RTCEventsDefault.REMOTE_UFRAG_CHANGED ).toBe( 'rtc.remote_ufrag_changed' );
        }
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );
