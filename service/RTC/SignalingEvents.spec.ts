import * as exported from "./SignalingEvents";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/RTC/SignalingEvents members", () => {
    const {
        PEER_MUTED_CHANGED,
        PEER_VIDEO_TYPE_CHANGED,
        SOURCE_MUTED_CHANGED,
        SOURCE_VIDEO_TYPE_CHANGED,
        SignalingEvents,
        ...others
    } = exported;

    it( "known members", () => {
        expect( PEER_MUTED_CHANGED ).toBe( 'signaling.peerMuted' );
        expect( PEER_VIDEO_TYPE_CHANGED ).toBe( 'signaling.peerVideoType' );
        expect( SOURCE_MUTED_CHANGED ).toBe( 'signaling.sourceMuted');
        expect( SOURCE_VIDEO_TYPE_CHANGED ).toBe( 'signaling.sourceVideoType');

        expect( SignalingEvents ).toBeDefined();

        expect( SignalingEvents.PEER_MUTED_CHANGED ).toBe( 'signaling.peerMuted' );
        expect( SignalingEvents.PEER_VIDEO_TYPE_CHANGED ).toBe( 'signaling.peerVideoType' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );