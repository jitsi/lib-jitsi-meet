import { getLogger } from '@jitsi/logger';
import { $msg, Strophe } from 'strophe.js';

import { XMPPEvents } from '../../service/xmpp/XMPPEvents';

const FEATURE_KEY = 'features/breakout-rooms';
const BREAKOUT_ROOM_ACTIONS = {
    ADD: `${FEATURE_KEY}/add`,
    REMOVE: `${FEATURE_KEY}/remove`,
    MOVE_TO_ROOM: `${FEATURE_KEY}/move-to-room`
};
const BREAKOUT_ROOM_EVENTS = {
    MOVE_TO_ROOM: `${FEATURE_KEY}/move-to-room`,
    UPDATE: `${FEATURE_KEY}/update`
};

const logger = getLogger(__filename);

/**
 * Helper class for handling breakout rooms.
 */
export default class BreakoutRooms {

    /**
     * Constructs lobby room.
     *
     * @param {ChatRoom} room the room we are in.
     */
    constructor(room) {
        this.room = room;

        this._handleMessages = this._handleMessages.bind(this);
        this.room.xmpp.addListener(XMPPEvents.BREAKOUT_ROOMS_EVENT, this._handleMessages);

        this._rooms = {};
    }

    /**
     * Stops listening for events.
     */
    dispose() {
        this.room.xmpp.removeListener(XMPPEvents.BREAKOUT_ROOMS_EVENT, this._handleMessages);
    }

    /**
     * Creates a breakout room with the given subject.
     *
     * @param {string} subject - A subject for the breakout room.
     */
    createBreakoutRoom(subject) {
        if (!this.isSupported() || !this.room.isModerator()) {
            logger.error(`Cannot create breakout room - supported:${this.isSupported()},
                moderator:${this.room.isModerator()}`);

            return;
        }

        const message = {
            type: BREAKOUT_ROOM_ACTIONS.ADD,
            subject
        };

        this._sendMessage(message);
    }

    /**
     * Removes a breakout room.
     *
     * @param {string} breakoutRoomJid - JID of the room to be removed.
     */
    removeBreakoutRoom(breakoutRoomJid) {
        if (!this.isSupported() || !this.room.isModerator()) {
            logger.error(`Cannot remove breakout room - supported:${this.isSupported()},
                moderator:${this.room.isModerator()}`);

            return;
        }

        const message = {
            type: BREAKOUT_ROOM_ACTIONS.REMOVE,
            breakoutRoomJid
        };

        this._sendMessage(message);
    }

    /**
     * Sends the given participant to the given room.
     *
     * @param {string} participantJid - JID of the participant to be sent to a room.
     * @param {string} roomJid - JID of the target room.
     */
    sendParticipantToRoom(participantJid, roomJid) {
        if (!this.isSupported() || !this.room.isModerator()) {
            logger.error(`Cannot send participant to room - supported:${this.isSupported()},
                moderator:${this.room.isModerator()}`);

            return;
        }

        const message = {
            type: BREAKOUT_ROOM_ACTIONS.MOVE_TO_ROOM,
            participantJid,
            roomJid
        };

        this._sendMessage(message);
    }

    /**
     * Whether Breakout Rooms support is enabled in the backend or not.
     */
    isSupported() {
        return Boolean(this.getComponentAddress());
    }

    /**
     * Gets the address of the Breakout Rooms XMPP component.
     *
     * @returns The address of the component.
     */
    getComponentAddress() {
        return this.room.xmpp.breakoutRoomsComponentAddress;
    }

    /**
     * Stores if the current room is a breakout room.
     *
     * @param {boolean} isBreakoutRoom - Whether this room is a breakout room.
     */
    _setIsBreakoutRoom(isBreakoutRoom) {
        this._isBreakoutRoom = isBreakoutRoom;
    }

    /**
     * Checks whether this room is a breakout room.
     *
     * @returns True if the room is a breakout room, false otherwise.
     */
    isBreakoutRoom() {
        if (typeof this._isBreakoutRoom !== 'undefined') {
            return this._isBreakoutRoom;
        }

        // Use heuristic, helpful for checking in the MUC_JOINED event.
        return Strophe.getDomainFromJid(this.room.myroomjid) === this.getComponentAddress();
    }

    /**
     * Sets the main room JID associated with this breakout room. Only applies when
     * in a breakout room.
     *
     * @param {string} jid - The main room JID.
     */
    _setMainRoomJid(jid) {
        this._mainRoomJid = jid;
    }

    /**
     * Gets the main room's JID associated with this breakout room.
     *
     * @returns The main room JID.
     */
    getMainRoomJid() {
        return this._mainRoomJid;
    }

    /**
     * Handles a message for managing breakout rooms.
     *
     * @param {object} payload - Arbitrary data.
     */
    _handleMessages(payload) {
        switch (payload.event) {
        case BREAKOUT_ROOM_EVENTS.MOVE_TO_ROOM:
            this.room.eventEmitter.emit(XMPPEvents.BREAKOUT_ROOMS_MOVE_TO_ROOM, payload.roomJid);
            break;
        case BREAKOUT_ROOM_EVENTS.UPDATE: {
            this._rooms = payload.rooms;
            this.room.eventEmitter.emit(XMPPEvents.BREAKOUT_ROOMS_UPDATED, payload);
            break;
        }
        }
    }

    /**
     * Helper to send a breakout rooms message to the component.
     *
     * @param {Object} message - Command that needs to be sent.
     */
    _sendMessage(message) {
        const msg = $msg({ to: this.getComponentAddress() });

        msg.c('breakout_rooms', message).up();

        this.room.xmpp.connection.send(msg);
    }
}
