import {
    CONNECTION_DISCONNECTED,
    CONNECTION_ESTABLISHED,
    CONNECTION_FAILED
} from './JitsiConnectionEvents';
import XMPP from './modules/xmpp/xmpp';

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

/* eslint-disable no-invalid-this */

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
export default function authenticateAndUpgradeRole({
    // 1. Log the specified XMPP user in.
    id,
    password,
    onCreateResource,

    // 2. Let the API client/consumer know as soon as the XMPP user has been
    //    successfully logged in.
    onLoginSuccessful,

    // 3. Join the MUC.
    roomPassword
}) {
    let canceled = false;
    let rejectPromise;
    let xmpp = new XMPP(this.connection.options);

    const process = new Promise((resolve, reject) => {
        // The process is represented by a Thenable with a cancel method. The
        // Thenable is implemented using Promise and the cancel using the
        // Promise's reject function.
        rejectPromise = reject;


        xmpp.addListener(
            CONNECTION_DISCONNECTED,
            () => {
                xmpp = undefined;
            });
        xmpp.addListener(
            CONNECTION_ESTABLISHED,
            () => {
                if (canceled) {
                    return;
                }

                // Let the caller know that the XMPP login was successful.
                onLoginSuccessful && onLoginSuccessful();

                // Now authenticate with Jicofo and get a new session ID.
                const room = xmpp.createRoom(
                    this.options.name,
                    this.options.config,
                    onCreateResource
                );

                room.moderator.authenticate()
                    .then(() => {
                        xmpp && xmpp.disconnect();

                        if (canceled) {
                            return;
                        }

                        // At this point we should have the new session ID
                        // stored in the settings. Jicofo will allow to join the
                        // room.
                        this.join(roomPassword);

                        resolve();
                    })
                    .catch(({ error, message }) => {
                        xmpp.disconnect();

                        reject({
                            authenticationError: error,
                            message
                        });
                    });
            });
        xmpp.addListener(
            CONNECTION_FAILED,
            (connectionError, message, credentials) => {
                reject({
                    connectionError,
                    credentials,
                    message
                });
                xmpp = undefined;
            });

        canceled || xmpp.connect(id, password);
    });

    /**
     * Cancels the process, if it's in progress, of authenticating and upgrading
     * the role of the local participant/user.
     *
     * @public
     * @returns {void}
     */
    process.cancel = () => {
        canceled = true;
        rejectPromise({});
        xmpp && xmpp.disconnect();
    };

    return process;
}

/* eslint-enable no-invalid-this */
