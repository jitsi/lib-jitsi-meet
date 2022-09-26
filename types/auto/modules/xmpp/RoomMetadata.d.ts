/**
 * Helper class for handling room metadata.
 */
export default class RoomMetadata {
    room: any;
    _metadata: any;
    /**
     * Constructs lobby room.
     *
     * @param {ChatRoom} room the room we are in.
     */
    constructor(room: any);
    /**
     * Stops listening for events.
     */
    dispose(): void;
    /**
     * Sets metadata for the given key.
     *
     * @param {string} key - key under which the  metadata will be stored.
     * @param {object} data - data to be stored.
     */
    setMetadata(key: any, data: any): void;
    /**
     * Gets the stored metadata (all of it).
     *
     * @returns The stored metadata.
     */
    getMetadata(): any;
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
     * Handles a message with metadata updates.
     *
     * @param {object} payload - Arbitrary data.
     */
    _handleMessages(payload: any): void;
    /**
     * Helper to send a breakout rooms message to the component.
     *
     * @param {Object} message - Command that needs to be sent.
     */
    _sendMessage(message: any): void;
}
