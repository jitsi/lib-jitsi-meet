import * as exported from "./JitsiConferenceErrors";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/JitsiConferenceErrors members", () => {
    const {
        AUTH_ERROR_TYPES,
        AUTHENTICATION_REQUIRED,
        CHAT_ERROR,
        SETTINGS_ERROR,
        CONFERENCE_DESTROYED,
        CONFERENCE_MAX_USERS,
        CONNECTION_ERROR,
        CONFERENCE_RESTARTED,
        DISPLAY_NAME_REQUIRED,
        NOT_ALLOWED_ERROR,
        MEMBERS_ONLY_ERROR,
        CONFERENCE_ACCESS_DENIED,
        FOCUS_DISCONNECTED,
        FOCUS_LEFT,
        GRACEFUL_SHUTDOWN,
        ICE_FAILED,
        INCOMPATIBLE_SERVER_VERSIONS,
        OFFER_ANSWER_FAILED,
        PASSWORD_NOT_SUPPORTED,
        PASSWORD_REQUIRED,
        RESERVATION_ERROR,
        VIDEOBRIDGE_NOT_AVAILABLE,
        JitsiConferenceErrors,
        ...others
    } = exported;

    it( "known members", () => {
        expect( AUTH_ERROR_TYPES.GENERAL ).toBe( 'general' );
        expect( AUTH_ERROR_TYPES.NO_MAIN_PARTICIPANTS ).toBe( 'no-main-participants' );
        expect( AUTH_ERROR_TYPES.NO_VISITORS_LOBBY ).toBe( 'no-visitors-lobby' );
        expect( AUTH_ERROR_TYPES.PROMOTION_NOT_ALLOWED ).toBe( 'promotion-not-allowed' );
        expect( AUTH_ERROR_TYPES.ROOM_CREATION_RESTRICTION ).toBe( 'room-creation-restriction' );
        expect( AUTHENTICATION_REQUIRED ).toBe( 'conference.authenticationRequired' );
        expect( CHAT_ERROR ).toBe( 'conference.chatError' );
        expect( SETTINGS_ERROR ).toBe( 'conference.settingsError' );
        expect( CONFERENCE_DESTROYED ).toBe( 'conference.destroyed' );
        expect( CONFERENCE_MAX_USERS ).toBe( 'conference.max_users' );
        expect( CONNECTION_ERROR ).toBe( 'conference.connectionError' );
        expect( CONFERENCE_RESTARTED ).toBe( 'conference.restarted' );
        expect( DISPLAY_NAME_REQUIRED ).toBe( 'conference.display_name_required' );
        expect( NOT_ALLOWED_ERROR ).toBe( 'conference.connectionError.notAllowed' );
        expect( MEMBERS_ONLY_ERROR ).toBe( 'conference.connectionError.membersOnly' );
        expect( CONFERENCE_ACCESS_DENIED ).toBe( 'conference.connectionError.accessDenied' );
        expect( FOCUS_DISCONNECTED ).toBe( 'conference.focusDisconnected' );
        expect( FOCUS_LEFT ).toBe( 'conference.focusLeft' );
        expect( GRACEFUL_SHUTDOWN ).toBe( 'conference.gracefulShutdown' );
        expect( ICE_FAILED ).toBe( 'conference.iceFailed' );
        expect( INCOMPATIBLE_SERVER_VERSIONS ).toBe( 'conference.incompatible_server_versions' );
        expect( OFFER_ANSWER_FAILED ).toBe( 'conference.offerAnswerFailed' );
        expect( PASSWORD_NOT_SUPPORTED ).toBe( 'conference.passwordNotSupported' );
        expect( PASSWORD_REQUIRED ).toBe( 'conference.passwordRequired' );
        expect( RESERVATION_ERROR ).toBe( 'conference.reservationError' );
        expect( VIDEOBRIDGE_NOT_AVAILABLE ).toBe( 'conference.videobridgeNotAvailable' );

        expect( JitsiConferenceErrors ).toBeDefined();

        expect( JitsiConferenceErrors.AUTHENTICATION_REQUIRED ).toBe( 'conference.authenticationRequired' );
        expect( JitsiConferenceErrors.CHAT_ERROR ).toBe( 'conference.chatError' );
        expect( JitsiConferenceErrors.SETTINGS_ERROR ).toBe( 'conference.settingsError' );
        expect( JitsiConferenceErrors.CONFERENCE_DESTROYED ).toBe( 'conference.destroyed' );
        expect( JitsiConferenceErrors.CONFERENCE_MAX_USERS ).toBe( 'conference.max_users' );
        expect( JitsiConferenceErrors.CONNECTION_ERROR ).toBe( 'conference.connectionError' );
        expect( JitsiConferenceErrors.CONFERENCE_RESTARTED ).toBe( 'conference.restarted' );
        expect( JitsiConferenceErrors.DISPLAY_NAME_REQUIRED ).toBe( 'conference.display_name_required' );
        expect( JitsiConferenceErrors.NOT_ALLOWED_ERROR ).toBe( 'conference.connectionError.notAllowed' );
        expect( JitsiConferenceErrors.MEMBERS_ONLY_ERROR ).toBe( 'conference.connectionError.membersOnly' );
        expect( JitsiConferenceErrors.CONFERENCE_ACCESS_DENIED ).toBe( 'conference.connectionError.accessDenied' );
        expect( JitsiConferenceErrors.FOCUS_DISCONNECTED ).toBe( 'conference.focusDisconnected' );
        expect( JitsiConferenceErrors.FOCUS_LEFT ).toBe( 'conference.focusLeft' );
        expect( JitsiConferenceErrors.GRACEFUL_SHUTDOWN ).toBe( 'conference.gracefulShutdown' );
        expect( JitsiConferenceErrors.ICE_FAILED ).toBe( 'conference.iceFailed' );
        expect( JitsiConferenceErrors.INCOMPATIBLE_SERVER_VERSIONS ).toBe( 'conference.incompatible_server_versions' );
        expect( JitsiConferenceErrors.OFFER_ANSWER_FAILED ).toBe( 'conference.offerAnswerFailed' );
        expect( JitsiConferenceErrors.PASSWORD_NOT_SUPPORTED ).toBe( 'conference.passwordNotSupported' );
        expect( JitsiConferenceErrors.PASSWORD_REQUIRED ).toBe( 'conference.passwordRequired' );
        expect( JitsiConferenceErrors.RESERVATION_ERROR ).toBe( 'conference.reservationError' );
        expect( JitsiConferenceErrors.VIDEOBRIDGE_NOT_AVAILABLE ).toBe( 'conference.videobridgeNotAvailable' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );
