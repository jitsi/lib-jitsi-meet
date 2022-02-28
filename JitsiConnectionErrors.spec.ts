import * as exported from "./JitsiConnectionErrors";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/JitsiConnectionErrors members", () => {
    const {
        CONNECTION_DROPPED_ERROR,
        OTHER_ERROR,
        PASSWORD_REQUIRED,
        SERVER_ERROR,
        JitsiConnectionErrors,
        ...others
    } = exported;

    it( "known members", () => {
        expect( CONNECTION_DROPPED_ERROR ).toBe( 'connection.droppedError' );
        expect( OTHER_ERROR ).toBe( 'connection.otherError' );
        expect( PASSWORD_REQUIRED ).toBe( 'connection.passwordRequired' );
        expect( SERVER_ERROR ).toBe( 'connection.serverError' );

        expect( JitsiConnectionErrors ).toBeDefined();

        expect( JitsiConnectionErrors.CONNECTION_DROPPED_ERROR ).toBe( 'connection.droppedError' );
        expect( JitsiConnectionErrors.OTHER_ERROR ).toBe( 'connection.otherError' );
        expect( JitsiConnectionErrors.PASSWORD_REQUIRED ).toBe( 'connection.passwordRequired' );
        expect( JitsiConnectionErrors.SERVER_ERROR ).toBe( 'connection.serverError' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );