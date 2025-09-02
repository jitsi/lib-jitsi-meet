import { Strophe } from 'strophe.js';

import JitsiConference from './JitsiConference';
import { JitsiConferenceEvents } from './JitsiConferenceEvents';
import JitsiRemoteTrack from './modules/RTC/JitsiRemoteTrack';
import { MediaType } from './service/RTC/MediaType';

export interface ISourceInfo {
    muted: boolean;
    videoType: string;
}

/**
 * Represents a participant in (i.e. a member of) a conference.
 */
export default class JitsiParticipant {

    private _jid: string;
    private _id: string;
    private _conference: JitsiConference;
    private _role: string;
    private _hidden: boolean;
    private _statsID?: string;
    private _properties: Map<string, any>;
    private _identity?: object;
    private _isReplacing?: boolean;
    private _isReplaced?: boolean;
    private _isSilent?: boolean;
    private _features: Set<string>;
    private _sources: Map<MediaType, Map<string, ISourceInfo>>;
    private _botType?: string;
    private _connectionJid?: string;
    /**
     * @internal
     */
    _status?: string;
    /**
     * @internal
     */
    _displayName: string;
    /**
     * @internal
     */
    _supportsDTMF: boolean;
    /**
     * @internal
     */
    _tracks: JitsiRemoteTrack[];

    /* eslint-disable max-params */

    /**
     * Initializes a new JitsiParticipant instance.
     *
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
     * @param {boolean?} isSilent - whether participant has joined without audio
     */
    constructor(
            jid: string,
            conference: JitsiConference,
            displayName: string,
            hidden: boolean,
            statsID?: string,
            status?: string,
            identity?: object,
            isReplacing?: boolean,
            isReplaced?: boolean,
            isSilent?: boolean
    ) {
        this._jid = jid;
        this._id = Strophe.getResourceFromJid(jid);
        this._conference = conference;
        this._displayName = displayName;
        this._supportsDTMF = false;
        this._tracks = [];
        this._role = 'none';
        this._status = status;
        this._hidden = hidden;
        this._statsID = statsID;
        this._properties = new Map();
        this._identity = identity;
        this._isReplacing = isReplacing;
        this._isReplaced = isReplaced;
        this._isSilent = isSilent;
        this._features = new Set();

        /**
         * Remote sources associated with the participant in the following format.
         * Map<mediaType, Map<sourceName, ISourceInfo>>
         *
         * mediaType - 'audio' or 'video'.
         * sourceName - name of the remote source.
         * ISourceInfo: {
         *   muted: boolean;
         *   videoType: string;
         * }
         */
        this._sources = new Map();
    }

    /**
     * Determines whether all JitsiTracks which are of a specific MediaType and which belong to this
     * JitsiParticipant are muted.
     *
     * @param {MediaType} mediaType - The MediaType of the JitsiTracks to be checked.
     * @private
     * @returns {Boolean} True if all JitsiTracks which are of the specified mediaType and which belong to this
     * JitsiParticipant are muted; otherwise, false.
     */
    _isMediaTypeMuted(mediaType: MediaType): boolean {
        return this.getTracks().reduce(
            (muted, track) =>
                muted && (track.getType() !== mediaType || (track as any).isMuted()),
            true);
    }

    /**
     * Sets source info.
     * @param {MediaType} mediaType The media type, 'audio' or 'video'.
     * @param {boolean} muted The new muted state.
     * @param {string} sourceName The name of the source.
     * @param {string} videoType The video type of the source.
     * @returns {void}
     */
    _setSources(mediaType: MediaType, muted: boolean, sourceName: string, videoType: string): void {
        let sourceByMediaType = this._sources.get(mediaType);
        const sourceInfo: ISourceInfo = {
            muted,
            videoType
        };

        if (sourceByMediaType?.size) {
            sourceByMediaType.set(sourceName, sourceInfo);

            return;
        }

        sourceByMediaType = new Map();
        sourceByMediaType.set(sourceName, sourceInfo);
        this._sources.set(mediaType, sourceByMediaType);
    }

    /**
     * Returns the bot type for the participant.
     *
     * @returns {Optional<string>} - The bot type of the participant.
     */
    getBotType(): Optional<string> {
        return this._botType;
    }

    /**
     * @returns {JitsiConference} The conference that this participant belongs
     * to.
     */
    getConference(): JitsiConference {
        return this._conference;
    }

    /**
     * Returns the connection jid for the participant.
     *
     * @returns {Optional<string>} - The connection jid of the participant.
     */
    getConnectionJid(): Optional<string> {
        return this._connectionJid;
    }

    /**
     * @returns {String} The human-readable display name of this participant.
     */
    getDisplayName(): string {
        return this._displayName;
    }

    /**
     * Returns a set with the features for the participant.
     * @returns {Promise<Set<String>>}
     */
    getFeatures(): Promise<Set<string>> {
        return Promise.resolve(this._features);
    }

    /**
     * @returns {String} The ID of this participant.
     */
    getId(): string {
        return this._id;
    }

    /**
     * Returns the XMPP identity. This is defined by your application in the
     * JWT `context` claims section.
     *
     * @returns {Optional<object>} - XMPP user identity.
     */
    getIdentity(): Optional<object> {
        return this._identity;
    }

    /**
     * @returns {String} The JID of this participant.
     */
    getJid(): string {
        return this._jid;
    }

    /**
     * Gets the value of a property of this participant.
     */
    getProperty(name: string): any {
        return this._properties.get(name);
    }

    /**
     * @returns {String} The role of this participant.
     */
    getRole(): string {
        return this._role;
    }

    /**
     * Returns the sources associated with this participant.
     * @returns Map<string, Map<string, Object>>
     */
    getSources(): Map<MediaType, Map<string, ISourceInfo>> {
        return this._sources;
    }

    /**
     * @returns {String} The stats ID of this participant.
     */
    getStatsID(): string {
        return this._statsID;
    }

    /**
     * @returns {String} The status of the participant.
     */
    getStatus(): string {
        return this._status;
    }

    /**
     * @returns {Array.<JitsiRemoteTrack>} The list of media tracks for this
     * participant.
     */
    getTracks(): (JitsiRemoteTrack)[] {
        return this._tracks.slice();
    }

    /**
     * @param {MediaType} mediaType
     * @returns {Array.<JitsiRemoteTrack>} an array of media tracks for this
     * participant, for given media type.
     */
    getTracksByMediaType(mediaType: MediaType): (JitsiRemoteTrack)[] {
        return this.getTracks().filter(track => track.getType() === mediaType);
    }

    /**
     * Checks current set features.
     * @param {String} feature - the feature to check.
     * @return {boolean} <tt>true</tt> if this <tt>participant</tt> contains the
     * <tt>feature</tt>.
     */
    hasFeature(feature: string): boolean {
        return this._features.has(feature);
    }

    /**
     * @returns {Boolean} Whether this participant has muted their audio.
     */
    isAudioMuted(): boolean {
        return this._isMediaTypeMuted(MediaType.AUDIO);
    }

    /**
     * @returns {Boolean} Whether this participant is a hidden participant. Some
     * special system participants may want to join hidden (like for example the
     * recorder).
     */
    isHidden(): boolean {
        return this._hidden;
    }

    /**
     * @returns {Boolean} Whether this participant is a hidden participant. Some
     * special system participants may want to join hidden (like for example the
     * recorder).
     */
    isHiddenFromRecorder(): boolean {
        return (this._identity as any)?.user?.['hidden-from-recorder'] === 'true';
    }

    /**
     * @returns {Boolean} Whether this participant is a moderator or not.
     */
    isModerator(): boolean {
        return this._role === 'moderator';
    }

    /**
     * @returns {Boolean} Wheter this participants will be replaced by another
     * participant in the meeting.
     */
    isReplaced(): boolean {
        return this._isReplaced;
    }

    /**
     * @returns {Boolean} Whether this participant replaces another participant
     * from the meeting.
     */
    isReplacing(): boolean {
        return this._isReplacing;
    }

    /**
     * @returns {Boolean} Whether this participant has joined without audio.
     */
    isSilent(): boolean {
        return this._isSilent;
    }

    /**
     * @returns {Boolean} Whether this participant has muted their video.
     */
    isVideoMuted(): boolean {
        return this._isMediaTypeMuted(MediaType.VIDEO);
    }

    /**
     * Sets the bot type for the participant.
     * @param {String} newBotType - The new bot type to set.
     */
    setBotType(newBotType: string): void {
        this._botType = newBotType;
    }

    /**
     * Sets the connection jid for the participant.
     * @param {String} newJid - The connection jid to set.
     */
    setConnectionJid(newJid: string): void {
        this._connectionJid = newJid;
    }

    /**
     * Set new features.
     * @param {Set<String>|undefined} newFeatures - Sets new features.
     */
    setFeatures(newFeatures?: Set<string>): void {
        this._features = newFeatures || new Set();
    }

    /**
     * Sets whether participant is being replaced by another based on jwt.
     * @param {boolean} newIsReplaced - whether is being replaced.
     */
    setIsReplaced(newIsReplaced: boolean): void {
        this._isReplaced = newIsReplaced;
    }

    /**
     * Sets whether participant is replacing another based on jwt.
     * @param {boolean} newIsReplacing - whether is replacing.
     */
    setIsReplacing(newIsReplacing: boolean): void {
        this._isReplacing = newIsReplacing;
    }

    /**
     * Sets whether participant has joined without audio.
     * @param {boolean} newIsSilent - whether is silent.
     */
    setIsSilent(newIsSilent: boolean): void {
        this._isSilent = newIsSilent;
    }

    /**
     * Sets the value of a property of this participant, and fires an event if
     * the value has changed.
     * @param {string} name the name of the property.
     * @param {any} value the value to set.
     */
    setProperty(name: string, value: any): void {
        const oldValue = this._properties.get(name);

        if (value !== oldValue) {
            this._properties.set(name, value);
            this._conference.eventEmitter.emit(
                JitsiConferenceEvents.PARTICIPANT_PROPERTY_CHANGED,
                this,
                name,
                oldValue,
                value);
        }
    }

    /**
     * Sets a new participant role.
     * @param {String} newRole - the new role.
     */
    setRole(newRole: string): void {
        this._role = newRole;
    }

    /**
     *
     */
    supportsDTMF(): boolean {
        return this._supportsDTMF;
    }
}
