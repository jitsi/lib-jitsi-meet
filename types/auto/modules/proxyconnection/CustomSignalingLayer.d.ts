/**
 * Custom semi-mock implementation for the Proxy connection service.
 */
export default class CustomSignalingLayer extends SignalingLayer {
    /**
     * Creates new instance.
     */
    constructor();
    /**
     * A map that stores SSRCs of remote streams.
     * @type {Map<number, string>} maps SSRC number to jid
     */
    ssrcOwners: Map<number, string>;
    /**
     *
     * @type {ChatRoom|null}
     */
    chatRoom: any | null;
    /**
     * Sets the <tt>ChatRoom</tt> instance used.
     * @param {ChatRoom} room
     */
    setChatRoom(room: any): void;
}
import SignalingLayer from "../../service/RTC/SignalingLayer";
