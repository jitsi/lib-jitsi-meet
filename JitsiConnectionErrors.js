/**
 * The errors for the connection.
 */

/**
 * Indicates that the connection was dropped with an error which was most likely
 * caused by some networking issues. The dropped term in this context means that
 * the connection was closed unexpectedly (not on user's request).
 *
 * One example is 'item-not-found' error thrown by Prosody when the BOSH session
 * times out after 60 seconds of inactivity. On the other hand 'item-not-found'
 * could also happen when BOSH request is sent to the server with the session-id
 * that is not know to the server. But this should not happen in lib-jitsi-meet
 * case as long as the service is configured correctly (there is no bug).
 */
export const CONNECTION_DROPPED_ERROR = 'connection.droppedError';

/**
 * Not specified errors.
 */
export const OTHER_ERROR = 'connection.otherError';

/**
 * Indicates that a password is required in order to join the conference.
 */
export const PASSWORD_REQUIRED = 'connection.passwordRequired';

/**
 * Indicates that the connection was dropped, because of too many 5xx HTTP
 * errors on BOSH requests.
 */
export const SERVER_ERROR = 'connection.serverError';
