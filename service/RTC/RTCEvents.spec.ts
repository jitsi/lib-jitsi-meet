import * as exported from "./RTCEvents";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/RTC/RTCEvents members", () => {
    const {
        RTCEvents,
        ...others
    } = exported;

    it( "known members", () => {
        expect( RTCEvents.BRIDGE_BWE_STATS_RECEIVED ).toBe( 'rtc.bridge_bwe_stats_received' );
        expect( RTCEvents.DATA_CHANNEL_OPEN ).toBe( 'rtc.data_channel_open' );
        expect( RTCEvents.DATA_CHANNEL_CLOSED ).toBe( 'rtc.data_channel_closed' );
        expect( RTCEvents.ENDPOINT_CONN_STATUS_CHANGED ).toBe( 'rtc.endpoint_conn_status_changed' );
        expect( RTCEvents.DOMINANT_SPEAKER_CHANGED ).toBe( 'rtc.dominant_speaker_changed' );
        expect( RTCEvents.PERMISSIONS_CHANGED ).toBe( 'rtc.permissions_changed' );
        expect( RTCEvents.SENDER_VIDEO_CONSTRAINTS_CHANGED ).toBe( 'rtc.sender_video_constraints_changed' );
        expect( RTCEvents.LASTN_VALUE_CHANGED ).toBe( 'rtc.lastn_value_changed' );
        expect( RTCEvents.LOCAL_TRACK_MAX_ENABLED_RESOLUTION_CHANGED ).toBe( 'rtc.local_track_max_enabled_resolution_changed' );
        expect( RTCEvents.REMOTE_TRACK_ADDED ).toBe( 'rtc.remote_track_added' );
        expect( RTCEvents.REMOTE_TRACK_MUTE ).toBe( 'rtc.remote_track_mute' );
        expect( RTCEvents.REMOTE_TRACK_REMOVED ).toBe( 'rtc.remote_track_removed' );
        expect( RTCEvents.REMOTE_TRACK_UNMUTE ).toBe( 'rtc.remote_track_unmute' );
        expect( RTCEvents.AUDIO_OUTPUT_DEVICE_CHANGED ).toBe( 'rtc.audio_output_device_changed' );
        expect( RTCEvents.DEVICE_LIST_CHANGED ).toBe( 'rtc.device_list_changed' );
        expect( RTCEvents.DEVICE_LIST_WILL_CHANGE ).toBe( 'rtc.device_list_will_change' );
        expect( RTCEvents.DEVICE_LIST_AVAILABLE ).toBe( 'rtc.device_list_available' );
        expect( RTCEvents.ENDPOINT_MESSAGE_RECEIVED ).toBe( 'rtc.endpoint_message_received' );
        expect( RTCEvents.ENDPOINT_STATS_RECEIVED ).toBe( 'rtc.endpoint_stats_received' );
        expect( RTCEvents.LOCAL_UFRAG_CHANGED ).toBe( 'rtc.local_ufrag_changed' );
        expect( RTCEvents.REMOTE_UFRAG_CHANGED ).toBe( 'rtc.remote_ufrag_changed' );
        expect( RTCEvents.VIDEO_SSRCS_REMAPPED ).toBe( 'rtc.video_ssrcs_remapped' );
        expect( RTCEvents.AUDIO_SSRCS_REMAPPED ).toBe( 'rtc.audio_ssrcs_remapped' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );
