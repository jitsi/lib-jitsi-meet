import * as exported from "./MediaType";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/RTC/MediaType members", () => {
    const {
        AUDIO,
        PRESENTER,
        VIDEO,
        MediaType,
        ...others
    } = exported as any; // TODO: remove cast after typescript conversion

    it( "known members", () => {
        expect( AUDIO ).toBe( 'audio' );
        expect( PRESENTER ).toBe( 'presenter' );
        expect( VIDEO ).toBe( 'video' );
        if ( MediaType ) {
            expect( MediaType.AUDIO ).toBe( 'audio' );
            expect( MediaType.PRESENTER ).toBe( 'presenter' );
            expect( MediaType.VIDEO ).toBe( 'video' );
        }
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );