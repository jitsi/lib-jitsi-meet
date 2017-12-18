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


// Kosher:

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
 */
export const ICE_STATE_CHANGED = 'ice.state.changed';

/**
 * Indicates that a local track was not able to read data from its source
 * (a camera or a microphone).
 *
 * Properties:
 *      mediaType: the media type of the local track ('audio' or 'video').
 */
export const NO_DATA_FROM_SOURCE = 'track.no.data.from.source';

/**
 * Indicates that a track was unmuted (?).
 *
 * Properties:
 *      mediaType: the media type of the local track ('audio' or 'video').
 *      type: the type of the track ('local' or 'remote').
 *      value: ???
 */
export const TRACK_UNMUTED = 'track.unmuted';

/**
 * Indicates the Time To First Media (TTFM). It is measured in milliseconds
 * relative to the beginning of the document's lifetime (i.e. the origin used
 * by window.performance.now()), and it excludes the following:
 * 1. The delay due to getUserMedia()
 * 2. The period between the MUC being joined and the reception of the Jingle
 * session-initiate from jicofo. This is because jicofo will not start a Jingle
 * session until there are at least 2 participants in the room.
 *
 * Properties:
 *      mediaType: the media type of the local track ('audio' or 'video').
 *      muted: whether the track has ever been muted (?)
 *      value: the TTMF in milliseconds.
 */
export const TTFM = 'ttfm';


// Treif:

/**
 * Properties: value
 *
 * TODO: document, reformat
 *
 * Full event names (uncertain):
 * conference.muc.joined (???)
 * conference.sharingDesktop.start (???)
 * conference.sharingDesktop.stop (???)
 * xmpp.attached (???)
 * xmpp.attaching (???)
 * xmpp.connected (???)
 * xmpp.connecting (???)
 * xmpp.session-initiate (???)
 */
export const _CONNECTION_TIMES_ = '';

/**
 * All average RTP stats are currently reported under 1 event name, but with
 * different properties that allows to distinguish between a P2P call, a
 * call relayed through TURN or the JVB, and multiparty vs 1:1.
 * Example structure of an "avg.rtp.stats" analytics event:
 *
 * {
     *   p2p: true,
     *   conferenceSize: 2,
     *   localCandidateType: "relay",
     *   remoteCandidateType: "relay",
     *   transportType: "udp",
     *
     *   "stat_avg_rtt": {
     *     value: 200,
     *     samples: [ 100, 200, 300 ]
     *   },
     *   "stat_avg_packetloss_total": {
     *     value: 10,
     *     samples: [ 5, 10, 15]
     *   }
     * }
 *
 * Note that the samples array is currently emitted for debug purposes only
 * and can be removed anytime soon from the structure.
 *
 * Also not all values are always present in "avg.rtp.stats", some of the
 * values are obtained and calculated as part of different process/event
 * pipe. For example {@link ConnectionAvgStats} instances are doing the
 * reports for each {@link TraceablePeerConnection} and work independently
 * from the main stats pipe.
 */
export const AVG_RTP_STATS = 'avg.rtp.stats';

/**
 * Properties: none
 *
 * TODO: document, deprecate?
 */
export const BRIDGE_DOWN = 'conference.bridgeDown';

/**
 * Properties: none
 *
 * Known full event names:
 * conference.error.p2pSessionAcceptTimeout
 * conference.error.sessionAcceptTimeout
 *
 * TODO: document, reformat
 */
export const CONFERENCE_ERROR_ = 'conference.error';

/**
 * Properties: none
 *
 * TODO: document
 */
export const CONNECTION_INTERRUPTED = 'connection.interrupted';

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
 * TODO: document
 */
export const CONNECTION_RESTORED = 'connection.restored';

/**
 * Properties: value
 *
 * TODO: document, deprecate (is it the same as the one which is part of
 * CONNECTION_TIMES?)
 */
export const DATA_CHANNEL_OPEN = 'conference.dataChannel.open';

/**
 * TODO: document, reformat
 */
export const DEVICE_LIST = 'devices.deviceList';

/**
 * User feedback event.
 * Properties: value, detailed
 *
 * TODO: document
 */
export const FEEDBACK = 'feedback.rating';

/**
 * Properties: none
 *
 * TODO: document
 */
export const FOCUS_LEFT = 'conference.focusLeft';

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

/**
 * Properties: none
 *
 * TODO: document
 * TODO: do we need this in addition to _ICE_CONNECTION_STATE?
 */
export const ICE_FAILED = 'connection.ice_failed';

/**
 * Properties: none
 *
 * TODO: document
 */
export const P2P_ESTABLISHED = 'p2p.established';

/**
 * Properties: none
 *
 * TODO: document
 */
export const P2P_FAILED = 'p2p.failed';

/**
 * Properties: none
 *
 * TODO: document
 */
export const P2P_SWITCH_TO_JVB = 'p2p.switch_to_jvb';

/**
 * Properties: none
 *
 * TODO: document
 */
export const REMOTELY_MUTED = 'conference.remotelyMuted';

/**
 * Properties: value
 *
 * TODO: document
 *
 * The "value" property contains the delay in milliseconds between joining
 * the MUC and receiving a Jingle session-initiate from Jicofo (but not
 * P2P).
 */
export const SESSION_INITIATE = 'session.initiate';

/**
 * Properties: value
 *
 * TODO: document
 */
export const SESSION_INITIATE_RECEIVED = 'xmpp.session-initiate';

/**
 * Properties: none
 *
 * TODO: document
 */
export const SESSION_TERMINATE = 'session.terminate';

/**
 * Properties: none
 *
 * TODO: document
 */
export const SESSION_RESTART = 'session.restart';

/**
 * Properties: value
 *
 * TODO: document
 */
export const TRANSPORT_REPLACE_START = 'xmpp.transport-replace.start';

/**
 * Properties: value
 *
 * TODO: document
 */
export const TRANSPORT_REPLACE_SUCCESS = 'xmpp.transport-replace.success';
