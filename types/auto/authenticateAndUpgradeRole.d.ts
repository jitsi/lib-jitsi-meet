/**
 * @typedef {Object} UpgradeRoleError
 *
 * @property {JitsiConnectionErrors} [connectionError] - One of
 * {@link JitsiConnectionErrors} which occurred when trying to connect to the
 * XMPP server.
 * @property {String} [authenticationError] - One of XMPP error conditions
 * returned by Jicofo on authentication attempt. See
 * {@link https://xmpp.org/rfcs/rfc3920.html#streams-error}.
 * @property {String} [message] - More details about the error.
 * @property {Object} [credentials] - The credentials that failed the
 * authentication.
 * @property {String} [credentials.jid] - The XMPP ID part of the credentials
 * that failed the authentication.
 * @property {string} [credentials.password] - The password part of the
 * credentials that failed the authentication.
 *
 * NOTE If neither one of the errors is present, then the operation has been
 * canceled.
 */
/**
 * Connects to the XMPP server using the specified credentials and contacts
 * Jicofo in order to obtain a session ID (which is then stored in the local
 * storage). The user's role of the parent conference will be upgraded to
 * moderator (by Jicofo). It's also used to join the conference when starting
 * from anonymous domain and only authenticated users are allowed to create new
 * rooms.
 *
 * @param {Object} options
 * @param {string} options.id - XMPP user's ID to log in. For example,
 * user@xmpp-server.com.
 * @param {string} options.password - XMPP user's password to log in with.
 * @param {string} [options.roomPassword] - The password to join the MUC with.
 * @param {Function} [options.onLoginSuccessful] - Callback called when logging
 * into the XMPP server was successful. The next step will be to obtain a new
 * session ID from Jicofo and join the MUC using it which will effectively
 * upgrade the user's role to moderator.
 * @returns {Object} A <tt>thenable</tt> which (1) settles when the process of
 * authenticating and upgrading the role of the specified XMPP user finishes and
 * (2) has a <tt>cancel</tt> method that allows the caller to interrupt the
 * process. If the process finishes successfully, the session ID has been stored
 * in the settings and the <tt>thenable</tt> is resolved. If the process
 * finishes with failure, the <tt>thenable</tt> is rejected with reason of type
 * {@link UpgradeRoleError} which will have either <tt>connectionError</tt> or
 * <tt>authenticationError</tt> property set depending on which of the steps has
 * failed. If <tt>cancel</tt> is called before the process finishes, then the
 * thenable will be rejected with an empty object (i.e. no error property will
 * be set on the rejection reason).
 */
export default function authenticateAndUpgradeRole({ id, password, onCreateResource, onLoginSuccessful, roomPassword }: {
    id: string;
    password: string;
    roomPassword?: string;
    onLoginSuccessful?: Function;
}): any;
export type UpgradeRoleError = {
    /**
     * - One of
     * {@link JitsiConnectionErrors } which occurred when trying to connect to the
     * XMPP server.
     */
    connectionError?: any;
    /**
     * - One of XMPP error conditions
     * returned by Jicofo on authentication attempt. See
     * {@link https ://xmpp.org/rfcs/rfc3920.html#streams-error}.
     */
    authenticationError?: string;
    /**
     * - More details about the error.
     */
    message?: string;
    /**
     * - The credentials that failed the
     * authentication.
     */
    credentials?: {
        jid?: string;
        password?: string;
    };
};
