import * as exported from "./AuthenticationEvents";


describe( "/service/authentication/AuthenticationEvents members", () => {
    const {
        AuthenticationEvents,
        ...others
    } = exported;
    
    it( "known members", () => {
        expect( AuthenticationEvents ).toBeDefined();

        expect( AuthenticationEvents.IDENTITY_UPDATED ).toBe( 'authentication.identity_updated' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );