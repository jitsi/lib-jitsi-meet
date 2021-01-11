import { getLogger } from 'jitsi-meet-logger';
import { $msg, Strophe } from 'strophe.js';

import XMPPEvents from '../../service/xmpp/XMPPEvents';

const logger = getLogger(__filename);

/**
 * The command type for updating a lobby participant's e-mail address.
 *
 * @type {string}
 */
const EMAIL_COMMAND = 'email';

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
    constructor(room) {
        this.xmpp = room.xmpp;
        this.mainRoom = room;

        const maybeJoinLobbyRoom = this._maybeJoinLobbyRoom.bind(this);

        this.mainRoom.addEventListener(
            XMPPEvents.LOCAL_ROLE_CHANGED,
            maybeJoinLobbyRoom);

        this.mainRoom.addEventListener(
            XMPPEvents.MUC_MEMBERS_ONLY_CHANGED,
            maybeJoinLobbyRoom);

        this.mainRoom.addEventListener(
            XMPPEvents.ROOM_CONNECT_MEMBERS_ONLY_ERROR,
            jid => {
                this.lobbyRoomJid = jid;
            });
    }

    /**
     * Whether lobby is supported on backend.
     *
     * @returns {boolean} whether lobby is supported on backend.
     */
    isSupported() {
        return this.xmpp.lobbySupported;
    }

    /**
     * Enables lobby by setting the main room to be members only and joins the lobby chat room.
     *
     * @returns {Promise}
     */
    enable() {
        if (!this.isSupported()) {
            return Promise.reject(new Error('Lobby not supported!'));
        }

        return new Promise((resolve, reject) => {
            this.mainRoom.setMembersOnly(true, resolve, reject);
        });
    }

    /**
     * Disable lobby by setting the main room to be non members only and levaes the lobby chat room if joined.
     *
     * @returns {void}
     */
    disable() {
        if (!this.isSupported() || !this.mainRoom.isModerator()
                || !this.lobbyRoom || !this.mainRoom.membersOnlyEnabled) {
            return;
        }

        this.mainRoom.setMembersOnly(false);
    }

    /**
     * Leaves the lobby room.
     * @private
     */
    _leaveLobbyRoom() {
        if (this.lobbyRoom) {
            this.lobbyRoom.leave()
                .then(() => {
                    this.lobbyRoom = undefined;
                    logger.info('Lobby room left!');
                })
                .catch(() => {}); // eslint-disable-line no-empty-function
        }
    }

    /**
     * We had received a jid for the lobby room.
     *
     * @param jid the lobby room jid to join.
     */
    setLobbyRoomJid(jid) {
        this.lobbyRoomJid = jid;
    }

    /**
     * Checks the state of mainRoom, lobbyRoom and current user role to decide whether to join lobby room.
     * @private
     */
    _maybeJoinLobbyRoom() {
        if (!this.isSupported()) {
            return;
        }

        const isModerator = this.mainRoom.joined && this.mainRoom.isModerator();

        if (isModerator && this.mainRoom.membersOnlyEnabled && !this.lobbyRoom) {
            // join the lobby
            this.join()
                .then(() => logger.info('Joined lobby room'))
                .catch(e => logger.error('Failed joining lobby', e));
        }
    }

    /**
     * Joins a lobby room setting display name and eventually avatar(using the email provided).
     *
     * @param {string} username is required.
     * @param {string} email is optional.
     * @returns {Promise} resolves once we join the room.
     */
    join(displayName, email) {
        const isModerator = this.mainRoom.joined && this.mainRoom.isModerator();

        if (!this.lobbyRoomJid) {
            return Promise.reject(new Error('Missing lobbyRoomJid, cannot join lobby room.'));
        }

        const roomName = Strophe.getNodeFromJid(this.lobbyRoomJid);
        const customDomain = Strophe.getDomainFromJid(this.lobbyRoomJid);

        this.lobbyRoom = this.xmpp.createRoom(
            roomName, {
                customDomain,
                disableDiscoInfo: true,
                disableFocus: true,
                enableLobby: false
            }
        );

        if (displayName) {
            // remove previously set nickname
            this.lobbyRoom.removeFromPresence('nick');
            this.lobbyRoom.addToPresence('nick', {
                attributes: { xmlns: 'http://jabber.org/protocol/nick' },
                value: displayName
            });
        }

        if (isModerator) {
            this.lobbyRoom.addPresenceListener(EMAIL_COMMAND, (node, from) => {
                this.mainRoom.eventEmitter.emit(XMPPEvents.MUC_LOBBY_MEMBER_UPDATED, from, { email: node.value });
            });
            this.lobbyRoom.addEventListener(
                XMPPEvents.MUC_MEMBER_JOINED,
                // eslint-disable-next-line max-params
                (from, nick, role, isHiddenDomain, statsID, status, identity, botType, jid) => {
                    // we need to ignore joins on lobby for participants that are already in the main room
                    if (Object.values(this.mainRoom.members).find(m => m.jid === jid)) {
                        return;
                    }

                    // we emit the new event on the main room so we can propagate
                    // events to the conference
                    this.mainRoom.eventEmitter.emit(
                        XMPPEvents.MUC_LOBBY_MEMBER_JOINED,
                        Strophe.getResourceFromJid(from),
                        nick,
                        identity ? identity.avatar : undefined
                    );
                });
            this.lobbyRoom.addEventListener(
                XMPPEvents.MUC_MEMBER_LEFT, from => {
                    // we emit the new event on the main room so we can propagate
                    // events to the conference
                    this.mainRoom.eventEmitter.emit(
                        XMPPEvents.MUC_LOBBY_MEMBER_LEFT,
                        Strophe.getResourceFromJid(from)
                    );
                });
            this.lobbyRoom.addEventListener(
                XMPPEvents.MUC_DESTROYED,
                () => {
                    // let's make sure we emit that all lobby users had left
                    Object.keys(this.lobbyRoom.members)
                        .forEach(j => this.mainRoom.eventEmitter.emit(
                            XMPPEvents.MUC_LOBBY_MEMBER_LEFT, Strophe.getResourceFromJid(j)));

                    this.lobbyRoom.clean();

                    this.lobbyRoom = undefined;
                    logger.info('Lobby room left(destroyed)!');
                });
        } else {
            // this should only be handled by those waiting in lobby
            this.lobbyRoom.addEventListener(XMPPEvents.KICKED, isSelfPresence => {
                if (isSelfPresence) {
                    this.mainRoom.eventEmitter.emit(XMPPEvents.MUC_DENIED_ACCESS);

                    this.lobbyRoom.clean();

                    return;
                }
            });

            // As there is still reference of the main room
            // the invite will be detected and addressed to its eventEmitter, even though we are not in it
            // the invite message should be received directly to the xmpp conn in general
            this.mainRoom.addEventListener(
                XMPPEvents.INVITE_MESSAGE_RECEIVED,
                (roomJid, from, txt, invitePassword) => {
                    logger.debug(`Received approval to join ${roomJid} ${from} ${txt}`);
                    if (roomJid === this.mainRoom.roomjid) {
                        // we are now allowed let's join and leave lobby
                        this.mainRoom.join(invitePassword);

                        this._leaveLobbyRoom();
                    }
                });
            this.lobbyRoom.addEventListener(
                XMPPEvents.MUC_DESTROYED,
                (reason, jid) => {
                    // we are receiving the jid of the main room
                    // means we are invited to join, maybe lobby was disabled
                    if (jid) {
                        this.mainRoom.join();

                        return;
                    }

                    this.lobbyRoom.clean();

                    this.mainRoom.eventEmitter.emit(XMPPEvents.MUC_DESTROYED, reason);
                });

            // If participant retries joining shared password while waiting in the lobby
            // and succeeds make sure we leave lobby
            this.mainRoom.addEventListener(
                XMPPEvents.MUC_JOINED,
                () => {
                    this._leaveLobbyRoom();
                });
        }

        return new Promise((resolve, reject) => {
            this.lobbyRoom.addEventListener(XMPPEvents.MUC_JOINED, () => {
                resolve();

                // send our email, as we do not handle this on initial presence we need a second one
                if (email && !isModerator) {
                    this.lobbyRoom.removeFromPresence(EMAIL_COMMAND);
                    this.lobbyRoom.addToPresence(EMAIL_COMMAND, { value: email });
                    this.lobbyRoom.sendPresence();
                }
            });
            this.lobbyRoom.addEventListener(XMPPEvents.ROOM_JOIN_ERROR, reject);
            this.lobbyRoom.addEventListener(XMPPEvents.ROOM_CONNECT_NOT_ALLOWED_ERROR, reject);
            this.lobbyRoom.addEventListener(XMPPEvents.ROOM_CONNECT_ERROR, reject);

            this.lobbyRoom.join();
        });

    }

    /**
     * Should be possible only for moderators.
     * @param id
     */
    denyAccess(id) {
        if (!this.isSupported() || !this.mainRoom.isModerator()) {
            return;
        }

        const jid = Object.keys(this.lobbyRoom.members)
            .find(j => Strophe.getResourceFromJid(j) === id);

        if (jid) {
            this.lobbyRoom.kick(jid);
        } else {
            logger.error(`Not found member for ${id} in lobby room.`);
        }
    }

    /**
     * Should be possible only for moderators.
     * @param id
     */
    approveAccess(id) {
        if (!this.isSupported() || !this.mainRoom.isModerator()) {
            return;
        }

        const memberRoomJid = Object.keys(this.lobbyRoom.members)
            .find(j => Strophe.getResourceFromJid(j) === id);

        if (memberRoomJid) {
            const jid = this.lobbyRoom.members[memberRoomJid].jid;
            const msgToSend
                = $msg({ to: this.mainRoom.roomjid })
                    .c('x', { xmlns: 'http://jabber.org/protocol/muc#user' })
                    .c('invite', { to: jid });

            this.xmpp.connection.sendIQ(msgToSend,
                () => { }, // eslint-disable-line no-empty-function
                e => {
                    logger.error(`Error sending invite for ${jid}`, e);
                });
        } else {
            logger.error(`Not found member for ${memberRoomJid} in lobby room.`);
        }
    }
}
