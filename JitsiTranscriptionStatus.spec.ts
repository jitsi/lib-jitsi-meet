import * as exported from "./JitsiTranscriptionStatus";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/JitsiTranscriptionStatus members", () => {
    const {
        ON,
        OFF,
        JitsiTranscriptionStatus,
        ...others
    } = exported as any; // TODO: remove cast after typescript conversion

    it( "known members", () => {
        expect( ON ).toBe( 'on' );
        expect( OFF ).toBe( 'off' );
        if ( JitsiTranscriptionStatus ) {
            expect( JitsiTranscriptionStatus.ON ).toBe( 'on' );
            expect( JitsiTranscriptionStatus.OFF ).toBe( 'off' );
        }
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );