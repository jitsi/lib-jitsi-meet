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
     * @param {string} remoteJid the JID of the remote peer
     * @param {XmppConnection} connection the XMPP connection
     * @param {Object} mediaConstraints the media constraints object passed to
     * the PeerConnection onCreateAnswer/Offer as defined by the WebRTC.
     * @param {Object} iceConfig the ICE servers config object as defined by
     * the WebRTC. Passed to the PeerConnection's constructor.
     * @param {boolean} isInitiator indicates if it will be the side which
     * initiates the session.
     */
    constructor(
            sid,
            localJid,
            remoteJid,
            connection,
            mediaConstraints,
            iceConfig,
            isInitiator) {
        this.sid = sid;
        this.localJid = localJid;
        this.remoteJid = remoteJid;
        this.connection = connection;
        this.mediaConstraints = mediaConstraints;
        this.iceConfig = iceConfig;

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
    get initiatorJid() {
        return this.isInitiator ? this.localJid : this.remoteJid;
    }

    /**
     * Returns XMPP address of this session's responder.
     * @return {string}
     */
    get responderJid() {
        return this.isInitiator ? this.remoteJid : this.localJid;
    }

    /* eslint-enable max-params */

    /**
     * Prepares this object to initiate a session.
     * @param {ChatRoom} room the chat room for the conference associated with
     * this session
     * @param {RTC} rtc the RTC service instance
     * @param {object} options - the options, see implementing class's
     * {@link #doInitialize} description for more details.
     */
    initialize(room, rtc, options) {
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
        this.doInitialize(options);
    }

    /**
     * The implementing class finishes initialization here. Called at the end of
     * {@link initialize}.
     * @param {Object} options - The options specific to the implementing class.
     * @protected
     */
    doInitialize(options) { } // eslint-disable-line no-unused-vars, no-empty-function, max-len

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

    /**
     * Returns the JID of the initiator of the jingle session.
     */
    _getInitiatorJid() {
        return this.isInitiator ? this.localJid : this.remoteJid;
    }

    /* eslint-enable no-unused-vars, no-empty-function */
}
