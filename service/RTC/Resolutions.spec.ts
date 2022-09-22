import * as exported from "./Resolutions";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/RTC/Resolutions members", () => {
    const {
        resolutions,
        ...others
    } = exported as any;

    it( "known members", () => {
        expect( resolutions[ '2160' ] ).toEqual( { width: 3840, height: 2160 } );
        expect( resolutions[ '4k' ] ).toEqual( { width: 3840, height: 2160 } );
        expect( resolutions[ '1080' ] ).toEqual( { width: 1920, height: 1080 } );
        expect( resolutions[ 'fullhd' ] ).toEqual( { width: 1920, height: 1080 } );
        expect( resolutions[ '720' ] ).toEqual( { width: 1280, height: 720 } );
        expect( resolutions[ 'hd' ] ).toEqual( { width: 1280, height: 720 } );
        expect( resolutions[ '540' ] ).toEqual( { width: 960, height: 540 } );
        expect( resolutions[ 'qhd' ] ).toEqual( { width: 960, height: 540 } );
        expect( resolutions[ '480' ] ).toEqual( { width: 640, height: 480 } );
        expect( resolutions[ 'vga' ] ).toEqual( { width: 640, height: 480 } );
        expect( resolutions[ '360' ] ).toEqual( { width: 640, height: 360 } );
        expect( resolutions[ '240' ] ).toEqual( { width: 320, height: 240 } );
        expect( resolutions[ '180' ] ).toEqual( { width: 320, height: 180 } );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );