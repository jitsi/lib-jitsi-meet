/**
 * The Lobby room implementation. Setting a room to members only, joining the lobby room
 * approving or denying access to participants from the lobby room.
 */
export default class Lobby {
    /**
     * Constructs lobby room.
     *
     * @param {ChatRoom} room the main room.
     */
    constructor(room: any);
    xmpp: any;
    mainRoom: any;
    lobbyRoomJid: any;
    /**
     * Whether lobby is supported on backend.
     *
     * @returns {boolean} whether lobby is supported on backend.
     */
    isSupported(): boolean;
    /**
     * Enables lobby by setting the main room to be members only and joins the lobby chat room.
     *
     * @returns {Promise}
     */
    enable(): Promise<any>;
    /**
     * Disable lobby by setting the main room to be non members only and levaes the lobby chat room if joined.
     *
     * @returns {void}
     */
    disable(): void;
    /**
     * Broadcast a message to all participants in the lobby room
     * @param {Object} message The message to send
     *
     * @returns {void}
     */
    sendMessage(message: any): void;
    /**
     * Sends a private message to a participant in a lobby room.
     * @param {string} id The message to send
     * @param {Object} message The message to send
     *
     * @returns {void}
     */
    sendPrivateMessage(id: string, message: any): void;
    /**
     * Gets the local id for a participant in a lobby room.
     * This is used for lobby room private chat messages.
     *
     * @returns {string}
     */
    getLocalId(): string;
    /**
     * Adds a message listener to the lobby room.
     * @param {Function} listener The listener function,
     * called when a new message is received in the lobby room.
     *
     * @returns {Function} Handler returned to be able to remove it later.
     */
    addMessageListener(listener: Function): Function;
    /**
     * Remove a message handler from the lobby room.
     * @param {Function} handler The handler function to remove.
     *
     * @returns {void}
     */
    removeMessageHandler(handler: Function): void;
    /**
     * Leaves the lobby room.
     *
     * @returns {Promise}
     */
    leave(): Promise<any>;
    lobbyRoom: any;
    /**
     * We had received a jid for the lobby room.
     *
     * @param jid the lobby room jid to join.
     */
    setLobbyRoomJid(jid: any): void;
    /**
     * Checks the state of mainRoom, lobbyRoom and current user role to decide whether to join lobby room.
     * @private
     */
    private _maybeJoinLobbyRoom;
    /**
     * Joins a lobby room setting display name and eventually avatar(using the email provided).
     *
     * @param {string} username is required.
     * @param {string} email is optional.
     * @returns {Promise} resolves once we join the room.
     */
    join(displayName: any, email: string): Promise<any>;
    /**
     * Should be possible only for moderators.
     * @param id
     */
    denyAccess(id: any): void;
    /**
     * Should be possible only for moderators.
     * @param id
     */
    approveAccess(id: any): void;
}
