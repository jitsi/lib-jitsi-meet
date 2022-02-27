import * as exported from "./JitsiTrackErrors";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/JitsiTrackErrors members", () => {
    const {
        CONSTRAINT_FAILED,
        ELECTRON_DESKTOP_PICKER_ERROR,
        ELECTRON_DESKTOP_PICKER_NOT_FOUND,
        GENERAL,
        NOT_FOUND,
        PERMISSION_DENIED,
        SCREENSHARING_GENERIC_ERROR,
        SCREENSHARING_USER_CANCELED,
        TIMEOUT,
        TRACK_IS_DISPOSED,
        TRACK_NO_STREAM_FOUND,
        UNSUPPORTED_RESOLUTION,
        JitsiTrackErrors,
        ...others
    } = exported;

    it( "known members", () => {
        expect( CONSTRAINT_FAILED ).toBe( 'gum.constraint_failed' );
        expect( ELECTRON_DESKTOP_PICKER_ERROR ).toBe( 'gum.electron_desktop_picker_error' );
        expect( ELECTRON_DESKTOP_PICKER_NOT_FOUND ).toBe( 'gum.electron_desktop_picker_not_found' );
        expect( GENERAL ).toBe( 'gum.general' );
        expect( NOT_FOUND ).toBe( 'gum.not_found' );
        expect( PERMISSION_DENIED ).toBe( 'gum.permission_denied' );
        expect( SCREENSHARING_GENERIC_ERROR ).toBe( 'gum.screensharing_generic_error' );
        expect( SCREENSHARING_USER_CANCELED ).toBe( 'gum.screensharing_user_canceled' );
        expect( TIMEOUT ).toBe( 'gum.timeout' );
        expect( TRACK_IS_DISPOSED ).toBe( 'track.track_is_disposed' );
        expect( TRACK_NO_STREAM_FOUND ).toBe( 'track.no_stream_found' );
        expect( UNSUPPORTED_RESOLUTION ).toBe( 'gum.unsupported_resolution' );

        expect( JitsiTrackErrors ).toBeDefined();

        expect( JitsiTrackErrors.CONSTRAINT_FAILED ).toBe( 'gum.constraint_failed' );
        expect( JitsiTrackErrors.ELECTRON_DESKTOP_PICKER_ERROR ).toBe( 'gum.electron_desktop_picker_error' );
        expect( JitsiTrackErrors.ELECTRON_DESKTOP_PICKER_NOT_FOUND ).toBe( 'gum.electron_desktop_picker_not_found' );
        expect( JitsiTrackErrors.GENERAL ).toBe( 'gum.general' );
        expect( JitsiTrackErrors.NOT_FOUND ).toBe( 'gum.not_found' );
        expect( JitsiTrackErrors.PERMISSION_DENIED ).toBe( 'gum.permission_denied' );
        expect( JitsiTrackErrors.SCREENSHARING_GENERIC_ERROR ).toBe( 'gum.screensharing_generic_error' );
        expect( JitsiTrackErrors.SCREENSHARING_USER_CANCELED ).toBe( 'gum.screensharing_user_canceled' );
        expect( JitsiTrackErrors.TIMEOUT ).toBe( 'gum.timeout' );
        expect( JitsiTrackErrors.TRACK_IS_DISPOSED ).toBe( 'track.track_is_disposed' );
        expect( JitsiTrackErrors.TRACK_NO_STREAM_FOUND ).toBe( 'track.no_stream_found' );
        expect( JitsiTrackErrors.UNSUPPORTED_RESOLUTION ).toBe( 'gum.unsupported_resolution' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );