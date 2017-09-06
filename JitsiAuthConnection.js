import * as JitsiConnectionEvents from './JitsiConnectionEvents';
import XMPP from './modules/xmpp/xmpp';

/**
 * Class creates separate XMPP connection and tries to connect using given
 * credentials. Once connected will contact Jicofo to obtain and store session
 * ID which is then used by the parent conference to upgrade user's role to
 * moderator. It's also used to join the conference when starting from anonymous
 * domain and only authenticated users are allowed to create new rooms.
 */
export default class JitsiAuthConnection {
    /**
     * Creates new <tt>JitsiAuthConnection</tt> for given conference.
     * @param {JitsiConference} conference
     * @constructor
     */
    constructor(conference) {
        this.conference = conference;
        this.xmpp = new XMPP(conference.connection.options);
        this.canceled = false;
        this._promise = null;
    }

    /**
     * @typedef {Object} UpgradeRoleError
     * @property {JitsiConnectionErrors} [connectionError] - One of
     * {@link JitsiConnectionErrors} which occurred when trying to connect to
     * the XMPP server.
     * @property {String} [authenticationError] - One of XMPP error conditions
     * returned by Jicofo on authentication attempt. See
     * https://xmpp.org/rfcs/rfc3920.html#streams-error.
     * @property {String} [message] - More details about the error.
     *
     * NOTE If neither one of the errors is present it means that the operation
     * has been canceled.
     */
    /**
     * Connects to the XMPP server using given credentials and contacts Jicofo
     * in order to obtain a session ID (which is then stored in the local
     * storage). User's role of the parent conference will be upgraded to
     * moderator (by Jicofo).
     *
     * @param {Object} options
     * @param {string} options.id - XMPP user's ID (user@xmpp-server.com).
     * @param {string} options.password - User's password used to login.
     * @param {string} [options.roomPassword] - Room password required to join
     * the MUC room.
     * @param {Function} [options.onLoginSuccessful] - Callback called when
     * logging into the XMPP server was successful. The next step will be to
     * obtain new session ID from Jicofo and join the MUC using it which will
     * effectively upgrade the current user's role to moderator.
     *
     * @returns {Promise} Resolved in case the authentication was successful
     * and the session Id has been stored in the settings. Will be rejected with
     * {@link UpgradeRoleError} which will have either 'connectionError'
     * or 'authenticationError' field set depending on which of the steps has
     * failed. If {@link cancel} is called before the operation is finished then
     * the promise will be resolved with an empty object (no error set).
     */
    authenticateAndUpgradeRole({ id,
                                 password,
                                 roomPassword,
                                 onLoginSuccessful }) {
        if (this._promise) {
            return this._promise;
        }
        this._promise = new Promise((resolve, reject) => {
            const connectionEstablished = () => {
                if (this.canceled) {
                    return;
                }

                // Let the caller know that the XMPP login was successful
                onLoginSuccessful && onLoginSuccessful();

                // Now authenticate with Jicofo and get new session ID
                this.room
                    = this.xmpp.createRoom(
                        this.conference.options.name,
                        this.conference.options.config);
                this.room.moderator.authenticate()
                    .then(() => {
                        if (this.canceled) {
                            return;
                        }

                        this.xmpp.disconnect();

                        // At this point we should have new session ID stored in
                        // the settings. Jicofo will allow to join the room.
                        this.conference.join(roomPassword);

                        resolve();
                    })
                    .catch(error => {
                        this.xmpp.disconnect();

                        reject({
                            authenticationError: error.error,
                            message: error.message
                        });
                    });
            };

            this.xmpp.addListener(
                JitsiConnectionEvents.CONNECTION_ESTABLISHED,
                connectionEstablished);
            this.xmpp.addListener(
                JitsiConnectionEvents.CONNECTION_FAILED,
                (error, msg) => reject({
                    connectionError: error,
                    message: msg
                }));
            this.xmpp.addListener(
                JitsiConnectionEvents.CONNECTION_DISCONNECTED,
                () => {
                    if (this.canceled) {
                        reject({ });
                    }
                });

            if (this.canceled) {
                reject({ });
            } else {
                this.xmpp.connect(id, password);
            }
        });

        return this._promise;
    }

    /**
     * Cancels the authentication if it's currently in progress. The promise
     * returned by {@link authenticateAndUpgradeRole} will be rejected with
     * an empty object (none of the error fields set).
     */
    cancel() {
        this.canceled = true;
        this.xmpp.disconnect();
    }
}
