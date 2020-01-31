/**
 * The events for the conference.
 */

/**
 * Event indicates that the current conference audio input switched between audio
 * input states,i.e. with or without audio input.
 * @type {string}
 * @const
 */
export const AUDIO_INPUT_STATE_CHANGE = 'conference.audio_input_state_changed';

/**
 * Indicates that authentication status changed.
 * @type {string}
 * @const
 */
export const AUTH_STATUS_CHANGED = 'conference.auth_status_changed';

/**
 * A participant avatar has changed.
 * @type {string}
 * @const
 */
export const AVATAR_CHANGED = 'conference.avatarChanged';

/**
 * Fired just before the statistics module is disposed and it's the last chance
 * to submit some logs to the statistics service (ex. CallStats if enabled),
 * before it's disconnected.
 * @type {string}
 * @const
 */
export const BEFORE_STATISTICS_DISPOSED = 'conference.beforeStatisticsDisposed';

/**
 * Indicates that an error occured.
 * @type {string}
 * @const
 */
export const CONFERENCE_ERROR = 'conference.error';

/**
 * Indicates that conference failed.
 * @type {string}
 * @const
 */
export const CONFERENCE_FAILED = 'conference.failed';

/**
 * Indicates that conference has been joined. The event does NOT provide any
 * parameters to its listeners.
 * @type {string}
 * @const
 */
export const CONFERENCE_JOINED = 'conference.joined';

/**
 * Indicates that conference has been left.
 * @type {string}
 * @const
 */
export const CONFERENCE_LEFT = 'conference.left';

/**
 * Indicates that the connection to the conference has been established
 * XXX This is currently fired whenVthe *ICE* connection enters 'connected'
 * state for the first time.
 * @type {string}
 * @const
 */
export const CONNECTION_ESTABLISHED = 'conference.connectionEstablished';

/**
 * Indicates that the connection to the conference has been interrupted for some
 * reason.
 * XXX This is currently fired when the *ICE* connection is interrupted.
 * @type {string}
 * @const
 */
export const CONNECTION_INTERRUPTED = 'conference.connectionInterrupted';

/**
 * Indicates that the connection to the conference has been restored.
 * XXX This is currently fired when the *ICE* connection is restored.
 * @type {string}
 * @const
 */
export const CONNECTION_RESTORED = 'conference.connectionRestored';

/**
 * A connection to the video bridge's data channel has been established.
 * @type {string}
 * @const
 */
export const DATA_CHANNEL_OPENED = 'conference.dataChannelOpened';

/**
 * A user has changed it display name
 * @type {string}
 * @const
 */
export const DISPLAY_NAME_CHANGED = 'conference.displayNameChanged';

/**
 * The dominant speaker was changed.
 * @type {string}
 * @const
 */
export const DOMINANT_SPEAKER_CHANGED = 'conference.dominantSpeaker';

/**
 * UTC conference timestamp when first participant joined.
 * @type {string}
 * @const
 */
export const CONFERENCE_CREATED_TIMESTAMP = 'conference.createdTimestamp';

/**
 * Indicates that DTMF support changed.
 * @type {string}
 * @const
 */
export const DTMF_SUPPORT_CHANGED = 'conference.dtmfSupportChanged';

/**
 * Indicates that a message from another participant is received on data
 * channel.
 * @type {string}
 * @const
 */
export const ENDPOINT_MESSAGE_RECEIVED = 'conference.endpoint_message_received';

/**
 * NOTE This is lib-jitsi-meet internal event and can be removed at any time !
 *
 * Event emitted when conference transits, between one to one and multiparty JVB
 * conference. If the conference switches to P2P it's neither one to one nor
 * a multiparty JVB conference, but P2P (the status argument of this event will
 * be <tt>false</tt>).
 *
 * The first argument is a boolean which carries the previous value and
 * the seconds argument is a boolean with the new status. The event is emitted
 * only if the previous and the new values are different.
 * @type {string}
 * @const
 */
export const JVB121_STATUS = 'conference.jvb121Status';

/**
 * You are kicked from the conference.
 * @type {string}
 * @const
 * @param {JitsiParticipant} the participant that initiated the kick.
 */
export const KICKED = 'conference.kicked';

/**
 * Participant was kicked from the conference.
 * @type {string}
 * @const
 * @param {JitsiParticipant} the participant that initiated the kick.
 * @param {JitsiParticipant} the participant that was kicked.
 */
export const PARTICIPANT_KICKED = 'conference.participant_kicked';

/**
 * The Last N set is changed.
 * @type {string}
 * @const
 *
 * @param {Array<string>|null} leavingEndpointIds the ids of all the endpoints
 * which are leaving Last N
 * @param {Array<string>|null} enteringEndpointIds the ids of all the endpoints
 * which are entering Last N
 */
export const LAST_N_ENDPOINTS_CHANGED = 'conference.lastNEndpointsChanged';

/**
 * Indicates that the room has been locked or unlocked.
 * @type {string}
 * @const
 */
export const LOCK_STATE_CHANGED = 'conference.lock_state_changed';

/**
 * Indicates that the region of the media server (jitsi-videobridge) that we
 * are connected to changed (or was initially set).
 * @type {string} the region.
 * @const
 */
export const SERVER_REGION_CHANGED = 'conference.server_region_changed';

/**
 * New text message was received.
 * @type {string}
 * @const
 */
export const MESSAGE_RECEIVED = 'conference.messageReceived';

/**
 * Event indicates that the current selected input device has no signal
 * @type {string}
 * @const
 */
export const NO_AUDIO_INPUT = 'conference.no_audio_input';

/**
 * Event indicates that the current microphone used by the conference is noisy.
 * @type {string}
 * @const
 */
export const NOISY_MIC = 'conference.noisy_mic';

/**
 * New private text message was received.
 * @type {string}
 * @const
 */
export const PRIVATE_MESSAGE_RECEIVED = 'conference.privateMessageReceived';

/**
 * Event fired when JVB sends notification about interrupted/restored user's
 * ICE connection status or we detect local problem with the video track.
 * First argument is the ID of the participant and
 * the seconds is a string indicating if the connection is currently
 * - active - the connection is active
 * - inactive - the connection is inactive, was intentionally interrupted by
 * the bridge
 * - interrupted - a network problem occurred
 * - restoring - the connection was inactive and is restoring now
 *
 * The current status value can be obtained by calling
 * JitsiParticipant.getConnectionStatus().
 * @type {string}
 * @const
 */
export const PARTICIPANT_CONN_STATUS_CHANGED
    = 'conference.participant_conn_status_changed';

/**
 * Indicates that the features of the participant has been changed.
 * @type {string}
 * @const
 */
export const PARTCIPANT_FEATURES_CHANGED
    = 'conference.partcipant_features_changed';

/**
 * Indicates that a the value of a specific property of a specific participant
 * has changed.
 * @type {string}
 * @const
 */
export const PARTICIPANT_PROPERTY_CHANGED
    = 'conference.participant_property_changed';

/**
 * Indicates that the conference has switched between JVB and P2P connections.
 * The first argument of this event is a <tt>boolean</tt> which when set to
 * <tt>true</tt> means that the conference is running on the P2P connection.
 * @type {string}
 * @const
 */
export const P2P_STATUS = 'conference.p2pStatus';

/**
 * Indicates that phone number changed.
 * @type {string}
 * @const
 */
export const PHONE_NUMBER_CHANGED = 'conference.phoneNumberChanged';

/**
 * The conference properties changed.
 * @type {string}
 * @const
 */
export const PROPERTIES_CHANGED = 'conference.propertiesChanged';

/**
 * Indicates that recording state changed.
 * @type {string}
 * @const
 */
export const RECORDER_STATE_CHANGED = 'conference.recorderStateChanged';

/**
 * Indicates that video SIP GW state changed.
 * @type {string}
 * @const
 * @param {VideoSIPGWConstants} status.
 */
export const VIDEO_SIP_GW_AVAILABILITY_CHANGED
    = 'conference.videoSIPGWAvailabilityChanged';

/**
 * Indicates that video SIP GW Session state changed.
 * @type {string}
 * @const
 * @param {options} event - {
 *     {string} address,
 *     {VideoSIPGWConstants} oldState,
 *     {VideoSIPGWConstants} newState,
 *     {string} displayName}
 * }.
 */
export const VIDEO_SIP_GW_SESSION_STATE_CHANGED
    = 'conference.videoSIPGWSessionStateChanged';

/**
 * Indicates that start muted settings changed.
 * @type {string}
 * @const
 */
export const START_MUTED_POLICY_CHANGED
    = 'conference.start_muted_policy_changed';

/**
 * Indicates that the local user has started muted.
 * @type {string}
 * @const
 */
export const STARTED_MUTED = 'conference.started_muted';

/**
 * Indicates that subject of the conference has changed.
 * @type {string}
 * @const
 */
export const SUBJECT_CHANGED = 'conference.subjectChanged';

/**
 * Indicates that DTMF support changed.
 * @type {string}
 * @const
 */
export const SUSPEND_DETECTED = 'conference.suspendDetected';

/**
 * Event indicates that local user is talking while he muted himself
 * @type {string}
 * @const
 */
export const TALK_WHILE_MUTED = 'conference.talk_while_muted';

/**
 * A new media track was added to the conference. The event provides the
 * following parameters to its listeners:
 * @type {string}
 * @const
 *
 * @param {JitsiTrack} track the added JitsiTrack
 */
export const TRACK_ADDED = 'conference.trackAdded';

/**
 * Audio levels of a media track ( attached to the conference) was changed.
 * @type {string}
 * @const
 */
export const TRACK_AUDIO_LEVEL_CHANGED = 'conference.audioLevelsChanged';

/**
 * A media track ( attached to the conference) mute status was changed.
 * @type {string}
 * @const
 * @param {JitsiParticipant|null} the participant that initiated the mute
 * if it is a remote mute.
 */
export const TRACK_MUTE_CHANGED = 'conference.trackMuteChanged';

/**
 * The media track was removed from the conference. The event provides the
 * following parameters to its listeners:
 * @type {string}
 * @const
 *
 * @param {JitsiTrack} track the removed JitsiTrack
 */
export const TRACK_REMOVED = 'conference.trackRemoved';

/**
 * Notifies for transcription status changes. The event provides the
 * following parameters to its listeners:
 * @type {string}
 * @const
 * @param {String} status - The new status.
 */
export const TRANSCRIPTION_STATUS_CHANGED
    = 'conference.transcriptionStatusChanged';


/**
 * A new user joined the conference.
 * @type {string}
 * @const
 */
export const USER_JOINED = 'conference.userJoined';

/**
 * A user has left the conference.
 * @type {string}
 * @const
 */
export const USER_LEFT = 'conference.userLeft';

/**
 * User role changed.
 * @type {string}
 * @const
 */
export const USER_ROLE_CHANGED = 'conference.roleChanged';

/**
 * User status changed.
 * @type {string}
 * @const
 */
export const USER_STATUS_CHANGED = 'conference.statusChanged';

/**
 * Event indicates that the bot participant type changed.
 * @type {string}
 * @const
 */
export const BOT_TYPE_CHANGED = 'conference.bot_type_changed';
