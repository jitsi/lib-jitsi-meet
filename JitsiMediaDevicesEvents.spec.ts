import * as exported from "./JitsiMediaDevicesEvents";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/JitsiMediaDevicesEvents members", () => {
    const {
        DEVICE_LIST_CHANGED,
        PERMISSIONS_CHANGED,
        PERMISSION_PROMPT_IS_SHOWN,
        SLOW_GET_USER_MEDIA,
        JitsiMediaDevicesEvents,
        ...others
    } = exported;

    it( "known members", () => {
        expect( DEVICE_LIST_CHANGED ).toBe( 'mediaDevices.devicechange' );
        expect( PERMISSIONS_CHANGED ).toBe( 'rtc.permissions_changed' );
        expect( PERMISSION_PROMPT_IS_SHOWN ).toBe( 'mediaDevices.permissionPromptIsShown' );
        expect( SLOW_GET_USER_MEDIA ).toBe( 'mediaDevices.slowGetUserMedia' );

        expect( JitsiMediaDevicesEvents ).toBeDefined();

        expect( JitsiMediaDevicesEvents.DEVICE_LIST_CHANGED ).toBe( 'mediaDevices.devicechange' );
        expect( JitsiMediaDevicesEvents.PERMISSIONS_CHANGED ).toBe( 'rtc.permissions_changed' );
        expect( JitsiMediaDevicesEvents.PERMISSION_PROMPT_IS_SHOWN ).toBe( 'mediaDevices.permissionPromptIsShown' );
        expect( JitsiMediaDevicesEvents.SLOW_GET_USER_MEDIA ).toBe( 'mediaDevices.slowGetUserMedia' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );