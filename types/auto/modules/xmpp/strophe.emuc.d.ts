declare const MucConnectionPlugin_base: {
    new (...args: any[]): {
        connection: any;
        init(connection: any): void;
    };
};
/**
 * MUC connection plugin.
 */
export default class MucConnectionPlugin extends MucConnectionPlugin_base {
    /**
     *
     * @param xmpp
     */
    constructor(xmpp: any);
    xmpp: any;
    rooms: {};
    /**
     *
     * @param jid
     * @param password
     * @param options
     */
    createRoom(jid: any, password: any, options: any): any;
    /**
     *  Check if a room with the passed JID is already created.
     *
     * @param {string} roomJid - The JID of the room.
     * @returns {boolean}
     */
    isRoomCreated(roomJid: string): boolean;
    /**
     *
     * @param jid
     */
    doLeave(jid: any): void;
    /**
     *
     * @param pres
     */
    onPresence(pres: any): boolean;
    /**
     *
     * @param pres
     */
    onPresenceUnavailable(pres: any): boolean;
    /**
     *
     * @param pres
     */
    onPresenceError(pres: any): boolean;
    /**
     *
     * @param msg
     */
    onMessage(msg: any): boolean;
    /**
     * TODO: Document
     * @param iq
     */
    onMute(iq: any): boolean;
    /**
     * TODO: Document
     * @param iq
     */
    onMuteVideo(iq: any): boolean;
}
export {};
