/**
 * Helper class for handling breakout rooms.
 */
export default class BreakoutRooms {
    /**
     * Constructs lobby room.
     *
     * @param {ChatRoom} room the room we are in.
     */
    constructor(room: any);
    room: any;
    /**
     * Handles a message for managing breakout rooms.
     *
     * @param {object} payload - Arbitrary data.
     */
    _handleMessages(payload: object): void;
    _rooms: {};
    /**
     * Stops listening for events.
     */
    dispose(): void;
    /**
     * Creates a breakout room with the given subject.
     *
     * @param {string} subject - A subject for the breakout room.
     */
    createBreakoutRoom(subject: string): void;
    /**
     * Removes a breakout room.
     *
     * @param {string} breakoutRoomJid - JID of the room to be removed.
     */
    removeBreakoutRoom(breakoutRoomJid: string): void;
    /**
     * Sends the given participant to the given room.
     *
     * @param {string} participantJid - JID of the participant to be sent to a room.
     * @param {string} roomJid - JID of the target room.
     */
    sendParticipantToRoom(participantJid: string, roomJid: string): void;
    /**
     * Whether Breakout Rooms support is enabled in the backend or not.
     */
    isSupported(): boolean;
    /**
     * Gets the address of the Breakout Rooms XMPP component.
     *
     * @returns The address of the component.
     */
    getComponentAddress(): any;
    /**
     * Stores if the current room is a breakout room.
     *
     * @param {boolean} isBreakoutRoom - Whether this room is a breakout room.
     */
    _setIsBreakoutRoom(isBreakoutRoom: boolean): void;
    _isBreakoutRoom: boolean;
    /**
     * Checks whether this room is a breakout room.
     *
     * @returns True if the room is a breakout room, false otherwise.
     */
    isBreakoutRoom(): boolean;
    /**
     * Sets the main room JID associated with this breakout room. Only applies when
     * in a breakout room.
     *
     * @param {string} jid - The main room JID.
     */
    _setMainRoomJid(jid: string): void;
    _mainRoomJid: string;
    /**
     * Gets the main room's JID associated with this breakout room.
     *
     * @returns The main room JID.
     */
    getMainRoomJid(): string;
    /**
     * Helper to send a breakout rooms message to the component.
     *
     * @param {Object} message - Command that needs to be sent.
     */
    _sendMessage(message: any): void;
}
