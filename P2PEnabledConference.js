/* global __filename */

import {getLogger} from "jitsi-meet-logger";
import * as JingleSessionState from "./modules/xmpp/JingleSessionState";
import JitsiConference from "./JitsiConference";
import * as JitsiConferenceEvents from "./JitsiConferenceEvents";
import * as RTCEvents from "./service/RTC/RTCEvents";
import * as XMPPEvents from "./service/xmpp/XMPPEvents";

const logger = getLogger(__filename);

/**
 * A peer to peer enabled conference that will try to use direct connection when
 * available in case there are only 2 participants in the room. The JVB
 * connection will be kept alive and it will be reused if the 3rd participant
 * joins.
 *
 * When the conference is being switched from one mode to another the local
 * tracks are detached from inactive session (through JingleSessionPC). It means
 * that locally those tracks are removed from the underlying PeerConnection, but
 * are still signalled to the remote participants. No data is being sent for
 * those tracks.
 * As for the remote tracks those are replaced by generating fake "remote track
 * added/removed" events.
 */
export default class P2PEnabledConference extends JitsiConference {
    /**
     * Creates new <tt>P2PEnabledConference</tt>.
     * @param options see description in {@link JitsiConference} constructor.
     * @param {number} [options.config.backToP2PDelay=5] a delay given in
     * seconds, before the conference switches back to P2P after the 3rd
     * participant has left.
     * @param {boolean} [options.config.disableAutoP2P] option used in automatic
     * testing. When set to <tt>true</tt> the method
     * {@link _startPeer2PeerSession} will be blocked which means that no
     * automatic switching between P2P and JVB connections will happen. In such
     * case public methods {@link startPeer2PeerSession} and
     * {@link stopPeer2PeerSession} have to be called explicitly.
     */
    constructor(options) {
        super(options);
        // Original this.eventEmitter.emit method, stored to skip the event
        // filtering logic
        this._originalEmit = this.eventEmitter.emit.bind(this.eventEmitter);
        // Intercepts original event emitter calls to filter out some of
        // the conference events
        this.eventEmitter.emit = this._emitIntercept.bind(this);
        /**
         * Stores reference to deferred start P2P task. It's created when 3rd
         * participant leaves the room in order to avoid ping pong effect (it
         * could be just a page reload).
         * @type {number|null}
         */
        this.deferredStartP2P = null;

        const delay = parseInt(options.config.backToP2PDelay);
        /**
         * A delay given in seconds, before the conference switches back to P2P
         * after the 3rd participant has left.
         * @type {number}
         */
        this.backToP2PDelay = isNaN(delay) ? 5 : delay;
        logger.info("backToP2PDelay: " + this.backToP2PDelay);

        /**
         * If set to <tt>true</tt> it means the P2P ICE is no longer connected.
         * When <tt>false</tt> it means that P2P ICE (media) connection is up
         * and running.
         * @type {boolean}
         */
        this.isP2PConnectionInterrupted = false;
        /**
         * Flag set to <tt>true</tt> when P2P session has been established
         * (ICE has been connected).
         * @type {boolean}
         */
        this.p2pEstablished = false;
        /**
         * Fake <tt>ChatRoom</tt> passed to {@link p2pJingleSession}.
         * @type {FakeChatRoomLayer}
         */
        this.p2pFakeRoom = null;
        /**
         * A JingleSession for the direct peer to peer connection.
         * @type {JingleSessionPC}
         */
        this.p2pJingleSession = null;
    }

    /**
     * Accept incoming P2P Jingle call.
     * @param {JingleSessionPC} jingleSession the session instance
     * @param {jQuery} jingleOffer a jQuery selector pointing to 'jingle' IQ
     * element.
     * @private
     */
    _acceptP2PIncomingCall (jingleSession, jingleOffer) {
        jingleSession.setSSRCOwnerJid(this.room.myroomjid);

        // Accept the offer
        this.p2pJingleSession = jingleSession;
        this.p2pFakeRoom = new FakeChatRoomLayer(this, false /* isInitiator */);
        this.p2pJingleSession.initialize(
            false /* initiator */, this.p2pFakeRoom, this.rtc);

        const localTracks = this.getLocalTracks();

        logger.debug("Adding " + localTracks + " to P2P...");
        this.p2pJingleSession.addLocalTracks(localTracks).then(
            () => {
                logger.debug("Add " + localTracks + " to P2P done!");
                this.p2pJingleSession.acceptOffer(
                    jingleOffer,
                    () => {
                        logger.debug("Got RESULT for P2P 'session-accept'");
                    },
                    (error) => {
                        logger.error(
                            "Failed to accept incoming P2P Jingle session",
                            error);
                    }
                );
            },
            (error) => {
                logger.error(
                    "Failed to add " + localTracks + " to the P2P connection",
                    error);
            });
    }

    /**
     * @inheritDoc
     * @override
     */
    _addLocalTrackAsUnmute (track) {
        const allPromises = [super._addLocalTrackAsUnmute(track)];
        if (this.p2pJingleSession) {
            allPromises.push(this.p2pJingleSession.addTrackAsUnmute(track));
        }
        return Promise.all(allPromises);
    }

    /**
     * Attaches local tracks back to the JVB connection.
     * @private
     */
    _attachLocalTracksToJvbSession() {
        const localTracks = this.getLocalTracks();

        logger.info("Attaching " + localTracks + " to JVB");
        this.jvbJingleSession.attachLocalTracks(localTracks).then(
            () => {
                logger.info("Attach " + localTracks + " to JVB success!");
            },
            (error) => {
                logger.error(
                    "Attach " + localTracks + " to JVB failed!", error);
            });
    }

    /**
     * Adds remote tracks to the conference associated with the JVB session.
     * @private
     */
    _addRemoteJVBTracks () {
        this._addRemoteTracks("JVB", this.jvbJingleSession);
    }

    /**
     * Adds remote tracks to the conference associated with the P2P session.
     * @private
     */
    _addRemoteP2PTracks () {
        this._addRemoteTracks("P2P", this.p2pJingleSession);
    }

    /**
     * Generates fake "remote track added" events for given Jingle session.
     * @param {string} logName the session's nickname which will appear in log
     * messages.
     * @param {JingleSessionPC} jingleSession the session for which remote
     * tracks will be added.
     * @private
     */
    _addRemoteTracks (logName, jingleSession) {
        if (!jingleSession) {
            logger.info(
                "Not adding remote " + logName + " tracks - no session yet");
            return;
        }
        const remoteTracks = jingleSession.peerconnection.getRemoteTracks();
        for (const track of remoteTracks) {
            logger.info("Adding remote " + logName + " track: " + track);
            this.rtc.eventEmitter.emit(RTCEvents.REMOTE_TRACK_ADDED, track);
        }
    }

    /**
     * @inheritDoc
     * @override
     */
    _doReplaceTrack (oldTrack, newTrack) {
        const allPromises = [super._doReplaceTrack(oldTrack, newTrack)];
        if (this.p2pJingleSession) {
            allPromises.push(
                this.p2pJingleSession.replaceTrack(oldTrack, newTrack));
        }
        return Promise.all(allPromises);
    }

    /**
     * Intercepts events emitted by parent <tt>JitsiConference</tt>
     * @private
     */
    _emitIntercept(eventType) {
        const shouldBlock = this._shouldBlockEvent(eventType);
        switch (eventType) {
            // Log events which may be of interest for the P2P implementation
            case JitsiConferenceEvents.CONNECTION_INTERRUPTED:
            case JitsiConferenceEvents.CONNECTION_RESTORED:
            case JitsiConferenceEvents.P2P_STATUS:
                logger.debug(
                    "_emitIntercept: block? " + shouldBlock, arguments);
                break;
        }
        if (!shouldBlock) {
            this._originalEmit.apply(this.eventEmitter, arguments);
        }
    }

    /**
     * Called when {@link JitsiConferenceEvents.CONNECTION_ESTABLISHED} event is
     * triggered for the P2P session. Switches the conference to use the P2P
     * connection.
     * @param {JingleSessionPC} jingleSession the session instance. It should be
     * always the P2P one, but still worth to verify for bug detection
     * @private
     */
    _onP2PConnectionEstablished (jingleSession) {
        if (this.p2pJingleSession !== jingleSession) {
            logger.error("CONNECTION_ESTABLISHED - not P2P session ?!");
            return;
        }
        // Update P2P status and emit events
        this._setP2PStatus(true);

        // Remove remote tracks
        this._removeRemoteJVBTracks();
        // Add remote tracks
        this._addRemoteP2PTracks();
        // Remove local tracks from JVB PC
        // But only if it has started
        if (this.jvbJingleSession) {
            this._detachLocalTracksFromJvbSession();
        }

        // Start remote stats
        logger.info("Starting remote stats with p2p connection");
        this._startRemoteStats();
    }

    /**
     * Detaches local tracks from the JVB connection.
     * @private
     */
    _detachLocalTracksFromJvbSession() {
        const localTracks = this.getLocalTracks();
        logger.info("Detaching local tracks from JVB: " + localTracks);
        this.jvbJingleSession.detachLocalTracks(localTracks)
            .then(() => {
                logger.info(
                    "Detach local tracks from JVB done!" + localTracks);
            }, (error) => {
                logger.info(
                    "Detach local tracks from JVB failed!" + localTracks,
                    error);
            });
    }

    /**
     * Removes from the conference remote tracks associated with the JVB
     * connection.
     * @private
     */
    _removeRemoteJVBTracks () {
        this._removeRemoteTracks("JVB", this.jvbJingleSession);
    }

    /**
     * Removes from the conference remote tracks associated with the P2P
     * connection.
     * @private
     */
    _removeRemoteP2PTracks () {
        this._removeRemoteTracks("P2P", this.p2pJingleSession);
    }

    /**
     * Generates fake "remote track removed" events for given Jingle session.
     * @param {string} nickname the session's nickname which will appear in log
     * messages.
     * @param {JingleSessionPC} jingleSession the session for which remote
     * tracks will be removed.
     * @private
     */
    _removeRemoteTracks (nickname, jingleSession) {
        if (!jingleSession) {
            logger.info(
                "Not removing remote " + nickname + " tracks - no session yet");
            return;
        }
        const remoteTracks = jingleSession.peerconnection.getRemoteTracks();
        for (const track of remoteTracks) {
            logger.info("Removing remote " + nickname + " track: " + track);
            this.rtc.eventEmitter.emit(RTCEvents.REMOTE_TRACK_REMOVED, track);
        }
    }

    /**
     * @inheritDoc
     * @override
     */
    _removeTrackAsMute (track) {
        const allPromises = [super._removeTrackAsMute(track)];
        if (this.p2pJingleSession) {
            allPromises.push(this.p2pJingleSession.removeTrackAsMute(track));
        }
        return Promise.all(allPromises);
    }

    /**
     * Sets new P2P status and updates some events/states hijacked from
     * the <tt>JitsiConference</tt>.
     * @param {boolean} newStatus the new P2P status value, <tt>true</tt> means
     * that P2P is now in use, <tt>false</tt> means that the JVB connection is
     * now in use.
     * @private
     */
    _setP2PStatus (newStatus) {
        if (this.p2pEstablished === newStatus) {
            logger.error(
                "Called _setP2PStatus with the same status: " + newStatus);
            return;
        }
        this.p2pEstablished = newStatus;
        if (newStatus) {
            logger.info("Peer to peer connection established!");
        } else {
            logger.info("Peer to peer connection closed!");
        }
        // Clear dtmfManager, so that it can be recreated with new connection
        this.dtmfManager = null;
        // Update P2P status
        this.eventEmitter.emit(
            JitsiConferenceEvents.P2P_STATUS, this, this.p2pEstablished);
        // Refresh connection interrupted/restored
        this._originalEmit(
            this.isConnectionInterrupted()
                ? JitsiConferenceEvents.CONNECTION_INTERRUPTED
                : JitsiConferenceEvents.CONNECTION_RESTORED);
    }

    /**
     * Checks whether or not given event coming from
     * the <tt>JitsiConference</tt> should be blocked or not.
     * @param {string} eventType the event type name
     * @return {boolean} <tt>true</tt> to block or <tt>false</tt> to let through
     * @private
     */
    _shouldBlockEvent (eventType) {
        switch (eventType) {
            case JitsiConferenceEvents.CONNECTION_INTERRUPTED:
            case JitsiConferenceEvents.CONNECTION_RESTORED:
                return this.p2pEstablished;
            default:
                return false;
        }
    }

    /**
     * Starts new P2P session.
     * @param {string} peerJid the JID of the remote participant
     * @private
     */
    _startPeer2PeerSession(peerJid) {
        if (this.deferredStartP2P) {
            // Make note that the task has been executed
            this.deferredStartP2P = null;
        }
        if (this.p2pJingleSession) {
            logger.error("P2P session already started!");
            return;
        }

        this.p2pJingleSession
            = this.xmpp.connection.jingle.newJingleSession(
                this.room.myroomjid, peerJid);
        this.p2pJingleSession.setSSRCOwnerJid(this.room.myroomjid);
        this.p2pFakeRoom = new FakeChatRoomLayer(this, true /* isInitiator */);

        logger.info(
            "Created new P2P JingleSession", this.room.myroomjid, peerJid);

        this.p2pJingleSession.initialize(
            true /* initiator */, this.p2pFakeRoom, this.rtc);

        // NOTE one may consider to start P2P with the local tracks detached,
        // but no data will be sent until ICE succeeds anyway. And we switch
        // immediately once the P2P ICE connects.
        const localTracks = this.getLocalTracks();

        logger.info("Adding " + localTracks + " to P2P...");
        this.p2pJingleSession.addLocalTracks(localTracks).then(
            () => {
                logger.info("Added " + localTracks + " to P2P");
                logger.info("About to send P2P 'session-initiate'...");
                this.p2pJingleSession.invite();
            },
            (error) => {
                logger.error("Failed to add " + localTracks + " to P2P", error);
            });
    }

    /**
     * Method when called will decide whether it's the time to start or stop the
     * P2P session.
     * @param {boolean} userLeftEvent if <tt>true</tt> it means that the call
     * originates from the user left event.
     * @private
     */
    _startStopP2PSession (userLeftEvent) {
        if (this.options.config.disableAutoP2P) {
            logger.info("Auto P2P disabled");
            return;
        }
        const peers = this.getParticipants();
        const peerCount = peers.length;
        const isModerator = this.isModerator();
        // FIXME 1 peer and it must *support* P2P switching
        const shouldBeInP2P = peerCount === 1;

        logger.debug(
            "P2P? isModerator: " + isModerator
            + ", peerCount: " + peerCount + " => " + shouldBeInP2P);

        // Clear deferred "start P2P" task
        if (!shouldBeInP2P && this.deferredStartP2P) {
            logger.info("Cleared deferred start P2P task");
            window.clearTimeout(this.deferredStartP2P);
            this.deferredStartP2P = null;
        }
        // Start peer to peer session
        if (isModerator && !this.p2pJingleSession && shouldBeInP2P) {
            const peer = peerCount && peers[0];

            // Everyone is a moderator ?
            if (isModerator && peer.getRole() === 'moderator') {
                const myId = this.myUserId();
                const peersId = peer.getId();
                if (myId > peersId) {
                    logger.debug(
                        "Everyone's a moderator - "
                            + "the other peer should start P2P", myId, peersId);
                    // Abort
                    return;
                } else if (myId == peersId) {
                    logger.error("The same IDs ? ", myId, peersId);
                    // Abort
                    return;
                }
            }
            const jid = peer.getJid();
            if (userLeftEvent) {
                if (this.deferredStartP2P) {
                    logger.error("Deferred start P2P task's been set already!");
                    // Abort
                    return;
                }
                logger.info(
                    "Will start P2P with: " + jid
                        + " after " + this.backToP2PDelay + " seconds...");
                this.deferredStartP2P = window.setTimeout(
                    this._startPeer2PeerSession.bind(this, jid),
                    this.backToP2PDelay * 1000);
            } else {
                logger.info("Will start P2P with: " + jid);
                this._startPeer2PeerSession(jid);
            }
        } else if (isModerator && this.p2pJingleSession && !shouldBeInP2P){
            logger.info(
                "Will stop P2P with: " + this.p2pJingleSession.peerjid);
            this._stopPeer2PeerSession();
        }
    }

    /**
     * Stops the current P2P session.
     * @param {string} [reason="success"] one of the Jingle "reason" element
     * names as defined by https://xmpp.org/extensions/xep-0166.html#def-reason
     * @param {string} [reasonDescription="Turing off P2P session"] text
     * description that will be included in the session terminate message
     * @private
     */
    _stopPeer2PeerSession(reason, reasonDescription) {
        if (!this.p2pJingleSession) {
            logger.error("No P2P session to be stopped!");
            return;
        }

        // Add local track to JVB
        this._attachLocalTracksToJvbSession();

        // Swap remote tracks, but only if the P2P has been fully established
        if (this.p2pEstablished) {
            // Remove remote P2P tracks
            this._removeRemoteP2PTracks();
            // Add back remote JVB tracks
            this._addRemoteJVBTracks();
        }

        // Stop P2P stats
        logger.info("Stopping remote stats with P2P connection");
        this.statistics.stopRemoteStats();

        if (JingleSessionState.ENDED !== this.p2pJingleSession.state) {
            this.p2pJingleSession.terminate(
                reason ? reason : "success",
                reasonDescription
                    ? reasonDescription : "Turing off P2P session",
                () => { logger.info("P2P session terminate RESULT"); },
                (error) => {
                    logger.warn(
                        "An error occurred while trying to terminate"
                        + " P2P Jingle session", error);
                });
        }

        this.p2pJingleSession = null;
        // Clear fake room state
        this.p2pFakeRoom = null;
        // Update P2P status and other affected events/states
        this._setP2PStatus(false);

        // Start remote stats
        logger.info("Starting remote stats with JVB connection");
        if (this.jvbJingleSession) {
            this._startRemoteStats();
        }
    }

    /**
     * Tells whether or not the media connection has been interrupted based on
     * the current P2P vs JVB status.
     * @inheritDoc
     * @override
     */
    isConnectionInterrupted () {
        return this.p2pEstablished
            ? this.isP2PConnectionInterrupted : super.isConnectionInterrupted();
    }

    /**
     * @inheritDoc
     * @override
     */
    isP2PEstablished() {
        return this.p2pEstablished;
    }

    /**
     * Will return P2P or JVB <tt>TraceablePeerConnection</tt> depending on
     * which connection is currently active.
     * @inheritDoc
     * @override
     * @protected
     */
    getActivePeerConnection () {
        return this.isP2PEstablished()
            ? this.p2pJingleSession.peerconnection
            : super.getActivePeerConnection();
    }

    /**
     * @inheritDoc
     * @override
     */
    getConnectionState () {
        const p2pState = this.getP2PConnectionState();
        if (p2pState) {
            return p2pState;
        } else {
            return super.getConnectionState();
        }
    }

    /**
     * Returns the current ICE state of the P2P connection.
     * @return {string|null} an ICE state or <tt>null</tt> if there's currently
     * no P2P connection.
     */
    getP2PConnectionState() {
        if (this.p2pEstablished && this.p2pJingleSession) {
            return this.p2pJingleSession.getIceConnectionState();
        } else {
            return null;
        }
    }

    /**
     * @inheritDoc
     * @override
     */
    onCallAccepted (jingleSession, answer) {
        if (this.p2pJingleSession === jingleSession) {
            logger.info("Doing setAnswer");
            this.p2pJingleSession.setAnswer(answer);
        }
    }

    /**
     * @inheritDoc
     * @override
     */
    onCallEnded (jingleSession, reasonCondition, reasonText) {
        logger.info(
            "Call ended: " + reasonCondition + " - "
            + reasonText + " P2P ?" + jingleSession.isP2P);
        if (jingleSession === this.p2pJingleSession) {
            // FIXME not sure if that's ok to not call the super
            // check CallStats and other things
            this._stopPeer2PeerSession();
        } else {
            super.onCallEnded(jingleSession, reasonCondition, reasonText);
        }
    }

    /**
     * Answers the incoming P2P Jingle call.
     * @inheritDoc
     * @override
     */
    onIncomingCall (jingleSession, jingleOffer, now) {
        if (jingleSession.isP2P) {
            const role = this.room.getMemberRole(jingleSession.peerjid);
            if ('moderator' !== role) {
                // Reject incoming P2P call
                this._rejectIncomingCallNonModerator(jingleSession);
            } else if (this.p2pJingleSession) {
                // Reject incoming P2P call (already in progress)
                this._rejectIncomingCall(
                    jingleSession,
                    "busy", "P2P already in progress",
                    "Duplicated P2P 'session-initiate'");
            } else {
                // Accept incoming P2P call
                this._acceptP2PIncomingCall(jingleSession, jingleOffer);
            }
        } else {
            // Let the JitsiConference deal with the JVB session
            super.onIncomingCall(jingleSession, jingleOffer, now);
        }
    }

    /**
     * Local role change may trigger new P2P session if 'everyone's a moderator'
     * plugin is enabled.
     * @inheritDoc
     * @override
     */
    onLocalRoleChanged (newRole) {
        super.onLocalRoleChanged(newRole);
        // Maybe start P2P
        this._startStopP2PSession();
    }

    /**
     * @inheritDoc
     * @override
     */
    onMemberJoined (jid, nick, role, isHidden) {
        super.onMemberJoined(jid, nick, role, isHidden);

        this._startStopP2PSession();
    }

    /**
     * @inheritDoc
     * @override
     */
    onMemberLeft (jid) {
        super.onMemberLeft(jid);

        this._startStopP2PSession(true /* triggered by user left event */);
    }

    /**
     * Called when {@link XMPPEvents.CONNECTION_INTERRUPTED} occurs on the P2P
     * connection.
     */
    onP2PIceConnectionInterrupted () {
        this.isP2PConnectionInterrupted = true;
        if (this.p2pEstablished)
            this._originalEmit(JitsiConferenceEvents.CONNECTION_INTERRUPTED);
    }

    /**
     * Called when {@link XMPPEvents.CONNECTION_RESTORED} occurs on the P2P
     * connection.
     */
    onP2PIceConnectionRestored () {
        this.isP2PConnectionInterrupted = false;
        if (this.p2pEstablished)
            this._originalEmit(JitsiConferenceEvents.CONNECTION_RESTORED);
    }

    /**
     * @inheritDoc
     * @override
     */
    onRemoteTrackAdded (track) {
        if (track.isP2P && !this.p2pEstablished) {
            logger.info(
                "Trying to add remote P2P track, when not in P2P - IGNORED");
        } else if (!track.isP2P && this.p2pEstablished) {
            logger.info(
                "Trying to add remote JVB track, when in P2P - IGNORED");
        } else {
            super.onRemoteTrackAdded(track);
        }
    }

    /**
     * {@inheritDoc}
     * @override
     */
    onTransportInfo (jingleSession, transportInfo) {
        if (this.p2pJingleSession === jingleSession) {
            logger.info("Doing set transport-info");
            this.p2pJingleSession.addIceCandidates(transportInfo);
        }
    }

