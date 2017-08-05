/* global __filename */
import { getLogger } from 'jitsi-meet-logger';
import * as JingleSessionState from './JingleSessionState';

const logger = getLogger(__filename);

/**
 * JingleSession provides an API to manage a single Jingle session. We will
 * have different implementations depending on the underlying interface used
 * (i.e. WebRTC and ORTC) and here we hold the code common to all of them.
 */
export default class JingleSession {

    /* eslint-disable max-params */

    /**
     * Creates new <tt>JingleSession</tt>.
     * @param {string} sid the Jingle session identifier
     * @param {string} localJid our JID
     * @param {string} peerjid the JID of the remote peer
     * @param {Strophe.Connection} connection the XMPP connection
     * @param {Object} mediaConstraints the media constraints object passed to
     * the PeerConnection onCreateAnswer/Offer as defined by the WebRTC.
     * @param {Object} iceConfig the ICE servers config object as defined by
     * the WebRTC. Passed to the PeerConnection's constructor.
     */
    constructor(
            sid,
            localJid,
            peerjid,
            connection,
            mediaConstraints,
            iceConfig) {
        this.sid = sid;
        this.localJid = localJid;
        this.peerjid = peerjid;
        this.connection = connection;
        this.mediaConstraints = mediaConstraints;
        this.iceConfig = iceConfig;

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

    /* eslint-enable max-params */

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
        this.responder = isInitiator ? this.peerjid : this.localJid;
        this.doInitialize();
    }

    /**
     * The implementing class finishes initialization here. Called at the end of
     * {@link initialize}.
     * @protected
     */
    doInitialize() {} // eslint-disable-line no-empty-function

    /* eslint-disable no-unused-vars, no-empty-function */

    /**
     * Adds the ICE candidates found in the 'contents' array as remote
     * candidates?
     * Note: currently only used on transport-info
     *
     * @param contents
     */
    addIceCandidates(contents) {}

    /* eslint-enable no-unused-vars, no-empty-function */

    /**
     * Returns current state of this <tt>JingleSession</tt> instance.
     * @returns {JingleSessionState} the current state of this session instance.
     */
    getState() {
        return this.state;
    }

    /* eslint-disable no-unused-vars, no-empty-function */

    /**
     * Handles an 'add-source' event.
     *
     * @param contents an array of Jingle 'content' elements.
     */
    addSources(contents) {}

    /**
     * Handles a 'remove-source' event.
     *
     * @param contents an array of Jingle 'content' elements.
     */
    removeSources(contents) {}

    /**
     * Terminates this Jingle session by sending session-terminate
     * @param success a callback called once the 'session-terminate' packet has
     * been acknowledged with RESULT.
     * @param failure a callback called when either timeout occurs or ERROR
     * response is received.
     * @param {Object} options
     * @param {string} [options.reason] XMPP Jingle error condition
     * @param {string} [options.reasonDescription] some meaningful error message
     * @param {boolean} [options.sendSessionTerminate=true] set to false to skip
     * sending session-terminate. It may not make sense to send it if the XMPP
     * connection has been closed already or if the remote peer has disconnected
     */
    terminate(success, failure, options) {}

    /**
     * Handles an offer from the remote peer (prepares to accept a session).
     * @param jingle the 'jingle' XML element.
     * @param success callback called when we the incoming session has been
     * accepted
     * @param failure callback called when we fail for any reason, will supply
     * error object with details(which is meant more to be printed to the logger
     * than analysed in the code, as the error is unrecoverable anyway)
     */
    acceptOffer(jingle, success, failure) {}

    /* eslint-enable no-unused-vars, no-empty-function */
}
