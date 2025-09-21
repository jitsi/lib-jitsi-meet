import { getLogger } from '@jitsi/logger';
import { isEqual } from 'lodash-es';
import { Strophe } from 'strophe.js';

import * as JitsiConferenceErrors from './JitsiConferenceErrors';
import JitsiConferenceEventManager from './JitsiConferenceEventManager';
import { JitsiConferenceEvents } from './JitsiConferenceEvents';
import type JitsiConnection from './JitsiConnection';
import { JitsiConnectionEvents } from './JitsiConnectionEvents';
import JitsiParticipant from './JitsiParticipant';
import JitsiTrackError from './JitsiTrackError';
import * as JitsiTrackErrors from './JitsiTrackErrors';
import { JitsiTrackEvents } from './JitsiTrackEvents';
import type JitsiLocalTrack from './modules/RTC/JitsiLocalTrack';
import type JitsiRemoteTrack from './modules/RTC/JitsiRemoteTrack';
import JitsiTrack from './modules/RTC/JitsiTrack';
import RTC from './modules/RTC/RTC';
import { SS_DEFAULT_FRAME_RATE } from './modules/RTC/ScreenObtainer';
import type TraceablePeerConnection from './modules/RTC/TraceablePeerConnection';
import browser from './modules/browser';
import ConnectionQuality from './modules/connectivity/ConnectionQuality';
import IceFailedHandling from './modules/connectivity/IceFailedHandling';
import { DetectionEvents } from './modules/detection/DetectionEvents';
import NoAudioSignalDetection from './modules/detection/NoAudioSignalDetection';
import P2PDominantSpeakerDetection from './modules/detection/P2PDominantSpeakerDetection';
import VADAudioAnalyser, { IVADProcessor } from './modules/detection/VADAudioAnalyser';
import VADNoiseDetection from './modules/detection/VADNoiseDetection';
import VADTalkMutedDetection from './modules/detection/VADTalkMutedDetection';
import { E2EEncryption } from './modules/e2ee/E2EEncryption';
import E2ePing from './modules/e2eping/e2eping';
import FeatureFlags from './modules/flags/FeatureFlags';
import { LiteModeContext } from './modules/litemode/LiteModeContext';
import { QualityController } from './modules/qualitycontrol/QualityController';
import { IReceiverVideoConstraints } from './modules/qualitycontrol/ReceiveVideoController';
import JibriSession from './modules/recording/JibriSession';
import RecordingManager, { IRecordingOptions } from './modules/recording/RecordingManager';
import Settings from './modules/settings/Settings';
import AvgRTPStatsReporter from './modules/statistics/AvgRTPStatsReporter';
import LocalStatsCollector from './modules/statistics/LocalStatsCollector';
import SpeakerStats from './modules/statistics/SpeakerStats';
import SpeakerStatsCollector from './modules/statistics/SpeakerStatsCollector';
import Statistics from './modules/statistics/statistics';
import Listenable from './modules/util/Listenable';
import { isValidNumber, safeSubtract } from './modules/util/MathUtil';
import RandomUtil from './modules/util/RandomUtil';
import { getJitterDelay } from './modules/util/Retry';
import $ from './modules/util/XMLParser';
import ComponentsVersions from './modules/version/ComponentsVersions';
import JitsiVideoSIPGWSession from './modules/videosipgw/JitsiVideoSIPGWSession';
import VideoSIPGW from './modules/videosipgw/VideoSIPGW';
import * as VideoSIPGWConstants from './modules/videosipgw/VideoSIPGWConstants';
import BreakoutRooms from './modules/xmpp/BreakoutRooms';
import type { ChatRoom, PresenceHandler } from './modules/xmpp/ChatRoom';
import FileSharing from './modules/xmpp/FileSharing';
import type JingleSessionPC from './modules/xmpp/JingleSessionPC';
import { MediaSessionEvents } from './modules/xmpp/MediaSessionEvents';
import RoomMetadata from './modules/xmpp/RoomMetadata';
import SignalingLayerImpl from './modules/xmpp/SignalingLayerImpl';
import XMPP, {
    FEATURE_E2EE,
    FEATURE_JIGASI,
    IFaceLandmarksPayload,
    JITSI_MEET_MUC_TYPE
} from './modules/xmpp/xmpp';
import { BridgeVideoType } from './service/RTC/BridgeVideoType';
import { CodecMimeType } from './service/RTC/CodecMimeType';
import { MediaType } from './service/RTC/MediaType';
import { RTCEvents } from './service/RTC/RTCEvents';
import { IReceiverAudioSubscriptionMessage } from './service/RTC/ReceiverAudioSubscription';
import { SignalingEvents } from './service/RTC/SignalingEvents';
import { getMediaTypeFromSourceName, getSourceNameForJitsiTrack } from './service/RTC/SignalingLayer';
import { VideoType } from './service/RTC/VideoType';
import { MAX_CONNECTION_RETRIES } from './service/connectivity/Constants';
import {
    AnalyticsEvents,
    createConferenceEvent,
    createJingleEvent,
    createJvbIceFailedEvent,
    createP2PEvent
} from './service/statistics/AnalyticsEvents';
import { XMPPEvents } from './service/xmpp/XMPPEvents';

export interface IConferenceOptions {
    config: {
        _p2pConnStatusRtcMuteTimeout?: number;
        _peerConnStatusOutOfLastNTimeout?: number;
        _peerConnStatusRtcMuteTimeout?: number;
        analytics?: {
            rtcstatsEnabled?: boolean;
            rtcstatsEndpoint?: string;
        };
        applicationName?: string;
        avgRtpStatsN?: number;
        channelLastN?: number;
        confID?: string;
        createVADProcessor?: () => IVADProcessor;
        deploymentInfo?: {
            userRegion?: string;
        };
        disableAudioLevels?: boolean;
        disableLocalStats?: boolean;
        disableLocalStatsBroadcast?: boolean;
        e2eping?: {
            enabled?: boolean;
        };
        enableNoAudioDetection?: boolean;
        enableNoisyMicDetection?: boolean;
        enableTalkWhileMuted?: boolean;
        hiddenDomain?: string;
        p2p?: {
            backToP2PDelay?: number;
            codecPreferenceOrder?: string[];
            disabledCodec?: string;
            enabled?: boolean;
            mobileCodecPreferenceOrder?: string[];
            mobileScreenshareCodec?: string;
            preferredCodec?: string;
            screenshareCodec?: string;
        };
        pcStatsInterval?: number;
        startAudioMuted?: number;
        startLastN?: number;
        startSilent?: boolean;
        startVideoMuted?: number;
        statisticsDisplayName?: string;
        statisticsId?: string;
        testing?: {
            allowMultipleTracks?: boolean;
            enableAV1ForFF?: boolean;
            enableFirefoxP2p?: boolean;
            forceInitiator?: boolean;
            forceResponder?: boolean;
            lastNRampupTime?: number;
            p2pTestMode?: boolean;
        };
        transcriptionLanguage?: string;
        videoQuality?: {
            codecPreferenceOrder?: string[];
            disabledCodec?: string;
            enableAdaptiveMode?: boolean;
            mobileCodecPreferenceOrder?: string[];
            mobileScreenshareCodec?: string;
            preferredCodec?: string;
            screenshareCodec?: string;
        };
    };
    connection: JitsiConnection;
    customDomain?: string;
    name: string;
}

export interface IStartMutedPolicy {
    audio: boolean;
    video: boolean;
}

export interface IConferenceProperties {
    'audio-limit-reached'?: string;
    'bridge-count'?: string;
    'video-limit-reached'?: string;
    'visitor-codecs'?: string;
    'visitor-count'?: number;
}

export interface IStatisticsOptions {
    aliasName?: string;
    applicationName?: string;
    confID?: string;
    roomName?: string;
    userName?: string;
}

export interface IStopSessionOptions {
    reason?: string;
    reasonDescription?: string;
    requestRestart?: boolean;
    sendSessionTerminate?: boolean;
}

const logger = getLogger('core:JitsiConference');

/**
 * How long since Jicofo is supposed to send a session-initiate, before
 * {@link ACTION_JINGLE_SI_TIMEOUT} analytics event is sent (in ms).
 * @type {number}
 */
const JINGLE_SI_TIMEOUT: number = 5000;

/**
 * Default source language for transcribing the local participant.
 */
const DEFAULT_TRANSCRIPTION_LANGUAGE: string = 'en-US';

/**
 * Checks if a given string is a valid video codec mime type.
 *
 * @param {string} codec the codec string that needs to be validated.
 * @returns {CodecMimeType|null} mime type if valid, null otherwise.
 * @private
 */
function _getCodecMimeType(codec: string): Nullable<CodecMimeType> {
    if (typeof codec === 'string') {
        return Object.values(CodecMimeType).find(value => value === codec.toLowerCase()) || null;
    }

    return null;
}

/**
 * Error returned by authenticateAndUpgradeRole when authentication or connection fails.
 */
interface IUpgradeRoleError {
    authenticationError?: string;
    connectionError?: JitsiConnectionEvents;
    credentials?: {
        jid?: string;
        password?: string;
    };
    message?: string;
}

/**
 * Options for authenticateAndUpgradeRole.
 */
interface IAuthenticateAndUpgradeRoleOptions {
    id: string;
    onCreateResource?: typeof JitsiConference.resourceCreator;
    onLoginSuccessful?: () => void;
    password: string;
}
interface IProcessWithCancel extends Promise<void> {
    cancel: () => void;
}


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
 * collected by `AvgRTPStatsReporter`, before arithmetic mean is
 * calculated and submitted to the analytics module.
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
 *
 * @noInheritDoc
 */
export default class JitsiConference extends Listenable {
    private _transcribingEnabled?: boolean;
    private _visitorCodecs?: string[];
    private _hasVisitors?: boolean;
    private _sessionInitiateTimeout?: number;
    private _desktopSharingFrameRate?: number;
    private _numberOfParticipantsOnJoin?: number;
    private _delayedIceFailed?: IceFailedHandling;
    private _audioAnalyser?: VADAudioAnalyser;
    private _noAudioSignalDetection?: NoAudioSignalDetection;
    private _signalingLayer: SignalingLayerImpl;
    private _conferenceJoinAnalyticsEventSent?: number;
    private _e2eEncryption?: E2EEncryption;
    private _liteModeContext?: LiteModeContext;
    private _audioSenderLimitReached?: boolean;
    private _videoSenderLimitReached?: boolean;
    private _firefoxP2pEnabled: boolean;
    private _iceRestarts: number;
    private _unsubscribers: Array<() => void>;
    private _xmpp: XMPP;

    /**
     * @internal
     */
    _statsCurrentId: string;

    public options: IConferenceOptions;
    public connection: JitsiConnection;
    public eventManager: JitsiConferenceEventManager;
    public participants: Map<string, JitsiParticipant>;
    public componentsVersions: ComponentsVersions;
    public jvbJingleSession?: JingleSessionPC;
    public lastDominantSpeaker?: string;
    public dtmfManager?: object;
    public somebodySupportsDTMF: boolean;
    public authEnabled: boolean;
    public startMutedPolicy: IStartMutedPolicy;
    public isMutedByFocus: boolean;
    public mutedByFocusActor?: string;
    public isVideoMutedByFocus: boolean;
    public mutedVideoByFocusActor?: string;
    public wasStopped: boolean;
    public properties: IConferenceProperties;
    public connectionQuality: ConnectionQuality;
    public avgRtpStatsReporter?: AvgRTPStatsReporter;
    public isJvbConnectionInterrupted: boolean;
    public speakerStatsCollector: SpeakerStatsCollector;
    public deferredStartP2PTask?: number;
    public backToP2PDelay: number;
    public isP2PConnectionInterrupted: boolean;
    public p2p: boolean;
    public p2pJingleSession?: JingleSessionPC;
    public videoSIPGWHandler: VideoSIPGW;
    public recordingManager: RecordingManager;
    public room?: ChatRoom;
    public e2eping?: E2ePing;
    public rtc?: RTC;
    public qualityController?: QualityController;
    public statistics?: Statistics;
    public p2pDominantSpeakerDetection?: P2PDominantSpeakerDetection;
    public authIdentity?: string;
    public p2pEstablishmentDuration?: number;
    public jvbEstablishmentDuration?: number;
    public isDesktopMutedByFocus: boolean;
    public mutedDesktopByFocusActor?: string;
    public dominantSpeakerIsSilent?: boolean;


    /**
     * @param {IConferenceOptions} options
     */
    constructor(options: IConferenceOptions) {
        super();
        if (!options.name || options.name.toLowerCase() !== options.name.toString()) {
            const errmsg
                = 'Invalid conference name (no conference name passed or it '
                + 'contains invalid characters like capital letters)!';
            const additionalLogMsg = options.name
                ? `roomName=${options.name}; condition - ${options.name.toLowerCase()}!==${options.name.toString()}`
                : 'No room name passed!';

            logger.error(`${errmsg} ${additionalLogMsg}`);
            throw new Error(errmsg);
        }

        this.connection = options.connection;
        this._xmpp = this.connection?.xmpp;

        if (this._xmpp.isRoomCreated(options.name, options.customDomain)) {
            const errmsg = 'A conference with the same name has already been created!';

            delete this.connection;
            delete this._xmpp;
            logger.error(errmsg);
            throw new Error(errmsg);
        }

        this.options = options;
        this.eventManager = new JitsiConferenceEventManager(this);

        /**
         * List of all the participants in the conference.
         * @type {Map<string, JitsiParticipant>}
         */
        this.participants = new Map();

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
        this.startMutedPolicy = {
            audio: false,
            video: false
        };

        // AV Moderation.
        this.isMutedByFocus = false;
        this.isVideoMutedByFocus = false;
        this.isDesktopMutedByFocus = false;
        this.mutedByFocusActor = null;
        this.mutedVideoByFocusActor = null;
        this.mutedDesktopByFocusActor = null;

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
        this.connectionQuality = new ConnectionQuality(this, this.eventEmitter, options);

        /**
         * Reports average RTP statistics to the analytics module.
         * @type {AvgRTPStatsReporter}
         */
        this.avgRtpStatsReporter = new AvgRTPStatsReporter(this, options.config.avgRtpStatsN || 15);

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

        const delay = Number.parseInt(String(options.config.p2p?.backToP2PDelay || 5), 10);

        /**
         * A delay given in seconds, before the conference switches back to P2P
         * after the 3rd participant has left.
         * @type {number}
         */
        this.backToP2PDelay = isValidNumber(delay) ? delay : 5;
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

        if (FeatureFlags.isRunInLiteModeEnabled()) {
            logger.info('Lite mode enabled');
            this._liteModeContext = new LiteModeContext(this);
        }

        /**
         * Flag set to <tt>true</tt> when Jicofo sends a presence message indicating that the max audio sender limit has
         * been reached for the call. Once this is set, unmuting audio will be disabled
         * from the client until it gets reset
         * again by Jicofo.
         */
        this._audioSenderLimitReached = undefined;

        /**
         * Flag set to <tt>true</tt> when Jicofo sends a presence message indicating that the max video sender limit has
         * been reached for the call. Once this is set, unmuting video will be disabled
         * from the client until it gets reset
         * again by Jicofo.
         */
        this._videoSenderLimitReached = undefined;

        this._firefoxP2pEnabled = browser.isVersionGreaterThan(109)
            && (this.options.config.testing?.enableFirefoxP2p ?? true);

        /**
         * Number of times ICE restarts that have been attempted after ICE connectivity with the JVB was lost.
         */
        this._iceRestarts = 0;
        this._unsubscribers = [];
    }

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
     */
    static resourceCreator(jid: string, isAuthenticatedUser: boolean): string {
        let mucNickname: string;

        if (isAuthenticatedUser) {
            // For authenticated users generate a random ID.
            mucNickname = RandomUtil.randomHexString(8).toLowerCase();
        } else {
            // Use first part of node for anonymous users if it matches format
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
    }

    /**
     * Initializes the conference object properties
     * @param options {object}
     * @param options.connection {JitsiConnection} overrides this.connection
     */
    private _init(options: IConferenceOptions): void {
        this.eventManager.setupXMPPListeners();

        const { config } = this.options;

        this._statsCurrentId = config.statisticsId ?? Settings.callStatsUserName;
        this.room = this._xmpp.createRoom(
            this.options.name, {
                ...config,
                statsId: this._statsCurrentId
            },
            JitsiConference.resourceCreator
        );

        this._signalingLayer.setChatRoom(this.room);
        this._signalingLayer.on(
            SignalingEvents.SOURCE_UPDATED,
            (sourceName, endpointId, muted, videoType) => {
                const participant = this.participants.get(endpointId);
                const mediaType = getMediaTypeFromSourceName(sourceName);

                if (participant) {
                    participant._setSources(mediaType, muted, sourceName, videoType);
                    this.eventEmitter.emit(JitsiConferenceEvents.PARTICIPANT_SOURCE_UPDATED, participant);
                }
            });

        // ICE Connection interrupted/restored listeners.
        this._onIceConnectionEstablished = this._onIceConnectionEstablished.bind(this);
        this.room.addListener(XMPPEvents.CONNECTION_ESTABLISHED, this._onIceConnectionEstablished);

        this._onIceConnectionFailed = this._onIceConnectionFailed.bind(this);
        this.room.addListener(XMPPEvents.CONNECTION_ICE_FAILED, this._onIceConnectionFailed);

        this._onIceConnectionInterrupted = this._onIceConnectionInterrupted.bind(this);
        this.room.addListener(XMPPEvents.CONNECTION_INTERRUPTED, this._onIceConnectionInterrupted);

        this._onIceConnectionRestored = this._onIceConnectionRestored.bind(this);
        this.room.addListener(XMPPEvents.CONNECTION_RESTORED, this._onIceConnectionRestored);

        this._updateProperties = this._updateProperties.bind(this);
        this.room.addListener(XMPPEvents.CONFERENCE_PROPERTIES_CHANGED, this._updateProperties);

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
                        logger.warn('Failed to send E2E ping request or response.', error?.msg);
                    }
                });
        }

        if (!this.rtc) {
            this.rtc = new RTC(this, options);
            this.eventManager.setupRTCListeners();
            this._registerRtcListeners(this.rtc);
        }

        // Get the codec preference settings from config.js.
        const qualityOptions = {
            enableAdaptiveMode: config.videoQuality?.enableAdaptiveMode,
            jvb: {
                disabledCodec: _getCodecMimeType(config.videoQuality?.disabledCodec),
                enableAV1ForFF: config.testing?.enableAV1ForFF,
                preferenceOrder: browser.isMobileDevice()
                    ? config.videoQuality?.mobileCodecPreferenceOrder
                    : config.videoQuality?.codecPreferenceOrder,
                preferredCodec: _getCodecMimeType(config.videoQuality?.preferredCodec),
                screenshareCodec: browser.isMobileDevice()
                    ? _getCodecMimeType(config.videoQuality?.mobileScreenshareCodec)
                    : _getCodecMimeType(config.videoQuality?.screenshareCodec)
            },
            lastNRampupTime: config.testing?.lastNRampupTime ?? 60000,
            p2p: {
                disabledCodec: _getCodecMimeType(config.p2p?.disabledCodec),
                enableAV1ForFF: true, // For P2P no simulcast is needed, therefore AV1 can be used.
                preferenceOrder: browser.isMobileDevice()
                    ? config.p2p?.mobileCodecPreferenceOrder
                    : config.p2p?.codecPreferenceOrder,
                preferredCodec: _getCodecMimeType(config.p2p?.preferredCodec),
                screenshareCodec: browser.isMobileDevice()
                    ? _getCodecMimeType(config.p2p?.mobileScreenshareCodec)
                    : _getCodecMimeType(config.p2p?.screenshareCodec)
            }
        };

        this.qualityController = new QualityController(this, qualityOptions);

        if (!this.statistics) {
            this.statistics = new Statistics(this, {
                // @ts-ignore
                aliasName: this._statsCurrentId,
                applicationName: config.applicationName,
                confID: config.confID ?? `${this.connection.options.hosts.domain}/${this.options.name}`,
                roomName: this.options.name,
                userName: config.statisticsDisplayName ?? this.myUserId()
            });
            Statistics.analytics.addPermanentProperties({
                'callstats_name': this._statsCurrentId
            });
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
        if (config.enableNoAudioDetection && !config.disableAudioLevels
            && LocalStatsCollector.isLocalStatsSupported()) {
            this._noAudioSignalDetection = new NoAudioSignalDetection(this);
            this._noAudioSignalDetection.on(DetectionEvents.NO_AUDIO_INPUT, () =>
                this.eventEmitter.emit(JitsiConferenceEvents.NO_AUDIO_INPUT));
            this._noAudioSignalDetection.on(DetectionEvents.AUDIO_INPUT_STATE_CHANGE, hasAudioSignal =>
                this.eventEmitter.emit(JitsiConferenceEvents.AUDIO_INPUT_STATE_CHANGE, hasAudioSignal));
        }

        if ('channelLastN' in config) {
            this.setLastN(config.channelLastN);
        }

        // creates dominant speaker detection that works only in p2p mode
        this.p2pDominantSpeakerDetection = new P2PDominantSpeakerDetection(this);

        // TODO: Drop this after the change to use the region from the http requests
        //  to prosody is propagated to majority of deployments
        if (config?.deploymentInfo?.userRegion) {
            this.setLocalParticipantProperty('region', config.deploymentInfo.userRegion);
        }

        // Publish the codec preference to presence.
        this.setLocalParticipantProperty('codecList',
             this.qualityController.codecController.getCodecPreferenceList('jvb'));

        // Set transcription language presence extension.
        // In case the language config is undefined or has the default value that the transcriber uses
        // (in our case Jigasi uses 'en-US'), don't set the participant property in order to avoid
        // needlessly polluting the presence stanza.
        const transcriptionLanguage = config?.transcriptionLanguage ?? DEFAULT_TRANSCRIPTION_LANGUAGE;

        if (transcriptionLanguage !== DEFAULT_TRANSCRIPTION_LANGUAGE) {
            this.setTranscriptionLanguage(transcriptionLanguage);
        }
    }

    /**
   * Registers event listeners on the RTC instance.
   * @param {RTC} rtc - the RTC module instance used by this conference.
   * @private
   * @returns {void}
   */
    private _registerRtcListeners(rtc: RTC): void {
        rtc.addListener(RTCEvents.DATA_CHANNEL_OPEN, () => {
            for (const localTrack of this.rtc.localTracks) {
                localTrack.isVideoTrack() && this._sendBridgeVideoTypeMessage(localTrack);
            }
        });
    }


    /**
     * Sends a conference.join analytics event.
     *
     * @returns {void}
     */
    private _sendConferenceJoinAnalyticsEvent(): void {
        const meetingId = this.getMeetingUniqueId();

        if (this._conferenceJoinAnalyticsEventSent || !meetingId || this.getActivePeerConnection() === null) {
            return;
        }

        const conferenceConnectionTimes = this.getConnectionTimes();
        const xmppConnectionTimes = this.connection.getConnectionTimes();
        const gumStart = window.connectionTimes['firstObtainPermissions.start'];
        const gumEnd = window.connectionTimes['firstObtainPermissions.end'];
        const globalNSConnectionTimes = window.JitsiMeetJS?.app?.connectionTimes ?? {};
        const connectionTimes = {
            ...conferenceConnectionTimes,
            ...xmppConnectionTimes,
            ...globalNSConnectionTimes,
            connectedToMUCJoinedTime: safeSubtract(
                conferenceConnectionTimes['muc.joined'], xmppConnectionTimes.connected),
            connectingToMUCJoinedTime: safeSubtract(
                conferenceConnectionTimes['muc.joined'], xmppConnectionTimes.connecting),
            gumDuration: safeSubtract(gumEnd, gumStart),
            numberOfParticipantsOnJoin: this._numberOfParticipantsOnJoin,
            xmppConnectingTime: safeSubtract(xmppConnectionTimes.connected, xmppConnectionTimes.connecting)
        };

        Statistics.sendAnalytics(createConferenceEvent('joined', {
            ...connectionTimes,
            meetingId,
            participantId: `${meetingId}.${this._statsCurrentId}`
        }));
        this._conferenceJoinAnalyticsEventSent = Date.now();
    }

    /**
     * Sends conference.left analytics event.
     * @private
     */
    private _sendConferenceLeftAnalyticsEvent(): void {
        const meetingId = this.getMeetingUniqueId();

        if (!meetingId || !this._conferenceJoinAnalyticsEventSent) {

            return;
        }

        Statistics.sendAnalytics(createConferenceEvent('left', {
            meetingId,
            participantId: `${meetingId}.${this._statsCurrentId}`,
            stats: {
                duration: Math.floor((Date.now() - this._conferenceJoinAnalyticsEventSent) / 1000)
            }
        }));
    }

    /**
   * Fires TRACK_AUDIO_LEVEL_CHANGED change conference event (for local tracks).
   * @param {number} audioLevel - The audio level.
   * @param {TraceablePeerConnection} [tpc] - The peer connection.
   * @private
   */
    private _fireAudioLevelChangeEvent(audioLevel: number, tpc: TraceablePeerConnection): void {
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
    }

    /**
   * Fires TRACK_MUTE_CHANGED change conference event.
   * @param {JitsiLocalTrack} track - The JitsiTrack object related to the event.
   */
    private _fireMuteChangeEvent(track: JitsiLocalTrack): void {
        // check if track was muted by focus and now is unmuted by user
        if (this.isMutedByFocus && track.isAudioTrack() && !track.isMuted()) {
            this.isMutedByFocus = false;

            // unmute local user on server
            this.room.muteParticipant(this.room.myroomjid, false, MediaType.AUDIO);
        } else if (this.isVideoMutedByFocus && track.isVideoTrack()
                && track.getVideoType() !== VideoType.DESKTOP && !track.isMuted()) {
            this.isVideoMutedByFocus = false;

            // unmute local user on server
            this.room.muteParticipant(this.room.myroomjid, false, MediaType.VIDEO);
        } else if (this.isDesktopMutedByFocus && track.isVideoTrack()
                && track.getVideoType() === VideoType.DESKTOP && !track.isMuted()) {
            this.isDesktopMutedByFocus = false;

            // unmute local user on server
            this.room.muteParticipant(this.room.myroomjid, false, MediaType.DESKTOP);
        }

        let actorParticipant;

        if (this.mutedByFocusActor && track.isAudioTrack()) {
            const actorId = Strophe.getResourceFromJid(this.mutedByFocusActor);

            actorParticipant = this.participants.get(actorId);
        } else if (this.mutedVideoByFocusActor && track.isVideoTrack()
                && track.getVideoType() !== VideoType.DESKTOP) {
            const actorId = Strophe.getResourceFromJid(this.mutedVideoByFocusActor);

            actorParticipant = this.participants.get(actorId);
        } else if (this.mutedDesktopByFocusActor && track.isVideoTrack()
                && track.getVideoType() === VideoType.DESKTOP) {
            const actorId = Strophe.getResourceFromJid(this.mutedDesktopByFocusActor);

            actorParticipant = this.participants.get(actorId);
        }

        // Send the video type message to the bridge if the track is not removed/added to the pc as part of
        // the mute/unmute operation.
        // In React Native we mute the camera by setting track.enabled but that doesn't
        // work for screen-share tracks, so do the remove-as-mute for those.
        const doesVideoMuteByStreamRemove
           = browser.isReactNative() ? track.videoType === VideoType.DESKTOP : browser.doesVideoMuteByStreamRemove();

        if (track.isVideoTrack() && !doesVideoMuteByStreamRemove) {
            this._sendBridgeVideoTypeMessage(track);
        }

        this.eventEmitter.emit(JitsiConferenceEvents.TRACK_MUTE_CHANGED, track, actorParticipant);
    }


    /**
   * Replaces the tracks at the lower level by going through the Jingle session
   * and WebRTC peer connection. The method will resolve immediately if there is
   * currently no JingleSession started.
   * @param {JitsiLocalTrack|null} oldTrack - The track to be removed during
   * the process or <tt>null</t> if the method should act as "add track".
   * @param {JitsiLocalTrack|null} newTrack - The new track to be added or
   * <tt>null</tt> if the method should act as "remove track".
   * @return {Promise} Resolved when the process is done or rejected with a string
   * which describes the error.
   * @private
   */
    private async _doReplaceTrack(oldTrack?: JitsiLocalTrack, newTrack?: JitsiLocalTrack): Promise<void> {
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

        await Promise.all(replaceTrackPromises);
    }

    /**
   * Handler for when a source-add for a local source is rejected by Jicofo.
   * @param {JingleSessionPC} jingleSession - The media session.
   * @param {Error} error - The error message.
   * @param {MediaType} mediaType - The media type of the track associated with the source that was rejected.
   * @returns {void}
   */
    private _removeLocalSourceOnReject(jingleSession: JingleSessionPC, error: Error, mediaType: MediaType): void {
        if (!jingleSession) {
            return;
        }
        const errorReason = (error as { reason?: string; })?.reason;

        logger.warn(`Source-add rejected on ${jingleSession}, reason="${errorReason}", message="${error?.message}"`);
        const track = this.getLocalTracks(mediaType)[0];

        this.eventEmitter.emit(JitsiConferenceEvents.TRACK_UNMUTE_REJECTED, track);
    }

    /**
   * Operations related to creating a new track.
   * @param {JitsiLocalTrack} newTrack - The new track being created.
   */
    private _setupNewTrack(newTrack: JitsiLocalTrack): void {
        const mediaType = newTrack.getType();

        if (!newTrack.getSourceName()) {
            const sourceName = getSourceNameForJitsiTrack(
            this.myUserId(),
            mediaType,
            this.getLocalTracks(mediaType)?.length);

            newTrack.setSourceName(sourceName);
        }

        this.rtc.addLocalTrack(newTrack);
        newTrack.setConference(this);


        // Add event handlers.
        this._unsubscribers.push(newTrack.addCancellableListener(JitsiTrackEvents.TRACK_MUTE_CHANGED, this._fireMuteChangeEvent.bind(this, newTrack)));

        if (newTrack.isAudioTrack()) {
            this._unsubscribers.push(newTrack.addCancellableListener(JitsiTrackEvents.TRACK_AUDIO_LEVEL_CHANGED, this._fireAudioLevelChangeEvent.bind(this)));
        }

        this.eventEmitter.emit(JitsiConferenceEvents.TRACK_ADDED, newTrack);
    }

    /**
   * Sets the video type.
   * @param {JitsiLocalTrack} track - The track.
   * @return {boolean} <tt>true</tt> if video type was changed in presence.
   * @private
   */
    private _setNewVideoType(track: JitsiLocalTrack): boolean {
        let videoTypeChanged = false;

        if (track) {
            videoTypeChanged = this._signalingLayer.setTrackVideoType(track.getSourceName(), track.videoType) || false;
        }

        return videoTypeChanged;
    }

    /**
     * Maybe clears the timeout which emits {@link ACTION_JINGLE_SI_TIMEOUT}
     * analytics event.
     * @private
     */
    private _maybeClearSITimeout(): void {
        if (this._sessionInitiateTimeout
                && (this.jvbJingleSession || this.getParticipantCount() < 2)) {
            window.clearTimeout(this._sessionInitiateTimeout);
            this._sessionInitiateTimeout = null;
        }
    }

    /**
     * Sets a timeout which will emit {@link ACTION_JINGLE_SI_TIMEOUT} analytics
     * event.
     * @private
     */
    private _maybeSetSITimeout(): void {
        // Jicofo is supposed to invite if there are at least 2 participants
        if (!this.jvbJingleSession
                && this.getParticipantCount() >= 2
                && !this._sessionInitiateTimeout) {
            this._sessionInitiateTimeout = window.setTimeout(() => {
                this._sessionInitiateTimeout = null;
                Statistics.sendAnalytics(createJingleEvent(
                    AnalyticsEvents.ACTION_JINGLE_SI_TIMEOUT,
                    {
                        p2p: false,
                        value: JINGLE_SI_TIMEOUT
                    }));
            }, JINGLE_SI_TIMEOUT);
        }
    }


    /**
     * Clears the deferred start P2P task if it has been scheduled.
     * @private
     */
    private _maybeClearDeferredStartP2P(): void {
        if (this.deferredStartP2PTask) {
            logger.info('Cleared deferred start P2P task');
            clearTimeout(this.deferredStartP2PTask);
            this.deferredStartP2PTask = null;
        }
    }

    /**
         * Removes from the conference remote tracks associated with the JVB
     * connection.
     * @private
     */
    private _removeRemoteJVBTracks(): void {
        this._removeRemoteTracks(
            'JVB', this.jvbJingleSession.peerconnection.getRemoteTracks());
    }

    /**
     * Removes from the conference remote tracks associated with the P2P
     * connection.
     * @private
     */
    private _removeRemoteP2PTracks(): void {
        this._removeRemoteTracks(
            'P2P', this.p2pJingleSession.peerconnection.getRemoteTracks());
    }

    /**
     * Generates fake "remote track removed" events for given Jingle session.
     * @param {string} sessionNickname the session's nickname which will appear in
     * log messages.
     * @param {Array<JitsiRemoteTrack>} remoteTracks the tracks that will be removed
     * @private
     */
    private _removeRemoteTracks(sessionNickname: string, remoteTracks: JitsiRemoteTrack[]): void {
        for (const track of remoteTracks) {
            logger.info(`Removing remote ${sessionNickname} track: ${track}`);
            this.onRemoteTrackRemoved(track);
        }
    }

    /**
     * Resumes media transfer over the JVB connection.
     * @private
     */
    private _resumeMediaTransferForJvbConnection(): void {
        logger.info('Resuming media transfer over the JVB connection...');
        this.jvbJingleSession.setMediaTransferActive(true)
            .then(() => {
                logger.info('Resumed media transfer over the JVB connection!');
            })
            .catch(error => {
                logger.error('Failed to resume media transfer over the JVB connection:', error);
            });
    }

    /**
     * Sets new P2P status and updates some events/states hijacked from
     * the <tt>JitsiConference</tt>.
         * @param {boolean} newStatus the new P2P status value, <tt>true</tt> means that
     * P2P is now in use, <tt>false</tt> means that the JVB connection is now in use
     * @private
     */
    private _setP2PStatus(newStatus: boolean): void {
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
                p2pFailed: false
            });

            // Sync up video transfer active in case p2pJingleSession not existed
            // when the lastN value was being adjusted.
            const isVideoActive = this.getLastN() !== 0;

            this.p2pJingleSession.setP2pVideoTransferActive(isVideoActive)
                .catch(error => {
                    logger.error(`Failed to sync up P2P video transfer status (${isVideoActive}), ${error}`);
                });
        } else {
            logger.info('Peer to peer connection closed!');
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
    }

    /**
     * Starts new P2P session.
     * @param {string} remoteJid the JID of the remote participant
     * @private
     */
    private _startP2PSession(remoteJid: string): void {
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
                codecSettings: {
                    codecList: this.qualityController.codecController.getCodecPreferenceList('p2p'),
                    mediaType: MediaType.VIDEO,
                    screenshareCodec: this.qualityController.codecController.getScreenshareCodec('p2p')
                },
                enableInsertableStreams: this.isE2EEEnabled() || FeatureFlags.isRunInLiteModeEnabled()
            });

        const localTracks = this.getLocalTracks();

        this.p2pJingleSession.invite(localTracks)
            .then(() => {
                this.p2pJingleSession.addEventListener(MediaSessionEvents.VIDEO_CODEC_CHANGED, () => {
                    this.eventEmitter.emit(JitsiConferenceEvents.VIDEO_CODEC_CHANGED);
                });
            })
            .catch(error => {
                logger.error('Failed to start P2P Jingle session', error);

                if (this.p2pJingleSession) {
                    this.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED,
                    JitsiConferenceErrors.OFFER_ANSWER_FAILED, error);
                }
            });
    }

    /**
     * Suspends media transfer over the JVB connection.
     * @private
     */
    private _suspendMediaTransferForJvbConnection(): void {
        logger.info('Suspending media transfer over the JVB connection...');
        this.jvbJingleSession.setMediaTransferActive(false)
            .then(() => {
                logger.info('Suspended media transfer over the JVB connection !');
            })
            .catch(error => {
                logger.error('Failed to suspend media transfer over the JVB connection:', error);
            });
    }

    /**
     * Method when called will decide whether it's the time to start or stop
     * the P2P session.
     * @param {boolean} userLeftEvent if <tt>true</tt> it means that the call
     * originates from the user left event.
     * @private
     */
    private _maybeStartOrStopP2P(userLeftEvent: boolean = false): void {
        if (!this.isP2PEnabled()
                || this.isP2PTestModeEnabled()
                || (browser.isFirefox() && !this._firefoxP2pEnabled)
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
            const jid = peer.getJid();

            // Force initiator or responder mode for testing if option is passed to config.
            if (this.options.config.testing?.forceInitiator) {
                logger.debug(`Forcing P2P initiator, will start P2P with: ${jid}`);
                this._startP2PSession(jid);
            } else if (this.options.config.testing?.forceResponder) {
                logger.debug(`Forcing P2P responder, will wait for the other peer ${jid} to start P2P`);
            } else {
                if (myId > peersId) {
                    logger.debug('I\'m the bigger peersId - the other peer should start P2P', myId, peersId);

                    return;
                } else if (myId === peersId) {
                    logger.error('The same IDs ? ', myId, peersId);

                    return;
                }

                if (userLeftEvent) {
                    if (this.deferredStartP2PTask) {
                        logger.error('Deferred start P2P task\'s been set already!');

                        return;
                    }
                    logger.info(`Will start P2P with: ${jid} after ${this.backToP2PDelay} seconds...`);
                    this.deferredStartP2PTask = Number(setTimeout(
                        this._startP2PSession.bind(this, jid),
                        this.backToP2PDelay * 1000));
                } else {
                    logger.info(`Will start P2P with: ${jid}`);
                    this._startP2PSession(jid);
                }
            }
        } else if (this.p2pJingleSession && !shouldBeInP2P) {
            logger.info(`Will stop P2P with: ${this.p2pJingleSession.remoteJid}`);

            // Log that there will be a switch back to the JVB connection
            if (this.p2pJingleSession.isInitiator && peerCount > 1) {
                Statistics.sendAnalyticsAndLog(
                    createP2PEvent(AnalyticsEvents.ACTION_P2P_SWITCH_TO_JVB));
            }
            this._stopP2PSession();
        }
    }

    /**
     * Tells whether or not this conference should be currently in the P2P mode.
     *
     * @private
     * @returns {boolean}
     */
    private _shouldBeInP2PMode(): boolean {
        const peers = this.getParticipants();
        const peerCount = peers.length;
        const hasBotPeer = peers.find(p => p.getBotType() === 'poltergeist'
            || p.hasFeature(FEATURE_JIGASI)) !== undefined;
        const shouldBeInP2P = peerCount === 1 && !hasBotPeer && !this._hasVisitors
        && !this._hasVisitors && !this._transcribingEnabled;

        logger.debug(`P2P? peerCount: ${peerCount}, hasBotPeer: ${hasBotPeer} => ${shouldBeInP2P}`);

        return shouldBeInP2P;
    }

    /**
     * Stops the current P2P session.
     * @param {Object} options - Options for stopping P2P.
     * @param {string} options.reason - One of the Jingle "reason" element
     * names as defined by https://xmpp.org/extensions/xep-0166.html#def-reason
     * @param {string} options.reasonDescription - Text description that will be
     * included in the session terminate message.
     * @param {boolean} options.requestRestart - Whether this is due to a session restart, in which case
     * media will not be resumed on the JVB.
     * @private
     */
    private _stopP2PSession(options: { reason?: string; reasonDescription?: string; requestRestart?: boolean; } = {}): void {
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

        this.p2pJingleSession.terminate(
            () => {
                logger.info('P2P session terminate RESULT');
                this.p2pJingleSession = null;
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
                sendSessionTerminate: Boolean(this.room
                    && this.getParticipantById(
                        Strophe.getResourceFromJid(this.p2pJingleSession.remoteJid))
                )
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
    }

    /**
     * Updates room presence if needed and send the packet in case of a modification.
     * @param {JingleSessionPC} jingleSession the session firing the event, contains the peer connection which
     * tracks we will check.
     * @param {Object|null} ctx a context object we can distinguish multiple calls of the same pass of updating tracks.
     */
    private _updateRoomPresence(jingleSession: JingleSessionPC, ctx: { skip?: boolean; } = {}): void {
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
        let muteStatusChanged: boolean;
        let videoTypeChanged: boolean;
        const localTracks = jingleSession.peerconnection.getLocalTracks();

        // Set presence for all the available local tracks.
        for (const track of localTracks) {
            const muted = track.isMuted();

            muteStatusChanged = this._setTrackMuteStatus(track, muted);
            muteStatusChanged && logger.debug(`Updating mute state of ${track} in presence to muted=${muted}`);
            if (track.getType() === MediaType.VIDEO) {
                videoTypeChanged = this._setNewVideoType(track);
                videoTypeChanged && logger.debug(`Updating videoType in presence to ${track.getVideoType()}`);
            }
            presenceChanged = presenceChanged || muteStatusChanged || videoTypeChanged;
        }

        presenceChanged && this.room.sendPresence();
    }


    /**
     * Updates features for a participant.
     * @param {JitsiParticipant} participant - The participant to query for features.
     * @returns {void}
     * @private
     */
    private _updateFeatures(participant: JitsiParticipant): void {
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
    }


    /**
     * Accepts an incoming call event for the JVB Jingle session.
     * @param {JingleSessionPC} jingleSession - The Jingle session for the incoming call.
     * @param {Element} jingleOffer - An element pointing to 'jingle' IQ element containing the offer.
     * @param {number} now - The timestamp when the call was received.
     * @private
     */
    private _acceptJvbIncomingCall(jingleSession: JingleSessionPC, jingleOffer: Element, now: number): void {
        // Accept incoming call
        this.jvbJingleSession = jingleSession;
        this.room.connectionTimes['session.initiate'] = now;
        this._sendConferenceJoinAnalyticsEvent();

        if (this.wasStopped) {
            Statistics.sendAnalyticsAndLog(createJingleEvent(AnalyticsEvents.ACTION_JINGLE_RESTART, { p2p: false }));
        }

        const serverRegion
            = $(jingleOffer)
                .find('>bridge-session[xmlns="http://jitsi.org/protocol/focus"]')
                .attr('region');

        this.eventEmitter.emit(JitsiConferenceEvents.SERVER_REGION_CHANGED, serverRegion);

        this._maybeClearSITimeout();
        Statistics.sendAnalytics(createJingleEvent(
            AnalyticsEvents.ACTION_JINGLE_SI_RECEIVED,
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
                    codecSettings: {
                        codecList: this.qualityController.codecController.getCodecPreferenceList('jvb'),
                        mediaType: MediaType.VIDEO,
                        screenshareCodec: this.qualityController.codecController.getScreenshareCodec('jvb')
                    },
                    enableInsertableStreams: this.isE2EEEnabled() || FeatureFlags.isRunInLiteModeEnabled()
                });
        } catch (error) {
            logger.error(error);

            return;
        }

        // Open a channel with the videobridge.
        this._setBridgeChannel(jingleOffer, jingleSession.peerconnection);

        const localTracks = this.getLocalTracks();

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

                    jingleSession.addEventListener(MediaSessionEvents.VIDEO_CODEC_CHANGED, () => {
                        this.eventEmitter.emit(JitsiConferenceEvents.VIDEO_CODEC_CHANGED);
                    });
                },
                error => {
                    logger.error('Failed to accept incoming JVB Jingle session', error);
                    this.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED,
                        JitsiConferenceErrors.OFFER_ANSWER_FAILED, error);
                },
                localTracks
            );

            // Set the capture fps for screenshare if it is set through the UI.
            this._desktopSharingFrameRate
                && jingleSession.peerconnection.setDesktopSharingFrameRate(this._desktopSharingFrameRate);

            this.statistics.startRemoteStats(this.jvbJingleSession.peerconnection);
        } catch (e) {
            logger.error(e);
        }
    }

    /**
     * Sets the BridgeChannel.
     *
     * @param {Object} offerIq - An element pointing to the jingle element of
     * the offer IQ which may carry the WebSocket URL for the 'websocket'
     * BridgeChannel mode.
     * @param {TraceablePeerConnection} pc - The peer connection which will be used
     * to listen for new WebRTC Data Channels (in the 'datachannel' mode).
     * @private
     */
    private _setBridgeChannel(offerIq: object, pc: TraceablePeerConnection): void {
        const ignoreDomain = this.connection?.options?.bridgeChannel?.ignoreDomain;
        const preferSctp = this.connection?.options?.bridgeChannel?.preferSctp ?? true;
        const sctpOffered = $(offerIq).find('>content[name="data"]')
            .first().length === 1;
        let wsUrl = null;

        logger.info(`SCTP: offered=${sctpOffered}, prefered=${preferSctp}`);

        if (!(sctpOffered && preferSctp)) {
            $(offerIq).find('>content>transport>web-socket')
                .toArray()
                .map(e => e.getAttribute('url'))
                .forEach(url => {
                    if (!wsUrl && (!ignoreDomain || ignoreDomain !== new URL(url).hostname)) {
                        wsUrl = url;
                        logger.info(`Using colibri-ws url ${url}`);
                    } else if (!wsUrl) {
                        logger.info(`Ignoring colibri-ws url with domain ${ignoreDomain}`);
                    }
                });

            if (!wsUrl) {
                const firstWsUrl = $(offerIq).find('>content>transport>web-socket')
                    .first();

                if (firstWsUrl.length === 1) {
                    wsUrl = firstWsUrl[0].getAttribute('url');
                    logger.info(`Falling back to ${wsUrl}`);
                }
            }
        }

        if (wsUrl && !(sctpOffered && preferSctp)) {
            // If the offer contains a websocket and we don't prefer SCTP use it.
            this.rtc.initializeBridgeChannel(null, wsUrl);
        } else if (sctpOffered) {
            // Otherwise, fall back to an attempt to use SCTP.
            this.rtc.initializeBridgeChannel(pc.peerconnection, null);
        } else {
            logger.warn('Neither SCTP nor a websocket is available. Will not initialize bridge channel.');
        }
    }

    /**
     * Rejects incoming Jingle call.
     * @param {JingleSessionPC} jingleSession - The session instance to be rejected.
     * @param {object} [options] - Optional parameters for rejection.
     * @param {string} options.reason - The name of the reason element as defined by Jingle.
     * @param {string} options.reasonDescription - The reason description which will be
     *  included in Jingle 'session-terminate' message.
     * @param {string} options.errorMsg - An error message to be logged on global error handler.
     * @private
     */
    private _rejectIncomingCall(jingleSession: JingleSessionPC, options: {
        errorMsg?: string;
        reason?: string;
        reasonDescription?: string;
    }): void {
        if (options?.errorMsg) {
            logger.warn(options.errorMsg);
        }

        // Terminate the jingle session with a reason
        jingleSession.terminate(
            null /* success callback => we don't care */,
            error => {
                logger.warn(
                    'An error occurred while trying to terminate'
                        + ' invalid Jingle session', error);
            }, {
                reason: options?.reason,
                reasonDescription: options?.reasonDescription,
                sendSessionTerminate: true
            });
    }

    /**
     * Handles an incoming call event for the P2P Jingle session.
     * @param {JingleSessionPC} jingleSession - The Jingle session for the incoming call.
     * @param {Element} jingleOffer - An element pointing to 'jingle' IQ element containing the offer.
     * @private
     */
    private _onIncomingCallP2P(jingleSession: JingleSessionPC, jingleOffer: Element): void {
        let rejectReason;
        const contentName = $(jingleOffer).find('>content').attr('name');
        const peerUsesUnifiedPlan = contentName === '0' || contentName === '1';

        // Reject P2P between endpoints that are not running in the same mode w.r.t to SDPs (plan-b and unified plan).
        if (!peerUsesUnifiedPlan) {
            rejectReason = {
                errorMsg: 'P2P across two endpoints in different SDP modes is disabled',
                reason: 'decline',
                reasonDescription: 'P2P disabled'
            };
        } else if ((!this.isP2PEnabled() && !this.isP2PTestModeEnabled())
            || (browser.isFirefox() && !this._firefoxP2pEnabled)) {
            rejectReason = {
                errorMsg: 'P2P mode disabled in the configuration or browser unsupported',
                reason: 'decline',
                reasonDescription: 'P2P disabled'
            };
        } else if (this.p2pJingleSession) {
            // Reject incoming P2P call (already in progress)
            rejectReason = {
                errorMsg: 'Duplicated P2P "session-initiate"',
                reason: 'busy',
                reasonDescription: 'P2P already in progress'
            };
        } else if (!this._shouldBeInP2PMode()) {
            rejectReason = {
                errorMsg: 'Received P2P "session-initiate" when should not be in P2P mode',
                reason: 'decline',
                reasonDescription: 'P2P requirements not met'
            };
            Statistics.sendAnalytics(createJingleEvent(AnalyticsEvents.ACTION_P2P_DECLINED));
        }

        if (rejectReason) {
            this._rejectIncomingCall(jingleSession, rejectReason);
        } else {
            this._acceptP2PIncomingCall(jingleSession, jingleOffer);
        }
    }


    /**
     * Handles CONNECTION_INTERRUPTED event.
     * @param {JingleSessionPC} session - The Jingle session.
     * @private
     */
    private _onIceConnectionInterrupted(session: JingleSessionPC): void {
        if (session.isP2P) {
            this.isP2PConnectionInterrupted = true;
        } else {
            this.isJvbConnectionInterrupted = true;
        }
        if (session.isP2P === this.isP2PActive()) {
            this.eventEmitter.emit(JitsiConferenceEvents.CONNECTION_INTERRUPTED);
        }
    }

    /**
     * Handles CONNECTION_ICE_FAILED event.
     * @param {JingleSessionPC} session - The Jingle session.
     * @private
     */
    private _onIceConnectionFailed(session: JingleSessionPC): void {
        if (session.isP2P) {
            // Add p2pFailed property to analytics to distinguish, between "good"
            // and "bad" connection
            Statistics.analytics.addPermanentProperties({ p2pFailed: true });

            if (this.p2pJingleSession) {
                Statistics.sendAnalyticsAndLog(
                    createP2PEvent(
                        AnalyticsEvents.ACTION_P2P_FAILED,
                        {
                            initiator: this.p2pJingleSession.isInitiator
                        }));

            }
            this._stopP2PSession({
                reason: 'connectivity-error',
                reasonDescription: 'ICE FAILED'
            });
        } else if (session && this.jvbJingleSession === session && this._iceRestarts < MAX_CONNECTION_RETRIES) {
            // Use an exponential backoff timer for ICE restarts.
            const jitterDelay = getJitterDelay(this._iceRestarts, 1000 /* min. delay */);

            this._delayedIceFailed = new IceFailedHandling(this);
            setTimeout(() => {
                logger.error(`triggering ice restart after ${jitterDelay} `);
                this._delayedIceFailed.start();
                this._iceRestarts++;
            }, jitterDelay);
        } else if (this.jvbJingleSession === session) {
            logger.warn('ICE failed, force reloading the conference after failed attempts to re-establish ICE');
            Statistics.sendAnalyticsAndLog(
                createJvbIceFailedEvent(
                    AnalyticsEvents.ACTION_JVB_ICE_FAILED,
                    {
                        participantId: this.myUserId(),
                        userRegion: this.options.config.deploymentInfo?.userRegion
                    }));
            this.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED, JitsiConferenceErrors.ICE_FAILED);
        }
    }

    /**
     * Handles CONNECTION_RESTORED event.
     * @param {JingleSessionPC} session - The Jingle session.
     * @private
     */
    private _onIceConnectionRestored(session: JingleSessionPC): void {
        if (session.isP2P) {
            this.isP2PConnectionInterrupted = false;
        } else {
            this.isJvbConnectionInterrupted = false;
            this._delayedIceFailed && this._delayedIceFailed.cancel();
        }

        if (session.isP2P === this.isP2PActive()) {
            this.eventEmitter.emit(JitsiConferenceEvents.CONNECTION_RESTORED);
        }
    }

    /**
     * Accepts an incoming P2P Jingle call.
     * @param {JingleSessionPC} jingleSession - The Jingle session instance.
     * @param {Object} jingleOffer - An element pointing to 'jingle' IQ element containing the offer.
     * @private
     */
    private _acceptP2PIncomingCall(jingleSession: JingleSessionPC, jingleOffer: object): void {
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
                codecSettings: {
                    codecList: this.qualityController.codecController.getCodecPreferenceList('p2p'),
                    mediaType: MediaType.VIDEO,
                    screenshareCodec: this.qualityController.codecController.getScreenshareCodec('p2p')
                },
                enableInsertableStreams: this.isE2EEEnabled() || FeatureFlags.isRunInLiteModeEnabled()
            });

        const localTracks = this.getLocalTracks();

        this.p2pJingleSession.acceptOffer(
            jingleOffer,
            () => {
                logger.debug('Got RESULT for P2P "session-accept"');

                this.eventEmitter.emit(
                    JitsiConferenceEvents._MEDIA_SESSION_STARTED,
                    jingleSession);

                jingleSession.addEventListener(MediaSessionEvents.VIDEO_CODEC_CHANGED, () => {
                    this.eventEmitter.emit(JitsiConferenceEvents.VIDEO_CODEC_CHANGED);
                });
            },
            error => {
                logger.error('Failed to accept incoming P2P Jingle session', error);
                if (this.p2pJingleSession) {
                    this.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED,
                        JitsiConferenceErrors.OFFER_ANSWER_FAILED, error);
                }
            },
            localTracks);
    }

    /**
     * Adds remote tracks to the conference associated with the JVB session.
     * @private
     * @returns {void}
     */
    private _addRemoteJVBTracks(): void {
        this._addRemoteTracks('JVB', this.jvbJingleSession.peerconnection.getRemoteTracks());
    }

    /**
     * Adds remote tracks to the conference associated with the P2P session.
     * @private
     * @returns {void}
     */
    private _addRemoteP2PTracks(): void {
        this._addRemoteTracks('P2P', this.p2pJingleSession.peerconnection.getRemoteTracks());
    }

    /**
     * Generates fake "remote track added" events for given Jingle session.
     * @param {string} logName - The session's nickname which will appear in log messages.
     * @param {Array<JitsiRemoteTrack>} remoteTracks - The tracks that will be added.
     * @private
     */
    private _addRemoteTracks(logName: string, remoteTracks: JitsiRemoteTrack[]): void {
        for (const track of remoteTracks) {
            if (this.participants.has(track.ownerEndpointId)) {
                logger.info(`Adding remote ${logName} track: ${track}`);
                this.onRemoteTrackAdded(track);
            }
        }
    }

    /**
     * Handles the ICE connection establishment event for a Jingle session.
     * @private
     * @param {JingleSessionPC} jingleSession - The Jingle session for which ICE connection was established.
     */
    private _onIceConnectionEstablished(jingleSession: JingleSessionPC): void {
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

        // We don't care about the JVB case, there's nothing to be done
        if (!jingleSession.isP2P) {
            done = true;
        } else if (this.p2pJingleSession !== jingleSession) {
            logger.error('CONNECTION_ESTABLISHED - wrong P2P session instance ?!');

            done = true;
        }

        if (isValidNumber(this.p2pEstablishmentDuration)
                && isValidNumber(this.jvbEstablishmentDuration)) {
            const establishmentDurationDiff
                = this.p2pEstablishmentDuration - this.jvbEstablishmentDuration;

            Statistics.sendAnalytics(
                AnalyticsEvents.ICE_ESTABLISHMENT_DURATION_DIFF,
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
                AnalyticsEvents.ACTION_P2P_ESTABLISHED,
                {
                    initiator: this.p2pJingleSession.isInitiator
                }));
    }

    /**
     * Called when the chat room reads a new list of properties from jicofo's
     * presence. The properties may have changed, but they don't have to.
     *
     * @param {Object} properties - The properties keyed by the property name
     * ('key').
     * @private
     */
    private _updateProperties(properties: IConferenceProperties = {}): void {
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
                'bridge-count'
            ];

            analyticsKeys.forEach(key => {
                if (properties[key] !== undefined) {
                    Statistics.analytics.addPermanentProperties({
                        [key.replace('-', '_')]: properties[key]
                    });
                }
            });

            // Handle changes to aggregate list of visitor codecs.
            let publishedCodecs = this.properties['visitor-codecs']?.split(',');

            if (publishedCodecs?.length) {
                publishedCodecs = publishedCodecs.filter(codec => typeof codec === 'string'
                    && codec.trim().length
                    && Object.values(CodecMimeType).find(val => val === codec));
            }

            if (this._visitorCodecs !== publishedCodecs) {
                this._visitorCodecs = publishedCodecs;
                this.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_VISITOR_CODECS_CHANGED, this._visitorCodecs);
            }

            const oldValue = this._hasVisitors;

            this._hasVisitors = this.properties['visitor-count'] > 0;

            oldValue !== this._hasVisitors && this._maybeStartOrStopP2P(true);
        }
    }

    /**
     * Fires CONFERENCE_FAILED event with INCOMPATIBLE_SERVER_VERSIONS parameter.
     * @returns {void}
     * @private
     */
    private _fireIncompatibleVersionsEvent(): void {
        this.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED,
            JitsiConferenceErrors.INCOMPATIBLE_SERVER_VERSIONS);
    }

    /**
   * Sends the 'VideoTypeMessage' to the bridge on the bridge channel so that the bridge can make bitrate allocation
   * decisions based on the video type of the local source.
   *
   * @param {JitsiLocalTrack} localtrack - The track associated with the local source signaled to the bridge.
   * @returns {void}
   * @internal
   */
    _sendBridgeVideoTypeMessage(localtrack: JitsiLocalTrack): void {
        let videoType = !localtrack || localtrack.isMuted() ? BridgeVideoType.NONE : localtrack.getVideoType();

        if (videoType === VideoType.DESKTOP && this._desktopSharingFrameRate > SS_DEFAULT_FRAME_RATE) {
            videoType = BridgeVideoType.DESKTOP_HIGH_FPS;
        }

        localtrack && this.rtc.sendSourceVideoType(localtrack.getSourceName(), videoType);
    }

    /**
     * Stops the current JVB jingle session.
     *
     * @param {Object} options - options for stopping JVB session.
     * @param {string} options.reason - One of the Jingle "reason" element
     * names as defined by https://xmpp.org/extensions/xep-0166.html#def-reason
     * @param {string} options.reasonDescription - Text description that will be included
     * in the session terminate message.
     * @param {boolean} options.requestRestart - Whether this is due to
     * a session restart, in which case, session will be
     * set to null.
     * @param {boolean} options.sendSessionTerminate - Whether session-terminate needs to be sent to Jicofo.
     * @internal
     */
    _stopJvbSession(options?: { reason?: string; reasonDescription?: string; requestRestart?: boolean; sendSessionTerminate?: boolean; }): void {
        const {
            requestRestart = false,
            sendSessionTerminate = false
        } = options;

        if (!this.jvbJingleSession) {
            logger.error('No JVB session to be stopped');

            return;
        }

        // Remove remote JVB tracks.
        !this.isP2PActive() && this._removeRemoteJVBTracks();

        logger.info('Stopping stats for jvb connection');
        this.statistics.stopRemoteStats(this.jvbJingleSession.peerconnection);

        this.jvbJingleSession.terminate(
            () => {
                if (requestRestart && sendSessionTerminate) {
                    logger.info('session-terminate for ice restart - done');
                }
                this.jvbJingleSession = null;
            },
            error => {
                if (requestRestart && sendSessionTerminate) {
                    logger.error('session-terminate for ice restart failed: reloading the client');

                    // Initiate a client reload if Jicofo responds to the session-terminate with an error.
                    this.eventEmitter.emit(
                        JitsiConferenceEvents.CONFERENCE_FAILED,
                        JitsiConferenceErrors.ICE_FAILED);
                }
                logger.error(`An error occurred while trying to terminate the JVB session', reason=${error.reason},`
                    + `msg=${error.msg}`);
            },
            options);
    }

    /**
     * Method called by the {@link JitsiLocalTrack} in order to remove the underlying MediaStream from the
     * RTCPeerConnection.
     * @param {JitsiLocalTrack} track - The local track that will be removed.
     * @return {Promise} Resolved when the process is done or rejected with a string which describes the error.
     * @internal
     */
    _removeLocalTrackFromPc(track: JitsiLocalTrack): Promise<PromiseSettledResult<void>[]> {
        const removePromises = [];

        if (track.conference === this) {
            if (this.jvbJingleSession) {
                removePromises.push(this.jvbJingleSession.removeTrackFromPc(track));
            } else {
                logger.debug('Remove local MediaStream - no JVB JingleSession started yet');
            }
            if (this.p2pJingleSession) {
                removePromises.push(this.p2pJingleSession.removeTrackFromPc(track));
            } else {
                logger.debug('Remove local MediaStream - no P2P JingleSession started yet');
            }
        }

        return Promise.allSettled(removePromises);
    }


    /**
   * Method called by the {@link JitsiLocalTrack} in order to add the underlying MediaStream to the RTCPeerConnection.
   * @param {JitsiLocalTrack} track - The local track that will be added to the pc.
   * @return {Promise} Resolved when the process is done or rejected with a string which describes the error.
   * @internal
   */
    async _addLocalTrackToPc(track: JitsiLocalTrack): Promise<void> {
        const addPromises = [];

        if (track.conference === this) {
            if (this.jvbJingleSession) {
                addPromises.push(this.jvbJingleSession.addTrackToPc(track));
            } else {
                logger.debug('Add local MediaStream - no JVB Jingle session started yet');
            }

            if (this.p2pJingleSession) {
                addPromises.push(this.p2pJingleSession.addTrackToPc(track));
            } else {
                logger.debug('Add local MediaStream - no P2P Jingle session started yet');
            }
        } else {
            // If the track hasn't been added to the conference yet because of start muted by focus, add it to the
            // conference instead of adding it only to the media sessions.
            addPromises.push(this.addTrack(track));
        }

        await Promise.allSettled(addPromises);
    }


    /**
   * Sets mute status.
   * @param {JitsiLocalTrack} localTrack - The local track.
   * @param {boolean} isMuted - Whether the track is muted.
   * @return {boolean} <tt>true</tt> when presence was changed, <tt>false</tt> otherwise.
   * @internal
   */
    _setTrackMuteStatus(localTrack: JitsiLocalTrack, isMuted: boolean): boolean {
        let presenceChanged = false;

        if (localTrack) {
            presenceChanged = this._signalingLayer.setTrackMuteStatus(localTrack.getSourceName(), isMuted) || false;
            presenceChanged && logger.debug(`Mute state of ${localTrack} changed to muted=${isMuted}`);
        }

        return presenceChanged;
    }


    /**
     * Updates conference startMuted policy if needed and fires an event.
     * @param {boolean} audio - Whether audio should be muted.
     * @param {boolean} video - Whether video should be muted.
     * @returns {void}
     * @internal
     */
    _updateStartMutedPolicy(audio: boolean, video: boolean): void {
        // Update the start muted policy for the conference only if the meta data is received before conference join.
        if (this.isJoined()) {
            return;
        }

        let updated = false;

        if (audio !== this.startMutedPolicy.audio) {
            this.startMutedPolicy.audio = audio;
            updated = true;
        }

        if (video !== this.startMutedPolicy.video) {
            this.startMutedPolicy.video = video;
            updated = true;
        }
        if (updated) {
            this.eventEmitter.emit(
                JitsiConferenceEvents.START_MUTED_POLICY_CHANGED,
                this.startMutedPolicy
            );
        }
    }

    /**
     * Set the transcribingEnabled flag. When transcribing is enabled, p2p is disabled.
     * @param {boolean} enabled - Whether transcribing should be enabled.
     * @internal
     */
    _setTranscribingEnabled(enabled: boolean): void {
        if (this._transcribingEnabled !== enabled) {
            this._transcribingEnabled = enabled;
            this._maybeStartOrStopP2P(true);
        }
    }


    /**
     * Get notified when we joined the room.
     *
     * @internal
     */
    _onMucJoined(): void {
        this._numberOfParticipantsOnJoin = this.getParticipantCount();
        this._maybeStartOrStopP2P();
    }

    /**
     * Get notified when member bot type had changed.
     * @param jid the member jid
     * @param botType the new botType value
     * @internal
     */
    _onMemberBotTypeChanged(jid: string, botType: string): void {

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
    }


    /**
     * Handles the suspend detected event. Leaves the room and fires suspended.
     * @param {JingleSessionPC} jingleSession - The Jingle session.
     * @internal
     */
    onSuspendDetected(jingleSession: JingleSessionPC): void {
        if (!jingleSession.isP2P) {
            this.leave();
            this.eventEmitter.emit(JitsiConferenceEvents.SUSPEND_DETECTED);
        }
    }


    /**
     * Joins the conference.
     * @param password {string} the password
     * @param replaceParticipant {boolean} whether the current join replaces
     * an existing participant with same jwt from the meeting.
     */
    public join(password: string = '', replaceParticipant: boolean = false) {
        if (this.room) {
            this.room.join(password, replaceParticipant).then(() => this._maybeSetSITimeout());
        }
    }

    /**
     * Connects to the XMPP server using the specified credentials and contacts
     * Jicofo in order to obtain a session ID (which is then stored in the local
     * storage). The user's role of the parent conference will be upgraded to
     * moderator (by Jicofo). It's also used to join the conference when starting
     * from anonymous domain and only authenticated users are allowed to create new
     * rooms.
     *
     * @param options - Options for authentication and upgrade.
     * @returns A thenable which settles when the process finishes and has a cancel method.
     * @internal
     */
    authenticateAndUpgradeRole({
        id,
        password,
        onCreateResource,

        // 2. Let the API client/consumer know as soon as the XMPP user has been
        //    successfully logged in.
        onLoginSuccessful
    }: IAuthenticateAndUpgradeRoleOptions): Promise<void> {
        let canceled = false;
        let rejectPromise: (reason?: IUpgradeRoleError | {}) => void;
        let xmpp: XMPP = new XMPP(this.connection.options, undefined);

        const process = new Promise<void>((resolve, reject) => {
            // The process is represented by a Thenable with a cancel method. The
            // Thenable is implemented using Promise and the cancel using the
            // Promise's reject function.
            rejectPromise = reject;
            xmpp.addListener(
                JitsiConnectionEvents.CONNECTION_DISCONNECTED,
                () => {
                    xmpp = undefined;
                });
            xmpp.addListener(
                JitsiConnectionEvents.CONNECTION_ESTABLISHED,
                () => {
                    if (canceled) {
                        return;
                    }

                    // Let the caller know that the XMPP login was successful.
                    onLoginSuccessful?.();
                    const { config } = this.options;

                    // Now authenticate with Jicofo and get a new session ID.
                    const room = xmpp.createRoom(
                    this.options.name,
                    {
                        ...config,
                        statsId: this._statsCurrentId
                    },
                    onCreateResource
                    );

                    room.xmpp.moderator.authenticate(room.roomjid)
                    .then(() => {
                        xmpp?.disconnect();

                        if (canceled) {
                            return;
                        }

                        // we execute this logic in JitsiConference where we bind the current conference as `this`
                        // At this point we should have the new session ID
                        // stored in the settings. Send a new conference IQ.
                        this.room.xmpp.moderator.sendConferenceRequest(this.room.roomjid)
                            .catch(e => logger.trace('sendConferenceRequest rejected', e))
                            .finally(() => {
                                // we need to reset it because of breakout rooms which will
                                // reuse connection but will invite jicofo
                                this.room.xmpp.moderator.conferenceRequestSent = false;

                                resolve(undefined);
                            });
                    })
                    .catch(({ error, message }) => {
                        xmpp.disconnect();

                        reject({
                            authenticationError: error,
                            message
                        });
                    });
                });
            xmpp.addListener(
                JitsiConnectionEvents.CONNECTION_FAILED,
                (connectionError: JitsiConnectionEvents, message: string, credentials: { jid?: string; password?: string; }) => {
                    reject({
                        connectionError,
                        credentials,
                        message
                    });
                    xmpp = undefined;
                });

            canceled || xmpp.connect(id, password);
        });

        /**
     * Cancels the process, if it's in progress, of authenticating and upgrading
     * the role of the local participant/user.
     *
     * @public
     * @returns {void}
     */
        (process as IProcessWithCancel).cancel = () => {
            canceled = true;
            rejectPromise({});
            xmpp?.disconnect();
        };

        return process;
    }

    /**
     * Restarts all active media sessions.
     *
     * @returns {void}
     * @internal
     */
    _restartMediaSessions(): void {
        if (this.p2pJingleSession) {
            this._stopP2PSession({
                reasonDescription: 'restart',
                requestRestart: true
            });
        }

        if (this.jvbJingleSession) {
            this._stopJvbSession({
                reason: 'success',
                reasonDescription: 'restart required',
                requestRestart: true,
                sendSessionTerminate: true
            });
        }

        this._maybeStartOrStopP2P(false);
    }

    /**
   * Check if joined to the conference.
   * @returns {boolean} True if joined, false otherwise.
   */
    public isJoined(): boolean {
        return this.room?.joined;
    }

    /**
   * Tells whether or not the P2P mode is enabled in the configuration.
   * @returns {boolean} True if P2P is enabled, false otherwise.
   */
    public isP2PEnabled(): boolean {
        return (
            Boolean(this.options.config.p2p?.enabled)

      // FIXME: remove once we have a default config template. -saghul
      || typeof this.options.config.p2p === 'undefined'
        );
    }

    /**
   * When in P2P test mode, the conference will not automatically switch to P2P
   * when there are 2 participants.
   * @returns {boolean} True if P2P test mode is enabled, false otherwise.
   */
    public isP2PTestModeEnabled(): boolean {
        return Boolean(
      this.options.config.testing?.p2pTestMode
        );
    }

    /**
   * Leaves the conference.
   * @param {string|undefined} reason - The reason for leaving the conference.
   * @returns {Promise}
   */
    public async leave(reason?: string): Promise<void> {
        if (this.avgRtpStatsReporter) {
            this.avgRtpStatsReporter.dispose();
            this.avgRtpStatsReporter = null;
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
            return;
        }

        // let's check is this breakout
        if (reason === 'switch_room' && this.getBreakoutRooms()?.isBreakoutRoom()) {
            const mJid = this.getBreakoutRooms().getMainRoomJid();

            this.xmpp.connection._breakoutMovingToMain = mJid;
        }

        const room = this.room;

        // Unregister connection state listeners
        room.removeListener(
            XMPPEvents.CONNECTION_INTERRUPTED,
            this._onIceConnectionInterrupted
        );
        room.removeListener(
            XMPPEvents.CONNECTION_RESTORED,
            this._onIceConnectionRestored
        );
        room.removeListener(
            XMPPEvents.CONNECTION_ESTABLISHED,
            this._onIceConnectionEstablished
        );

        room.removeListener(
            XMPPEvents.CONFERENCE_PROPERTIES_CHANGED,
            this._updateProperties
        );

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
            await room.leave(reason);
        } catch (err) {
            leaveError = err;

            // Remove all participants because currently the conference
            // won't be usable anyway. This is done on success automatically
            // by the ChatRoom instance.
            this.getParticipants().forEach(
        participant => this.onMemberLeft(participant.getJid())
            );
        }

        if (this.rtc) {
            this.rtc.destroy();
        }

        if (leaveError) {
            throw leaveError;
        }
    }

    /**
   * Disposes of conference resources. This operation is a short-hand for leaving
   * the conference and disconnecting the connection.
   * @returns {Promise}
   */
    public async dispose(): Promise<void> {
        await this.leave();
        await this.connection?.disconnect();
    }

    /**
   * Returns true if end conference support is enabled in the backend.
   * @returns {boolean} whether end conference is supported in the backend.
   */
    public isEndConferenceSupported(): boolean {
        return Boolean(this.room?.xmpp.endConferenceComponentAddress);
    }

    /**
   * Ends the conference.
   */
    public end(): void {
        if (!this.isEndConferenceSupported()) {
            logger.warn('Cannot end conference: is not supported.');

            return;
        }
        if (!this.room) {
            throw new Error('You have already left the conference');
        }

        this.room.end();
    }

    /**
   * Returns the currently active media session if any.
   * @returns {Optional<JingleSessionPC>}
   */
    public getActiveMediaSession(): Optional<JingleSessionPC> {
        return this.isP2PActive() ? this.p2pJingleSession : this.jvbJingleSession;
    }

    /**
   * Returns an array containing all media sessions existing in this conference.
   * @returns {Array<JingleSessionPC>}
   */
    public getMediaSessions(): JingleSessionPC[] {
        const sessions = [];

        this.jvbJingleSession && sessions.push(this.jvbJingleSession);
        this.p2pJingleSession && sessions.push(this.p2pJingleSession);

        return sessions;
    }

    /**
   * Returns name of this conference.
   * @returns {string}
   */
    public getName(): string {
        return this.options.name.toString();
    }

    /**
   * Returns the {@link JitsiConnection} used by this conference.
   * @returns {JitsiConnection}
   */
    public getConnection(): JitsiConnection {
        return this.connection;
    }

    /**
   * Check if authentication is enabled for this conference.
   * @returns {boolean}
   */
    public isAuthEnabled(): boolean {
        return this.authEnabled;
    }

    /**
   * Check if user is logged in.
   * @returns {boolean}
   */
    public isLoggedIn(): boolean {
        return Boolean(this.authIdentity);
    }

    /**
   * Get authorized login.
   * @returns {string|null}
   */
    public getAuthLogin(): Nullable<string> {
        return this.authIdentity;
    }

    /**
   * Returns the local tracks of the given media type, or all local tracks if no
   * specific type is given.
   * @param {MediaType} [mediaType] Optional media type (audio or video).
   * @returns {Array<JitsiLocalTrack>}
   */
    public getLocalTracks(mediaType?: MediaType): JitsiLocalTrack[] {
        let tracks = [];

        if (this.rtc) {
            tracks = this.rtc.getLocalTracks(mediaType);
        }

        return tracks;
    }

    /**
   * Obtains local audio track.
   * @returns {JitsiLocalTrack|null}
   */
    public getLocalAudioTrack(): Nullable<JitsiLocalTrack> {
        return this.rtc ? this.rtc.getLocalAudioTrack() : null;
    }

    /**
   * Obtains local video track.
   * @returns {JitsiLocalTrack|null}
   */
    public getLocalVideoTrack(): Nullable<JitsiLocalTrack> {
        return this.rtc ? this.rtc.getLocalVideoTrack() : null;
    }

    /**
   * Returns all the local video tracks.
   * @returns {Array<JitsiLocalTrack>|null}
   */
    public getLocalVideoTracks(): Nullable<JitsiLocalTrack[]> {
        return this.rtc ? this.rtc.getLocalVideoTracks() : null;
    }

    /**
   * Receives notifications from other participants about commands / custom events
   * (sent by sendCommand or sendCommandOnce methods).
   * @param {string} command - The name of the command.
   * @param {Function} handler - Handler for the command.
   */
    public addCommandListener(command: string, handler: PresenceHandler): void {
        if (this.room) {
            this.room.addPresenceListener(command, handler);
        }
    }

    /**
   * Removes command listener.
   * @param {string} command - The name of the command.
   * @param {Function} handler - Handler to remove for the command.
   */
    public removeCommandListener(command: string, handler: PresenceHandler): void {
        if (this.room) {
            this.room.removePresenceListener(command, handler);
        }
    }

    /**
    /**
   * Sends text message to the other participants in the conference.
   * @param {string} message - The text message.
   * @param {string} [elementName='body'] - The element name to encapsulate the message.
   * @param {string} [replyToId] - The ID of the message being replied to.
   * @deprecated Use 'sendMessage' instead. TODO: this should be private.
   */
    public sendTextMessage(message: string, elementName: string = 'body', replyToId?: string): void {
        if (this.room) {
            this.room.sendMessage(message, elementName, replyToId);
        }
    }

    /**
   * Sends a reaction to the other participants in the conference.
   * @param {string} reaction - The reaction.
   * @param {string} messageId - The ID of the message to attach the reaction to.
   * @param {string} receiverId - The intended recipient, if the message is private.
   */
    public sendReaction(reaction: string, messageId: string, receiverId: string): void {
        if (this.room) {
            this.room.sendReaction(reaction, messageId, receiverId);
        }
    }

    /**
   * Sends private text message to another participant of the conference.
   * @param {string} id - The ID of the participant to send a private message.
   * @param {string} message - The text message.
   * @param {string} [elementName='body'] - The element name to encapsulate the message.
   * @param {boolean} [useFullJid=false] - Whether to use the full JID.
   * @param {string} [replyToId] - The ID of the message being replied to.
   * @deprecated Use 'sendMessage' instead. TODO: this should be private.
   */
    public sendPrivateTextMessage(id: string, message: string, elementName: string = 'body', useFullJid = false, replyToId?: string): void {
        if (this.room) {
            this.room.sendPrivateMessage(id, message, elementName, useFullJid, replyToId);
        }
    }

    /**
   * Send presence command.
   * @param {string} name - The name of the command.
   * @param {Record<string, unknown>} values - With keys and values that will be sent.
   */
    public sendCommand(name: string, values: Record<string, unknown>): void {
        if (this.room) {
            this.room.addOrReplaceInPresence(name, values) && this.room.sendPresence();
        } else {
            logger.warn('Not sending a command, room not initialized.');
        }
    }

    /**
   * Send presence command one time.
   * @param {string} name - The name of the command.
   * @param {Record<string, unknown>} values - With keys and values that will be sent.
   */
    public sendCommandOnce(name: string, values: Record<string, unknown>): void {
        this.sendCommand(name, values);
        this.removeCommand(name);
    }

    /**
   * Removes presence command.
   * @param {string} name - The name of the command.
   */
    public removeCommand(name: string): void {
        if (this.room) {
            this.room.removeFromPresence(name);
        }
    }

    /**
   * Sets the display name for this conference.
   * @param {string} name - The display name to set.
   */
    public setDisplayName(name: string): void {
        if (this.room) {
            const nickKey = 'nick';

            if (name) {
                this.room.addOrReplaceInPresence(nickKey, {
                    attributes: { xmlns: 'http://jabber.org/protocol/nick' },
                    value: name
                }) && this.room.sendPresence(false);
            } else if (this.room.getFromPresence(nickKey)) {
                this.room.removeFromPresence(nickKey);
                this.room.sendPresence(false);
            }
        }
    }

    /**
   * Set join without audio.
   * @param {boolean} silent - Whether user joined without audio.
   */
    public setIsSilent(silent: boolean): void {
        if (this.room) {
            this.room.addOrReplaceInPresence('silent', {
                attributes: { xmlns: 'http://jitsi.org/protocol/silent' },
                value: silent
            }) && this.room.sendPresence(false);
        }
    }

    /**
   * Set new subject for this conference. (Available only for moderator)
   * @param {string} subject - New subject.
   */
    public setSubject(subject: string): void {
        if (this.room && this.isModerator()) {
            this.room.setSubject(subject);
        } else {
            logger.warn(`Failed to set subject, ${this.room ? '' : 'not in a room, '}${
                this.isModerator() ? '' : 'participant is not a moderator'}`);
        }
    }

    /**
   * Returns the transcription status.
   * @returns {string} "on" or "off".
   */
    public getTranscriptionStatus(): string {
        return this.room.transcriptionStatus;
    }

    /**
   * Adds JitsiLocalTrack object to the conference.
   * @param {JitsiLocalTrack} track - The JitsiLocalTrack object.
   * @returns {Promise<void>}
   * @throws {Error} If the specified track is a video track and there is already
   * another video track in the conference.
   */
    public addTrack(track: JitsiLocalTrack): Promise<void> {
        if (!track) {
            throw new Error('addTrack - a track is required');
        }

        const mediaType = track.getType();
        const localTracks = this.rtc.getLocalTracks(mediaType);

        // Ensure there's exactly 1 local track of each media type in the conference.
        if (localTracks.length > 0) {
            // Don't be excessively harsh and severe if the API
            // client happens to attempt to add the same local track twice.
            if (track === localTracks[0]) {
                return Promise.resolve();
            }

            // Currently, only adding multiple video streams of different video types is supported.
            // TODO - remove this limitation once issues with jitsi-meet trying to add multiple camera streams is fixed.
            if (
                this.options.config.testing?.allowMultipleTracks
                || (mediaType === MediaType.VIDEO && !localTracks.find(t =>
                    t.getVideoType() === track.getVideoType()))) {
                const sourceName = getSourceNameForJitsiTrack(
                    this.myUserId(),
                    mediaType,
                    this.getLocalTracks(mediaType)?.length);

                track.setSourceName(sourceName);
                const addTrackPromises = [];

                this.p2pJingleSession && addTrackPromises.push(this.p2pJingleSession.addTracks([ track ]));
                this.jvbJingleSession && addTrackPromises.push(this.jvbJingleSession.addTracks([ track ]));

                return Promise.all(addTrackPromises)
                    .then(() => {
                        this._setupNewTrack(track);
                        mediaType === MediaType.VIDEO && this._sendBridgeVideoTypeMessage(track);
                        this._updateRoomPresence(this.getActiveMediaSession());

                        if (this.isMutedByFocus || this.isVideoMutedByFocus || this.isDesktopMutedByFocus) {
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
                if (track.getVideoType() === VideoType.DESKTOP) {
                    this._updateRoomPresence(this.getActiveMediaSession());
                }
            });
    }

    /**
   * Clear JitsiLocalTrack properties and listeners.
   * @param {JitsiLocalTrack} track - The JitsiLocalTrack object.
   * @internal
   */
    onLocalTrackRemoved(track: JitsiLocalTrack): void {
        track.setConference(null);
        this.rtc.removeLocalTrack(track);
        this._unsubscribers.forEach(remove => remove());
        this._unsubscribers = [];

        this.eventEmitter.emit(JitsiConferenceEvents.TRACK_REMOVED, track);
    }

    /**
   * Removes JitsiLocalTrack from the conference and performs
   * a new offer/answer cycle.
   * @param {JitsiLocalTrack} track - The track to remove.
   * @returns {Promise}
   */
    public removeTrack(track: JitsiLocalTrack): Promise<void> {
        return this.replaceTrack(track, null);
    }

    /**
   * Replaces oldTrack with newTrack and performs a single offer/answer
   * cycle after both operations are done. Either oldTrack or newTrack
   * can be null; replacing a valid 'oldTrack' with a null 'newTrack'
   * effectively just removes 'oldTrack'
   * @param {JitsiLocalTrack} oldTrack - The current stream in use to be replaced.
   * @param {JitsiLocalTrack} newTrack - The new stream to use.
   * @returns {Promise} Resolves when the replacement is finished.
   */
    public replaceTrack(oldTrack?: JitsiLocalTrack, newTrack?: JitsiLocalTrack): Promise<void> {
        const oldVideoType = oldTrack?.getVideoType();
        const mediaType = oldTrack?.getType() || newTrack?.getType();
        const newVideoType = newTrack?.getVideoType();

        if (oldTrack && newTrack && oldVideoType !== newVideoType) {
            throw new Error(
                `Replacing a track of videoType=${oldVideoType} with a track of videoType=${newVideoType} is`
                + ' not supported in this mode.');
        }

        if (newTrack) {
            const sourceName = oldTrack
                ? oldTrack.getSourceName()
                : getSourceNameForJitsiTrack(
                    this.myUserId(),
                    mediaType,
                    this.getLocalTracks(mediaType)?.length);

            newTrack.setSourceName(sourceName);
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
                if (oldTrackBelongsToConference && !oldTrack.isMuted() && !newTrack) {
                    oldTrack._sendMuteStatus(true);
                }
                oldTrackBelongsToConference && this.onLocalTrackRemoved(oldTrack);
                newTrack && this._setupNewTrack(newTrack);

                // Send 'VideoTypeMessage' on the bridge channel when a video track is added/removed.
                if ((oldTrackBelongsToConference && oldTrack?.isVideoTrack()) || newTrack?.isVideoTrack()) {
                    this._sendBridgeVideoTypeMessage(newTrack);
                }
                this._updateRoomPresence(this.getActiveMediaSession());
                if (newTrack !== null && (this.isMutedByFocus || this.isVideoMutedByFocus
                        || this.isDesktopMutedByFocus)) {
                    this._fireMuteChangeEvent(newTrack);
                }

                return Promise.resolve();
            })
            .catch(error => {
                logger.error(`replaceTrack failed: ${error?.stack}`);

                return Promise.reject(error);
            });
    }

    /**
   * Get role of the local user.
   * @returns {string} User role: 'moderator' or 'none'.
   */
    public getRole(): string {
        return this.room.role;
    }

    /**
     * Returns whether or not the current conference has been joined as a hidden user.
     * @returns {boolean} True if hidden, false otherwise. Will return false if no connection is active.
     */
    public isHidden(): boolean {
        if (!this.connection) {
            return false;
        }

        return Strophe.getDomainFromJid(this.connection.getJid())
             === this.options.config.hiddenDomain;
    }

    /**
     * Check if local user is moderator.
     * @returns {boolean} true if local user is moderator, false otherwise. If
     * we're no longer in the conference room then <tt>false</tt> is returned.
     */
    public isModerator(): boolean {
        return this.room ? this.room.isModerator() : false;
    }

    /**
     * Set password for the room.
     * @param {string} password new password for the room.
     * @returns {Promise}
     */
    public lock(password: string): Promise<void> {
        if (!this.isModerator()) {
            return Promise.reject(new Error('You are not moderator.'));
        }

        return new Promise((resolve, reject) => {
            this.room.lockRoom(
                password || '',
                () => resolve(),
                (err: Error) => reject(err),
                () => reject(JitsiConferenceErrors.PASSWORD_NOT_SUPPORTED)
            );
        });
    }

    /**
     * Remove password from the room.
     * @returns {Promise}
     */
    public unlock(): Promise<void> {
        return this.lock('');
    }

    /**
     * Obtains the current value for "lastN". See {@link setLastN} for more info.
     * @returns {number}
     */
    public getLastN(): number {
        return this.qualityController.receiveVideoController.getLastN();
    }

    /**
     * Obtains the forwarded sources list in this conference.
     * @return {Array<string>}
     * @internal
     */
    getForwardedSources(): string[] {
        return this.rtc.getForwardedSources();
    }

    /**
     * Sets the audio subscription mode for the local user.
     *
     * @param {IReceiverAudioSubscriptionMessage} message - The audio subscription mode to set.
     * @returns {void}
     */
    public setAudioSubscriptionMode(message: IReceiverAudioSubscriptionMessage): void {
        this.qualityController.audioController.setAudioSubscriptionMode(message);
    }

    /**
     * Selects a new value for "lastN". The requested amount of videos are going
     * to be delivered after the value is in effect. Set to -1 for unlimited or
     * all available videos.
     * @param lastN the new number of videos the user would like to receive.
     * @throws Error or RangeError if the given value is not a number or is smaller
     * than -1.
     */
    public setLastN(lastN: number): void {
        if (!Number.isInteger(lastN)) {
            throw new Error(`Invalid value for lastN: ${lastN}`);
        }
        const n = Number(lastN);

        if (n < -1) {
            throw new RangeError('lastN cannot be smaller than -1');
        }
        this.qualityController.receiveVideoController.setLastN(n);

        // If the P2P session is not fully established yet, we wait until it gets established.
        if (this.p2pJingleSession) {
            const isVideoActive = n !== 0;

            this.p2pJingleSession
                .setP2pVideoTransferActive(isVideoActive)
                .catch(error => {
                    logger.error(`Failed to adjust video transfer status (${isVideoActive})`, error);
                });
        }
    }

    /**
     * @return Array<JitsiParticipant> an array of all participants in this conference.
     */
    public getParticipants(): JitsiParticipant[] {
        return Array.from(this.participants.values());
    }

    /**
     * Returns the number of participants in the conference, including the local
     * participant.
     * @param countHidden {boolean} Whether or not to include hidden participants
     * in the count. Default: false.
     **/
    public getParticipantCount(countHidden = false): number {
        let participants = this.getParticipants();

        if (!countHidden) {
            participants = participants.filter(p => !p.isHidden());
        }

        // Add one for the local participant.
        return participants.length + 1;
    }

    /**
     * @returns {JitsiParticipant} the participant in this conference with the
     * specified id (or undefined if there isn't one).
     * @param id the id of the participant.
     */
    public getParticipantById(id: string): Optional<JitsiParticipant> {
        return this.participants.get(id);
    }

    /**
     * Grant owner rights to the participant.
     * @param {string} id id of the participant to grant owner rights to.
     */
    public grantOwner(id: string): void {
        const participant = this.getParticipantById(id);

        if (!participant) {
            return;
        }
        this.room.setAffiliation(participant.getConnectionJid(), 'owner');
    }

    /**
     * Revoke owner rights to the participant or local Participant as
     * the user might want to refuse to be a moderator.
     * @param {string} id id of the participant to revoke owner rights to.
     */
    public revokeOwner(id: string): void {
        const participant = this.getParticipantById(id);
        const isMyself = this.myUserId() === id;
        const role = this.isMembersOnly() ? 'member' : 'none';

        if (isMyself) {
            this.room.setAffiliation(this.connection.getJid(), role);
        } else if (participant) {
            this.room.setAffiliation(participant.getConnectionJid(), role);
        }
    }

    /**
     * Kick participant from this conference.
     * @param {string} id id of the participant to kick
     * @param {string} reason reason of the participant to kick
     */
    public kickParticipant(id: string, reason: string): void {
        const participant = this.getParticipantById(id);

        if (!participant) {
            return;
        }
        this.room.kick(participant.getJid(), reason);
    }

    /**
     * Mutes or unmutes the remote audio streams based on the provided parameter.
     *
     * @param {boolean} muted - Whether the user should stop receiving remote audio.
     * @returns {void}
     */
    public muteRemoteAudio(muted: boolean): void {
        this.qualityController.audioController.muteRemoteAudio(muted);
    }

    /**
     * Mutes a participant.
     * @param {string} id The id of the participant to mute.
     */
    public muteParticipant(id: string, mediaType: MediaType = MediaType.AUDIO): void {
        if (!mediaType) {
            logger.error(`Unsupported media type: ${mediaType}`);

            return;
        }

        const participant = this.getParticipantById(id);

        if (!participant) {
            return;
        }

        this.room.muteParticipant(participant.getJid(), true, mediaType);
    }


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
     * @internal
     */
    onMemberJoined(
            jid: string, nick: string, role: string, isHidden: boolean, statsID: string, status: string, identity: object, botType: string, fullJid: string, features: string, isReplaceParticipant: boolean
    ): void {
        const id = Strophe.getResourceFromJid(jid);

        if (id === 'focus' || this.myUserId() === id) {
            return;
        }
        const participant = new JitsiParticipant(jid, this, nick, isHidden, statsID, status, identity);

        participant.setConnectionJid(fullJid);
        participant.setRole(role);
        participant.setBotType(botType);
        participant.setFeatures(features ? new Set([ features ]) : undefined);
        participant.setIsReplacing(isReplaceParticipant);

        // Set remote tracks on the participant if source signaling was received before presence.
        const remoteTracks = this.isP2PActive()
            ? this.p2pJingleSession?.peerconnection.getRemoteTracks(id) ?? []
            : this.jvbJingleSession?.peerconnection.getRemoteTracks(id) ?? [];

        for (const track of remoteTracks) {
            participant._tracks.push(track);
        }

        this.participants.set(id, participant);
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
        const { startAudioMuted, startVideoMuted } = this.options.config;

        // Ignore startAudio/startVideoMuted settings if the media session has already been established.
        // Apply the policy if the number of participants exceeds the startMuted thresholds.
        if ((this.jvbJingleSession && this.getActiveMediaSession() === this.jvbJingleSession)
            || ((typeof startAudioMuted === 'undefined' || startAudioMuted === -1)
                && (typeof startVideoMuted === 'undefined' || startVideoMuted === -1))) {
            return;
        }

        let audioMuted = false;
        let videoMuted = false;
        const numberOfParticipants = this.getParticipantCount();

        if (numberOfParticipants > this.options.config.startAudioMuted) {
            audioMuted = true;
        }

        if (numberOfParticipants > this.options.config.startVideoMuted) {
            videoMuted = true;
        }

        if ((audioMuted && !this.startMutedPolicy.audio) || (videoMuted && !this.startMutedPolicy.video)) {
            this._updateStartMutedPolicy(audioMuted, videoMuted);
        }
    }

    /**
     * Handles the logic when a remote participant leaves the conference.
     * @param {string} jid - The Jabber ID (JID) of the participant who left.
     * @param {string} [reason] - Optional reason provided for the participant leaving.
     * @internal
     */
    onMemberLeft(jid: string, reason?: string): void {
        const id = Strophe.getResourceFromJid(jid);

        if (id === 'focus' || this.myUserId() === id) {
            return;
        }

        const mediaSessions = this.getMediaSessions();
        let tracksToBeRemoved = [];

        for (const session of mediaSessions) {
            const remoteTracks = session.peerconnection.getRemoteTracks(id);

            remoteTracks && (tracksToBeRemoved = [ ...tracksToBeRemoved, ...remoteTracks ]);

            // Update the SSRC owners list.
            session._signalingLayer.updateSsrcOwnersOnLeave(id);
            if (!FeatureFlags.isSsrcRewritingSupported()) {
                // Remove the ssrcs from the remote description and renegotiate.
                session.removeRemoteStreamsOnLeave(id);
            }
        }

        tracksToBeRemoved.forEach(track => {
            // Fire the event before renegotiation is done so that the thumbnails can be removed immediately.
            this.eventEmitter.emit(JitsiConferenceEvents.TRACK_REMOVED, track);

            if (FeatureFlags.isSsrcRewritingSupported()) {
                track.setSourceName(null);
                track.setOwner(null);
            }
        });

        const participant = this.participants.get(id);

        if (participant) {
            this.participants.delete(id);
            this.eventEmitter.emit(JitsiConferenceEvents.USER_LEFT, id, participant, reason);
        }

        if (this.room !== null) { // Skip if we have left the room already.
            this._maybeStartOrStopP2P(true /* triggered by user left event */);
            this._maybeClearSITimeout();
        }
    }

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
     * @internal
     */
    onMemberKicked(isSelfPresence: boolean, actorId: string, kickedParticipantId: string, reason: string, isReplaceParticipant: boolean): void {
        let actorParticipant;

        if (actorId === this.myUserId()) {
            // When we kick someone we also want to send the PARTICIPANT_KICKED event, but there is no
            // JitsiParticipant object for ourselves so create a minimum fake one.
            actorParticipant = {
                getId: () => actorId
            };
        } else {
            actorParticipant = this.participants.get(actorId);
        }

        if (isSelfPresence) {
            this.leave().finally(() => this._xmpp.disconnect());
            this.eventEmitter.emit(
                JitsiConferenceEvents.KICKED, actorParticipant, reason, isReplaceParticipant);

            return;
        }

        const kickedParticipant = this.participants.get(kickedParticipantId);

        kickedParticipant.setIsReplaced(isReplaceParticipant);

        this.eventEmitter.emit(
            JitsiConferenceEvents.PARTICIPANT_KICKED, actorParticipant, kickedParticipant, reason);
    }

    /**
     * Method called on local MUC role change.
     * @param {string} role the name of new user's role as defined by XMPP MUC.
     * @internal
     */
    onLocalRoleChanged(role: string): void {
        // Emit role changed for local JID
        this.eventEmitter.emit(
            JitsiConferenceEvents.USER_ROLE_CHANGED, this.myUserId(), role);
    }

    /**
     * Handles changes to a user's role within the conference.
     * @param {string} jid - The Jabber ID (JID) of the user whose role has changed.
     * @param {string} role - The new role assigned to the user (e.g., 'moderator', 'participant').
     * @internal
     */
    onUserRoleChanged(jid: string, role: string): void {
        const id = Strophe.getResourceFromJid(jid);
        const participant = this.getParticipantById(id);

        if (!participant) {
            return;
        }
        participant.setRole(role);
        this.eventEmitter.emit(JitsiConferenceEvents.USER_ROLE_CHANGED, id, role);
    }

    /**
     * Handles updates to a participant's display name.
     * @param {string} jid - The Jabber ID (JID) of the participant whose display name changed.
     * @param {string} displayName - The new display name for the participant.
     * @internal
     */
    onDisplayNameChanged(jid: string, displayName: string): void {
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
    }

    /**
     * Handles changes to a participant's silent status.
     * @param {string} jid - The Jabber ID (JID) of the participant whose silent status has changed.
     * @param {boolean} isSilent - The new silent status of the participant (true if silent, false otherwise).
     * @internal
     */
    onSilentStatusChanged(jid: string, isSilent: boolean): void {
        const id = Strophe.getResourceFromJid(jid);
        const participant = this.getParticipantById(id);

        if (!participant) {
            return;
        }

        participant.setIsSilent(isSilent);
        this.eventEmitter.emit(
            JitsiConferenceEvents.SILENT_STATUS_CHANGED,
            id,
            isSilent);
    }

    /**
     * Notifies this JitsiConference that a JitsiRemoteTrack was added to the conference.
     *
     * @param {JitsiRemoteTrack} track the JitsiRemoteTrack which was added to this JitsiConference.
     * @internal
     */
    onRemoteTrackAdded(track: JitsiRemoteTrack): void {
        if (track.isP2P && !this.isP2PActive()) {
            logger.info('Trying to add remote P2P track, when not in P2P - IGNORED');

            return;
        } else if (!track.isP2P && this.isP2PActive()) {
            logger.info('Trying to add remote JVB track, when in P2P - IGNORED');

            return;
        }

        const id = track.getParticipantId();
        const participant = this.getParticipantById(id);

        // Add track to JitsiParticipant.
        if (participant) {
            participant._tracks.push(track);
        } else {
            logger.info(`Source signaling received before presence for ${id}`);
        }

        const emitter = this.eventEmitter;

        track.addEventListener(
            JitsiTrackEvents.TRACK_MUTE_CHANGED,
            () => emitter.emit(JitsiConferenceEvents.TRACK_MUTE_CHANGED, track));
        track.isAudioTrack() && track.addEventListener(
            JitsiTrackEvents.TRACK_AUDIO_LEVEL_CHANGED,
            (audioLevel: number, tpc: TraceablePeerConnection) => {
                const activeTPC = this.getActivePeerConnection();

                if (activeTPC === tpc) {
                    emitter.emit(JitsiConferenceEvents.TRACK_AUDIO_LEVEL_CHANGED, id, audioLevel);
                }
            }
        );

        emitter.emit(JitsiConferenceEvents.TRACK_ADDED, track);
    }


    // eslint-disable-next-line no-unused-vars
    /**
     * Callback called by the Jingle plugin when 'session-answer' is received.
     * @param {JingleSessionPC} session - The Jingle session for which an answer was received.
     * @param {Element} answer - An element pointing to 'jingle' IQ element.
     * @internal
     */
    onCallAccepted(session: JingleSessionPC, answer: Element): void {
        if (this.p2pJingleSession === session) {
            logger.info('P2P setAnswer');

            this.p2pJingleSession.setAnswer(answer)
                .then(() => {
                    this.eventEmitter.emit(JitsiConferenceEvents._MEDIA_SESSION_STARTED, this.p2pJingleSession);
                })
                .catch(error => {
                    logger.error('Error setting P2P answer', error);
                    if (this.p2pJingleSession) {
                        this.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED,
                            JitsiConferenceErrors.OFFER_ANSWER_FAILED, error);
                    }
                });
        }
    }


    // eslint-disable-next-line no-unused-vars
    /**
     * Callback called by the Jingle plugin when 'transport-info' is received.
     * @param {JingleSessionPC} session - The Jingle session for which the IQ was received.
     * @param {Object} transportInfo - An element pointing to 'jingle' IQ element.
     * @internal
     */
    onTransportInfo(session: JingleSessionPC, transportInfo: object): void {
        if (this.p2pJingleSession === session) {
            logger.info('P2P addIceCandidates');
            this.p2pJingleSession.addIceCandidates(transportInfo);
        }
    }

    /**
     * Notifies this JitsiConference that a JitsiRemoteTrack was removed from the conference.
     *
     * @param {JitsiRemoteTrack} removedTrack - The track that was removed.
     * @internal
     */
    onRemoteTrackRemoved(removedTrack: JitsiRemoteTrack): void {
        this.getParticipants().forEach(participant => {
            const tracks = participant.getTracks();

            for (let i = 0; i < tracks.length; i++) {
                if (tracks[i] === removedTrack) {
                    // Since the tracks have been compared and are
                    // considered equal the result of splice can be ignored.
                    participant._tracks.splice(i, 1);

                    this.eventEmitter.emit(JitsiConferenceEvents.TRACK_REMOVED, removedTrack);

                    break;
                }
            }
        }, this);
    }

    /**
     * Handles an incoming call event.
     * @param {JingleSessionPC} jingleSession - The Jingle session for the incoming call.
     * @param {Element} jingleOffer - An element pointing to 'jingle' IQ element containing the offer.
     * @param {number} now - The timestamp when the call was received.
     * @internal
     */
    onIncomingCall(jingleSession: JingleSessionPC, jingleOffer: Element, now: number): void {
        // Handle incoming P2P call
        if (jingleSession.isP2P) {
            this._onIncomingCallP2P(jingleSession, jingleOffer);
        } else {
            if (!this.isFocus(jingleSession.remoteJid)) {
                const description = 'Rejecting session-initiate from non-focus.';

                this._rejectIncomingCall(
                    jingleSession, {
                        errorMsg: description,
                        reason: 'security-error',
                        reasonDescription: description
                    });

                return;
            }
            this._acceptJvbIncomingCall(jingleSession, jingleOffer, now);
        }
    }

    /**
     * Handles the call ended event.
     * XXX is this due to the remote side terminating the Jingle session?
     *
     * @param {JingleSessionPC} jingleSession - The Jingle session which has been terminated.
     * @param {String} reasonCondition - The Jingle reason condition.
     * @param {String|null} reasonText - Human readable reason text which may provide
     *  more details about why the call has been terminated.
     * @internal
     */
    onCallEnded(jingleSession: JingleSessionPC, reasonCondition: string, reasonText: string): void {
        logger.info(
            `Call ended: ${reasonCondition} - ${reasonText} P2P ?${
                jingleSession.isP2P}`);
        if (jingleSession === this.jvbJingleSession) {
            this.wasStopped = true;

            Statistics.sendAnalytics(
                createJingleEvent(AnalyticsEvents.ACTION_JINGLE_TERMINATE, { p2p: false }));

            // Stop the stats
            if (this.statistics) {
                this.statistics.stopRemoteStats(this.jvbJingleSession.peerconnection);
            }

            // Current JVB JingleSession is no longer valid, so set it to null
            this.jvbJingleSession = null;

            // Let the RTC service do any cleanups
            this.rtc.onCallEnded();
        } else if (jingleSession === this.p2pJingleSession) {
            const stopOptions: { requestRestart?: boolean; } = {};

            if (reasonCondition === 'connectivity-error' && reasonText === 'ICE FAILED') {
                // It can happen that the other peer detects ICE failed and
                // terminates the session, before we get the event
                // on our side. But we are able to parse the reason and mark it here.
                Statistics.analytics.addPermanentProperties({ p2pFailed: true });
            } else if (reasonCondition === 'success' && reasonText === 'restart') {
                // When we are restarting media sessions we don't want to switch the tracks to the JVB just yet.
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
    }

    /**
     * Updates DTMF support based on participants' capabilities.
     * @returns {void}
     */
    public updateDTMFSupport(): void {
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
    }

    /**
     * Allows to check if there is at least one user in the conference that supports DTMF.
     * @returns {boolean} True if somebody supports DTMF, false otherwise.
     */
    public isDTMFSupported(): boolean {
        return this.somebodySupportsDTMF;
    }

    /**
     * Returns the local user's ID.
     * @returns {string|null} Local user's ID or null if not available.
     */
    public myUserId(): Nullable<string> {
        return (
            this.room?.myroomjid
                ? Strophe.getResourceFromJid(this.room.myroomjid)
                : null);
    }

    /**
     * Sends DTMF tones to the active peer connection.
     * @param {string} tones - The DTMF tones to send.
     * @param {number} duration - The duration of each tone in milliseconds.
     * @param {number} pause - The pause duration between tones in milliseconds.
     * @returns {void}
     */
    public sendTones(tones: string, duration: number, pause: number): void {
        const peerConnection = this.getActivePeerConnection();

        if (peerConnection) {
            peerConnection.sendTones(tones, duration, pause);
        } else {
            logger.warn('cannot sendTones: no peer connection');
        }
    }

    /**
     * Starts recording the current conference.
     *
     * @param {IRecordingOptions} options - Configuration for the recording.
     * @returns {Promise} Resolves when recording starts successfully, rejects otherwise.
     */
    public startRecording(options: IRecordingOptions): Promise<JibriSession> {
        if (this.room) {
            return this.recordingManager.startRecording(options);
        }

        return Promise.reject(new Error('The conference is not created yet!'));
    }

    /**
     * Stops a recording session.
     *
     * @param {string} sessionID - The ID of the recording session to stop.
     * @returns {Promise} Resolves when recording stops successfully, rejects otherwise.
     */
    public stopRecording(sessionID: string): Promise<void> {
        if (this.room) {
            return this.recordingManager.stopRecording(sessionID);
        }

        return Promise.reject(new Error('The conference is not created yet!'));
    }

    /**
     * Returns true if SIP calls are supported, false otherwise.
     * @returns {boolean} True if SIP calling is supported, false otherwise.
     */
    public isSIPCallingSupported(): boolean {
        return this.room?.xmpp?.moderator?.isSipGatewayEnabled() ?? false;
    }

    /**
     * Dials a phone number to join the conference.
     * @param {string} number - The phone number to dial.
     * @returns {Promise} Resolves when the dial is successful, rejects otherwise.
     */
    public dial(number: string): Promise<void> {
        if (this.room) {
            return this.room.dial(number);
        }

        return Promise.reject(new Error('The conference is not created yet!'));
    }

    /**
     * Hangs up an existing call.
     * @returns {Promise} Resolves when the hangup is successful.
     */
    public hangup(): Promise<void> {
        if (this.room) {
            return this.room.hangup();
        }

        return Promise.resolve();
    }

    /**
     * Returns the phone number for joining the conference.
     * @returns {string|null} The phone number or null if not available.
     */
    public getPhoneNumber(): Nullable<string> {
        if (this.room) {
            return this.room.getPhoneNumber();
        }

        return null;
    }

    /**
     * Returns the PIN for joining the conference via phone.
     * @returns {string|null} The phone PIN or null if not available.
     */
    public getPhonePin(): Nullable<string> {
        if (this.room) {
            return this.room.getPhonePin();
        }

        return null;
    }

    /**
     * Returns the meeting unique ID if any.
     * @returns {string|undefined} The meeting ID or undefined if not available.
     */
    public getMeetingUniqueId(): Optional<string> {
        if (this.room) {
            return this.room.getMeetingId();
        }
    }

    /**
     * Returns the active peer connection (P2P or JVB).
     * @returns {TraceablePeerConnection|null} The active peer connection or null if none is available.
     * @public
     */
    public getActivePeerConnection(): Nullable<TraceablePeerConnection> {
        const session = this.isP2PActive() ? this.p2pJingleSession : this.jvbJingleSession;

        return session ? session.peerconnection : null;
    }

    /**
     * Returns the connection state for the current room.
     * NOTE that "completed" ICE state which can appear on the P2P connection will
     * be converted to "connected".
     * @returns {string|null} The ICE connection state or null if no active peer connection exists.
     */
    public getConnectionState(): Nullable<string> {
        const peerConnection = this.getActivePeerConnection();

        return peerConnection ? peerConnection.getConnectionState() : null;
    }

    /**
     * Sets the start muted policy for new participants.
     * @param {Object} policy - Object with boolean properties for audio and video muting.
     * @param {boolean} policy.audio - Whether audio should be muted for new participants.
     * @param {boolean} policy.video - Whether video should be muted for new participants.
     * @returns {void}
     */
    public setStartMutedPolicy(policy: { audio: boolean; video: boolean; }): void {
        if (!this.isModerator()) {
            logger.warn(`Failed to set start muted policy, ${this.room ? '' : 'not in a room, '}${
                this.isModerator() ? '' : 'participant is not a moderator'}`);

            return;
        }

        logger.info(`Setting start muted policy: ${JSON.stringify(policy)} in presence and in conference metadata`);

        // TODO: to remove using presence for startmuted policy after old clients update to using metadata always.
        this.room.addOrReplaceInPresence('startmuted', {
            attributes: {
                audio: policy.audio,
                video: policy.video,
                xmlns: 'http://jitsi.org/jitmeet/start-muted'
            }
        }) && this.room.sendPresence();

        this.getMetadataHandler().setMetadata('startMuted', {
            audio: policy.audio,
            video: policy.video
        });
    }

    /**
     * Returns the current start muted policy.
     * @returns {Object} Object with audio and video properties indicating the start muted policy.
     * @internal
     */
    getStartMutedPolicy(): { audio: boolean; video: boolean; } {
        return this.startMutedPolicy;
    }

    /**
     * Returns measured connection times.
     * @returns {Object} The connection times for the room.
     */
    public getConnectionTimes(): object {
        return this.room.connectionTimes;
    }

    /**
     * Sets a property for the local participant.
     * @param {string} name - The name of the property.
     * @param {string} value - The value of the property.
     * @returns {void}
     */
    public setLocalParticipantProperty(name: string, value: string | string[]): void {
        this.sendCommand(`jitsi_participant_${name}`, { value });
    }

    /**
     * Removes a property for the local participant and sends the updated presence.
     * @param {string} name - The name of the property to remove.
     * @returns {void}
     */
    public removeLocalParticipantProperty(name: string): void {
        this.removeCommand(`jitsi_participant_${name}`);
        if (this.room) {
            this.room.sendPresence();
        }
    }

    /**
     * Sets the transcription language.
     * NB: Unlike _init_ here we don't check for the default value since we want to allow
     * the value to be reset.
     * @param {string} lang - The new transcription language to be used.
     * @returns {void}
     */
    public setTranscriptionLanguage(lang: string): void {
        this.setLocalParticipantProperty('transcription_language', lang);
    }

    /**
     * Gets a local participant property.
     * @param {string} name - The name of the property to retrieve.
     * @returns {string|undefined} The value of the property if it exists, otherwise undefined.
     */
    public getLocalParticipantProperty(name: string): Optional<string> {
        const property = this.room.presMap.nodes.find(prop =>
            prop.tagName === `jitsi_participant_${name}`
        );

        return property ? property.value : undefined;
    }

    /**
     * Sends feedback if enabled.
     * @param {number} overallFeedback - An integer between 1 and 5 indicating user feedback.
     * @param {string} detailedFeedback - Detailed feedback from the user (not yet used).
     * @returns {Promise} Resolves if feedback is submitted successfully.
     */
    public sendFeedback(overallFeedback: number, detailedFeedback: string): Promise<void> {
        return this.statistics.sendFeedback(overallFeedback, detailedFeedback);
    }


    /**
     * Finds the SSRC of a given track.
     * @param {JitsiTrack} track - The track to find the SSRC for.
     * @returns {Optional<number>} The SSRC of the specified track, or undefined if not found.
     */
    public getSsrcByTrack(track: JitsiTrack): Optional<number> {
        return track.isLocal() ? this.getActivePeerConnection()?.getLocalSSRC(track as JitsiLocalTrack) : track.getSsrc();
    }


    /**
     * Sends an application log (no-op since callstats is no longer supported).
     * @returns {void}
     */
    public sendApplicationLog(): void {
        // eslint-disable-next-line no-empty-function
    }

    /**
     * Checks if the user identified by given MUC JID is the conference focus.
     * @param {string} mucJid - The full MUC address of the user to check.
     * @returns {boolean|null} True if the user is the conference focus,
     * false if not, null if not in MUC or invalid JID.
     * @internal
     */
    isFocus(mucJid: string): Nullable<boolean> {
        return this.room ? this.room.isFocus(mucJid) : null;
    }

    /**
     * Sends a message via the data channel.
     * @param {string} to - The ID of the endpoint to receive the message, or empty string to broadcast.
     * @param {object} payload - The payload of the message.
     * @throws {NetworkError|InvalidStateError|Error} If the operation fails.
     * @deprecated Use 'sendMessage' instead. TODO: this should be private.
     */
    public sendEndpointMessage(to: string, payload: object): void {
        this.rtc.sendChannelMessage(to, payload);
    }

    /**
     * Sends local stats via the bridge channel to other endpoints selectively.
     * @param {Object} payload - The payload of the message.
     * @throws {NetworkError|InvalidStateError|Error} If the operation fails or no data channel exists.
     * @internal
     */
    sendEndpointStatsMessage(payload: object): void {
        this.rtc.sendEndpointStatsMessage(payload);
    }

    /**
     * Sends a broadcast message via the data channel.
     * @param {object} payload - The payload of the message.
     * @throws {NetworkError|InvalidStateError|Error} If the operation fails.
     * @deprecated Use 'sendMessage' instead. TODO: this should be private.
     */
    public broadcastEndpointMessage(payload: object): void {
        this.sendEndpointMessage('', payload);
    }

    /**
     * Sends a message to a given endpoint or broadcasts it to all endpoints.
     * @param {string|object} message - The message to send (string for chat, object for JSON).
     * @param {string} [to=''] - The ID of the recipient endpoint, or empty string to broadcast.
     * @param {boolean} [sendThroughVideobridge=false] - Whether to send through jitsi-videobridge.
     * @param {string} [replyToId] - The ID of the message being replied to.
     */
    public sendMessage(message: any, to = '', sendThroughVideobridge = false, replyToId?: string): void {
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
                this.sendPrivateTextMessage(to, messageToSend, elementName, false, replyToId);
            } else {
                // Broadcast
                this.sendTextMessage(messageToSend, elementName, replyToId);
            }
        }
    }

    /**
     * Checks if the connection is interrupted.
     * @returns {boolean} True if the connection is interrupted, false otherwise.
     */
    public isConnectionInterrupted(): boolean {
        return this.isP2PActive()
            ? this.isP2PConnectionInterrupted : this.isJvbConnectionInterrupted;
    }

    /**
     * Gets a conference property with a given key.
     *
     * @param {string} key - The key.
     * @returns {*} The value
     */
    public getProperty(key: string): any {
        return this.properties[key];
    }

    /**
     * Checks whether or not the conference is currently in the peer to peer mode.
     * Being in peer to peer mode means that the direct connection has been
     * established and the P2P connection is being used for media transmission.
     * @return {boolean} <tt>true</tt> if in P2P mode or <tt>false</tt> otherwise.
     */
    public isP2PActive(): boolean {
        return this.p2p;
    }

    /**
     * Returns the current ICE state of the P2P connection.
     * NOTE: method is used by the jitsi-meet-torture tests.
     * @return {string|null} an ICE state or <tt>null</tt> if there's currently
     * no P2P connection.
     */
    public getP2PConnectionState(): Nullable<string> {
        if (this.isP2PActive()) {
            return this.p2pJingleSession.peerconnection.getConnectionState();
        }

        return null;
    }

    /**
     * Configures the peerconnection so that a given framre rate can be achieved for desktop share.
     *
     * @param {number} maxFps The capture framerate to be used for desktop tracks.
     * @returns {boolean} true if the operation is successful, false otherwise.
     */
    public setDesktopSharingFrameRate(maxFps: number): boolean {
        if (!isValidNumber(maxFps)) {
            logger.error(`Invalid value ${maxFps} specified for desktop capture frame rate`);

            return false;
        }

        const fps = Number(maxFps);

        this._desktopSharingFrameRate = fps;

        // Set capture fps for screenshare.
        this.jvbJingleSession?.peerconnection.setDesktopSharingFrameRate(fps);

        // Set the capture rate for desktop sharing.
        this.rtc.setDesktopSharingFrameRate(fps);

        return true;
    }

    /**
     * Manually starts new P2P session (should be used only in the tests).
     * @returns {void}
     * @internal
     */
    startP2PSession(): void {
        const peers = this.getParticipants();

        // Start peer to peer session
        if (peers.length === 1) {
            const peerJid = peers[0].getJid();

            this._startP2PSession(peerJid);
        } else {
            throw new Error(
                'There must be exactly 1 participant to start the P2P session !');
        }
    }

    /**
     * Manually stops the current P2P session (should be used only in the tests).
     * @param {Object} options - Options for stopping P2P.
     * @returns {void}
     * @internal
     */
    stopP2PSession(options: {
        reason: string;
        reasonDescription: string;
        requestRestart: boolean;
    }): void {
        this._stopP2PSession(options);
    }

    /**
     * Get a summary of how long current participants have been the dominant speaker
     * @returns {{[userId: string]: SpeakerStats}} The speaker statistics.
     */
    public getSpeakerStats(): { [userId: string]: SpeakerStats; } {
        return this.speakerStatsCollector.getStats();
    }

    /**
     * Sends a face landmarks object to the xmpp server.
     * @param {IFaceLandmarksPayload} payload - The face landmarks data to send.
     * @returns {void}
     */
    public sendFaceLandmarks(payload: IFaceLandmarksPayload): void {
        if (payload.faceExpression) {
            this._xmpp.sendFaceLandmarksEvent(this.room.roomjid, payload);
        }
    }

    /**
     * Sets the constraints for the video that is requested from the bridge.
     *
     * @param {IReceiverVideoConstraints} videoConstraints The constraints which are specified in the following format. The message updates
     * the fields that are present and leaves the rest unchanged on the bridge.
     * Therefore, any field that is not applicable
     * anymore should be cleared by passing an empty object or list (whatever is applicable).
     * {
     *      'lastN': 20,
     *      'selectedSources': ['A', 'B', 'C'],
     *      'onStageSources': ['A'],
     *      'defaultConstraints': { 'maxHeight': 180 },
     *      'constraints': {
     *          'A': { 'maxHeight': 720 }
     *      }
     * }
     * Where A, B and C are source-names of the remote tracks that are being requested from the bridge.
     * @returns {void}
     */
    public setReceiverConstraints(videoConstraints: IReceiverVideoConstraints): void {
        this.qualityController.receiveVideoController.setReceiverConstraints(videoConstraints);
    }

    /**
     * Sets the assumed bandwidth bps for the video that is requested from the bridge.
     *
     * @param {Number} assumedBandwidthBps - The bandwidth value expressed in bits per second.
     * @returns {void}
     */
    public setAssumedBandwidthBps(assumedBandwidthBps: number): void {
        this.qualityController.receiveVideoController.setAssumedBandwidthBps(assumedBandwidthBps);
    }

    /**
     * Sets the maximum video size the local participant should receive from remote
     * participants.
     *
     * @param {number} maxFrameHeight - the maximum frame height, in pixels,
     * this receiver is willing to receive.
     * @returns {void}
     */
    public setReceiverVideoConstraint(maxFrameHeight: number): void {
        this.qualityController.receiveVideoController.setPreferredReceiveMaxFrameHeight(maxFrameHeight);
    }

    /**
     * Sets the maximum video size the local participant should send to remote
     * participants.
     * @param {number} maxFrameHeight - The user preferred max frame height.
     * @returns {Promise} promise that will be resolved when the operation is
     * successful and rejected otherwise.
     */
    public setSenderVideoConstraint(maxFrameHeight: number): Promise<void> {
        return this.qualityController.sendVideoController.setPreferredSendMaxFrameHeight(maxFrameHeight);
    }

    /**
     * Creates a video SIP GW session and returns it if service is enabled. Before
     * creating a session one need to check whether video SIP GW service is
     * available in the system. Even
     * if there are available nodes to serve this request, after creating the
     * session those nodes can be taken and the request about using the
     * created session can fail.
     *
     * @param {string} sipAddress - The sip address to be used.
     * @param {string} displayName - The display name to be used for this session.
     * @returns {JitsiVideoSIPGWSession|Error} Returns null if conference is not
     * initialised and there is no room.
     */
    public createVideoSIPGWSession(sipAddress: string, displayName: string): JitsiVideoSIPGWSession | Error {
        if (!this.room) {
            return new Error(VideoSIPGWConstants.ERROR_NO_CONNECTION);
        }

        return this.videoSIPGWHandler
            .createVideoSIPGWSession(sipAddress, displayName);
    }

    /**
     * Returns whether End-To-End encryption is enabled.
     *
     * @returns {boolean}
     */
    public isE2EEEnabled(): boolean {
        return Boolean(this._e2eEncryption?.isEnabled());
    }

    /**
     * Returns whether End-To-End encryption is supported. Note that not all participants
     * in the conference may support it.
     *
     * @returns {boolean}
     */
    public isE2EESupported(): boolean {
        return E2EEncryption.isSupported(this.options.config);
    }

    /**
     * Enables / disables End-to-End encryption.
     *
     * @param {boolean} enabled whether to enable E2EE or not.
     * @returns {void}
     */
    public toggleE2EE(enabled: boolean): void {
        if (!this.isE2EESupported()) {
            logger.warn('Cannot enable / disable E2EE: platform is not supported.');

            return;
        }

        this._e2eEncryption.setEnabled(enabled);
    }

    /**
     * Sets the key and index for End-to-End encryption.
     *
     * @param {CryptoKey} [keyInfo.encryptionKey] - encryption key.
     * @param {Number} [keyInfo.index] - the index of the encryption key.
     * @returns {void}
     */
    public setMediaEncryptionKey(keyInfo: CryptoKey): void {
        this._e2eEncryption.setEncryptionKey(keyInfo);
    }

    /**
     * Starts the participant verification process.
     *
     * @param {string} participantId The participant which will be marked as verified.
     * @returns {void}
     */
    public startVerification(participantId: string): void {
        const participant = this.getParticipantById(participantId);

        if (!participant) {
            return;
        }

        this._e2eEncryption.startVerification(participant);
    }

    /**
     * Marks the given participant as verified. After this is done, MAC verification will
     * be performed and an event will be emitted with the result.
     *
     * @param {string} participantId The participant which will be marked as verified.
     * @param {boolean} isVerified - whether the verification was succesfull.
     * @returns {void}
     */
    public markParticipantVerified(participantId: string, isVerified: boolean): void {
        const participant = this.getParticipantById(participantId);

        if (!participant) {
            return;
        }

        this._e2eEncryption.markParticipantVerified(participant, isVerified);
    }

    /**
     * Returns <tt>true</tt> if lobby support is enabled in the backend.
     *
     * @returns {boolean} whether lobby is supported in the backend.
     */
    public isLobbySupported(): boolean {
        return Boolean(this.room?.getLobby().isSupported());
    }

    /**
     * Returns <tt>true</tt> if the room has members only enabled.
     *
     * @returns {boolean} whether conference room is members only.
     */
    public isMembersOnly(): boolean {
        return Boolean(this.room?.membersOnlyEnabled);
    }

    /**
     * Returns <tt>true</tt> if the room supports visitors feature.
     *
     * @returns {boolean} whether conference room has visitors support.
     */
    public isVisitorsSupported(): boolean {
        return Boolean(this.room?.visitorsSupported);
    }

    /**
     * Enables lobby by moderators
     *
     * @returns {Promise} resolves when lobby room is joined or rejects with the error.
     */
    public enableLobby(): Promise<void> {
        if (this.room && this.isModerator()) {
            return this.room.getLobby().enable();
        }

        return Promise.reject(
            new Error('The conference not started or user is not moderator'));
    }

    /**
     * Disabled lobby by moderators
     *
     * @returns {void}
     */
    public disableLobby(): void {
        if (this.room && this.isModerator()) {
            this.room.getLobby().disable();
        } else {
            logger.warn(`Failed to disable lobby, ${this.room ? '' : 'not in a room, '}${
                this.isModerator() ? '' : 'participant is not a moderator'}`);
        }
    }

    /**
     * Joins the lobby room with display name and optional email or with a shared password to skip waiting.
     *
     * @param {string} displayName Display name should be set to show it to moderators.
     * @param {string} email Optional email is used to present avatar to the moderator.
     * @returns {Promise<never>}
     */
    public joinLobby(displayName: string, email: string): Promise<void> {
        if (this.room) {
            return this.room.getLobby().join(displayName, email);
        }

        return Promise.reject(new Error('The conference not started'));
    }

    /**
     * Gets the local id for a participant in a lobby room.
     * Returns undefined when current participant is not in the lobby room.
     * This is used for lobby room private chat messages.
     *
     * @returns {string}
     */
    public myLobbyUserId(): Optional<string> {
        if (this.room) {
            return this.room.getLobby().getLocalId();
        }
    }

    /**
     * Sends a message to a lobby room.
     * When id is specified it sends a private message.
     * Otherwise it sends the message to all moderators.
     * @param {object} message The message to send
     * @param {string} id The participant id.
     *
     * @returns {void}
     */
    public sendLobbyMessage(message: object, id: string): void {
        if (this.room) {
            if (id) {
                return this.room.getLobby().sendPrivateMessage(id, message);
            }

            return this.room.getLobby().sendMessage(message);
        }
    }

    /**
     * Adds a message listener to the lobby room
     * @param {Function} listener The listener function,
     * called when a new message is received in the lobby room.
     *
     * @returns {Function} Handler returned to be able to remove it later.
     */
    public addLobbyMessageListener(listener: (message: object) => void): Optional<EventListener> {
        if (this.room) {
            return this.room.getLobby().addMessageListener(listener) as Optional<EventListener>;
        }
    }

    /**
     * Removes a message handler from the lobby room
     * @param {Function} handler The handler function  to remove.
     *
     * @returns {void}
     */
    public removeLobbyMessageHandler(handler: (message: object) => void): void {
        if (this.room) {
            return this.room.getLobby().removeMessageHandler(handler);
        }
    }

    /**
     * Denies an occupant in the lobby room access to the conference.
     * @param {string} id The participant id.
     * @returns {void}
     */
    public lobbyDenyAccess(id: string): void {
        if (this.room) {
            this.room.getLobby().denyAccess(id);
        }
    }

    /**
     * Approves the request to join the conference to a participant waiting in the lobby.
     *
     * @param {string|Array<string>} param The participant id or an array of ids.
     * @returns {void}
     */
    public lobbyApproveAccess(param: string | string[]): void {
        if (this.room) {
            this.room.getLobby().approveAccess(param);
        }
    }

    /**
     * Returns <tt>true</tt> if AV Moderation support is enabled in the backend.
     *
     * @returns {boolean} whether AV Moderation is supported in the backend.
     */
    public isAVModerationSupported(): boolean {
        return Boolean(this.room?.getAVModeration().isSupported());
    }

    /**
     * Enables AV Moderation.
     * @param {MediaType} mediaType "audio", "desktop" or "video"
     * @returns {void}
     */
    public enableAVModeration(mediaType: MediaType): void {
        if (this.room && this.isModerator()
            && (mediaType === MediaType.AUDIO || mediaType === MediaType.DESKTOP || mediaType === MediaType.VIDEO)) {
            this.room.getAVModeration().enable(true, mediaType);
        } else {
            logger.warn(`Failed to enable AV moderation, ${this.room ? '' : 'not in a room, '}${
                this.isModerator() ? '' : 'participant is not a moderator, '}${
                this.room && this.isModerator() ? 'wrong media type passed' : ''}`);
        }
    }

    /**
     * Disables AV Moderation.
     * @param {MediaType} mediaType "audio", "desktop" or "video"
     * @returns {void}
     */
    public disableAVModeration(mediaType: MediaType): void {
        if (this.room && this.isModerator()
            && (mediaType === MediaType.AUDIO || mediaType === MediaType.DESKTOP || mediaType === MediaType.VIDEO)) {
            this.room.getAVModeration().enable(false, mediaType);
        } else {
            logger.warn(`Failed to disable AV moderation, ${this.room ? '' : 'not in a room, '}${
                this.isModerator() ? '' : 'participant is not a moderator, '}${
                this.room && this.isModerator() ? 'wrong media type passed' : ''}`);
        }
    }

    /**
     * Approve participant access to certain media, allows unmuting audio or video.
     *
     * @param {MediaType} mediaType "audio", "desktop" or "video"
     * @param id the id of the participant.
     * @returns {void}
     */
    public avModerationApprove(mediaType: MediaType, id: string): void {
        if (this.room && this.isModerator()
            && (mediaType === MediaType.AUDIO || mediaType === MediaType.DESKTOP || mediaType === MediaType.VIDEO)) {

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
    }

    /**
     * Reject participant access to certain media, blocks unmuting audio or video.
     *
     * @param {MediaType} mediaType "audio", "desktop" or "video"
     * @param id the id of the participant.
     * @returns {void}
     */
    public avModerationReject(mediaType: MediaType, id: string): void {
        if (this.room && this.isModerator()
            && (mediaType === MediaType.AUDIO || mediaType === MediaType.DESKTOP || mediaType === MediaType.VIDEO)) {

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
    }

    /**
     * Returns the breakout rooms manager object.
     *
     * @returns {Optional<BreakoutRooms>} the breakout rooms manager.
     */
    public getBreakoutRooms(): Optional<BreakoutRooms> {
        return this.room?.getBreakoutRooms();
    }

    /**
     * Returns the file sharing manager object.
     *
     * @returns {Optional<FileSharing>} the file sharing manager.
     */
    public getFileSharing(): Optional<FileSharing> {
        return this.room?.getFileSharing();
    }

    /**
     * Returns the metadata handler object.
     *
     * @returns {Optional<RoomMetadata>} the room metadata handler.
     */
    public getMetadataHandler(): Optional<RoomMetadata> {
        return this.room?.getMetadataHandler();
    }

    /**
     * Requests short-term credentials from the backend if available.
     * @param {string} service - The service for which to request the credentials.
     * @returns {Promise} A promise that resolves with the credentials or rejects with an error.
     */
    public getShortTermCredentials(service: string): Promise<string> {
        if (this.room) {
            return this.room.getShortTermCredentials(service);
        }

        return Promise.reject(new Error('The conference is not created yet!'));
    }

    /**
     * @internal
     * @returns {Optional<VADAudioAnalyser>} the audio analyser.
     */
    getAudioAnalyser(): Optional<VADAudioAnalyser> {
        return this?._audioAnalyser;
    }

    /**
     * @internal
     * @returns {XMPP} the XMPP connection object.
     */
    get xmpp(): XMPP {
        return this._xmpp;
    }
}
