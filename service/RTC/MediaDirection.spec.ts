import * as exported from "./MediaDirection";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/RTC/MediaDirection members", () => {
    const {
        MediaDirection,
        ...others
    } = exported;

    it( "known members", () => {
        expect( MediaDirection ).toBeDefined();

        expect( MediaDirection.INACTIVE ).toBe( 'inactive' );
        expect( MediaDirection.RECVONLY ).toBe( 'recvonly' );
        expect( MediaDirection.SENDONLY ).toBe( 'sendonly' );
        expect( MediaDirection.SENDRECV ).toBe( 'sendrecv' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );