import * as exported from "./CodecMimeType";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/RTC/CodecMimeType members", () => {
    const {
        H264,
        OPUS,
        ULPFEC,
        VP8,
        VP9,
        CodecMimeType,
        default: CodecMimeTypeDefault,
        ...others
    } = exported;

    it( "known members", () => {
        expect( H264 ).toBe( 'h264' );
        expect( OPUS ).toBe( 'opus' );
        expect( ULPFEC ).toBe( 'ulpfec' );
        expect( VP8 ).toBe( 'vp8' );
        expect( VP9 ).toBe( 'vp9' );
        if ( CodecMimeType ) {
            expect( CodecMimeType.H264 ).toBe( 'h264' );
            expect( CodecMimeType.OPUS ).toBe( 'opus' );
            expect( CodecMimeType.ULPFEC ).toBe( 'ulpfec' );
            expect( CodecMimeType.VP8 ).toBe( 'vp8' );
            expect( CodecMimeType.VP9 ).toBe( 'vp9' );
        }
        if ( CodecMimeTypeDefault ) {
            expect( CodecMimeTypeDefault.H264 ).toBe( 'h264' );
            expect( CodecMimeTypeDefault.OPUS ).toBe( 'opus' );
            expect( CodecMimeTypeDefault.ULPFEC ).toBe( 'ulpfec' );
            expect( CodecMimeTypeDefault.VP8 ).toBe( 'vp8' );
            expect( CodecMimeTypeDefault.VP9 ).toBe( 'vp9' );
        }
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );