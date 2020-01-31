/**
 * How long since Jicofo is supposed to send a session-initiate, before
 * {@link ACTION_JINGLE_SI_TIMEOUT} analytics event is sent (in ms).
 */
declare const JINGLE_SI_TIMEOUT = 5000;

/**
 * Jingle session instance for the JVB connection.
 */
declare var jvbJingleSession: JingleSessionPC;

/**
 * The object which monitors local and remote connection statistics (e.g.
 * sending bitrate) and calculates a number which represents the connection
 * quality.
 */
declare var connectionQuality: any;

/**
 * Reports average RTP statistics to the analytics module.
 */
declare var avgRtpStatsReporter: AvgRTPStatsReporter;

/**
 * Detects issues with the audio of remote participants.
 */
declare var _audioOutputProblemDetector: AudioOutputProblemDetector;

/**
 * Indicates whether the connection is interrupted or not.
 */
declare var isJvbConnectionInterrupted: any;

/**
 * The object which tracks active speaker times
 */
declare var speakerStatsCollector: any;

/**
 * Stores reference to deferred start P2P task. It's created when 3rd
 * participant leaves the room in order to avoid ping pong effect (it
 * could be just a page reload).
 */
declare var deferredStartP2PTask: number | null;

/**
 * A delay given in seconds, before the conference switches back to P2P
 * after the 3rd participant has left.
 */
declare var backToP2PDelay: number;

/**
 * If set to <tt>true</tt> it means the P2P ICE is no longer connected.
 * When <tt>false</tt> it means that P2P ICE (media) connection is up
 * and running.
 */
declare var isP2PConnectionInterrupted: boolean;

/**
 * Flag set to <tt>true</tt> when P2P session has been established
 * (ICE has been connected) and this conference is currently in the peer to
 * peer mode (P2P connection is the active one).
 */
declare var p2p: boolean;

/**
 * A JingleSession for the direct peer to peer connection.
 */
declare var p2pJingleSession: JingleSessionPC;

/**
 * Indicates that client must be authenticated to create the conference.
 */
declare const AUTHENTICATION_REQUIRED: string;

/**
 * Indicates that chat error occurred.
 */
declare const CHAT_ERROR: string;

/**
 * Indicates that conference has been destroyed.
 */
declare const CONFERENCE_DESTROYED: string;

/**
 * Indicates that max users limit has been reached.
 */
declare const CONFERENCE_MAX_USERS: string;

/**
 * Indicates that a connection error occurred when trying to join a conference.
 */
declare const CONNECTION_ERROR: string;

/**
 * Indicates that a connection error is due to not allowed,
 * occurred when trying to join a conference.
 */
declare const NOT_ALLOWED_ERROR: string;

/**
 * Indicates that focus error happened.
 */
declare const FOCUS_DISCONNECTED: string;

/**
 * Indicates that focus left the conference.
 */
declare const FOCUS_LEFT: string;

/**
 * Indicates that graceful shutdown happened.
 */
declare const GRACEFUL_SHUTDOWN: string;

/**
 * Indicates that the versions of the server side components are incompatible
 * with the client side.
 */
declare const INCOMPATIBLE_SERVER_VERSIONS: string;

/**
 * Indicates that offer/answer had failed.
 */
declare const OFFER_ANSWER_FAILED: string;

/**
 * Indicates that password cannot be set for this conference.
 */
declare const PASSWORD_NOT_SUPPORTED: string;

/**
 * Indicates that a password is required in order to join the conference.
 */
declare const PASSWORD_REQUIRED: string;

/**
 * Indicates that reservation system returned error.
 */
declare const RESERVATION_ERROR: string;

/**
 * Indicates that the conference setup failed.
 */
declare const SETUP_FAILED: string;

/**
 * Indicates that there is no available videobridge.
 */
declare const VIDEOBRIDGE_NOT_AVAILABLE: string;

/**
 * Event indicates that the current conference audio input switched between audio
 * input states,i.e. with or without audio input.
 */
declare const AUDIO_INPUT_STATE_CHANGE: string;

/**
 * Indicates that authentication status changed.
 */
declare const AUTH_STATUS_CHANGED: string;

/**
 * A participant avatar has changed.
 */
declare const AVATAR_CHANGED: string;

/**
 * Fired just before the statistics module is disposed and it's the last chance
 * to submit some logs to the statistics service (ex. CallStats if enabled),
 * before it's disconnected.
 */
declare const BEFORE_STATISTICS_DISPOSED: string;

/**
 * Indicates that an error occured.
 */
declare const CONFERENCE_ERROR: string;

/**
 * Indicates that conference failed.
 */
declare const CONFERENCE_FAILED: string;

/**
 * Indicates that conference has been joined. The event does NOT provide any
 * parameters to its listeners.
 */
declare const CONFERENCE_JOINED: string;

/**
 * Indicates that conference has been left.
 */
declare const CONFERENCE_LEFT: string;

/**
 * Indicates that the connection to the conference has been established
 * XXX This is currently fired whenVthe *ICE* connection enters 'connected'
 * state for the first time.
 */
declare const CONNECTION_ESTABLISHED: string;

/**
 * Indicates that the connection to the conference has been interrupted for some
 * reason.
 * XXX This is currently fired when the *ICE* connection is interrupted.
 */
declare const CONNECTION_INTERRUPTED: string;

/**
 * Indicates that the connection to the conference has been restored.
 * XXX This is currently fired when the *ICE* connection is restored.
 */
declare const CONNECTION_RESTORED: string;

/**
 * A connection to the video bridge's data channel has been established.
 */
declare const DATA_CHANNEL_OPENED: string;

/**
 * A user has changed it display name
 */
declare const DISPLAY_NAME_CHANGED: string;

/**
 * The dominant speaker was changed.
 */
declare const DOMINANT_SPEAKER_CHANGED: string;

/**
 * UTC conference timestamp when first participant joined.
 */
declare const CONFERENCE_CREATED_TIMESTAMP: string;

/**
 * Indicates that DTMF support changed.
 */
declare const DTMF_SUPPORT_CHANGED: string;

/**
 * Indicates that a message from another participant is received on data
 * channel.
 */
declare const ENDPOINT_MESSAGE_RECEIVED: string;

/**
 * NOTE This is lib-jitsi-meet internal event and can be removed at any time !
 *
 * Event emitted when conference transits, between one to one and multiparty JVB
 * conference. If the conference switches to P2P it's neither one to one nor
 * a multiparty JVB conference, but P2P (the status argument of this event will
 * be <tt>false</tt>).
 *
 * The first argument is a boolean which carries the previous value and
 * the seconds argument is a boolean with the new status. The event is emitted
 * only if the previous and the new values are different.
 */
declare const JVB121_STATUS: string;

/**
 * You are kicked from the conference.
 * @param the - participant that initiated the kick.
 */
declare const KICKED: string;

/**
 * Participant was kicked from the conference.
 * @param the - participant that initiated the kick.
 * @param the - participant that was kicked.
 */
declare const PARTICIPANT_KICKED: string;

/**
 * The Last N set is changed.
 * @param leavingEndpointIds - the ids of all the endpoints
 * which are leaving Last N
 * @param enteringEndpointIds - the ids of all the endpoints
 * which are entering Last N
 */
declare const LAST_N_ENDPOINTS_CHANGED: string;

/**
 * Indicates that the room has been locked or unlocked.
 */
declare const LOCK_STATE_CHANGED: string;

/**
 * Indicates that the region of the media server (jitsi-videobridge) that we
 * are connected to changed (or was initially set).
 */
declare const SERVER_REGION_CHANGED: string;

/**
 * New text message was received.
 */
declare const MESSAGE_RECEIVED: string;

/**
 * Event indicates that the current selected input device has no signal
 */
declare const NO_AUDIO_INPUT: string;

/**
 * Event indicates that the current microphone used by the conference is noisy.
 */
declare const NOISY_MIC: string;

/**
 * New private text message was received.
 */
declare const PRIVATE_MESSAGE_RECEIVED: string;

/**
 * Event fired when JVB sends notification about interrupted/restored user's
 * ICE connection status or we detect local problem with the video track.
 * First argument is the ID of the participant and
 * the seconds is a string indicating if the connection is currently
 * - active - the connection is active
 * - inactive - the connection is inactive, was intentionally interrupted by
 * the bridge
 * - interrupted - a network problem occurred
 * - restoring - the connection was inactive and is restoring now
 *
 * The current status value can be obtained by calling
 * JitsiParticipant.getConnectionStatus().
 */
declare const PARTICIPANT_CONN_STATUS_CHANGED: string;

/**
 * Indicates that the features of the participant has been changed.
 */
declare const PARTCIPANT_FEATURES_CHANGED: string;

/**
 * Indicates that a the value of a specific property of a specific participant
 * has changed.
 */
declare const PARTICIPANT_PROPERTY_CHANGED: string;

/**
 * Indicates that the conference has switched between JVB and P2P connections.
 * The first argument of this event is a <tt>boolean</tt> which when set to
 * <tt>true</tt> means that the conference is running on the P2P connection.
 */
declare const P2P_STATUS: string;

/**
 * Indicates that phone number changed.
 */
declare const PHONE_NUMBER_CHANGED: string;

/**
 * The conference properties changed.
 */
declare const PROPERTIES_CHANGED: string;

/**
 * Indicates that recording state changed.
 */
declare const RECORDER_STATE_CHANGED: string;

/**
 * Indicates that video SIP GW state changed.
 */
declare const VIDEO_SIP_GW_AVAILABILITY_CHANGED: string;

/**
 * Indicates that video SIP GW Session state changed.
 * @param event - {
 *     {string} address,
 *     {VideoSIPGWConstants} oldState,
 *     {VideoSIPGWConstants} newState,
 *     {string} displayName}
 * }.
 */
declare const VIDEO_SIP_GW_SESSION_STATE_CHANGED: string;

/**
 * Indicates that start muted settings changed.
 */
declare const START_MUTED_POLICY_CHANGED: string;

/**
 * Indicates that the local user has started muted.
 */
declare const STARTED_MUTED: string;

/**
 * Indicates that subject of the conference has changed.
 */
declare const SUBJECT_CHANGED: string;

/**
 * Indicates that DTMF support changed.
 */
declare const SUSPEND_DETECTED: string;

/**
 * Event indicates that local user is talking while he muted himself
 */
declare const TALK_WHILE_MUTED: string;

/**
 * A new media track was added to the conference. The event provides the
 * following parameters to its listeners:
 * @param track - the added JitsiTrack
 */
declare const TRACK_ADDED: string;

/**
 * Audio levels of a media track ( attached to the conference) was changed.
 */
declare const TRACK_AUDIO_LEVEL_CHANGED: string;

/**
 * A media track ( attached to the conference) mute status was changed.
 * @param the - participant that initiated the mute
 * if it is a remote mute.
 */
declare const TRACK_MUTE_CHANGED: string;

/**
 * The media track was removed from the conference. The event provides the
 * following parameters to its listeners:
 * @param track - the removed JitsiTrack
 */
declare const TRACK_REMOVED: string;

/**
 * Notifies for transcription status changes. The event provides the
 * following parameters to its listeners:
 * @param status - The new status.
 */
declare const TRANSCRIPTION_STATUS_CHANGED: string;

/**
 * A new user joined the conference.
 */
declare const USER_JOINED: string;

/**
 * A user has left the conference.
 */
declare const USER_LEFT: string;

/**
 * User role changed.
 */
declare const USER_ROLE_CHANGED: string;

/**
 * User status changed.
 */
declare const USER_STATUS_CHANGED: string;

/**
 * Event indicates that the bot participant type changed.
 */
declare const BOT_TYPE_CHANGED: string;

/**
 * Indicates that the connection was dropped with an error which was most likely
 * caused by some networking issues. The dropped term in this context means that
 * the connection was closed unexpectedly (not on user's request).
 *
 * One example is 'item-not-found' error thrown by Prosody when the BOSH session
 * times out after 60 seconds of inactivity. On the other hand 'item-not-found'
 * could also happen when BOSH request is sent to the server with the session-id
 * that is not know to the server. But this should not happen in lib-jitsi-meet
 * case as long as the service is configured correctly (there is no bug).
 */
declare const CONNECTION_DROPPED_ERROR: string;

/**
 * Not specified errors.
 */
declare const OTHER_ERROR: string;

/**
 * Indicates that a password is required in order to join the conference.
 */
declare const PASSWORD_REQUIRED: string;

/**
 * Indicates that the connection was dropped, because of too many 5xx HTTP
 * errors on BOSH requests.
 */
declare const SERVER_ERROR: string;

/**
 * Indicates that the connection has been disconnected. The event provides
 * the following parameters to its listeners:
 * @param msg - a message associated with the disconnect such as the
 * last (known) error message
 */
declare const CONNECTION_DISCONNECTED: string;

/**
 * Indicates that the connection to the conference has been established
 * XXX This is currently fired whenVthe *ICE* connection enters 'connected'
 * state for the first time.
 */
declare const CONNECTION_ESTABLISHED: string;

/**
 * Indicates that the connection has been failed for some reason. The event
 * provides the following parameters to its listeners:
 * @param errType - the type of error associated with
 * the failure
 * @param errReason - the error (message) associated with the failure
 * @param credentials - the credentials used to connect (if any)
 * @param errReasonDetails - an optional object with details about
 * the error, like shard moving, suspending. Used for analytics purposes.
 */
declare const CONNECTION_FAILED: string;

/**
 * Indicates that the performed action cannot be executed because the
 * connection is not in the correct state(connected, disconnected, etc.)
 */
declare const WRONG_STATE: string;

/**
 * Initializes a {@code JitsiMediaDevices} object. There will be a single
 * instance of this class.
 */
declare class JitsiMediaDevices {
    /**
     * Updated the local granted permissions cache. A permissions might be
     * granted, denied, or undefined. This is represented by having its media
     * type key set to {@code true} or {@code false} respectively.
     * @param grantedPermissions - Array with the permissions
     * which were granted.
     */
    _handleGrantedPermissions(grantedPermissions: any): void;
    /**
     * Gathers data and sends it to statistics.
     * @param deviceID - the device id to log
     * @param devices - list of devices
     */
    _logOutputDevice(deviceID: any, devices: any): void;
    /**
     * Executes callback with list of media devices connected.
     */
    enumerateDevices(callback: (...params: any[]) => any): void;
    /**
     * Checks if its possible to enumerate available cameras/micropones.
     * @returns a Promise which will be resolved only once
     * the WebRTC stack is ready, either with true if the device listing is
     * available available or with false otherwise.
     */
    isDeviceListAvailable(): Promise<boolean>;
    /**
     * Returns true if changing the input (camera / microphone) or output
     * (audio) device is supported and false if not.
     * @param [deviceType] - type of device to change. Default is
     *      undefined or 'input', 'output' - for audio output device change.
     * @returns true if available, false otherwise.
     */
    isDeviceChangeAvailable(deviceType?: string): boolean;
    /**
     * Checks if the permission for the given device was granted.
     * @param [type] - type of devices to check,
     *      undefined stands for both 'audio' and 'video' together
     */
    isDevicePermissionGranted(type?: 'audio' | 'video'): Promise<boolean>;
    /**
     * Returns true if it is possible to be simultaneously capturing audio
     * from more than one device.
     */
    isMultipleAudioInputSupported(): boolean;
    /**
     * Returns currently used audio output device id, 'default' stands
     * for default device
     */
    getAudioOutputDevice(): string;
    /**
     * Sets current audio output device.
     * @param deviceId - id of 'audiooutput' device from
     *      navigator.mediaDevices.enumerateDevices(), 'default' is for
     *      default device
     * @returns - resolves when audio output is changed, is rejected
     *      otherwise
     */
    setAudioOutputDevice(deviceId: string): Promise;
    /**
     * Adds an event handler.
     * @param event - event name
     * @param handler - event handler
     */
    addEventListener(event: string, handler: (...params: any[]) => any): void;
    /**
     * Removes event handler.
     * @param event - event name
     * @param handler - event handler
     */
    removeEventListener(event: string, handler: (...params: any[]) => any): void;
    /**
     * Emits an event.
     * @param event - event name
     */
    emitEvent(event: string): void;
    /**
     * Returns whether or not the current browser can support capturing video,
     * be it camera or desktop, and displaying received video.
     */
    supportsVideo(): boolean;
}

/**
 * Indicates that the list of available media devices has been changed. The
 * event provides the following parameters to its listeners:
 * @param devices - array of MediaDeviceInfo or
 *  MediaDeviceInfo-like objects that are currently connected.
 */
declare const DEVICE_LIST_CHANGED: string;

/**
 * Indicates that the environment is currently showing permission prompt to
 * access camera and/or microphone. The event provides the following
 * parameters to its listeners:
 * @param environmentType - type of browser or
 *  other execution environment.
 */
declare const PERMISSION_PROMPT_IS_SHOWN: string;

/**
 * The amount of time to wait until firing
 * {@link JitsiMediaDevicesEvents.PERMISSION_PROMPT_IS_SHOWN} event.
 */
declare const USER_MEDIA_PERMISSION_PROMPT_TIMEOUT = 1000;

/**
 * Gets the next lowest desirable resolution to try for a camera. If the given
 * resolution is already the lowest acceptable resolution, returns {@code null}.
 * @param resolution - the current resolution
 * @returns the next lowest resolution from the given one, or {@code null} if it
 * is already the lowest acceptable resolution.
 */
declare function getLowerResolution(resolution: any): any;

/**
 * Extracts from an 'options' objects with a specific format (TODO what IS the
 * format?) the attributes which are to be logged in analytics events.
 * @param options - gum options (???)
 * @returns the attributes to attach to analytics events.
 */
declare function getAnalyticsAttributesFromOptions(options: any): any;

/**
 * {@code ProxyConnectionService} is used to connect a remote peer to a
 * local Jitsi participant without going through a Jitsi conference. It is
 * currently used for room integration development, specifically wireless
 * screensharing. Its API is experimental and will likely change; usage of
 * it is advised against.
 */
declare var ProxyConnectionService: any;

/**
 * Returns whether the desktop sharing is enabled or not.
 */
declare function isDesktopSharingEnabled(): boolean;

/**
 * Returns whether the current execution environment supports WebRTC (for
 * use within this library).
 * @returns {@code true} if WebRTC is supported in the current
 * execution environment (for use within this library); {@code false},
 * otherwise.
 */
declare function isWebRtcSupported(): boolean;

/**
 * Sets the log level to the <tt>Logger</tt> instance with given id.
 * @param level - the logging level to be set
 * @param id - the logger id to which new logging level will be set.
 * Usually it's the name of the JavaScript source file including the path
 * ex. "modules/xmpp/ChatRoom.js"
 */
declare function setLogLevelById(level: Logger.levels, id: string): void;

/**
 * Registers new global logger transport to the library logging framework.
 */
declare function addGlobalLogTransport(globalTransport: any): void;

/**
 * Removes global logging transport from the library logging framework.
 */
declare function removeGlobalLogTransport(globalTransport: any): void;

/**
 * Sets global options which will be used by all loggers. Changing these
 * works even after other loggers are created.
 */
declare function setGlobalLogOptions(options: any): void;

/**
 * Creates the media tracks and returns them trough the callback.
 * @param options - Object with properties / settings specifying the tracks
 * which should be created. should be created or some additional
 * configurations about resolution for example.
 * @param options.effects - optional effects array for the track
 * @param options.devices - the devices that will be requested
 * @param options.resolution - resolution constraints
 * @param options.desktopSharingExtensionExternalInstallation - enables external installation process for desktop sharing extension if
 * the inline installation is not posible. The following properties should
 * be provided:
 * @param interval - the interval (in ms) for
 * checking whether the desktop sharing extension is installed or not
 * @param checkAgain - returns boolean. While checkAgain()==true
 * createLocalTracks will wait and check on every "interval" ms for the
 * extension. If the desktop extension is not install and checkAgain()==true
 * createLocalTracks will finish with rejected Promise.
 * @param listener - The listener will be called to notify the
 * user of lib-jitsi-meet that createLocalTracks is starting external
 * extension installation process.
 * NOTE: If the inline installation process is not possible and external
 * installation is enabled the listener property will be called to notify
 * the start of external installation process. After that createLocalTracks
 * will start to check for the extension on every interval ms until the
 * plugin is installed or until checkAgain return false. If the extension
 * is found createLocalTracks will try to get the desktop sharing track and
 * will finish the execution. If checkAgain returns false, createLocalTracks
 * will finish the execution with rejected Promise.
 * @param (firePermissionPromptIsShownEvent) - if event
 * JitsiMediaDevicesEvents.PERMISSION_PROMPT_IS_SHOWN should be fired
 * @param originalOptions - internal use only, to be able to store the
 * originally requested options.
 * @returns A promise
 * that returns an array of created JitsiTracks if resolved, or a
 * JitsiConferenceError if rejected.
 */
declare function createLocalTracks(options: {
    effects: any[];
    devices: any[];
    resolution: string;
    cameraDeviceId: string;
    micDeviceId: string;
    desktopSharingExtensionExternalInstallation: any;
}, interval: intiger, checkAgain: (...params: any[]) => any, listener: (...params: any[]) => any, (firePermissionPromptIsShownEvent): boolean, originalOptions: any): Promise<{ Array: any; }>;

/**
 * Create a TrackVADEmitter service that connects an audio track to an VAD (voice activity detection) processor in
 * order to obtain VAD scores for individual PCM audio samples.
 * @param localAudioDeviceId - The target local audio device.
 * @param sampleRate - Sample rate at which the emitter will operate. Possible values  256, 512, 1024,
 * 4096, 8192, 16384. Passing other values will default to closes neighbor.
 * I.e. Providing a value of 4096 means that the emitter will process 4096 PCM samples at a time, higher values mean
 * longer calls, lowers values mean more calls but shorter.
 * @param vadProcessor - VAD Processors that does the actual compute on a PCM sample.The processor needs
 * to implement the following functions:
 * - <tt>getSampleLength()</tt> - Returns the sample size accepted by calculateAudioFrameVAD.
 * - <tt>getRequiredPCMFrequency()</tt> - Returns the PCM frequency at which the processor operates.
 * i.e. (16KHz, 44.1 KHz etc.)
 * - <tt>calculateAudioFrameVAD(pcmSample)</tt> - Process a 32 float pcm sample of getSampleLength size.
 */
declare function createTrackVADEmitter(localAudioDeviceId: string, sampleRate: number, vadProcessor: any): Promise<TrackVADEmitter>;

/**
 * Go through all audio devices on the system and return one that is active, i.e. has audio signal.
 * @returns Promise<Object> - Object containing information about the found device.
 */
declare function getActiveAudioDevice(): any;

/**
 * Checks if its possible to enumerate available cameras/microphones.
 * @returns a Promise which will be resolved only once
 * the WebRTC stack is ready, either with true if the device listing is
 * available available or with false otherwise.
 */
declare function isDeviceListAvailable(): Promise<boolean>;

/**
 * Returns true if changing the input (camera / microphone) or output
 * (audio) device is supported and false if not.
 * @param [deviceType] - type of device to change. Default is
 * {@code undefined} or 'input', 'output' - for audio output device change.
 * @returns {@code true} if available; {@code false}, otherwise.
 */
declare function isDeviceChangeAvailable(deviceType?: string): boolean;

/**
 * Checks if the current environment supports having multiple audio
 * input devices in use simultaneously.
 * @returns True if multiple audio input devices can be used.
 */
declare function isMultipleAudioInputSupported(): boolean;

/**
 * Checks if local tracks can collect stats and collection is enabled.
 * @param True - if stats are being collected for local tracks.
 */
declare function isCollectingLocalStats(True: boolean): void;

/**
 * Executes callback with list of media devices connected.
 */
declare function enumerateDevices(callback: (...params: any[]) => any): void;

/**
 * @returns function that can be used to be attached to window.onerror and
 * if options.enableWindowOnErrorHandler is enabled returns
 * the function used by the lib.
 * (function(message, source, lineno, colno, error)).
 */
declare function getGlobalOnErrorHandler(): any;

/**
 * Set the contentHint on the transmitted stream track to indicate
 * charaterstics in the video stream, which informs PeerConnection
 * on how to encode the track (to prefer motion or individual frame detail)
 * @param track - the track that is transmitted
 * @param hint - contentHint value that needs to be set on the track
 */
declare function setVideoTrackContentHints(track: MediaStreamTrack, hint: string): void;

/**
 * Represents a hub/namespace for utility functionality which may be of
 * interest to lib-jitsi-meet clients.
 */
declare var util: any;

/**
 * @returns The conference that this participant belongs
 * to.
 */
declare function getConference(): JitsiConference;

/**
 * Gets the value of a property of this participant.
 */
declare function getProperty(): void;

/**
 * Checks whether this <tt>JitsiParticipant</tt> has any video tracks which
 * are muted according to their underlying WebRTC <tt>MediaStreamTrack</tt>
 * muted status.
 * @returns <tt>true</tt> if this <tt>participant</tt> contains any
 * video <tt>JitsiTrack</tt>s which are muted as defined in
 * {@link JitsiTrack.isWebRTCTrackMuted}.
 */
declare function hasAnyVideoTrackWebRTCMuted(): boolean;

/**
 * Return participant's connectivity status.
 * @returns the connection status
 * <tt>ParticipantConnectionStatus</tt> of the user.
 * {@link ParticipantConnectionStatus}.
 */
declare function getConnectionStatus(): string;

/**
 * Sets the value of a property of this participant, and fires an event if
 * the value has changed.
 */
declare var the name of the property.: any;

/**
 * @returns The list of media tracks for this
 * participant.
 */
declare function getTracks(): JitsiTrack[];

/**
 * @returns an array of media tracks for this
 * participant, for given media type.
 */
declare function getTracksByMediaType(mediaType: MediaType): JitsiTrack[];

/**
 * @returns The ID of this participant.
 */
declare function getId(): string;

/**
 * @returns The JID of this participant.
 */
declare function getJid(): string;

/**
 * @returns The human-readable display name of this participant.
 */
declare function getDisplayName(): string;

/**
 * @returns The stats ID of this participant.
 */
declare function getStatsID(): string;

/**
 * @returns The status of the participant.
 */
declare function getStatus(): string;

/**
 * @returns Whether this participant is a moderator or not.
 */
declare function isModerator(): boolean;

/**
 * @returns Whether this participant is a hidden participant. Some
 * special system participants may want to join hidden (like for example the
 * recorder).
 */
declare function isHidden(): boolean;

/**
 * @returns Whether this participant has muted their audio.
 */
declare function isAudioMuted(): boolean;

/**
 * @returns Whether this participant has muted their video.
 */
declare function isVideoMuted(): boolean;

/**
 * @returns The role of this participant.
 */
declare function getRole(): string;

declare function supportsDTMF(): void;

/**
 * Returns a set with the features for the participant.
 * @param timeout - the timeout in ms for reply from the participant.
 */
declare function getFeatures(timeout?: int): Promise<Set<String>>;

/**
 * Returns the bot type for the participant.
 * @returns - The bot type of the participant.
 */
declare function getBotType(): string | undefined;

/**
 * Represents an error that occurred to a JitsiTrack. Can represent various
 * types of errors. For error descriptions (@see JitsiTrackErrors).
 * @param error - error object or error name
 * @param [options] - getUserMedia constraints object or
 * error message
 * @param [devices] - list of getUserMedia requested devices
 */
declare class JitsiTrackError extends Error {
    constructor(error: any | string, options?: any | string, devices?: ('audio' | 'video' | 'desktop' | 'screen' | 'audiooutput')[]);
    /**
     * Additional information about original getUserMedia error
     * and constraints.
     */
    gum: any;
}

/**
 * Gets failed resolution constraint from corresponding object.
 */
declare function getResolutionFromFailedConstraint(failedConstraintName: string, constraints: any): string | number;

/**
 * Generic error for jidesha extension for Chrome.
 */
declare const CHROME_EXTENSION_GENERIC_ERROR: string;

/**
 * An error which indicates that the jidesha extension for Chrome is
 * failed to install.
 */
declare const CHROME_EXTENSION_INSTALLATION_ERROR: string;

/**
 * This error indicates that the attempt to start screensharing was initiated by
 * a script which did not originate in user gesture handler. It means that
 * you should to trigger the action again in response to a button click for
 * example.
 */
declare const CHROME_EXTENSION_USER_GESTURE_REQUIRED: string;

/**
 * An error which indicates that user canceled screen sharing window
 * selection dialog in jidesha extension for Chrome.
 */
declare const CHROME_EXTENSION_USER_CANCELED: string;

/**
 * An error which indicates that some of requested constraints in
 * getUserMedia call were not satisfied.
 */
declare const CONSTRAINT_FAILED: string;

/**
 * A generic error which indicates an error occurred while selecting
 * a DesktopCapturerSource from the electron app.
 */
declare const ELECTRON_DESKTOP_PICKER_ERROR: string;

/**
 * An error which indicates a custom desktop picker could not be detected
 * for the electron app.
 */
declare const ELECTRON_DESKTOP_PICKER_NOT_FOUND: string;

/**
 * An error which indicates that the jidesha extension for Firefox is
 * needed to proceed with screen sharing, and that it is not installed.
 */
declare const FIREFOX_EXTENSION_NEEDED: string;

/**
 * Generic getUserMedia error.
 */
declare const GENERAL: string;

/**
 * An error which indicates that requested device was not found.
 */
declare const NOT_FOUND: string;

/**
 * An error which indicates that user denied permission to share requested
 * device.
 */
declare const PERMISSION_DENIED: string;

/**
 * An error which indicates that track has been already disposed and cannot
 * be longer used.
 */
declare const TRACK_IS_DISPOSED: string;

/**
 * An error which indicates that track has no MediaStream associated.
 */
declare const TRACK_NO_STREAM_FOUND: string;

/**
 * An error which indicates that requested video resolution is not supported
 * by a webcam.
 */
declare const UNSUPPORTED_RESOLUTION: string;

/**
 * The media track was removed to the conference.
 */
declare const LOCAL_TRACK_STOPPED: string;

/**
 * Audio levels of a media track ( attached to the conference) was changed.
 */
declare const TRACK_AUDIO_LEVEL_CHANGED: string;

/**
 * The audio output of the track was changed.
 */
declare const TRACK_AUDIO_OUTPUT_CHANGED: string;

/**
 * A media track ( attached to the conference) mute status was changed.
 * @param the - participant that initiated the mute
 * if it is a remote mute.
 */
declare const TRACK_MUTE_CHANGED: string;

/**
 * The video type("camera" or "desktop") of the track was changed.
 */
declare const TRACK_VIDEOTYPE_CHANGED: string;

/**
 * Indicates that the track is not receiving any data even though we expect it
 * to receive data (i.e. the stream is not stopped).
 */
declare const NO_DATA_FROM_SOURCE: string;

/**
 * The transciption is on.
 */
declare const ON: string;

/**
 * The transciption is off.
 */
declare const OFF: string;

/**
 * @property [connectionError] - One of
 * {@link JitsiConnectionErrors} which occurred when trying to connect to the
 * XMPP server.
 * @property [authenticationError] - One of XMPP error conditions
 * returned by Jicofo on authentication attempt. See
 * {@link https://xmpp.org/rfcs/rfc3920.html#streams-error}.
 * @property [message] - More details about the error.
 * @property [credentials] - The credentials that failed the
 * authentication.
 * @property [credentials.jid] - The XMPP ID part of the credentials
 * that failed the authentication.
 * @property [credentials.password] - The password part of the
 * credentials that failed the authentication.
 *
 * NOTE If neither one of the errors is present, then the operation has been
 * canceled.
 */
declare type UpgradeRoleError = {
    connectionError?: JitsiConnectionErrors;
    authenticationError?: string;
    message?: string;
    credentials?: {
        jid?: string;
        password?: string;
    };
};

/**
 * [js-md5]{@link https://github.com/emn178/js-md5}
 */
declare namespace md5 { }

/**
 * [js-md5]{@link https://github.com/emn178/js-md5}
 */
declare namespace md5 { }

