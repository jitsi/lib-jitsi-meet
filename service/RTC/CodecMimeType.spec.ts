import exp from "constants";
import * as exported from "./CodecMimeType";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/RTC/CodecMimeType members", () => {
    const {
        CodecMimeType,
        AudioCodecMimeTypes,
        VideoCodecMimeTypes,
        ...others
    } = exported as any; // TODO: remove cast after typescript conversion

    it( "known members", () => {
        if ( CodecMimeType ) {
            expect( CodecMimeType.AV1 ).toBe( 'av1' );
            expect( CodecMimeType.H264 ).toBe( 'h264' );
            expect( CodecMimeType.OPUS ).toBe( 'opus' );
            expect( CodecMimeType.ULPFEC ).toBe( 'ulpfec' );
            expect( CodecMimeType.VP8 ).toBe( 'vp8' );
            expect( CodecMimeType.VP9 ).toBe( 'vp9' );
        }
        if ( VideoCodecMimeTypes ) {
            expect( VideoCodecMimeTypes ).toEqual([ CodecMimeType.VP9, CodecMimeType.VP8, CodecMimeType.H264 ]);
        }
        if ( AudioCodecMimeTypes ) {
            expect( AudioCodecMimeTypes ).toEqual([ CodecMimeType.OPUS, CodecMimeType.ULPFEC ]);
        }
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );