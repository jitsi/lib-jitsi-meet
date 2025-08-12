import * as exported from "./AuthenticationEvents";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/authentication/AuthenticationEvents members", () => {
    const {
        default: AuthenticationEvents,
        ...others
    } = exported as any; // TODO: remove cast after typescript conversion
    
    const IDENTITY_UPDATED = AuthenticationEvents.IDENTITY_UPDATED;

    it( "known members", () => {
        expect( IDENTITY_UPDATED ).toBe( 'authentication.identity_updated' );
        if ( AuthenticationEvents ) {
            expect( AuthenticationEvents.IDENTITY_UPDATED ).toBe( 'authentication.identity_updated' );
        }
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );