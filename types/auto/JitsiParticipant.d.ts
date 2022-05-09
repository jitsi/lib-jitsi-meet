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
     * @param {boolean?} isReplacing - whether this is a participant replacing another into the meeting.
     * @param {boolean?} isReplaced - whether this is a participant to be kicked and replaced into the meeting.
     */
    constructor(jid: any, conference: any, displayName: any, hidden: boolean, statsID: string, status: string, identity: object, isReplacing: boolean | null, isReplaced: boolean | null);
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
    _isReplacing: boolean;
    _isReplaced: boolean;
    _features: Set<any>;
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
    getTracksByMediaType(mediaType: MediaType): Array<any>;
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
     * @returns {Boolean} Whether this participant is a hidden participant. Some
     * special system participants may want to join hidden (like for example the
     * recorder).
     */
    isHiddenFromRecorder(): boolean;
    /**
     * @returns {Boolean} Whether this participant replaces another participant
     * from the meeting.
     */
    isReplacing(): boolean;
    /**
     * @returns {Boolean} Wheter this participants will be replaced by another
     * participant in the meeting.
     */
    isReplaced(): boolean;
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
     * Sets a new participant role.
     * @param {String} newRole - the new role.
     */
    setRole(newRole: string): void;
    /**
     * Sets whether participant is replacing another based on jwt.
     * @param {String} newIsReplacing - whether is replacing.
     */
    setIsReplacing(newIsReplacing: string): void;
    /**
     * Sets whether participant is being replaced by another based on jwt.
     * @param {boolean} newIsReplaced - whether is being replaced.
     */
    setIsReplaced(newIsReplaced: boolean): void;
    /**
     *
     */
    supportsDTMF(): boolean;
    /**
     * Returns a set with the features for the participant.
     * @returns {Promise<Set<String>, Error>}
     */
    getFeatures(): Promise<Set<string>, Error>;
    /**
     * Checks current set features.
     * @param {String} feature - the feature to check.
     * @return {boolean} <tt>true</tt> if this <tt>participant</tt> contains the
     * <tt>feature</tt>.
     */
    hasFeature(feature: string): boolean;
    /**
     * Set new features.
     * @param {Set<String>|undefined} newFeatures - Sets new features.
     */
    setFeatures(newFeatures: Set<string> | undefined): void;
    /**
     * Returns the bot type for the participant.
     *
     * @returns {string|undefined} - The bot type of the participant.
     */
    getBotType(): string | undefined;
    /**
     * Sets the bot type for the participant.
     * @param {String} newBotType - The new bot type to set.
     */
    setBotType(newBotType: string): void;
    _botType: string;
    /**
     * Returns the connection jid for the participant.
     *
     * @returns {string|undefined} - The connection jid of the participant.
     */
    getConnectionJid(): string | undefined;
    /**
     * Sets the connection jid for the participant.
     * @param {String} newJid - The connection jid to set.
     */
    setConnectionJid(newJid: string): void;
    _connectionJid: string;
}
import { MediaType } from "./service/RTC/MediaType";
