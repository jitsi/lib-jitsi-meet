import * as exported from "./MediaType";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/RTC/MediaType members", () => {
    const {
        AUDIO,
        PRESENTER,
        VIDEO,
        MediaType,
        default: MediaTypeDefault,
        ...others
    } = exported as any; // TODO: remove the cast once MediaType can be exported correctly

    it( "known members", () => {
        expect( AUDIO ).toBe( 'audio' );
        expect( PRESENTER ).toBe( 'presenter' );
        expect( VIDEO ).toBe( 'video' );
        if ( MediaType ) {
            expect( MediaType.AUDIO ).toBe( 'audio' );
            expect( MediaType.PRESENTER ).toBe( 'presenter' );
            expect( MediaType.VIDEO ).toBe( 'video' );
        }
        if ( MediaTypeDefault ) {
            expect( MediaTypeDefault.AUDIO ).toBe( 'audio' );
            expect( MediaTypeDefault.PRESENTER ).toBe( 'presenter' );
            expect( MediaTypeDefault.VIDEO ).toBe( 'video' );
        }
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );