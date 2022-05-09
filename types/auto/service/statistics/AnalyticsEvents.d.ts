/**
 * This class exports constants and factory methods related to the analytics
 * API provided by AnalyticsAdapter. In order for entries in a database to be
 * somewhat easily traceable back to the code which produced them, events sent
 * through analytics should be defined here.
 *
 * Since the AnalyticsAdapter API can be used in different ways, for some events
 * it is more convenient to just define the event name as a constant. For other
 * events a factory function is easier.
 *
 * A general approach for adding a new event:
 * 1. Determine the event type: track, UI, page, or operational. If in doubt use
 * operational.
 * 2. Determine whether the event is related to other existing events, and
 * which fields are desired to be set: name, action, actionSubject, source.
 * 3. If the name is sufficient (the other fields are not important), use a
 * constant. Otherwise use a factory function.
 *
 * Note that the AnalyticsAdapter uses the events passed to its functions for
 * its own purposes, and might modify them. Because of this, factory functions
 * should create new objects.
 *
 */
export declare enum AnalyticsEvents {
    /**
     * The constant which identifies an event of type "operational".
     */
    TYPE_OPERATIONAL = "operational",
    /**
     * The constant which identifies an event of type "page".
     */
    TYPE_PAGE = "page",
    /**
     * The constant which identifies an event of type "track".
     */
    TYPE_TRACK = "track",
    /**
     * The constant which identifies an event of type "ui".
     */
    TYPE_UI = "ui",
    /**
     * The "action" value for Jingle events which indicates that the Jingle session
     * was restarted (TODO: verify/fix the documentation)
     */
    ACTION_JINGLE_RESTART = "restart",
    /**
     * The "action" value for Jingle events which indicates that a session-accept
     * timed out (TODO: verify/fix the documentation)
     */
    ACTION_JINGLE_SA_TIMEOUT = "session-accept.timeout",
    /**
     * The "action" value for Jingle events which indicates that a session-initiate
     * was received.
     */
    ACTION_JINGLE_SI_RECEIVED = "session-initiate.received",
    /**
     * The "action" value for Jingle events which indicates that a session-initiate
     * not arrived within a timeout (the value is specified in
     * the {@link JingleSessionPC}.
     */
    ACTION_JINGLE_SI_TIMEOUT = "session-initiate.timeout",
    /**
     * A constant for the "terminate" action for Jingle events. TODO: verify/fix
     * the documentation)
     */
    ACTION_JINGLE_TERMINATE = "terminate",
    /**
     * The "action" value for Jingle events which indicates that a transport-replace
     * was received.
     */
    ACTION_JINGLE_TR_RECEIVED = "transport-replace.received",
    /**
     * The "action" value for Jingle events which indicates that a transport-replace
     * succeeded (TODO: verify/fix the documentation)
     */
    ACTION_JINGLE_TR_SUCCESS = "transport-replace.success",
    /**
     * The "action" value for P2P events which indicates that P2P session initiate message has been rejected by the client
     * because the mandatory requirements were not met.
     */
    ACTION_P2P_DECLINED = "decline",
    /**
     * The "action" value for P2P events which indicates that a connection was
     * established (TODO: verify/fix the documentation)
     */
    ACTION_P2P_ESTABLISHED = "established",
    /**
     * The "action" value for P2P events which indicates that something failed.
     */
    ACTION_P2P_FAILED = "failed",
    /**
     * The "action" value for P2P events which indicates that a switch to
     * jitsi-videobridge happened.
     */
    ACTION_P2P_SWITCH_TO_JVB = "switch.to.jvb",
    /**
     * The name of an event which indicates an available device. We send one such
     * event per available device once when the available devices are first known,
     * and every time that they change
     *
     * Properties:
     *      audio_input_device_count: the number of audio input devices available at
     *          the time the event was sent.
     *      audio_output_device_count: the number of audio output devices available
     *          at the time the event was sent.
     *      video_input_device_count: the number of video input devices available at
     *          the time the event was sent.
     *      video_output_device_count: the number of video output devices available
     *          at the time the event was sent.
     *      device_id: an identifier of the device described in this event.
     *      device_group_id:
     *      device_kind: one of 'audioinput', 'audiooutput', 'videoinput' or
     *          'videooutput'.
     *      device_label: a string which describes the device.
     */
    AVAILABLE_DEVICE = "available.device",
    /**
     * This appears to be fired only in certain cases when the XMPP connection
     * disconnects (and it was intentional?). It is currently never observed to
     * fire in production.
     *
     * TODO: document
     *
     * Properties:
     *      message: an error message
     */
    CONNECTION_DISCONNECTED = "connection.disconnected",
    /**
     * Indicates that the user of the application provided feedback in terms of a
     * rating (an integer from 1 to 5) and an optional comment.
     * Properties:
     *      value: the user's rating (an integer from 1 to 5)
     *      comment: the user's comment
     */
    FEEDBACK = "feedback",
    /**
     * Indicates the duration of a particular phase of the ICE connectivity
     * establishment.
     *
     * Properties:
     *      phase: the ICE phase (e.g. 'gathering', 'checking', 'establishment')
     *      value: the duration in milliseconds.
     *      p2p: whether the associated ICE connection is p2p or towards a
     *          jitsi-videobridge
     *      initiator: whether the local Jingle peer is the initiator or responder
     *          in the Jingle session. XXX we probably actually care about the ICE
     *          role (controlling vs controlled), and we assume that this correlates
     *          with the Jingle initiator.
     */
    ICE_DURATION = "ice.duration",
    /**
     * Indicates the difference in milliseconds between the ICE establishment time
     * for the P2P and JVB connections (e.g. a value of 10 would indicate that the
     * P2P connection took 10ms more than JVB connection to establish).
     *
     * Properties:
     *      value: the difference in establishment durations in milliseconds.
     *
     */
    ICE_ESTABLISHMENT_DURATION_DIFF = "ice.establishment.duration.diff",
    /**
     * Indicates that the ICE state has changed.
     *
     * Properties:
     *      state: the ICE state which was entered (e.g. 'checking', 'connected',
     *          'completed', etc).
     *      value: the time in milliseconds (as reported by
     *          window.performance.now()) that the state change occurred.
     *      p2p: whether the associated ICE connection is p2p or towards a
     *          jitsi-videobridge
     *      signalingState: The signaling state of the associated PeerConnection
     *      reconnect: whether the associated Jingle session is in the process of
     *          reconnecting (or is it ICE? TODO: verify/fix the documentation)
     */
    ICE_STATE_CHANGED = "ice.state.changed",
    /**
     * Indicates that no bytes have been sent for the track.
     *
     * Properties:
     *      mediaType: the media type of the local track ('audio' or 'video').
     */
    NO_BYTES_SENT = "track.no-bytes-sent",
    /**
     * Indicates that a track was unmuted (?).
     *
     * Properties:
     *      mediaType: the media type of the local track ('audio' or 'video').
     *      trackType: the type of the track ('local' or 'remote').
     *      value: TODO: document
     */
    TRACK_UNMUTED = "track.unmuted"
}
export declare const TYPE_OPERATIONAL = AnalyticsEvents.TYPE_OPERATIONAL;
export declare const TYPE_PAGE = AnalyticsEvents.TYPE_PAGE;
export declare const TYPE_TRACK = AnalyticsEvents.TYPE_TRACK;
export declare const TYPE_UI = AnalyticsEvents.TYPE_UI;
export declare const ACTION_JINGLE_RESTART = AnalyticsEvents.ACTION_JINGLE_RESTART;
export declare const ACTION_JINGLE_SA_TIMEOUT = AnalyticsEvents.ACTION_JINGLE_SA_TIMEOUT;
export declare const ACTION_JINGLE_SI_RECEIVED = AnalyticsEvents.ACTION_JINGLE_SI_RECEIVED;
export declare const ACTION_JINGLE_SI_TIMEOUT = AnalyticsEvents.ACTION_JINGLE_SI_TIMEOUT;
export declare const ACTION_JINGLE_TERMINATE = AnalyticsEvents.ACTION_JINGLE_TERMINATE;
export declare const ACTION_JINGLE_TR_RECEIVED = AnalyticsEvents.ACTION_JINGLE_TR_RECEIVED;
export declare const ACTION_JINGLE_TR_SUCCESS = AnalyticsEvents.ACTION_JINGLE_TR_SUCCESS;
export declare const ACTION_P2P_DECLINED = AnalyticsEvents.ACTION_P2P_DECLINED;
export declare const ACTION_P2P_ESTABLISHED = AnalyticsEvents.ACTION_P2P_ESTABLISHED;
export declare const ACTION_P2P_FAILED = AnalyticsEvents.ACTION_P2P_FAILED;
export declare const ACTION_P2P_SWITCH_TO_JVB = AnalyticsEvents.ACTION_P2P_SWITCH_TO_JVB;
export declare const AVAILABLE_DEVICE = AnalyticsEvents.AVAILABLE_DEVICE;
export declare const CONNECTION_DISCONNECTED = AnalyticsEvents.CONNECTION_DISCONNECTED;
export declare const FEEDBACK = AnalyticsEvents.FEEDBACK;
export declare const ICE_DURATION = AnalyticsEvents.ICE_DURATION;
export declare const ICE_ESTABLISHMENT_DURATION_DIFF = AnalyticsEvents.ICE_ESTABLISHMENT_DURATION_DIFF;
export declare const ICE_STATE_CHANGED = AnalyticsEvents.ICE_STATE_CHANGED;
export declare const NO_BYTES_SENT = AnalyticsEvents.NO_BYTES_SENT;
export declare const TRACK_UNMUTED = AnalyticsEvents.TRACK_UNMUTED;
/**
 * Creates an operational event which indicates that we have received a
 * "bridge down" event from jicofo.
 */
