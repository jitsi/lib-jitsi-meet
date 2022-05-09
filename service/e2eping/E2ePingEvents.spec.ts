import * as exported from "./E2ePingEvents";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/e2eping/E2ePingEvents members", () => {
    const {
        E2E_RTT_CHANGED,
        E2ePingEvents,
        ...others
    } = exported;

    it( "known members", () => {
        expect( E2E_RTT_CHANGED ).toBe( 'e2eping.e2e_rtt_changed' );

        expect( E2ePingEvents ).toBeDefined();

        expect( E2ePingEvents.E2E_RTT_CHANGED ).toBe( 'e2eping.e2e_rtt_changed' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );