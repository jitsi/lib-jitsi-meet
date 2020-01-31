/**
 * The errors for the conference.
 */

/**
 * Indicates that client must be authenticated to create the conference.
 * @type {string}
 * @const
 */
export const AUTHENTICATION_REQUIRED = 'conference.authenticationRequired';

/**
 * Indicates that chat error occurred.
 * @type {string}
 * @const
 */
export const CHAT_ERROR = 'conference.chatError';

/**
 * Indicates that conference has been destroyed.
 * @type {string}
 * @const
 */
export const CONFERENCE_DESTROYED = 'conference.destroyed';

/**
 * Indicates that max users limit has been reached.
 * @type {string}
 * @const
 */
export const CONFERENCE_MAX_USERS = 'conference.max_users';

/**
 * Indicates that a connection error occurred when trying to join a conference.
 * @type {string}
 * @const
 */
export const CONNECTION_ERROR = 'conference.connectionError';

/**
 * Indicates that a connection error is due to not allowed,
 * occurred when trying to join a conference.
 * @type {string}
 * @const
 */
export const NOT_ALLOWED_ERROR = 'conference.connectionError.notAllowed';

/**
 * Indicates that focus error happened.
 * @type {string}
 * @const
 */
export const FOCUS_DISCONNECTED = 'conference.focusDisconnected';

/**
 * Indicates that focus left the conference.
 * @type {string}
 * @const
 */
export const FOCUS_LEFT = 'conference.focusLeft';

/**
 * Indicates that graceful shutdown happened.
 * @type {string}
 * @const
 */
export const GRACEFUL_SHUTDOWN = 'conference.gracefulShutdown';

/**
 * Indicates that the versions of the server side components are incompatible
 * with the client side.
 * @type {string}
 * @const
 */
export const INCOMPATIBLE_SERVER_VERSIONS
    = 'conference.incompatible_server_versions';

/**
 * Indicates that offer/answer had failed.
 * @type {string}
 * @const
 */
export const OFFER_ANSWER_FAILED = 'conference.offerAnswerFailed';

/**
 * Indicates that password cannot be set for this conference.
 * @type {string}
 * @const
 */
export const PASSWORD_NOT_SUPPORTED = 'conference.passwordNotSupported';

/**
 * Indicates that a password is required in order to join the conference.
 * @type {string}
 * @const
 */
export const PASSWORD_REQUIRED = 'conference.passwordRequired';

/**
 * Indicates that reservation system returned error.
 * @type {string}
 * @const
 */
export const RESERVATION_ERROR = 'conference.reservationError';

/**
 * Indicates that the conference setup failed.
 * @type {string}
 * @const
 */
export const SETUP_FAILED = 'conference.setup_failed';

/**
 * Indicates that there is no available videobridge.
 * @type {string}
 * @const
 */
export const VIDEOBRIDGE_NOT_AVAILABLE = 'conference.videobridgeNotAvailable';