export declare const createBridgeDownEvent: () => {
    action: string;
    actionSubject: string;
    type: AnalyticsEvents;
};
/**
 * Creates an event which indicates that the XMPP connection failed
 * @param errorType TODO
 * @param errorMessage TODO
 * @param detail connection failed details.
 */
export declare const createConnectionFailedEvent: (errorType: unknown, errorMessage: unknown, details: object) => {
    type: AnalyticsEvents;
    action: string;
    attributes: {
        error_type: unknown;
        error_message: unknown;
    };
};
/**
 * Creates a conference event.
 *
 * @param action - The action of the event.
 * @param attributes - The attributes to be added to the event.
 */
export declare const createConferenceEvent: (action: string, attributes: object) => {
    action: string;
    attributes: object;
    source: string;
    type: AnalyticsEvents;
};
/**
 * Creates an operational event which indicates that a particular connection
 * stage was reached (i.e. the XMPP connection transitioned to the "connected"
 * state).
 *
 * @param stage the stage which was reached
 * @param attributes additional attributes for the event. This should be an
 * object with a "value" property indicating a timestamp in milliseconds
 * relative to the beginning of the document's lifetime.
 *
 */
export declare const createConnectionStageReachedEvent: (stage: unknown, attributes: object) => {
    action: string;
    actionSubject: unknown;
    attributes: object;
    source: string;
    type: AnalyticsEvents;
};
/**
 * Creates an operational event for the end-to-end round trip time to a
 * specific remote participant.
 * @param participantId the ID of the remote participant.
 * @param region the region of the remote participant
 * @param rtt the rtt
 */
export declare const createE2eRttEvent: (participantId: unknown, region: unknown, rtt: unknown) => {
    attributes: {
        participant_id: unknown;
        region: unknown;
        rtt: unknown;
    };
    name: string;
    type: AnalyticsEvents;
};
/**
 * Creates an event which indicates that the focus has left the MUC.
 */
export declare const createFocusLeftEvent: () => {
    action: string;
    actionSubject: string;
    type: AnalyticsEvents;
};
/**
 * Creates an event related to a getUserMedia call.
 *
 * @param action the type of the result that the event represents: 'error',
 * 'success', 'warning', etc.
 * @param attributes the attributes to attach to the event.
 */
export declare const createGetUserMediaEvent: (action: 'error' | 'success' | 'warning' | string, attributes?: object) => {
    type: AnalyticsEvents;
    source: string;
    action: string;
    attributes: object;
};
/**
 * Creates an event related to remote participant connection status changes.
 *
 * @param attributes the attributes to attach to the event.
 */
export declare const createParticipantConnectionStatusEvent: (attributes?: object) => {
    type: AnalyticsEvents;
    source: string;
    action: string;
    attributes: object;
};
/**
 * Creates an event related to remote track streaming status changes.
 *
 * @param attributes the attributes to attach to the event.
 */
export declare const createTrackStreamingStatusEvent: (attributes?: object) => {
    type: AnalyticsEvents;
    source: string;
    action: string;
    attributes: object;
};
/**
 * Creates an event for a Jingle-related event.
 * @param action the action of the event
 * @param attributes attributes to add to the event.
 */
export declare const createJingleEvent: (action: unknown, attributes?: object) => {
    type: AnalyticsEvents;
    action: unknown;
    source: string;
    attributes: object;
};
/**
 * Creates an event which indicates that a local track was not able to read
 * data from its source (a camera or a microphone).
 *
 * @param mediaType the media type of the local track ('audio' or
 * 'video').
 */
export declare const createNoDataFromSourceEvent: (mediaType: 'audio' | 'video' | string, value: unknown) => {
    attributes: {
        media_type: string;
        value: unknown;
    };
    action: string;
    type: AnalyticsEvents;
};
/**
 * Creates an event for a p2p-related event.
 * @param action the action of the event
 * @param attributes attributes to add to the event.
 */
