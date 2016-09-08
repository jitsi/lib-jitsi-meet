/*
 * JingleSession provides an API to manage a single Jingle session. We will
 * have different implementations depending on the underlying interface used
 * (i.e. WebRTC and ORTC) and here we hold the code common to all of them.
 */
import {getLogger} from "jitsi-meet-logger";
const logger = getLogger(__filename);

import * as JingleSessionState from "./JingleSessionState";

function JingleSession(me, sid, peerjid, connection,
                       media_constraints, ice_config) {
    /**
     * Our JID.
     */
    this.me = me;

    /**
     * The Jingle session identifier.
     */
    this.sid = sid;

    /**
     * the JID of the remote peer.
     */
    this.peerjid = peerjid;

    /**
     * The XMPP connection.
     */
    this.connection = connection;

    /**
     * Whether to use dripping or not. Dripping is sending trickle candidates
     * not one-by-one.
     * Note: currently we do not support 'false'.
     */
    this.usedrip = true;

    /**
     *  When dripping is used, stores ICE candidates which are to be sent.
     */
    this.drip_container = [];

    // Media constraints. Is this WebRTC only?
    this.media_constraints = media_constraints;

    // ICE servers config (RTCConfiguration?).
    this.ice_config = ice_config;

    // The chat room instance associated with the session.
    this.room = null;

    /**
     * Jingle session state - uninitialized until {@link initialize} is called
     * @type {JingleSessionState}
     */
    this.state = null;
}

/**
 * Prepares this object to initiate a session.
 * @param isInitiator whether we will be the Jingle initiator.
 * @param room <tt>ChatRoom<tt> for the conference associated with this session
 */
JingleSession.prototype.initialize = function(isInitiator, room) {
    if (this.state !== null) {
        var errmsg
            = 'attempt to initiate on session ' + this.sid + 'in state '
                + this.state;
        logger.error(errmsg);
        throw new Error(errmsg);
    }
    this.room = room;
    this.state = JingleSessionState.PENDING;
    this.initiator = isInitiator ? this.me : this.peerjid;
    this.responder = !isInitiator ? this.me : this.peerjid;
    this.doInitialize();
};

/**
 * Finishes initialization.
 */
JingleSession.prototype.doInitialize = function() {};

/**
 * Adds the ICE candidates found in the 'contents' array as remote candidates?
 * Note: currently only used on transport-info
 */
// eslint-disable-next-line no-unused-vars
JingleSession.prototype.addIceCandidates = function(contents) {};

/**
 * Returns current state of this <tt>JingleSession</tt> instance.
 * @returns {JingleSessionState} the current state of this session instance.
 */
JingleSession.prototype.getState = function () {
    return this.state;
};

/**
 * Handles an 'add-source' event.
 *
 * @param contents an array of Jingle 'content' elements.
 */
// eslint-disable-next-line no-unused-vars
JingleSession.prototype.addSources = function(contents) {};

/**
 * Handles a 'remove-source' event.
 *
 * @param contents an array of Jingle 'content' elements.
 */
// eslint-disable-next-line no-unused-vars
JingleSession.prototype.removeSources = function(contents) {};

/**
 * Terminates this Jingle session by sending session-terminate
 * @param reason XMPP Jingle error condition
 * @param text some meaningful error message
 * @param success a callback called once the 'session-terminate' packet has been
 * acknowledged with RESULT.
 * @param failure a callback called when either timeout occurs or ERROR response
 * is received.
 */
// eslint-disable-next-line no-unused-vars
JingleSession.prototype.terminate = function(reason, text, success, failure) {};

/**
 * Handles an offer from the remote peer (prepares to accept a session).
 * @param jingle the 'jingle' XML element.
 * @param success callback called when we the incoming session has been accepted
 * @param failure callback called when we fail for any reason, will supply error
 *        object with details(which is meant more to be printed to the logger
 *        than analysed in the code, as the error is unrecoverable anyway)
 */
// eslint-disable-next-line no-unused-vars
JingleSession.prototype.acceptOffer = function(jingle, success, failure) {};

module.exports = JingleSession;
