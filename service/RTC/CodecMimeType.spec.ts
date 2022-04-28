import * as exported from "./CodecMimeType";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/RTC/CodecMimeType members", () => {
    const { CodecMimeType } = exported as any; // TODO: remove cast after typescript conversion

    it( "known members", () => {
        if ( CodecMimeType ) {
            expect( CodecMimeType.AV1 ).toBe( 'av1' );
            expect( CodecMimeType.H264 ).toBe( 'h264' );
            expect( CodecMimeType.OPUS ).toBe( 'opus' );
            expect( CodecMimeType.ULPFEC ).toBe( 'ulpfec' );
            expect( CodecMimeType.VP8 ).toBe( 'vp8' );
            expect( CodecMimeType.VP9 ).toBe( 'vp9' );
        }
    } );
} );
