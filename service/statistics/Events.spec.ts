import * as exported from "./Events";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/statistics/Events members", () => {
    const {
        StatisticsEvents,
        ...others
    } = exported;

    it( "known members", () => {
        expect( StatisticsEvents ).toBeDefined();

        expect( StatisticsEvents.AUDIO_LEVEL ).toBe( 'statistics.audioLevel' );
        expect( StatisticsEvents.BEFORE_DISPOSED ).toBe( 'statistics.before_disposed' );
        expect( StatisticsEvents.BYTE_SENT_STATS ).toBe( 'statistics.byte_sent_stats' );
        expect( StatisticsEvents.CONNECTION_STATS ).toBe( 'statistics.connectionstats' );
        expect( StatisticsEvents.ENCODE_TIME_STATS ).toBe( 'statistics.encode_time_stats' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );