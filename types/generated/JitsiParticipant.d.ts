/**
 * Represents a participant in (i.e. a member of) a conference.
 */
export default class JitsiParticipant {
    /**
     * Initializes a new JitsiParticipant instance.
     *
     * @constructor
     * @param jid the conference XMPP jid
     * @param conference
     * @param displayName
     * @param {Boolean} hidden - True if the new JitsiParticipant instance is to
     * represent a hidden participant; otherwise, false.
     * @param {string} statsID - optional participant statsID
     * @param {string} status - the initial status if any.
     * @param {object} identity - the xmpp identity
     */
    constructor(jid: any, conference: any, displayName: any, hidden: boolean, statsID: string, status: string, identity: object);
    _jid: any;
    _id: any;
    _conference: any;
    _displayName: any;
    _supportsDTMF: boolean;
    _tracks: any[];
    _role: string;
    _status: string;
    _hidden: boolean;
    _statsID: string;
    _connectionStatus: string;
    _properties: {};
    _identity: any;
    _features: any;
    /**
     * @returns {JitsiConference} The conference that this participant belongs
     * to.
     */
    getConference(): any;
    /**
     * Gets the value of a property of this participant.
     */
    getProperty(name: any): any;
    /**
     * Checks whether this <tt>JitsiParticipant</tt> has any video tracks which
     * are muted according to their underlying WebRTC <tt>MediaStreamTrack</tt>
     * muted status.
     * @return {boolean} <tt>true</tt> if this <tt>participant</tt> contains any
     * video <tt>JitsiTrack</tt>s which are muted as defined in
     * {@link JitsiTrack.isWebRTCTrackMuted}.
     */
    hasAnyVideoTrackWebRTCMuted(): boolean;
    /**
     * Updates participant's connection status.
     * @param {string} state the current participant connection state.
     * {@link ParticipantConnectionStatus}.
     * @private
     */
    private _setConnectionStatus;
    /**
     * Return participant's connectivity status.
     *
     * @returns {string} the connection status
     * <tt>ParticipantConnectionStatus</tt> of the user.
     * {@link ParticipantConnectionStatus}.
     */
    getConnectionStatus(): string;
    /**
     * Sets the value of a property of this participant, and fires an event if
     * the value has changed.
     * @name the name of the property.
     * @value the value to set.
     */
    setProperty(name: any, value: any): void;
    /**
     * @returns {Array.<JitsiTrack>} The list of media tracks for this
     * participant.
     */
    getTracks(): Array<any>;
    /**
     * @param {MediaType} mediaType
     * @returns {Array.<JitsiTrack>} an array of media tracks for this
     * participant, for given media type.
     */
    getTracksByMediaType(mediaType: typeof MediaType): Array<any>;
    /**
     * @returns {String} The ID of this participant.
     */
    getId(): string;
    /**
     * @returns {String} The JID of this participant.
     */
    getJid(): string;
    /**
     * @returns {String} The human-readable display name of this participant.
     */
    getDisplayName(): string;
    /**
     * @returns {String} The stats ID of this participant.
     */
    getStatsID(): string;
    /**
     * @returns {String} The status of the participant.
     */
    getStatus(): string;
    /**
     * @returns {Boolean} Whether this participant is a moderator or not.
     */
    isModerator(): boolean;
    /**
     * @returns {Boolean} Whether this participant is a hidden participant. Some
     * special system participants may want to join hidden (like for example the
     * recorder).
     */
    isHidden(): boolean;
    /**
     * @returns {Boolean} Whether this participant has muted their audio.
     */
    isAudioMuted(): boolean;
    /**
     * Determines whether all JitsiTracks which are of a specific MediaType and
     * which belong to this JitsiParticipant are muted.
     *
     * @param {MediaType} mediaType - The MediaType of the JitsiTracks to be
     * checked.
     * @private
     * @returns {Boolean} True if all JitsiTracks which are of the specified
     * mediaType and which belong to this JitsiParticipant are muted; otherwise,
     * false.
     */
    private _isMediaTypeMuted;
    /**
     * @returns {Boolean} Whether this participant has muted their video.
     */
    isVideoMuted(): boolean;
    /**
     * @returns {String} The role of this participant.
     */
    getRole(): string;
    /**
     *
     */
    supportsDTMF(): boolean;
    /**
     * Returns a set with the features for the participant.
     * @returns {Promise<Set<String>, Error>}
     */
    getFeatures(): Promise<any, Error>;
    /**
     * Returns a set with the features for the participant.
     * @param {int} timeout the timeout in ms for reply from the participant.
     * @returns {Promise<Set<String>, Error>}
     */
    queryFeatures(timeout?: any): Promise<any, Error>;
    _getFeaturesPromise: any;
    /**
     * Returns the bot type for the participant.
     *
     * @returns {string|undefined} - The bot type of the participant.
     */
    getBotType(): string | undefined;
}
import * as MediaType from "./service/RTC/MediaType";
