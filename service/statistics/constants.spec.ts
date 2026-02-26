import * as exported from "./constants";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/statistics/constants members", () => {
    const {
        LOCAL_JID,
        ...others
    } = exported;

    it( "known members", () => {
        expect( LOCAL_JID ).toBe( 'local' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );