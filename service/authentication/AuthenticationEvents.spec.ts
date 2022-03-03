import * as exported from "./AuthenticationEvents";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/authentication/AuthenticationEvents members", () => {
    const {
        IDENTITY_UPDATED,
        AuthenticationEvents,
        default: AuthenticationEventsDefault,
        ...others
    } = exported;

    it( "known members", () => {
        expect( IDENTITY_UPDATED ).toBe( 'authentication.identity_updated' );

        expect( AuthenticationEvents ).toBeDefined();
        expect( AuthenticationEvents.IDENTITY_UPDATED ).toBe( 'authentication.identity_updated' );

        expect( AuthenticationEventsDefault ).toBeDefined();
        expect( AuthenticationEventsDefault.IDENTITY_UPDATED ).toBe( 'authentication.identity_updated' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );