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

/**
 * The constant which identifies an event of type "operational".
 * @type {string}
 */
export const TYPE_OPERATIONAL = 'operational';

/**
 * The constant which identifies an event of type "page".
 * @type {string}
 */
export const TYPE_PAGE = 'page';

/**
 * The constant which identifies an event of type "track".
 * @type {string}
 */
export const TYPE_TRACK = 'track';

/**
 * The constant which identifies an event of type "ui".
 * @type {string}
 */
export const TYPE_UI = 'ui';

/**
 * The "action" value for Jingle events which indicates that the Jingle session
 * was restarted (TODO: verify/fix the documentation)
 * @type {string}
 */
export const ACTION_JINGLE_RESTART = 'restart';

/**
 * The "action" value for Jingle events which indicates that a session-accept
 * timed out (TODO: verify/fix the documentation)
 * @type {string}
 */
export const ACTION_JINGLE_SA_TIMEOUT = 'session-accept.timeout';

/**
 * The "action" value for Jingle events which indicates that a session-initiate
 * was received.
 * @type {string}
 */
export const ACTION_JINGLE_SI_RECEIVED = 'session-initiate.received';

/**
 * The "action" value for Jingle events which indicates that a session-initiate
 * not arrived within a timeout (the value is specified in
 * the {@link JingleSessionPC}.
 * @type {string}
 */
export const ACTION_JINGLE_SI_TIMEOUT = 'session-initiate.timeout';

/**
 * A constant for the "terminate" action for Jingle events. TODO: verify/fix
 * the documentation)
 * @type {string}
 */
export const ACTION_JINGLE_TERMINATE = 'terminate';

/**
 * The "action" value for Jingle events which indicates that a transport-replace
 * was received.
 * @type {string}
 */
export const ACTION_JINGLE_TR_RECEIVED
    = 'transport-replace.received';

/**
 * The "action" value for Jingle events which indicates that a transport-replace
 * succeeded (TODO: verify/fix the documentation)
 * @type {string}
 */
export const ACTION_JINGLE_TR_SUCCESS
    = 'transport-replace.success';

/**
 * The "action" value for P2P events which indicates that P2P session initiate message has been rejected by the client
 * because the mandatory requirements were not met.
 * @type {string}
 */
export const ACTION_P2P_DECLINED = 'decline';

/**
 * The "action" value for P2P events which indicates that a connection was
 * established (TODO: verify/fix the documentation)
 * @type {string}
 */
export const ACTION_P2P_ESTABLISHED = 'established';

/**
 * The "action" value for P2P events which indicates that something failed.
 * @type {string}
 */
export const ACTION_P2P_FAILED = 'failed';

/**
 * The "action" value for P2P events which indicates that a switch to
 * jitsi-videobridge happened.
 * @type {string}
 */
export const ACTION_P2P_SWITCH_TO_JVB = 'switch.to.jvb';

/**
 * The name of an event which indicates an available device. We send one such
 * event per available device once when the available devices are first known,
 * and every time that they change
 * @type {string}
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
export const AVAILABLE_DEVICE = 'available.device';

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
export const CONNECTION_DISCONNECTED = 'connection.disconnected';

/**
 * Indicates that the user of the application provided feedback in terms of a
 * rating (an integer from 1 to 5) and an optional comment.
 * Properties:
 *      value: the user's rating (an integer from 1 to 5)
 *      comment: the user's comment
 */
export const FEEDBACK = 'feedback';

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
export const ICE_DURATION = 'ice.duration';

/**
 * Indicates the difference in milliseconds between the ICE establishment time
 * for the P2P and JVB connections (e.g. a value of 10 would indicate that the
 * P2P connection took 10ms more than JVB connection to establish).
 *
 * Properties:
 *      value: the difference in establishment durations in milliseconds.
 *
 */
export const ICE_ESTABLISHMENT_DURATION_DIFF
    = 'ice.establishment.duration.diff';

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
export const ICE_STATE_CHANGED = 'ice.state.changed';

/**
 * Indicates that no bytes have been sent for the track.
 *
 * Properties:
 *      mediaType: the media type of the local track ('audio' or 'video').
 */
export const NO_BYTES_SENT = 'track.no-bytes-sent';

/**
 * Indicates that a track was unmuted (?).
 *
 * Properties:
 *      mediaType: the media type of the local track ('audio' or 'video').
 *      trackType: the type of the track ('local' or 'remote').
 *      value: TODO: document
 */
export const TRACK_UNMUTED = 'track.unmuted';

/**
 * Creates an operational event which indicates that we have received a
 * "bridge down" event from jicofo.
 */
export const createBridgeDownEvent = function() {
    const bridgeDown = 'bridge.down';

    return {
        action: bridgeDown,
        actionSubject: bridgeDown,
        type: TYPE_OPERATIONAL
    };
};

/**
 * Creates an event which indicates that the XMPP connection failed
 * @param errorType TODO
 * @param errorMessage TODO
 * @param detail connection failed details.
 */
export const createConnectionFailedEvent
    = function(errorType, errorMessage, details) {
        return {
            type: TYPE_OPERATIONAL,
            action: 'connection.failed',
            attributes: {
                'error_type': errorType,
                'error_message': errorMessage,
                ...details
            }
        };
    };

/**
 * Creates a conference event.
 *
 * @param {string} action - The action of the event.
 * @param {Object} attributes - The attributes to be added to the event.
 * @returns {{type: string, source: string, action: string, attributes: object}}
 */
export function createConferenceEvent(action, attributes) {
    return {
        action,
        attributes,
        source: 'conference',
        type: TYPE_OPERATIONAL
    };
}

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
export const createConnectionStageReachedEvent = function(stage, attributes) {
    const action = 'connection.stage.reached';

    return {
        action,
        actionSubject: stage,
        attributes,
        source: action,
        type: TYPE_OPERATIONAL
    };
};

/**
 * Creates an operational event for the end-to-end round trip time to a
 * specific remote participant.
 * @param participantId the ID of the remote participant.
 * @param region the region of the remote participant
 * @param rtt the rtt
 */
export const createE2eRttEvent = function(participantId, region, rtt) {
    const attributes = {
        'participant_id': participantId,
        region,
        rtt
    };

    return {
        attributes,
        name: 'e2e_rtt',
        type: TYPE_OPERATIONAL
    };
};

/**
 * Creates an event which indicates that the focus has left the MUC.
 */
export const createFocusLeftEvent = function() {
    const action = 'focus.left';

    return {
        action,
        actionSubject: action,
        type: TYPE_OPERATIONAL
    };
};

/**
 * Creates an event related to a getUserMedia call.
 *
 * @param action the type of the result that the event represents: 'error',
 * 'success', 'warning', etc.
 * @param attributes the attributes to attach to the event.
 * @returns {{type: string, source: string, name: string}}
 */
export const createGetUserMediaEvent = function(action, attributes = {}) {
    return {
        type: TYPE_OPERATIONAL,
        source: 'get.user.media',
        action,
        attributes
    };
};

/**
 * Creates an event related to remote participant connection status changes.
 *
 * @param attributes the attributes to attach to the event.
 * @returns {{type: string, source: string, name: string}}
 */
export const createParticipantConnectionStatusEvent = function(attributes = {}) {
    const action = 'duration';

    return {
        type: TYPE_OPERATIONAL,
        source: 'peer.conn.status',
        action,
        attributes
    };
};

/**
 * Creates an event for a Jingle-related event.
 * @param action the action of the event
 * @param attributes attributes to add to the event.
 */
export const createJingleEvent = function(action, attributes = {}) {
    return {
        type: TYPE_OPERATIONAL,
        action,
        source: 'jingle',
        attributes
    };
};

/**
 * Creates an event which indicates that a local track was not able to read
 * data from its source (a camera or a microphone).
 *
 * @param mediaType {String} the media type of the local track ('audio' or
 * 'video').
 */
export const createNoDataFromSourceEvent = function(mediaType, value) {
    return {
        attributes: {
            'media_type': mediaType,
            value
        },
        action: 'track.no.data.from.source',
        type: TYPE_OPERATIONAL
    };
};

/**
 * Creates an event for a p2p-related event.
 * @param action the action of the event
 * @param attributes attributes to add to the event.
 */
export const createP2PEvent = function(action, attributes = {}) {
    return {
        type: TYPE_OPERATIONAL,
        action,
        source: 'p2p',
        attributes
    };
};

/**
 * Indicates that we received a remote command to mute.
 */
export const createRemotelyMutedEvent = function() {
    return {
        type: TYPE_OPERATIONAL,
        action: 'remotely.muted'
    };
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
export const createRtpStatsEvent = function(attributes) {
    return {
        type: TYPE_OPERATIONAL,
        action: 'rtp.stats',
        attributes
    };
};

/**
 * Creates an event which contains the round trip time (RTT) to a set of
 * regions.
 *
 * @param attributes
 * @returns {{type: string, action: string, attributes: *}}
 */
export const createRttByRegionEvent = function(attributes) {
    return {
        type: TYPE_OPERATIONAL,
        action: 'rtt.by.region',
        attributes
    };
};

/**
 * Creates an event which contains the local and remote ICE candidate types
 * for the transport that is currently selected.
 *
 * @param attributes
 * @returns {{type: string, action: string, attributes: *}}
 */
export const createTransportStatsEvent = function(attributes) {
    return {
        type: TYPE_OPERATIONAL,
        action: 'transport.stats',
        attributes
    };
};

/**
 * Creates an event which contains information about the audio output problem (the user id of the affected participant,
 * the local audio levels and the remote audio levels that triggered the event).
 *
 * @param {string} userID - The user id of the affected participant.
 * @param {*} localAudioLevels - The local audio levels.
 * @param {*} remoteAudioLevels - The audio levels received from the participant.
 */
export function createAudioOutputProblemEvent(userID, localAudioLevels, remoteAudioLevels) {
    return {
        type: TYPE_OPERATIONAL,
        action: 'audio.output.problem',
        attributes: {
            userID,
            localAudioLevels,
            remoteAudioLevels
        }
    };
}

/**
 * Creates an event which contains an information related to the bridge channel close event.
 *
 * @param {string} code - A code from {@link https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent}
 * @param {string} reason - A string which describes the reason for closing the bridge channel.
 * @returns {{type: string, action: string, attributes: { code: string, reason: string }}}
 */
export const createBridgeChannelClosedEvent = function(code, reason) {
    return {
        type: TYPE_OPERATIONAL,
        action: 'bridge-channel.error',
        attributes: {
            code,
            reason
        }
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
export const createTtfmEvent = function(attributes) {
    return createConnectionStageReachedEvent('ttfm', attributes);
};
