import * as exported from "./ConnectionQualityEvents";


describe( "/service/connectivity/ConnectionQualityEvents members", () => {
    const {
        ConnectionQualityEvents,
        ...others
    } = exported;

    it( "known members", () => {
        expect( ConnectionQualityEvents ).toBeDefined();

        expect( ConnectionQualityEvents.LOCAL_STATS_UPDATED ).toBe( 'cq.local_stats_updated' );
        expect( ConnectionQualityEvents.REMOTE_STATS_UPDATED ).toBe( 'cq.remote_stats_updated' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );