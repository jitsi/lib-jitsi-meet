/* global Strophe, $, Promise */
/* jshint -W101 */
var logger = require("jitsi-meet-logger").getLogger(__filename);
var RTC = require("./modules/RTC/RTC");
var XMPPEvents = require("./service/xmpp/XMPPEvents");
var AuthenticationEvents = require("./service/authentication/AuthenticationEvents");
var RTCEvents = require("./service/RTC/RTCEvents");
var EventEmitter = require("events");
var JitsiConferenceEvents = require("./JitsiConferenceEvents");
var JitsiConferenceErrors = require("./JitsiConferenceErrors");
var JitsiParticipant = require("./JitsiParticipant");
var Statistics = require("./modules/statistics/statistics");
var JitsiDTMFManager = require('./modules/DTMF/JitsiDTMFManager');
var JitsiTrackEvents = require("./JitsiTrackEvents");
var JitsiTrackErrors = require("./JitsiTrackErrors");
var Settings = require("./modules/settings/Settings");
var ComponentsVersions = require("./modules/version/ComponentsVersions");

/**
 * Creates a JitsiConference object with the given name and properties.
 * Note: this constructor is not a part of the public API (objects should be
 * created using JitsiConnection.createConference).
 * @param options.config properties / settings related to the conference that will be created.
 * @param options.name the name of the conference
 * @param options.connection the JitsiConnection object for this JitsiConference.
 * @constructor
 */
function JitsiConference(options) {
    if(!options.name || options.name.toLowerCase() !== options.name) {
        logger.error("Invalid conference name (no conference name passed or it"
            + "contains invalid characters like capital letters)!");
         return;
    }
    this.options = options;
    this.connection = this.options.connection;
    this.xmpp = this.connection.xmpp;
    this.eventEmitter = new EventEmitter();
    var confID = this.options.name  + '@' + this.xmpp.options.hosts.muc;
    this.settings = new Settings();
    this.room = this.xmpp.createRoom(this.options.name, this.options.config,
        this.settings);
    this.componentsVersions = new ComponentsVersions(this.room);
    this.room.updateDeviceAvailability(RTC.getDeviceAvailability());
    this.rtc = new RTC(this.room, options);
    this.statistics = new Statistics(this.xmpp, {
        callStatsID: this.options.config.callStatsID,
        callStatsSecret: this.options.config.callStatsSecret,
        disableThirdPartyRequests: this.options.config.disableThirdPartyRequests
    });
    setupListeners(this);
    var JitsiMeetJS = this.connection.JitsiMeetJS;
    JitsiMeetJS._gumFailedHandler.push(function(error) {
        this.statistics.sendGetUserMediaFailed(error);
    }.bind(this));
    JitsiMeetJS._globalOnErrorHandler.push(function(error) {
        this.statistics.sendUnhandledError(error);
    }.bind(this));
    this.participants = {};
    this.lastDominantSpeaker = null;
    this.dtmfManager = null;
    this.somebodySupportsDTMF = false;
    this.authEnabled = false;
    this.authIdentity;
    this.startAudioMuted = false;
    this.startVideoMuted = false;
    this.startMutedPolicy = {audio: false, video: false};
    this.availableDevices = {
        audio: undefined,
        video: undefined
    };
    this.isMutedByFocus = false;
}

/**
 * Joins the conference.
 * @param password {string} the password
 */
JitsiConference.prototype.join = function (password) {
    if(this.room)
        this.room.join(password);
};

/**
 * Check if joined to the conference.
 */
JitsiConference.prototype.isJoined = function () {
    return this.room && this.room.joined;
};

/**
 * Leaves the conference and calls onMemberLeft for every participant.
 */
JitsiConference.prototype._leaveRoomAndRemoveParticipants = function () {
    // leave the conference
    if (this.room) {
        this.room.leave();
    }

    this.room = null;
    // remove all participants
    this.getParticipants().forEach(function (participant) {
        this.onMemberLeft(participant.getJid());
    }.bind(this));
}
/**
 * Leaves the conference.
 * @returns {Promise}
 */
JitsiConference.prototype.leave = function () {
    var conference = this;

    return Promise.all(
        conference.getLocalTracks().map(function (track) {
            return conference.removeTrack(track);
        })
    ).then(this._leaveRoomAndRemoveParticipants.bind(this))
    .catch(function (error) {
        logger.error(error);
        // We are proceeding with leaving the conference because room.leave may
        // succeed.
        this._leaveRoomAndRemoveParticipants();
        return Promise.resolve();
    }.bind(this));
};

/**
 * Returns name of this conference.
 */
JitsiConference.prototype.getName = function () {
    return this.options.name;
};

/**
 * Check if authentication is enabled for this conference.
 */
JitsiConference.prototype.isAuthEnabled = function () {
    return this.authEnabled;
};

/**
 * Check if user is logged in.
 */
JitsiConference.prototype.isLoggedIn = function () {
    return !!this.authIdentity;
};

/**
 * Get authorized login.
 */
JitsiConference.prototype.getAuthLogin = function () {
    return this.authIdentity;
};

/**
 * Check if external authentication is enabled for this conference.
 */
JitsiConference.prototype.isExternalAuthEnabled = function () {
    return this.room && this.room.moderator.isExternalAuthEnabled();
};

/**
 * Get url for external authentication.
 * @param {boolean} [urlForPopup] if true then return url for login popup,
 *                                else url of login page.
 * @returns {Promise}
 */
JitsiConference.prototype.getExternalAuthUrl = function (urlForPopup) {
    return new Promise(function (resolve, reject) {
        if (!this.isExternalAuthEnabled()) {
            reject();
            return;
        }
        if (urlForPopup) {
            this.room.moderator.getPopupLoginUrl(resolve, reject);
        } else {
            this.room.moderator.getLoginUrl(resolve, reject);
        }
    }.bind(this));
};

/**
 * Returns the local tracks.
 */
JitsiConference.prototype.getLocalTracks = function () {
    if (this.rtc) {
        return this.rtc.localTracks.slice();
    } else {
        return [];
    }
};


/**
 * Attaches a handler for events(For example - "participant joined".) in the conference. All possible event are defined
 * in JitsiConferenceEvents.
 * @param eventId the event ID.
 * @param handler handler for the event.
 *
 * Note: consider adding eventing functionality by extending an EventEmitter impl, instead of rolling ourselves
 */
JitsiConference.prototype.on = function (eventId, handler) {
    if(this.eventEmitter)
        this.eventEmitter.on(eventId, handler);
};

/**
 * Removes event listener
 * @param eventId the event ID.
 * @param [handler] optional, the specific handler to unbind
 *
 * Note: consider adding eventing functionality by extending an EventEmitter impl, instead of rolling ourselves
 */
JitsiConference.prototype.off = function (eventId, handler) {
    if(this.eventEmitter)
        this.eventEmitter.removeListener(eventId, handler);
};

// Common aliases for event emitter
JitsiConference.prototype.addEventListener = JitsiConference.prototype.on;
JitsiConference.prototype.removeEventListener = JitsiConference.prototype.off;

/**
 * Receives notifications from other participants about commands / custom events
 * (sent by sendCommand or sendCommandOnce methods).
 * @param command {String} the name of the command
 * @param handler {Function} handler for the command
 */
 JitsiConference.prototype.addCommandListener = function (command, handler) {
    if(this.room)
        this.room.addPresenceListener(command, handler);
 };

/**
  * Removes command  listener
  * @param command {String} the name of the command
  */
 JitsiConference.prototype.removeCommandListener = function (command) {
    if(this.room)
        this.room.removePresenceListener(command);
 };

/**
 * Sends text message to the other participants in the conference
 * @param message the text message.
 */
JitsiConference.prototype.sendTextMessage = function (message) {
    if(this.room)
        this.room.sendMessage(message);
};

/**
 * Send presence command.
 * @param name {String} the name of the command.
 * @param values {Object} with keys and values that will be sent.
 **/
JitsiConference.prototype.sendCommand = function (name, values) {
    if(this.room) {
        this.room.addToPresence(name, values);
        this.room.sendPresence();
    }
};

/**
 * Send presence command one time.
 * @param name {String} the name of the command.
 * @param values {Object} with keys and values that will be sent.
 **/
JitsiConference.prototype.sendCommandOnce = function (name, values) {
    this.sendCommand(name, values);
    this.removeCommand(name);
};

/**
 * Removes presence command.
 * @param name {String} the name of the command.
 **/
JitsiConference.prototype.removeCommand = function (name) {
    if(this.room)
        this.room.removeFromPresence(name);
};

/**
 * Sets the display name for this conference.
 * @param name the display name to set
 */
JitsiConference.prototype.setDisplayName = function(name) {
    if(this.room){
        // remove previously set nickname
        this.room.removeFromPresence("nick");

        this.room.addToPresence("nick", {attributes: {xmlns: 'http://jabber.org/protocol/nick'}, value: name});
        this.room.sendPresence();
    }
};

/**
 * Set new subject for this conference. (available only for moderator)
 * @param {string} subject new subject
 */
JitsiConference.prototype.setSubject = function (subject) {
    if (this.room && this.isModerator()) {
        this.room.setSubject(subject);
    }
};

/**
 * Adds JitsiLocalTrack object to the conference.
 * @param track the JitsiLocalTrack object.
 * @returns {Promise<JitsiLocalTrack>}
 * @throws will throw and error if track is video track
 * and there is already another video track in the conference.
 */
JitsiConference.prototype.addTrack = function (track) {
    if(track.disposed)
    {
        throw new Error(JitsiTrackErrors.TRACK_IS_DISPOSED);
    }
    
    if (track.isVideoTrack() && this.rtc.getLocalVideoTrack()) {
        throw new Error("cannot add second video track to the conference");
    }

    track.ssrcHandler = function (conference, ssrcMap) {
        if(ssrcMap[this.getMSID()]){
            this._setSSRC(ssrcMap[this.getMSID()]);
            conference.room.removeListener(XMPPEvents.SENDRECV_STREAMS_CHANGED,
                this.ssrcHandler);
        }
    }.bind(track, this);
    this.room.addListener(XMPPEvents.SENDRECV_STREAMS_CHANGED,
        track.ssrcHandler);

    return new Promise(function (resolve) {
        this.room.addStream(track.getOriginalStream(), function () {
            if (track.isVideoTrack()) {
                this.removeCommand("videoType");
                this.sendCommand("videoType", {
                    value: track.videoType,
                    attributes: {
                        xmlns: 'http://jitsi.org/jitmeet/video'
                    }
                });
            }
            this.rtc.addLocalTrack(track);
            if (track.startMuted) {
                track.mute();
            }

            // ensure that we're sharing proper "is muted" state
            if (track.isAudioTrack()) {
                this.room.setAudioMute(track.isMuted());
            } else {
                this.room.setVideoMute(track.isMuted());
            }

            track.muteHandler = this._fireMuteChangeEvent.bind(this, track);
            track.audioLevelHandler = this._fireAudioLevelChangeEvent.bind(this);
            track.addEventListener(JitsiTrackEvents.TRACK_MUTE_CHANGED,
                                   track.muteHandler);
            track.addEventListener(JitsiTrackEvents.TRACK_AUDIO_LEVEL_CHANGED,
                                   track.audioLevelHandler);
            //FIXME: This dependacy is not necessary. This is quick fix.
            track._setConference(this);

            // send event for starting screen sharing
            // FIXME: we assume we have only one screen sharing track
            // if we change this we need to fix this check
            if (track.isVideoTrack() && track.videoType === "desktop")
                this.statistics.sendScreenSharingEvent(true);

            this.eventEmitter.emit(JitsiConferenceEvents.TRACK_ADDED, track);
            resolve(track);
        }.bind(this));
    }.bind(this));
};

/**
 * Fires TRACK_AUDIO_LEVEL_CHANGED change conference event.
 * @param audioLevel the audio level
 */
JitsiConference.prototype._fireAudioLevelChangeEvent = function (audioLevel) {
    this.eventEmitter.emit(
        JitsiConferenceEvents.TRACK_AUDIO_LEVEL_CHANGED,
        this.myUserId(), audioLevel);
};

/**
 * Fires TRACK_MUTE_CHANGED change conference event.
 * @param track the JitsiTrack object related to the event.
 */
JitsiConference.prototype._fireMuteChangeEvent = function (track) {
    // check if track was muted by focus and now is unmuted by user
    if (this.isMutedByFocus && track.isAudioTrack() && !track.isMuted()) {
        this.isMutedByFocus = false;
        // unmute local user on server
        this.room.muteParticipant(this.room.myroomjid, false);
    }
    this.eventEmitter.emit(JitsiConferenceEvents.TRACK_MUTE_CHANGED, track);
};

/**
 * Removes JitsiLocalTrack object to the conference.
 * @param track the JitsiLocalTrack object.
 * @returns {Promise}
 */
JitsiConference.prototype.removeTrack = function (track) {
    if(track.disposed)
    {
        throw new Error(JitsiTrackErrors.TRACK_IS_DISPOSED);
    }

    if(!this.room){
        if(this.rtc) {
            this.rtc.removeLocalTrack(track);
            this.eventEmitter.emit(JitsiConferenceEvents.TRACK_REMOVED, track);
        }
        return Promise.resolve();
    }
    return new Promise(function (resolve) {
        this.room.removeStream(track.getOriginalStream(), function(){
            track._setSSRC(null);
            //FIXME: This dependacy is not necessary. This is quick fix.
            track._setConference(this);
            this.rtc.removeLocalTrack(track);
            track.removeEventListener(JitsiTrackEvents.TRACK_MUTE_CHANGED,
                track.muteHandler);
            track.removeEventListener(JitsiTrackEvents.TRACK_AUDIO_LEVEL_CHANGED,
                track.audioLevelHandler);
            this.room.removeListener(XMPPEvents.SENDRECV_STREAMS_CHANGED,
                track.ssrcHandler);

            // send event for stopping screen sharing
            // FIXME: we assume we have only one screen sharing track
            // if we change this we need to fix this check
            if (track.isVideoTrack() && track.videoType === "desktop")
                this.statistics.sendScreenSharingEvent(false);

            this.eventEmitter.emit(JitsiConferenceEvents.TRACK_REMOVED, track);
            resolve();
        }.bind(this), {
            mtype: track.getType(),
            type: "remove",
            ssrc: track.ssrc});
    }.bind(this));
};

/**
 * Get role of the local user.
 * @returns {string} user role: 'moderator' or 'none'
 */
JitsiConference.prototype.getRole = function () {
    return this.room.role;
};

/**
 * Check if local user is moderator.
 * @returns {boolean} true if local user is moderator, false otherwise.
 */
JitsiConference.prototype.isModerator = function () {
    return this.room.isModerator();
};

/**
 * Set password for the room.
 * @param {string} password new password for the room.
 * @returns {Promise}
 */
JitsiConference.prototype.lock = function (password) {
  if (!this.isModerator()) {
    return Promise.reject();
  }

  var conference = this;
  return new Promise(function (resolve, reject) {
    conference.room.lockRoom(password || "", function () {
      resolve();
    }, function (err) {
      reject(err);
    }, function () {
      reject(JitsiConferenceErrors.PASSWORD_NOT_SUPPORTED);
    });
  });
};

/**
 * Remove password from the room.
 * @returns {Promise}
 */
JitsiConference.prototype.unlock = function () {
  return this.lock();
};

/**
 * Elects the participant with the given id to be the selected participant or the speaker.
 * @param id the identifier of the participant
 */
JitsiConference.prototype.selectParticipant = function(participantId) {
    if (this.rtc) {
        this.rtc.selectedEndpoint(participantId);
    }
};

/**
 *
 * @param id the identifier of the participant
 */
JitsiConference.prototype.pinParticipant = function(participantId) {
    if (this.rtc) {
        this.rtc.pinEndpoint(participantId);
    }
};

/**
 * Returns the list of participants for this conference.
 * @return Array<JitsiParticipant> a list of participant identifiers containing all conference participants.
 */
JitsiConference.prototype.getParticipants = function() {
    return Object.keys(this.participants).map(function (key) {
        return this.participants[key];
    }, this);
};

/**
 * @returns {JitsiParticipant} the participant in this conference with the specified id (or
 * undefined if there isn't one).
 * @param id the id of the participant.
 */
JitsiConference.prototype.getParticipantById = function(id) {
    return this.participants[id];
};

/**
 * Kick participant from this conference.
 * @param {string} id id of the participant to kick
 */
JitsiConference.prototype.kickParticipant = function (id) {
    var participant = this.getParticipantById(id);
    if (!participant) {
        return;
    }
    this.room.kick(participant.getJid());
};

/**
 * Kick participant from this conference.
 * @param {string} id id of the participant to kick
 */
JitsiConference.prototype.muteParticipant = function (id) {
    var participant = this.getParticipantById(id);
    if (!participant) {
        return;
    }
    this.room.muteParticipant(participant.getJid(), true);
};

/**
 * Indicates that a participant has joined the conference.
 *
 * @param jid the jid of the participant in the MUC
 * @param nick the display name of the participant
 * @param role the role of the participant in the MUC
 * @param isHidden indicates if this is a hidden participant (sysem participant,
 * for example a recorder).
 */
JitsiConference.prototype.onMemberJoined
    = function (jid, nick, role, isHidden) {
    var id = Strophe.getResourceFromJid(jid);
    if (id === 'focus' || this.myUserId() === id) {
       return;
    }
    var participant = new JitsiParticipant(jid, this, nick, isHidden);
    participant._role = role;
    this.participants[id] = participant;
    this.eventEmitter.emit(JitsiConferenceEvents.USER_JOINED, id, participant);
    // XXX Since disco is checked in multiple places (e.g.
    // modules/xmpp/strophe.jingle.js, modules/xmpp/strophe.rayo.js), check it
    // here as well.
    var disco = this.xmpp.connection.disco;
    if (disco) {
        disco.info(
            jid, "node", function(iq) {
                participant._supportsDTMF = $(iq).find(
                    '>query>feature[var="urn:xmpp:jingle:dtmf:0"]').length > 0;
                this.updateDTMFSupport();
            }.bind(this)
        );
    } else {
      // FIXME Should participant._supportsDTMF be assigned false here (and
      // this.updateDTMFSupport invoked)?
    }
};

JitsiConference.prototype.onMemberLeft = function (jid) {
    var id = Strophe.getResourceFromJid(jid);
    if (id === 'focus' || this.myUserId() === id) {
       return;
    }
    var participant = this.participants[id];
    delete this.participants[id];

    this.rtc.removeRemoteTracks(id);

    this.eventEmitter.emit(JitsiConferenceEvents.USER_LEFT, id, participant);
};

JitsiConference.prototype.onUserRoleChanged = function (jid, role) {
    var id = Strophe.getResourceFromJid(jid);
    var participant = this.getParticipantById(id);
    if (!participant) {
        return;
    }
    participant._role = role;
    this.eventEmitter.emit(JitsiConferenceEvents.USER_ROLE_CHANGED, id, role);
};

JitsiConference.prototype.onDisplayNameChanged = function (jid, displayName) {
    var id = Strophe.getResourceFromJid(jid);
    var participant = this.getParticipantById(id);
    if (!participant) {
        return;
    }

    if (participant._displayName === displayName)
        return;

    participant._displayName = displayName;
    this.eventEmitter.emit(JitsiConferenceEvents.DISPLAY_NAME_CHANGED, id, displayName);
};

JitsiConference.prototype.onTrackAdded = function (track) {
    var id = track.getParticipantId();
    var participant = this.getParticipantById(id);
    if (!participant) {
        return;
    }
    // add track to JitsiParticipant
    participant._tracks.push(track);

    var emitter = this.eventEmitter;
    track.addEventListener(
        JitsiTrackEvents.TRACK_MUTE_CHANGED,
        function () {
            emitter.emit(JitsiConferenceEvents.TRACK_MUTE_CHANGED, track);
        }
    );
    track.addEventListener(
        JitsiTrackEvents.TRACK_AUDIO_LEVEL_CHANGED,
        function (audioLevel) {
            emitter.emit(JitsiConferenceEvents.TRACK_AUDIO_LEVEL_CHANGED, id, audioLevel);
        }
    );

    this.eventEmitter.emit(JitsiConferenceEvents.TRACK_ADDED, track);
};

JitsiConference.prototype.updateDTMFSupport = function () {
    var somebodySupportsDTMF = false;
    var participants = this.getParticipants();

    // check if at least 1 participant supports DTMF
    for (var i = 0; i < participants.length; i += 1) {
        if (participants[i].supportsDTMF()) {
            somebodySupportsDTMF = true;
            break;
        }
    }
    if (somebodySupportsDTMF !== this.somebodySupportsDTMF) {
        this.somebodySupportsDTMF = somebodySupportsDTMF;
        this.eventEmitter.emit(JitsiConferenceEvents.DTMF_SUPPORT_CHANGED, somebodySupportsDTMF);
    }
};

/**
 * Allows to check if there is at least one user in the conference
 * that supports DTMF.
 * @returns {boolean} true if somebody supports DTMF, false otherwise
 */
JitsiConference.prototype.isDTMFSupported = function () {
    return this.somebodySupportsDTMF;
};

/**
 * Returns the local user's ID
 * @return {string} local user's ID
 */
JitsiConference.prototype.myUserId = function () {
    return (this.room && this.room.myroomjid)? Strophe.getResourceFromJid(this.room.myroomjid) : null;
};

JitsiConference.prototype.sendTones = function (tones, duration, pause) {
    if (!this.dtmfManager) {
        var connection = this.xmpp.connection.jingle.activecall.peerconnection;
        if (!connection) {
            logger.warn("cannot sendTones: no conneciton");
            return;
        }

        var tracks = this.getLocalTracks().filter(function (track) {
            return track.isAudioTrack();
        });
        if (!tracks.length) {
            logger.warn("cannot sendTones: no local audio stream");
            return;
        }
        this.dtmfManager = new JitsiDTMFManager(tracks[0], connection);
    }

    this.dtmfManager.sendTones(tones, duration, pause);
};

/**
 * Returns true if the recording is supproted and false if not.
 */
JitsiConference.prototype.isRecordingSupported = function () {
    if(this.room)
        return this.room.isRecordingSupported();
    return false;
};

/**
 * Returns null if the recording is not supported, "on" if the recording started
 * and "off" if the recording is not started.
 */
JitsiConference.prototype.getRecordingState = function () {
    return (this.room) ? this.room.getRecordingState() : undefined;
}

/**
 * Returns the url of the recorded video.
 */
JitsiConference.prototype.getRecordingURL = function () {
    return (this.room) ? this.room.getRecordingURL() : null;
}

/**
 * Starts/stops the recording
 */
JitsiConference.prototype.toggleRecording = function (options) {
    if(this.room)
        return this.room.toggleRecording(options, function (status, error) {
            this.eventEmitter.emit(
                JitsiConferenceEvents.RECORDER_STATE_CHANGED, status, error);
        }.bind(this));
    this.eventEmitter.emit(
        JitsiConferenceEvents.RECORDER_STATE_CHANGED, "error",
        new Error("The conference is not created yet!"));
}

/**
 * Returns true if the SIP calls are supported and false otherwise
 */
JitsiConference.prototype.isSIPCallingSupported = function () {
    if(this.room)
        return this.room.isSIPCallingSupported();
    return false;
}

/**
 * Dials a number.
 * @param number the number
 */
JitsiConference.prototype.dial = function (number) {
    if(this.room)
        return this.room.dial(number);
    return new Promise(function(resolve, reject){
        reject(new Error("The conference is not created yet!"))});
}

/**
 * Hangup an existing call
 */
JitsiConference.prototype.hangup = function () {
    if(this.room)
        return this.room.hangup();
    return new Promise(function(resolve, reject){
        reject(new Error("The conference is not created yet!"))});
}

/**
 * Returns the phone number for joining the conference.
 */
JitsiConference.prototype.getPhoneNumber = function () {
    if(this.room)
        return this.room.getPhoneNumber();
    return null;
}

/**
 * Returns the pin for joining the conference with phone.
 */
JitsiConference.prototype.getPhonePin = function () {
    if(this.room)
        return this.room.getPhonePin();
    return null;
}

/**
 * Returns the connection state for the current room. Its ice connection state
 * for its session.
 */
JitsiConference.prototype.getConnectionState = function () {
    if(this.room)
        return this.room.getConnectionState();
    return null;
}

/**
 * Make all new participants mute their audio/video on join.
 * @param policy {Object} object with 2 boolean properties for video and audio:
 * @param {boolean} audio if audio should be muted.
 * @param {boolean} video if video should be muted.
 */
JitsiConference.prototype.setStartMutedPolicy = function (policy) {
    if (!this.isModerator()) {
        return;
    }
    this.startMutedPolicy = policy;
    this.room.removeFromPresence("startmuted");
    this.room.addToPresence("startmuted", {
        attributes: {
            audio: policy.audio,
            video: policy.video,
            xmlns: 'http://jitsi.org/jitmeet/start-muted'
        }
    });
    this.room.sendPresence();
};

/**
 * Returns current start muted policy
 * @returns {Object} with 2 proprties - audio and video.
 */
JitsiConference.prototype.getStartMutedPolicy = function () {
    return this.startMutedPolicy;
};

/**
 * Check if audio is muted on join.
 */
JitsiConference.prototype.isStartAudioMuted = function () {
    return this.startAudioMuted;
};

/**
 * Check if video is muted on join.
 */
JitsiConference.prototype.isStartVideoMuted = function () {
    return this.startVideoMuted;
};

/**
 * Get object with internal logs.
 */
JitsiConference.prototype.getLogs = function () {
    var data = this.xmpp.getJingleLog();

    var metadata = {};
    metadata.time = new Date();
    metadata.url = window.location.href;
    metadata.ua = navigator.userAgent;

    var log = this.xmpp.getXmppLog();
    if (log) {
        metadata.xmpp = log;
    }

    data.metadata = metadata;

    return data;
};

/**
 * Returns measured connectionTimes.
 */
JitsiConference.prototype.getConnectionTimes = function () {
    return this.room.connectionTimes;
};

/**
 * Sends the given feedback through CallStats if enabled.
 *
 * @param overallFeedback an integer between 1 and 5 indicating the
 * user feedback
 * @param detailedFeedback detailed feedback from the user. Not yet used
 */
JitsiConference.prototype.sendFeedback =
function(overallFeedback, detailedFeedback){
    this.statistics.sendFeedback(overallFeedback, detailedFeedback);
}

/**
 * Returns true if the callstats integration is enabled, otherwise returns
 * false.
 *
 * @returns true if the callstats integration is enabled, otherwise returns
 * false.
 */
JitsiConference.prototype.isCallstatsEnabled = function () {
    return this.statistics.isCallstatsEnabled();
}

/**
 * Setups the listeners needed for the conference.
 * @param conference the conference
 */
function setupListeners(conference) {
    conference.xmpp.addListener(
        XMPPEvents.CALL_INCOMING, function (jingleSession, jingleOffer, now) {

        if (conference.room.isFocus(jingleSession.peerjid)) {
            // Accept incoming call
            conference.room.setJingleSession(jingleSession);
            conference.room.connectionTimes["session.initiate"] = now;
            jingleSession.initialize(false /* initiator */, conference.room);
            conference.rtc.onIncommingCall(jingleSession);
            jingleSession.acceptOffer(jingleOffer, null,
                function (error) {
                    console.error(
                        "Failed to accept incoming Jingle session", error);
                }
            );
            conference.statistics.startRemoteStats(
                    jingleSession.peerconnection);
        } else {
            // Error cause this should never happen unless something is wrong !
            logger.error(
                "Rejecting session-initiate from non focus user: "
                        + jingleSession.peerjid);
        }
    });

    conference.room.addListener(XMPPEvents.REMOTE_TRACK_ADDED,
        function (data) {
            var track = conference.rtc.createRemoteTrack(data);
            if (track) {
                conference.onTrackAdded(track);
            }
        }
    );
    conference.room.addListener(XMPPEvents.REMOTE_TRACK_REMOVED,
        function (streamId, trackId) {
            conference.getParticipants().forEach(function(participant) {
                var tracks = participant.getTracks();
                for(var i = 0; i < tracks.length; i++) {
                    if(tracks[i]
                        && tracks[i].getStreamId() == streamId
                        && tracks[i].getTrackId() == trackId) {
                        var track = participant._tracks.splice(i, 1)[0];
                        conference.eventEmitter.emit(
                            JitsiConferenceEvents.TRACK_REMOVED, track);
                        return;
                    }
                }
            });
        }
    );
    conference.rtc.addListener(RTCEvents.FAKE_VIDEO_TRACK_CREATED,
        function (track) {
            conference.onTrackAdded(track);
        }
    );

    conference.room.addListener(XMPPEvents.AUDIO_MUTED_BY_FOCUS,
        function (value) {
            // set isMutedByFocus when setAudioMute Promise ends
            conference.rtc.setAudioMute(value).then(
                function() {
                    conference.isMutedByFocus = true;
                },
                function() {
                    logger.warn(
                        "Error while audio muting due to focus request");
                });
        }
    );

    conference.room.addListener(XMPPEvents.SUBJECT_CHANGED, function (subject) {
        conference.eventEmitter.emit(JitsiConferenceEvents.SUBJECT_CHANGED,
            subject);
    });

    conference.room.addListener(XMPPEvents.MUC_JOINED, function () {
        conference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_JOINED);
    });
    conference.room.addListener(XMPPEvents.ROOM_JOIN_ERROR, function (pres) {
        conference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED,
            JitsiConferenceErrors.CONNECTION_ERROR, pres);
    });
    conference.room.addListener(XMPPEvents.ROOM_CONNECT_ERROR, function (pres) {
        conference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED,
            JitsiConferenceErrors.CONNECTION_ERROR, pres);
    });
    conference.room.addListener(XMPPEvents.ROOM_MAX_USERS_ERROR,
    function (pres) {
        conference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED,
            JitsiConferenceErrors.CONFERENCE_MAX_USERS, pres);
    });
    conference.room.addListener(XMPPEvents.PASSWORD_REQUIRED, function (pres) {
        conference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED, JitsiConferenceErrors.PASSWORD_REQUIRED, pres);
    });
    conference.room.addListener(XMPPEvents.AUTHENTICATION_REQUIRED, function () {
        conference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED, JitsiConferenceErrors.AUTHENTICATION_REQUIRED);
    });
    conference.room.addListener(XMPPEvents.BRIDGE_DOWN, function () {
        conference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED, JitsiConferenceErrors.VIDEOBRIDGE_NOT_AVAILABLE);
    });
    conference.room.addListener(XMPPEvents.RESERVATION_ERROR, function (code, msg) {
        conference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED, JitsiConferenceErrors.RESERVATION_ERROR, code, msg);
    });
    conference.room.addListener(XMPPEvents.GRACEFUL_SHUTDOWN, function () {
        conference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED, JitsiConferenceErrors.GRACEFUL_SHUTDOWN);
    });
    conference.room.addListener(XMPPEvents.JINGLE_FATAL_ERROR, function () {
        conference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED, JitsiConferenceErrors.JINGLE_FATAL_ERROR);
    });
    conference.room.addListener(XMPPEvents.MUC_DESTROYED, function (reason) {
        conference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED, JitsiConferenceErrors.CONFERENCE_DESTROYED, reason);
    });
    conference.room.addListener(XMPPEvents.CHAT_ERROR_RECEIVED, function (err, msg) {
        conference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_ERROR, JitsiConferenceErrors.CHAT_ERROR, err, msg);
    });
    conference.room.addListener(XMPPEvents.FOCUS_DISCONNECTED, function (focus, retrySec) {
        conference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED, JitsiConferenceErrors.FOCUS_DISCONNECTED, focus, retrySec);
    });
    conference.room.addListener(XMPPEvents.FOCUS_LEFT, function () {
        conference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED, JitsiConferenceErrors.FOCUS_LEFT);
    });
//    FIXME
//    conference.room.addListener(XMPPEvents.MUC_JOINED, function () {
//        conference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_LEFT);
//    });

    conference.room.addListener(XMPPEvents.KICKED, function () {
        conference.eventEmitter.emit(JitsiConferenceEvents.KICKED);
    });

    conference.room.addListener(XMPPEvents.MUC_MEMBER_JOINED, conference.onMemberJoined.bind(conference));
    conference.room.addListener(XMPPEvents.MUC_MEMBER_LEFT, conference.onMemberLeft.bind(conference));

    conference.room.addListener(XMPPEvents.DISPLAY_NAME_CHANGED, conference.onDisplayNameChanged.bind(conference));

    conference.room.addListener(XMPPEvents.LOCAL_ROLE_CHANGED, function (role) {
        conference.eventEmitter.emit(JitsiConferenceEvents.USER_ROLE_CHANGED, conference.myUserId(), role);
    });
    conference.room.addListener(XMPPEvents.MUC_ROLE_CHANGED, conference.onUserRoleChanged.bind(conference));

    conference.room.addListener(XMPPEvents.CONNECTION_INTERRUPTED, function () {
        conference.eventEmitter.emit(JitsiConferenceEvents.CONNECTION_INTERRUPTED);
    });

    conference.room.addListener(XMPPEvents.RECORDER_STATE_CHANGED,
        function (state) {
            conference.eventEmitter.emit(
                JitsiConferenceEvents.RECORDER_STATE_CHANGED, state);
        });

    conference.room.addListener(XMPPEvents.PHONE_NUMBER_CHANGED, function () {
        conference.eventEmitter.emit(
            JitsiConferenceEvents.PHONE_NUMBER_CHANGED);
    });

    conference.room.addListener(XMPPEvents.CONNECTION_RESTORED, function () {
        conference.eventEmitter.emit(JitsiConferenceEvents.CONNECTION_RESTORED);
    });
    conference.room.addListener(XMPPEvents.CONFERENCE_SETUP_FAILED, function () {
        conference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED, JitsiConferenceErrors.SETUP_FAILED);
    });

    conference.room.addListener(AuthenticationEvents.IDENTITY_UPDATED, function (authEnabled, authIdentity) {
        conference.authEnabled = authEnabled;
        conference.authIdentity = authIdentity;
        conference.eventEmitter.emit(JitsiConferenceEvents.AUTH_STATUS_CHANGED, authEnabled, authIdentity);
    });

    conference.room.addListener(XMPPEvents.MESSAGE_RECEIVED, function (jid, displayName, txt, myJid, ts) {
        var id = Strophe.getResourceFromJid(jid);
        conference.eventEmitter.emit(JitsiConferenceEvents.MESSAGE_RECEIVED, id, txt, ts);
    });

    conference.room.addListener(XMPPEvents.PRESENCE_STATUS, function (jid, status) {
        var id = Strophe.getResourceFromJid(jid);
        var participant = conference.getParticipantById(id);
        if (!participant || participant._status === status) {
            return;
        }
        participant._status = status;
        conference.eventEmitter.emit(JitsiConferenceEvents.USER_STATUS_CHANGED, id, status);
    });

    conference.rtc.addListener(RTCEvents.DOMINANTSPEAKER_CHANGED, function (id) {
        if(conference.lastDominantSpeaker !== id && conference.room) {
            conference.lastDominantSpeaker = id;
            conference.eventEmitter.emit(JitsiConferenceEvents.DOMINANT_SPEAKER_CHANGED, id);
        }
        if (conference.statistics && conference.myUserId() === id) {
            // We are the new dominant speaker.
            conference.statistics.sendDominantSpeakerEvent();
        }
    });

    conference.rtc.addListener(RTCEvents.DATA_CHANNEL_OPEN, function () {
        var now = window.performance.now();
        logger.log("(TIME) data channel opened ", now);
        conference.room.connectionTimes["data.channel.opened"] = now;
    });

    conference.rtc.addListener(RTCEvents.LASTN_CHANGED, function (oldValue, newValue) {
        conference.eventEmitter.emit(JitsiConferenceEvents.IN_LAST_N_CHANGED, oldValue, newValue);
    });

    conference.rtc.addListener(RTCEvents.LASTN_ENDPOINT_CHANGED,
        function (lastNEndpoints, endpointsEnteringLastN) {
            conference.eventEmitter.emit(JitsiConferenceEvents.LAST_N_ENDPOINTS_CHANGED,
                lastNEndpoints, endpointsEnteringLastN);
        });

    conference.xmpp.addListener(XMPPEvents.START_MUTED_FROM_FOCUS,
        function (audioMuted, videoMuted) {
            conference.startAudioMuted = audioMuted;
            conference.startVideoMuted = videoMuted;

            // mute existing local tracks because this is initial mute from
            // Jicofo
            conference.getLocalTracks().forEach(function (track) {
                if (conference.startAudioMuted && track.isAudioTrack()) {
                    track.mute();
                }
                if (conference.startVideoMuted && track.isVideoTrack()) {
                    track.mute();
                }
            });

            conference.eventEmitter.emit(JitsiConferenceEvents.STARTED_MUTED);
        });

    conference.room.addPresenceListener("startmuted", function (data, from) {
        var isModerator = false;
        if (conference.myUserId() === from && conference.isModerator()) {
            isModerator = true;
        } else {
            var participant = conference.getParticipantById(from);
            if (participant && participant.isModerator()) {
                isModerator = true;
            }
        }

        if (!isModerator) {
            return;
        }

        var startAudioMuted = data.attributes.audio === 'true';
        var startVideoMuted = data.attributes.video === 'true';

        var updated = false;

        if (startAudioMuted !== conference.startMutedPolicy.audio) {
            conference.startMutedPolicy.audio = startAudioMuted;
            updated = true;
        }

        if (startVideoMuted !== conference.startMutedPolicy.video) {
            conference.startMutedPolicy.video = startVideoMuted;
            updated = true;
        }

        if (updated) {
            conference.eventEmitter.emit(
                JitsiConferenceEvents.START_MUTED_POLICY_CHANGED,
                conference.startMutedPolicy
            );
        }
    });

    conference.rtc.addListener(RTCEvents.AVAILABLE_DEVICES_CHANGED, function (devices) {
        conference.room.updateDeviceAvailability(devices);
    });
    conference.room.addPresenceListener("devices", function (data, from) {
        var isAudioAvailable = false;
        var isVideoAvailable = false;
        data.children.forEach(function (config) {
            if (config.tagName === 'audio') {
                isAudioAvailable = config.value === 'true';
            }
            if (config.tagName === 'video') {
                isVideoAvailable = config.value === 'true';
            }
        });

        var availableDevices;
        if (conference.myUserId() === from) {
            availableDevices = conference.availableDevices;
        } else {
            var participant = conference.getParticipantById(from);
            if (!participant) {
                return;
            }

            availableDevices = participant._availableDevices;
        }

        var updated = false;

        if (availableDevices.audio !== isAudioAvailable) {
            updated = true;
            availableDevices.audio = isAudioAvailable;
        }

        if (availableDevices.video !== isVideoAvailable) {
            updated = true;
            availableDevices.video = isVideoAvailable;
        }

        if (updated) {
            conference.eventEmitter.emit(
                JitsiConferenceEvents.AVAILABLE_DEVICES_CHANGED,
                from, availableDevices);
        }
    });

    if(conference.statistics) {
        //FIXME: Maybe remove event should not be associated with the conference.
        conference.statistics.addAudioLevelListener(function (ssrc, level) {
            var userId = null;

            var resource = conference.rtc.getResourceBySSRC(ssrc);
            if (!resource)
                return;

            conference.rtc.setAudioLevel(resource, level);
        });
        conference.statistics.addConnectionStatsListener(function (stats) {
            var ssrc2resolution = stats.resolution;

            var id2resolution = {};

            // preprocess resolutions: group by user id, skip incorrect
            // resolutions etc.
            Object.keys(ssrc2resolution).forEach(function (ssrc) {
                var resolution = ssrc2resolution[ssrc];

                if (!resolution.width || !resolution.height ||
                    resolution.width == -1 || resolution.height == -1) {
                    return;
                }

                var id = conference.rtc.getResourceBySSRC(ssrc);
                if (!id) {
                    return;
                }

                // ssrc to resolution map for user id
                var idResolutions = id2resolution[id] || {};
                idResolutions[ssrc] = resolution;

                id2resolution[id] = idResolutions;
            });

            stats.resolution = id2resolution;

            conference.eventEmitter.emit(
                JitsiConferenceEvents.CONNECTION_STATS, stats);
        });
        conference.room.addListener(XMPPEvents.DISPOSE_CONFERENCE,
            function () {
                conference.statistics.dispose();
            });

        conference.room.addListener(XMPPEvents.PEERCONNECTION_READY,
            function (session) {
                conference.statistics.startCallStats(
                    session, conference.settings);
            });

        conference.room.addListener(XMPPEvents.CONFERENCE_SETUP_FAILED,
            function () {
                conference.statistics.sendSetupFailedEvent();
            });

        conference.rtc.addListener(RTCEvents.TRACK_ATTACHED,
            function(track, container) {
                var ssrc = track.getSSRC();
                if (!container.id || !ssrc) {
                    return;
                }
                conference.statistics.associateStreamWithVideoTag(
                    ssrc, track.isLocal(), track.getUsageLabel(), container.id);

            });

        conference.on(JitsiConferenceEvents.TRACK_MUTE_CHANGED,
            function (track) {
                if(!track.isLocal())
                    return;
                var type = (track.getType() === "audio")? "audio" : "video";
                conference.statistics.sendMuteEvent(track.isMuted(), type);
            });

        conference.room.addListener(XMPPEvents.CREATE_OFFER_FAILED, function (e, pc) {
            conference.statistics.sendCreateOfferFailed(e, pc);
        });

        conference.room.addListener(XMPPEvents.CREATE_ANSWER_FAILED, function (e, pc) {
            conference.statistics.sendCreateAnswerFailed(e, pc);
        });

        conference.room.addListener(XMPPEvents.SET_LOCAL_DESCRIPTION_FAILED,
            function (e, pc) {
                conference.statistics.sendSetLocalDescFailed(e, pc);
            }
        );

        conference.room.addListener(XMPPEvents.SET_REMOTE_DESCRIPTION_FAILED,
            function (e, pc) {
                conference.statistics.sendSetRemoteDescFailed(e, pc);
            }
        );

        conference.room.addListener(XMPPEvents.ADD_ICE_CANDIDATE_FAILED,
            function (e, pc) {
                conference.statistics.sendAddIceCandidateFailed(e, pc);
            }
        );
    }
}


module.exports = JitsiConference;
