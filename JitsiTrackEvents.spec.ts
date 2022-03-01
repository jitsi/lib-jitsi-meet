import * as exported from "./JitsiTrackEvents";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/JitsiTrackEvents members", () => {
    const {
        LOCAL_TRACK_STOPPED,
        TRACK_AUDIO_LEVEL_CHANGED,
        TRACK_AUDIO_OUTPUT_CHANGED,
        TRACK_MUTE_CHANGED,
        TRACK_STREAMING_STATUS_CHANGED,
        TRACK_VIDEOTYPE_CHANGED,
        NO_DATA_FROM_SOURCE,
        NO_AUDIO_INPUT,
        JitsiTrackEvents,
        ...others
    } = exported;

    it( "known members", () => {
        expect( LOCAL_TRACK_STOPPED ).toBe( 'track.stopped' );
        expect( TRACK_AUDIO_LEVEL_CHANGED ).toBe( 'track.audioLevelsChanged' );
        expect( TRACK_AUDIO_OUTPUT_CHANGED ).toBe( 'track.audioOutputChanged' );
        expect( TRACK_MUTE_CHANGED ).toBe( 'track.trackMuteChanged' );
        expect( TRACK_VIDEOTYPE_CHANGED ).toBe( 'track.videoTypeChanged' );
        expect( NO_DATA_FROM_SOURCE ).toBe( 'track.no_data_from_source' );
        expect( NO_AUDIO_INPUT ).toBe( 'track.no_audio_input' );

        expect( JitsiTrackEvents ).toBeDefined();

        expect( JitsiTrackEvents.LOCAL_TRACK_STOPPED ).toBe( 'track.stopped' );
        expect( JitsiTrackEvents.TRACK_AUDIO_LEVEL_CHANGED ).toBe( 'track.audioLevelsChanged' );
        expect( JitsiTrackEvents.TRACK_AUDIO_OUTPUT_CHANGED ).toBe( 'track.audioOutputChanged' );
        expect( JitsiTrackEvents.TRACK_MUTE_CHANGED ).toBe( 'track.trackMuteChanged' );
        expect( JitsiTrackEvents.TRACK_STREAMING_STATUS_CHANGED ).toBe( 'track.streaming_status_changed' );
        expect( JitsiTrackEvents.TRACK_VIDEOTYPE_CHANGED ).toBe( 'track.videoTypeChanged' );
        expect( JitsiTrackEvents.NO_DATA_FROM_SOURCE ).toBe( 'track.no_data_from_source' );
        expect( JitsiTrackEvents.NO_AUDIO_INPUT ).toBe( 'track.no_audio_input' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );
