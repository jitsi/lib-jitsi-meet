/* global Strophe */
var JitsiConferenceEvents = require('./JitsiConferenceEvents');

/**
 * Represents a participant in (a member of) a conference.
 * @param jid the conference XMPP jid
 * @param conference
 * @param displayName
 * @param isHidden indicates if this participant is a hidden participant
 */
function JitsiParticipant(jid, conference, displayName, isHidden){
    this._jid = jid;
    this._id = Strophe.getResourceFromJid(jid);
    this._conference = conference;
    this._displayName = displayName;
    this._supportsDTMF = false;
    // Indicates whether the participant ever had (audio/video) track in _tracks
    this._hadTrack = {
        audio: false,
        video: false
    }
    this._tracks = [];
    this._role = 'none';
    this._status = null;
    this._availableDevices = {
        audio: undefined,
        video: undefined
    };
    this._isHidden = isHidden;
    this._properties = {};
}

/**
 * @returns {JitsiConference} The conference that this participant belongs to.
 */
JitsiParticipant.prototype.getConference = function() {
    return this._conference;
};

/**
 * Gets the value of a property of this participant.
 */
JitsiParticipant.prototype.getProperty = function(name) {
    return this._properties[name];
};

/**
 * Sets the value of a property of this participant, and fires an event if the
 * value has changed.
 * @name the name of the property.
 * @value the value to set.
 */
JitsiParticipant.prototype.setProperty = function(name, value) {
    var oldValue = this._properties[name];
    this._properties[name] = value;

    if (value !== oldValue) {
        this._conference.eventEmitter.emit(
            JitsiConferenceEvents.PARTICIPANT_PROPERTY_CHANGED,
            this,
            name,
            oldValue,
            value);
    }
};

/**
 * @returns {Array.<JitsiTrack>} The list of media tracks for this participant.
 */
JitsiParticipant.prototype.getTracks = function() {
    return this._tracks.slice();
};

/**
 * @returns {String} The ID of this participant.
 */
JitsiParticipant.prototype.getId = function() {
    return this._id;
};

/**
 * @returns {String} The JID of this participant.
 */
JitsiParticipant.prototype.getJid = function() {
    return this._jid;
};

/**
 * @returns {String} The human-readable display name of this participant.
 */
JitsiParticipant.prototype.getDisplayName = function() {
    return this._displayName;
};

/**
 * @returns {String} The status of the participant.
 */
JitsiParticipant.prototype.getStatus = function () {
    return this._status;
};

/**
 * @returns {Boolean} Whether this participant is a moderator or not.
 */
JitsiParticipant.prototype.isModerator = function() {
    return this._role === 'moderator';
};

/**
 * @returns {Boolean} Whether this participant is a hidden participant. Some
 * special system participants may want to join hidden (like for example the
 * recorder).
 */
JitsiParticipant.prototype.isHidden = function() {
    return this._isHidden;
};

// Gets a link to an etherpad instance advertised by the participant?
//JitsiParticipant.prototype.getEtherpad = function() {
//
//}


/*
 * @returns {Boolean} Whether this participant has muted their audio.
 */
JitsiParticipant.prototype.isAudioMuted = function() {
    return this.getTracks().reduce(function (track, isAudioMuted) {
        return isAudioMuted && (track.isVideoTrack() || track.isMuted());
    }, true);
};

/*
 * @returns {Boolean} Whether this participant has muted their video.
 */
JitsiParticipant.prototype.isVideoMuted = function() {
    return this.getTracks().reduce(function (track, isVideoMuted) {
        return isVideoMuted && (track.isAudioTrack() || track.isMuted());
    }, true);
};

/*
 * @returns {???} The latest statistics reported by this participant
 * (i.e. info used to populate the GSM bars)
 * TODO: do we expose this or handle it internally?
 */
JitsiParticipant.prototype.getLatestStats = function() {

};

/**
 * @returns {String} The role of this participant.
 */
JitsiParticipant.prototype.getRole = function() {
    return this._role;
};

/*
 * @returns {Boolean} Whether this participant is
 * the conference focus (i.e. jicofo).
 */
JitsiParticipant.prototype.isFocus = function() {

};

/*
 * @returns {Boolean} Whether this participant is
 * a conference recorder (i.e. jirecon).
 */
JitsiParticipant.prototype.isRecorder = function() {

};

/*
 * @returns {Boolean} Whether this participant is a SIP gateway (i.e. jigasi).
 */
JitsiParticipant.prototype.isSipGateway = function() {

};

/**
 * @returns {Boolean} Whether this participant
 * is currently sharing their screen.
 */
JitsiParticipant.prototype.isScreenSharing = function() {

};

/**
 * @returns {String} The user agent of this participant
 * (i.e. browser userAgent string).
 */
JitsiParticipant.prototype.getUserAgent = function() {

};

/**
 * Kicks the participant from the conference (requires certain privileges).
 */
JitsiParticipant.prototype.kick = function() {

};

/**
 * Asks this participant to mute themselves.
 */
JitsiParticipant.prototype.askToMute = function() {

};

JitsiParticipant.prototype.supportsDTMF = function () {
    return this._supportsDTMF;
};

/**
 * Adds track to participant
 * @param track {JitsiRemoteTrack} the track
 */
JitsiParticipant.prototype.addTrack = function (track) {
    this._hadTrack[track.getType()] = true;
    this._tracks.push(track);
};

/**
 * Removes track from participant
 * @param streamId {string} the id of the MediaStream object attached to the
 * track
 * @param trackId {string} the id of the MediaStreamTrack object attached to the
 * track
 */
JitsiParticipant.prototype.removeTrack = function (streamId, trackId) {
    for(var i = 0; i < this._tracks.length; i++) {
        var track = this._tracks[i];
        if(track && track.getStreamId() == streamId &&
            track.getTrackId() == trackId)
            return this._tracks.splice(i, 1)[0];
    }
};

module.exports = JitsiParticipant;
