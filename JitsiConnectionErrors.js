/**
 * The errors for the connection.
 */

/**
 * Indicates that a connection error occurred when trying to join a conference.
 */
export const CONNECTION_ERROR = "connection.connectionError";
/**
 * Not specified errors.
 */
export const OTHER_ERROR = "connection.otherError";
/**
 * Indicates that a password is required in order to join the conference.
 */
export const PASSWORD_REQUIRED = "connection.passwordRequired";
/**
 * Indicates that the connection was dropped, because of too many 5xx HTTP
 * errors on BOSH requests.
 */
export const SERVER_ERROR = "connection.serverError";
