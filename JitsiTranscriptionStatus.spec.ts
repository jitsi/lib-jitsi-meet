import * as exported from "./JitsiTranscriptionStatus";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/JitsiTranscriptionStatus members", () => {
    const {
        ON,
        OFF,
        JitsiTranscriptionStatus,
        ...others
    } = exported;

    it( "known members", () => {
        expect( ON ).toBe( 'on' );
        expect( OFF ).toBe( 'off' );

        expect( JitsiTranscriptionStatus ).toBeDefined();

        expect( JitsiTranscriptionStatus.ON ).toBe( 'on' );
        expect( JitsiTranscriptionStatus.OFF ).toBe( 'off' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );