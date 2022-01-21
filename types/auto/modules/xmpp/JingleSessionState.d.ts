/**
 * The pending Jingle session state which means the session as defined in
 * XEP-0166(before 'session-invite/session-accept' took place).
 *
 * @type {string}
 */
export const PENDING: string;
/**
 * The active Jingle session state as defined in XEP-0166
 * (after 'session-invite'/'session-accept').
 *
 * @type {string}
 */
export const ACTIVE: string;
/**
 * The ended Jingle session state as defined in XEP-0166
 * (after 'session-terminate').
 * @type {string}
 */
export const ENDED: string;
