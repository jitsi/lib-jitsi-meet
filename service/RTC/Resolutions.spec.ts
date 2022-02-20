import * as exported from "./Resolutions";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/RTC/Resolutions members", () => {
    const {
        '2160': R2160,
        '4k': R4k,
        '1080': R1080,
        fullhd,
        '720': R720,
        hd,
        '540': R540,
        qhd,
        '480': R480,
        vga,
        '360': R360,
        '240': R240,
        '180': R180,
        ...others
    } = exported as any;

    it( "known members", () => {
        expect( R2160 ).toEqual( { width: 3840, height: 2160 } );
        expect( R4k ).toEqual( { width: 3840, height: 2160 } );
        expect( R1080 ).toEqual( { width: 1920, height: 1080 } );
        expect( fullhd ).toEqual( { width: 1920, height: 1080 } );
        expect( R720 ).toEqual( { width: 1280, height: 720 } );
        expect( hd ).toEqual( { width: 1280, height: 720 } );
        expect( R540 ).toEqual( { width: 960, height: 540 } );
        expect( qhd ).toEqual( { width: 960, height: 540 } );
        expect( R480 ).toEqual( { width: 640, height: 480 } );
        expect( vga ).toEqual( { width: 640, height: 480 } );
        expect( R360 ).toEqual( { width: 640, height: 360 } );
        expect( R240 ).toEqual( { width: 320, height: 240 } );
        expect( R180 ).toEqual( { width: 320, height: 180 } );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );