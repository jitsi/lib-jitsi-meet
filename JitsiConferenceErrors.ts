/**
 * The errors for the conference.
 */

export enum JitsiConferenceErrors {
    /**
     * Indicates that client must be authenticated to create the conference.
     */
    AUTHENTICATION_REQUIRED = 'conference.authenticationRequired',

    /**
     * Indicates that chat error occurred.
     */
    CHAT_ERROR = 'conference.chatError',

    /**
     * Indicates that a settings error occurred.
     */
    SETTINGS_ERROR = 'conference.settingsError',

    /**
     * Indicates that conference has been destroyed.
     */
    CONFERENCE_DESTROYED = 'conference.destroyed',

    /**
     * Indicates that max users limit has been reached.
     */
    CONFERENCE_MAX_USERS = 'conference.max_users',

    /**
     * Indicates that a connection error occurred when trying to join a conference.
     */
    CONNECTION_ERROR = 'conference.connectionError',

    /**
     * Indicates that the client has been forced to restart by jicofo when the
     * conference was migrated from one bridge to another.
     */
    CONFERENCE_RESTARTED = 'conference.restarted',

    /**
     * Indicates that a connection error is due to not allowed,
     * occurred when trying to join a conference.
     */
    NOT_ALLOWED_ERROR = 'conference.connectionError.notAllowed',

    /**
     * Indicates that a connection error is due to not allowed,
     * occurred when trying to join a conference, only approved members are allowed to join.
     */
    MEMBERS_ONLY_ERROR = 'conference.connectionError.membersOnly',

    /**
     * Indicates that a connection error is due to denied access to the room,
     * occurred after joining a lobby room and access is denied by the room moderators.
     */
    CONFERENCE_ACCESS_DENIED = 'conference.connectionError.accessDenied',

    /**
     * Indicates that focus error happened.
     */
    FOCUS_DISCONNECTED = 'conference.focusDisconnected',

    /**
     * Indicates that focus left the conference.
     */
    FOCUS_LEFT = 'conference.focusLeft',

    /**
     * Indicates that graceful shutdown happened.
     */
    GRACEFUL_SHUTDOWN = 'conference.gracefulShutdown',

    /**
     * Indicates that the media connection has failed.
     */
    ICE_FAILED = 'conference.iceFailed',

    /**
     * Indicates that the versions of the server side components are incompatible
     * with the client side.
     */
    INCOMPATIBLE_SERVER_VERSIONS = 'conference.incompatible_server_versions',

    /**
     * Indicates that offer/answer had failed.
     */
    OFFER_ANSWER_FAILED = 'conference.offerAnswerFailed',

    /**
     * Indicates that password cannot be set for this conference.
     */
    PASSWORD_NOT_SUPPORTED = 'conference.passwordNotSupported',

    /**
     * Indicates that a password is required in order to join the conference.
     */
    PASSWORD_REQUIRED = 'conference.passwordRequired',

    /**
     * Indicates that reservation system returned error.
     */
    RESERVATION_ERROR = 'conference.reservationError',

    /**
     * Indicates that there is no available videobridge.
     */
    VIDEOBRIDGE_NOT_AVAILABLE = 'conference.videobridgeNotAvailable'
};

// exported for backward compatibility
export const AUTHENTICATION_REQUIRED = JitsiConferenceErrors.AUTHENTICATION_REQUIRED;
export const CHAT_ERROR = JitsiConferenceErrors.CHAT_ERROR;
export const SETTINGS_ERROR = JitsiConferenceErrors.SETTINGS_ERROR;
export const CONFERENCE_DESTROYED = JitsiConferenceErrors.CONFERENCE_DESTROYED;
export const CONFERENCE_MAX_USERS = JitsiConferenceErrors.CONFERENCE_MAX_USERS;
export const CONNECTION_ERROR = JitsiConferenceErrors.CONNECTION_ERROR;
export const CONFERENCE_RESTARTED = JitsiConferenceErrors.CONFERENCE_RESTARTED;
export const NOT_ALLOWED_ERROR = JitsiConferenceErrors.NOT_ALLOWED_ERROR;
export const MEMBERS_ONLY_ERROR = JitsiConferenceErrors.MEMBERS_ONLY_ERROR;
export const CONFERENCE_ACCESS_DENIED = JitsiConferenceErrors.CONFERENCE_ACCESS_DENIED;
export const FOCUS_DISCONNECTED = JitsiConferenceErrors.FOCUS_DISCONNECTED;
export const FOCUS_LEFT = JitsiConferenceErrors.FOCUS_LEFT;
export const GRACEFUL_SHUTDOWN = JitsiConferenceErrors.GRACEFUL_SHUTDOWN;
export const ICE_FAILED = JitsiConferenceErrors.ICE_FAILED;
export const INCOMPATIBLE_SERVER_VERSIONS = JitsiConferenceErrors.INCOMPATIBLE_SERVER_VERSIONS;
export const OFFER_ANSWER_FAILED = JitsiConferenceErrors.OFFER_ANSWER_FAILED;
export const PASSWORD_NOT_SUPPORTED = JitsiConferenceErrors.PASSWORD_NOT_SUPPORTED;
export const PASSWORD_REQUIRED = JitsiConferenceErrors.PASSWORD_REQUIRED;
export const RESERVATION_ERROR = JitsiConferenceErrors.RESERVATION_ERROR;
export const VIDEOBRIDGE_NOT_AVAILABLE = JitsiConferenceErrors.VIDEOBRIDGE_NOT_AVAILABLE;
