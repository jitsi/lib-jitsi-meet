/**
 * Creates a conference event.
 *
 * @param {string} action - The action of the event.
 * @param {Object} attributes - The attributes to be added to the event.
 * @returns {{type: string, source: string, action: string, attributes: object}}
 */
export function createConferenceEvent(action: string, attributes: any): {
    type: string;
    source: string;
    action: string;
    attributes: object;
};
/**
 * Creates an event which contains information about the audio output problem (the user id of the affected participant,
 * the local audio levels and the remote audio levels that triggered the event).
 *
 * @param {string} userID - The user id of the affected participant.
 * @param {*} localAudioLevels - The local audio levels.
 * @param {*} remoteAudioLevels - The audio levels received from the participant.
 */
export function createAudioOutputProblemEvent(userID: string, localAudioLevels: any, remoteAudioLevels: any): {
    type: string;
    action: string;
    attributes: {
        userID: string;
        localAudioLevels: any;
        remoteAudioLevels: any;
    };
};
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
export const TYPE_OPERATIONAL: string;
/**
 * The constant which identifies an event of type "page".
 * @type {string}
 */
export const TYPE_PAGE: string;
/**
 * The constant which identifies an event of type "track".
 * @type {string}
 */
export const TYPE_TRACK: string;
/**
 * The constant which identifies an event of type "ui".
 * @type {string}
 */
export const TYPE_UI: string;
/**
 * The "action" value for Jingle events which indicates that the Jingle session
 * was restarted (TODO: verify/fix the documentation)
 * @type {string}
 */
export const ACTION_JINGLE_RESTART: string;
/**
 * The "action" value for Jingle events which indicates that a session-accept
 * timed out (TODO: verify/fix the documentation)
 * @type {string}
 */
export const ACTION_JINGLE_SA_TIMEOUT: string;
/**
 * The "action" value for Jingle events which indicates that a session-initiate
 * was received.
 * @type {string}
 */
export const ACTION_JINGLE_SI_RECEIVED: string;
/**
 * The "action" value for Jingle events which indicates that a session-initiate
 * not arrived within a timeout (the value is specified in
 * the {@link JingleSessionPC}.
 * @type {string}
 */
export const ACTION_JINGLE_SI_TIMEOUT: string;
/**
 * A constant for the "terminate" action for Jingle events. TODO: verify/fix
 * the documentation)
 * @type {string}
 */
export const ACTION_JINGLE_TERMINATE: string;
/**
 * The "action" value for Jingle events which indicates that a transport-replace
 * was received.
 * @type {string}
 */
export const ACTION_JINGLE_TR_RECEIVED: string;
/**
 * The "action" value for Jingle events which indicates that a transport-replace
 * succeeded (TODO: verify/fix the documentation)
 * @type {string}
 */
export const ACTION_JINGLE_TR_SUCCESS: string;
/**
 * The "action" value for P2P events which indicates that P2P session initiate message has been rejected by the client
 * because the mandatory requirements were not met.
 * @type {string}
 */
export const ACTION_P2P_DECLINED: string;
/**
 * The "action" value for P2P events which indicates that a connection was
 * established (TODO: verify/fix the documentation)
 * @type {string}
 */
export const ACTION_P2P_ESTABLISHED: string;
/**
 * The "action" value for P2P events which indicates that something failed.
 * @type {string}
 */
export const ACTION_P2P_FAILED: string;
/**
 * The "action" value for P2P events which indicates that a switch to
 * jitsi-videobridge happened.
 * @type {string}
 */
export const ACTION_P2P_SWITCH_TO_JVB: string;
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
export const AVAILABLE_DEVICE: string;
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
export const CONNECTION_DISCONNECTED: "connection.disconnected";
/**
 * Indicates that the user of the application provided feedback in terms of a
 * rating (an integer from 1 to 5) and an optional comment.
 * Properties:
 *      value: the user's rating (an integer from 1 to 5)
 *      comment: the user's comment
 */
export const FEEDBACK: "feedback";
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
export const ICE_DURATION: "ice.duration";
/**
 * Indicates the difference in milliseconds between the ICE establishment time
 * for the P2P and JVB connections (e.g. a value of 10 would indicate that the
 * P2P connection took 10ms more than JVB connection to establish).
 *
 * Properties:
 *      value: the difference in establishment durations in milliseconds.
 *
 */
export const ICE_ESTABLISHMENT_DURATION_DIFF: "ice.establishment.duration.diff";
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
export const ICE_STATE_CHANGED: "ice.state.changed";
/**
 * Indicates that no bytes have been sent for the track.
 *
 * Properties:
 *      mediaType: the media type of the local track ('audio' or 'video').
 */
export const NO_BYTES_SENT: "track.no-bytes-sent";
/**
 * Indicates that a track was unmuted (?).
 *
 * Properties:
 *      mediaType: the media type of the local track ('audio' or 'video').
 *      trackType: the type of the track ('local' or 'remote').
 *      value: TODO: document
 */
export const TRACK_UNMUTED: "track.unmuted";
export function createBridgeDownEvent(): {
    action: string;
    actionSubject: string;
    type: string;
};
export function createConnectionFailedEvent(errorType: any, errorMessage: any, details: any): {
    type: string;
    action: string;
    attributes: any;
};
export function createConnectionStageReachedEvent(stage: any, attributes: any): {
    action: string;
    actionSubject: any;
    attributes: any;
    source: string;
    type: string;
};
export function createE2eRttEvent(participantId: any, region: any, rtt: any): {
    attributes: {
        participant_id: any;
        region: any;
        rtt: any;
    };
    name: string;
    type: string;
};
export function createFocusLeftEvent(): {
    action: string;
    actionSubject: string;
    type: string;
};
export function createGetUserMediaEvent(action: any, attributes?: {}): {
    type: string;
    source: string;
    name: string;
};
export function createParticipantConnectionStatusEvent(attributes?: {}): {
    type: string;
    source: string;
    name: string;
};
export function createJingleEvent(action: any, attributes?: {}): {
    type: string;
    action: any;
    source: string;
    attributes: {};
};
export function createNoDataFromSourceEvent(mediaType: string, value: any): {
    attributes: {
        media_type: string;
        value: any;
    };
    action: string;
    type: string;
};
export function createP2PEvent(action: any, attributes?: {}): {
    type: string;
    action: any;
    source: string;
    attributes: {};
};
export function createRemotelyMutedEvent(): {
    type: string;
    action: string;
};
export function createRtpStatsEvent(attributes: any): {
    type: string;
    action: string;
    attributes: any;
};
export function createRttByRegionEvent(attributes: any): {
    type: string;
    action: string;
    attributes: any;
};
export function createTransportStatsEvent(attributes: any): {
    type: string;
    action: string;
    attributes: any;
};
export function createBridgeChannelClosedEvent(code: string, reason: string): {
    type: string;
    action: string;
    attributes: {
        code: string;
        reason: string;
    };
};
export function createTtfmEvent(attributes: any): {
    action: string;
    actionSubject: any;
    attributes: any;
    source: string;
    type: string;
};
