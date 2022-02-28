import * as exported from "./Events";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/statistics/Events members", () => {
    const {
        AUDIO_LEVEL,
        BEFORE_DISPOSED,
        BYTE_SENT_STATS,
        CONNECTION_STATS,
        LONG_TASKS_STATS,
        Events,
        ...others
    } = exported;

    it( "known members", () => {
        expect( AUDIO_LEVEL ).toBe( 'statistics.audioLevel' );
        expect( BEFORE_DISPOSED ).toBe( 'statistics.before_disposed' );
        expect( BYTE_SENT_STATS ).toBe( 'statistics.byte_sent_stats' );
        expect( CONNECTION_STATS ).toBe( 'statistics.connectionstats' );
        expect( LONG_TASKS_STATS ).toBe( 'statistics.long_tasks_stats' );

        expect( Events ).toBeDefined();

        expect( Events.AUDIO_LEVEL ).toBe( 'statistics.audioLevel' );
        expect( Events.BEFORE_DISPOSED ).toBe( 'statistics.before_disposed' );
        expect( Events.BYTE_SENT_STATS ).toBe( 'statistics.byte_sent_stats' );
        expect( Events.CONNECTION_STATS ).toBe( 'statistics.connectionstats' );
        expect( Events.LONG_TASKS_STATS ).toBe( 'statistics.long_tasks_stats' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );