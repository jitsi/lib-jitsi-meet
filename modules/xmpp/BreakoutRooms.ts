import { getLogger } from '@jitsi/logger';
import { $msg, Strophe } from 'strophe.js';

import { XMPPEvents } from '../../service/xmpp/XMPPEvents';

const FEATURE_KEY = 'features/breakout-rooms';
const BREAKOUT_ROOM_ACTIONS = {
    ADD: `${FEATURE_KEY}/add`,
    MOVE_TO_ROOM: `${FEATURE_KEY}/move-to-room`,
    REMOVE: `${FEATURE_KEY}/remove`,
    RENAME: `${FEATURE_KEY}/rename`
};
const BREAKOUT_ROOM_EVENTS = {
    MOVE_TO_ROOM: `${FEATURE_KEY}/move-to-room`,
    UPDATE: `${FEATURE_KEY}/update`
};

const logger = getLogger('modules/xmpp/BreakoutRooms');

export interface IBreakoutRoomMessage {
    [key: string]: any;
    type: string;
}

export interface IBreakoutRoom {
    [key: string]: any;
    participants?: Record<string, any>;
}

export interface IBreakoutRoomsUpdatePayload {
    [key: string]: any;
    event: string;
    rooms: Record<string, IBreakoutRoom>;
}

export interface IBreakoutRoomsMoveToRoomPayload {
    event: string;
    roomJid: string;
}

/**
 * Helper class for handling breakout rooms.
 */
export default class BreakoutRooms {
    private room: any;
    private _rooms: Record<string, IBreakoutRoom>;
    private _isBreakoutRoom?: boolean;
    private _mainRoomJid?: string;

    /**
     * Constructs breakout room.
     *
     * @param {ChatRoom} room the room we are in.
     */
    constructor(room: any) {
        this.room = room;

        this._handleMessages = this._handleMessages.bind(this);
        this.room.xmpp.addListener(XMPPEvents.BREAKOUT_ROOMS_EVENT, this._handleMessages);

        this._rooms = {};
    }

    /**
     * Stops listening for events.
     */
    dispose(): void {
        this.room.xmpp.removeListener(XMPPEvents.BREAKOUT_ROOMS_EVENT, this._handleMessages);
    }

    /**
     * Creates a breakout room with the given subject.
     *
     * @param {string} subject - A subject for the breakout room.
     */
    createBreakoutRoom(subject: string): void {
        if (!this.isSupported() || !this.room.isModerator()) {
            logger.error(`Cannot create breakout room - supported:${this.isSupported()},
                moderator:${this.room.isModerator()}`);

            return;
        }

        const message: IBreakoutRoomMessage = {
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
    removeBreakoutRoom(breakoutRoomJid: string): void {
        if (!this.isSupported() || !this.room.isModerator()) {
            logger.error(`Cannot remove breakout room - supported:${this.isSupported()},
                moderator:${this.room.isModerator()}`);

            return;
        }

        const message: IBreakoutRoomMessage = {
            type: BREAKOUT_ROOM_ACTIONS.REMOVE,
            breakoutRoomJid
        };

        this._sendMessage(message);
    }

    /**
     * Changes the subject of a breakout room.
     *
     * @param {string} breakoutRoomJid - JID of the room to be removed.
     * @param {string} subject - A new subject for the breakout room.
     */
    renameBreakoutRoom(breakoutRoomJid: string, subject: string): void {
        if (!this.isSupported() || !this.room.isModerator()) {
            logger.error(`Cannot rename breakout room - supported:${this.isSupported()},
                moderator:${this.room.isModerator()}`);

            return;
        }

        const message: IBreakoutRoomMessage = {
            type: BREAKOUT_ROOM_ACTIONS.RENAME,
            breakoutRoomJid,
            subject
        };

        this._sendMessage(message);
    }

    /**
     * Sends the given participant to the given room.
     *
     * @param {string} participantJid - JID of the participant to be sent to a room.
     * @param {string} roomJid - JID of the target room.
     */
    sendParticipantToRoom(participantJid: string, roomJid: string): void {
        if (!this.isSupported() || !this.room.isModerator()) {
            logger.error(`Cannot send participant to room - supported:${this.isSupported()},
                moderator:${this.room.isModerator()}`);

            return;
        }

        const message: IBreakoutRoomMessage = {
            type: BREAKOUT_ROOM_ACTIONS.MOVE_TO_ROOM,
            participantJid,
            roomJid
        };

        this._sendMessage(message);
    }

    /**
     * Retrieves whether a breakout room feature is supported.
     *
     * @param {string} feature - Feature to check.
     * @returns Wether the feature is supported.
     */
    isFeatureSupported(feature: string): boolean {
        return Boolean(this.room.xmpp.breakoutRoomsFeatures?.[feature]);
    }

    /**
     * Whether Breakout Rooms support is enabled in the backend or not.
     */
    isSupported(): boolean {
        return Boolean(this.getComponentAddress());
    }

    /**
     * Gets the address of the Breakout Rooms XMPP component.
     *
     * @returns The address of the component.
     */
    getComponentAddress(): string | undefined {
        return this.room.xmpp.breakoutRoomsComponentAddress;
    }

    /**
     * Stores if the current room is a breakout room.
     *
     * @param {boolean} isBreakoutRoom - Whether this room is a breakout room.
     */
    _setIsBreakoutRoom(isBreakoutRoom: boolean): void {
        this._isBreakoutRoom = isBreakoutRoom;
    }

    /**
     * Checks whether this room is a breakout room.
     *
     * @returns True if the room is a breakout room, false otherwise.
     */
    isBreakoutRoom(): boolean {
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
    _setMainRoomJid(jid: string): void {
        this._mainRoomJid = jid;
    }

    /**
     * Gets the main room's JID associated with this breakout room.
     *
     * @returns The main room JID.
     */
    getMainRoomJid(): string | undefined {
        return this._mainRoomJid;
    }

    /**
     * Handles a message for managing breakout rooms.
     *
     * @param {object} payload - Arbitrary data.
     */
    _handleMessages(payload: IBreakoutRoomsMoveToRoomPayload | IBreakoutRoomsUpdatePayload): void {
        switch (payload.event) {
        case BREAKOUT_ROOM_EVENTS.MOVE_TO_ROOM:
            this.room.eventEmitter.emit(
                XMPPEvents.BREAKOUT_ROOMS_MOVE_TO_ROOM,
                (payload as IBreakoutRoomsMoveToRoomPayload).roomJid
            );
            break;
        case BREAKOUT_ROOM_EVENTS.UPDATE: {
            const filteredPayload = this._filterUpdatePayload(payload as IBreakoutRoomsUpdatePayload);

            this._rooms = filteredPayload.rooms;
            this.room.eventEmitter.emit(XMPPEvents.BREAKOUT_ROOMS_UPDATED, filteredPayload);
            break;
        }
        }
    }

    /**
     * Filters the hidden participants from the payload.
     *
     * @param {Object} payload - The payload of the update message.
     * @return {Object} - The filtered payload.
     */
    _filterUpdatePayload(payload: IBreakoutRoomsUpdatePayload): IBreakoutRoomsUpdatePayload {
        const hiddenDomain = this.room.options.hiddenDomain;
        const { rooms } = payload;
        const filteredRooms: Record<string, IBreakoutRoom> = {};

        Object.entries(rooms).forEach(([ key, room ]) => {
            const { participants = {} } = room;
            const filteredParticipants: Record<string, any> = {};

            Object.entries(participants).forEach(([ k, participant ]) => {
                if (Strophe.getDomainFromJid(participant.jid) !== hiddenDomain) {
                    filteredParticipants[k] = participant;
                }
            });

            filteredRooms[key] = {
                ...room,
                participants: filteredParticipants
            };
        });

        return {
            ...payload,
            rooms: filteredRooms
        };
    }

    /**
     * Helper to send a breakout rooms message to the component.
     *
     * @param {Object} message - Command that needs to be sent.
     */
    _sendMessage(message: IBreakoutRoomMessage): void {
        const componentAddress = this.getComponentAddress();

        if (!componentAddress) {
            return;
        }

        const msg = $msg({ to: componentAddress });

        msg.c('breakout_rooms', message).up();

        this.room.xmpp.connection.send(msg);
    }
}
