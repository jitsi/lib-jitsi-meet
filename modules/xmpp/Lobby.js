/* global $ */

import { $iq, $msg, Strophe } from 'strophe.js';
import { getLogger } from 'jitsi-meet-logger';
import XMPPEvents from '../../service/xmpp/XMPPEvents';

const logger = getLogger(__filename);

/**
 * The command type for updating a lobby participant's e-mail address.
 *
 * @type {string}
 */
const EMAIL_COMMAND = 'email';

/**
 * Array of affiliations that are allowed in members only room.
 * @type {string[]}
 */
const MEMBERS_AFFILIATIONS = [ 'owner', 'admin', 'member' ];

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

        const maybeEnableDisable = this._maybeEnableDisable.bind(this);

        this.mainRoom.addEventListener(
            XMPPEvents.LOCAL_ROLE_CHANGED,
            maybeEnableDisable);

        this.mainRoom.addEventListener(
            XMPPEvents.MUC_MEMBERS_ONLY_CHANGED,
            maybeEnableDisable);

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
     * @param {string} password shared password that can be used to skip lobby room.
     * @returns {Promise}
     */
    enable(password) {
        if (!this.isSupported()) {
            return Promise.reject(new Error('Lobby not supported!'));
        }

        return new Promise((resolve, reject) => {

            // first grant membership to all that are in the room
            if (Object.keys(this.mainRoom.members).length > 0) {
                const grantMembership = $iq({ to: this.mainRoom.roomjid,
                    type: 'set' })
                    .c('query', { xmlns: 'http://jabber.org/protocol/muc#admin' });

                Object.values(this.mainRoom.members).forEach(m => {
                    if (m.jid && !MEMBERS_AFFILIATIONS.includes(m.affiliation)) {
                        grantMembership.c('item', {
                            'affiliation': 'member',
                            'jid': m.jid }).up();
                    }
                });
                this.xmpp.connection.sendIQ(grantMembership.up());
            }

            this._setMembersOnly(true, password, resolve, reject);
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

        this._setMembersOnly(false, undefined, () => {
            this._leaveLobbyRoom();
        }, () => {}); // eslint-disable-line no-empty-function
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
     * Turns of or on the members only config for the main room.
     *
     * @param {boolean} enabled - Whether to turn it on or off.
     * @param {string} password - Shared password if any.
     * @param resolve
     * @param reject
     * @private
     */
    _setMembersOnly(enabled, password, resolve, reject) {
        this.xmpp.connection.sendIQ(
            $iq({
                to: this.mainRoom.roomjid,
                type: 'get'
            }).c('query', { xmlns: 'http://jabber.org/protocol/muc#owner' }),
            res => {
                if ($(res)
                    .find('>query>x[xmlns="jabber:x:data"]>field[var="muc#roomconfig_membersonly"]').length) {
                    const formToSubmit
                        = $iq({
                            to: this.mainRoom.roomjid,
                            type: 'set'
                        }).c('query', { xmlns: 'http://jabber.org/protocol/muc#owner' });

                    formToSubmit.c('x', {
                        xmlns: 'jabber:x:data',
                        type: 'submit'
                    });
                    formToSubmit
                        .c('field', { 'var': 'FORM_TYPE' })
                        .c('value')
                        .t('http://jabber.org/protocol/muc#roomconfig')
                        .up()
                        .up();
                    formToSubmit
                        .c('field', { 'var': 'muc#roomconfig_membersonly' })
                        .c('value')
                        .t(enabled ? 'true' : false)
                        .up()
                        .up();

                    if (password) {
                        formToSubmit
                            .c('field', { 'var': 'muc#roomconfig_lobbypassword' })
                            .c('value')
                            .t(password)
                            .up()
                            .up();
                    }

                    this.xmpp.connection.sendIQ(formToSubmit, resolve, e => {
                        reject(e);
                    });
                } else {
                    reject(new Error('Setting members only room not supported!'));
                }
            },
            e => {
                reject(e);
            });
    }

    /**
     * We had received a jid for the lobby room.
     *
     * @param jid the lobby room jid to join.
     */
    setLobbyRoomJid(jid) {
        if (!this.isSupported() || !this.mainRoom.isModerator()
            || this.lobbyRoom || !this.mainRoom.membersOnlyEnabled) {
            return;
        }

        this.lobbyRoomJid = jid;

        this.join()
            .then(() => {}) // eslint-disable-line no-empty-function
            .catch(e => logger.error('Failed joining lobby room', e));
    }

    /**
     * Checks the state of mainRoom, lobbyRoom and current user role to decide whether to join/leave lobby room.
     * @private
     */
    _maybeEnableDisable() {
        if (!this.isSupported()) {
            return;
        }

        const isModerator = this.mainRoom.joined && this.mainRoom.isModerator();

        if (isModerator && this.mainRoom.membersOnlyEnabled && !this.lobbyRoom) {
            // join the lobby
            this.enable()
                .then(() => logger.info('Joined lobby room'))
                .catch(e => logger.error('Failed joining lobby', e));
        } else if (isModerator && !this.mainRoom.membersOnlyEnabled && this.lobbyRoom) {
            // leave lobby room
            this._leaveLobbyRoom();
        }
    }

    /**
     * Joins a lobby room setting display name and eventually avatar(using the email provided).
     *
     * @param {string} username is required.
     * @param {string} email is optional.
     * @param {string} password is optional for non moderators and should not be passed when moderator.
     * @returns {Promise} resolves once we join the room.
     */
    join(displayName, email, password) {
        const isModerator = this.mainRoom.joined && this.mainRoom.isModerator();

        // lobby password let's try it
        if (password && !isModerator) {
            return this.mainRoom.join(undefined, { 'lobbySharedPassword': password });
        }

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
                (roomJid, from, txt) => {
                    logger.debug(`Received approval to join ${roomJid} ${from} ${txt}`);
                    if (roomJid === this.mainRoom.roomjid) {
                        // we are now allowed let's join and leave lobby
                        this.mainRoom.join();

                        this._leaveLobbyRoom();
                    }
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

        const roomJid = Object.keys(this.lobbyRoom.members)
            .find(j => Strophe.getResourceFromJid(j) === id);

        if (roomJid) {
            const jid = this.lobbyRoom.members[roomJid].jid;
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
            logger.error(`Not found member for ${roomJid} in lobby room.`);
        }
    }
}
