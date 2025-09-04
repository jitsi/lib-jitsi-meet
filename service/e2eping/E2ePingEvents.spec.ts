import * as exported from "./E2ePingEvents";


describe( "/service/e2eping/E2ePingEvents members", () => {
    const {
        E2ePingEvents,
        ...others
    } = exported;

    it( "known members", () => {
        expect( E2ePingEvents ).toBeDefined();

        expect( E2ePingEvents.E2E_RTT_CHANGED ).toBe( 'e2eping.e2e_rtt_changed' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );