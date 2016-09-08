/* global Strophe, $, Promise */
/* jshint -W101 */
var logger = require("jitsi-meet-logger").getLogger(__filename);
var RTC = require("./modules/RTC/RTC");
var XMPPEvents = require("./service/xmpp/XMPPEvents");
var EventEmitter = require("events");
var JitsiConferenceEvents = require("./JitsiConferenceEvents");
var JitsiConferenceErrors = require("./JitsiConferenceErrors");
var JitsiParticipant = require("./JitsiParticipant");
var Statistics = require("./modules/statistics/statistics");
var JitsiDTMFManager = require('./modules/DTMF/JitsiDTMFManager');
import * as JitsiTrackEvents from "./JitsiTrackEvents";
var JitsiTrackErrors = require("./JitsiTrackErrors");
var JitsiTrackError = require("./JitsiTrackError");
var Settings = require("./modules/settings/Settings");
var ComponentsVersions = require("./modules/version/ComponentsVersions");
var GlobalOnErrorHandler = require("./modules/util/GlobalOnErrorHandler");
var JitsiConferenceEventManager = require("./JitsiConferenceEventManager");
var VideoType = require('./service/RTC/VideoType');
var Transcriber = require("./modules/transcription/transcriber");

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
        var errmsg
            = "Invalid conference name (no conference name passed or it "
                + "contains invalid characters like capital letters)!";
        logger.error(errmsg);
        throw new Error(errmsg);
    }
    this.eventEmitter = new EventEmitter();
    this.settings = new Settings();
    this.options = options;
    this.eventManager = new JitsiConferenceEventManager(this);
    this._init(options);
    this.componentsVersions = new ComponentsVersions(this);
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
    this.reportedAudioSSRCs = {};
    // Flag indicates if the 'onCallEnded' method was ever called on this
    // instance. Used to log extra analytics event for debugging purpose.
    // We need to know if the potential issue happened before or after
    // the restart.
    this.wasStopped = false;
}

/**
 * Initializes the conference object properties
 * @param options {object}
 * @param connection {JitsiConnection} overrides this.connection
 */
JitsiConference.prototype._init = function (options) {
    if(!options)
        options = {};

    // Override connection and xmpp properties (Usefull if the connection
    // reloaded)
    if(options.connection) {
        this.connection = options.connection;
        this.xmpp = this.connection.xmpp;
        // Setup XMPP events only if we have new connection object.
        this.eventManager.setupXMPPListeners();
    }

    this.room = this.xmpp.createRoom(this.options.name, this.options.config,
        this.settings);

    this.room.updateDeviceAvailability(RTC.getDeviceAvailability());

    if(!this.rtc) {
        this.rtc = new RTC(this, options);
        this.eventManager.setupRTCListeners();
    }

    if(!this.statistics) {
        this.statistics = new Statistics(this.xmpp, {
            callStatsID: this.options.config.callStatsID,
            callStatsSecret: this.options.config.callStatsSecret,
            roomName: this.options.name
        });
    }

    this.eventManager.setupChatRoomListeners();

    // Always add listeners because on reload we are executing leave and the
    // listeners are removed from statistics module.
    this.eventManager.setupStatisticsListeners();
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
    // remove all participants
    this.getParticipants().forEach(function (participant) {
        this.onMemberLeft(participant.getJid());
    }.bind(this));

    // leave the conference
    if (this.room) {
        this.room.leave();
    }

    this.room = null;

    this.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_LEFT);
}
/**
 * Leaves the conference.
 * @returns {Promise}
 */
JitsiConference.prototype.leave = function () {
    var conference = this;

    this.statistics.stopCallStats();
    this.rtc.closeAllDataChannels();

    return Promise.all(
        conference.getLocalTracks().map(function (track) {
            return conference.removeTrack(track);
        })
    ).then(this._leaveRoomAndRemoveParticipants.bind(this))
    .catch(function (error) {
        logger.error(error);
        GlobalOnErrorHandler.callUnhandledRejectionHandler(
            {promise: this, reason: error});
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
 * Get a transcriber object for all current participants in this conference
 * @return {Transcriber} the transcriber object
 */
JitsiConference.prototype.getTranscriber = function(){
    if(this.transcriber === undefined){
        this.transcriber = new Transcriber();
        //add all existing local audio tracks to the transcriber
        this.rtc.localTracks.forEach(function (localTrack) {
            if(localTrack.isAudioTrack()){
                this.transcriber.addTrack(localTrack);
            }
        }.bind(this));
        //and all remote audio tracks
        this.rtc.remoteTracks.forEach(function (remoteTrack){
            if(remoteTrack.isAudioTrack()){
                this.transcriber.addTrack(remoteTrack);
            }
        }.bind(this));
    }
    return this.transcriber;
};

/**
 * Adds JitsiLocalTrack object to the conference.
 * @param track the JitsiLocalTrack object.
 * @returns {Promise<JitsiLocalTrack>}
 * @throws {Error} if the specified track is a video track and there is already
 * another video track in the conference.
 */
JitsiConference.prototype.addTrack = function (track) {
    if (track.disposed) {
        return Promise.reject(
            new JitsiTrackError(JitsiTrackErrors.TRACK_IS_DISPOSED));
    }

    if (track.isVideoTrack()) {
        // Ensure there's exactly 1 local video track in the conference.
        var localVideoTrack = this.rtc.getLocalVideoTrack();
        if (localVideoTrack) {
            // Don't be excessively harsh and severe if the API client happens
            // to attempt to add the same local video track twice.
            if (track === localVideoTrack) {
                return Promise.resolve(track);
            } else {
                return Promise.reject(new Error(
                    "cannot add second video track to the conference"));
            }
        }
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

    if(track.isAudioTrack() || (track.isVideoTrack() &&
        track.videoType !== VideoType.DESKTOP)) {
        // Report active device to statistics
        var devices = RTC.getCurrentlyAvailableMediaDevices();
        var device = devices.find(function (d) {
            return d.kind === track.getTrack().kind + 'input'
                && d.label === track.getTrack().label;
        });
        if(device)
            Statistics.sendActiveDeviceListEvent(
                RTC.getEventDataForActiveDevice(device));
    }
    return new Promise(function (resolve, reject) {
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

            track._setConference(this);

            // send event for starting screen sharing
            // FIXME: we assume we have only one screen sharing track
            // if we change this we need to fix this check
            if (track.isVideoTrack() && track.videoType === VideoType.DESKTOP)
                this.statistics.sendScreenSharingEvent(true);

            this.eventEmitter.emit(JitsiConferenceEvents.TRACK_ADDED, track);
            resolve(track);
        }.bind(this), function (error) {
            reject(error);
        });
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
 * Clear JitsiLocalTrack properties and listeners.
 * @param track the JitsiLocalTrack object.
 */
JitsiConference.prototype.onTrackRemoved = function (track) {
    track._setSSRC(null);
    track._setConference(null);
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
    if (track.isVideoTrack() && track.videoType === VideoType.DESKTOP)
        this.statistics.sendScreenSharingEvent(false);

    this.eventEmitter.emit(JitsiConferenceEvents.TRACK_REMOVED, track);
}

/**
 * Removes JitsiLocalTrack object to the conference.
 * @param track the JitsiLocalTrack object.
 * @returns {Promise}
 */
JitsiConference.prototype.removeTrack = function (track) {
    if (track.disposed) {
        return Promise.reject(
            new JitsiTrackError(JitsiTrackErrors.TRACK_IS_DISPOSED));
    }

    if(!this.room){
        if(this.rtc) {
            this.onTrackRemoved(track);
        }
        return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
        this.room.removeStream(track.getOriginalStream(), function(){
            this.onTrackRemoved(track);
            resolve();
        }.bind(this), function (error) {
            reject(error);
        }, {
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
 * Elects the participant with the given id to be the selected participant in
 * order to receive higher video quality (if simulcast is enabled).
 * @param participantId the identifier of the participant
 * @throws NetworkError or InvalidStateError or Error if the operation fails.
 */
JitsiConference.prototype.selectParticipant = function(participantId) {
    this.rtc.selectEndpoint(participantId);
};

/**
 * Elects the participant with the given id to be the pinned participant in
 * order to always receive video for this participant (even when last n is
 * enabled).
 * @param participantId the identifier of the participant
 * @throws NetworkError or InvalidStateError or Error if the operation fails.
 */
JitsiConference.prototype.pinParticipant = function(participantId) {
    this.rtc.pinEndpoint(participantId);
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

    var removedTracks = this.rtc.removeRemoteTracks(id);

    removedTracks.forEach(function (track) {
        this.eventEmitter.emit(JitsiConferenceEvents.TRACK_REMOVED, track);
    }.bind(this));

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

/**
 * Notifies this JitsiConference that a JitsiRemoteTrack was added (into the
 * ChatRoom of this JitsiConference).
 *
 * @param {JitsiRemoteTrack} track the JitsiRemoteTrack which was added to this
 * JitsiConference
 */
JitsiConference.prototype.onTrackAdded = function (track) {
    var id = track.getParticipantId();
    var participant = this.getParticipantById(id);
    if (!participant) {
        return;
    }

    // Add track to JitsiParticipant.
    participant._tracks.push(track);

    if(this.transcriber){
        this.transcriber.addTrack(track);
    }

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
            emitter.emit(
                JitsiConferenceEvents.TRACK_AUDIO_LEVEL_CHANGED,
                id,
                audioLevel);
        }
    );

    emitter.emit(JitsiConferenceEvents.TRACK_ADDED, track);
};

/**
 * Handles incoming call event.
 */
JitsiConference.prototype.onIncomingCall =
function (jingleSession, jingleOffer, now) {
    if (!this.room.isFocus(jingleSession.peerjid)) {
        // Error cause this should never happen unless something is wrong!
        var errmsg = "Rejecting session-initiate from non-focus user: "
                + jingleSession.peerjid;
        GlobalOnErrorHandler.callErrorHandler(new Error(errmsg));
        logger.error(errmsg);
        return;
    }

    // Accept incoming call
    this.room.setJingleSession(jingleSession);
    this.room.connectionTimes["session.initiate"] = now;
    // Log "session.restart"
    if (this.wasStopped) {
        Statistics.sendEventToAll("session.restart");
    }
    // add info whether call is cross-region
    var crossRegion = null;
    if (window.jitsiRegionInfo)
        crossRegion = window.jitsiRegionInfo["CrossRegion"];
    Statistics.analytics.sendEvent("session.initiate",
        (now - this.room.connectionTimes["muc.joined"]),
        crossRegion);
    try{
        jingleSession.initialize(false /* initiator */,this.room);
    } catch (error) {
        GlobalOnErrorHandler.callErrorHandler(error);
    };

    this.rtc.onIncommingCall(jingleSession);
    // Add local Tracks to the ChatRoom
    this.rtc.localTracks.forEach(function(localTrack) {
        var ssrcInfo = null;
        if(localTrack.isVideoTrack() && localTrack.isMuted()) {
            /**
             * Handles issues when the stream is added before the peerconnection
             * is created. The peerconnection is created when second participant
             * enters the call. In that use case the track doesn't have
             * information about it's ssrcs and no jingle packets are sent. That
             * can cause inconsistent behavior later.
             *
             * For example:
             * If we mute the stream and than second participant enter it's
             * remote SDP won't include that track. On unmute we are not sending
             * any jingle packets which will brake the unmute.
             *
             * In order to solve issues like the above one here we have to
             * generate the ssrc information for the track .
             */
            localTrack._setSSRC(
                this.room.generateNewStreamSSRCInfo());
            ssrcInfo = {
                mtype: localTrack.getType(),
                type: "addMuted",
                ssrc: localTrack.ssrc,
                msid: localTrack.initialMSID
            };
        }
        try {
            this.room.addStream(
                localTrack.getOriginalStream(), function () {}, function () {},
                ssrcInfo, true);
        } catch(e) {
            GlobalOnErrorHandler.callErrorHandler(e);
            logger.error(e);
        }
    }.bind(this));

    jingleSession.acceptOffer(jingleOffer, null,
        function (error) {
            GlobalOnErrorHandler.callErrorHandler(error);
            logger.error(
                "Failed to accept incoming Jingle session", error);
        }
    );

    // Start callstats as soon as peerconnection is initialized,
    // do not wait for XMPPEvents.PEERCONNECTION_READY, as it may never
    // happen in case if user doesn't have or denied permission to
    // both camera and microphone.
    this.statistics.startCallStats(jingleSession, this.settings);
    this.statistics.startRemoteStats(jingleSession.peerconnection);
};

/**
 * Handles the call ended event.
 * @param {JingleSessionPC} JingleSession the jingle session which has been
 * terminated.
 * @param {String} reasonCondition the Jingle reason condition.
 * @param {String|null} reasonText human readable reason text which may provide
 * more details about why the call has been terminated.
 */
JitsiConference.prototype.onCallEnded
= function (JingleSession, reasonCondition, reasonText) {
    logger.info("Call ended: " + reasonCondition + " - " + reasonText);
    this.wasStopped = true;
    // Send session.terminate event
    Statistics.sendEventToAll("session.terminate");
    // Stop the stats
    if (this.statistics) {
        this.statistics.stopRemoteStats();
        this.statistics.stopCallStats();
    }
    // Current JingleSession is invalid so set it to null on the room
    this.room.setJingleSession(null);
    // Let the RTC service do any cleanups
    this.rtc.onCallEnded();
    // PeerConnection has been closed which means that SSRCs stored in
    // JitsiLocalTrack will not match those assigned by the old PeerConnection
    // and SSRC replacement logic will not work as expected.
    // We want to re-register 'ssrcHandler' of our local tracks, so that they
    // will learn what their SSRC from the new PeerConnection which will be
    // created on incoming call event.
    var self = this;
    this.rtc.localTracks.forEach(function(localTrack) {
        // Reset SSRC as it will no longer be valid
        localTrack._setSSRC(null);
        // Bind the handler to fetch new SSRC, it will un register itself once
        // it reads the values
        self.room.addListener(
            XMPPEvents.SENDRECV_STREAMS_CHANGED, localTrack.ssrcHandler);
    });
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
 * Sets a property for the local participant.
 */
JitsiConference.prototype.setLocalParticipantProperty = function(name, value) {
    this.sendCommand("jitsi_participant_" + name, {value: value});
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
 * Handles track attached to container (Calls associateStreamWithVideoTag method
 * from statistics module)
 * @param track the track
 * @param container the container
 */
JitsiConference.prototype._onTrackAttach = function(track, container) {
    var ssrc = track.getSSRC();
    if (!container.id || !ssrc) {
        return;
    }
    this.statistics.associateStreamWithVideoTag(
        ssrc, track.isLocal(), track.getUsageLabel(), container.id);
}

/**
 * Reports detected audio problem with the media stream related to the passed
 * ssrc.
 * @param ssrc {string} the ssrc
 * NOTE: all logger.log calls are there only to be able to see the info in
 * torture
 */
JitsiConference.prototype._reportAudioProblem = function (ssrc) {
    if(this.reportedAudioSSRCs[ssrc])
        return;
    var track = this.rtc.getRemoteTrackBySSRC(ssrc);
    if(!track || !track.isAudioTrack())
        return;

    var id = track.getParticipantId();
    var displayName = null;
    if(id) {
        var participant = this.getParticipantById(id);
        if(participant) {
            displayName = participant.getDisplayName();
        }
    }
    this.reportedAudioSSRCs[ssrc] = true;
    var errorContent = {
        errMsg: "The audio is received but not played",
        ssrc: ssrc,
        jid: id,
        displayName: displayName
    };

    logger.log("=================The audio is received but not played" +
        "======================");
    logger.log("ssrc: ", ssrc);
    logger.log("jid: ", id);
    logger.log("displayName: ", displayName);

    var mstream = track.stream, mtrack = track.track;
    if(mstream) {
        logger.log("MediaStream:");
        errorContent.MediaStream = {
            active: mstream.active,
            id: mstream.id
        };
        logger.log("active: ", mstream.active);
        logger.log("id: ", mstream.id);
    }

    if(mtrack) {
        logger.log("MediaStreamTrack:");
        errorContent.MediaStreamTrack = {
            enabled: mtrack.enabled,
            id: mtrack.id,
            label: mtrack.label,
            muted: mtrack.muted
        }
        logger.log("enabled: ", mtrack.enabled);
        logger.log("id: ", mtrack.id);
        logger.log("label: ", mtrack.label);
        logger.log("muted: ", mtrack.muted);
    }

    if(track.containers) {
        errorContent.containers = [];
        logger.log("Containers:");
        track.containers.forEach(function (container) {
            logger.log("Container:");
            errorContent.containers.push({
                autoplay: container.autoplay,
                muted: container.muted,
                src: container.src,
                volume: container.volume,
                id: container.id,
                ended: container.ended,
                paused: container.paused,
                readyState: container.readyState
            });
            logger.log("autoplay: ", container.autoplay);
            logger.log("muted: ", container.muted);
            logger.log("src: ", container.src);
            logger.log("volume: ", container.volume);
            logger.log("id: ", container.id);
            logger.log("ended: ", container.ended);
            logger.log("paused: ", container.paused);
            logger.log("readyState: ", container.readyState);
        });
    }

    // Prints JSON.stringify(errorContent) to be able to see all properties of
    // errorContent from torture
    logger.error("Audio problem detected. The audio is received but not played",
        errorContent);

    delete errorContent.displayName;

    this.statistics.sendDetectedAudioProblem(
        new Error(JSON.stringify(errorContent)));
};

/**
 * Logs an "application log" message.
 * @param message {string} The message to log. Note that while this can be a
 * generic string, the convention used by lib-jitsi-meet and jitsi-meet is to
 * log valid JSON strings, with an "id" field used for distinguishing between
 * message types. E.g.: {id: "recorder_status", status: "off"}
 */
JitsiConference.prototype.sendApplicationLog = function(message) {
    Statistics.sendLog(message);
};

/**
 * Checks if the user identified by given <tt>mucJid</tt> is the conference
 * focus.
 * @param mucJid the full MUC address of the user to be checked.
 * @returns {boolean} <tt>true</tt> if MUC user is the conference focus.
 */
JitsiConference.prototype._isFocus = function (mucJid) {
    return this.room.isFocus(mucJid);
};

/**
 * Fires CONFERENCE_FAILED event with INCOMPATIBLE_SERVER_VERSIONS parameter
 */
JitsiConference.prototype._fireIncompatibleVersionsEvent = function () {
    this.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.INCOMPATIBLE_SERVER_VERSIONS);
};

/**
 * Sends message via the datachannels.
 * @param to {string} the id of the endpoint that should receive the message.
 * If "" the message will be sent to all participants.
 * @param payload {object} the payload of the message.
 * @throws NetworkError or InvalidStateError or Error if the operation fails.
 */
JitsiConference.prototype.sendEndpointMessage = function (to, payload) {
    this.rtc.sendDataChannelMessage(to, payload);
}

/**
 * Sends broadcast message via the datachannels.
 * @param payload {object} the payload of the message.
 * @throws NetworkError or InvalidStateError or Error if the operation fails.
 */
JitsiConference.prototype.broadcastEndpointMessage = function (payload) {
    this.sendEndpointMessage("", payload);
}

module.exports = JitsiConference;
