/**
 * JingleSession provides an API to manage a single Jingle session. We will
 * have different implementations depending on the underlying interface used
 * (i.e. WebRTC and ORTC) and here we hold the code common to all of them.
 */
export default class JingleSession extends Listenable {
    /**
     * Creates new <tt>JingleSession</tt>.
     * @param {string} sid the Jingle session identifier
     * @param {string} localJid our JID
     * @param {string} remoteJid the JID of the remote peer
     * @param {XmppConnection} connection the XMPP connection
     * @param {Object} mediaConstraints the media constraints object passed to the PeerConnection onCreateAnswer/Offer.
     * @param {Object} pcConfig The {@code RTCConfiguration} object passed to the PeerConnection's constructor.
     * @param {boolean} isInitiator indicates if it will be the side which initiates the session.
     */
    constructor(sid: string, localJid: string, remoteJid: string, connection: any, mediaConstraints: any, pcConfig: any, isInitiator: boolean);
    sid: string;
    localJid: string;
    remoteJid: string;
    connection: any;
    mediaConstraints: any;
    pcConfig: any;
    /**
     * Indicates whether this instance is an initiator or an answerer of
     * the Jingle session.
     * @type {boolean}
     */
    isInitiator: boolean;
    /**
     * Whether to use dripping or not. Dripping is sending trickle
     * candidates not one-by-one.
     */
    usedrip: boolean;
    /**
     *  When dripping is used, stores ICE candidates which are to be sent.
     */
    dripContainer: any[];
    /**
     * The chat room instance associated with the session.
     * @type {ChatRoom}
     */
    room: any;
    /**
     * The signaling layer.
     * @type {SignalingLayerImpl | null}
     * @private
     */
    private _signalingLayer;
    /**
     * Jingle session state - uninitialized until {@link initialize} is
     * called @type {JingleSessionState}
     */
    state: JingleSessionState.JingleSessionState;
    /**
     * The RTC service instance
     * @type {RTC}
     */
    rtc: any;
    /**
     * Returns XMPP address of this session's initiator.
     * @return {string}
     */
    get initiatorJid(): string;
    /**
     * Returns XMPP address of this session's responder.
     * @return {string}
     */
    get responderJid(): string;
    /**
     * Prepares this object to initiate a session.
     * @param {ChatRoom} room the chat room for the conference associated with
     * this session
     * @param {RTC} rtc the RTC service instance
     * @param {SignalingLayerImpl} signalingLayer - The signaling layer instance.
     * @param {object} options - the options, see implementing class's
     * {@link #doInitialize} description for more details.
     */
    initialize(room: any, rtc: any, signalingLayer: any, options: object): void;
    /**
     * The implementing class finishes initialization here. Called at the end of
     * {@link initialize}.
     * @param {Object} options - The options specific to the implementing class.
     * @protected
     */
    protected doInitialize(options: any): void;
    /**
     * Adds the ICE candidates found in the 'contents' array as remote
     * candidates?
     * Note: currently only used on transport-info
     *
     * @param contents
     */
    addIceCandidates(contents: any): void;
    /**
     * Returns current state of this <tt>JingleSession</tt> instance.
     * @returns {JingleSessionState} the current state of this session instance.
     */
    getState(): typeof JingleSessionState;
    /**
     * Handles an 'add-source' event.
     *
     * @param contents an array of Jingle 'content' elements.
     */
    addSources(contents: any): void;
    /**
     * Handles a 'remove-source' event.
     *
     * @param contents an array of Jingle 'content' elements.
     */
    removeSources(contents: any): void;
    /**
     * Terminates this Jingle session by sending session-terminate
     * @param success a callback called once the 'session-terminate' packet has
     * been acknowledged with RESULT.
     * @param failure a callback called when either timeout occurs or ERROR
     * response is received.
     * @param {Object} options
     * @param {string} [options.reason] XMPP Jingle error condition
     * @param {string} [options.reasonDescription] some meaningful error message
     * @param {boolean} [options.requestRestart=false] set to true to ask Jicofo to start a new session one this once is
     * terminated.
     * @param {boolean} [options.sendSessionTerminate=true] set to false to skip
     * sending session-terminate. It may not make sense to send it if the XMPP
     * connection has been closed already or if the remote peer has disconnected
     */
    terminate(success: any, failure: any, options: {
        reason?: string;
        reasonDescription?: string;
        requestRestart?: boolean;
        sendSessionTerminate?: boolean;
    }): void;
    /**
     * Handles an offer from the remote peer (prepares to accept a session).
     * @param jingle the 'jingle' XML element.
     * @param success callback called when we the incoming session has been
     * accepted
     * @param failure callback called when we fail for any reason, will supply
     * error object with details(which is meant more to be printed to the logger
     * than analysed in the code, as the error is unrecoverable anyway)
     */
    acceptOffer(jingle: any, success: any, failure: any): void;
    /**
     * Returns the JID of the initiator of the jingle session.
     */
    _getInitiatorJid(): string;
}
import Listenable from "../util/Listenable";
import * as JingleSessionState from "./JingleSessionState";
