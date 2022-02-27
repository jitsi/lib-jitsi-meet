import * as exported from "./ConnectionQualityEvents";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/connectivity/ConnectionQualityEvents members", () => {
    const {
        LOCAL_STATS_UPDATED = 'cq.local_stats_updated',
        REMOTE_STATS_UPDATED,
        ConnectionQualityEvents,
        ...others
    } = exported;

    it( "known members", () => {
        expect( LOCAL_STATS_UPDATED ).toBe( 'cq.local_stats_updated' );
        expect( REMOTE_STATS_UPDATED ).toBe( 'cq.remote_stats_updated' );

        expect( ConnectionQualityEvents ).toBeDefined();

        expect( ConnectionQualityEvents.LOCAL_STATS_UPDATED ).toBe( 'cq.local_stats_updated' );
        expect( ConnectionQualityEvents.REMOTE_STATS_UPDATED ).toBe( 'cq.remote_stats_updated' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );