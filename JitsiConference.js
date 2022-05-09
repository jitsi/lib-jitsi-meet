/* global $ */

import { getLogger } from '@jitsi/logger';
import EventEmitter from 'events';
import isEqual from 'lodash.isequal';
import { Strophe } from 'strophe.js';

import * as JitsiConferenceErrors from './JitsiConferenceErrors';
import JitsiConferenceEventManager from './JitsiConferenceEventManager';
import * as JitsiConferenceEvents from './JitsiConferenceEvents';
import JitsiParticipant from './JitsiParticipant';
import JitsiTrackError from './JitsiTrackError';
import * as JitsiTrackErrors from './JitsiTrackErrors';
import * as JitsiTrackEvents from './JitsiTrackEvents';
import authenticateAndUpgradeRole from './authenticateAndUpgradeRole';
import { CodecSelection } from './modules/RTC/CodecSelection';
import RTC from './modules/RTC/RTC';
import { SS_DEFAULT_FRAME_RATE } from './modules/RTC/ScreenObtainer';
import browser from './modules/browser';
import ConnectionQuality from './modules/connectivity/ConnectionQuality';
import IceFailedHandling
    from './modules/connectivity/IceFailedHandling';
import ParticipantConnectionStatusHandler
    from './modules/connectivity/ParticipantConnectionStatus';
import * as DetectionEvents from './modules/detection/DetectionEvents';
import NoAudioSignalDetection from './modules/detection/NoAudioSignalDetection';
import P2PDominantSpeakerDetection from './modules/detection/P2PDominantSpeakerDetection';
import VADAudioAnalyser from './modules/detection/VADAudioAnalyser';
import VADNoiseDetection from './modules/detection/VADNoiseDetection';
import VADTalkMutedDetection from './modules/detection/VADTalkMutedDetection';
import { E2EEncryption } from './modules/e2ee/E2EEncryption';
import E2ePing from './modules/e2eping/e2eping';
import Jvb121EventGenerator from './modules/event/Jvb121EventGenerator';
import FeatureFlags from './modules/flags/FeatureFlags';
import ReceiveVideoController from './modules/qualitycontrol/ReceiveVideoController';
import SendVideoController from './modules/qualitycontrol/SendVideoController';
import RecordingManager from './modules/recording/RecordingManager';
import Settings from './modules/settings/Settings';
import AudioOutputProblemDetector from './modules/statistics/AudioOutputProblemDetector';
import AvgRTPStatsReporter from './modules/statistics/AvgRTPStatsReporter';
import SpeakerStatsCollector from './modules/statistics/SpeakerStatsCollector';
import Statistics from './modules/statistics/statistics';
import Transcriber from './modules/transcription/transcriber';
import GlobalOnErrorHandler from './modules/util/GlobalOnErrorHandler';
import RandomUtil from './modules/util/RandomUtil';
import ComponentsVersions from './modules/version/ComponentsVersions';
import VideoSIPGW from './modules/videosipgw/VideoSIPGW';
import * as VideoSIPGWConstants from './modules/videosipgw/VideoSIPGWConstants';
import SignalingLayerImpl from './modules/xmpp/SignalingLayerImpl';
import {
    FEATURE_E2EE,
    FEATURE_JIGASI,
    JITSI_MEET_MUC_TYPE
} from './modules/xmpp/xmpp';
import BridgeVideoType from './service/RTC/BridgeVideoType';
import CodecMimeType from './service/RTC/CodecMimeType';
import { MediaType } from './service/RTC/MediaType';
import RTCEvents from './service/RTC/RTCEvents';
import { getSourceNameForJitsiTrack } from './service/RTC/SignalingLayer';
import { VideoType } from './service/RTC/VideoType';
import {
    ACTION_JINGLE_RESTART,
    ACTION_JINGLE_SI_RECEIVED,
    ACTION_JINGLE_SI_TIMEOUT,
    ACTION_JINGLE_TERMINATE,
    ACTION_P2P_DECLINED,
    ACTION_P2P_ESTABLISHED,
    ACTION_P2P_FAILED,
    ACTION_P2P_SWITCH_TO_JVB,
    ICE_ESTABLISHMENT_DURATION_DIFF,
    createConferenceEvent,
    createJingleEvent,
    createP2PEvent
} from './service/statistics/AnalyticsEvents';
import { XMPPEvents } from './service/xmpp/XMPPEvents';

const logger = getLogger(__filename);

/**
 * How long since Jicofo is supposed to send a session-initiate, before
 * {@link ACTION_JINGLE_SI_TIMEOUT} analytics event is sent (in ms).
 * @type {number}
 */
const JINGLE_SI_TIMEOUT = 5000;

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
 * @param {boolean} [options.config.enableIceRestart=false] - enables the ICE
 * restart logic.
 * @param {boolean} [options.config.p2p.enabled] when set to <tt>true</tt>
 * the peer to peer mode will be enabled. It means that when there are only 2
 * participants in the conference an attempt to make direct connection will be
 * made. If the connection succeeds the conference will stop sending data
 * through the JVB connection and will use the direct one instead.
 * @param {number} [options.config.p2p.backToP2PDelay=5] a delay given in
 * seconds, before the conference switches back to P2P, after the 3rd
 * participant has left the room.
 * @param {number} [options.config.channelLastN=-1] The requested amount of
 * videos are going to be delivered after the value is in effect. Set to -1 for
 * unlimited or all available videos.
 * @param {number} [options.config.forceJVB121Ratio]
 * "Math.random() < forceJVB121Ratio" will determine whether a 2 people
 * conference should be moved to the JVB instead of P2P. The decision is made on
 * the responder side, after ICE succeeds on the P2P connection.
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
    if (!options.name || options.name.toLowerCase() !== options.name.toString()) {
        const errmsg
            = 'Invalid conference name (no conference name passed or it '
                + 'contains invalid characters like capital letters)!';

        logger.error(errmsg);
        throw new Error(errmsg);
    }
    this.connection = options.connection;
    this.xmpp = this.connection?.xmpp;

    if (this.xmpp.isRoomCreated(options.name, options.customDomain)) {
        const errmsg = 'A conference with the same name has already been created!';

        delete this.connection;
        delete this.xmpp;
        logger.error(errmsg);
        throw new Error(errmsg);
    }
    this.eventEmitter = new EventEmitter();
    this.options = options;
    this.eventManager = new JitsiConferenceEventManager(this);
    this.participants = {};

    /**
     * The signaling layer instance.
     * @type {SignalingLayerImpl}
     * @private
     */
    this._signalingLayer = new SignalingLayerImpl();

    this._init(options);
    this.componentsVersions = new ComponentsVersions(this);

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
    this.isMutedByFocus = false;

    // when muted by focus we receive the jid of the initiator of the mute
    this.mutedByFocusActor = null;

    this.isVideoMutedByFocus = false;

    // when video muted by focus we receive the jid of the initiator of the mute
    this.mutedVideoByFocusActor = null;

    // Flag indicates if the 'onCallEnded' method was ever called on this
    // instance. Used to log extra analytics event for debugging purpose.
    // We need to know if the potential issue happened before or after
    // the restart.
    this.wasStopped = false;

    // Conference properties, maintained by jicofo.
    this.properties = {};

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
     * Detects issues with the audio of remote participants.
     * @type {AudioOutputProblemDetector}
     */
    if (!options.config.disableAudioLevels) {
        this._audioOutputProblemDetector = new AudioOutputProblemDetector(this);
    }

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

    const delay
        = parseInt(options.config.p2p && options.config.p2p.backToP2PDelay, 10);

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

    this.videoSIPGWHandler = new VideoSIPGW(this.room);
    this.recordingManager = new RecordingManager(this.room);

    /**
     * If the conference.joined event has been sent this will store the timestamp when it happened.
     *
     * @type {undefined|number}
     * @private
     */
    this._conferenceJoinAnalyticsEventSent = undefined;

    /**
     * End-to-End Encryption. Make it available if supported.
     */
    if (this.isE2EESupported()) {
        logger.info('End-to-End Encryption is supported');

        this._e2eEncryption = new E2EEncryption(this);
    }

    /**
     * Flag set to <tt>true</tt> when Jicofo sends a presence message indicating that the max audio sender limit has
     * been reached for the call. Once this is set, unmuting audio will be disabled from the client until it gets reset
     * again by Jicofo.
     */
    this._audioSenderLimitReached = undefined;

    /**
     * Flag set to <tt>true</tt> when Jicofo sends a presence message indicating that the max video sender limit has
     * been reached for the call. Once this is set, unmuting video will be disabled from the client until it gets reset
     * again by Jicofo.
     */
    this._videoSenderLimitReached = undefined;
}

// FIXME convert JitsiConference to ES6 - ASAP !
JitsiConference.prototype.constructor = JitsiConference;

/**
 * Create a resource for the a jid. We use the room nickname (the resource part
 * of the occupant JID, see XEP-0045) as the endpoint ID in colibri. We require
 * endpoint IDs to be 8 hex digits because in some cases they get serialized
 * into a 32bit field.
 *
 * @param {string} jid - The id set onto the XMPP connection.
 * @param {boolean} isAuthenticatedUser - Whether or not the user has connected
 * to the XMPP service with a password.
 * @returns {string}
 * @static
 */
JitsiConference.resourceCreator = function(jid, isAuthenticatedUser) {
    let mucNickname;

    if (isAuthenticatedUser) {
        // For authenticated users generate a random ID.
        mucNickname = RandomUtil.randomHexString(8).toLowerCase();
    } else {
        // We try to use the first part of the node (which for anonymous users
        // on prosody is a UUID) to match the previous behavior (and maybe make
        // debugging easier).
        mucNickname = Strophe.getNodeFromJid(jid)?.substr(0, 8)
            .toLowerCase();

        // But if this doesn't have the required format we just generate a new
        // random nickname.
        const re = /[0-9a-f]{8}/g;

        if (!mucNickname || !re.test(mucNickname)) {
            mucNickname = RandomUtil.randomHexString(8).toLowerCase();
        }
    }

    return mucNickname;
};

/**
 * Initializes the conference object properties
 * @param options {object}
 * @param options.connection {JitsiConnection} overrides this.connection
 */
JitsiConference.prototype._init = function(options = {}) {
    this.eventManager.setupXMPPListeners();

    const { config } = this.options;

    // Get the codec preference settings from config.js.
    // 'preferH264' and 'disableH264' settings have been deprecated for a while,
    // 'preferredCodec' and 'disabledCodec' will have precedence over them.
    const codecSettings = {
        disabledCodec: config.videoQuality
            ? config.videoQuality.disabledCodec
            : config.p2p && config.p2p.disableH264 && CodecMimeType.H264,
        enforcePreferredCodec: config.videoQuality && config.videoQuality.enforcePreferredCodec,
        jvbCodec: (config.videoQuality && config.videoQuality.preferredCodec)
            || (config.preferH264 && CodecMimeType.H264),
        p2pCodec: config.p2p
            ? config.p2p.preferredCodec || (config.p2p.preferH264 && CodecMimeType.H264)
            : CodecMimeType.VP8
    };

    this.codecSelection = new CodecSelection(this, codecSettings);
    this._statsCurrentId = config.statisticsId ? config.statisticsId : Settings.callStatsUserName;
    this.room = this.xmpp.createRoom(
        this.options.name, {
            ...config,
            statsId: this._statsCurrentId
        },
        JitsiConference.resourceCreator
    );

    this._signalingLayer.setChatRoom(this.room);

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

    this._updateProperties = this._updateProperties.bind(this);
    this.room.addListener(XMPPEvents.CONFERENCE_PROPERTIES_CHANGED,
        this._updateProperties);

    this._sendConferenceJoinAnalyticsEvent = this._sendConferenceJoinAnalyticsEvent.bind(this);
    this.room.addListener(XMPPEvents.MEETING_ID_SET, this._sendConferenceJoinAnalyticsEvent);

    this._removeLocalSourceOnReject = this._removeLocalSourceOnReject.bind(this);
    this._updateRoomPresence = this._updateRoomPresence.bind(this);
    this.room.addListener(XMPPEvents.SESSION_ACCEPT, this._updateRoomPresence);
    this.room.addListener(XMPPEvents.SOURCE_ADD, this._updateRoomPresence);
    this.room.addListener(XMPPEvents.SOURCE_ADD_ERROR, this._removeLocalSourceOnReject);
    this.room.addListener(XMPPEvents.SOURCE_REMOVE, this._updateRoomPresence);

    if (config.e2eping?.enabled) {
        this.e2eping = new E2ePing(
            this,
            config,
            (message, to) => {
                try {
                    this.sendMessage(message, to, true /* sendThroughVideobridge */);
                } catch (error) {
                    logger.warn('Failed to send E2E ping request or response.', error && error.msg);
                }
            });
    }

    if (!this.rtc) {
        this.rtc = new RTC(this, options);
        this.eventManager.setupRTCListeners();
        if (FeatureFlags.isSourceNameSignalingEnabled()) {
            this._registerRtcListeners(this.rtc);
        }
    }

    this.receiveVideoController = new ReceiveVideoController(this, this.rtc);
    this.sendVideoController = new SendVideoController(this, this.rtc);

    // Do not initialize ParticipantConnectionStatusHandler when source-name signaling is enabled.
    if (!FeatureFlags.isSourceNameSignalingEnabled()) {
        this.participantConnectionStatus
        = new ParticipantConnectionStatusHandler(
            this.rtc,
            this,
            {
                // These options are not public API, leaving it here only as an entry point through config for tuning
                // up purposes. Default values should be adjusted as soon as optimal values are discovered.
                p2pRtcMuteTimeout: config._p2pConnStatusRtcMuteTimeout,
                rtcMuteTimeout: config._peerConnStatusRtcMuteTimeout,
                outOfLastNTimeout: config._peerConnStatusOutOfLastNTimeout
            });
        this.participantConnectionStatus.init();
    }

    // Add the ability to enable callStats only on a percentage of users based on config.js settings.
    let enableCallStats = true;

    if (config.testing && config.testing.callStatsThreshold) {
        enableCallStats = (Math.random() * 100) <= config.testing.callStatsThreshold;
    }

    if (!this.statistics) {
        this.statistics = new Statistics(this.xmpp, {
            aliasName: this._statsCurrentId,
            userName: config.statisticsDisplayName ? config.statisticsDisplayName : this.myUserId(),
            confID: config.confID || `${this.connection.options.hosts.domain}/${this.options.name}`,
            siteID: config.siteID,
            customScriptUrl: config.callStatsCustomScriptUrl,
            callStatsID: config.callStatsID,
            callStatsSecret: config.callStatsSecret,
            callStatsApplicationLogsDisabled: config.callStatsApplicationLogsDisabled,
            enableCallStats,
            roomName: this.options.name,
            applicationName: config.applicationName,
            getWiFiStatsMethod: config.getWiFiStatsMethod,
            configParams: config.callStatsConfigParams
        });
        Statistics.analytics.addPermanentProperties({
            'callstats_name': this._statsCurrentId
        });

        // Start performance observer for monitoring long tasks
        if (config.longTasksStatsInterval) {
            this.statistics.attachLongTasksStats(this);
        }
    }

    this.eventManager.setupChatRoomListeners();

    // Always add listeners because on reload we are executing leave and the
    // listeners are removed from statistics module.
    this.eventManager.setupStatisticsListeners();

    // Disable VAD processing on Safari since it causes audio input to
    // fail on some of the mobile devices.
    if (config.enableTalkWhileMuted && browser.supportsVADDetection()) {
        // If VAD processor factory method is provided uses VAD based detection, otherwise fallback to audio level
        // based detection.
        if (config.createVADProcessor) {
            logger.info('Using VAD detection for generating talk while muted events');

            if (!this._audioAnalyser) {
                this._audioAnalyser = new VADAudioAnalyser(this, config.createVADProcessor);
            }

            const vadTalkMutedDetection = new VADTalkMutedDetection();

            vadTalkMutedDetection.on(DetectionEvents.VAD_TALK_WHILE_MUTED, () =>
                this.eventEmitter.emit(JitsiConferenceEvents.TALK_WHILE_MUTED));

            this._audioAnalyser.addVADDetectionService(vadTalkMutedDetection);
        } else {
            logger.warn('No VAD Processor was provided. Talk while muted detection service was not initialized!');
        }
    }

    // Disable noisy mic detection on safari since it causes the audio input to
    // fail on Safari on iPadOS.
    if (config.enableNoisyMicDetection && browser.supportsVADDetection()) {
        if (config.createVADProcessor) {
            if (!this._audioAnalyser) {
                this._audioAnalyser = new VADAudioAnalyser(this, config.createVADProcessor);
            }

            const vadNoiseDetection = new VADNoiseDetection();

            vadNoiseDetection.on(DetectionEvents.VAD_NOISY_DEVICE, () =>
                this.eventEmitter.emit(JitsiConferenceEvents.NOISY_MIC));

            this._audioAnalyser.addVADDetectionService(vadNoiseDetection);
        } else {
            logger.warn('No VAD Processor was provided. Noisy microphone detection service was not initialized!');
        }
    }

    // Generates events based on no audio input detector.
    if (config.enableNoAudioDetection) {
        this._noAudioSignalDetection = new NoAudioSignalDetection(this);
        this._noAudioSignalDetection.on(DetectionEvents.NO_AUDIO_INPUT, () => {
            this.eventEmitter.emit(JitsiConferenceEvents.NO_AUDIO_INPUT);
        });
        this._noAudioSignalDetection.on(DetectionEvents.AUDIO_INPUT_STATE_CHANGE, hasAudioSignal => {
            this.eventEmitter.emit(JitsiConferenceEvents.AUDIO_INPUT_STATE_CHANGE, hasAudioSignal);
        });
    }


    if ('channelLastN' in config) {
        this.setLastN(config.channelLastN);
    }

    /**
     * Emits {@link JitsiConferenceEvents.JVB121_STATUS}.
     * @type {Jvb121EventGenerator}
     */
    this.jvb121Status = new Jvb121EventGenerator(this);

    // creates dominant speaker detection that works only in p2p mode
    this.p2pDominantSpeakerDetection = new P2PDominantSpeakerDetection(this);

    if (config && config.deploymentInfo && config.deploymentInfo.userRegion) {
        this.setLocalParticipantProperty(
            'region', config.deploymentInfo.userRegion);
    }

    // Publish the codec type to presence.
    this.setLocalParticipantProperty('codecType', this.codecSelection.getPreferredCodec());

    // Set transcription language presence extension.
    // In case the language config is undefined or has the default value that the transcriber uses
    // (in our case Jigasi uses 'en-US'), don't set the participant property in order to avoid
    // needlessly polluting the presence stanza.
    if (config && config.transcriptionLanguage && config.transcriptionLanguage !== 'en-US') {
        this.setLocalParticipantProperty('transcription_language', config.transcriptionLanguage);
    }
};

/**
 * Joins the conference.
 * @param password {string} the password
 * @param replaceParticipant {boolean} whether the current join replaces
 * an existing participant with same jwt from the meeting.
 */
JitsiConference.prototype.join = function(password, replaceParticipant = false) {
    if (this.room) {
        this.room.join(password, replaceParticipant).then(() => this._maybeSetSITimeout());
    }
};

/**
 * Authenticates and upgrades the role of the local participant/user.
 *
 * @returns {Object} A <tt>thenable</tt> which (1) settles when the process of
 * authenticating and upgrading the role of the local participant/user finishes
 * and (2) has a <tt>cancel</tt> method that allows the caller to interrupt the
 * process.
 */
JitsiConference.prototype.authenticateAndUpgradeRole = function(options) {
    return authenticateAndUpgradeRole.call(this, {
        ...options,
        onCreateResource: JitsiConference.resourceCreator
    });
};

/**
 * Check if joined to the conference.
 */
JitsiConference.prototype.isJoined = function() {
    return this.room && this.room.joined;
};

/**
 * Tells whether or not the P2P mode is enabled in the configuration.
 * @return {boolean}
 */
JitsiConference.prototype.isP2PEnabled = function() {
    return Boolean(this.options.config.p2p && this.options.config.p2p.enabled)

        // FIXME: remove once we have a default config template. -saghul
        || typeof this.options.config.p2p === 'undefined';
};

/**
 * When in P2P test mode, the conference will not automatically switch to P2P
 * when there 2 participants.
 * @return {boolean}
 */
JitsiConference.prototype.isP2PTestModeEnabled = function() {
    return Boolean(this.options.config.testing
        && this.options.config.testing.p2pTestMode);
};

/**
 * Leaves the conference.
 * @returns {Promise}
 */
JitsiConference.prototype.leave = async function() {
    if (this.participantConnectionStatus) {
        this.participantConnectionStatus.dispose();
        this.participantConnectionStatus = null;
    }
    if (this.avgRtpStatsReporter) {
        this.avgRtpStatsReporter.dispose();
        this.avgRtpStatsReporter = null;
    }

    if (this._audioOutputProblemDetector) {
        this._audioOutputProblemDetector.dispose();
        this._audioOutputProblemDetector = null;
    }

    if (this.e2eping) {
        this.e2eping.stop();
        this.e2eping = null;
    }

    this.getLocalTracks().forEach(track => this.onLocalTrackRemoved(track));

    this.rtc.closeBridgeChannel();

    this._sendConferenceLeftAnalyticsEvent();

    if (this.statistics) {
        this.statistics.dispose();
    }

    this._delayedIceFailed && this._delayedIceFailed.cancel();

    this._maybeClearSITimeout();

    // Close both JVb and P2P JingleSessions
    if (this.jvbJingleSession) {
        this.jvbJingleSession.close();
        this.jvbJingleSession = null;
    }
    if (this.p2pJingleSession) {
        this.p2pJingleSession.close();
        this.p2pJingleSession = null;
    }

    // Leave the conference. If this.room == null we are calling second time leave().
    if (!this.room) {
        throw new Error('The conference is has been already left');
    }

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

    room.removeListener(
        XMPPEvents.CONFERENCE_PROPERTIES_CHANGED,
        this._updateProperties);

    room.removeListener(XMPPEvents.MEETING_ID_SET, this._sendConferenceJoinAnalyticsEvent);
    room.removeListener(XMPPEvents.SESSION_ACCEPT, this._updateRoomPresence);
    room.removeListener(XMPPEvents.SOURCE_ADD, this._updateRoomPresence);
    room.removeListener(XMPPEvents.SOURCE_ADD_ERROR, this._removeLocalSourceOnReject);
    room.removeListener(XMPPEvents.SOURCE_REMOVE, this._updateRoomPresence);

    this.eventManager.removeXMPPListeners();

    this._signalingLayer.setChatRoom(null);

    this.room = null;

    let leaveError;

    try {
        await room.leave();
    } catch (err) {
        leaveError = err;

        // Remove all participants because currently the conference
        // won't be usable anyway. This is done on success automatically
        // by the ChatRoom instance.
        this.getParticipants().forEach(
            participant => this.onMemberLeft(participant.getJid()));
    }

    if (this.rtc) {
        this.rtc.destroy();
    }

    if (leaveError) {
        throw leaveError;
    }
};

/**
 * Returns the currently active media session if any.
 *
 * @returns {JingleSessionPC|undefined}
 */
JitsiConference.prototype.getActiveMediaSession = function() {
    return this.isP2PActive() ? this.p2pJingleSession : this.jvbJingleSession;
};

/**
 * Returns an array containing all media sessions existing in this conference.
 *
 * @returns {Array<JingleSessionPC>}
 */
JitsiConference.prototype.getMediaSessions = function() {
    const sessions = [];

    this.jvbJingleSession && sessions.push(this.jvbJingleSession);
    this.p2pJingleSession && sessions.push(this.p2pJingleSession);

    return sessions;
};

/**
 * Registers event listeners on the RTC instance.
 * @param {RTC} rtc - the RTC module instance used by this conference.
 * @private
 * @returns {void}
 */
JitsiConference.prototype._registerRtcListeners = function(rtc) {
    rtc.addListener(RTCEvents.DATA_CHANNEL_OPEN, () => {
        for (const localTrack of this.rtc.localTracks) {
            localTrack.isVideoTrack() && this._sendBridgeVideoTypeMessage(localTrack);
        }
    });
};

/**
 * Sends the 'VideoTypeMessage' to the bridge on the bridge channel so that the bridge can make bitrate allocation
 * decisions based on the video type of the local source.
 *
 * @param {JitsiLocalTrack} localtrack - The track associated with the local source signaled to the bridge.
 * @returns {void}
 * @private
 */
JitsiConference.prototype._sendBridgeVideoTypeMessage = function(localtrack) {
    let videoType = !localtrack || localtrack.isMuted() ? BridgeVideoType.NONE : localtrack.getVideoType();

    if (videoType === BridgeVideoType.DESKTOP && this._desktopSharingFrameRate > SS_DEFAULT_FRAME_RATE) {
        videoType = BridgeVideoType.DESKTOP_HIGH_FPS;
    }

    if (FeatureFlags.isSourceNameSignalingEnabled() && localtrack) {
        this.rtc.sendSourceVideoType(localtrack.getSourceName(), videoType);
    } else if (!FeatureFlags.isSourceNameSignalingEnabled()) {
        this.rtc.setVideoType(videoType);
    }
};

/**
 * Returns name of this conference.
 */
JitsiConference.prototype.getName = function() {
    return this.options.name.toString();
};

/**
 * Returns the {@link JitsiConnection} used by this this conference.
 */
JitsiConference.prototype.getConnection = function() {
    return this.connection;
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
 * Returns all the local video tracks.
 * @returns {Array<JitsiLocalTrack>}
 */
JitsiConference.prototype.getLocalVideoTracks = function() {
    return this.rtc ? this.rtc.getLocalVideoTracks() : null;
};

/**
 * Obtains the performance statistics.
 * @returns {Object|null}
 */
JitsiConference.prototype.getPerformanceStats = function() {
    return {
        longTasksStats: this.statistics.getLongTasksStats()
    };
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
  * @param handler {Function} handler to remove for the command
  */
JitsiConference.prototype.removeCommandListener = function(command, handler) {
    if (this.room) {
        this.room.removePresenceListener(command, handler);
    }
};

/**
 * Sends text message to the other participants in the conference
 * @param message the text message.
 * @param elementName the element name to encapsulate the message.
 * @deprecated Use 'sendMessage' instead. TODO: this should be private.
 */
JitsiConference.prototype.sendTextMessage = function(message, elementName = 'body') {
    if (this.room) {
        this.room.sendMessage(message, elementName);
    }
};

/**
 * Send private text message to another participant of the conference
 * @param id the id of the participant to send a private message.
 * @param message the text message.
 * @param elementName the element name to encapsulate the message.
 * @deprecated Use 'sendMessage' instead. TODO: this should be private.
 */
JitsiConference.prototype.sendPrivateTextMessage = function(id, message, elementName = 'body') {
    if (this.room) {
        this.room.sendPrivateMessage(id, message, elementName);
    }
};

/**
 * Send presence command.
 * @param name {String} the name of the command.
 * @param values {Object} with keys and values that will be sent.
 **/
JitsiConference.prototype.sendCommand = function(name, values) {
    if (this.room) {
        this.room.addOrReplaceInPresence(name, values) && this.room.sendPresence();
    } else {
        logger.warn('Not sending a command, room not initialized.');
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
        const nickKey = 'nick';

        // if there is no display name already set, avoid setting an empty one
        if (!name && !this.room.getFromPresence(nickKey)) {
            return;
        }

        this.room.addOrReplaceInPresence(nickKey, {
            attributes: { xmlns: 'http://jabber.org/protocol/nick' },
            value: name
        }) && this.room.sendPresence();
    }
};

/**
 * Set new subject for this conference. (available only for moderator)
 * @param {string} subject new subject
 */
JitsiConference.prototype.setSubject = function(subject) {
    if (this.room && this.isModerator()) {
        this.room.setSubject(subject);
    } else {
        logger.warn(`Failed to set subject, ${this.room ? '' : 'not in a room, '}${
            this.isModerator() ? '' : 'participant is not a moderator'}`);
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
 * Returns the transcription status.
 *
 * @returns {String} "on" or "off".
 */
JitsiConference.prototype.getTranscriptionStatus = function() {
    return this.room.transcriptionStatus;
};

/**
 * Adds JitsiLocalTrack object to the conference.
 * @param {JitsiLocalTrack} track the JitsiLocalTrack object.
 * @returns {Promise<JitsiLocalTrack>}
 * @throws {Error} if the specified track is a video track and there is already
 * another video track in the conference.
 */
JitsiConference.prototype.addTrack = function(track) {
    const mediaType = track.getType();
    const localTracks = this.rtc.getLocalTracks(mediaType);

    // Ensure there's exactly 1 local track of each media type in the conference.
    if (localTracks.length > 0) {
        // Don't be excessively harsh and severe if the API client happens to attempt to add the same local track twice.
        if (track === localTracks[0]) {
            return Promise.resolve(track);
        }

        if (FeatureFlags.isMultiStreamSupportEnabled() && mediaType === MediaType.VIDEO) {
            const addTrackPromises = [];

            this.p2pJingleSession && addTrackPromises.push(this.p2pJingleSession.addTracks([ track ]));
            this.jvbJingleSession && addTrackPromises.push(this.jvbJingleSession.addTracks([ track ]));

            return Promise.all(addTrackPromises)
                .then(() => {
                    this._setupNewTrack(track);
                    this._sendBridgeVideoTypeMessage(track);
                    this._updateRoomPresence(this.getActiveMediaSession());

                    if (this.isMutedByFocus || this.isVideoMutedByFocus) {
                        this._fireMuteChangeEvent(track);
                    }
                });
        }

        return Promise.reject(new Error(`Cannot add second ${mediaType} track to the conference`));
    }

    return this.replaceTrack(null, track)
        .then(() => {
            // Presence needs to be sent here for desktop track since we need the presence to reach the remote peer
            // before signaling so that a fake participant tile is created for screenshare. Otherwise, presence will
            // only be sent after a session-accept or source-add is ack'ed.
            if (track.getVideoType() === VideoType.DESKTOP && FeatureFlags.isMultiStreamSupportEnabled()) {
                this._updateRoomPresence(this.getActiveMediaSession());
            }
        });
};

/**
 * Fires TRACK_AUDIO_LEVEL_CHANGED change conference event (for local tracks).
 * @param {number} audioLevel the audio level
 * @param {TraceablePeerConnection} [tpc]
 */
JitsiConference.prototype._fireAudioLevelChangeEvent = function(audioLevel, tpc) {
    const activeTpc = this.getActivePeerConnection();

    // There will be no TraceablePeerConnection if audio levels do not come from
    // a peerconnection. LocalStatsCollector.js measures audio levels using Web
    // Audio Analyser API and emits local audio levels events through
    // JitsiTrack.setAudioLevel, but does not provide TPC instance which is
    // optional.
    if (!tpc || activeTpc === tpc) {
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
        this.room.muteParticipant(this.room.myroomjid, false, MediaType.AUDIO);
    } else if (this.isVideoMutedByFocus && track.isVideoTrack() && !track.isMuted()) {
        this.isVideoMutedByFocus = false;

        // unmute local user on server
        this.room.muteParticipant(this.room.myroomjid, false, MediaType.VIDEO);
    }

    let actorParticipant;

    if (this.mutedByFocusActor && track.isAudioTrack()) {
        const actorId = Strophe.getResourceFromJid(this.mutedByFocusActor);

        actorParticipant = this.participants[actorId];
    } else if (this.mutedVideoByFocusActor && track.isVideoTrack()) {
        const actorId = Strophe.getResourceFromJid(this.mutedVideoByFocusActor);

        actorParticipant = this.participants[actorId];
    }

    // Send the video type message to the bridge if the track is not removed/added to the pc as part of
    // the mute/unmute operation. This currently happens only on Firefox.
    if (track.isVideoTrack() && !browser.doesVideoMuteByStreamRemove()) {
        this._sendBridgeVideoTypeMessage(track);
    }

    this.eventEmitter.emit(JitsiConferenceEvents.TRACK_MUTE_CHANGED, track, actorParticipant);
};

/**
 * Returns the list of local tracks that need to be added to the peerconnection on join.
 * This takes the startAudioMuted/startVideoMuted flags into consideration since we do not
 * want to add the tracks if the user joins the call audio/video muted. The tracks will be
 * added when the user unmutes for the first time.
 * @returns {Array<JitsiLocalTrack>} - list of local tracks that are unmuted.
 */
JitsiConference.prototype._getInitialLocalTracks = function() {
    // Always add the audio track on certain platforms:
    //  * Safari / WebKit: because of a known issue where audio playout doesn't happen
    //    if the user joins audio and video muted.
    //  * React Native: after iOS 15, if a user joins muted they won't be able to unmute.
    return this.getLocalTracks()
        .filter(track => {
            const trackType = track.getType();

            if (trackType === MediaType.AUDIO
                    && (!this.isStartAudioMuted() || browser.isWebKitBased() || browser.isReactNative())) {
                return true;
            } else if (trackType === MediaType.VIDEO && !this.isStartVideoMuted()) {
                return true;
            }

            return false;
        });
};

/**
 * Clear JitsiLocalTrack properties and listeners.
 * @param track the JitsiLocalTrack object.
 */
JitsiConference.prototype.onLocalTrackRemoved = function(track) {
    track.setConference(null);
    this.rtc.removeLocalTrack(track);
    track.removeEventListener(JitsiTrackEvents.TRACK_MUTE_CHANGED, track.muteHandler);
    if (track.isAudioTrack()) {
        track.removeEventListener(JitsiTrackEvents.TRACK_AUDIO_LEVEL_CHANGED, track.audioLevelHandler);
    }

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
    const oldVideoType = oldTrack?.getVideoType();
    const newVideoType = newTrack?.getVideoType();

    if (FeatureFlags.isMultiStreamSupportEnabled() && oldTrack && newTrack && oldVideoType !== newVideoType) {
        throw new Error(`Replacing a track of videoType=${oldVideoType} with a track of videoType=${newVideoType} is`
            + ' not supported in this mode.');
    }
    const oldTrackBelongsToConference = this === oldTrack?.conference;

    if (oldTrackBelongsToConference && oldTrack.disposed) {
        return Promise.reject(new JitsiTrackError(JitsiTrackErrors.TRACK_IS_DISPOSED));
    }
    if (newTrack?.disposed) {
        return Promise.reject(new JitsiTrackError(JitsiTrackErrors.TRACK_IS_DISPOSED));
    }

    if (oldTrack && !oldTrackBelongsToConference) {
        logger.warn(`JitsiConference.replaceTrack oldTrack (${oldTrack} does not belong to this conference`);
    }

    // Now replace the stream at the lower levels
    return this._doReplaceTrack(oldTrackBelongsToConference ? oldTrack : null, newTrack)
        .then(() => {
            oldTrackBelongsToConference && this.onLocalTrackRemoved(oldTrack);
            newTrack && this._setupNewTrack(newTrack);

            // Send 'VideoTypeMessage' on the bridge channel when a video track is added/removed.
            if ((oldTrackBelongsToConference && oldTrack?.isVideoTrack()) || newTrack?.isVideoTrack()) {
                this._sendBridgeVideoTypeMessage(newTrack);
            }

            // We do not want to send presence update during setEffect switching, which removes and then adds the same
            // track back to the conference.
            if (!(oldTrack?._setEffectInProgress || newTrack?._setEffectInProgress)) {
                this._updateRoomPresence(this.getActiveMediaSession());
            }

            if (newTrack !== null && (this.isMutedByFocus || this.isVideoMutedByFocus)) {
                this._fireMuteChangeEvent(newTrack);
            }

            return Promise.resolve();
        })
        .catch(error => {
            logger.error(`replaceTrack failed: ${error?.stack}`);

            return Promise.reject(error);
        });
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
        replaceTrackPromises.push(this.jvbJingleSession.replaceTrack(oldTrack, newTrack));
    } else {
        logger.info('_doReplaceTrack - no JVB JingleSession');
    }

    if (this.p2pJingleSession) {
        replaceTrackPromises.push(this.p2pJingleSession.replaceTrack(oldTrack, newTrack));
    } else {
        logger.info('_doReplaceTrack - no P2P JingleSession');
    }

    return Promise.all(replaceTrackPromises);
};

/**
 * Handler for when a source-add for a local source is rejected by Jicofo.
 *
 * @param {JingleSessionPC} jingleSession - The media session.
 * @param {Error} error - The error message.
 * @param {MediaType} mediaType - The media type of the track associated with the source that was rejected.
 * @returns {void}
 */
JitsiConference.prototype._removeLocalSourceOnReject = function(jingleSession, error, mediaType) {
    if (!jingleSession) {
        return;
    }
    logger.warn(`Source-add rejected on ${jingleSession}, reason="${error?.reason}", message="${error?.msg}"`);
    const track = this.getLocalTracks(mediaType)[0];

    this.eventEmitter.emit(JitsiConferenceEvents.TRACK_UNMUTE_REJECTED, track);
};

/**
 * Operations related to creating a new track
 * @param {JitsiLocalTrack} newTrack the new track being created
 */
JitsiConference.prototype._setupNewTrack = function(newTrack) {
    const mediaType = newTrack.getType();

    if (newTrack.isAudioTrack() || (newTrack.isVideoTrack() && newTrack.videoType !== VideoType.DESKTOP)) {
        // Report active device to statistics
        const devices = RTC.getCurrentlyAvailableMediaDevices();
        const device = devices
            .find(d => d.kind === `${newTrack.getTrack().kind}input` && d.label === newTrack.getTrack().label);

        if (device) {
            Statistics.sendActiveDeviceListEvent(RTC.getEventDataForActiveDevice(device));
        }
    }

    // Create a source name for this track if it doesn't exist.
    if (FeatureFlags.isSourceNameSignalingEnabled() && !newTrack.getSourceName()) {
        const sourceName = getSourceNameForJitsiTrack(
            this.myUserId(),
            mediaType,
            this.getLocalTracks(mediaType)?.length);

        newTrack.setSourceName(sourceName);
    }

    this.rtc.addLocalTrack(newTrack);
    newTrack.setConference(this);

    // Add event handlers.
    newTrack.muteHandler = this._fireMuteChangeEvent.bind(this, newTrack);
    newTrack.addEventListener(JitsiTrackEvents.TRACK_MUTE_CHANGED, newTrack.muteHandler);

    if (newTrack.isAudioTrack()) {
        newTrack.audioLevelHandler = this._fireAudioLevelChangeEvent.bind(this);
        newTrack.addEventListener(JitsiTrackEvents.TRACK_AUDIO_LEVEL_CHANGED, newTrack.audioLevelHandler);
    }

    this.eventEmitter.emit(JitsiConferenceEvents.TRACK_ADDED, newTrack);
};

/**
 * Sets the video type.
 * @param track
 * @return <tt>true</tt> if video type was changed in presence.
 * @private
 */
JitsiConference.prototype._setNewVideoType = function(track) {
    let videoTypeChanged = false;

    if (FeatureFlags.isSourceNameSignalingEnabled() && track) {
        videoTypeChanged = this._signalingLayer.setTrackVideoType(track.getSourceName(), track.videoType);
    }

    if (!FeatureFlags.isMultiStreamSupportEnabled()) {
        const videoTypeTagName = 'videoType';

        // If track is missing we revert to default type Camera, the case where we screenshare and
        // we return to be video muted.
        const trackVideoType = track ? track.videoType : VideoType.CAMERA;

        // If video type is camera and there is no videoType in presence, we skip adding it, as this is the default one
        if (trackVideoType !== VideoType.CAMERA || this.room.getFromPresence(videoTypeTagName)) {
            // We will not use this.sendCommand here to avoid sending the presence immediately, as later we may also
            // set the mute status.
            const legacyTypeChanged = this.room.addOrReplaceInPresence(videoTypeTagName, { value: trackVideoType });

            videoTypeChanged = videoTypeChanged || legacyTypeChanged;
        }
    }

    return videoTypeChanged;
};

/**
 * Sets mute status.
 * @param mediaType
 * @param localTrack
 * @param isMuted
 * @param <tt>true</tt> when presence was changed, <tt>false</tt> otherwise.
 * @private
 */
JitsiConference.prototype._setTrackMuteStatus = function(mediaType, localTrack, isMuted) {
    let presenceChanged = false;

    if (FeatureFlags.isSourceNameSignalingEnabled() && localTrack) {
        presenceChanged = this._signalingLayer.setTrackMuteStatus(localTrack.getSourceName(), isMuted);
    }

    // Add the 'audioMuted' and 'videoMuted' tags when source name signaling is enabled for backward compatibility.
    // It won't be used anymore when multiple stream support is enabled.
    if (!FeatureFlags.isMultiStreamSupportEnabled()) {
        let audioMuteChanged, videoMuteChanged;

        if (!this.room) {
            return false;
        }

        if (mediaType === MediaType.AUDIO) {
            audioMuteChanged = this.room.addAudioInfoToPresence(isMuted);
        } else {
            videoMuteChanged = this.room.addVideoInfoToPresence(isMuted);
        }

        presenceChanged = presenceChanged || audioMuteChanged || videoMuteChanged;
    }

    return presenceChanged;
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
        logger.debug('Add local MediaStream as unmute - no JVB Jingle session started yet');
    }

    if (this.p2pJingleSession) {
        addAsUnmutePromises.push(this.p2pJingleSession.addTrackAsUnmute(track));
    } else {
        logger.debug('Add local MediaStream as unmute - no P2P Jingle session started yet');
    }

    return Promise.allSettled(addAsUnmutePromises);
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
        removeAsMutePromises.push(this.jvbJingleSession.removeTrackAsMute(track));
    } else {
        logger.debug('Remove local MediaStream - no JVB JingleSession started yet');
    }
    if (this.p2pJingleSession) {
        removeAsMutePromises.push(this.p2pJingleSession.removeTrackAsMute(track));
    } else {
        logger.debug('Remove local MediaStream - no P2P JingleSession started yet');
    }

    return Promise.allSettled(removeAsMutePromises);
};

/**
 * Get role of the local user.
 * @returns {string} user role: 'moderator' or 'none'
 */
JitsiConference.prototype.getRole = function() {
    return this.room.role;
};

/**
 * Returns whether or not the current conference has been joined as a hidden
 * user.
 *
 * @returns {boolean|null} True if hidden, false otherwise. Will return null if
 * no connection is active.
 */
JitsiConference.prototype.isHidden = function() {
    if (!this.connection) {
        return null;
    }

    return Strophe.getDomainFromJid(this.connection.getJid())
        === this.options.config.hiddenDomain;
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
        return Promise.reject(new Error('You are not moderator.'));
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
 * @returns {void}
 */
JitsiConference.prototype.selectParticipant = function(participantId) {
    this.selectParticipants([ participantId ]);
};

/*
 * Elects participants with given ids to be the selected participants in order
 * to receive higher video quality (if simulcast is enabled). The argument
 * should be an array of participant id strings or an empty array; an error will
 * be thrown if a non-array is passed in. The error is thrown as a layer of
 * protection against passing an invalid argument, as the error will happen in
 * the bridge and may not be visible in the client.
 *
 * @param {Array<strings>} participantIds - An array of identifiers for
 * participants.
 * @returns {void}
 */
JitsiConference.prototype.selectParticipants = function(participantIds) {
    if (!Array.isArray(participantIds)) {
        throw new Error('Invalid argument; participantIds must be an array.');
    }

    this.receiveVideoController.selectEndpoints(participantIds);
};

/**
 * Obtains the current value for "lastN". See {@link setLastN} for more info.
 * @returns {number}
 */
JitsiConference.prototype.getLastN = function() {
    return this.receiveVideoController.getLastN();
};

/**
 * Obtains the forwarded sources list in this conference.
 * @return {Array<string>|null}
 */
JitsiConference.prototype.getForwardedSources = function() {
    return this.rtc.getForwardedSources();
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
    this.receiveVideoController.setLastN(n);

    // If the P2P session is not fully established yet, we wait until it gets
    // established.
    if (this.p2pJingleSession) {
        const isVideoActive = n !== 0;

        this.p2pJingleSession
            .setMediaTransferActive(true, isVideoActive)
            .catch(error => {
                logger.error(
                    `Failed to adjust video transfer status (${isVideoActive})`,
                    error);
            });
    }
};

/**
 * Checks if the participant given by participantId is currently included in
 * the last N.
 * @param {string} participantId the identifier of the participant we would
 * like to check.
 * @return {boolean} true if the participant with id is in the last N set or
 * if there's no last N set, false otherwise.
 * @deprecated this method should never be used to figure out the UI, but
 * {@link ParticipantConnectionStatus} should be used instead.
 */
JitsiConference.prototype.isInLastN = function(participantId) {
    return this.rtc.isInLastN(participantId);
};

/**
 * @return Array<JitsiParticipant> an array of all participants in this
 * conference.
 */
JitsiConference.prototype.getParticipants = function() {
    return Object.values(this.participants);
};

/**
 * Returns the number of participants in the conference, including the local
 * participant.
 * @param countHidden {boolean} Whether or not to include hidden participants
 * in the count. Default: false.
 **/
JitsiConference.prototype.getParticipantCount = function(countHidden = false) {
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
 * Grant owner rights to the participant.
 * @param {string} id id of the participant to grant owner rights to.
 */
JitsiConference.prototype.grantOwner = function(id) {
    const participant = this.getParticipantById(id);

    if (!participant) {
        return;
    }
    this.room.setAffiliation(participant.getConnectionJid(), 'owner');
};

/**
 * Revoke owner rights to the participant or local Participant as
 * the user might want to refuse to be a moderator.
 * @param {string} id id of the participant to revoke owner rights to.
 */
JitsiConference.prototype.revokeOwner = function(id) {
    const participant = this.getParticipantById(id);
    const isMyself = this.myUserId() === id;
    const role = this.isMembersOnly() ? 'member' : 'none';

    if (isMyself) {
        this.room.setAffiliation(this.connection.getJid(), role);
    } else if (participant) {
        this.room.setAffiliation(participant.getConnectionJid(), role);
    }
};

/**
 * Kick participant from this conference.
 * @param {string} id id of the participant to kick
 * @param {string} reason reason of the participant to kick
 */
JitsiConference.prototype.kickParticipant = function(id, reason) {
    const participant = this.getParticipantById(id);

    if (!participant) {
        return;
    }
    this.room.kick(participant.getJid(), reason);
};

/**
 * Maybe clears the timeout which emits {@link ACTION_JINGLE_SI_TIMEOUT}
 * analytics event.
 * @private
 */
JitsiConference.prototype._maybeClearSITimeout = function() {
    if (this._sessionInitiateTimeout
            && (this.jvbJingleSession || this.getParticipantCount() < 2)) {
        window.clearTimeout(this._sessionInitiateTimeout);
        this._sessionInitiateTimeout = null;
    }
};

/**
 * Sets a timeout which will emit {@link ACTION_JINGLE_SI_TIMEOUT} analytics
 * event.
 * @private
 */
JitsiConference.prototype._maybeSetSITimeout = function() {
    // Jicofo is supposed to invite if there are at least 2 participants
    if (!this.jvbJingleSession
            && this.getParticipantCount() >= 2
            && !this._sessionInitiateTimeout) {
        this._sessionInitiateTimeout = window.setTimeout(() => {
            this._sessionInitiateTimeout = null;
            Statistics.sendAnalytics(createJingleEvent(
                ACTION_JINGLE_SI_TIMEOUT,
                {
                    p2p: false,
                    value: JINGLE_SI_TIMEOUT
                }));
        }, JINGLE_SI_TIMEOUT);
    }
};

/**
 * Mutes a participant.
 * @param {string} id The id of the participant to mute.
 */
JitsiConference.prototype.muteParticipant = function(id, mediaType) {
    const muteMediaType = mediaType ? mediaType : MediaType.AUDIO;

    if (muteMediaType !== MediaType.AUDIO && muteMediaType !== MediaType.VIDEO) {
        logger.error(`Unsupported media type: ${muteMediaType}`);

        return;
    }

    const participant = this.getParticipantById(id);

    if (!participant) {
        return;
    }
    this.room.muteParticipant(participant.getJid(), true, muteMediaType);
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
 * @param statsID the participant statsID (optional)
 * @param status the initial status if any
 * @param identity the member identity, if any
 * @param botType the member botType, if any
 * @param fullJid the member full jid, if any
 * @param features the member botType, if any
 * @param isReplaceParticipant whether this join replaces a participant with
 * the same jwt.
 */
JitsiConference.prototype.onMemberJoined = function(
        jid, nick, role, isHidden, statsID, status, identity, botType, fullJid, features, isReplaceParticipant) {
    const id = Strophe.getResourceFromJid(jid);

    if (id === 'focus' || this.myUserId() === id) {
        return;
    }

    const participant
        = new JitsiParticipant(jid, this, nick, isHidden, statsID, status, identity);

    participant.setConnectionJid(fullJid);
    participant.setRole(role);
    participant.setBotType(botType);
    participant.setFeatures(features);
    participant.setIsReplacing(isReplaceParticipant);

    this.participants[id] = participant;
    this.eventEmitter.emit(
        JitsiConferenceEvents.USER_JOINED,
        id,
        participant);

    this._updateFeatures(participant);

    // maybeStart only if we had finished joining as then we will have information for the number of participants
    if (this.isJoined()) {
        this._maybeStartOrStopP2P();
    }

    this._maybeSetSITimeout();
};

/* eslint-enable max-params */

/**
 * Get notified when we joined the room.
 *
 * FIXME This should NOT be exposed!
 *
 * @private
 */
JitsiConference.prototype._onMucJoined = function() {
    this._maybeStartOrStopP2P();
};

/**
 * Updates features for a participant.
 * @param {JitsiParticipant} participant - The participant to query for features.
 * @returns {void}
 * @private
 */
JitsiConference.prototype._updateFeatures = function(participant) {
    participant.getFeatures()
        .then(features => {
            participant._supportsDTMF = features.has('urn:xmpp:jingle:dtmf:0');
            this.updateDTMFSupport();

            if (features.has(FEATURE_JIGASI)) {
                participant.setProperty('features_jigasi', true);
            }

            if (features.has(FEATURE_E2EE)) {
                participant.setProperty('features_e2ee', true);
            }
        })
        .catch(() => false);
};

/**
 * Get notified when member bot type had changed.
 * @param jid the member jid
 * @param botType the new botType value
 * @private
 */
JitsiConference.prototype._onMemberBotTypeChanged = function(jid, botType) {

    // find the participant and mark it as non bot, as the real one will join
    // in a moment
    const peers = this.getParticipants();
    const botParticipant = peers.find(p => p.getJid() === jid);

    if (botParticipant) {
        botParticipant.setBotType(botType);
        const id = Strophe.getResourceFromJid(jid);

        this.eventEmitter.emit(
            JitsiConferenceEvents.BOT_TYPE_CHANGED,
            id,
            botType);
    }

    // if botType changed to undefined, botType was removed, in case of
    // poltergeist mode this is the moment when the poltergeist had exited and
    // the real participant had already replaced it.
    // In this case we can check and try p2p
    if (!botParticipant.getBotType()) {
        this._maybeStartOrStopP2P();
    }
};

JitsiConference.prototype.onMemberLeft = function(jid) {
    const id = Strophe.getResourceFromJid(jid);

    if (id === 'focus' || this.myUserId() === id) {
        return;
    }

    const participant = this.participants[id];
    const mediaSessions = this.getMediaSessions();
    let tracksToBeRemoved = [];

    for (const session of mediaSessions) {
        const remoteTracks = session.peerconnection.getRemoteTracks(id);

        remoteTracks && (tracksToBeRemoved = [ ...tracksToBeRemoved, ...remoteTracks ]);

        // Remove the ssrcs from the remote description and renegotiate.
        session.removeRemoteStreamsOnLeave(id);
    }

    // Fire the event before renegotiation is done so that the thumbnails can be removed immediately.
    tracksToBeRemoved.forEach(track => {
        this.eventEmitter.emit(JitsiConferenceEvents.TRACK_REMOVED, track);
    });

    if (participant) {
        delete this.participants[id];
        this.eventEmitter.emit(JitsiConferenceEvents.USER_LEFT, id, participant);
    }

    if (this.room !== null) { // Skip if we have left the room already.
        this._maybeStartOrStopP2P(true /* triggered by user left event */);
        this._maybeClearSITimeout();
    }
};

/* eslint-disable max-params */

/**
 * Designates an event indicating that we were kicked from the XMPP MUC.
 * @param {boolean} isSelfPresence - whether it is for local participant
 * or another participant.
 * @param {string} actorId - the id of the participant who was initiator
 * of the kick.
 * @param {string?} kickedParticipantId - when it is not a kick for local participant,
 * this is the id of the participant which was kicked.
 * @param {string} reason - reason of the participant to kick
 * @param {boolean?} isReplaceParticipant - whether this is a server initiated kick in order
 * to replace it with a participant with same jwt.
 */
JitsiConference.prototype.onMemberKicked = function(
        isSelfPresence,
        actorId,
        kickedParticipantId,
        reason,
        isReplaceParticipant) {
    // This check which be true when we kick someone else. With the introduction of lobby
    // the ChatRoom KICKED event is now also emitted for ourselves (the kicker) so we want to
    // avoid emitting an event where `undefined` kicked someone.
    if (actorId === this.myUserId()) {
        return;
    }

    const actorParticipant = this.participants[actorId];

    if (isSelfPresence) {
        this.eventEmitter.emit(
            JitsiConferenceEvents.KICKED, actorParticipant, reason, isReplaceParticipant);

        this.leave();

        return;
    }

    const kickedParticipant = this.participants[kickedParticipantId];

    kickedParticipant.setIsReplaced(isReplaceParticipant);

    this.eventEmitter.emit(
        JitsiConferenceEvents.PARTICIPANT_KICKED, actorParticipant, kickedParticipant, reason);
};

/**
 * Method called on local MUC role change.
 * @param {string} role the name of new user's role as defined by XMPP MUC.
 */
JitsiConference.prototype.onLocalRoleChanged = function(role) {
    // Emit role changed for local  JID
    this.eventEmitter.emit(
        JitsiConferenceEvents.USER_ROLE_CHANGED, this.myUserId(), role);
};

JitsiConference.prototype.onUserRoleChanged = function(jid, role) {
    const id = Strophe.getResourceFromJid(jid);
    const participant = this.getParticipantById(id);

    if (!participant) {
        return;
    }
    participant.setRole(role);
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
 * Notifies this JitsiConference that a JitsiRemoteTrack was added to the conference.
 *
 * @param {JitsiRemoteTrack} track the JitsiRemoteTrack which was added to this JitsiConference.
 */
JitsiConference.prototype.onRemoteTrackAdded = function(track) {
    if (track.isP2P && !this.isP2PActive()) {
        logger.info('Trying to add remote P2P track, when not in P2P - IGNORED');

        return;
    } else if (!track.isP2P && this.isP2PActive()) {
        logger.info('Trying to add remote JVB track, when in P2P - IGNORED');

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
    track.isAudioTrack() && track.addEventListener(
        JitsiTrackEvents.TRACK_AUDIO_LEVEL_CHANGED,
        (audioLevel, tpc) => {
            const activeTPC = this.getActivePeerConnection();

            if (activeTPC === tpc) {
                emitter.emit(JitsiConferenceEvents.TRACK_AUDIO_LEVEL_CHANGED, id, audioLevel);
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
        this.eventEmitter.emit(JitsiConferenceEvents._MEDIA_SESSION_STARTED, this.p2pJingleSession);
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
    this.getParticipants().forEach(participant => {
        const tracks = participant.getTracks();

        for (let i = 0; i < tracks.length; i++) {
            if (tracks[i] === removedTrack) {
                // Since the tracks have been compared and are
                // considered equal the result of splice can be ignored.
                participant._tracks.splice(i, 1);

                this.eventEmitter.emit(JitsiConferenceEvents.TRACK_REMOVED, removedTrack);

                if (this.transcriber) {
                    this.transcriber.removeTrack(removedTrack);
                }

                break;
            }
        }
    }, this);
};

/**
 * Handles an incoming call event for the P2P jingle session.
 */
JitsiConference.prototype._onIncomingCallP2P = function(jingleSession, jingleOffer) {
    let rejectReason;
    const usesUnifiedPlan = browser.supportsUnifiedPlan()
        && (!browser.isChromiumBased() || (this.options.config.enableUnifiedOnChrome ?? true));
    const contentName = jingleOffer.find('>content').attr('name');
    const peerUsesUnifiedPlan = contentName === '0' || contentName === '1';

    // Reject P2P between endpoints that are not running in the same mode w.r.t to SDPs (plan-b and unified plan).
    if (usesUnifiedPlan !== peerUsesUnifiedPlan) {
        rejectReason = {
            reason: 'decline',
            reasonDescription: 'P2P disabled',
            errorMsg: 'P2P across two endpoints in different SDP modes is disabled'
        };
    } else if ((!this.isP2PEnabled() && !this.isP2PTestModeEnabled())
        || browser.isFirefox()
        || browser.isWebKitBased()) {
        rejectReason = {
            reason: 'decline',
            reasonDescription: 'P2P disabled',
            errorMsg: 'P2P mode disabled in the configuration or browser unsupported'
        };
    } else if (this.p2pJingleSession) {
        // Reject incoming P2P call (already in progress)
        rejectReason = {
            reason: 'busy',
            reasonDescription: 'P2P already in progress',
            errorMsg: 'Duplicated P2P "session-initiate"'
        };
    } else if (!this._shouldBeInP2PMode()) {
        rejectReason = {
            reason: 'decline',
            reasonDescription: 'P2P requirements not met',
            errorMsg: 'Received P2P "session-initiate" when should not be in P2P mode'
        };
        Statistics.sendAnalytics(createJingleEvent(ACTION_P2P_DECLINED));
    }

    if (rejectReason) {
        this._rejectIncomingCall(jingleSession, rejectReason);
    } else {
        this._acceptP2PIncomingCall(jingleSession, jingleOffer);
    }
};

/**
 * Handles an incoming call event.
 */
JitsiConference.prototype.onIncomingCall = function(jingleSession, jingleOffer, now) {
    // Handle incoming P2P call
    if (jingleSession.isP2P) {
        this._onIncomingCallP2P(jingleSession, jingleOffer);
    } else {
        if (!this.isFocus(jingleSession.remoteJid)) {
            const description = 'Rejecting session-initiate from non-focus.';

            this._rejectIncomingCall(
                jingleSession, {
                    reason: 'security-error',
                    reasonDescription: description,
                    errorMsg: description
                });

            return;
        }
        this._acceptJvbIncomingCall(jingleSession, jingleOffer, now);
    }
};

/**
 * Accepts an incoming call event for the JVB jingle session.
 */
JitsiConference.prototype._acceptJvbIncomingCall = function(jingleSession, jingleOffer, now) {

    // Accept incoming call
    this.jvbJingleSession = jingleSession;
    this.room.connectionTimes['session.initiate'] = now;
    this._sendConferenceJoinAnalyticsEvent();

    if (this.wasStopped) {
        Statistics.sendAnalyticsAndLog(createJingleEvent(ACTION_JINGLE_RESTART, { p2p: false }));
    }

    const serverRegion
        = $(jingleOffer)
            .find('>bridge-session[xmlns="http://jitsi.org/protocol/focus"]')
            .attr('region');

    this.eventEmitter.emit(JitsiConferenceEvents.SERVER_REGION_CHANGED, serverRegion);

    this._maybeClearSITimeout();
    Statistics.sendAnalytics(createJingleEvent(
        ACTION_JINGLE_SI_RECEIVED,
        {
            p2p: false,
            value: now
        }));

    try {
        jingleSession.initialize(
            this.room,
            this.rtc,
            this._signalingLayer,
            {
                ...this.options.config,
                enableInsertableStreams: this.isE2EEEnabled()
            });
    } catch (error) {
        GlobalOnErrorHandler.callErrorHandler(error);
        logger.error(error);

        return;
    }

    // Open a channel with the videobridge.
    this._setBridgeChannel(jingleOffer, jingleSession.peerconnection);

    const localTracks = this._getInitialLocalTracks();

    try {
        jingleSession.acceptOffer(
            jingleOffer,
            () => {
                // If for any reason invite for the JVB session arrived after
                // the P2P has been established already the media transfer needs
                // to be turned off here.
                if (this.isP2PActive() && this.jvbJingleSession) {
                    this._suspendMediaTransferForJvbConnection();
                }

                this.eventEmitter.emit(JitsiConferenceEvents._MEDIA_SESSION_STARTED, jingleSession);
                if (!this.isP2PActive()) {
                    this.eventEmitter.emit(JitsiConferenceEvents._MEDIA_SESSION_ACTIVE_CHANGED, jingleSession);
                }
            },
            error => {
                GlobalOnErrorHandler.callErrorHandler(error);
                logger.error('Failed to accept incoming Jingle session', error);
            },
            localTracks
        );

        // Enable or disable simulcast for plan-b screensharing based on the capture fps if it is set through the UI.
        this._desktopSharingFrameRate
            && jingleSession.peerconnection.setDesktopSharingFrameRate(this._desktopSharingFrameRate);

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
 * Sets the BridgeChannel.
 *
 * @param {jQuery} offerIq a jQuery selector pointing to the jingle element of
 * the offer IQ which may carry the WebSocket URL for the 'websocket'
 * BridgeChannel mode.
 * @param {TraceablePeerConnection} pc the peer connection which will be used
 * to listen for new WebRTC Data Channels (in the 'datachannel' mode).
 */
JitsiConference.prototype._setBridgeChannel = function(offerIq, pc) {
    let wsUrl = null;
    const webSocket
        = $(offerIq)
            .find('>content>transport>web-socket')
            .first();

    if (webSocket.length === 1) {
        wsUrl = webSocket[0].getAttribute('url');
    }

    if (wsUrl) {
        // If the offer contains a websocket use it.
        this.rtc.initializeBridgeChannel(null, wsUrl);
    } else {
        // Otherwise, fall back to an attempt to use SCTP.
        this.rtc.initializeBridgeChannel(pc, null);
    }
};

/**
 * Rejects incoming Jingle call.
 * @param {JingleSessionPC} jingleSession the session instance to be rejected.
 * @param {object} [options]
 * @param {string} options.reason the name of the reason element as defined
 * by Jingle
 * @param {string} options.reasonDescription the reason description which will
 * be included in Jingle 'session-terminate' message.
 * @param {string} options.errorMsg an error message to be logged on global
 * error handler
 * @private
 */
JitsiConference.prototype._rejectIncomingCall = function(jingleSession, options) {
    if (options && options.errorMsg) {
        GlobalOnErrorHandler.callErrorHandler(new Error(options.errorMsg));
    }

    // Terminate the jingle session with a reason
    jingleSession.terminate(
        null /* success callback => we don't care */,
        error => {
            logger.warn(
                'An error occurred while trying to terminate'
                    + ' invalid Jingle session', error);
        }, {
            reason: options && options.reason,
            reasonDescription: options && options.reasonDescription,
            sendSessionTerminate: true
        });
};

/**
 * Handles the call ended event.
 * XXX is this due to the remote side terminating the Jingle session?
 *
 * @param {JingleSessionPC} jingleSession the jingle session which has been
 * terminated.
 * @param {String} reasonCondition the Jingle reason condition.
 * @param {String|null} reasonText human readable reason text which may provide
 * more details about why the call has been terminated.
 */
JitsiConference.prototype.onCallEnded = function(jingleSession, reasonCondition, reasonText) {
    logger.info(
        `Call ended: ${reasonCondition} - ${reasonText} P2P ?${
            jingleSession.isP2P}`);
    if (jingleSession === this.jvbJingleSession) {
        this.wasStopped = true;

        Statistics.sendAnalytics(
            createJingleEvent(ACTION_JINGLE_TERMINATE, { p2p: false }));

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
        const stopOptions = {};

        // It's the responder who decides to enforce JVB mode, so that both
        // initiator and responder are aware if it was intentional.
        if (reasonCondition === 'decline' && reasonText === 'force JVB121') {
            logger.info('In forced JVB 121 mode...');
            Statistics.analytics.addPermanentProperties({ forceJvb121: true });
        } else if (reasonCondition === 'connectivity-error'
            && reasonText === 'ICE FAILED') {
            // It can happen that the other peer detects ICE failed and
            // terminates the session, before we get the event on our side.
            // But we are able to parse the reason and mark it here.
            Statistics.analytics.addPermanentProperties({ p2pFailed: true });
        } else if (reasonCondition === 'success' && reasonText === 'restart') {
            // When we are restarting media sessions we don't want to switch the tracks
            // to the JVB just yet.
            stopOptions.requestRestart = true;
        }
        this._stopP2PSession(stopOptions);
    } else {
        logger.error(
            'Received onCallEnded for invalid session',
            jingleSession.sid,
            jingleSession.remoteJid,
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
        this.room && this.room.myroomjid
            ? Strophe.getResourceFromJid(this.room.myroomjid)
            : null);
};

JitsiConference.prototype.sendTones = function(tones, duration, pause) {
    const peerConnection = this.getActivePeerConnection();

    if (peerConnection) {
        peerConnection.sendTones(tones, duration, pause);
    } else {
        logger.warn('cannot sendTones: no peer connection');
    }
};

/**
 * Starts recording the current conference.
 *
 * @param {Object} options - Configuration for the recording. See
 * {@link Chatroom#startRecording} for more info.
 * @returns {Promise} See {@link Chatroom#startRecording} for more info.
 */
JitsiConference.prototype.startRecording = function(options) {
    if (this.room) {
        return this.recordingManager.startRecording(options);
    }

    return Promise.reject(new Error('The conference is not created yet!'));
};

/**
 * Stop a recording session.
 *
 * @param {string} sessionID - The ID of the recording session that
 * should be stopped.
 * @returns {Promise} See {@link Chatroom#stopRecording} for more info.
 */
JitsiConference.prototype.stopRecording = function(sessionID) {
    if (this.room) {
        return this.recordingManager.stopRecording(sessionID);
    }

    return Promise.reject(new Error('The conference is not created yet!'));
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
 * Starts the transcription service.
 */
JitsiConference.prototype.startTranscriber = function() {
    return this.dial('jitsi_meet_transcribe');
};


/**
 * Stops the transcription service.
 */
JitsiConference.prototype.stopTranscriber = JitsiConference.prototype.hangup;

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
 * Returns the meeting unique ID if any.
 *
 * @returns {string|undefined}
 */
JitsiConference.prototype.getMeetingUniqueId = function() {
    if (this.room) {
        return this.room.getMeetingId();
    }
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
    const session = this.isP2PActive() ? this.p2pJingleSession : this.jvbJingleSession;

    return session ? session.peerconnection : null;
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
        logger.warn(`Failed to set start muted policy, ${this.room ? '' : 'not in a room, '}${
            this.isModerator() ? '' : 'participant is not a moderator'}`);

        return;
    }
    this.startMutedPolicy = policy;
    this.room.addOrReplaceInPresence('startmuted', {
        attributes: {
            audio: policy.audio,
            video: policy.video,
            xmlns: 'http://jitsi.org/jitmeet/start-muted'
        }
    }) && this.room.sendPresence();
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
 *  Removes a property for the local participant and sends the updated presence.
 */
JitsiConference.prototype.removeLocalParticipantProperty = function(name) {
    this.removeCommand(`jitsi_participant_${name}`);
    this.room.sendPresence();
};

/**
 * Gets a local participant property.
 *
 * @return value of the local participant property if the tagName exists in the
 * list of properties, otherwise returns undefined.
 */
JitsiConference.prototype.getLocalParticipantProperty = function(name) {
    const property = this.room.presMap.nodes.find(prop =>
        prop.tagName === `jitsi_participant_${name}`
    );

    return property ? property.value : undefined;
};

/**
 * Sends the given feedback through CallStats if enabled.
 *
 * @param overallFeedback an integer between 1 and 5 indicating the
 * user feedback
 * @param detailedFeedback detailed feedback from the user. Not yet used
 * @returns {Promise} Resolves if feedback is submitted successfully.
 */
JitsiConference.prototype.sendFeedback = function(overallFeedback, detailedFeedback) {
    return this.statistics.sendFeedback(overallFeedback, detailedFeedback);
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
 * Finds the SSRC of a given track
 *
 * @param track
 * @returns {number|undefined} the SSRC of the specificed track, otherwise undefined.
 */
JitsiConference.prototype.getSsrcByTrack = function(track) {
    return track.isLocal() ? this.getActivePeerConnection()?.getLocalSSRC(track) : track.getSSRC();
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
        // Local tracks have SSRC stored on per peer connection basis.
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
 * Checks if the user identified by given <tt>mucJid</tt> is the conference focus.
 * @param mucJid the full MUC address of the user to be checked.
 * @returns {boolean|null} <tt>true</tt> if MUC user is the conference focus,
 * <tt>false</tt> when is not. <tt>null</tt> if we're not in the MUC anymore and
 * are unable to figure out the status or if given <tt>mucJid</tt> is invalid.
 */
JitsiConference.prototype.isFocus = function(mucJid) {
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
 * @deprecated Use 'sendMessage' instead. TODO: this should be private.
 */
JitsiConference.prototype.sendEndpointMessage = function(to, payload) {
    this.rtc.sendChannelMessage(to, payload);
};

/**
 * Sends local stats via the bridge channel which then forwards to other endpoints selectively.
 * @param {Object} payload The payload of the message.
 * @throws NetworkError/InvalidStateError/Error if the operation fails or if there is no data channel created.
 */
JitsiConference.prototype.sendEndpointStatsMessage = function(payload) {
    this.rtc.sendEndpointStatsMessage(payload);
};

/**
 * Sends a broadcast message via the data channel.
 * @param payload {object} the payload of the message.
 * @throws NetworkError or InvalidStateError or Error if the operation fails.
 * @deprecated Use 'sendMessage' instead. TODO: this should be private.
 */
JitsiConference.prototype.broadcastEndpointMessage = function(payload) {
    this.sendEndpointMessage('', payload);
};

/**
 * Sends a message to a given endpoint (if 'to' is a non-empty string), or
 * broadcasts it to all endpoints in the conference.
 * @param {string} to The ID of the endpoint/participant which is to receive
 * the message, or '' to broadcast the message to all endpoints in the
 * conference.
 * @param {string|object} message the message to send. If this is of type
 * 'string' it will be sent as a chat message. If it is of type 'object', it
 * will be encapsulated in a format recognized by jitsi-meet and converted to
 * JSON before being sent.
 * @param {boolean} sendThroughVideobridge Whether to send the message through
 * jitsi-videobridge (via the COLIBRI data channel or web socket), or through
 * the XMPP MUC. Currently only objects can be sent through jitsi-videobridge.
 */
JitsiConference.prototype.sendMessage = function(message, to = '', sendThroughVideobridge = false) {
    const messageType = typeof message;

    // Through videobridge we support only objects. Through XMPP we support
    // objects (encapsulated in a specific JSON format) and strings (i.e.
    // regular chat messages).
    if (messageType !== 'object'
            && (sendThroughVideobridge || messageType !== 'string')) {
        logger.error(`Can not send a message of type ${messageType}`);

        return;
    }

    if (sendThroughVideobridge) {
        this.sendEndpointMessage(to, message);
    } else {
        let messageToSend = message;

        // Name of packet extension of message stanza to send the required
        // message in.
        let elementName = 'body';

        if (messageType === 'object') {
            elementName = 'json-message';

            // Mark as valid JSON message if not already
            if (!messageToSend.hasOwnProperty(JITSI_MEET_MUC_TYPE)) {
                messageToSend[JITSI_MEET_MUC_TYPE] = '';
            }

            try {
                messageToSend = JSON.stringify(messageToSend);
            } catch (e) {
                logger.error('Can not send a message, stringify failed: ', e);

                return;
            }
        }

        if (to) {
            this.sendPrivateTextMessage(to, messageToSend, elementName);
        } else {
            // Broadcast
            this.sendTextMessage(messageToSend, elementName);
        }
    }

};

JitsiConference.prototype.isConnectionInterrupted = function() {
    return this.isP2PActive()
        ? this.isP2PConnectionInterrupted : this.isJvbConnectionInterrupted;
};

/**
 * Handles {@link XMPPEvents.CONNECTION_RESTARTED} event. This happens when the bridge goes down
 * and Jicofo moves conferences away to a different bridge.
 * @param {JingleSessionPC} session
 * @private
 */
JitsiConference.prototype._onConferenceRestarted = function(session) {
    if (!session.isP2P && this.options.config.enableForcedReload) {
        this.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED, JitsiConferenceErrors.CONFERENCE_RESTARTED);
    }
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
        // Add p2pFailed property to analytics to distinguish, between "good"
        // and "bad" connection
        Statistics.analytics.addPermanentProperties({ p2pFailed: true });

        if (this.p2pJingleSession) {
            Statistics.sendAnalyticsAndLog(
                createP2PEvent(
                    ACTION_P2P_FAILED,
                    {
                        initiator: this.p2pJingleSession.isInitiator
                    }));

        }
        this._stopP2PSession({
            reason: 'connectivity-error',
            reasonDescription: 'ICE FAILED'
        });
    } else if (session && this.jvbJingleSession === session) {
        this._delayedIceFailed = new IceFailedHandling(this);
        this._delayedIceFailed.start(session);
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
        this._delayedIceFailed && this._delayedIceFailed.cancel();
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
JitsiConference.prototype._acceptP2PIncomingCall = function(jingleSession, jingleOffer) {
    this.isP2PConnectionInterrupted = false;

    // Accept the offer
    this.p2pJingleSession = jingleSession;
    this._sendConferenceJoinAnalyticsEvent();

    this.p2pJingleSession.initialize(
        this.room,
        this.rtc,
        this._signalingLayer,
        {
            ...this.options.config,
            enableInsertableStreams: this.isE2EEEnabled()
        });

    logger.info('Starting CallStats for P2P connection...');

    let remoteID = Strophe.getResourceFromJid(this.p2pJingleSession.remoteJid);

    const participant = this.participants[remoteID];

    if (participant) {
        remoteID = participant.getStatsID() || remoteID;
    }

    this.statistics.startCallStats(
        this.p2pJingleSession.peerconnection,
        remoteID);

    const localTracks = this.getLocalTracks();

    this.p2pJingleSession.acceptOffer(
        jingleOffer,
        () => {
            logger.debug('Got RESULT for P2P "session-accept"');

            this.eventEmitter.emit(
                JitsiConferenceEvents._MEDIA_SESSION_STARTED,
                jingleSession);
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
    this._addRemoteTracks('JVB', this.jvbJingleSession.peerconnection.getRemoteTracks());
};

/**
 * Adds remote tracks to the conference associated with the P2P session.
 * @private
 */
JitsiConference.prototype._addRemoteP2PTracks = function() {
    this._addRemoteTracks('P2P', this.p2pJingleSession.peerconnection.getRemoteTracks());
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
        this.onRemoteTrackAdded(track);
    }
};

/**
 * Called when {@link XMPPEvents.CONNECTION_ESTABLISHED} event is
 * triggered for a {@link JingleSessionPC}. Switches the conference to use
 * the P2P connection if the event comes from the P2P session.
 * @param {JingleSessionPC} jingleSession the session instance.
 * @private
 */
JitsiConference.prototype._onIceConnectionEstablished = function(jingleSession) {
    if (this.p2pJingleSession !== null) {
        // store the establishment time of the p2p session as a field of the
        // JitsiConference because the p2pJingleSession might get disposed (thus
        // the value is lost).
        this.p2pEstablishmentDuration
            = this.p2pJingleSession.establishmentDuration;
    }

    if (this.jvbJingleSession !== null) {
        this.jvbEstablishmentDuration
            = this.jvbJingleSession.establishmentDuration;
    }

    let done = false;
    const forceJVB121Ratio = this.options.config.forceJVB121Ratio;

    // We don't care about the JVB case, there's nothing to be done
    if (!jingleSession.isP2P) {
        done = true;
    } else if (this.p2pJingleSession !== jingleSession) {
        logger.error('CONNECTION_ESTABLISHED - wrong P2P session instance ?!');

        done = true;
    } else if (!jingleSession.isInitiator
        && typeof forceJVB121Ratio === 'number'
        && Math.random() < forceJVB121Ratio) {
        logger.info(`Forcing JVB 121 mode (ratio=${forceJVB121Ratio})...`);
        Statistics.analytics.addPermanentProperties({ forceJvb121: true });
        this._stopP2PSession({
            reason: 'decline',
            reasonDescription: 'force JVB121'
        });

        done = true;
    }

    if (!isNaN(this.p2pEstablishmentDuration)
        && !isNaN(this.jvbEstablishmentDuration)) {
        const establishmentDurationDiff
            = this.p2pEstablishmentDuration - this.jvbEstablishmentDuration;

        Statistics.sendAnalytics(
            ICE_ESTABLISHMENT_DURATION_DIFF,
            { value: establishmentDurationDiff });
    }

    if (jingleSession.isP2P === this.isP2PActive()) {
        this.eventEmitter.emit(JitsiConferenceEvents.CONNECTION_ESTABLISHED);
    }

    if (done) {

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

    this._addRemoteP2PTracks();

    // Stop media transfer over the JVB connection
    if (this.jvbJingleSession) {
        this._suspendMediaTransferForJvbConnection();
    }

    logger.info('Starting remote stats with p2p connection');
    this.statistics.startRemoteStats(this.p2pJingleSession.peerconnection);

    Statistics.sendAnalyticsAndLog(
        createP2PEvent(
            ACTION_P2P_ESTABLISHED,
            {
                initiator: this.p2pJingleSession.isInitiator
            }));

};

/**
 * Called when the chat room reads a new list of properties from jicofo's
 * presence. The properties may have changed, but they don't have to.
 *
 * @param {Object} properties - The properties keyed by the property name
 * ('key').
 * @private
 */
JitsiConference.prototype._updateProperties = function(properties = {}) {
    const changed = !isEqual(properties, this.properties);

    this.properties = properties;
    if (changed) {
        this.eventEmitter.emit(JitsiConferenceEvents.PROPERTIES_CHANGED, this.properties);

        const audioLimitReached = this.properties['audio-limit-reached'] === 'true';
        const videoLimitReached = this.properties['video-limit-reached'] === 'true';

        if (this._audioSenderLimitReached !== audioLimitReached) {
            this._audioSenderLimitReached = audioLimitReached;
            this.eventEmitter.emit(JitsiConferenceEvents.AUDIO_UNMUTE_PERMISSIONS_CHANGED, audioLimitReached);
            logger.info(`Audio unmute permissions set by Jicofo to ${audioLimitReached}`);
        }

        if (this._videoSenderLimitReached !== videoLimitReached) {
            this._videoSenderLimitReached = videoLimitReached;
            this.eventEmitter.emit(JitsiConferenceEvents.VIDEO_UNMUTE_PERMISSIONS_CHANGED, videoLimitReached);
            logger.info(`Video unmute permissions set by Jicofo to ${videoLimitReached}`);
        }

        // Some of the properties need to be added to analytics events.
        const analyticsKeys = [

            // The number of jitsi-videobridge instances currently used for the
            // conference.
            'bridge-count',

            // The conference creation time (set by jicofo).
            'created-ms'
        ];

        analyticsKeys.forEach(key => {
            if (properties[key] !== undefined) {
                Statistics.analytics.addPermanentProperties({
                    [key.replace('-', '_')]: properties[key]
                });
            }
        });
    }
};

/**
 * Gets a conference property with a given key.
 *
 * @param {string} key - The key.
 * @returns {*} The value
 */
JitsiConference.prototype.getProperty = function(key) {
    return this.properties[key];
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
JitsiConference.prototype._removeRemoteTracks = function(sessionNickname, remoteTracks) {
    for (const track of remoteTracks) {
        logger.info(`Removing remote ${sessionNickname} track: ${track}`);
        this.onRemoteTrackRemoved(track);
    }
};

/**
 * Resumes media transfer over the JVB connection.
 * @private
 */
JitsiConference.prototype._resumeMediaTransferForJvbConnection = function() {
    logger.info('Resuming media transfer over the JVB connection...');
    this.jvbJingleSession.setMediaTransferActive(true, true).then(
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
        logger.debug(`Called _setP2PStatus with the same status: ${newStatus}`);

        return;
    }
    this.p2p = newStatus;
    if (newStatus) {
        logger.info('Peer to peer connection established!');

        // When we end up in a valid P2P session need to reset the properties
        // in case they have persisted, after session with another peer.
        Statistics.analytics.addPermanentProperties({
            p2pFailed: false,
            forceJvb121: false
        });

        // Sync up video transfer active in case p2pJingleSession not existed
        // when the lastN value was being adjusted.
        const isVideoActive = this.getLastN() !== 0;

        this.p2pJingleSession
            .setMediaTransferActive(true, isVideoActive)
            .catch(error => {
                logger.error(
                    'Failed to sync up P2P video transfer status'
                        + `(${isVideoActive})`, error);
            });
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
    this.eventEmitter.emit(JitsiConferenceEvents._MEDIA_SESSION_ACTIVE_CHANGED, this.getActiveMediaSession());

    // Refresh connection interrupted/restored
    this.eventEmitter.emit(
        this.isConnectionInterrupted()
            ? JitsiConferenceEvents.CONNECTION_INTERRUPTED
            : JitsiConferenceEvents.CONNECTION_RESTORED);
};

/**
 * Starts new P2P session.
 * @param {string} remoteJid the JID of the remote participant
 * @private
 */
JitsiConference.prototype._startP2PSession = function(remoteJid) {
    this._maybeClearDeferredStartP2P();
    if (this.p2pJingleSession) {
        logger.error('P2P session already started!');

        return;
    }

    this.isP2PConnectionInterrupted = false;
    this.p2pJingleSession
        = this.xmpp.connection.jingle.newP2PJingleSession(
            this.room.myroomjid,
            remoteJid);
    logger.info(
        'Created new P2P JingleSession', this.room.myroomjid, remoteJid);
    this._sendConferenceJoinAnalyticsEvent();

    this.p2pJingleSession.initialize(
        this.room,
        this.rtc,
        this._signalingLayer,
        {
            ...this.options.config,
            enableInsertableStreams: this.isE2EEEnabled()
        });

    logger.info('Starting CallStats for P2P connection...');

    let remoteID = Strophe.getResourceFromJid(this.p2pJingleSession.remoteJid);

    const participant = this.participants[remoteID];

    if (participant) {
        remoteID = participant.getStatsID() || remoteID;
    }

    this.statistics.startCallStats(
        this.p2pJingleSession.peerconnection,
        remoteID);

    const localTracks = this.getLocalTracks();

    this.p2pJingleSession.invite(localTracks);
};

/**
 * Suspends media transfer over the JVB connection.
 * @private
 */
JitsiConference.prototype._suspendMediaTransferForJvbConnection = function() {
    logger.info('Suspending media transfer over the JVB connection...');
    this.jvbJingleSession.setMediaTransferActive(false, false).then(
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
    if (!this.isP2PEnabled()
            || this.isP2PTestModeEnabled()
            || browser.isFirefox()
            || browser.isWebKitBased()
            || this.isE2EEEnabled()) {
        logger.info('Auto P2P disabled');

        return;
    }
    const peers = this.getParticipants();
    const peerCount = peers.length;

    // FIXME 1 peer and it must *support* P2P switching
    const shouldBeInP2P = this._shouldBeInP2PMode();

    // Clear deferred "start P2P" task
    if (!shouldBeInP2P && this.deferredStartP2PTask) {
        this._maybeClearDeferredStartP2P();
    }

    // Start peer to peer session
    if (!this.p2pJingleSession && shouldBeInP2P) {
        const peer = peerCount && peers[0];


        const myId = this.myUserId();
        const peersId = peer.getId();

        if (myId > peersId) {
            logger.debug(
                'I\'m the bigger peersId - '
                + 'the other peer should start P2P', myId, peersId);

            return;
        } else if (myId === peersId) {
            logger.error('The same IDs ? ', myId, peersId);

            return;
        }

        const jid = peer.getJid();

        if (userLeftEvent) {
            if (this.deferredStartP2PTask) {
                logger.error('Deferred start P2P task\'s been set already!');

                return;
            }
            logger.info(
                `Will start P2P with: ${jid} after ${
                    this.backToP2PDelay} seconds...`);
            this.deferredStartP2PTask = setTimeout(
                this._startP2PSession.bind(this, jid),
                this.backToP2PDelay * 1000);
        } else {
            logger.info(`Will start P2P with: ${jid}`);
            this._startP2PSession(jid);
        }
    } else if (this.p2pJingleSession && !shouldBeInP2P) {
        logger.info(`Will stop P2P with: ${this.p2pJingleSession.remoteJid}`);

        // Log that there will be a switch back to the JVB connection
        if (this.p2pJingleSession.isInitiator && peerCount > 1) {
            Statistics.sendAnalyticsAndLog(
                createP2PEvent(ACTION_P2P_SWITCH_TO_JVB));
        }
        this._stopP2PSession();
    }
};

/**
 * Tells whether or not this conference should be currently in the P2P mode.
 *
 * @private
 * @returns {boolean}
 */
JitsiConference.prototype._shouldBeInP2PMode = function() {
    const peers = this.getParticipants();
    const peerCount = peers.length;
    const hasBotPeer = peers.find(p => p.getBotType() === 'poltergeist' || p.hasFeature(FEATURE_JIGASI)) !== undefined;
    const shouldBeInP2P = peerCount === 1 && !hasBotPeer;

    logger.debug(`P2P? peerCount: ${peerCount}, hasBotPeer: ${hasBotPeer} => ${shouldBeInP2P}`);

    return shouldBeInP2P;
};

/**
 * Stops the current P2P session.
 * @param {Object} options - Options for stopping P2P.
 * @param {string} options.reason - One of the Jingle "reason" element
 * names as defined by https://xmpp.org/extensions/xep-0166.html#def-reason
 * @param {string} options.reasonDescription - Text
 * description that will be included in the session terminate message
 * @param {boolean} requestRestart - Whether this is due to a session restart, in which case
 * media will not be resumed on the JVB.
 * @private
 */
JitsiConference.prototype._stopP2PSession = function(options = {}) {
    const {
        reason = 'success',
        reasonDescription = 'Turning off P2P session',
        requestRestart = false
    } = options;

    if (!this.p2pJingleSession) {
        logger.error('No P2P session to be stopped!');

        return;
    }

    const wasP2PEstablished = this.isP2PActive();

    // Swap remote tracks, but only if the P2P has been fully established
    if (wasP2PEstablished) {
        if (this.jvbJingleSession && !requestRestart) {
            this._resumeMediaTransferForJvbConnection();
        }

        // Remove remote P2P tracks
        this._removeRemoteP2PTracks();
    }

    // Stop P2P stats
    logger.info('Stopping remote stats for P2P connection');
    this.statistics.stopRemoteStats(this.p2pJingleSession.peerconnection);
    logger.info('Stopping CallStats for P2P connection');
    this.statistics.stopCallStats(this.p2pJingleSession.peerconnection);

    this.p2pJingleSession.terminate(
        () => {
            logger.info('P2P session terminate RESULT');
        },
        error => {
            // Because both initiator and responder are simultaneously
            // terminating their JingleSessions in case of the 'to JVB switch'
            // when 3rd participant joins, both will dispose their sessions and
            // reply with 'item-not-found' (see strophe.jingle.js). We don't
            // want to log this as an error since it's expected behaviour.
            //
            // We want them both to terminate, because in case of initiator's
            // crash the responder would stay in P2P mode until ICE fails which
            // could take up to 20 seconds.
            //
            // NOTE: whilst this is an error callback,  'success' as a reason is
            // considered as graceful session terminate
            // where both initiator and responder terminate their sessions
            // simultaneously.
            if (reason !== 'success') {
                logger.error('An error occurred while trying to terminate P2P Jingle session', error);
            }
        }, {
            reason,
            reasonDescription,
            sendSessionTerminate: this.room
                && this.getParticipantById(
                    Strophe.getResourceFromJid(this.p2pJingleSession.remoteJid))
        });

    this.p2pJingleSession = null;

    // Update P2P status and other affected events/states
    this._setP2PStatus(false);

    if (wasP2PEstablished) {
        // Add back remote JVB tracks
        if (this.jvbJingleSession && !requestRestart) {
            this._addRemoteJVBTracks();
        } else {
            logger.info('Not adding remote JVB tracks - no session yet');
        }
    }
};

/**
 * Updates room presence if needed and send the packet in case of a modification.
 * @param {JingleSessionPC} jingleSession the session firing the event, contains the peer connection which
 * tracks we will check.
 * @param {Object|null} ctx a context object we can distinguish multiple calls of the same pass of updating tracks.
 */
JitsiConference.prototype._updateRoomPresence = function(jingleSession, ctx) {
    if (!jingleSession) {
        return;
    }

    // skips sending presence twice for the same pass of updating ssrcs
    if (ctx) {
        if (ctx.skip) {
            return;
        }
        ctx.skip = true;
    }

    let presenceChanged = false;
    let muteStatusChanged, videoTypeChanged;
    const localTracks = jingleSession.peerconnection.getLocalTracks();
    const localAudioTracks = localTracks.filter(track => track.getType() === MediaType.AUDIO);
    const localVideoTracks = localTracks.filter(track => track.getType() === MediaType.VIDEO);

    // Set presence for all the available local tracks.
    for (const track of localTracks) {
        muteStatusChanged = this._setTrackMuteStatus(track.getType(), track, track.isMuted());
        if (track.getType() === MediaType.VIDEO) {
            videoTypeChanged = this._setNewVideoType(track);
        }
        presenceChanged = muteStatusChanged || videoTypeChanged;
    }

    // Set the presence in the legacy format if there are no local tracks and multi stream support is not enabled.
    if (!FeatureFlags.isMultiStreamSupportEnabled()) {
        let audioMuteStatusChanged, videoMuteStatusChanged;

        if (!localAudioTracks?.length) {
            audioMuteStatusChanged = this._setTrackMuteStatus(MediaType.AUDIO, undefined, true);
        }
        if (!localVideoTracks?.length) {
            videoMuteStatusChanged = this._setTrackMuteStatus(MediaType.VIDEO, undefined, true);
            videoTypeChanged = this._setNewVideoType();
        }

        presenceChanged = presenceChanged || audioMuteStatusChanged || videoMuteStatusChanged || videoTypeChanged;
    }

    presenceChanged && this.room.sendPresence();
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
 * Configures the peerconnection so that a given framre rate can be achieved for desktop share.
 *
 * @param {number} maxFps The capture framerate to be used for desktop tracks.
 * @returns {boolean} true if the operation is successful, false otherwise.
 */
JitsiConference.prototype.setDesktopSharingFrameRate = function(maxFps) {
    if (typeof maxFps !== 'number' || isNaN(maxFps)) {
        logger.error(`Invalid value ${maxFps} specified for desktop capture frame rate`);

        return false;
    }

    this._desktopSharingFrameRate = maxFps;

    // Enable or disable simulcast for plan-b screensharing based on the capture fps.
    this.jvbJingleSession && this.jvbJingleSession.peerconnection.setDesktopSharingFrameRate(maxFps);

    // Set the capture rate for desktop sharing.
    this.rtc.setDesktopSharingFrameRate(maxFps);

    return true;
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
 * Manually stops the current P2P session (should be used only in the tests).
 */
JitsiConference.prototype.stopP2PSession = function(options) {
    this._stopP2PSession(options);
};

/**
 * Get a summary of how long current participants have been the dominant speaker
 * @returns {object}
 */
JitsiConference.prototype.getSpeakerStats = function() {
    return this.speakerStatsCollector.getStats();
};

/**
 * Sends a face landmarks object to the xmpp server.
 * @param {Object} payload
 */
JitsiConference.prototype.sendFaceLandmarks = function(payload) {
    if (payload.faceExpression) {
        this.xmpp.sendFaceExpressionEvent(this.room.roomjid, payload);
    }
};

/**
 * Sets the constraints for the video that is requested from the bridge.
 *
 * @param {Object} videoConstraints The constraints which are specified in the
 * following format. The message updates the fields that are present and leaves the
 * rest unchanged on the bridge. Therefore, any field that is not applicable anymore
 * should be cleared by passing an empty object or list (whatever is applicable).
 * {
 *      'lastN': 20,
 *      'selectedEndpoints': ['A', 'B', 'C'],
 *      'onStageEndpoints': ['A'],
 *      'defaultConstraints': { 'maxHeight': 180 },
 *      'constraints': {
 *          'A': { 'maxHeight': 720 }
 *      }
 * }
 */
JitsiConference.prototype.setReceiverConstraints = function(videoConstraints) {
    this.receiveVideoController.setReceiverConstraints(videoConstraints);
};

/**
 * Sets the maximum video size the local participant should receive from remote
 * participants.
 *
 * @param {number} maxFrameHeight - the maximum frame height, in pixels,
 * this receiver is willing to receive.
 * @returns {void}
 */
JitsiConference.prototype.setReceiverVideoConstraint = function(maxFrameHeight) {
    this.receiveVideoController.setPreferredReceiveMaxFrameHeight(maxFrameHeight);
};

/**
 * Sets the maximum video size the local participant should send to remote
 * participants.
 * @param {number} maxFrameHeight - The user preferred max frame height.
 * @returns {Promise} promise that will be resolved when the operation is
 * successful and rejected otherwise.
 */
JitsiConference.prototype.setSenderVideoConstraint = function(maxFrameHeight) {
    return this.sendVideoController.setPreferredSendMaxFrameHeight(maxFrameHeight);
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
 * @returns {JitsiVideoSIPGWSession|Error} Returns null if conference is not
 * initialised and there is no room.
 */
JitsiConference.prototype.createVideoSIPGWSession = function(sipAddress, displayName) {
    if (!this.room) {
        return new Error(VideoSIPGWConstants.ERROR_NO_CONNECTION);
    }

    return this.videoSIPGWHandler
        .createVideoSIPGWSession(sipAddress, displayName);
};

/**
 * Sends a conference.join analytics event.
 *
 * @returns {void}
 */
JitsiConference.prototype._sendConferenceJoinAnalyticsEvent = function() {
    const meetingId = this.getMeetingUniqueId();

    if (this._conferenceJoinAnalyticsEventSent || !meetingId || this.getActivePeerConnection() === null) {
        return;
    }

    Statistics.sendAnalytics(createConferenceEvent('joined', {
        meetingId,
        participantId: `${meetingId}.${this._statsCurrentId}`
    }));
    this._conferenceJoinAnalyticsEventSent = Date.now();
};

/**
 * Sends conference.left analytics event.
 * @private
 */
JitsiConference.prototype._sendConferenceLeftAnalyticsEvent = function() {
    const meetingId = this.getMeetingUniqueId();

    if (!meetingId || !this._conferenceJoinAnalyticsEventSent) {

        return;
    }

    Statistics.sendAnalytics(createConferenceEvent('left', {
        meetingId,
        participantId: `${meetingId}.${this._statsCurrentId}`,
        stats: {
            duration: Math.floor((Date.now() - this._conferenceJoinAnalyticsEventSent) / 1000),
            perf: this.getPerformanceStats()
        }
    }));
};

/**
 * Restarts all active media sessions.
 *
 * @returns {void}
 */
JitsiConference.prototype._restartMediaSessions = function() {
    if (this.p2pJingleSession) {
        this._stopP2PSession({
            reasonDescription: 'restart',
            requestRestart: true
        });
    }

    if (this.jvbJingleSession) {
        this.jvbJingleSession.terminate(
            null /* success callback => we don't care */,
            error => {
                logger.warn('An error occurred while trying to terminate the JVB session', error);
            }, {
                reason: 'success',
                reasonDescription: 'restart required',
                requestRestart: true,
                sendSessionTerminate: true
            });
    }

    this._maybeStartOrStopP2P(false);
};

/**
 * Returns whether End-To-End encryption is enabled.
 *
 * @returns {boolean}
 */
JitsiConference.prototype.isE2EEEnabled = function() {
    return Boolean(this._e2eEncryption && this._e2eEncryption.isEnabled());
};

/**
 * Returns whether End-To-End encryption is supported. Note that not all participants
 * in the conference may support it.
 *
 * @returns {boolean}
 */
JitsiConference.prototype.isE2EESupported = function() {
    return E2EEncryption.isSupported(this.options.config);
};

/**
 * Enables / disables End-to-End encryption.
 *
 * @param {boolean} enabled whether to enable E2EE or not.
 * @returns {void}
 */
JitsiConference.prototype.toggleE2EE = function(enabled) {
    if (!this.isE2EESupported()) {
        logger.warn('Cannot enable / disable E2EE: platform is not supported.');

        return;
    }

    this._e2eEncryption.setEnabled(enabled);
};

/**
 * Sets the key and index for End-to-End encryption.
 *
 * @param {CryptoKey} [keyInfo.encryptionKey] - encryption key.
 * @param {Number} [keyInfo.index] - the index of the encryption key.
 * @returns {void}
 */
JitsiConference.prototype.setMediaEncryptionKey = function(keyInfo) {
    this._e2eEncryption.setEncryptionKey(keyInfo);
};

/**
 * Returns <tt>true</tt> if lobby support is enabled in the backend.
 *
 * @returns {boolean} whether lobby is supported in the backend.
 */
JitsiConference.prototype.isLobbySupported = function() {
    return Boolean(this.room && this.room.getLobby().isSupported());
};

/**
 * Returns <tt>true</tt> if the room has members only enabled.
 *
 * @returns {boolean} whether conference room is members only.
 */
JitsiConference.prototype.isMembersOnly = function() {
    return Boolean(this.room && this.room.membersOnlyEnabled);
};

/**
 * Enables lobby by moderators
 *
 * @returns {Promise} resolves when lobby room is joined or rejects with the error.
 */
JitsiConference.prototype.enableLobby = function() {
    if (this.room && this.isModerator()) {
        return this.room.getLobby().enable();
    }

    return Promise.reject(
        new Error('The conference not started or user is not moderator'));
};

/**
 * Disabled lobby by moderators
 *
 * @returns {void}
 */
JitsiConference.prototype.disableLobby = function() {
    if (this.room && this.isModerator()) {
        this.room.getLobby().disable();
    } else {
        logger.warn(`Failed to disable lobby, ${this.room ? '' : 'not in a room, '}${
            this.isModerator() ? '' : 'participant is not a moderator'}`);
    }
};

/**
 * Joins the lobby room with display name and optional email or with a shared password to skip waiting.
 *
 * @param {string} displayName Display name should be set to show it to moderators.
 * @param {string} email Optional email is used to present avatar to the moderator.
 * @returns {Promise<never>}
 */
JitsiConference.prototype.joinLobby = function(displayName, email) {
    if (this.room) {
        return this.room.getLobby().join(displayName, email);
    }

    return Promise.reject(new Error('The conference not started'));
};

/**
 * Gets the local id for a participant in a lobby room.
 * Returns undefined when current participant is not in the lobby room.
 * This is used for lobby room private chat messages.
 *
 * @returns {string}
 */
JitsiConference.prototype.myLobbyUserId = function() {
    if (this.room) {
        return this.room.getLobby().getLocalId();
    }
};

/**
 * Sends a message to a lobby room.
 * When id is specified it sends a private message.
 * Otherwise it sends the message to all moderators.
 * @param {message} Object The message to send
 * @param {string} id The participant id.
 *
 * @returns {void}
 */
JitsiConference.prototype.sendLobbyMessage = function(message, id) {
    if (this.room) {
        if (id) {
            return this.room.getLobby().sendPrivateMessage(id, message);
        }

        return this.room.getLobby().sendMessage(message);
    }
};

/**
 * Adds a message listener to the lobby room
 * @param {Function} listener The listener function,
 * called when a new message is received in the lobby room.
 *
 * @returns {Function} Handler returned to be able to remove it later.
 */
JitsiConference.prototype.addLobbyMessageListener = function(listener) {
    if (this.room) {
        return this.room.getLobby().addMessageListener(listener);
    }
};

/**
 * Removes a message handler from the lobby room
 * @param {Function} handler The handler function  to remove.
 *
 * @returns {void}
 */
JitsiConference.prototype.removeLobbyMessageHandler = function(handler) {
    if (this.room) {
        return this.room.getLobby().removeMessageHandler(handler);
    }
};

/**
 * Denies an occupant in the lobby room access to the conference.
 * @param {string} id The participant id.
 */
JitsiConference.prototype.lobbyDenyAccess = function(id) {
    if (this.room) {
        this.room.getLobby().denyAccess(id);
    }
};

/**
 * Approves the request to join the conference to a participant waiting in the lobby.
 *
 * @param {string} id The participant id.
 */
JitsiConference.prototype.lobbyApproveAccess = function(id) {
    if (this.room) {
        this.room.getLobby().approveAccess(id);
    }
};

/**
 * Returns <tt>true</tt> if AV Moderation support is enabled in the backend.
 *
 * @returns {boolean} whether AV Moderation is supported in the backend.
 */
JitsiConference.prototype.isAVModerationSupported = function() {
    return Boolean(this.room && this.room.getAVModeration().isSupported());
};

/**
 * Enables AV Moderation.
 * @param {MediaType} mediaType "audio" or "video"
 */
JitsiConference.prototype.enableAVModeration = function(mediaType) {
    if (this.room && this.isModerator()
        && (mediaType === MediaType.AUDIO || mediaType === MediaType.VIDEO)) {
        this.room.getAVModeration().enable(true, mediaType);
    } else {
        logger.warn(`Failed to enable AV moderation, ${this.room ? '' : 'not in a room, '}${
            this.isModerator() ? '' : 'participant is not a moderator, '}${
            this.room && this.isModerator() ? 'wrong media type passed' : ''}`);
    }
};

/**
 * Disables AV Moderation.
 * @param {MediaType} mediaType "audio" or "video"
 */
JitsiConference.prototype.disableAVModeration = function(mediaType) {
    if (this.room && this.isModerator()
        && (mediaType === MediaType.AUDIO || mediaType === MediaType.VIDEO)) {
        this.room.getAVModeration().enable(false, mediaType);
    } else {
        logger.warn(`Failed to disable AV moderation, ${this.room ? '' : 'not in a room, '}${
            this.isModerator() ? '' : 'participant is not a moderator, '}${
            this.room && this.isModerator() ? 'wrong media type passed' : ''}`);
    }
};

/**
 * Approve participant access to certain media, allows unmuting audio or video.
 *
 * @param {MediaType} mediaType "audio" or "video"
 * @param id the id of the participant.
 */
JitsiConference.prototype.avModerationApprove = function(mediaType, id) {
    if (this.room && this.isModerator()
        && (mediaType === MediaType.AUDIO || mediaType === MediaType.VIDEO)) {

        const participant = this.getParticipantById(id);

        if (!participant) {
            return;
        }

        this.room.getAVModeration().approve(mediaType, participant.getJid());
    } else {
        logger.warn(`AV moderation approve skipped , ${this.room ? '' : 'not in a room, '}${
            this.isModerator() ? '' : 'participant is not a moderator, '}${
            this.room && this.isModerator() ? 'wrong media type passed' : ''}`);
    }
};

/**
 * Reject participant access to certain media, blocks unmuting audio or video.
 *
 * @param {MediaType} mediaType "audio" or "video"
 * @param id the id of the participant.
 */
JitsiConference.prototype.avModerationReject = function(mediaType, id) {
    if (this.room && this.isModerator()
        && (mediaType === MediaType.AUDIO || mediaType === MediaType.VIDEO)) {

        const participant = this.getParticipantById(id);

        if (!participant) {
            return;
        }

        this.room.getAVModeration().reject(mediaType, participant.getJid());
    } else {
        logger.warn(`AV moderation reject skipped , ${this.room ? '' : 'not in a room, '}${
            this.isModerator() ? '' : 'participant is not a moderator, '}${
            this.room && this.isModerator() ? 'wrong media type passed' : ''}`);
    }
};

/**
 * Returns the breakout rooms manager object.
 *
 * @returns {Object} the breakout rooms manager.
 */
JitsiConference.prototype.getBreakoutRooms = function() {
    return this.room?.getBreakoutRooms();
};
