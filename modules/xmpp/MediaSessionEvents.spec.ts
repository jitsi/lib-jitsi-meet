import * as exported from "./MediaSessionEvents";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/modules/xmpp/MediaSessionEvents members", () => {
    const {
        MediaSessionEvents,
        ...others
    } = exported;

    it( "known members", () => {
        expect( MediaSessionEvents ).toBeDefined();

        expect( MediaSessionEvents.REMOTE_SOURCE_CONSTRAINTS_CHANGED ).toBe( 'media_session.REMOTE_SOURCE_CONSTRAINTS_CHANGED' );
        expect( MediaSessionEvents.VIDEO_CODEC_CHANGED ).toBe( 'media_session.VIDEO_CODEC_CHANGED' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );