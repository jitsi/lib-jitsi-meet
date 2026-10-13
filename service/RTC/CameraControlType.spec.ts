import * as exported from "./CameraControlType";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/RTC/CameraControlType members", () => {
    const {
        CameraControlType,
        ...others
    } = exported;

    it( "known members", () => {
        expect( CameraControlType ).toBeDefined();

        expect( CameraControlType.PAN ).toBe( 'pan' );
        expect( CameraControlType.TILT ).toBe( 'tilt' );
        expect( CameraControlType.ZOOM ).toBe( 'zoom' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );
