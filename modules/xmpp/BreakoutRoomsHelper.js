/**
 * Helper class for handling breakout rooms.
 *
 * TODO: consider moving most of the application logic here?
 */
export default class BreakoutRoomsHelper {

    /**
     * Constructs lobby room.
     *
     * @param {ChatRoom} room the room we are in.
     */
    constructor(room) {
        this.xmpp = room.xmpp;
    }

    /**
     * Whether Breakout Rooms support is enabled in the backend or not.
     */
    isSupported() {
        return Boolean(this.xmpp.breakoutRoomsComponentAddress);
    }

    /**
     * Gets the address of the Breakout Rooms XMPP component.
     *
     * @returns The address of the component.
     */
    getComponentAddress() {
        return this.xmpp.breakoutRoomsComponentAddress;
    }

    /**
     * Stores if the current room is a breakout room.
     *
     * @param {boolean} isBreakoutRoom - Whether this room is a breakout room.
     */
    setIsBreakoutRoom(isBreakoutRoom) {
        this.isBreakoutRoom = isBreakoutRoom;
    }

    /**
     * Checks whether this room is a breakout room.
     *
     * @returns True if the room is a breakout room, false otherwise.
     */
    isBreakoutRoom() {
        return this.isBreakoutRoom;
    }

    /**
     * Sets the main room JID associated with this breakout room. Only applies when
     * in a breakout room.
     *
     * @param {string} jid - The main room JID.
     */
    setMainRoomJid(jid) {
        this.mainRoomJid = jid;
    }

    /**
     * Gets the main room's JID associated with this breakout room.
     *
     * @returns The main room JID.
     */
    getMainRoomJid() {
        return this.mainRoomJid;
    }
}
