import { default as exported } from "./MediaSessionEvents";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/modules/xmpp/MediaSessionEvents members", () => {
    const {
        REMOTE_VIDEO_CONSTRAINTS_CHANGED,
        MediaSessionEvents,
        ...others
    } = exported as any; // TODO: remove cast after typescript conversion

    it( "known members", () => {
        expect( REMOTE_VIDEO_CONSTRAINTS_CHANGED ).toBe( 'media_session.REMOTE_VIDEO_CONSTRAINTS_CHANGED' );
        if ( MediaSessionEvents ) {
            expect( MediaSessionEvents.REMOTE_VIDEO_CONSTRAINTS_CHANGED ).toBe( 'media_session.REMOTE_VIDEO_CONSTRAINTS_CHANGED' );
        }
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );