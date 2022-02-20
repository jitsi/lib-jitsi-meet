import * as exported from "./VideoType";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/RTC/VideoType members", () => {
    const {
        CAMERA,
        DESKTOP,
        VideoType,
        ...others
    } = exported as any; // TODO: remove cast after typescript conversion

    it( "known members", () => {
        expect( CAMERA ).toBe( 'camera' );
        expect( DESKTOP ).toBe( 'desktop' );
        if ( VideoType ) {
            expect( VideoType.CAMERA ).toBe( 'camera' );
            expect( VideoType.DESKTOP ).toBe( 'desktop' );
        }
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );