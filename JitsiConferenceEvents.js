/**
 * Enumeration with the events for the conference.
 * @type {{string: string}}
 */
var JitsiConferenceEvents = {
    /**
     * A new media track was added to the conference. The event provides the
     * following parameters to its listeners:
     *
     * @param {JitsiTrack} track the added JitsiTrack
     */
    TRACK_ADDED: "conference.trackAdded",
    /**
     * The media track was removed from the conference. The event provides the
     * following parameters to its listeners:
     *
     * @param {JitsiTrack} track the removed JitsiTrack
     */
    TRACK_REMOVED: "conference.trackRemoved",
    /**
     * The dominant speaker was changed.
     */
    DOMINANT_SPEAKER_CHANGED: "conference.dominantSpeaker",
    /**
     * A new user joinned the conference.
     */
    USER_JOINED: "conference.userJoined",
    /**
     * A user has left the conference.
     */
    USER_LEFT: "conference.userLeft",
    /**
     * User role changed.
     */
    USER_ROLE_CHANGED: "conference.roleChanged",
    /**
     * User status changed.
     */
    USER_STATUS_CHANGED: "conference.statusChanged",
    /**
     * New text message was received.
     */
    MESSAGE_RECEIVED: "conference.messageReceived",
    /**
     * A user has changed it display name
     */
    DISPLAY_NAME_CHANGED: "conference.displayNameChanged",
    /**
     * Indicates that subject of the conference has changed.
     */
    SUBJECT_CHANGED: "conference.subjectChanged",
    /**
     * A participant avatar has changed.
     */
    AVATAR_CHANGED: "conference.avatarChanged",
    /**
     * New local connection statistics are received.
     */
    CONNECTION_STATS: "conference.connectionStats",
    /**
     * The Last N set is changed.
     */
    LAST_N_ENDPOINTS_CHANGED: "conference.lastNEndpointsChanged",
    /**
     * You are included / excluded in somebody's last N set
     */
    IN_LAST_N_CHANGED: "conference.inLastNChanged",
    /**
     * A media track ( attached to the conference) mute status was changed.
     */
    TRACK_MUTE_CHANGED: "conference.trackMuteChanged",
    /**
     * Audio levels of a media track ( attached to the conference) was changed.
     */
    TRACK_AUDIO_LEVEL_CHANGED: "conference.audioLevelsChanged",
    /**
     * Indicates that the connection to the conference has been interrupted
     * for some reason.
     */
    CONNECTION_INTERRUPTED: "conference.connectionInterrupted",
    /**
     * Indicates that the connection to the conference has been restored.
     */
    CONNECTION_RESTORED: "conference.connectionRestored",
    /**
     * Indicates that conference failed.
     */
    CONFERENCE_FAILED: "conference.failed",
    /**
     * Indicates that an error occured.
     */
    CONFERENCE_ERROR: "conference.error",
    /**
     * Indicates that conference has been joined. The event does NOT provide any
     * parameters to its listeners.
     */
    CONFERENCE_JOINED: "conference.joined",
    /**
     * Indicates that conference has been left.
     */
    CONFERENCE_LEFT: "conference.left",
    /**
     * You are kicked from the conference.
     */
    KICKED: "conferenece.kicked",
    /**
     * Indicates that start muted settings changed.
     */
    START_MUTED_POLICY_CHANGED: "conference.start_muted_policy_changed",
    /**
     * Indicates that the local user has started muted.
     */
    STARTED_MUTED: "conference.started_muted",
    /**
     * Indicates that DTMF support changed.
     */
    DTMF_SUPPORT_CHANGED: "conference.dtmfSupportChanged",
    /**
     * Indicates that recording state changed.
     */
    RECORDER_STATE_CHANGED: "conference.recorderStateChanged",
    /**
     * Indicates that phone number changed.
     */
    PHONE_NUMBER_CHANGED: "conference.phoneNumberChanged",
    /**
     * Indicates that available devices changed.
     */
    AVAILABLE_DEVICES_CHANGED: "conference.availableDevicesChanged",
    /**
     * Indicates that authentication status changed.
     */
    AUTH_STATUS_CHANGED: "conference.auth_status_changed",
    /**
     * Indicates that a the value of a specific property of a specific
     * participant has changed.
     */
    PARTICIPANT_PROPERTY_CHANGED: "conference.participant_property_changed",
    /**
     * Indicates that a message from another participant is received on
     * data channel.
     */
    ENDPOINT_MESSAGE_RECEIVED: "conference.endpoint_message_received",
    /**
     * Indicates that the room has been locked or unlocked.
     */
    LOCK_STATE_CHANGED: "conference.lock_state_changed"
};

module.exports = JitsiConferenceEvents;
