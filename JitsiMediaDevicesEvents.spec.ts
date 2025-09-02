import * as exported from "./JitsiMediaDevicesEvents";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/JitsiMediaDevicesEvents members", () => {
    const {
        JitsiMediaDevicesEvents,
        ...others
    } = exported;

    it( "known members", () => {
        expect( JitsiMediaDevicesEvents ).toBeDefined();

        expect( JitsiMediaDevicesEvents.DEVICE_LIST_CHANGED ).toBe( 'mediaDevices.devicechange' );
        expect( JitsiMediaDevicesEvents.PERMISSIONS_CHANGED ).toBe( 'rtc.permissions_changed' );
        expect( JitsiMediaDevicesEvents.PERMISSION_PROMPT_IS_SHOWN ).toBe( 'mediaDevices.permissionPromptIsShown' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );