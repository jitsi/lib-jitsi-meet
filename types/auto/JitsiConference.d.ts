/// <reference types="node" />
/**
 * Creates a JitsiConference object with the given name and properties.
 * Note: this constructor is not a part of the public API (objects should be
 * created using JitsiConnection.createConference).
 * @param options.config properties / settings related to the conference that
 * will be created.
 * @param options.name the name of the conference
 * @param options.connection the JitsiConnection object for this
 * JitsiConference.
 * @param {number} [options.config.avgRtpStatsN=15] how many samples are to be
 * collected by {@link AvgRTPStatsReporter}, before arithmetic mean is
 * calculated and submitted to the analytics module.
 * @param {boolean} [options.config.enableIceRestart=false] - enables the ICE
 * restart logic.
 * @param {boolean} [options.config.p2p.enabled] when set to <tt>true</tt>
 * the peer to peer mode will be enabled. It means that when there are only 2
 * participants in the conference an attempt to make direct connection will be
 * made. If the connection succeeds the conference will stop sending data
 * through the JVB connection and will use the direct one instead.
 * @param {number} [options.config.p2p.backToP2PDelay=5] a delay given in
 * seconds, before the conference switches back to P2P, after the 3rd
 * participant has left the room.
 * @param {number} [options.config.channelLastN=-1] The requested amount of
 * videos are going to be delivered after the value is in effect. Set to -1 for
 * unlimited or all available videos.
 * @param {number} [options.config.forceJVB121Ratio]
 * "Math.random() < forceJVB121Ratio" will determine whether a 2 people
 * conference should be moved to the JVB instead of P2P. The decision is made on
 * the responder side, after ICE succeeds on the P2P connection.
 * @constructor
 *
 * FIXME Make all methods which are called from lib-internal classes
 *       to non-public (use _). To name a few:
 *       {@link JitsiConference.onLocalRoleChanged}
 *       {@link JitsiConference.onUserRoleChanged}
 *       {@link JitsiConference.onMemberLeft}
 *       and so on...
 */
declare function JitsiConference(options: any): void;
declare class JitsiConference {
    /**
     * Creates a JitsiConference object with the given name and properties.
     * Note: this constructor is not a part of the public API (objects should be
     * created using JitsiConnection.createConference).
     * @param options.config properties / settings related to the conference that
     * will be created.
     * @param options.name the name of the conference
     * @param options.connection the JitsiConnection object for this
     * JitsiConference.
     * @param {number} [options.config.avgRtpStatsN=15] how many samples are to be
     * collected by {@link AvgRTPStatsReporter}, before arithmetic mean is
     * calculated and submitted to the analytics module.
     * @param {boolean} [options.config.enableIceRestart=false] - enables the ICE
     * restart logic.
     * @param {boolean} [options.config.p2p.enabled] when set to <tt>true</tt>
     * the peer to peer mode will be enabled. It means that when there are only 2
     * participants in the conference an attempt to make direct connection will be
     * made. If the connection succeeds the conference will stop sending data
     * through the JVB connection and will use the direct one instead.
     * @param {number} [options.config.p2p.backToP2PDelay=5] a delay given in
     * seconds, before the conference switches back to P2P, after the 3rd
     * participant has left the room.
     * @param {number} [options.config.channelLastN=-1] The requested amount of
     * videos are going to be delivered after the value is in effect. Set to -1 for
     * unlimited or all available videos.
     * @param {number} [options.config.forceJVB121Ratio]
     * "Math.random() < forceJVB121Ratio" will determine whether a 2 people
     * conference should be moved to the JVB instead of P2P. The decision is made on
     * the responder side, after ICE succeeds on the P2P connection.
     * @constructor
     *
     * FIXME Make all methods which are called from lib-internal classes
     *       to non-public (use _). To name a few:
     *       {@link JitsiConference.onLocalRoleChanged}
     *       {@link JitsiConference.onUserRoleChanged}
     *       {@link JitsiConference.onMemberLeft}
     *       and so on...
     */
    constructor(options: any);
    connection: any;
    xmpp: any;
    eventEmitter: EventEmitter;
    options: any;
    eventManager: JitsiConferenceEventManager;
    participants: {};
    /**
     * The signaling layer instance.
     * @type {SignalingLayerImpl}
     * @private
     */
    private _signalingLayer;
    componentsVersions: ComponentsVersions;
    /**
     * Jingle session instance for the JVB connection.
     * @type {JingleSessionPC}
     */
    jvbJingleSession: any;
    lastDominantSpeaker: any;
    dtmfManager: any;
    somebodySupportsDTMF: boolean;
    authEnabled: boolean;
    startAudioMuted: boolean;
    startVideoMuted: boolean;
    startMutedPolicy: {
        audio: boolean;
        video: boolean;
    };
    isMutedByFocus: boolean;
    mutedByFocusActor: any;
    isVideoMutedByFocus: boolean;
    mutedVideoByFocusActor: any;
    wasStopped: boolean;
    properties: {};
    /**
     * The object which monitors local and remote connection statistics (e.g.
     * sending bitrate) and calculates a number which represents the connection
     * quality.
     */
    connectionQuality: ConnectionQuality;
    /**
     * Reports average RTP statistics to the analytics module.
     * @type {AvgRTPStatsReporter}
     */
    avgRtpStatsReporter: AvgRTPStatsReporter;
    _audioOutputProblemDetector: AudioOutputProblemDetector;
    /**
     * Indicates whether the connection is interrupted or not.
     */
    isJvbConnectionInterrupted: boolean;
    /**
     * The object which tracks active speaker times
     */
    speakerStatsCollector: SpeakerStatsCollector;
    /**
     * Stores reference to deferred start P2P task. It's created when 3rd
     * participant leaves the room in order to avoid ping pong effect (it
     * could be just a page reload).
     * @type {number|null}
     */
    deferredStartP2PTask: number | null;
    /**
     * A delay given in seconds, before the conference switches back to P2P
     * after the 3rd participant has left.
     * @type {number}
     */
    backToP2PDelay: number;
    /**
     * If set to <tt>true</tt> it means the P2P ICE is no longer connected.
     * When <tt>false</tt> it means that P2P ICE (media) connection is up
     * and running.
     * @type {boolean}
     */
    isP2PConnectionInterrupted: boolean;
    /**
     * Flag set to <tt>true</tt> when P2P session has been established
     * (ICE has been connected) and this conference is currently in the peer to
     * peer mode (P2P connection is the active one).
     * @type {boolean}
     */
    p2p: boolean;
    /**
     * A JingleSession for the direct peer to peer connection.
     * @type {JingleSessionPC}
     */
    p2pJingleSession: any;
    videoSIPGWHandler: VideoSIPGW;
    recordingManager: RecordingManager;
    /**
     * If the conference.joined event has been sent this will store the timestamp when it happened.
     *
     * @type {undefined|number}
     * @private
     */
    private _conferenceJoinAnalyticsEventSent;
    _e2eEncryption: E2EEncryption;
    /**
     * Flag set to <tt>true</tt> when Jicofo sends a presence message indicating that the max audio sender limit has
     * been reached for the call. Once this is set, unmuting audio will be disabled from the client until it gets reset
     * again by Jicofo.
     */
    _audioSenderLimitReached: any;
    /**
     * Flag set to <tt>true</tt> when Jicofo sends a presence message indicating that the max video sender limit has
     * been reached for the call. Once this is set, unmuting video will be disabled from the client until it gets reset
     * again by Jicofo.
     */
    _videoSenderLimitReached: any;
    constructor: typeof JitsiConference;
    /**
     * Initializes the conference object properties
     * @param options {object}
     * @param options.connection {JitsiConnection} overrides this.connection
     */
    _init(options?: {
        connection: any;
    }): void;
    codecSelection: CodecSelection;
    _statsCurrentId: any;
    room: any;
    _onIceConnectionInterrupted: any;
    _onIceConnectionRestored: any;
    _onIceConnectionEstablished: any;
    _updateProperties: any;
    _sendConferenceJoinAnalyticsEvent: any;
    _removeLocalSourceOnReject: any;
    _updateRoomPresence: any;
    e2eping: E2ePing;
    rtc: RTC;
    receiveVideoController: ReceiveVideoController;
    sendVideoController: SendVideoController;
    participantConnectionStatus: ParticipantConnectionStatusHandler;
    statistics: Statistics;
    _audioAnalyser: VADAudioAnalyser;
    _noAudioSignalDetection: NoAudioSignalDetection;
    /**
     * Emits {@link JitsiConferenceEvents.JVB121_STATUS}.
     * @type {Jvb121EventGenerator}
     */
    jvb121Status: Jvb121EventGenerator;
    p2pDominantSpeakerDetection: P2PDominantSpeakerDetection;
    /**
     * Joins the conference.
     * @param password {string} the password
     * @param replaceParticipant {boolean} whether the current join replaces
     * an existing participant with same jwt from the meeting.
     */
    join(password: string, replaceParticipant?: boolean): void;
    /**
     * Authenticates and upgrades the role of the local participant/user.
     *
     * @returns {Object} A <tt>thenable</tt> which (1) settles when the process of
     * authenticating and upgrading the role of the local participant/user finishes
     * and (2) has a <tt>cancel</tt> method that allows the caller to interrupt the
     * process.
     */
    authenticateAndUpgradeRole(options: any): any;
    /**
     * Check if joined to the conference.
     */
    isJoined(): any;
    /**
     * Tells whether or not the P2P mode is enabled in the configuration.
     * @return {boolean}
     */
    isP2PEnabled(): boolean;
    /**
     * When in P2P test mode, the conference will not automatically switch to P2P
     * when there 2 participants.
     * @return {boolean}
     */
    isP2PTestModeEnabled(): boolean;
    /**
     * Leaves the conference.
     * @returns {Promise}
     */
    leave(): Promise<any>;
    /**
     * Returns the currently active media session if any.
     *
     * @returns {JingleSessionPC|undefined}
     */
    getActiveMediaSession(): any | undefined;
    /**
     * Returns an array containing all media sessions existing in this conference.
     *
     * @returns {Array<JingleSessionPC>}
     */
    getMediaSessions(): Array<any>;
    private _registerRtcListeners;
    private _sendBridgeVideoTypeMessage;
    /**
     * Returns name of this conference.
     */
    getName(): any;
    /**
     * Returns the {@link JitsiConnection} used by this this conference.
     */
    getConnection(): any;
    /**
     * Check if authentication is enabled for this conference.
     */
    isAuthEnabled(): boolean;
    /**
     * Check if user is logged in.
     */
    isLoggedIn(): boolean;
    /**
     * Get authorized login.
     */
    getAuthLogin(): any;
    /**
     * Check if external authentication is enabled for this conference.
     */
    isExternalAuthEnabled(): any;
    /**
     * Get url for external authentication.
     * @param {boolean} [urlForPopup] if true then return url for login popup,
     *                                else url of login page.
     * @returns {Promise}
     */
    getExternalAuthUrl(urlForPopup?: boolean): Promise<any>;
    /**
     * Returns the local tracks of the given media type, or all local tracks if no
     * specific type is given.
     * @param {MediaType} [mediaType] Optional media type (audio or video).
     */
    getLocalTracks(mediaType?: MediaType): any[];
    /**
     * Obtains local audio track.
     * @return {JitsiLocalTrack|null}
     */
    getLocalAudioTrack(): any | null;
    /**
     * Obtains local video track.
     * @return {JitsiLocalTrack|null}
     */
    getLocalVideoTrack(): any | null;
    /**
     * Returns all the local video tracks.
     * @returns {Array<JitsiLocalTrack>}
     */
    getLocalVideoTracks(): Array<any>;
    /**
     * Obtains the performance statistics.
     * @returns {Object|null}
     */
    getPerformanceStats(): any | null;
    /**
     * Attaches a handler for events(For example - "participant joined".) in the
     * conference. All possible event are defined in JitsiConferenceEvents.
     * @param eventId the event ID.
     * @param handler handler for the event.
     *
     * Note: consider adding eventing functionality by extending an EventEmitter
     * impl, instead of rolling ourselves
     */
    on(eventId: any, handler: any): void;
    /**
     * Removes event listener
     * @param eventId the event ID.
     * @param [handler] optional, the specific handler to unbind
     *
     * Note: consider adding eventing functionality by extending an EventEmitter
     * impl, instead of rolling ourselves
     */
    off(eventId: any, handler?: any): void;
    addEventListener: any;
    removeEventListener: any;
    /**
     * Receives notifications from other participants about commands / custom events
     * (sent by sendCommand or sendCommandOnce methods).
     * @param command {String} the name of the command
     * @param handler {Function} handler for the command
     */
    addCommandListener(command: string, handler: Function): void;
    /**
      * Removes command  listener
      * @param command {String} the name of the command
      * @param handler {Function} handler to remove for the command
      */
    removeCommandListener(command: string, handler: Function): void;
    /**
     * Sends text message to the other participants in the conference
     * @param message the text message.
     * @param elementName the element name to encapsulate the message.
     * @deprecated Use 'sendMessage' instead. TODO: this should be private.
     */
    sendTextMessage(message: any, elementName?: string): void;
    /**
     * Send private text message to another participant of the conference
     * @param id the id of the participant to send a private message.
     * @param message the text message.
     * @param elementName the element name to encapsulate the message.
     * @deprecated Use 'sendMessage' instead. TODO: this should be private.
     */
    sendPrivateTextMessage(id: any, message: any, elementName?: string): void;
    /**
     * Send presence command.
     * @param name {String} the name of the command.
     * @param values {Object} with keys and values that will be sent.
     **/
    sendCommand(name: string, values: any): void;
    /**
     * Send presence command one time.
     * @param name {String} the name of the command.
     * @param values {Object} with keys and values that will be sent.
     **/
    sendCommandOnce(name: string, values: any): void;
    /**
     * Removes presence command.
     * @param name {String} the name of the command.
     **/
    removeCommand(name: string): void;
    /**
     * Sets the display name for this conference.
     * @param name the display name to set
     */
    setDisplayName(name: any): void;
    /**
     * Set new subject for this conference. (available only for moderator)
     * @param {string} subject new subject
     */
    setSubject(subject: string): void;
    /**
     * Get a transcriber object for all current participants in this conference
     * @return {Transcriber} the transcriber object
     */
    getTranscriber(): Transcriber;
    transcriber: Transcriber;
    /**
     * Returns the transcription status.
     *
     * @returns {String} "on" or "off".
     */
    getTranscriptionStatus(): string;
    /**
     * Adds JitsiLocalTrack object to the conference.
     * @param {JitsiLocalTrack} track the JitsiLocalTrack object.
     * @returns {Promise<JitsiLocalTrack>}
     * @throws {Error} if the specified track is a video track and there is already
     * another video track in the conference.
     */
    addTrack(track: any): Promise<any>;
    /**
     * Fires TRACK_AUDIO_LEVEL_CHANGED change conference event (for local tracks).
     * @param {number} audioLevel the audio level
     * @param {TraceablePeerConnection} [tpc]
     */
    _fireAudioLevelChangeEvent(audioLevel: number, tpc?: any): void;
    /**
     * Fires TRACK_MUTE_CHANGED change conference event.
     * @param track the JitsiTrack object related to the event.
     */
    _fireMuteChangeEvent(track: any): void;
    /**
     * Returns the list of local tracks that need to be added to the peerconnection on join.
     * This takes the startAudioMuted/startVideoMuted flags into consideration since we do not
     * want to add the tracks if the user joins the call audio/video muted. The tracks will be
     * added when the user unmutes for the first time.
     * @returns {Array<JitsiLocalTrack>} - list of local tracks that are unmuted.
     */
    _getInitialLocalTracks(): Array<any>;
    /**
     * Clear JitsiLocalTrack properties and listeners.
     * @param track the JitsiLocalTrack object.
     */
    onLocalTrackRemoved(track: any): void;
    /**
     * Removes JitsiLocalTrack from the conference and performs
     * a new offer/answer cycle.
     * @param {JitsiLocalTrack} track
     * @returns {Promise}
     */
    removeTrack(track: any): Promise<any>;
    /**
     * Replaces oldTrack with newTrack and performs a single offer/answer
     *  cycle after both operations are done.  Either oldTrack or newTrack
     *  can be null; replacing a valid 'oldTrack' with a null 'newTrack'
     *  effectively just removes 'oldTrack'
     * @param {JitsiLocalTrack} oldTrack the current stream in use to be replaced
     * @param {JitsiLocalTrack} newTrack the new stream to use
     * @returns {Promise} resolves when the replacement is finished
     */
    replaceTrack(oldTrack: any, newTrack: any): Promise<any>;
    private _doReplaceTrack;
    /**
     * Operations related to creating a new track
     * @param {JitsiLocalTrack} newTrack the new track being created
     */
    _setupNewTrack(newTrack: any): void;
    private _setNewVideoType;
    private _setTrackMuteStatus;
    /**
     * Method called by the {@link JitsiLocalTrack} (a video one) in order to add
     * back the underlying WebRTC MediaStream to the PeerConnection (which has
     * removed on video mute).
     * @param {JitsiLocalTrack} track the local track that will be added as part of
     * the unmute operation.
     * @return {Promise} resolved when the process is done or rejected with a string
     * which describes the error.
     */
    _addLocalTrackAsUnmute(track: any): Promise<any>;
    /**
     * Method called by the {@link JitsiLocalTrack} (a video one) in order to remove
     * the underlying WebRTC MediaStream from the PeerConnection. The purpose of
     * that is to stop sending any data and turn off the HW camera device.
     * @param {JitsiLocalTrack} track the local track that will be removed.
     * @return {Promise}
     */
    _removeLocalTrackAsMute(track: any): Promise<any>;
    /**
     * Get role of the local user.
     * @returns {string} user role: 'moderator' or 'none'
     */
    getRole(): string;
    /**
     * Returns whether or not the current conference has been joined as a hidden
     * user.
     *
     * @returns {boolean|null} True if hidden, false otherwise. Will return null if
     * no connection is active.
     */
    isHidden(): boolean | null;
    /**
     * Check if local user is moderator.
     * @returns {boolean|null} true if local user is moderator, false otherwise. If
     * we're no longer in the conference room then <tt>null</tt> is returned.
     */
    isModerator(): boolean | null;
    /**
     * Set password for the room.
     * @param {string} password new password for the room.
     * @returns {Promise}
     */
    lock(password: string): Promise<any>;
    /**
     * Remove password from the room.
     * @returns {Promise}
     */
    unlock(): Promise<any>;
    /**
     * Elects the participant with the given id to be the selected participant in
     * order to receive higher video quality (if simulcast is enabled).
     * Or cache it if channel is not created and send it once channel is available.
     * @param participantId the identifier of the participant
     * @throws NetworkError or InvalidStateError or Error if the operation fails.
     * @returns {void}
     */
    selectParticipant(participantId: any): void;
    selectParticipants(participantIds: any): void;
    /**
     * Obtains the current value for "lastN". See {@link setLastN} for more info.
     * @returns {number}
     */
    getLastN(): number;
    /**
     * Obtains the forwarded sources list in this conference.
     * @return {Array<string>|null}
     */
    getForwardedSources(): Array<string> | null;
    /**
     * Selects a new value for "lastN". The requested amount of videos are going
     * to be delivered after the value is in effect. Set to -1 for unlimited or
     * all available videos.
     * @param lastN the new number of videos the user would like to receive.
     * @throws Error or RangeError if the given value is not a number or is smaller
     * than -1.
     */
    setLastN(lastN: any): void;
    /**
     * Checks if the participant given by participantId is currently included in
     * the last N.
     * @param {string} participantId the identifier of the participant we would
     * like to check.
     * @return {boolean} true if the participant with id is in the last N set or
     * if there's no last N set, false otherwise.
     * @deprecated this method should never be used to figure out the UI, but
     * {@link ParticipantConnectionStatus} should be used instead.
     */
    isInLastN(participantId: string): boolean;
    /**
     * @return Array<JitsiParticipant> an array of all participants in this
     * conference.
     */
    getParticipants(): any[];
    /**
     * Returns the number of participants in the conference, including the local
     * participant.
     * @param countHidden {boolean} Whether or not to include hidden participants
     * in the count. Default: false.
     **/
    getParticipantCount(countHidden?: boolean): number;
    /**
     * @returns {JitsiParticipant} the participant in this conference with the
     * specified id (or undefined if there isn't one).
     * @param id the id of the participant.
     */
    getParticipantById(id: any): JitsiParticipant;
    /**
     * Grant owner rights to the participant.
     * @param {string} id id of the participant to grant owner rights to.
     */
    grantOwner(id: string): void;
    /**
     * Revoke owner rights to the participant or local Participant as
     * the user might want to refuse to be a moderator.
     * @param {string} id id of the participant to revoke owner rights to.
     */
    revokeOwner(id: string): void;
    /**
     * Kick participant from this conference.
     * @param {string} id id of the participant to kick
     * @param {string} reason reason of the participant to kick
     */
    kickParticipant(id: string, reason: string): void;
    private _maybeClearSITimeout;
    _sessionInitiateTimeout: any;
    private _maybeSetSITimeout;
    /**
     * Mutes a participant.
     * @param {string} id The id of the participant to mute.
     */
    muteParticipant(id: string, mediaType: any): void;
    /**
     * Notifies this JitsiConference that a new member has joined its chat room.
     *
     * FIXME This should NOT be exposed!
     *
     * @param jid the jid of the participant in the MUC
     * @param nick the display name of the participant
     * @param role the role of the participant in the MUC
     * @param isHidden indicates if this is a hidden participant (system
     * participant for example a recorder).
     * @param statsID the participant statsID (optional)
     * @param status the initial status if any
     * @param identity the member identity, if any
     * @param botType the member botType, if any
     * @param fullJid the member full jid, if any
     * @param features the member botType, if any
     * @param isReplaceParticipant whether this join replaces a participant with
     * the same jwt.
     */
    onMemberJoined(jid: any, nick: any, role: any, isHidden: any, statsID: any, status: any, identity: any, botType: any, fullJid: any, features: any, isReplaceParticipant: any): void;
    private _onMucJoined;
    private _updateFeatures;
    private _onMemberBotTypeChanged;
    onMemberLeft(jid: any): void;
    /**
     * Designates an event indicating that we were kicked from the XMPP MUC.
     * @param {boolean} isSelfPresence - whether it is for local participant
     * or another participant.
     * @param {string} actorId - the id of the participant who was initiator
     * of the kick.
     * @param {string?} kickedParticipantId - when it is not a kick for local participant,
     * this is the id of the participant which was kicked.
     * @param {string} reason - reason of the participant to kick
     * @param {boolean?} isReplaceParticipant - whether this is a server initiated kick in order
     * to replace it with a participant with same jwt.
     */
    onMemberKicked(isSelfPresence: boolean, actorId: string, kickedParticipantId: string | null, reason: string, isReplaceParticipant: boolean | null): void;
    /**
     * Method called on local MUC role change.
     * @param {string} role the name of new user's role as defined by XMPP MUC.
     */
    onLocalRoleChanged(role: string): void;
    onUserRoleChanged(jid: any, role: any): void;
    onDisplayNameChanged(jid: any, displayName: any): void;
    /**
     * Notifies this JitsiConference that a JitsiRemoteTrack was added to the conference.
     *
     * @param {JitsiRemoteTrack} track the JitsiRemoteTrack which was added to this JitsiConference.
     */
    onRemoteTrackAdded(track: any): void;
    /**
     * Callback called by the Jingle plugin when 'session-answer' is received.
     * @param {JingleSessionPC} session the Jingle session for which an answer was
     * received.
     * @param {jQuery} answer a jQuery selector pointing to 'jingle' IQ element
     */
    onCallAccepted(session: any, answer: any): void;
    /**
     * Callback called by the Jingle plugin when 'transport-info' is received.
     * @param {JingleSessionPC} session the Jingle session for which the IQ was
     * received
     * @param {jQuery} transportInfo a jQuery selector pointing to 'jingle' IQ
     * element
     */
    onTransportInfo(session: any, transportInfo: any): void;
    /**
     * Notifies this JitsiConference that a JitsiRemoteTrack was removed from
     * the conference.
     *
     * @param {JitsiRemoteTrack} removedTrack
     */
    onRemoteTrackRemoved(removedTrack: any): void;
    /**
     * Handles an incoming call event for the P2P jingle session.
     */
    _onIncomingCallP2P(jingleSession: any, jingleOffer: any): void;
    /**
     * Handles an incoming call event.
     */
    onIncomingCall(jingleSession: any, jingleOffer: any, now: any): void;
    /**
     * Accepts an incoming call event for the JVB jingle session.
     */
    _acceptJvbIncomingCall(jingleSession: any, jingleOffer: any, now: any): void;
    /**
     * Sets the BridgeChannel.
     *
     * @param {jQuery} offerIq a jQuery selector pointing to the jingle element of
     * the offer IQ which may carry the WebSocket URL for the 'websocket'
     * BridgeChannel mode.
     * @param {TraceablePeerConnection} pc the peer connection which will be used
     * to listen for new WebRTC Data Channels (in the 'datachannel' mode).
     */
    _setBridgeChannel(offerIq: any, pc: any): void;
    private _rejectIncomingCall;
    /**
     * Handles the call ended event.
     * XXX is this due to the remote side terminating the Jingle session?
     *
     * @param {JingleSessionPC} jingleSession the jingle session which has been
     * terminated.
     * @param {String} reasonCondition the Jingle reason condition.
     * @param {String|null} reasonText human readable reason text which may provide
     * more details about why the call has been terminated.
     */
    onCallEnded(jingleSession: any, reasonCondition: string, reasonText: string | null): void;
    /**
     * Handles the suspend detected event. Leaves the room and fires suspended.
     * @param {JingleSessionPC} jingleSession
     */
    onSuspendDetected(jingleSession: any): void;
    updateDTMFSupport(): void;
    /**
     * Allows to check if there is at least one user in the conference
     * that supports DTMF.
     * @returns {boolean} true if somebody supports DTMF, false otherwise
     */
    isDTMFSupported(): boolean;
    /**
     * Returns the local user's ID
     * @return {string} local user's ID
     */
    myUserId(): string;
    sendTones(tones: any, duration: any, pause: any): void;
    /**
     * Starts recording the current conference.
     *
     * @param {Object} options - Configuration for the recording. See
     * {@link Chatroom#startRecording} for more info.
     * @returns {Promise} See {@link Chatroom#startRecording} for more info.
     */
    startRecording(options: any): Promise<any>;
    /**
     * Stop a recording session.
     *
     * @param {string} sessionID - The ID of the recording session that
     * should be stopped.
     * @returns {Promise} See {@link Chatroom#stopRecording} for more info.
     */
    stopRecording(sessionID: string): Promise<any>;
    /**
     * Returns true if the SIP calls are supported and false otherwise
     */
    isSIPCallingSupported(): any;
    /**
     * Dials a number.
     * @param number the number
     */
    dial(number: any): any;
    /**
     * Hangup an existing call
     */
    hangup(): any;
    /**
     * Starts the transcription service.
     */
    startTranscriber(): any;
    /**
     * Stops the transcription service.
     */
    stopTranscriber: any;
    /**
     * Returns the phone number for joining the conference.
     */
    getPhoneNumber(): any;
    /**
     * Returns the pin for joining the conference with phone.
     */
    getPhonePin(): any;
    /**
     * Returns the meeting unique ID if any.
     *
     * @returns {string|undefined}
     */
    getMeetingUniqueId(): string | undefined;
    /**
     * Will return P2P or JVB <tt>TraceablePeerConnection</tt> depending on
     * which connection is currently active.
     *
     * @return {TraceablePeerConnection|null} null if there isn't any active
     * <tt>TraceablePeerConnection</tt> currently available.
     * @public (FIXME how to make package local ?)
     */
    public getActivePeerConnection(): any | null;
    /**
     * Returns the connection state for the current room. Its ice connection state
     * for its session.
     * NOTE that "completed" ICE state which can appear on the P2P connection will
     * be converted to "connected".
     * @return {string|null} ICE state name or <tt>null</tt> if there is no active
     * peer connection at this time.
     */
    getConnectionState(): string | null;
    /**
     * Make all new participants mute their audio/video on join.
     * @param policy {Object} object with 2 boolean properties for video and audio:
     * @param {boolean} audio if audio should be muted.
     * @param {boolean} video if video should be muted.
     */
    setStartMutedPolicy(policy: any): void;
    /**
     * Returns current start muted policy
     * @returns {Object} with 2 properties - audio and video.
     */
    getStartMutedPolicy(): any;
    /**
     * Check if audio is muted on join.
     */
    isStartAudioMuted(): boolean;
    /**
     * Check if video is muted on join.
     */
    isStartVideoMuted(): boolean;
    /**
     * Returns measured connectionTimes.
     */
    getConnectionTimes(): any;
    /**
     * Sets a property for the local participant.
     */
    setLocalParticipantProperty(name: any, value: any): void;
    /**
     *  Removes a property for the local participant and sends the updated presence.
     */
    removeLocalParticipantProperty(name: any): void;
    /**
     * Gets a local participant property.
     *
     * @return value of the local participant property if the tagName exists in the
     * list of properties, otherwise returns undefined.
     */
    getLocalParticipantProperty(name: any): any;
    /**
     * Sends the given feedback through CallStats if enabled.
     *
     * @param overallFeedback an integer between 1 and 5 indicating the
     * user feedback
     * @param detailedFeedback detailed feedback from the user. Not yet used
     * @returns {Promise} Resolves if feedback is submitted successfully.
     */
    sendFeedback(overallFeedback: any, detailedFeedback: any): Promise<any>;
    /**
     * Returns true if the callstats integration is enabled, otherwise returns
     * false.
     *
     * @returns true if the callstats integration is enabled, otherwise returns
     * false.
     */
    isCallstatsEnabled(): boolean;
    /**
     * Finds the SSRC of a given track
     *
     * @param track
     * @returns {number|undefined} the SSRC of the specificed track, otherwise undefined.
     */
    getSsrcByTrack(track: any): number | undefined;
    /**
     * Handles track attached to container (Calls associateStreamWithVideoTag method
     * from statistics module)
     * @param {JitsiLocalTrack|JitsiRemoteTrack} track the track
     * @param container the container
     */
    _onTrackAttach(track: any | any, container: any): void;
    /**
     * Logs an "application log" message.
     * @param message {string} The message to log. Note that while this can be a
     * generic string, the convention used by lib-jitsi-meet and jitsi-meet is to
     * log valid JSON strings, with an "id" field used for distinguishing between
     * message types. E.g.: {id: "recorder_status", status: "off"}
     */
    sendApplicationLog(message: string): void;
    /**
     * Checks if the user identified by given <tt>mucJid</tt> is the conference focus.
     * @param mucJid the full MUC address of the user to be checked.
     * @returns {boolean|null} <tt>true</tt> if MUC user is the conference focus,
     * <tt>false</tt> when is not. <tt>null</tt> if we're not in the MUC anymore and
     * are unable to figure out the status or if given <tt>mucJid</tt> is invalid.
     */
    isFocus(mucJid: any): boolean | null;
    /**
     * Fires CONFERENCE_FAILED event with INCOMPATIBLE_SERVER_VERSIONS parameter
     */
    _fireIncompatibleVersionsEvent(): void;
    /**
     * Sends a message via the data channel.
     * @param to {string} the id of the endpoint that should receive the message.
     * If "" the message will be sent to all participants.
     * @param payload {object} the payload of the message.
     * @throws NetworkError or InvalidStateError or Error if the operation fails.
     * @deprecated Use 'sendMessage' instead. TODO: this should be private.
     */
    sendEndpointMessage(to: string, payload: object): void;
    /**
     * Sends local stats via the bridge channel which then forwards to other endpoints selectively.
     * @param {Object} payload The payload of the message.
     * @throws NetworkError/InvalidStateError/Error if the operation fails or if there is no data channel created.
     */
    sendEndpointStatsMessage(payload: any): void;
    /**
     * Sends a broadcast message via the data channel.
     * @param payload {object} the payload of the message.
     * @throws NetworkError or InvalidStateError or Error if the operation fails.
     * @deprecated Use 'sendMessage' instead. TODO: this should be private.
     */
    broadcastEndpointMessage(payload: object): void;
    /**
     * Sends a message to a given endpoint (if 'to' is a non-empty string), or
     * broadcasts it to all endpoints in the conference.
     * @param {string} to The ID of the endpoint/participant which is to receive
     * the message, or '' to broadcast the message to all endpoints in the
     * conference.
     * @param {string|object} message the message to send. If this is of type
     * 'string' it will be sent as a chat message. If it is of type 'object', it
     * will be encapsulated in a format recognized by jitsi-meet and converted to
     * JSON before being sent.
     * @param {boolean} sendThroughVideobridge Whether to send the message through
     * jitsi-videobridge (via the COLIBRI data channel or web socket), or through
     * the XMPP MUC. Currently only objects can be sent through jitsi-videobridge.
     */
    sendMessage(message: string | object, to?: string, sendThroughVideobridge?: boolean): void;
    isConnectionInterrupted(): boolean;
    private _onConferenceRestarted;
    private _onIceConnectionFailed;
    _delayedIceFailed: IceFailedHandling;
    private _acceptP2PIncomingCall;
    private _addRemoteJVBTracks;
    private _addRemoteP2PTracks;
    private _addRemoteTracks;
    p2pEstablishmentDuration: any;
    jvbEstablishmentDuration: any;
    /**
     * Gets a conference property with a given key.
     *
     * @param {string} key - The key.
     * @returns {*} The value
     */
    getProperty(key: string): any;
    private _maybeClearDeferredStartP2P;
    private _removeRemoteJVBTracks;
    private _removeRemoteP2PTracks;
    private _removeRemoteTracks;
    private _resumeMediaTransferForJvbConnection;
    private _setP2PStatus;
    private _startP2PSession;
    private _suspendMediaTransferForJvbConnection;
    private _maybeStartOrStopP2P;
    private _shouldBeInP2PMode;
    private _stopP2PSession;
    /**
     * Checks whether or not the conference is currently in the peer to peer mode.
     * Being in peer to peer mode means that the direct connection has been
     * established and the P2P connection is being used for media transmission.
     * @return {boolean} <tt>true</tt> if in P2P mode or <tt>false</tt> otherwise.
     */
    isP2PActive(): boolean;
    /**
     * Returns the current ICE state of the P2P connection.
     * NOTE: method is used by the jitsi-meet-torture tests.
     * @return {string|null} an ICE state or <tt>null</tt> if there's currently
     * no P2P connection.
     */
    getP2PConnectionState(): string | null;
    /**
     * Configures the peerconnection so that a given framre rate can be achieved for desktop share.
     *
     * @param {number} maxFps The capture framerate to be used for desktop tracks.
     * @returns {boolean} true if the operation is successful, false otherwise.
     */
    setDesktopSharingFrameRate(maxFps: number): boolean;
    _desktopSharingFrameRate: number;
    /**
     * Manually starts new P2P session (should be used only in the tests).
     */
    startP2PSession(): void;
    /**
     * Manually stops the current P2P session (should be used only in the tests).
     */
    stopP2PSession(options: any): void;
    /**
     * Get a summary of how long current participants have been the dominant speaker
     * @returns {object}
     */
    getSpeakerStats(): object;
    /**
     * Sends a face landmarks object to the xmpp server.
     * @param {Object} payload
     */
    sendFaceLandmarks(payload: any): void;
    /**
     * Sets the constraints for the video that is requested from the bridge.
     *
     * @param {Object} videoConstraints The constraints which are specified in the
     * following format. The message updates the fields that are present and leaves the
     * rest unchanged on the bridge. Therefore, any field that is not applicable anymore
     * should be cleared by passing an empty object or list (whatever is applicable).
     * {
     *      'lastN': 20,
     *      'selectedEndpoints': ['A', 'B', 'C'],
     *      'onStageEndpoints': ['A'],
     *      'defaultConstraints': { 'maxHeight': 180 },
     *      'constraints': {
     *          'A': { 'maxHeight': 720 }
     *      }
     * }
     */
    setReceiverConstraints(videoConstraints: any): void;
    /**
     * Sets the maximum video size the local participant should receive from remote
     * participants.
     *
     * @param {number} maxFrameHeight - the maximum frame height, in pixels,
     * this receiver is willing to receive.
     * @returns {void}
     */
    setReceiverVideoConstraint(maxFrameHeight: number): void;
    /**
     * Sets the maximum video size the local participant should send to remote
     * participants.
     * @param {number} maxFrameHeight - The user preferred max frame height.
     * @returns {Promise} promise that will be resolved when the operation is
     * successful and rejected otherwise.
     */
    setSenderVideoConstraint(maxFrameHeight: number): Promise<any>;
    /**
     * Creates a video SIP GW session and returns it if service is enabled. Before
     * creating a session one need to check whether video SIP GW service is
     * available in the system {@link JitsiConference.isVideoSIPGWAvailable}. Even
     * if there are available nodes to serve this request, after creating the
     * session those nodes can be taken and the request about using the
     * created session can fail.
     *
     * @param {string} sipAddress - The sip address to be used.
     * @param {string} displayName - The display name to be used for this session.
     * @returns {JitsiVideoSIPGWSession|Error} Returns null if conference is not
     * initialised and there is no room.
     */
    createVideoSIPGWSession(sipAddress: string, displayName: string): any | Error;
    private _sendConferenceLeftAnalyticsEvent;
    /**
     * Restarts all active media sessions.
     *
     * @returns {void}
     */
    _restartMediaSessions(): void;
    /**
     * Returns whether End-To-End encryption is enabled.
     *
     * @returns {boolean}
     */
    isE2EEEnabled(): boolean;
    /**
     * Returns whether End-To-End encryption is supported. Note that not all participants
     * in the conference may support it.
     *
     * @returns {boolean}
     */
    isE2EESupported(): boolean;
    /**
     * Enables / disables End-to-End encryption.
     *
     * @param {boolean} enabled whether to enable E2EE or not.
     * @returns {void}
     */
    toggleE2EE(enabled: boolean): void;
    /**
     * Sets the key and index for End-to-End encryption.
     *
     * @param {CryptoKey} [keyInfo.encryptionKey] - encryption key.
     * @param {Number} [keyInfo.index] - the index of the encryption key.
     * @returns {void}
     */
    setMediaEncryptionKey(keyInfo: any): void;
    /**
     * Returns <tt>true</tt> if lobby support is enabled in the backend.
     *
     * @returns {boolean} whether lobby is supported in the backend.
     */
    isLobbySupported(): boolean;
    /**
     * Returns <tt>true</tt> if the room has members only enabled.
     *
     * @returns {boolean} whether conference room is members only.
     */
    isMembersOnly(): boolean;
    /**
     * Enables lobby by moderators
     *
     * @returns {Promise} resolves when lobby room is joined or rejects with the error.
     */
    enableLobby(): Promise<any>;
    /**
     * Disabled lobby by moderators
     *
     * @returns {void}
     */
    disableLobby(): void;
    /**
     * Joins the lobby room with display name and optional email or with a shared password to skip waiting.
     *
     * @param {string} displayName Display name should be set to show it to moderators.
     * @param {string} email Optional email is used to present avatar to the moderator.
     * @returns {Promise<never>}
     */
    joinLobby(displayName: string, email: string): Promise<never>;
    /**
     * Gets the local id for a participant in a lobby room.
     * Returns undefined when current participant is not in the lobby room.
     * This is used for lobby room private chat messages.
     *
     * @returns {string}
     */
    myLobbyUserId(): string;
    /**
     * Sends a message to a lobby room.
     * When id is specified it sends a private message.
     * Otherwise it sends the message to all moderators.
     * @param {message} Object The message to send
     * @param {string} id The participant id.
     *
     * @returns {void}
     */
    sendLobbyMessage(message: any, id: string): void;
    /**
     * Adds a message listener to the lobby room
     * @param {Function} listener The listener function,
     * called when a new message is received in the lobby room.
     *
     * @returns {Function} Handler returned to be able to remove it later.
     */
    addLobbyMessageListener(listener: Function): Function;
    /**
     * Removes a message handler from the lobby room
     * @param {Function} handler The handler function  to remove.
     *
     * @returns {void}
     */
    removeLobbyMessageHandler(handler: Function): void;
    /**
     * Denies an occupant in the lobby room access to the conference.
     * @param {string} id The participant id.
     */
    lobbyDenyAccess(id: string): void;
    /**
     * Approves the request to join the conference to a participant waiting in the lobby.
     *
     * @param {string} id The participant id.
     */
    lobbyApproveAccess(id: string): void;
    /**
     * Returns <tt>true</tt> if AV Moderation support is enabled in the backend.
     *
     * @returns {boolean} whether AV Moderation is supported in the backend.
     */
    isAVModerationSupported(): boolean;
    /**
     * Enables AV Moderation.
     * @param {MediaType} mediaType "audio" or "video"
     */
    enableAVModeration(mediaType: MediaType): void;
    /**
     * Disables AV Moderation.
     * @param {MediaType} mediaType "audio" or "video"
     */
    disableAVModeration(mediaType: MediaType): void;
    /**
     * Approve participant access to certain media, allows unmuting audio or video.
     *
     * @param {MediaType} mediaType "audio" or "video"
     * @param id the id of the participant.
     */
    avModerationApprove(mediaType: MediaType, id: any): void;
    /**
     * Reject participant access to certain media, blocks unmuting audio or video.
     *
     * @param {MediaType} mediaType "audio" or "video"
     * @param id the id of the participant.
     */
    avModerationReject(mediaType: MediaType, id: any): void;
    /**
     * Returns the breakout rooms manager object.
     *
     * @returns {Object} the breakout rooms manager.
     */
    getBreakoutRooms(): any;
}
declare namespace JitsiConference {
    /**
     * Create a resource for the a jid. We use the room nickname (the resource part
     * of the occupant JID, see XEP-0045) as the endpoint ID in colibri. We require
     * endpoint IDs to be 8 hex digits because in some cases they get serialized
     * into a 32bit field.
     *
     * @param {string} jid - The id set onto the XMPP connection.
     * @param {boolean} isAuthenticatedUser - Whether or not the user has connected
     * to the XMPP service with a password.
     * @returns {string}
     * @static
     */
    function resourceCreator(jid: string, isAuthenticatedUser: boolean): string;
}
export default JitsiConference;
import EventEmitter from "events";
import JitsiConferenceEventManager from "./JitsiConferenceEventManager";
import ComponentsVersions from "./modules/version/ComponentsVersions";
import ConnectionQuality from "./modules/connectivity/ConnectionQuality";
import AvgRTPStatsReporter from "./modules/statistics/AvgRTPStatsReporter";
import AudioOutputProblemDetector from "./modules/statistics/AudioOutputProblemDetector";
import SpeakerStatsCollector from "./modules/statistics/SpeakerStatsCollector";
import VideoSIPGW from "./modules/videosipgw/VideoSIPGW";
import RecordingManager from "./modules/recording/RecordingManager";
import { E2EEncryption } from "./modules/e2ee/E2EEncryption";
import { CodecSelection } from "./modules/RTC/CodecSelection";
import E2ePing from "./modules/e2eping/e2eping";
import RTC from "./modules/RTC/RTC";
import ReceiveVideoController from "./modules/qualitycontrol/ReceiveVideoController";
import SendVideoController from "./modules/qualitycontrol/SendVideoController";
import ParticipantConnectionStatusHandler from "./modules/connectivity/ParticipantConnectionStatus";
import Statistics from "./modules/statistics/statistics";
import VADAudioAnalyser from "./modules/detection/VADAudioAnalyser";
import NoAudioSignalDetection from "./modules/detection/NoAudioSignalDetection";
import Jvb121EventGenerator from "./modules/event/Jvb121EventGenerator";
import P2PDominantSpeakerDetection from "./modules/detection/P2PDominantSpeakerDetection";
import { MediaType } from "./service/RTC/MediaType";
import Transcriber from "./modules/transcription/transcriber";
import JitsiParticipant from "./JitsiParticipant";
import IceFailedHandling from "./modules/connectivity/IceFailedHandling";
