import * as exported from "./MediaPermission";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/RTC/MediaPermission members", () => {
    const {
        MediaPermissionState,
        PermissionDenialReason,
        ...others
    } = exported;

    it( "known members", () => {
        expect( MediaPermissionState.DENIED ).toBe( 'denied' );
        expect( MediaPermissionState.GRANTED ).toBe( 'granted' );
        expect( MediaPermissionState.PROMPT ).toBe( 'prompt' );
        expect( PermissionDenialReason.BROWSER ).toBe( 'browser' );
        expect( PermissionDenialReason.OS ).toBe( 'os' );
        expect( PermissionDenialReason.USER ).toBe( 'user' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );
