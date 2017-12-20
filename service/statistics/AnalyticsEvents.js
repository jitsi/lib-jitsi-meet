/**
 * Note that an event's own properties and its permanent properties are
 * are merged in one object. Because of this an event should never use
 * properties with names that are already used by permanent properties
 * (unless the intention is to override a permanent property). Here is a
 * (non-exhaustive) list of currently know permanent properties:
 *
 * abtestSuspendVideo
 * browserName
 * callstatsname
 * crossRegion
 * forceJvb121
 * region
 * roomName
 * shard
 * size
 * userAgent
 * userRegion
 *
 * The naming convention for the constants below uses "_" as a prefix or
 * suffix to indicate that known usage of the constant prepends or appends
 * a string to the name of the event.
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
 * Events with source 'sporadic' are sent from various places in the code, and
 * indicate things which happen any action from the user. These events do not
 * happen in every conference, and do not happen periodically. They are grouped
 * together by this value for the 'source' attribute, because they may be of
 * interest when looking for events in a particular conference.
 * @type {string}
 */
const SOURCE_SPORADIC = 'sporadic';

// Kosher:

/**
 * Creates an operational event which indicates that we have received a
 * "bridge down" event from jicofo.
 */
export const createBridgeDownEvent = function() {
    const bridgeDown = 'bridge.down';

    return {
        action: bridgeDown,
        actionSubject: bridgeDown,
        source: SOURCE_SPORADIC,
        type: TYPE_OPERATIONAL
    };
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
 * Creates an event which indicates that the focus has left the MUC.
 */
export const createFocusLeftEvent = function() {
    const action = 'focus.left';

    return {
        action,
        actionSubject: action,
        source: SOURCE_SPORADIC,
        type: TYPE_OPERATIONAL
    };
};

/**
 * Creates an event for a p2p-related event.
 * @param name the name of the event, to which "p2p." will be prepended.
 * @param attributes attributes to add to the event.
 */
export const createJingleEvent = function(name, attributes = {}) {
    return {
        type: TYPE_OPERATIONAL,
        action: `jingle.${name}`,
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
export const createNoDataFromSourceEvent = function(mediaType) {
    return {
        attributes: { mediaType },
        name: 'track.no.data.from.source',
        source: SOURCE_SPORADIC,
        type: TYPE_OPERATIONAL
    };
};

/**
 * Creates an event for a p2p-related event.
 * @param name the name of the event, to which "p2p." will be prepended.
 * @param attributes attributes to add to the event.
 */
export const createP2pEvent = function(name, attributes = {}) {
    return {
        type: TYPE_OPERATIONAL,
        action: `p2p.${name}`,
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
        action: 'remotely.muted',
        source: SOURCE_SPORADIC
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
        name: 'rtp.stats',
        attributes
    };
};


/**
 * Creates an event which indicates that a timeout was reached for a Jingle
 * session.
 * @param p2p whether the Jingle session is peer-to-peer or with Jicofo.
 */
export const createSessionAcceptTimeoutEvent = function(p2p) {
    return {
        type: TYPE_OPERATIONAL,
        action: 'session.accept.timeout',
        source: 'jingle',
        attributes: { p2p }
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
 * @param attributes the attributes to att the the event. Currently used fields:
 *      mediaType: the media type of the local track ('audio' or 'video').
 *      muted: whether the track has ever been muted (?)
 *      value: the TTMF in milliseconds.
 */
export const createTtfmEvent = function(attributes) {
    return createConnectionStageReachedEvent('ttfm', attributes);
};

/**
 * The name of an event which indicates an available device. We send one such
 * event per available device once when the available devices are first known,
 * and every time that they change
 * @type {string}
 *
 * Properties:
 *      audioInputDeviceCount: the number of audio input devices available at
 *          the time the event was sent.
 *      audioOutputDeviceCount: the number of audio output devices available at
 *          the time the event was sent.
 *      videoInputDeviceCount: the number of video input devices available at
 *          the time the event was sent.
 *      videoOutputDeviceCount: the number of video output devices available at
 *          the time the event was sent.
 *      deviceId: an identifier of the device described in this event.
 *      deviceGroupId:
 *      deviceKind: one of 'audioinput', 'audiooutput', 'videoinput' or
 *          'videooutput'.
 *      deviceLabel: a string which describes the device.
 */
export const AVAILABLE_DEVICE = 'available.device';

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
 *          reconnecting (or is it ICE???).
 */
export const ICE_STATE_CHANGED = 'ice.state.changed';

/**
 * Indicates that a track was unmuted (?).
 *
 * Properties:
 *      mediaType: the media type of the local track ('audio' or 'video').
 *      type: the type of the track ('local' or 'remote').
 *      value: ???
 */
export const TRACK_UNMUTED = 'track.unmuted';


// Treif:

/**
 * Properties: none
 *
 * Known full event names: NONE
 *
 * TODO: document, reformat?, deprecate?
 */
export const CONNECTION_DISCONNECTED_ = 'connection.disconnected';

/**
 * Properties: label
 *
 * Known full event names:
 * connection.failed.connection.droppedError
 * connection.failed.connection.otherError
 * connection.failed.connection.passwordRequired
 *
 * TODO: document, reformat
 */
export const CONNECTION_FAILED_ = 'connection.failed';

/**
 * Properties: none
 *
 * Known full event names:
 * getUserMedia.deviceNotFound.audio
 * getUserMedia.deviceNotFound.audio.video
 * getUserMedia.deviceNotFound.video
 * getUserMedia.deviceNotFound.screen
 *
 * TODO: document, reformat, merge with GET_USER_MEDIA_FAILED?
 */
export const GET_USER_MEDIA_DEVICE_NOT_FOUND_
    = 'getUserMedia.deviceNotFound';

/**
 * Properties: none
 *
 * Known full event names:
 * getUserMedia.fail.resolution.180
 * getUserMedia.fail.resolution.360
 * getUserMedia.fail.resolution.640
 * getUserMedia.fail.resolution.720
 * getUserMedia.fail.resolution.960
 *
 * TODO: reformat, merge with GET_USER_MEDIA_FAILED
 */
export const GET_USER_MEDIA_FAIL_ = 'getUserMedia.fail';

/**
 * Properties: value
 *
 * Known full event names:
 * getUserMedia.failed.Error
 * getUserMedia.failed.TypeError
 * getUserMedia.failed.audio.TypeError
 * getUserMedia.failed.audio.gum.general
 * getUserMedia.failed.audio.gum.permission_denied
 * getUserMedia.failed.audio.track.no_data_from_source
 * getUserMedia.failed.audio.video.180.gum.general
 * getUserMedia.failed.audio.video.360.gum.general
 * getUserMedia.failed.audio.video.360.gum.permission_denied
 * getUserMedia.failed.audio.video.360.track.no_data_from_source
 * getUserMedia.failed.audio.video.720.TypeError
 * getUserMedia.failed.audio.video.720.gum.constraint_failed
 * getUserMedia.failed.audio.video.720.gum.general
 * getUserMedia.failed.audio.video.720.gum.permission_denied
 * getUserMedia.failed.audio.video.720.track.no_data_from_source
 * getUserMedia.failed.audio.video.960.gum.permission_denied
 * getUserMedia.failed.audio.video.undefined.gum.general
 * getUserMedia.failed.desktop.TypeError
 * getUserMedia.failed.desktop.gum.chrome_extension_generic_error
 * getUserMedia.failed.desktop.gum.chrome_extension_installation_error
 * getUserMedia.failed.desktop.gum.chrome_extension_user_gesture_required
 * getUserMedia.failed.desktop.gum.general
 * getUserMedia.failed.desktop.track.no_data_from_source
 * getUserMedia.failed.gum.chrome_extension_generic_error
 * getUserMedia.failed.gum.chrome_extension_installation_error
 * getUserMedia.failed.gum.constraint_failed
 * getUserMedia.failed.gum.firefox_extension_needed
 * getUserMedia.failed.gum.general
 * getUserMedia.failed.gum.permission_denied
 * getUserMedia.failed.undefined
 * getUserMedia.failed.video.360.gum.permission_denied
 * getUserMedia.failed.video.720.TypeError
 * getUserMedia.failed.video.720.gum.constraint_failed
 * getUserMedia.failed.video.720.gum.general
 * getUserMedia.failed.video.720.gum.permission_denied
 * getUserMedia.failed.video.720.track.no_data_from_source
 * getUserMedia.failed.video.undefined.TypeError
 * getUserMedia.failed.video.undefined.gum.general
 * getUserMedia.failed.video.undefined.track.no_data_from_source
 *
 * TODO: reformat
 */
export const GET_USER_MEDIA_FAILED_ = 'getUserMedia.failed';

/**
 * Properties: value
 *
 * Known full event names:
 * getUserMedia.success
 * getUserMedia.success.audio
 * getUserMedia.success.audio.video.180
 * getUserMedia.success.audio.video.300
 * getUserMedia.success.audio.video.360
 * getUserMedia.success.audio.video.720
 * getUserMedia.success.audio.video.960
 * getUserMedia.success.audio.video.undefined
 * getUserMedia.success.desktop
 * getUserMedia.success.video.180
 * getUserMedia.success.video.360
 * getUserMedia.success.video.720
 * getUserMedia.success.video.960
 * getUserMedia.success.video.undefined
 *
 * TODO: document, reformat
 */
export const GET_USER_MEDIA_SUCCESS_ = 'getUserMedia.success';

/**
 * Properties: none
 *
 * Known full event names:
 * getUserMedia.userCancel.extensionInstall
 *
 * TODO: document, reformat
 */
export const GET_USER_MEDIA_USER_CANCEL_ = 'getUserMedia.userCancel';
