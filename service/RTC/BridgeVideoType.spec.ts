import * as exported from "./BridgeVideoType";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/RTC/BridgeVideoType members", () => {
    const {
        CAMERA,
        DESKTOP,
        DESKTOP_HIGH_FPS,
        NONE,
        BridgeVideoType,
        ...others
    } = exported as any; // TODO: remove cast after typescript conversion

    it( "known members", () => {
        expect( CAMERA ).toBe( 'camera' );
        expect( DESKTOP ).toBe( 'desktop' );
        expect( DESKTOP_HIGH_FPS ).toBe( 'desktop_high_fps' );
        expect( NONE ).toBe( 'none' );
        if ( BridgeVideoType ) {
            expect( BridgeVideoType.CAMERA ).toBe( 'camera' );
            expect( BridgeVideoType.DESKTOP ).toBe( 'desktop' );
            expect( BridgeVideoType.DESKTOP_HIGH_FPS ).toBe( 'desktop_high_fps' );
            expect( BridgeVideoType.NONE ).toBe( 'none' );
        }
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );