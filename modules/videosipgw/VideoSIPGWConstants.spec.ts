import * as exported from "./VideoSIPGWConstants";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/modules/videosipgw/VideoSIPGWConstants members", () => {
    const {
        STATUS_AVAILABLE,
        STATUS_UNDEFINED,
        STATUS_BUSY,
        STATE_ON,
        STATE_OFF,
        STATE_PENDING,
        STATE_RETRYING,
        STATE_FAILED,
        ERROR_NO_CONNECTION,
        ERROR_SESSION_EXISTS,
        VideoSIPGWStatusConstants,
        VideoSIPGWStateConstants,
        VideoSIPGWErrorConstants,
        ...others
    } = exported;

    it( "known members", () => {
        expect( STATUS_AVAILABLE ).toBe( 'available' );
        expect( STATUS_UNDEFINED ).toBe( 'undefined' );
        expect( STATUS_BUSY ).toBe( 'busy' );
        expect( STATE_ON ).toBe( 'on' );
        expect( STATE_OFF ).toBe( 'off' );
        expect( STATE_PENDING ).toBe( 'pending' );
        expect( STATE_RETRYING ).toBe( 'retrying' );
        expect( STATE_FAILED ).toBe( 'failed' );
        expect( ERROR_NO_CONNECTION ).toBe( 'error_no_connection' );
        expect( ERROR_SESSION_EXISTS ).toBe( 'error_session_already_exists' );

        expect( VideoSIPGWStatusConstants ).toBeDefined();
        expect( VideoSIPGWStateConstants ).toBeDefined();
        expect( VideoSIPGWErrorConstants ).toBeDefined();

        expect( VideoSIPGWStatusConstants.STATUS_AVAILABLE ).toBe( 'available' );
        expect( VideoSIPGWStatusConstants.STATUS_UNDEFINED ).toBe( 'undefined' );
        expect( VideoSIPGWStatusConstants.STATUS_BUSY ).toBe( 'busy' );
        expect( VideoSIPGWStateConstants.STATE_ON ).toBe( 'on' );
        expect( VideoSIPGWStateConstants.STATE_OFF ).toBe( 'off' );
        expect( VideoSIPGWStateConstants.STATE_PENDING ).toBe( 'pending' );
        expect( VideoSIPGWStateConstants.STATE_RETRYING ).toBe( 'retrying' );
        expect( VideoSIPGWStateConstants.STATE_FAILED ).toBe( 'failed' );
        expect( VideoSIPGWErrorConstants.ERROR_NO_CONNECTION ).toBe( 'error_no_connection' );
        expect( VideoSIPGWErrorConstants.ERROR_SESSION_EXISTS ).toBe( 'error_session_already_exists' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );