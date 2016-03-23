/*
 * JingleSession provides an API to manage a single Jingle session. We will
 * have different implementations depending on the underlying interface used
 * (i.e. WebRTC and ORTC) and here we hold the code common to all of them.
 */
var logger = require("jitsi-meet-logger").getLogger(__filename);

function JingleSession(me, sid, peerjid, connection,
                       media_constraints, ice_config, service, eventEmitter) {
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
     * The XMPP service.
     */
    this.service = service;

    /**
     * The event emitter.
     */
    this.eventEmitter = eventEmitter;

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

    // Jingle session state - uninitialized until 'initialize' is called
    this.state = null;
}

/**
 * Prepares this object to initiate a session.
 * @param isInitiator whether we will be the Jingle initiator.
 * @param room <tt>ChatRoom<tt> for the conference associated with this session
 */
JingleSession.prototype.initialize = function(isInitiator, room) {
    if (this.state !== null) {
        logger.error('attempt to initiate on session ' + this.sid +
        'in state ' + this.state);
        return;
    }
    this.room = room;
    this.state = 'pending';
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
JingleSession.prototype.addIceCandidates = function(contents) {};

/**
 * Checks if this JingleSession is in 'active' state which means that the call
 * is in progress.
 * @returns {boolean} <tt>true</tt> if this JingleSession is in 'active' state
 *          or <tt>false</tt> otherwise.
 */
JingleSession.prototype.active = function () {
    return this.state === 'active';
};

/**
 * Handles an 'add-source' event.
 *
 * @param contents an array of Jingle 'content' elements.
 */
JingleSession.prototype.addSources = function(contents) {};

/**
 * Handles a 'remove-source' event.
 *
 * @param contents an array of Jingle 'content' elements.
 */
JingleSession.prototype.removeSources = function(contents) {};

/**
 * Terminates this Jingle session by sending session-terminate
 * @param reason XMPP Jingle error condition
 * @param text some meaningful error message
 */
JingleSession.prototype.terminate = function(reason, text) {};

/**
 * Handles an offer from the remote peer (prepares to accept a session).
 * @param jingle the 'jingle' XML element.
 * @param success callback called when we the incoming session has been accepted
 * @param failure callback called when we fail for any reason, will supply error
 *        object with details(which is meant more to be printed to the logger
 *        than analysed in the code, as the error is unrecoverable anyway)
 */
JingleSession.prototype.acceptOffer = function(jingle, success, failure) {};

module.exports = JingleSession;