    /**
     * Manually starts new P2P session (should be used only in the tests).
     */
    startPeer2PeerSession() {
        const peers = this.getParticipants();
        // Start peer to peer session
        if (peers.length === 1) {
            const peerJid = peers[0].getJid();
            this._startPeer2PeerSession(peerJid);
        } else {
            throw new Error(
                "There must be exactly 1 participant "
                    + "to start the P2P session !");
        }
    }

    /**
     * Manually stops the current P2P session (should be used only in the tests)
     */
    stopPeer2PeerSession() {
        this._stopPeer2PeerSession();
    }
}

/**
 * This is a fake {@link ChatRoom} passed to the P2P {@link JingleSessionPC}
 * in order to capture events emitted on its event emitter (Jingle session uses
 * chat room's emitter to send events).
 */
class FakeChatRoomLayer {

    /**
     * Creates new <tt>FakeChatRoomLayer</tt>
     * @param p2pConference parent <tt>P2PEnabledConference</tt> instance
     */
    constructor(p2pConference) {

        /**
         * @type P2PEnabledConference
         */
        this.p2pConf = p2pConference;

        /**
         * See whatever docs are provided in
         * the {@link ChatRoom#connectionTimes}.
         * @type {Array}
         */
        this.connectionTimes = [];

        /**
         * Maps options of the original <tt>ChatRoom</tt>
         */
        this.options = p2pConference.room.options;
        if (!this.options) {
            logger.error("ChatRoom.options are undefined");
        }

        /**
         * Partial implementation of the <tt>EventEmitter</tt> used to intercept
         * events emitted by the P2P {@link JingleSessionPC}
         * @type {EventEmitter}
         */
        this.eventEmitter = this._createEventEmitter();
    }

    /**
     * Creates fake event emitter used to intercept some of the XMPP events
     * emitted by {@link P2PEnabledConference.p2pJingleSession}.
     * @return {EventEmitter}
     * @private
     */
    _createEventEmitter () {
        const self = this;
        return {
            emit: function (type) {
                logger.debug("Fake emit: ", type, arguments);
                switch (type) {
                    case XMPPEvents.CONNECTION_ESTABLISHED:
                        self.p2pConf._onP2PConnectionEstablished(arguments[1]);
                        break;
                    case XMPPEvents.CONNECTION_INTERRUPTED:
                        self.p2pConf.onP2PIceConnectionInterrupted();
                        break;
                    case XMPPEvents.CONNECTION_RESTORED:
                        self.p2pConf.onP2PIceConnectionRestored();
                        break;
                    case XMPPEvents.CONNECTION_ICE_FAILED:
                        self.p2pConf._stopPeer2PeerSession(
                            "connectivity-error", "ICE FAILED");
                        break;
                }
            }
        };
    }

    /**
     * Executes given <tt>callback</tt> with <tt>ChatRoom</tt> with the original
     * <tt>ChatRoom</tt> instance obtained from <tt>JitsiConference</tt>. In
     * case it's not available anymore the callback will NOT be executed.
     * @param {function(ChatRoom)} callback the function to be executed
     * @private
     */
    _forwardToChatRoom (callback) {
        const room = this.p2pConf.room;
        if (room) {
            callback(room);
        } else {
            logger.error("XMPP chat room is null");
        }
    }

    /**
     * @see SignallingLayer.addPresenceListener
     */
    addPresenceListener (name, handler) {
        // Forward to origin ChatRoom
        this._forwardToChatRoom(room => {
            room.addPresenceListener(name, handler);
        });
    }

    /**
     * @see SignallingLayer.getMediaPresenceInfo
     */
    getMediaPresenceInfo (endpointId, mediaType) {
        let result = null;
        this._forwardToChatRoom(room => {
            result = room.getMediaPresenceInfo(endpointId, mediaType);
        });
        return result;
    }

    /**
     * @see SignallingLayer.removePresenceListener
     */
    removePresenceListener (name) {
        this._forwardToChatRoom(room => room.removePresenceListener(name));
    }
}
