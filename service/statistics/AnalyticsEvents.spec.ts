import * as exported from "./AnalyticsEvents";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/service/statistics/AnalyticsEvents members", () => {
    const {
        TYPE_OPERATIONAL,
        TYPE_PAGE,
        TYPE_TRACK,
        TYPE_UI,
        ACTION_JINGLE_RESTART,
        ACTION_JINGLE_SA_TIMEOUT,
        ACTION_JINGLE_SI_RECEIVED,
        ACTION_JINGLE_SI_TIMEOUT,
        ACTION_JINGLE_TERMINATE,
        ACTION_JINGLE_TR_RECEIVED,
        ACTION_JINGLE_TR_SUCCESS,
        ACTION_P2P_DECLINED,
        ACTION_P2P_ESTABLISHED,
        ACTION_P2P_FAILED,
        ACTION_P2P_SWITCH_TO_JVB,
        AVAILABLE_DEVICE,
        CONNECTION_DISCONNECTED,
        FEEDBACK,
        ICE_DURATION,
        ICE_ESTABLISHMENT_DURATION_DIFF,
        ICE_STATE_CHANGED,
        NO_BYTES_SENT,
        TRACK_UNMUTED,
        createBridgeDownEvent,
        createConnectionFailedEvent,
        createConferenceEvent,
        createConnectionStageReachedEvent,
        createE2eRttEvent,
        createFocusLeftEvent,
        createGetUserMediaEvent,
        createParticipantConnectionStatusEvent,
        createTrackStreamingStatusEvent,
        createJingleEvent,
        createNoDataFromSourceEvent,
        createP2PEvent,
        createRemotelyMutedEvent,
        createRtpStatsEvent,
        createRttByRegionEvent,
        createTransportStatsEvent,
        createAudioOutputProblemEvent,
        createBridgeChannelClosedEvent,
        createTtfmEvent,
        AnalyticsEvents,
        ...others
    } = exported;

    it( "known members", () => {
        expect( TYPE_OPERATIONAL ).toBe( 'operational' );
        expect( TYPE_PAGE ).toBe( 'page' );
        expect( TYPE_TRACK ).toBe( 'track' );
        expect( TYPE_UI ).toBe( 'ui' );
        expect( ACTION_JINGLE_RESTART ).toBe( 'restart' );
        expect( ACTION_JINGLE_SA_TIMEOUT ).toBe( 'session-accept.timeout' );
        expect( ACTION_JINGLE_SI_RECEIVED ).toBe( 'session-initiate.received' );
        expect( ACTION_JINGLE_SI_TIMEOUT ).toBe( 'session-initiate.timeout' );
        expect( ACTION_JINGLE_TERMINATE ).toBe( 'terminate' );
        expect( ACTION_JINGLE_TR_RECEIVED ).toBe( 'transport-replace.received' );
        expect( ACTION_JINGLE_TR_SUCCESS ).toBe( 'transport-replace.success' );
        expect( ACTION_P2P_DECLINED ).toBe( 'decline' );
        expect( ACTION_P2P_ESTABLISHED ).toBe( 'established' );
        expect( ACTION_P2P_FAILED ).toBe( 'failed' );
        expect( ACTION_P2P_SWITCH_TO_JVB ).toBe( 'switch.to.jvb' );
        expect( AVAILABLE_DEVICE ).toBe( 'available.device' );
        expect( CONNECTION_DISCONNECTED ).toBe( 'connection.disconnected' );
        expect( FEEDBACK ).toBe( 'feedback' );
        expect( ICE_DURATION ).toBe( 'ice.duration' );
        expect( ICE_ESTABLISHMENT_DURATION_DIFF ).toBe( 'ice.establishment.duration.diff' );
        expect( ICE_STATE_CHANGED ).toBe( 'ice.state.changed' );
        expect( NO_BYTES_SENT ).toBe( 'track.no-bytes-sent' );
        expect( TRACK_UNMUTED ).toBe( 'track.unmuted' );

        expect( AnalyticsEvents ).toBeDefined();

        expect( AnalyticsEvents.TYPE_OPERATIONAL ).toBe( 'operational' );
        expect( AnalyticsEvents.TYPE_PAGE ).toBe( 'page' );
        expect( AnalyticsEvents.TYPE_TRACK ).toBe( 'track' );
        expect( AnalyticsEvents.TYPE_UI ).toBe( 'ui' );
        expect( AnalyticsEvents.ACTION_JINGLE_RESTART ).toBe( 'restart' );
        expect( AnalyticsEvents.ACTION_JINGLE_SA_TIMEOUT ).toBe( 'session-accept.timeout' );
        expect( AnalyticsEvents.ACTION_JINGLE_SI_RECEIVED ).toBe( 'session-initiate.received' );
        expect( AnalyticsEvents.ACTION_JINGLE_SI_TIMEOUT ).toBe( 'session-initiate.timeout' );
        expect( AnalyticsEvents.ACTION_JINGLE_TERMINATE ).toBe( 'terminate' );
        expect( AnalyticsEvents.ACTION_JINGLE_TR_RECEIVED ).toBe( 'transport-replace.received' );
        expect( AnalyticsEvents.ACTION_JINGLE_TR_SUCCESS ).toBe( 'transport-replace.success' );
        expect( AnalyticsEvents.ACTION_P2P_DECLINED ).toBe( 'decline' );
        expect( AnalyticsEvents.ACTION_P2P_ESTABLISHED ).toBe( 'established' );
        expect( AnalyticsEvents.ACTION_P2P_FAILED ).toBe( 'failed' );
        expect( AnalyticsEvents.ACTION_P2P_SWITCH_TO_JVB ).toBe( 'switch.to.jvb' );
        expect( AnalyticsEvents.AVAILABLE_DEVICE ).toBe( 'available.device' );
        expect( AnalyticsEvents.CONNECTION_DISCONNECTED ).toBe( 'connection.disconnected' );
        expect( AnalyticsEvents.FEEDBACK ).toBe( 'feedback' );
        expect( AnalyticsEvents.ICE_DURATION ).toBe( 'ice.duration' );
        expect( AnalyticsEvents.ICE_ESTABLISHMENT_DURATION_DIFF ).toBe( 'ice.establishment.duration.diff' );
        expect( AnalyticsEvents.ICE_STATE_CHANGED ).toBe( 'ice.state.changed' );
        expect( AnalyticsEvents.NO_BYTES_SENT ).toBe( 'track.no-bytes-sent' );
        expect( AnalyticsEvents.TRACK_UNMUTED ).toBe( 'track.unmuted' );

        expect( typeof ( createBridgeDownEvent ) ).toBe( 'function' );
        expect( typeof ( createConnectionFailedEvent ) ).toBe( 'function' );
        expect( typeof ( createConferenceEvent ) ).toBe( 'function' );
        expect( typeof ( createConnectionStageReachedEvent ) ).toBe( 'function' );
        expect( typeof ( createE2eRttEvent ) ).toBe( 'function' );
        expect( typeof ( createFocusLeftEvent ) ).toBe( 'function' );
        expect( typeof ( createGetUserMediaEvent ) ).toBe( 'function' );
        expect( typeof ( createParticipantConnectionStatusEvent ) ).toBe( 'function' );
        expect( typeof ( createTrackStreamingStatusEvent ) ).toBe( 'function' );
        expect( typeof ( createJingleEvent ) ).toBe( 'function' );
        expect( typeof ( createNoDataFromSourceEvent ) ).toBe( 'function' );
        expect( typeof ( createP2PEvent ) ).toBe( 'function' );
        expect( typeof ( createRemotelyMutedEvent ) ).toBe( 'function' );
        expect( typeof ( createRtpStatsEvent ) ).toBe( 'function' );
        expect( typeof ( createRttByRegionEvent ) ).toBe( 'function' );
        expect( typeof ( createTransportStatsEvent ) ).toBe( 'function' );
        expect( typeof ( createAudioOutputProblemEvent ) ).toBe( 'function' );
        expect( typeof ( createBridgeChannelClosedEvent ) ).toBe( 'function' );
        expect( typeof ( createTtfmEvent ) ).toBe( 'function' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );
