/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-empty-function */

import { getLogger } from '@jitsi/logger';

import RTC from '../RTC/RTC';
import Listenable from '../util/Listenable';

import ChatRoom from './ChatRoom';
import { JingleSessionState } from './JingleSessionState';
import SignalingLayerImpl from './SignalingLayerImpl';
import XmppConnection from './XmppConnection';

const logger = getLogger('xmpp:JingleSession');

/**
 * JingleSession provides an API to manage a single Jingle session. We will
 * have different implementations depending on the underlying interface used
 * (i.e. WebRTC and ORTC) and here we hold the code common to all of them.
 */
export default class JingleSession extends Listenable {
    /**
     * The signaling layer.
     * @internal
     */
    _signalingLayer: Nullable<SignalingLayerImpl>;

    /**
     * The Jingle session identifier.
     */
    public sid: string;

    /**
     * Our JID.
     */
    public localJid: string;

    /**
     * The JID of the remote peer.
     */
    public remoteJid: string;

    /**
     * The XMPP connection.
     */
    public connection: XmppConnection;

    /**
     * The media constraints object passed to the PeerConnection onCreateAnswer/Offer.
     */
    public mediaConstraints: object;

    /**
     * The {@code RTCConfiguration} object passed to the PeerConnection's constructor.
     */
    public pcConfig: object;

    /**
     * Indicates whether this instance is an initiator or an answerer of
     * the Jingle session.
     */
    public isInitiator: boolean;

    /**
     * Whether to use dripping or not. Dripping is sending trickle
     * candidates not one-by-one.
     */
    public usedrip: boolean;

    /**
     *  When dripping is used, stores ICE candidates which are to be sent.
     */
    public dripContainer: RTCIceCandidate[];

    /**
     * The chat room instance associated with the session.
     * @internal
     */
    room: Nullable<ChatRoom>;

    /**
     * Jingle session state - uninitialized until {@link initialize} is
     * called
     */
    public state: Nullable<JingleSessionState>;

    /**
     * The RTC service instance
     * @internal
     */
    rtc: Nullable<RTC>;

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
    constructor(
            sid: string,
            localJid: string,
            remoteJid: string,
            connection: XmppConnection,
            mediaConstraints: object,
            pcConfig: object,
            isInitiator: boolean
    ) {
        super();
        this.sid = sid;
        this.localJid = localJid;
        this.remoteJid = remoteJid;
        this.connection = connection;
        this.mediaConstraints = mediaConstraints;
        this.pcConfig = pcConfig;

        /**
         * Indicates whether this instance is an initiator or an answerer of
         * the Jingle session.
         * @type {boolean}
         */
        this.isInitiator = isInitiator;

        /**
         * Whether to use dripping or not. Dripping is sending trickle
         * candidates not one-by-one.
         */
        this.usedrip = true;

        /**
         *  When dripping is used, stores ICE candidates which are to be sent.
         */
        this.dripContainer = [];

        /**
         * The chat room instance associated with the session.
         * @type {ChatRoom}
         */
        this.room = null;

        /**
         * The signaling layer.
         * @type {Nullable<SignalingLayerImpl>}
         * @internal
         */
        this._signalingLayer = null;

        /**
         * Jingle session state - uninitialized until {@link initialize} is
         * called @type {JingleSessionState}
         */
        this.state = null;

        /**
         * The RTC service instance
         * @type {RTC}
         */
        this.rtc = null;
    }

    /**
     * Returns XMPP address of this session's initiator.
     * @return {string}
     */
    get initiatorJid(): string {
        return this.isInitiator ? this.localJid : this.remoteJid;
    }

    /**
     * Returns XMPP address of this session's responder.
     * @return {string}
     */
    get responderJid(): string {
        return this.isInitiator ? this.remoteJid : this.localJid;
    }

    /**
     * The implementing class finishes initialization here. Called at the end of
     * {@link initialize}.
     * @param {Object} options - The options specific to the implementing class.
     * @protected
     */
    protected doInitialize(options: object): void { }

    /**
     * Prepares this object to initiate a session.
     * @param {ChatRoom} room the chat room for the conference associated with
     * this session
     * @param {RTC} rtc the RTC service instance
     * @param {SignalingLayerImpl} signalingLayer - The signaling layer instance.
     * @param {object} options - the options, see implementing class's
     * {@link #doInitialize} description for more details.
     */
    public initialize(
            room: ChatRoom,
            rtc: RTC,
            signalingLayer: SignalingLayerImpl,
            options: object
    ): void {
        if (this.state !== null) {
            const errmsg
                = `attempt to initiate on session ${this.sid}
                   in state ${this.state}`;

            logger.error(errmsg);
            throw new Error(errmsg);
        }

        // TODO decouple from room
        this.room = room;
        this.rtc = rtc;
        this._signalingLayer = signalingLayer;
        this.state = JingleSessionState.PENDING;
        this.doInitialize(options);
    }

    /**
     * Adds the ICE candidates found in the 'contents' array as remote
     * candidates?
     * Note: currently only used on transport-info
     *
     * @param contents
     */
    public addIceCandidates(contents: unknown): void {}

    /**
     * Returns current state of this <tt>JingleSession</tt> instance.
     * @returns {Nullable<JingleSessionState>} the current state of this session instance.
     */
    public getState(): Nullable<JingleSessionState> {
        return this.state;
    }

    /**
     * Handles an 'add-source' event.
     *
     * @param contents an array of Jingle 'content' elements.
     */
    public addSources(contents: unknown): void {}

    /**
     * Handles a 'remove-source' event.
     *
     * @param contents an array of Jingle 'content' elements.
     */
    public removeSources(contents: unknown): void {}

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
    public terminate(
            success: Optional<(() => void)>,
            failure: Optional<(() => void)>,
            options: {
                reason?: string;
                reasonDescription?: string;
                requestRestart?: boolean;
                sendSessionTerminate?: boolean;
            }
    ): void {}

    /**
     * Handles an offer from the remote peer (prepares to accept a session).
     * @param jingle the 'jingle' XML element.
     * @param success callback called when we the incoming session has been
     * accepted
     * @param failure callback called when we fail for any reason, will supply
     * error object with details(which is meant more to be printed to the logger
     * than analysed in the code, as the error is unrecoverable anyway)
     */
    public acceptOffer(
            jingle: unknown,
            success: Optional<(() => void)>,
            failure: Optional<((error: unknown) => void)>
    ): void {}
}