export declare const createP2PEvent: (action: unknown, attributes?: object) => {
    type: AnalyticsEvents;
    action: unknown;
    source: string;
    attributes: object;
};
/**
 * Indicates that we received a remote command to mute.
 */
export declare const createRemotelyMutedEvent: (mediaType: unknown) => {
    type: AnalyticsEvents;
    action: string;
    mediaType: unknown;
};
/**
 * Creates an event which contains RTP statistics such as RTT and packet loss.
 *
 * All average RTP stats are currently reported under 1 event name, but with
 * different properties that allows to distinguish between a P2P call, a
 * call relayed through TURN or the JVB, and multiparty vs 1:1.
 *
 * The structure of the event is:
 *
 * {
 *      p2p: true,
 *      conferenceSize: 2,
 *      localCandidateType: "relay",
 *      remoteCandidateType: "relay",
 *      transportType: "udp",
 *
 *      // Average RTT of 200ms
 *      "rtt.avg": 200,
 *      "rtt.samples": "[100, 200, 300]",
 *
 *      // Average packet loss of 10%
 *      "packet.loss.avg": 10,
 *      "packet.loss.samples": '[5, 10, 15]'
 *
 *      // Difference in milliseconds in the end-to-end RTT between p2p and jvb.
 *      // The e2e RTT through jvb is 15ms shorter:
 *      "rtt.diff": 15,
 *
 *      // End-to-end RTT through JVB is ms.
 *      "end2end.rtt.avg" = 100
 * }
 *
 * Note that the value of the "samples" properties are (JSON encoded) strings,
 * and not JSON arrays, as events' attributes can not be nested. The samples are
 * currently included for debug purposes only and can be removed anytime soon
 * from the structure.
 *
 * Also note that not all of values are present in each event, as values are
 * obtained and calculated as part of different process/event pipe. For example
 * {@link ConnectionAvgStats} instances are doing the reports for each
 * {@link TraceablePeerConnection} and work independently from the main stats
 * pipe.
 */
export declare const createRtpStatsEvent: (attributes: object) => {
    type: AnalyticsEvents;
    action: string;
    attributes: object;
};
/**
 * Creates an event which contains the round trip time (RTT) to a set of
 * regions.
 *
 * @param attributes
 */
export declare const createRttByRegionEvent: (attributes: object) => {
    type: AnalyticsEvents;
    action: string;
    attributes: object;
};
/**
 * Creates an event which contains the local and remote ICE candidate types
 * for the transport that is currently selected.
 *
 * @param attributes
 */
export declare const createTransportStatsEvent: (attributes: object) => {
    type: AnalyticsEvents;
    action: string;
    attributes: object;
};
/**
 * Creates an event which contains information about the audio output problem (the user id of the affected participant,
 * the local audio levels and the remote audio levels that triggered the event).
 *
 * @param userID - The user id of the affected participant.
 * @param localAudioLevels - The local audio levels.
 * @param remoteAudioLevels - The audio levels received from the participant.
 */
export declare const createAudioOutputProblemEvent: (userID: string, localAudioLevels: unknown, remoteAudioLevels: unknown) => {
    type: AnalyticsEvents;
    action: string;
    attributes: {
        userID: string;
        localAudioLevels: unknown;
        remoteAudioLevels: unknown;
    };
};
/**
 * Creates an event which contains an information related to the bridge channel close event.
 *
 * @param code - A code from {@link https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent}
 * @param reason - A string which describes the reason for closing the bridge channel.
 */
export declare const createBridgeChannelClosedEvent: (code: string, reason: string) => {
    type: AnalyticsEvents;
    action: string;
    attributes: {
        code: string;
        reason: string;
    };
};
/**
 * Creates an event which indicates the Time To First Media (TTFM).
 * It is measured in milliseconds relative to the beginning of the document's
 * lifetime (i.e. the origin used by window.performance.now()), and it excludes
 * the following:
 * 1. The delay due to getUserMedia()
 * 2. The period between the MUC being joined and the reception of the Jingle
 * session-initiate from jicofo. This is because jicofo will not start a Jingle
 * session until there are at least 2 participants in the room.
 *
 * @param attributes the attributes to add to the event. Currently used fields:
 *      mediaType: the media type of the local track ('audio' or 'video').
 *      muted: whether the track has ever been muted (?)
 *      value: the TTMF in milliseconds.
 */
export declare const createTtfmEvent: (attributes: object) => {
    action: string;
    actionSubject: unknown;
    attributes: object;
    source: string;
    type: AnalyticsEvents;
};
