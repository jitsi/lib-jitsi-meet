import * as exported from "./JitsiConnectionEvents";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/JitsiConnectionEvents members", () => {
    const {
        CONNECTION_DISCONNECTED,
        CONNECTION_ESTABLISHED,
        CONNECTION_FAILED,
        CONNECTION_REDIRECTED,
        WRONG_STATE,
        DISPLAY_NAME_REQUIRED,
        PROPERTIES_UPDATED,
        JitsiConnectionEvents,
        ...others
    } = exported;

    it( "known members", () => {
        expect( CONNECTION_DISCONNECTED ).toBe( 'connection.connectionDisconnected' );
        expect( CONNECTION_ESTABLISHED ).toBe( 'connection.connectionEstablished' );
        expect( CONNECTION_FAILED ).toBe( 'connection.connectionFailed' );
        expect( CONNECTION_REDIRECTED ).toBe( 'connection.redirected' );
        expect( WRONG_STATE ).toBe( 'connection.wrongState' );
        expect( DISPLAY_NAME_REQUIRED ).toBe( 'connection.display_name_required' );
        expect( PROPERTIES_UPDATED ).toBe( 'connection.propertiesUpdated' );

        expect( JitsiConnectionEvents ).toBeDefined();

        expect( JitsiConnectionEvents.CONNECTION_DISCONNECTED ).toBe( 'connection.connectionDisconnected' );
        expect( JitsiConnectionEvents.CONNECTION_ESTABLISHED ).toBe( 'connection.connectionEstablished' );
        expect( JitsiConnectionEvents.CONNECTION_FAILED ).toBe( 'connection.connectionFailed' );
        expect( JitsiConnectionEvents.CONNECTION_REDIRECTED ).toBe( 'connection.redirected' );
        expect( JitsiConnectionEvents.WRONG_STATE ).toBe( 'connection.wrongState' );
        expect( JitsiConnectionEvents.DISPLAY_NAME_REQUIRED ).toBe( 'connection.display_name_required' );
        expect( JitsiConnectionEvents.PROPERTIES_UPDATED ).toBe( 'connection.propertiesUpdated' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );
