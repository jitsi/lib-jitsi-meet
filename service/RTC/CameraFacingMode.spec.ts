import * as exported from "./CameraFacingMode";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/RTC/CameraFacingMode members", () => {
    const {
        ENVIRONMENT,
        USER,
        CameraFacingMode,
        default: CameraFacingModeDefault,
        ...others
    } = exported;

    it( "known members", () => {
        expect( ENVIRONMENT ).toBe( 'environment' );
        expect( USER ).toBe( 'user' );
        if ( CameraFacingMode ) {
            expect( CameraFacingMode.ENVIRONMENT ).toBe( 'environment' );
            expect( CameraFacingMode.USER ).toBe( 'user' );
        }
        if ( CameraFacingModeDefault ) {
            expect( CameraFacingModeDefault.ENVIRONMENT ).toBe( 'environment' );
            expect( CameraFacingModeDefault.USER ).toBe( 'user' );
        }
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );