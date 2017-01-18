/* global Strophe */
import * as JitsiConferenceEvents from "./JitsiConferenceEvents";
import * as MediaType from "./service/RTC/MediaType";

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
     */
    constructor(jid, conference, displayName, hidden) {
        this._jid = jid;
        this._id = Strophe.getResourceFromJid(jid);
        this._conference = conference;
        this._displayName = displayName;
        this._supportsDTMF = false;
        this._tracks = [];
        this._role = 'none';
        this._status = null;
        this._availableDevices = {
            audio: undefined,
            video: undefined
        };
        this._hidden = hidden;
        this._isConnectionActive = true;
        this._properties = {};
    }

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
        return this.getTracks().some(function(jitsiTrack) {
            return jitsiTrack.getType() === MediaType.VIDEO
                && jitsiTrack.isWebRTCTrackMuted();
        });
    }

    /**
     * Updates participant's connection status.
     * @param {boolean} isActive true if the user's connection is fine or false
     * when the user is having connectivity issues.
     * @private
     */
    _setIsConnectionActive(isActive) {
        this._isConnectionActive = isActive;
    }

    /**
     * Checks participant's connectivity status.
     *
     * @returns {boolean} true if the connection is currently ok or false when
     * the user is having connectivity issues.
     */
    isConnectionActive() {
        return this._isConnectionActive;
    }

    /**
     * Sets the value of a property of this participant, and fires an event if
     * the value has changed.
     * @name the name of the property.
     * @value the value to set.
     */
    setProperty(name, value) {
        var oldValue = this._properties[name];

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
     * @returns {String} The status of the participant.
     */
    getStatus () {
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

    // Gets a link to an etherpad instance advertised by the participant?
    //getEtherpad() {
    //}

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
     * @returns {???} The latest statistics reported by this participant (i.e.
     * info used to populate the GSM bars)
     * TODO: do we expose this or handle it internally?
     */
    getLatestStats() {
    }

    /**
     * @returns {String} The role of this participant.
     */
    getRole() {
        return this._role;
    }

    /**
     * @returns {Boolean} Whether this participant is the conference focus (i.e.
     * jicofo).
     */
    isFocus() {
    }

    /**
     * @returns {Boolean} Whether this participant is a conference recorder
     * (i.e. jirecon).
     */
    isRecorder() {
    }

    /**
     * @returns {Boolean} Whether this participant is a SIP gateway (i.e.
     * jigasi).
     */
    isSipGateway() {
    }

    /**
     * @returns {Boolean} Whether this participant is currently sharing their
     * screen.
     */
    isScreenSharing() {
    }

    /**
     * @returns {String} The user agent of this participant (i.e. browser
     * userAgent string).
     */
    getUserAgent() {
    }

    /**
     * Kicks the participant from the conference (requires certain privileges).
     */
    kick() {
    }

    /**
     * Asks this participant to mute themselves.
     */
    askToMute() {
    }

    supportsDTMF() {
        return this._supportsDTMF;
    }

    /**
     * Returns a set with the features for the participant.
     * @param {int} timeout the timeout in ms for reply from the participant.
     * @returns {Promise<Set<String>, Error>}
     */
    getFeatures(timeout = 5000) {
        return this._conference.xmpp.caps.getFeatures(this._jid, timeout);
    }
}
