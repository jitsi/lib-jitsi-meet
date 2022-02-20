import * as exported from "./StreamEventTypes";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/RTC/StreamEventTypes members", () => {
    const {
        EVENT_TYPE_LOCAL_CREATED,
        EVENT_TYPE_LOCAL_CHANGED,
        EVENT_TYPE_LOCAL_ENDED,
        EVENT_TYPE_REMOTE_CREATED,
        EVENT_TYPE_REMOTE_ENDED,
        TRACK_MUTE_CHANGED,
        StreamEventTypes,
        ...others
    } = exported as any; // TODO: remove cast after typescript conversion

    it( "known members", () => {
        expect( EVENT_TYPE_LOCAL_CREATED ).toBe( 'stream.local_created' );
        expect( EVENT_TYPE_LOCAL_CHANGED ).toBe( 'stream.local_changed' );
        expect( EVENT_TYPE_LOCAL_ENDED ).toBe( 'stream.local_ended' );
        expect( EVENT_TYPE_REMOTE_CREATED ).toBe( 'stream.remote_created' );
        expect( EVENT_TYPE_REMOTE_ENDED ).toBe( 'stream.remote_ended' );
        expect( TRACK_MUTE_CHANGED ).toBe( 'rtc.track_mute_changed' );
        if ( StreamEventTypes ) {
            expect( StreamEventTypes.EVENT_TYPE_LOCAL_CREATED ).toBe( 'stream.local_created' );
            expect( StreamEventTypes.EVENT_TYPE_LOCAL_CHANGED ).toBe( 'stream.local_changed' );
            expect( StreamEventTypes.EVENT_TYPE_LOCAL_ENDED ).toBe( 'stream.local_ended' );
            expect( StreamEventTypes.EVENT_TYPE_REMOTE_CREATED ).toBe( 'stream.remote_created' );
            expect( StreamEventTypes.EVENT_TYPE_REMOTE_ENDED ).toBe( 'stream.remote_ended' );
            expect( StreamEventTypes.TRACK_MUTE_CHANGED ).toBe( 'rtc.track_mute_changed' );
        }
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );