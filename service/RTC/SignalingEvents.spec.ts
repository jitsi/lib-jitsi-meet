import * as exported from "./SignalingEvents";


describe( "/service/RTC/SignalingEvents members", () => {
    const {
        SignalingEvents,
        ...others
    } = exported;

    it( "known members", () => {
        expect( SignalingEvents ).toBeDefined();

        expect( SignalingEvents.PEER_MUTED_CHANGED ).toBe( 'signaling.peerMuted' );
        expect( SignalingEvents.PEER_VIDEO_TYPE_CHANGED ).toBe( 'signaling.peerVideoType' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );