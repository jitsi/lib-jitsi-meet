import { ACTIONS } from "./constants";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "modules/proxyconnection/constants members", () => {
    const {
        ACCEPT,
        CONNECTION_ERROR,
        INITIATE,
        TERMINATE,
        TRANSPORT_INFO,
        UNAVAILABLE,
        ...others
    } = ACTIONS;

    it( "known members", () => {
        expect( ACCEPT ).toBe( 'session-accept' );
        expect( CONNECTION_ERROR ).toBe( 'connection-error-encountered' );
        expect( INITIATE ).toBe( 'session-initiate' );
        expect( TERMINATE ).toBe( 'session-terminate' );
        expect( TRANSPORT_INFO ).toBe( 'transport-info' );
        expect( UNAVAILABLE ).toBe( 'unavailable' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );