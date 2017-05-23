/* global __filename, Strophe, Promise */

import AvgRTPStatsReporter from './modules/statistics/AvgRTPStatsReporter';
import ComponentsVersions from './modules/version/ComponentsVersions';
import ConnectionQuality from './modules/connectivity/ConnectionQuality';
import { getLogger } from 'jitsi-meet-logger';
import GlobalOnErrorHandler from './modules/util/GlobalOnErrorHandler';
import EventEmitter from 'events';
import * as JingleSessionState from './modules/xmpp/JingleSessionState';
import * as JitsiConferenceErrors from './JitsiConferenceErrors';
import JitsiConferenceEventManager from './JitsiConferenceEventManager';
import * as JitsiConferenceEvents from './JitsiConferenceEvents';
import JitsiDTMFManager from './modules/DTMF/JitsiDTMFManager';
import JitsiParticipant from './JitsiParticipant';
import JitsiTrackError from './JitsiTrackError';
import * as JitsiTrackErrors from './JitsiTrackErrors';
import * as JitsiTrackEvents from './JitsiTrackEvents';
import * as MediaType from './service/RTC/MediaType';
import ParticipantConnectionStatusHandler
    from './modules/connectivity/ParticipantConnectionStatus';
import RTC from './modules/RTC/RTC';
import RTCBrowserType from './modules/RTC/RTCBrowserType';
import * as RTCEvents from './service/RTC/RTCEvents';
import Statistics from './modules/statistics/statistics';
import TalkMutedDetection from './modules/TalkMutedDetection';
import Transcriber from './modules/transcription/transcriber';
import VideoType from './service/RTC/VideoType';
import VideoSIPGW from './modules/videosipgw/VideoSIPGW';
import * as XMPPEvents from './service/xmpp/XMPPEvents';

import SpeakerStatsCollector from './modules/statistics/SpeakerStatsCollector';

const logger = getLogger(__filename);

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
 * @param {boolean} [options.config.enableP2P] when set to <tt>true</tt>
 * the peer to peer mode will be enabled. It means that when there are only 2
 * participants in the conference an attempt to make direct connection will be
 * made. If the connection succeeds the conference will stop sending data
 * through the JVB connection and will use the direct one instead.
 * @param {number} [options.config.backToP2PDelay=5] a delay given in seconds,
 * before the conference switches back to P2P, after the 3rd participant has
 * left the room.
 * @constructor
 *
 * FIXME Make all methods which are called from lib-internal classes
 *       to non-public (use _). To name a few:
 *       {@link JitsiConference.onLocalRoleChanged}
 *       {@link JitsiConference.onUserRoleChanged}
 *       {@link JitsiConference.onMemberLeft}
 *       and so on...
 */
export default function JitsiConference(options) {
    if (!options.name || options.name.toLowerCase() !== options.name) {
        const errmsg
            = 'Invalid conference name (no conference name passed or it '
                + 'contains invalid characters like capital letters)!';

        logger.error(errmsg);
        throw new Error(errmsg);
    }
    this.eventEmitter = new EventEmitter();
    this.options = options;
    this.eventManager = new JitsiConferenceEventManager(this);
    this._init(options);
    this.componentsVersions = new ComponentsVersions(this);
    this.participants = {};

    /**
     * Jingle session instance for the JVB connection.
     * @type {JingleSessionPC}
     */
    this.jvbJingleSession = null;
    this.lastDominantSpeaker = null;
    this.dtmfManager = null;
    this.somebodySupportsDTMF = false;
    this.authEnabled = false;
    this.startAudioMuted = false;
    this.startVideoMuted = false;
    this.startMutedPolicy = {
        audio: false,
        video: false
    };
    this.availableDevices = {
        audio: undefined,
        video: undefined
    };
    this.isMutedByFocus = false;

    // Flag indicates if the 'onCallEnded' method was ever called on this
    // instance. Used to log extra analytics event for debugging purpose.
    // We need to know if the potential issue happened before or after
    // the restart.
    this.wasStopped = false;

    /**
     * The object which monitors local and remote connection statistics (e.g.
     * sending bitrate) and calculates a number which represents the connection
     * quality.
     */
    this.connectionQuality
        = new ConnectionQuality(this, this.eventEmitter, options);

    /**
     * Reports average RTP statistics to the analytics module.
     * @type {AvgRTPStatsReporter}
     */
    this.avgRtpStatsReporter
        = new AvgRTPStatsReporter(this, options.config.avgRtpStatsN || 15);

    /**
     * Indicates whether the connection is interrupted or not.
     */
    this.isJvbConnectionInterrupted = false;

    /**
     * The object which tracks active speaker times
     */
    this.speakerStatsCollector = new SpeakerStatsCollector(this);

    /* P2P related fields below: */

    /**
     * Stores reference to deferred start P2P task. It's created when 3rd
     * participant leaves the room in order to avoid ping pong effect (it
     * could be just a page reload).
     * @type {number|null}
     */
    this.deferredStartP2PTask = null;

    const delay = parseInt(options.config.backToP2PDelay, 10);

    /**
     * A delay given in seconds, before the conference switches back to P2P
     * after the 3rd participant has left.
     * @type {number}
     */
    this.backToP2PDelay = isNaN(delay) ? 5 : delay;
    logger.info(`backToP2PDelay: ${this.backToP2PDelay}`);

    /**
     * If set to <tt>true</tt> it means the P2P ICE is no longer connected.
     * When <tt>false</tt> it means that P2P ICE (media) connection is up
     * and running.
     * @type {boolean}
     */
    this.isP2PConnectionInterrupted = false;

    /**
     * Flag set to <tt>true</tt> when P2P session has been established
     * (ICE has been connected) and this conference is currently in the peer to
     * peer mode (P2P connection is the active one).
     * @type {boolean}
     */
    this.p2p = false;

    /**
     * A JingleSession for the direct peer to peer connection.
     * @type {JingleSessionPC}
     */
    this.p2pJingleSession = null;
}

// FIXME convert JitsiConference to ES6 - ASAP !
JitsiConference.prototype.constructor = JitsiConference;

/**
 * Initializes the conference object properties
 * @param options {object}
 * @param options.connection {JitsiConnection} overrides this.connection
 */
JitsiConference.prototype._init = function(options = {}) {
    // Override connection and xmpp properties (Usefull if the connection
    // reloaded)
    if (options.connection) {
        this.connection = options.connection;
        this.xmpp = this.connection.xmpp;

        // Setup XMPP events only if we have new connection object.
        this.eventManager.setupXMPPListeners();
    }

    this.room = this.xmpp.createRoom(this.options.name, this.options.config);

    // Connection interrupted/restored listeners
    this._onIceConnectionInterrupted
        = this._onIceConnectionInterrupted.bind(this);
    this.room.addListener(
        XMPPEvents.CONNECTION_INTERRUPTED, this._onIceConnectionInterrupted);

    this._onIceConnectionRestored = this._onIceConnectionRestored.bind(this);
    this.room.addListener(
        XMPPEvents.CONNECTION_RESTORED, this._onIceConnectionRestored);

    this._onIceConnectionEstablished
        = this._onIceConnectionEstablished.bind(this);
    this.room.addListener(
        XMPPEvents.CONNECTION_ESTABLISHED, this._onIceConnectionEstablished);

    this.room.updateDeviceAvailability(RTC.getDeviceAvailability());

    if (!this.rtc) {
        this.rtc = new RTC(this, options);
        this.eventManager.setupRTCListeners();
    }

    this.participantConnectionStatus
        = new ParticipantConnectionStatusHandler(
                this.rtc, this,
                options.config.peerDisconnectedThroughRtcTimeout);
    this.participantConnectionStatus.init();

    if (!this.statistics) {
        this.statistics = new Statistics(this.xmpp, {
            callStatsID: this.options.config.callStatsID,
            callStatsSecret: this.options.config.callStatsSecret,
            callStatsConfIDNamespace:
                this.options.config.callStatsConfIDNamespace
                    || window.location.hostname,
            callStatsCustomScriptUrl:
                this.options.config.callStatsCustomScriptUrl,
            callStatsAliasName: this.myUserId(),
            roomName: this.options.name
        });
    }

    this.eventManager.setupChatRoomListeners();

    // Always add listeners because on reload we are executing leave and the
    // listeners are removed from statistics module.
    this.eventManager.setupStatisticsListeners();

    if (this.options.config.enableTalkWhileMuted) {
        // eslint-disable-next-line no-new
        new TalkMutedDetection(
            this,
            () =>
                this.eventEmitter.emit(JitsiConferenceEvents.TALK_WHILE_MUTED));
    }
};

/**
 * Joins the conference.
 * @param password {string} the password
 */
JitsiConference.prototype.join = function(password) {
    if (this.room) {
        this.room.join(password);
    }
};

/**
 * Check if joined to the conference.
 */
JitsiConference.prototype.isJoined = function() {
    return this.room && this.room.joined;
};

/**
 * Leaves the conference.
 * @returns {Promise}
 */
JitsiConference.prototype.leave = function() {
    if (this.participantConnectionStatus) {
        this.participantConnectionStatus.dispose();
        this.participantConnectionStatus = null;
    }
    if (this.avgRtpStatsReporter) {
        this.avgRtpStatsReporter.dispose();
        this.avgRtpStatsReporter = null;
    }

    this.getLocalTracks().forEach(track => this.onLocalTrackRemoved(track));

    this.rtc.closeAllDataChannels();
    if (this.statistics) {
        this.statistics.dispose();
    }

    // Close both JVb and P2P JingleSessions
    if (this.jvbJingleSession) {
        this.jvbJingleSession.close();
        this.jvbJingleSession = null;
    }
    if (this.p2pJingleSession) {
        this.p2pJingleSession.close();
        this.p2pJingleSession = null;
    }

    // leave the conference
    if (this.room) {
        const room = this.room;

        // Unregister connection state listeners
        room.removeListener(
            XMPPEvents.CONNECTION_INTERRUPTED,
            this._onIceConnectionInterrupted);
        room.removeListener(
            XMPPEvents.CONNECTION_RESTORED,
            this._onIceConnectionRestored);
        room.removeListener(
            XMPPEvents.CONNECTION_ESTABLISHED,
            this._onIceConnectionEstablished);

        this.room = null;

        return room.leave().catch(() => {
            // remove all participants because currently the conference won't
            // be usable anyway. This is done on success automatically by the
            // ChatRoom instance.
            this.getParticipants().forEach(
                participant => this.onMemberLeft(participant.getJid()));
        });
    }

    // If this.room == null we are calling second time leave().
    return Promise.reject(
        new Error('The conference is has been already left'));
};

/**
 * Returns name of this conference.
 */
JitsiConference.prototype.getName = function() {
    return this.options.name;
};

/**
 * Check if authentication is enabled for this conference.
 */
JitsiConference.prototype.isAuthEnabled = function() {
    return this.authEnabled;
};

/**
 * Check if user is logged in.
 */
JitsiConference.prototype.isLoggedIn = function() {
    return Boolean(this.authIdentity);
};

/**
 * Get authorized login.
 */
JitsiConference.prototype.getAuthLogin = function() {
    return this.authIdentity;
};

/**
 * Check if external authentication is enabled for this conference.
 */
JitsiConference.prototype.isExternalAuthEnabled = function() {
    return this.room && this.room.moderator.isExternalAuthEnabled();
};

/**
 * Get url for external authentication.
 * @param {boolean} [urlForPopup] if true then return url for login popup,
 *                                else url of login page.
 * @returns {Promise}
 */
JitsiConference.prototype.getExternalAuthUrl = function(urlForPopup) {
    return new Promise((resolve, reject) => {
        if (!this.isExternalAuthEnabled()) {
            reject();

            return;
        }
        if (urlForPopup) {
            this.room.moderator.getPopupLoginUrl(resolve, reject);
        } else {
            this.room.moderator.getLoginUrl(resolve, reject);
        }
    });
};

/**
 * Returns the local tracks of the given media type, or all local tracks if no
 * specific type is given.
 * @param {MediaType} [mediaType] Optional media type (audio or video).
 */
JitsiConference.prototype.getLocalTracks = function(mediaType) {
    let tracks = [];

    if (this.rtc) {
        tracks = this.rtc.getLocalTracks(mediaType);
    }

    return tracks;
};

/**
 * Obtains local audio track.
 * @return {JitsiLocalTrack|null}
 */
JitsiConference.prototype.getLocalAudioTrack = function() {
    return this.rtc ? this.rtc.getLocalAudioTrack() : null;
};

/**
 * Obtains local video track.
 * @return {JitsiLocalTrack|null}
 */
JitsiConference.prototype.getLocalVideoTrack = function() {
    return this.rtc ? this.rtc.getLocalVideoTrack() : null;
};

/**
 * Attaches a handler for events(For example - "participant joined".) in the
 * conference. All possible event are defined in JitsiConferenceEvents.
 * @param eventId the event ID.
 * @param handler handler for the event.
 *
 * Note: consider adding eventing functionality by extending an EventEmitter
 * impl, instead of rolling ourselves
 */
JitsiConference.prototype.on = function(eventId, handler) {
    if (this.eventEmitter) {
        this.eventEmitter.on(eventId, handler);
    }
};

/**
 * Removes event listener
 * @param eventId the event ID.
 * @param [handler] optional, the specific handler to unbind
 *
 * Note: consider adding eventing functionality by extending an EventEmitter
 * impl, instead of rolling ourselves
 */
JitsiConference.prototype.off = function(eventId, handler) {
    if (this.eventEmitter) {
        this.eventEmitter.removeListener(eventId, handler);
    }
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
JitsiConference.prototype.addCommandListener = function(command, handler) {
    if (this.room) {
        this.room.addPresenceListener(command, handler);
    }
};

/**
  * Removes command  listener
  * @param command {String} the name of the command
  */
JitsiConference.prototype.removeCommandListener = function(command) {
    if (this.room) {
        this.room.removePresenceListener(command);
    }
};

/**
 * Sends text message to the other participants in the conference
 * @param message the text message.
 */
JitsiConference.prototype.sendTextMessage = function(message) {
    if (this.room) {
        this.room.sendMessage(message);
    }
};

/**
 * Send presence command.
 * @param name {String} the name of the command.
 * @param values {Object} with keys and values that will be sent.
 **/
JitsiConference.prototype.sendCommand = function(name, values) {
    if (this.room) {
        this.room.addToPresence(name, values);
        this.room.sendPresence();
    }
};

/**
 * Send presence command one time.
 * @param name {String} the name of the command.
 * @param values {Object} with keys and values that will be sent.
 **/
JitsiConference.prototype.sendCommandOnce = function(name, values) {
    this.sendCommand(name, values);
    this.removeCommand(name);
};

/**
 * Removes presence command.
 * @param name {String} the name of the command.
 **/
JitsiConference.prototype.removeCommand = function(name) {
    if (this.room) {
        this.room.removeFromPresence(name);
    }
};

/**
 * Sets the display name for this conference.
 * @param name the display name to set
 */
JitsiConference.prototype.setDisplayName = function(name) {
    if (this.room) {
        // remove previously set nickname
        this.room.removeFromPresence('nick');

        this.room.addToPresence('nick', {
            attributes: { xmlns: 'http://jabber.org/protocol/nick' },
            value: name
        });
        this.room.sendPresence();
    }
};

/**
 * Set new subject for this conference. (available only for moderator)
 * @param {string} subject new subject
 */
JitsiConference.prototype.setSubject = function(subject) {
    if (this.room && this.isModerator()) {
        this.room.setSubject(subject);
    }
};

/**
 * Get a transcriber object for all current participants in this conference
 * @return {Transcriber} the transcriber object
 */
JitsiConference.prototype.getTranscriber = function() {
    if (this.transcriber === undefined) {
        this.transcriber = new Transcriber();

        // add all existing local audio tracks to the transcriber
        const localAudioTracks = this.getLocalTracks(MediaType.AUDIO);

        for (const localAudio of localAudioTracks) {
            this.transcriber.addTrack(localAudio);
        }

        // and all remote audio tracks
        const remoteAudioTracks = this.rtc.getRemoteTracks(MediaType.AUDIO);

        for (const remoteTrack of remoteAudioTracks) {
            this.transcriber.addTrack(remoteTrack);
        }
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
JitsiConference.prototype.addTrack = function(track) {
    if (track.isVideoTrack()) {
        // Ensure there's exactly 1 local video track in the conference.
        const localVideoTrack = this.rtc.getLocalVideoTrack();

        if (localVideoTrack) {
            // Don't be excessively harsh and severe if the API client happens
            // to attempt to add the same local video track twice.
            if (track === localVideoTrack) {
                return Promise.resolve(track);
            }

            return Promise.reject(new Error(
                    'cannot add second video track to the conference'));

        }
    }

    return this.replaceTrack(null, track);
};

/**
 * Fires TRACK_AUDIO_LEVEL_CHANGED change conference event (for local tracks).
 * @param {TraceablePeerConnection|null} tpc
 * @param audioLevel the audio level
 */
JitsiConference.prototype._fireAudioLevelChangeEvent
= function(tpc, audioLevel) {
    const activeTpc = this.getActivePeerConnection();

    // There will be no TraceablePeerConnection if audio levels do not come from
    // a peerconnection. LocalStatsCollector.js measures audio levels using Web
    // Audio Analyser API and emits local audio levels events through
    // JitsiTrack.setAudioLevel, but does not provide TPC instance which is
    // optional.
    if (tpc === null || activeTpc === tpc) {
        this.eventEmitter.emit(
            JitsiConferenceEvents.TRACK_AUDIO_LEVEL_CHANGED,
            this.myUserId(), audioLevel);
    }
};

/**
 * Fires TRACK_MUTE_CHANGED change conference event.
 * @param track the JitsiTrack object related to the event.
 */
JitsiConference.prototype._fireMuteChangeEvent = function(track) {
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
JitsiConference.prototype.onLocalTrackRemoved = function(track) {
    track._setConference(null);
    this.rtc.removeLocalTrack(track);
    track.removeEventListener(JitsiTrackEvents.TRACK_MUTE_CHANGED,
        track.muteHandler);
    track.removeEventListener(JitsiTrackEvents.TRACK_AUDIO_LEVEL_CHANGED,
        track.audioLevelHandler);

    // send event for stopping screen sharing
    // FIXME: we assume we have only one screen sharing track
    // if we change this we need to fix this check
    if (track.isVideoTrack() && track.videoType === VideoType.DESKTOP) {
        this.statistics.sendScreenSharingEvent(false);
    }

    this.eventEmitter.emit(JitsiConferenceEvents.TRACK_REMOVED, track);
};

/**
 * Removes JitsiLocalTrack from the conference and performs
 * a new offer/answer cycle.
 * @param {JitsiLocalTrack} track
 * @returns {Promise}
 */
JitsiConference.prototype.removeTrack = function(track) {
    return this.replaceTrack(track, null);
};

/**
 * Replaces oldTrack with newTrack and performs a single offer/answer
 *  cycle after both operations are done.  Either oldTrack or newTrack
 *  can be null; replacing a valid 'oldTrack' with a null 'newTrack'
 *  effectively just removes 'oldTrack'
 * @param {JitsiLocalTrack} oldTrack the current stream in use to be replaced
 * @param {JitsiLocalTrack} newTrack the new stream to use
 * @returns {Promise} resolves when the replacement is finished
 */
JitsiConference.prototype.replaceTrack = function(oldTrack, newTrack) {
    // First do the removal of the oldTrack at the JitsiConference level
    if (oldTrack) {
        if (oldTrack.disposed) {
            return Promise.reject(
                new JitsiTrackError(JitsiTrackErrors.TRACK_IS_DISPOSED));
        }
    }
    if (newTrack) {
        if (newTrack.disposed) {
            return Promise.reject(
                new JitsiTrackError(JitsiTrackErrors.TRACK_IS_DISPOSED));
        }
    }

    // Now replace the stream at the lower levels
    return this._doReplaceTrack(oldTrack, newTrack)
        .then(() => {
            if (oldTrack) {
                this.onLocalTrackRemoved(oldTrack);
            }
            if (newTrack) {
                // Now handle the addition of the newTrack at the
                // JitsiConference level
                this._setupNewTrack(newTrack);
            }

            return Promise.resolve();
        }, error => Promise.reject(new Error(error)));
};

/**
 * Replaces the tracks at the lower level by going through the Jingle session
 * and WebRTC peer connection. The method will resolve immediately if there is
 * currently no JingleSession started.
 * @param {JitsiLocalTrack|null} oldTrack the track to be removed during
 * the process or <tt>null</t> if the method should act as "add track"
 * @param {JitsiLocalTrack|null} newTrack the new track to be added or
 * <tt>null</tt> if the method should act as "remove track"
 * @return {Promise} resolved when the process is done or rejected with a string
 * which describes the error.
 * @private
 */
JitsiConference.prototype._doReplaceTrack = function(oldTrack, newTrack) {
    const replaceTrackPromises = [];

    if (this.jvbJingleSession) {
        replaceTrackPromises.push(
            this.jvbJingleSession.replaceTrack(oldTrack, newTrack));
    } else {
        logger.info('_doReplaceTrack - no JVB JingleSession');
    }

    if (this.p2pJingleSession) {
        replaceTrackPromises.push(
            this.p2pJingleSession.replaceTrack(oldTrack, newTrack));
    } else {
        logger.info('_doReplaceTrack - no P2P JingleSession');
    }

    return Promise.all(replaceTrackPromises);
};

/**
 * Operations related to creating a new track
 * @param {JitsiLocalTrack} newTrack the new track being created
 */
JitsiConference.prototype._setupNewTrack = function(newTrack) {
    if (newTrack.isAudioTrack() || (newTrack.isVideoTrack()
            && newTrack.videoType !== VideoType.DESKTOP)) {
        // Report active device to statistics
        const devices = RTC.getCurrentlyAvailableMediaDevices();
        const device
            = devices.find(
                d =>
                    d.kind === `${newTrack.getTrack().kind}input`
                        && d.label === newTrack.getTrack().label);

        if (device) {
            Statistics.sendActiveDeviceListEvent(
                RTC.getEventDataForActiveDevice(device));
        }
    }
    if (newTrack.isVideoTrack()) {
        this.removeCommand('videoType');
        this.sendCommand('videoType', {
            value: newTrack.videoType,
            attributes: {
                xmlns: 'http://jitsi.org/jitmeet/video'
            }
        });
    }
    this.rtc.addLocalTrack(newTrack);

    // ensure that we're sharing proper "is muted" state
    if (newTrack.isAudioTrack()) {
        this.room.setAudioMute(newTrack.isMuted());
    } else {
        this.room.setVideoMute(newTrack.isMuted());
    }

    newTrack.muteHandler = this._fireMuteChangeEvent.bind(this, newTrack);
    newTrack.audioLevelHandler = this._fireAudioLevelChangeEvent.bind(this);
    newTrack.addEventListener(JitsiTrackEvents.TRACK_MUTE_CHANGED,
                           newTrack.muteHandler);
    newTrack.addEventListener(JitsiTrackEvents.TRACK_AUDIO_LEVEL_CHANGED,
                           newTrack.audioLevelHandler);

    newTrack._setConference(this);

    // send event for starting screen sharing
    // FIXME: we assume we have only one screen sharing track
    // if we change this we need to fix this check
    if (newTrack.isVideoTrack() && newTrack.videoType === VideoType.DESKTOP) {
        this.statistics.sendScreenSharingEvent(true);
    }

    this.eventEmitter.emit(JitsiConferenceEvents.TRACK_ADDED, newTrack);
};

/**
 * Method called by the {@link JitsiLocalTrack} (a video one) in order to add
 * back the underlying WebRTC MediaStream to the PeerConnection (which has
 * removed on video mute).
 * @param {JitsiLocalTrack} track the local track that will be added as part of
 * the unmute operation.
 * @return {Promise} resolved when the process is done or rejected with a string
 * which describes the error.
 */
JitsiConference.prototype._addLocalTrackAsUnmute = function(track) {
    const addAsUnmutePromises = [];

    if (this.jvbJingleSession) {
        addAsUnmutePromises.push(this.jvbJingleSession.addTrackAsUnmute(track));
    } else {
        logger.info(
            'Add local MediaStream as unmute -'
                + ' no JVB Jingle session started yet');
    }

    if (this.p2pJingleSession) {
        addAsUnmutePromises.push(this.p2pJingleSession.addTrackAsUnmute(track));
    } else {
        logger.info(
            'Add local MediaStream as unmute -'
                + ' no P2P Jingle session started yet');
    }

    return Promise.all(addAsUnmutePromises);
};

/**
 * Method called by the {@link JitsiLocalTrack} (a video one) in order to remove
 * the underlying WebRTC MediaStream from the PeerConnection. The purpose of
 * that is to stop sending any data and turn off the HW camera device.
 * @param {JitsiLocalTrack} track the local track that will be removed.
 * @return {Promise}
 */
JitsiConference.prototype._removeLocalTrackAsMute = function(track) {
    const removeAsMutePromises = [];

    if (this.jvbJingleSession) {
        removeAsMutePromises.push(
            this.jvbJingleSession.removeTrackAsMute(track));
    } else {
        logger.info(
            'Remove local MediaStream - no JVB JingleSession started yet');
    }
    if (this.p2pJingleSession) {
        removeAsMutePromises.push(
            this.p2pJingleSession.removeTrackAsMute(track));
    } else {
        logger.info(
            'Remove local MediaStream - no P2P JingleSession started yet');
    }

    return Promise.all(removeAsMutePromises);
};

/**
 * Get role of the local user.
 * @returns {string} user role: 'moderator' or 'none'
 */
JitsiConference.prototype.getRole = function() {
    return this.room.role;
};

/**
 * Check if local user is moderator.
 * @returns {boolean|null} true if local user is moderator, false otherwise. If
 * we're no longer in the conference room then <tt>null</tt> is returned.
 */
JitsiConference.prototype.isModerator = function() {
    return this.room ? this.room.isModerator() : null;
};

/**
 * Set password for the room.
 * @param {string} password new password for the room.
 * @returns {Promise}
 */
JitsiConference.prototype.lock = function(password) {
    if (!this.isModerator()) {
        return Promise.reject();
    }

    return new Promise((resolve, reject) => {
        this.room.lockRoom(
            password || '',
            () => resolve(),
            err => reject(err),
            () => reject(JitsiConferenceErrors.PASSWORD_NOT_SUPPORTED));
    });
};

/**
 * Remove password from the room.
 * @returns {Promise}
 */
JitsiConference.prototype.unlock = function() {
    return this.lock();
};

/**
 * Elects the participant with the given id to be the selected participant in
 * order to receive higher video quality (if simulcast is enabled).
 * Or cache it if channel is not created and send it once channel is available.
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
 * Selects a new value for "lastN". The requested amount of videos are going
 * to be delivered after the value is in effect. Set to -1 for unlimited or
 * all available videos.
 * @param lastN the new number of videos the user would like to receive.
 * @throws Error or RangeError if the given value is not a number or is smaller
 * than -1.
 */
JitsiConference.prototype.setLastN = function(lastN) {
    if (!Number.isInteger(lastN) && !Number.parseInt(lastN, 10)) {
        throw new Error(`Invalid value for lastN: ${lastN}`);
    }
    const n = Number(lastN);

    if (n < -1) {
        throw new RangeError('lastN cannot be smaller than -1');
    }
    this.rtc.setLastN(n);
};

/**
 * Checks if the participant given by participantId is currently included in
 * the last N.
 * @param {string} participantId the identifier of the participant we would
 * like to check.
 * @return {boolean} true if the participant with id is in the last N set or
 * if there's no last N set, false otherwise.
 */
JitsiConference.prototype.isInLastN = function(participantId) {
    return this.rtc.isInLastN(participantId);
};

/**
 * @return Array<JitsiParticipant> an array of all participants in this
 * conference.
 */
JitsiConference.prototype.getParticipants = function() {
    return Object.keys(this.participants).map(function(key) {
        return this.participants[key];
    }, this);
};

/**
 * Returns the number of participants in the conference, including the local
 * participant.
 * @param countHidden {boolean} Whether or not to include hidden participants
 * in the count. Default: false.
 **/
JitsiConference.prototype.getParticipantCount
    = function(countHidden = false) {

        let participants = this.getParticipants();

        if (!countHidden) {
            participants = participants.filter(p => !p.isHidden());
        }

        // Add one for the local participant.
        return participants.length + 1;
    };

/**
 * @returns {JitsiParticipant} the participant in this conference with the
 * specified id (or undefined if there isn't one).
 * @param id the id of the participant.
 */
JitsiConference.prototype.getParticipantById = function(id) {
    return this.participants[id];
};

/**
 * Kick participant from this conference.
 * @param {string} id id of the participant to kick
 */
JitsiConference.prototype.kickParticipant = function(id) {
    const participant = this.getParticipantById(id);

    if (!participant) {
        return;
    }
    this.room.kick(participant.getJid());
};

/**
 * Mutes a participant.
 * @param {string} id The id of the participant to mute.
 */
JitsiConference.prototype.muteParticipant = function(id) {
    const participant = this.getParticipantById(id);

    if (!participant) {
        return;
    }
    this.room.muteParticipant(participant.getJid(), true);
};

/* eslint-disable max-params */

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
 */
JitsiConference.prototype.onMemberJoined = function(jid, nick, role, isHidden) {
    const id = Strophe.getResourceFromJid(jid);

    if (id === 'focus' || this.myUserId() === id) {
        return;
    }
    const participant = new JitsiParticipant(jid, this, nick, isHidden);

    participant._role = role;
    this.participants[id] = participant;
    this.eventEmitter.emit(
        JitsiConferenceEvents.USER_JOINED,
        id,
        participant);
    this.xmpp.caps.getFeatures(jid)
        .then(features => {
            participant._supportsDTMF = features.has('urn:xmpp:jingle:dtmf:0');
            this.updateDTMFSupport();
        },
        error => logger.error(`Failed to discover features of ${jid}`, error));

    this._maybeStartOrStopP2P();
};

/* eslint-enable max-params */

JitsiConference.prototype.onMemberLeft = function(jid) {
    const id = Strophe.getResourceFromJid(jid);

    if (id === 'focus' || this.myUserId() === id) {
        return;
    }
    const participant = this.participants[id];

    delete this.participants[id];

    const removedTracks = this.rtc.removeRemoteTracks(id);

    removedTracks.forEach(
        track =>
            this.eventEmitter.emit(JitsiConferenceEvents.TRACK_REMOVED, track));

    // there can be no participant in case the member that left is focus
    if (participant) {
        this.eventEmitter.emit(
            JitsiConferenceEvents.USER_LEFT, id, participant);
    }

    this._maybeStartOrStopP2P(true /* triggered by user left event */);
};

/**
 * Method called on local MUC role change.
 * @param {string} role the name of new user's role as defined by XMPP MUC.
 */
JitsiConference.prototype.onLocalRoleChanged = function(role) {
    // Emit role changed for local  JID
    this.eventEmitter.emit(
        JitsiConferenceEvents.USER_ROLE_CHANGED, this.myUserId(), role);

    // Maybe start P2P
    this._maybeStartOrStopP2P();
};

JitsiConference.prototype.onUserRoleChanged = function(jid, role) {
    const id = Strophe.getResourceFromJid(jid);
    const participant = this.getParticipantById(id);

    if (!participant) {
        return;
    }
    participant._role = role;
    this.eventEmitter.emit(JitsiConferenceEvents.USER_ROLE_CHANGED, id, role);
};

JitsiConference.prototype.onDisplayNameChanged = function(jid, displayName) {
    const id = Strophe.getResourceFromJid(jid);
    const participant = this.getParticipantById(id);

    if (!participant) {
        return;
    }

    if (participant._displayName === displayName) {
        return;
    }

    participant._displayName = displayName;
    this.eventEmitter.emit(
        JitsiConferenceEvents.DISPLAY_NAME_CHANGED,
        id,
        displayName);
};

/**
 * Notifies this JitsiConference that a JitsiRemoteTrack was added into
 * the conference.
 *
 * @param {JitsiRemoteTrack} track the JitsiRemoteTrack which was added to this
 * JitsiConference
 */
JitsiConference.prototype.onRemoteTrackAdded = function(track) {
    if (track.isP2P && !this.isP2PActive()) {
        logger.info(
            'Trying to add remote P2P track, when not in P2P - IGNORED');

        return;
    } else if (!track.isP2P && this.isP2PActive()) {
        logger.info(
            'Trying to add remote JVB track, when in P2P - IGNORED');

        return;
    }

    const id = track.getParticipantId();
    const participant = this.getParticipantById(id);

    if (!participant) {
        logger.error(`No participant found for id: ${id}`);

        return;
    }

    // Add track to JitsiParticipant.
    participant._tracks.push(track);

    if (this.transcriber) {
        this.transcriber.addTrack(track);
    }

    const emitter = this.eventEmitter;

    track.addEventListener(
        JitsiTrackEvents.TRACK_MUTE_CHANGED,
        () => emitter.emit(JitsiConferenceEvents.TRACK_MUTE_CHANGED, track));
    track.addEventListener(
        JitsiTrackEvents.TRACK_AUDIO_LEVEL_CHANGED,
        (tpc, audioLevel) => {
            const activeTPC = this.getActivePeerConnection();

            if (activeTPC === tpc) {
                emitter.emit(
                    JitsiConferenceEvents.TRACK_AUDIO_LEVEL_CHANGED,
                    id,
                    audioLevel);
            }
        }
    );

    emitter.emit(JitsiConferenceEvents.TRACK_ADDED, track);
};

/**
 * Callback called by the Jingle plugin when 'session-answer' is received.
 * @param {JingleSessionPC} session the Jingle session for which an answer was
 * received.
 * @param {jQuery} answer a jQuery selector pointing to 'jingle' IQ element
 */
// eslint-disable-next-line no-unused-vars
JitsiConference.prototype.onCallAccepted = function(session, answer) {
    if (this.p2pJingleSession === session) {
        logger.info('P2P setAnswer');
        this.p2pJingleSession.setAnswer(answer);
    }
};

/**
 * Callback called by the Jingle plugin when 'transport-info' is received.
 * @param {JingleSessionPC} session the Jingle session for which the IQ was
 * received
 * @param {jQuery} transportInfo a jQuery selector pointing to 'jingle' IQ
 * element
 */
// eslint-disable-next-line no-unused-vars
JitsiConference.prototype.onTransportInfo = function(session, transportInfo) {
    if (this.p2pJingleSession === session) {
        logger.info('P2P addIceCandidates');
        this.p2pJingleSession.addIceCandidates(transportInfo);
    }
};

/**
 * Notifies this JitsiConference that a JitsiRemoteTrack was removed from
 * the conference.
 *
 * @param {JitsiRemoteTrack} removedTrack
 */
JitsiConference.prototype.onRemoteTrackRemoved = function(removedTrack) {
    let consumed = false;

    this.getParticipants().forEach(participant => {
        const tracks = participant.getTracks();

        for (let i = 0; i < tracks.length; i++) {
            if (tracks[i] === removedTrack) {
                // Since the tracks have been compared and are
                // considered equal the result of splice can be ignored.
                participant._tracks.splice(i, 1);

                this.eventEmitter.emit(
                    JitsiConferenceEvents.TRACK_REMOVED, removedTrack);

                if (this.transcriber) {
                    this.transcriber.removeTrack(removedTrack);
                }

                consumed = true;

                break;
            }
        }
    }, this);

    if (!consumed) {
        if ((this.isP2PActive() && !removedTrack.isP2P)
             || (!this.isP2PActive() && removedTrack.isP2P)) {
            // A remote track can be removed either as a result of
            // 'source-remove' or the P2P logic which removes remote tracks
            // explicitly when switching between JVB and P2P connections.
            // The check above filters out the P2P logic case which should not
            // result in an error (which just goes over all remote tracks).
            return;
        }
        logger.error(
            'Failed to match remote track on remove'
                + ' with any of the participants',
            removedTrack.getStreamId(),
            removedTrack.getParticipantId());
    }
};

/**
 * Handles incoming call event.
 */
JitsiConference.prototype.onIncomingCall
= function(jingleSession, jingleOffer, now) {
    // Handle incoming P2P call
    if (jingleSession.isP2P) {
        const role = this.room.getMemberRole(jingleSession.peerjid);

        if (role !== 'moderator') {
            // Reject incoming P2P call
            this._rejectIncomingCallNonModerator(jingleSession);
        } else if (!RTCBrowserType.isP2PSupported()) {
            // Reject incoming P2P call (already in progress)
            this._rejectIncomingCall(
                jingleSession, {
                    reasonTag: 'unsupported-applications',
                    reasonMsg: 'P2P not supported',
                    errorMsg: 'This client does not support P2P connections'
                });
        } else if (this.p2pJingleSession) {
            // Reject incoming P2P call (already in progress)
            this._rejectIncomingCall(
                jingleSession, {
                    reasonTag: 'busy',
                    reasonMsg: 'P2P already in progress',
                    errorMsg: 'Duplicated P2P "session-initiate"'
                });
        } else {
            // Accept incoming P2P call
            this._acceptP2PIncomingCall(jingleSession, jingleOffer);
        }

        return;
    } else if (!this.room.isFocus(jingleSession.peerjid)) {
        this._rejectIncomingCall(jingleSession);

        return;
    }

    // Accept incoming call
    this.jvbJingleSession = jingleSession;
    this.room.connectionTimes['session.initiate'] = now;

    // Log "session.restart"
    if (this.wasStopped) {
        Statistics.sendEventToAll('session.restart');
    }

    // add info whether call is cross-region
    let crossRegion = null;

    if (window.jitsiRegionInfo) {
        crossRegion = window.jitsiRegionInfo.CrossRegion;
    }
    Statistics.analytics.sendEvent(
        'session.initiate', {
            value: now - this.room.connectionTimes['muc.joined'],
            label: crossRegion
        });
    try {
        jingleSession.initialize(false /* initiator */, this.room, this.rtc);
    } catch (error) {
        GlobalOnErrorHandler.callErrorHandler(error);
    }

    this.rtc.initializeDataChannels(jingleSession.peerconnection);

    // Add local tracks to the session
    try {
        jingleSession.acceptOffer(
            jingleOffer,
            null /* success */,
            error => {
                GlobalOnErrorHandler.callErrorHandler(error);
                logger.error(
                    'Failed to accept incoming Jingle session', error);
            },
            this.getLocalTracks()
        );

        // Start callstats as soon as peerconnection is initialized,
        // do not wait for XMPPEvents.PEERCONNECTION_READY, as it may never
        // happen in case if user doesn't have or denied permission to
        // both camera and microphone.
        logger.info('Starting CallStats for JVB connection...');
        this.statistics.startCallStats(
            this.jvbJingleSession.peerconnection,
            'jitsi' /* Remote user ID for JVB is 'jitsi' */);
        this.statistics.startRemoteStats(this.jvbJingleSession.peerconnection);
    } catch (e) {
        GlobalOnErrorHandler.callErrorHandler(e);
        logger.error(e);
    }
};

/**
 * Rejects incoming Jingle call with 'security-error'. Method should be used to
 * reject calls initiated by unauthorised entities.
 * @param {JingleSessionPC} jingleSession the session instance to be rejected.
 * @private
 */
JitsiConference.prototype._rejectIncomingCallNonModerator
= function(jingleSession) {
    this._rejectIncomingCall(
        jingleSession,
        {
            reasonTag: 'security-error',
            reasonMsg: 'Only focus can start new sessions',
            errorMsg: 'Rejecting session-initiate from non-focus and'
                        + `non-moderator user: ${jingleSession.peerjid}`
        });
};

/**
 * Rejects incoming Jingle call.
 * @param {JingleSessionPC} jingleSession the session instance to be rejected.
 * @param {object} [options]
 * @param {string} options.reasonTag the name of the reason element as defined
 * by Jingle
 * @param {string} options.reasonMsg the reason description which will
 * be included in Jingle 'session-terminate' message.
 * @param {string} options.errorMsg an error message to be logged on global
 * error handler
 * @private
 */
JitsiConference.prototype._rejectIncomingCall
= function(jingleSession, options) {
    if (options && options.errorMsg) {
        GlobalOnErrorHandler.callErrorHandler(new Error(options.errorMsg));
    }

    // Terminate  the jingle session with a reason
    jingleSession.terminate(
        options && options.reasonTag,
        options && options.reasonMsg,
        null /* success callback => we don't care */,
        error => {
            logger.warn(
                'An error occurred while trying to terminate'
                    + ' invalid Jingle session', error);
        });
};

/**
 * Handles the call ended event.
 * @param {JingleSessionPC} jingleSession the jingle session which has been
 * terminated.
 * @param {String} reasonCondition the Jingle reason condition.
 * @param {String|null} reasonText human readable reason text which may provide
 * more details about why the call has been terminated.
 */
JitsiConference.prototype.onCallEnded
= function(jingleSession, reasonCondition, reasonText) {
    logger.info(
        `Call ended: ${reasonCondition} - ${reasonText
            } P2P ?${jingleSession.isP2P}`);
    if (jingleSession === this.jvbJingleSession) {
        this.wasStopped = true;

        // Send session.terminate event
        Statistics.sendEventToAll('session.terminate');

        // Stop the stats
        if (this.statistics) {
            this.statistics.stopRemoteStats(
                this.jvbJingleSession.peerconnection);
            logger.info('Stopping JVB CallStats');
            this.statistics.stopCallStats(
                this.jvbJingleSession.peerconnection);
        }

        // Current JVB JingleSession is no longer valid, so set it to null
        this.jvbJingleSession = null;

        // Let the RTC service do any cleanups
        this.rtc.onCallEnded();
    } else if (jingleSession === this.p2pJingleSession) {
        this._stopP2PSession();
    } else {
        logger.error(
            'Received onCallEnded for invalid session',
            jingleSession.sid,
            jingleSession.peerjid,
            reasonCondition,
            reasonText);
    }
};

/**
 * Handles the suspend detected event. Leaves the room and fires suspended.
 * @param {JingleSessionPC} jingleSession
 */
JitsiConference.prototype.onSuspendDetected = function(jingleSession) {
    if (!jingleSession.isP2P) {
        this.leave();
        this.eventEmitter.emit(JitsiConferenceEvents.SUSPEND_DETECTED);
    }
};

JitsiConference.prototype.updateDTMFSupport = function() {
    let somebodySupportsDTMF = false;
    const participants = this.getParticipants();

    // check if at least 1 participant supports DTMF
    for (let i = 0; i < participants.length; i += 1) {
        if (participants[i].supportsDTMF()) {
            somebodySupportsDTMF = true;
            break;
        }
    }
    if (somebodySupportsDTMF !== this.somebodySupportsDTMF) {
        this.somebodySupportsDTMF = somebodySupportsDTMF;
        this.eventEmitter.emit(
            JitsiConferenceEvents.DTMF_SUPPORT_CHANGED,
            somebodySupportsDTMF);
    }
};

/**
 * Allows to check if there is at least one user in the conference
 * that supports DTMF.
 * @returns {boolean} true if somebody supports DTMF, false otherwise
 */
JitsiConference.prototype.isDTMFSupported = function() {
    return this.somebodySupportsDTMF;
};

/**
 * Returns the local user's ID
 * @return {string} local user's ID
 */
JitsiConference.prototype.myUserId = function() {
    return (
        this.room
            && this.room.myroomjid
                ? Strophe.getResourceFromJid(this.room.myroomjid)
                : null);
};

JitsiConference.prototype.sendTones = function(tones, duration, pause) {
    if (!this.dtmfManager) {
        const peerConnection = this.getActivePeerConnection();

        if (!peerConnection) {
            logger.warn('cannot sendTones: no peer connection');

            return;
        }

        const localAudio = this.getLocalAudioTrack();

        if (!localAudio) {
            logger.warn('cannot sendTones: no local audio stream');

            return;
        }
        this.dtmfManager = new JitsiDTMFManager(localAudio, peerConnection);
    }

    this.dtmfManager.sendTones(tones, duration, pause);
};

/**
 * Returns true if recording is supported and false if not.
 */
JitsiConference.prototype.isRecordingSupported = function() {
    if (this.room) {
        return this.room.isRecordingSupported();
    }

    return false;
};

/**
 * Returns null if the recording is not supported, "on" if the recording started
 * and "off" if the recording is not started.
 */
JitsiConference.prototype.getRecordingState = function() {
    return this.room ? this.room.getRecordingState() : undefined;
};

/**
 * Returns the url of the recorded video.
 */
JitsiConference.prototype.getRecordingURL = function() {
    return this.room ? this.room.getRecordingURL() : null;
};

/**
 * Starts/stops the recording
 */
JitsiConference.prototype.toggleRecording = function(options) {
    if (this.room) {
        return this.room.toggleRecording(options, (status, error) => {
            this.eventEmitter.emit(
                JitsiConferenceEvents.RECORDER_STATE_CHANGED, status, error);
        });
    }
    this.eventEmitter.emit(
        JitsiConferenceEvents.RECORDER_STATE_CHANGED, 'error',
        new Error('The conference is not created yet!'));
};

/**
 * Returns true if the SIP calls are supported and false otherwise
 */
JitsiConference.prototype.isSIPCallingSupported = function() {
    if (this.room) {
        return this.room.isSIPCallingSupported();
    }

    return false;
};

/**
 * Dials a number.
 * @param number the number
 */
JitsiConference.prototype.dial = function(number) {
    if (this.room) {
        return this.room.dial(number);
    }

    return new Promise((resolve, reject) => {
        reject(new Error('The conference is not created yet!'));
    });
};

/**
 * Hangup an existing call
 */
JitsiConference.prototype.hangup = function() {
    if (this.room) {
        return this.room.hangup();
    }

    return new Promise((resolve, reject) => {
        reject(new Error('The conference is not created yet!'));
    });
};

/**
 * Returns the phone number for joining the conference.
 */
JitsiConference.prototype.getPhoneNumber = function() {
    if (this.room) {
        return this.room.getPhoneNumber();
    }

    return null;
};

/**
 * Returns the pin for joining the conference with phone.
 */
JitsiConference.prototype.getPhonePin = function() {
    if (this.room) {
        return this.room.getPhonePin();
    }

    return null;
};

/**
 * Will return P2P or JVB <tt>TraceablePeerConnection</tt> depending on
 * which connection is currently active.
 *
 * @return {TraceablePeerConnection|null} null if there isn't any active
 * <tt>TraceablePeerConnection</tt> currently available.
 * @public (FIXME how to make package local ?)
 */
JitsiConference.prototype.getActivePeerConnection = function() {
    if (this.isP2PActive()) {
        return this.p2pJingleSession.peerconnection;
    }

    return this.jvbJingleSession ? this.jvbJingleSession.peerconnection : null;
};

/**
 * Returns the connection state for the current room. Its ice connection state
 * for its session.
 * NOTE that "completed" ICE state which can appear on the P2P connection will
 * be converted to "connected".
 * @return {string|null} ICE state name or <tt>null</tt> if there is no active
 * peer connection at this time.
 */
JitsiConference.prototype.getConnectionState = function() {
    const peerConnection = this.getActivePeerConnection();

    return peerConnection ? peerConnection.getConnectionState() : null;
};

/**
 * Make all new participants mute their audio/video on join.
 * @param policy {Object} object with 2 boolean properties for video and audio:
 * @param {boolean} audio if audio should be muted.
 * @param {boolean} video if video should be muted.
 */
JitsiConference.prototype.setStartMutedPolicy = function(policy) {
    if (!this.isModerator()) {
        return;
    }
    this.startMutedPolicy = policy;
    this.room.removeFromPresence('startmuted');
    this.room.addToPresence('startmuted', {
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
 * @returns {Object} with 2 properties - audio and video.
 */
JitsiConference.prototype.getStartMutedPolicy = function() {
    return this.startMutedPolicy;
};

/**
 * Check if audio is muted on join.
 */
JitsiConference.prototype.isStartAudioMuted = function() {
    return this.startAudioMuted;
};

/**
 * Check if video is muted on join.
 */
JitsiConference.prototype.isStartVideoMuted = function() {
    return this.startVideoMuted;
};

/**
 * Get object with internal logs.
 */
JitsiConference.prototype.getLogs = function() {
    const data = this.xmpp.getJingleLog();

    const metadata = {};

    metadata.time = new Date();
    metadata.url = window.location.href;
    metadata.ua = navigator.userAgent;

    const log = this.xmpp.getXmppLog();

    if (log) {
        metadata.xmpp = log;
    }

    data.metadata = metadata;

    return data;
};

/**
 * Returns measured connectionTimes.
 */
JitsiConference.prototype.getConnectionTimes = function() {
    return this.room.connectionTimes;
};

/**
 * Sets a property for the local participant.
 */
JitsiConference.prototype.setLocalParticipantProperty = function(name, value) {
    this.sendCommand(`jitsi_participant_${name}`, { value });
};

/**
 * Sends the given feedback through CallStats if enabled.
 *
 * @param overallFeedback an integer between 1 and 5 indicating the
 * user feedback
 * @param detailedFeedback detailed feedback from the user. Not yet used
 */
JitsiConference.prototype.sendFeedback
= function(overallFeedback, detailedFeedback) {
    this.statistics.sendFeedback(overallFeedback, detailedFeedback);
};

/**
 * Returns true if the callstats integration is enabled, otherwise returns
 * false.
 *
 * @returns true if the callstats integration is enabled, otherwise returns
 * false.
 */
JitsiConference.prototype.isCallstatsEnabled = function() {
    return this.statistics.isCallstatsEnabled();
};


/**
 * Handles track attached to container (Calls associateStreamWithVideoTag method
 * from statistics module)
 * @param {JitsiLocalTrack|JitsiRemoteTrack} track the track
 * @param container the container
 */
JitsiConference.prototype._onTrackAttach = function(track, container) {
    const isLocal = track.isLocal();
    let ssrc = null;
    const isP2P = track.isP2P;
    const remoteUserId = isP2P ? track.getParticipantId() : 'jitsi';
    const peerConnection
        = isP2P
            ? this.p2pJingleSession && this.p2pJingleSession.peerconnection
            : this.jvbJingleSession && this.jvbJingleSession.peerconnection;

    if (isLocal) {
        // Local tracks have SSRC stored on per peer connection basis
        if (peerConnection) {
            ssrc = peerConnection.getLocalSSRC(track);
        }
    } else {
        ssrc = track.getSSRC();
    }
    if (!container.id || !ssrc || !peerConnection) {
        return;
    }

    this.statistics.associateStreamWithVideoTag(
        peerConnection,
        ssrc,
        isLocal,
        remoteUserId,
        track.getUsageLabel(),
        container.id);
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
 * @returns {boolean|null} <tt>true</tt> if MUC user is the conference focus,
 * <tt>false</tt> when is not. <tt>null</tt> if we're not in the MUC anymore and
 * are unable to figure out the status or if given <tt>mucJid</tt> is invalid.
 */
JitsiConference.prototype._isFocus = function(mucJid) {
    return this.room ? this.room.isFocus(mucJid) : null;
};

/**
 * Fires CONFERENCE_FAILED event with INCOMPATIBLE_SERVER_VERSIONS parameter
 */
JitsiConference.prototype._fireIncompatibleVersionsEvent = function() {
    this.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.INCOMPATIBLE_SERVER_VERSIONS);
};

/**
 * Sends a message via the data channel.
 * @param to {string} the id of the endpoint that should receive the message.
 * If "" the message will be sent to all participants.
 * @param payload {object} the payload of the message.
 * @throws NetworkError or InvalidStateError or Error if the operation fails.
 */
JitsiConference.prototype.sendEndpointMessage = function(to, payload) {
    this.rtc.sendDataChannelMessage(to, payload);
};

/**
 * Sends a broadcast message via the data channel.
 * @param payload {object} the payload of the message.
 * @throws NetworkError or InvalidStateError or Error if the operation fails.
 */
JitsiConference.prototype.broadcastEndpointMessage = function(payload) {
    this.sendEndpointMessage('', payload);
};

JitsiConference.prototype.isConnectionInterrupted = function() {
    return this.isP2PActive()
        ? this.isP2PConnectionInterrupted : this.isJvbConnectionInterrupted;
};

/**
 * Handles {@link XMPPEvents.CONNECTION_INTERRUPTED}
 * @param {JingleSessionPC} session
 * @private
 */
JitsiConference.prototype._onIceConnectionInterrupted = function(session) {
    if (session.isP2P) {
        this.isP2PConnectionInterrupted = true;
    } else {
        this.isJvbConnectionInterrupted = true;
    }
    if (session.isP2P === this.isP2PActive()) {
        this.eventEmitter.emit(JitsiConferenceEvents.CONNECTION_INTERRUPTED);
    }
};

/**
 * Handles {@link XMPPEvents.CONNECTION_ICE_FAILED}
 * @param {JingleSessionPC} session
 * @private
 */
JitsiConference.prototype._onIceConnectionFailed = function(session) {
    // We do nothing for the JVB connection, because it's up to the Jicofo to
    // eventually come up with the new offer (at least for the time being).
    if (session.isP2P) {
        if (this.p2pJingleSession && this.p2pJingleSession.isInitiator) {
            Statistics.sendEventToAll('p2p.failed');
        }
        this._stopP2PSession('connectivity-error', 'ICE FAILED');
    }
};

/**
 * Handles {@link XMPPEvents.CONNECTION_RESTORED}
 * @param {JingleSessionPC} session
 * @private
 */
JitsiConference.prototype._onIceConnectionRestored = function(session) {
    if (session.isP2P) {
        this.isP2PConnectionInterrupted = false;
    } else {
        this.isJvbConnectionInterrupted = false;
    }

    if (session.isP2P === this.isP2PActive()) {
        this.eventEmitter.emit(JitsiConferenceEvents.CONNECTION_RESTORED);
    }
};

/**
 * Accept incoming P2P Jingle call.
 * @param {JingleSessionPC} jingleSession the session instance
 * @param {jQuery} jingleOffer a jQuery selector pointing to 'jingle' IQ element
 * @private
 */
JitsiConference.prototype._acceptP2PIncomingCall
= function(jingleSession, jingleOffer) {
    jingleSession.setSSRCOwnerJid(this.room.myroomjid);

    this.isP2PConnectionInterrupted = false;

    // Accept the offer
    this.p2pJingleSession = jingleSession;

    this.p2pJingleSession.initialize(
        false /* initiator */, this.room, this.rtc);

    logger.info('Starting CallStats for P2P connection...');
    this.statistics.startCallStats(
        this.p2pJingleSession.peerconnection,
        Strophe.getResourceFromJid(this.p2pJingleSession.peerjid));

    const localTracks = this.getLocalTracks();

    this.p2pJingleSession.acceptOffer(
        jingleOffer,
        () => {
            logger.debug('Got RESULT for P2P "session-accept"');
        },
        error => {
            logger.error(
                'Failed to accept incoming P2P Jingle session', error);
        },
        localTracks);
};

/**
 * Adds remote tracks to the conference associated with the JVB session.
 * @private
 */
JitsiConference.prototype._addRemoteJVBTracks = function() {
    this._addRemoteTracks(
        'JVB', this.jvbJingleSession.peerconnection.getRemoteTracks());
};

/**
 * Adds remote tracks to the conference associated with the P2P session.
 * @private
 */
JitsiConference.prototype._addRemoteP2PTracks = function() {
    this._addRemoteTracks(
        'P2P', this.p2pJingleSession.peerconnection.getRemoteTracks());
};

/**
 * Generates fake "remote track added" events for given Jingle session.
 * @param {string} logName the session's nickname which will appear in log
 * messages.
 * @param {Array<JitsiRemoteTrack>} remoteTracks the tracks that will be added
 * @private
 */
JitsiConference.prototype._addRemoteTracks = function(logName, remoteTracks) {
    for (const track of remoteTracks) {
        logger.info(`Adding remote ${logName} track: ${track}`);
        this.rtc.eventEmitter.emit(RTCEvents.REMOTE_TRACK_ADDED, track);
    }
};

/**
 * Called when {@link XMPPEvents.CONNECTION_ESTABLISHED} event is
 * triggered for a {@link JingleSessionPC}. Switches the conference to use
 * the P2P connection if the event comes from the P2P session.
 * @param {JingleSessionPC} jingleSession the session instance.
 * @private
 */
JitsiConference.prototype._onIceConnectionEstablished
= function(jingleSession) {
    // We don't care about the JVB case, there's nothing to be done
    if (!jingleSession.isP2P) {
        return;
    } else if (this.p2pJingleSession !== jingleSession) {
        logger.error('CONNECTION_ESTABLISHED - wrong P2P session instance ?!');

        return;
    }

    // Update P2P status and emit events
    this._setP2PStatus(true);

    // Remove remote tracks
    if (this.jvbJingleSession) {
        this._removeRemoteJVBTracks();
    } else {
        logger.info('Not removing remote JVB tracks - no session yet');
    }

    // Add remote tracks
    this._addRemoteP2PTracks();

    // Stop media transfer over the JVB connection
    if (this.jvbJingleSession) {
        this._suspendMediaTransferForJvbConnection();
    }

    // Start remote stats
    logger.info('Starting remote stats with p2p connection');
    this.statistics.startRemoteStats(this.p2pJingleSession.peerconnection);

    // Log the P2P established event
    if (this.p2pJingleSession.isInitiator) {
        Statistics.sendEventToAll('p2p.established');
    }
};

/**
 * Clears the deferred start P2P task if it has been scheduled.
 * @private
 */
JitsiConference.prototype._maybeClearDeferredStartP2P = function() {
    if (this.deferredStartP2PTask) {
        logger.info('Cleared deferred start P2P task');
        clearTimeout(this.deferredStartP2PTask);
        this.deferredStartP2PTask = null;
    }
};

/**
 * Removes from the conference remote tracks associated with the JVB
 * connection.
 * @private
 */
JitsiConference.prototype._removeRemoteJVBTracks = function() {
    this._removeRemoteTracks(
        'JVB', this.jvbJingleSession.peerconnection.getRemoteTracks());
};

/**
 * Removes from the conference remote tracks associated with the P2P
 * connection.
 * @private
 */
JitsiConference.prototype._removeRemoteP2PTracks = function() {
    this._removeRemoteTracks(
        'P2P', this.p2pJingleSession.peerconnection.getRemoteTracks());
};

/**
 * Generates fake "remote track removed" events for given Jingle session.
 * @param {string} sessionNickname the session's nickname which will appear in
 * log messages.
 * @param {Array<JitsiRemoteTrack>} remoteTracks the tracks that will be removed
 * @private
 */
JitsiConference.prototype._removeRemoteTracks
= function(sessionNickname, remoteTracks) {
    for (const track of remoteTracks) {
        logger.info(`Removing remote ${sessionNickname} track: ${track}`);
        this.rtc.eventEmitter.emit(RTCEvents.REMOTE_TRACK_REMOVED, track);
    }
};

/**
 * Resumes media transfer over the JVB connection.
 * @private
 */
JitsiConference.prototype._resumeMediaTransferForJvbConnection = function() {
    logger.info('Resuming media transfer over the JVB connection...');
    this.jvbJingleSession.setMediaTransferActive(true).then(
        () => {
            logger.info('Resumed media transfer over the JVB connection!');
        },
        error => {
            logger.error(
                'Failed to resume media transfer over the JVB connection:',
                error);
        });
};

/**
 * Sets new P2P status and updates some events/states hijacked from
 * the <tt>JitsiConference</tt>.
 * @param {boolean} newStatus the new P2P status value, <tt>true</tt> means that
 * P2P is now in use, <tt>false</tt> means that the JVB connection is now in use
 * @private
 */
JitsiConference.prototype._setP2PStatus = function(newStatus) {
    if (this.p2p === newStatus) {
        logger.error(`Called _setP2PStatus with the same status: ${newStatus}`);

        return;
    }
    this.p2p = newStatus;
    if (newStatus) {
        logger.info('Peer to peer connection established!');
    } else {
        logger.info('Peer to peer connection closed!');
    }

    // Put the JVB connection on hold/resume
    if (this.jvbJingleSession) {
        this.statistics.sendConnectionResumeOrHoldEvent(
            this.jvbJingleSession.peerconnection, !newStatus);
    }

    // Clear dtmfManager, so that it can be recreated with new connection
    this.dtmfManager = null;

    // Update P2P status
    this.eventEmitter.emit(
        JitsiConferenceEvents.P2P_STATUS,
        this,
        this.p2p);

    // Refresh connection interrupted/restored
    this.eventEmitter.emit(
        this.isConnectionInterrupted()
            ? JitsiConferenceEvents.CONNECTION_INTERRUPTED
            : JitsiConferenceEvents.CONNECTION_RESTORED);
};

/**
 * Starts new P2P session.
 * @param {string} peerJid the JID of the remote participant
 * @private
 */
JitsiConference.prototype._startP2PSession = function(peerJid) {
    this._maybeClearDeferredStartP2P();
    if (this.p2pJingleSession) {
        logger.error('P2P session already started!');

        return;
    }

    this.isP2PConnectionInterrupted = false;
    this.p2pJingleSession
        = this.xmpp.connection.jingle.newP2PJingleSession(
                this.room.myroomjid,
                peerJid);
    this.p2pJingleSession.setSSRCOwnerJid(this.room.myroomjid);

    logger.info('Created new P2P JingleSession', this.room.myroomjid, peerJid);

    this.p2pJingleSession.initialize(true /* initiator */, this.room, this.rtc);

    logger.info('Starting CallStats for P2P connection...');
    this.statistics.startCallStats(
        this.p2pJingleSession.peerconnection,
        Strophe.getResourceFromJid(this.p2pJingleSession.peerjid));

    // NOTE one may consider to start P2P with the local tracks detached,
    // but no data will be sent until ICE succeeds anyway. And we switch
    // immediately once the P2P ICE connects.
    const localTracks = this.getLocalTracks();

    this.p2pJingleSession.invite(localTracks);
};

/**
 * Suspends media transfer over the JVB connection.
 * @private
 */
JitsiConference.prototype._suspendMediaTransferForJvbConnection = function() {
    logger.info('Suspending media transfer over the JVB connection...');
    this.jvbJingleSession.setMediaTransferActive(false).then(
        () => {
            logger.info('Suspended media transfer over the JVB connection !');
        },
        error => {
            logger.error(
                'Failed to suspend media transfer over the JVB connection:',
                error);
        });
};

/**
 * Method when called will decide whether it's the time to start or stop
 * the P2P session.
 * @param {boolean} userLeftEvent if <tt>true</tt> it means that the call
 * originates from the user left event.
 * @private
 */
JitsiConference.prototype._maybeStartOrStopP2P = function(userLeftEvent) {
    if (!this.options.config.enableP2P || !RTCBrowserType.isP2PSupported()) {
        logger.info('Auto P2P disabled');

        return;
    }
    const peers = this.getParticipants();
    const peerCount = peers.length;
    const isModerator = this.isModerator();

    // FIXME 1 peer and it must *support* P2P switching
    const shouldBeInP2P = peerCount === 1;

    logger.debug(
        `P2P? isModerator: ${isModerator
            }, peerCount: ${peerCount} => ${shouldBeInP2P}`);

    // Clear deferred "start P2P" task
    if (!shouldBeInP2P && this.deferredStartP2PTask) {
        this._maybeClearDeferredStartP2P();
    }

    // Start peer to peer session
    if (isModerator && !this.p2pJingleSession && shouldBeInP2P) {
        const peer = peerCount && peers[0];

        // Everyone is a moderator ?
        if (isModerator && peer.getRole() === 'moderator') {
            const myId = this.myUserId();
            const peersId = peer.getId();

            if (myId > peersId) {
                logger.debug(
                    'Everyone\'s a moderator - '
                    + 'the other peer should start P2P', myId, peersId);

                return;
            } else if (myId === peersId) {
                logger.error('The same IDs ? ', myId, peersId);

                return;
            }
        }
        const jid = peer.getJid();

        if (userLeftEvent) {
            if (this.deferredStartP2PTask) {
                logger.error('Deferred start P2P task\'s been set already!');

                return;
            }
            logger.info(
                `Will start P2P with: ${jid
                    } after ${this.backToP2PDelay} seconds...`);
            this.deferredStartP2PTask = setTimeout(
                this._startP2PSession.bind(this, jid),
                this.backToP2PDelay * 1000);
        } else {
            logger.info(`Will start P2P with: ${jid}`);
            this._startP2PSession(jid);
        }
    } else if (isModerator && this.p2pJingleSession && !shouldBeInP2P) {
        logger.info(`Will stop P2P with: ${this.p2pJingleSession.peerjid}`);

        // Log that there will be a switch back to the JVB connection
        if (this.p2pJingleSession.isInitiator && peerCount > 1) {
            Statistics.sendEventToAll('p2p.switch_to_jvb');
        }
        this._stopP2PSession();
    }
};

/**
 * Stops the current P2P session.
 * @param {string} [reason="success"] one of the Jingle "reason" element
 * names as defined by https://xmpp.org/extensions/xep-0166.html#def-reason
 * @param {string} [reasonDescription="Turing off P2P session"] text
 * description that will be included in the session terminate message
 * @private
 */
JitsiConference.prototype._stopP2PSession
= function(reason, reasonDescription) {
    if (!this.p2pJingleSession) {
        logger.error('No P2P session to be stopped!');

        return;
    }

    const wasP2PEstablished = this.isP2PActive();

    // Swap remote tracks, but only if the P2P has been fully established
    if (wasP2PEstablished) {
        this._resumeMediaTransferForJvbConnection();

        // Remove remote P2P tracks
        this._removeRemoteP2PTracks();
    }

    // Stop P2P stats
    logger.info('Stopping remote stats for P2P connection');
    this.statistics.stopRemoteStats(this.p2pJingleSession.peerconnection);
    logger.info('Stopping CallStats for P2P connection');
    this.statistics.stopCallStats(
        this.p2pJingleSession.peerconnection);

    if (JingleSessionState.ENDED !== this.p2pJingleSession.state) {
        this.p2pJingleSession.terminate(
            reason ? reason : 'success',
            reasonDescription
                ? reasonDescription : 'Turing off P2P session',
            () => {
                logger.info('P2P session terminate RESULT');
            },
            error => {
                logger.warn(
                    'An error occurred while trying to terminate'
                    + ' P2P Jingle session', error);
            });
    }

    this.p2pJingleSession = null;

    // Update P2P status and other affected events/states
    this._setP2PStatus(false);

    if (wasP2PEstablished) {
        // Add back remote JVB tracks
        if (this.jvbJingleSession) {
            this._addRemoteJVBTracks();
        } else {
            logger.info('Not adding remote JVB tracks - no session yet');
        }
    }
};

/**
 * Checks whether or not the conference is currently in the peer to peer mode.
 * Being in peer to peer mode means that the direct connection has been
 * established and the P2P connection is being used for media transmission.
 * @return {boolean} <tt>true</tt> if in P2P mode or <tt>false</tt> otherwise.
 */
JitsiConference.prototype.isP2PActive = function() {
    return this.p2p;
};

/**
 * Returns the current ICE state of the P2P connection.
 * NOTE: method is used by the jitsi-meet-torture tests.
 * @return {string|null} an ICE state or <tt>null</tt> if there's currently
 * no P2P connection.
 */
JitsiConference.prototype.getP2PConnectionState = function() {
    if (this.isP2PActive()) {
        return this.p2pJingleSession.peerconnection.getConnectionState();
    }

    return null;
};


/**
 * Manually starts new P2P session (should be used only in the tests).
 */
JitsiConference.prototype.startP2PSession = function() {
    const peers = this.getParticipants();

    // Start peer to peer session
    if (peers.length === 1) {
        const peerJid = peers[0].getJid();

        this._startP2PSession(peerJid);
    } else {
        throw new Error(
            'There must be exactly 1 participant to start the P2P session !');
    }
};

/**
 * Manually stops the current P2P session (should be used only in the tests)
 */
JitsiConference.prototype.stopP2PSession = function() {
    this._stopP2PSession();
};

/**
 * Get a summary of how long current participants have been the dominant speaker
 * @returns {object}
 */
JitsiConference.prototype.getSpeakerStats = function() {
    return this.speakerStatsCollector.getStats();
};

/**
 * Get video SIP GW handler, if missing will create one.
 *
 * @returns {VideoSIPGW} video SIP GW handler.
 */
JitsiConference.prototype._getVideoSIPGWHandle = function() {
    if (!this.videoSIPGWHandler) {
        this.videoSIPGWHandler = new VideoSIPGW(this.room);
        logger.info('Created VideoSIPGW');
    }

    return this.videoSIPGWHandler;
};

/**
 * Checks whether video SIP GW service is available.
 *
 * @returns {boolean} whether video SIP GW service is available.
 */
JitsiConference.prototype.isVideoSIPGWAvailable = function() {
    return this._getVideoSIPGWHandle().isVideoSIPGWAvailable();
};

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
 * @returns {JitsiVideoSIPGWSession|null} Returns null if conference is not
 * initialised and there is no room.
 */
JitsiConference.prototype.createVideoSIPGWSession
    = function(sipAddress, displayName) {
        if (!this.room) {
            return null;
        }

        return this._getVideoSIPGWHandle()
            .createVideoSIPGWSession(sipAddress, displayName);
    };
