import * as exported from "./MediaType";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/RTC/MediaType members", () => {
    const {
        MediaType,
        ...others
    } = exported;

    it( "known members", () => {
        expect( MediaType ).toBeDefined();

        expect( MediaType.AUDIO ).toBe( 'audio' );
        expect( MediaType.PRESENTER ).toBe( 'presenter' );
        expect( MediaType.VIDEO ).toBe( 'video' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );