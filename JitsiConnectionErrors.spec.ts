import * as exported from "./JitsiConnectionErrors";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/JitsiConnectionErrors members", () => {
    const {
        CONFERENCE_REQUEST_FAILED,
        CONNECTION_DROPPED_ERROR,
        NOT_LIVE_ERROR,
        OTHER_ERROR,
        PASSWORD_REQUIRED,
        SERVER_ERROR,
        JitsiConnectionErrors,
        ...others
    } = exported;

    it( "known members", () => {
        expect( CONFERENCE_REQUEST_FAILED ).toBe( 'connection.conferenceRequestFailed' );
        expect( CONNECTION_DROPPED_ERROR ).toBe( 'connection.droppedError' );
        expect( NOT_LIVE_ERROR ).toBe( 'connection.notLiveError' );
        expect( OTHER_ERROR ).toBe( 'connection.otherError' );
        expect( PASSWORD_REQUIRED ).toBe( 'connection.passwordRequired' );
        expect( SERVER_ERROR ).toBe( 'connection.serverError' );

        expect( JitsiConnectionErrors ).toBeDefined();

        expect( JitsiConnectionErrors.CONFERENCE_REQUEST_FAILED ).toBe( 'connection.conferenceRequestFailed' );
        expect( JitsiConnectionErrors.CONNECTION_DROPPED_ERROR ).toBe( 'connection.droppedError' );
        expect( JitsiConnectionErrors.NOT_LIVE_ERROR ).toBe( 'connection.notLiveError' );
        expect( JitsiConnectionErrors.OTHER_ERROR ).toBe( 'connection.otherError' );
        expect( JitsiConnectionErrors.PASSWORD_REQUIRED ).toBe( 'connection.passwordRequired' );
        expect( JitsiConnectionErrors.SERVER_ERROR ).toBe( 'connection.serverError' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );
