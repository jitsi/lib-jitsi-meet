declare const JingleConnectionPlugin_base: {
    new (...args: any[]): {
        connection: any;
        init(connection: any): void;
    };
};
/**
 *
 */
export default class JingleConnectionPlugin extends JingleConnectionPlugin_base {
    /**
     * Creates new <tt>JingleConnectionPlugin</tt>
     * @param {XMPP} xmpp
     * @param {EventEmitter} eventEmitter
     * @param {Object} iceConfig an object that holds the iceConfig to be passed
     * to the p2p and the jvb <tt>PeerConnection</tt>.
     */
    constructor(xmpp: any, eventEmitter: any, iceConfig: any);
    xmpp: any;
    eventEmitter: any;
    sessions: {};
    jvbIceConfig: any;
    p2pIceConfig: any;
    mediaConstraints: {
        offerToReceiveAudio: boolean;
        offerToReceiveVideo: boolean;
    };
    /**
     *
     * @param iq
     */
    onJingle(iq: any): boolean;
    /**
     * Creates new <tt>JingleSessionPC</tt> meant to be used in a direct P2P
     * connection, configured as 'initiator'.
     * @param {string} me our JID
     * @param {string} peer remote participant's JID
     * @return {JingleSessionPC}
     */
    newP2PJingleSession(me: string, peer: string): JingleSessionPC;
    /**
     *
     * @param sid
     * @param reasonCondition
     * @param reasonText
     */
    terminate(sid: any, reasonCondition: any, reasonText: any): void;
    /**
     *
     */
    getStunAndTurnCredentials(): void;
    /**
     * Parses response when querying for services using urn:xmpp:extdisco:1 or urn:xmpp:extdisco:2.
     * Stores results in jvbIceConfig and p2pIceConfig.
     * @param res The response iq.
     * @return {boolean} Whether something was processed from the supplied message.
     */
    onReceiveStunAndTurnCredentials(res: any): boolean;
    /**
     * Returns the data saved in 'updateLog' in a format to be logged.
     */
    getLog(): {};
}
import JingleSessionPC from "./JingleSessionPC";
export {};
