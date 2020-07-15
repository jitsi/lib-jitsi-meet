
import { getLogger } from 'jitsi-meet-logger';
import { Strophe } from 'strophe.js';


import * as JitsiConferenceEvents from './JitsiConferenceEvents';
import { ParticipantConnectionStatus }
    from './modules/connectivity/ParticipantConnectionStatus';
import { ERROR_FEATURE_VERSION_MISMATCH } from './modules/xmpp/Caps';
import * as MediaType from './service/RTC/MediaType';

const logger = getLogger(__filename);

/**
 * Represents a participant in (i.e. a member of) a conference.
 */
export default class JitsiParticipant {

    /* eslint-disable max-params */

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
    constructor(jid, conference, displayName, hidden, statsID, status, identity) {
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
        this._connectionStatus = ParticipantConnectionStatus.ACTIVE;
        this._properties = {};
        this._identity = identity;
    }

    /* eslint-enable max-params */

    /**
     * @returns {JitsiConference} The conference that this participant belongs
     * to.
     */
    getConference() {
        return this._conference;
    }

    /**
     * Gets the value of a property of this participant.
     */
    getProperty(name) {
        return this._properties[name];
    }

    /**
     * Checks whether this <tt>JitsiParticipant</tt> has any video tracks which
     * are muted according to their underlying WebRTC <tt>MediaStreamTrack</tt>
     * muted status.
     * @return {boolean} <tt>true</tt> if this <tt>participant</tt> contains any
     * video <tt>JitsiTrack</tt>s which are muted as defined in
     * {@link JitsiTrack.isWebRTCTrackMuted}.
     */
    hasAnyVideoTrackWebRTCMuted() {
        return (
            this.getTracks().some(
                jitsiTrack =>
                    jitsiTrack.getType() === MediaType.VIDEO
                        && jitsiTrack.isWebRTCTrackMuted()));
    }

    /**
     * Updates participant's connection status.
     * @param {string} state the current participant connection state.
     * {@link ParticipantConnectionStatus}.
     * @private
     */
    _setConnectionStatus(status) {
        this._connectionStatus = status;
    }

    /**
     * Return participant's connectivity status.
     *
     * @returns {string} the connection status
     * <tt>ParticipantConnectionStatus</tt> of the user.
     * {@link ParticipantConnectionStatus}.
     */
    getConnectionStatus() {
        return this._connectionStatus;
    }

    /**
     * Sets the value of a property of this participant, and fires an event if
     * the value has changed.
     * @name the name of the property.
     * @value the value to set.
     */
    setProperty(name, value) {
        const oldValue = this._properties[name];

        if (value !== oldValue) {
            this._properties[name] = value;
            this._conference.eventEmitter.emit(
                JitsiConferenceEvents.PARTICIPANT_PROPERTY_CHANGED,
                this,
                name,
                oldValue,
                value);
        }
    }

    /**
     * @returns {Array.<JitsiTrack>} The list of media tracks for this
     * participant.
     */
    getTracks() {
        return this._tracks.slice();
    }

    /**
     * @param {MediaType} mediaType
     * @returns {Array.<JitsiTrack>} an array of media tracks for this
     * participant, for given media type.
     */
    getTracksByMediaType(mediaType) {
        return this.getTracks().filter(track => track.getType() === mediaType);
    }

    /**
     * @returns {String} The ID of this participant.
     */
    getId() {
        return this._id;
    }

    /**
     * @returns {String} The JID of this participant.
     */
    getJid() {
        return this._jid;
    }

    /**
     * @returns {String} The human-readable display name of this participant.
     */
    getDisplayName() {
        return this._displayName;
    }

    /**
     * @returns {String} The stats ID of this participant.
     */
    getStatsID() {
        return this._statsID;
    }

    /**
     * @returns {String} The status of the participant.
     */
    getStatus() {
        return this._status;
    }

    /**
     * @returns {Boolean} Whether this participant is a moderator or not.
     */
    isModerator() {
        return this._role === 'moderator';
    }

    /**
     * @returns {Boolean} Whether this participant is a hidden participant. Some
     * special system participants may want to join hidden (like for example the
     * recorder).
     */
    isHidden() {
        return this._hidden;
    }

    /**
     * @returns {Boolean} Whether this participant has muted their audio.
     */
    isAudioMuted() {
        return this._isMediaTypeMuted(MediaType.AUDIO);
    }

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
    _isMediaTypeMuted(mediaType) {
        return this.getTracks().reduce(
            (muted, track) =>
                muted && (track.getType() !== mediaType || track.isMuted()),
            true);
    }

    /**
     * @returns {Boolean} Whether this participant has muted their video.
     */
    isVideoMuted() {
        return this._isMediaTypeMuted(MediaType.VIDEO);
    }

    /**
     * @returns {String} The role of this participant.
     */
    getRole() {
        return this._role;
    }

    /**
     *
     */
    supportsDTMF() {
        return this._supportsDTMF;
    }

    /**
     * Returns a set with the features for the participant.
     * @param {int} timeout the timeout in ms for reply from the participant.
     * @returns {Promise<Set<String>, Error>}
     */
    getFeatures(timeout = 5000) {
        if (this._getFeaturesPromise) {
            return this._getFeaturesPromise;
        }

        this._getFeaturesPromise = this._conference.xmpp.caps.getFeatures(this._jid, timeout)
            .catch(error => {
                // Retry on feature version mismatch
                if (error === ERROR_FEATURE_VERSION_MISMATCH) {
                    return this._conference.xmpp.caps.getFeatures(this._jid, timeout);
                }

                logger.warn(`Failed to discover features of ${this._jid}`, error);

                return Promise.reject(error);
            });

        return this._getFeaturesPromise
            .then(result => {
                this._getFeaturesPromise = undefined;

                return result;
            }, error => {
                this._getFeaturesPromise = undefined;

                throw error;
            });
    }

    /**
     * Returns the bot type for the participant.
     *
     * @returns {string|undefined} - The bot type of the participant.
     */
    getBotType() {
        return this._botType;
    }
}
