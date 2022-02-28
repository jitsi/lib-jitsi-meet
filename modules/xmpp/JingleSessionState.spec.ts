import * as exported from "./JingleSessionState";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/modules/xmpp/JingleSessionState members", () => {
    const {
        PENDING,
        ACTIVE,
        ENDED,
        JingleSessionState,
        ...others
    } = exported;

    it( "known members", () => {
        expect( PENDING ).toBe( 'pending' );
        expect( ACTIVE ).toBe( 'active' );
        expect( ENDED ).toBe( 'ended' );

        expect( JingleSessionState ).toBeDefined();

        expect( JingleSessionState.PENDING ).toBe( 'pending' );
        expect( JingleSessionState.ACTIVE ).toBe( 'active' );
        expect( JingleSessionState.ENDED ).toBe( 'ended' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );