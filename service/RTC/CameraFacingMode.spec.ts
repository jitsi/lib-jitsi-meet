import * as exported from "./CameraFacingMode";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/RTC/CameraFacingMode members", () => {
    const {
        CameraFacingMode,
        ...others
    } = exported;

    it( "known members", () => {
        expect( CameraFacingMode ).toBeDefined();

        expect( CameraFacingMode.ENVIRONMENT ).toBe( 'environment' );
        expect( CameraFacingMode.USER ).toBe( 'user' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );