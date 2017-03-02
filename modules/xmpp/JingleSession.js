/* global __filename */
import { getLogger } from "jitsi-meet-logger";
import * as JingleSessionState from "./JingleSessionState";

const logger = getLogger(__filename);

/*
 * JingleSession provides an API to manage a single Jingle session. We will
 * have different implementations depending on the underlying interface used
 * (i.e. WebRTC and ORTC) and here we hold the code common to all of them.
 */
export default class JingleSession {

    /**
     * Creates new <tt>JingleSession</tt>.
     * @param {string} sid the Jingle session identifier
     * @param {string} localJid our JID
     * @param {string} peerjid the JID of the remote peer
     * @param {Strophe.Connection} connection the XMPP connection
     * @param {Object} media_constraints the media constraints object passed to
     * the PeerConnection onCreateAnswer/Offer as defined by the WebRTC.
     * @param {Object} ice_config the ICE servers config object as defined by
     * the WebRTC. Passed to the PeerConnection's constructor.
     */
    constructor(sid,
                localJid, peerjid, connection, media_constraints, ice_config) {
        this.sid = sid;
        this.localJid = localJid;
        this.peerjid = peerjid;
        this.connection = connection;
        this.media_constraints = media_constraints;
        this.ice_config = ice_config;

        /**
         * Whether to use dripping or not. Dripping is sending trickle
         * candidates not one-by-one.
         */
        this.usedrip = true;

        /**
         *  When dripping is used, stores ICE candidates which are to be sent.
         */
        this.drip_container = [];

        /**
         * The chat room instance associated with the session.
         * @type {ChatRoom}
         */
        this.room = null;

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
     * Prepares this object to initiate a session.
     * @param {boolean} isInitiator whether we will be the Jingle initiator.
     * @param {ChatRoom} room the chat room for the conference associated with
     * this session
     * @param {RTC} rtc the RTC service instance
     */
    initialize(isInitiator, room, rtc) {
        if (this.state !== null) {
            const errmsg
                = `attempt to initiate on session ${this.sid}
                   in state ${this.state}`;
            logger.error(errmsg);
            throw new Error(errmsg);
        }
        this.room = room;
        this.rtc = rtc;
        this.state = JingleSessionState.PENDING;
        this.initiator = isInitiator ? this.localJid : this.peerjid;
        this.responder = !isInitiator ? this.localJid : this.peerjid;
        this.doInitialize();
    }

    /**
     * The implementing class finishes initialization here. Called at the end of
     * {@link initialize}.
     */
    doInitialize() {

    }

    /**
     * Adds the ICE candidates found in the 'contents' array as remote
     * candidates?
     * Note: currently only used on transport-info
     */
    // eslint-disable-next-line no-unused-vars
    addIceCandidates (contents) {

    }

    /**
     * Returns current state of this <tt>JingleSession</tt> instance.
     * @returns {JingleSessionState} the current state of this session instance.
     */
    getState () {
        return this.state;
    }

    /**
     * Handles an 'add-source' event.
     *
     * @param contents an array of Jingle 'content' elements.
     */
    // eslint-disable-next-line no-unused-vars
    addSources (contents) {

    }

    /**
     * Handles a 'remove-source' event.
     *
     * @param contents an array of Jingle 'content' elements.
     */
    // eslint-disable-next-line no-unused-vars
    removeSources (contents) {

    }

    /**
     * Terminates this Jingle session by sending session-terminate
     * @param reason XMPP Jingle error condition
     * @param text some meaningful error message
     * @param success a callback called once the 'session-terminate' packet has
     * been acknowledged with RESULT.
     * @param failure a callback called when either timeout occurs or ERROR
     * response is received.
     */
    // eslint-disable-next-line no-unused-vars
    terminate (reason, text, success, failure) {

    }

    /**
     * Handles an offer from the remote peer (prepares to accept a session).
     * @param jingle the 'jingle' XML element.
     * @param success callback called when we the incoming session has been
     * accepted
     * @param failure callback called when we fail for any reason, will supply
     *        error object with details(which is meant more to be printed to
     *        the logger than analysed in the code, as the error is
     *        unrecoverable anyway)
     */
    // eslint-disable-next-line no-unused-vars
    acceptOffer (jingle, success, failure) {

    }
}
