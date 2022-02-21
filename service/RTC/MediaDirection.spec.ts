import * as exported from "./MediaDirection";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/RTC/MediaDirection members", () => {
    const {
        INACTIVE,
        RECVONLY,
        SENDONLY,
        SENDRECV,
        MediaDirection,
        ...others
    } = exported as any; // TODO: remove cast after typescript conversion

    it( "known members", () => {
        expect( INACTIVE ).toBe( 'inactive' );
        expect( RECVONLY ).toBe( 'recvonly' );
        expect( SENDONLY ).toBe( 'sendonly' );
        expect( SENDRECV ).toBe( 'sendrecv' );
        if ( MediaDirection ) {
            expect( MediaDirection.INACTIVE ).toBe( 'inactive' );
            expect( MediaDirection.RECVONLY ).toBe( 'recvonly' );
            expect( MediaDirection.SENDONLY ).toBe( 'sendonly' );
            expect( MediaDirection.SENDRECV ).toBe( 'sendrecv' );
        }
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );