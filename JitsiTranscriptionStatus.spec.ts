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
        expect( ON ).toBe( 'ON' );
        expect( OFF ).toBe( 'OFF' );

        expect( JitsiTranscriptionStatus ).toBeDefined();

        expect( JitsiTranscriptionStatus.ON ).toBe( 'ON' );
        expect( JitsiTranscriptionStatus.OFF ).toBe( 'OFF' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );