import { getLogger } from '@jitsi/logger';

import RTCEvents from '../../service/RTC/RTCEvents';
import { XMPPEvents } from '../../service/xmpp/XMPPEvents';
import RTC from '../RTC/RTC';
import JingleSessionPC from '../xmpp/JingleSessionPC';
import SignalingLayerImpl from '../xmpp/SignalingLayerImpl';
import { DEFAULT_STUN_SERVERS } from '../xmpp/xmpp';

import { ACTIONS } from './constants';

const logger = getLogger(__filename);

/**
 * An adapter around {@code JingleSessionPC} so its logic can be re-used without
 * an XMPP connection. It is being re-used for consistency with the rest of the
 * codebase and to leverage existing peer connection event handling. Also
 * this class provides a facade to hide most of the API for
 * {@code JingleSessionPC}.
 */
export default class ProxyConnectionPC {
    /**
     * Initializes a new {@code ProxyConnectionPC} instance.
     *
     * @param {Object} options - Values to initialize the instance with.
     * @param {Object} [options.pcConfig] - The {@code RTCConfiguration} to use for the WebRTC peer connection.
     * @param {boolean} [options.isInitiator] - If true, the local client should send offers. If false, the local
     * client should send answers. Defaults to false.
     * @param {Function} options.onRemoteStream - Callback to invoke when a remote media stream has been received
     * through the peer connection.
     * @param {string} options.peerJid - The jid of the remote client with which the peer connection is being establish
     * and which should receive direct messages regarding peer connection updates.
     * @param {boolean} [options.receiveVideo] - Whether or not the peer connection should accept incoming video
     * streams. Defaults to false.
     * @param {Function} options.onSendMessage - Callback to invoke when a message has to be sent (signaled) out.
     */
    constructor(options = {}) {
        this._options = {
            pcConfig: {},
            isInitiator: false,
            receiveAudio: false,
            receiveVideo: false,
            ...options
        };

        /**
         * Instances of {@code JitsiTrack} associated with this instance of
         * {@code ProxyConnectionPC}.
         *
         * @type {Array<JitsiTrack>}
         */
        this._tracks = [];

        /**
         * The active instance of {@code JingleSessionPC}.
         *
         * @type {JingleSessionPC|null}
         */
        this._peerConnection = null;

        // Bind event handlers so they are only bound once for every instance.
        this._onError = this._onError.bind(this);
        this._onRemoteStream = this._onRemoteStream.bind(this);
        this._onSendMessage = this._onSendMessage.bind(this);
    }

    /**
     * Returns the jid of the remote peer with which this peer connection should
     * be established with.
     *
     * @returns {string}
     */
    getPeerJid() {
        return this._options.peerJid;
    }

    /**
     * Updates the peer connection based on the passed in jingle.
     *
     * @param {Object} $jingle - An XML jingle element, wrapped in query,
     * describing how the peer connection should be updated.
     * @returns {void}
     */
    processMessage($jingle) {
        switch ($jingle.attr('action')) {
        case ACTIONS.ACCEPT:
            this._onSessionAccept($jingle);
            break;

        case ACTIONS.INITIATE:
            this._onSessionInitiate($jingle);
            break;

        case ACTIONS.TERMINATE:
            this._onSessionTerminate($jingle);
            break;

        case ACTIONS.TRANSPORT_INFO:
            this._onTransportInfo($jingle);
            break;
        }
    }

    /**
     * Instantiates a peer connection and starts the offer/answer cycle to
     * establish a connection with a remote peer.
     *
     * @param {Array<JitsiLocalTrack>} localTracks - Initial local tracks to add
     * to add to the peer connection.
     * @returns {void}
     */
    start(localTracks = []) {
        if (this._peerConnection) {
            return;
        }

        this._tracks = this._tracks.concat(localTracks);

        this._peerConnection = this._createPeerConnection();

        this._peerConnection.invite(localTracks);
    }

    /**
     * Begins the process of disconnecting from a remote peer and cleaning up
     * the peer connection.
     *
     * @returns {void}
     */
    stop() {
        if (this._peerConnection) {
            this._peerConnection.terminate();
        }

        this._onSessionTerminate();
    }

    /**
     * Instantiates a new {@code JingleSessionPC} by stubbing out the various
     * dependencies of {@code JingleSessionPC}.
     *
     * @private
     * @returns {JingleSessionPC}
     */
    _createPeerConnection() {
        /**
         * {@code JingleSessionPC} takes in the entire jitsi-meet config.js
         * object, which may not be accessible from the caller.
         *
         * @type {Object}
         */
        const configStub = {};

        /**
         * {@code JingleSessionPC} assumes an XMPP/Strophe connection object is
         * passed through, which also has the jingle plugin initialized on it.
         * This connection object is used to signal out peer connection updates
         * via iqs, and those updates need to be piped back out to the remote
         * peer.
         *
         * @type {Object}
         */
        const connectionStub = {
            // At the time this is used for Spot and it's okay to say the connection is always connected, because if
            // spot has no signalling it will not be in a meeting where this is used.
            connected: true,
            jingle: {
                terminate: () => { /** no-op */ }
            },
            sendIQ: this._onSendMessage,

            // Returns empty function, because it does not add any listeners for real
            // eslint-disable-next-line no-empty-function
            addEventListener: () => () => { }
        };

        /**
         * {@code JingleSessionPC} can take in a custom ice configuration,
         * depending on the peer connection type, peer-to-peer or other.
         * However, {@code ProxyConnectionPC} always assume a peer-to-peer
         * connection so the ice configuration is hard-coded with defaults.
         *
         * @type {Object}
         */
        const pcConfigStub = {
            iceServers: DEFAULT_STUN_SERVERS,
            ...this._options.pcConfig
        };

        /**
         * {@code JingleSessionPC} expects an instance of
         * {@code JitsiConference}, which has an event emitter that is used
         * to signal various connection updates that the local client should
         * act upon. The conference instance is not a dependency of a proxy
         * connection, but the emitted events can be relevant to the proxy
         * connection so the event emitter is stubbed.
         *
         * @param {string} event - The constant for the event type.
         * @type {Function}
         * @returns {void}
         */
        const emitter = event => {
            switch (event) {
            case XMPPEvents.CONNECTION_ICE_FAILED:
            case XMPPEvents.CONNECTION_FAILED:
                this._onError(ACTIONS.CONNECTION_ERROR, event);
                break;
            }
        };

        /**
         * {@link JingleSessionPC} expects an instance of
         * {@link ChatRoom} to be passed in. {@link ProxyConnectionPC}
         * is instantiated outside of the {@code JitsiConference}, so it must be
         * stubbed to prevent errors.
         *
         * @type {Object}
         */
        const roomStub = {
            addPresenceListener: () => { /** no-op */ },
            connectionTimes: [],
            eventEmitter: { emit: emitter },
            getMediaPresenceInfo: () => {
                // Errors occur if this function does not return an object

                return {};
            },
            removePresenceListener: () => { /** no-op */ },
            supportsRestartByTerminate: () => false
        };

        /**
         * A {@code JitsiConference} stub passed to the {@link RTC} module.
         * @type {Object}
         */
        const conferenceStub = {
            myUserId: () => ''
        };

        /**
         * Create an instance of {@code RTC} as it is required for peer
         * connection creation by {@code JingleSessionPC}. An existing instance
         * of {@code RTC} from elsewhere should not be re-used because it is
         * a stateful grouping of utilities.
         */
        this._rtc = new RTC(conferenceStub, {});

        /**
         * Add the remote track listener here as {@code JingleSessionPC} has
         * {@code TraceablePeerConnection} which uses {@code RTC}'s event
         * emitter.
         */
        this._rtc.addListener(
            RTCEvents.REMOTE_TRACK_ADDED,
            this._onRemoteStream
        );

        const peerConnection = new JingleSessionPC(
            undefined, // sid
            undefined, // localJid
            this._options.peerJid, // remoteJid
            connectionStub, // connection
            {
                offerToReceiveAudio: this._options.receiveAudio,
                offerToReceiveVideo: this._options.receiveVideo
            }, // mediaConstraints
            pcConfigStub, // pcConfig
            true, // isP2P
            this._options.isInitiator // isInitiator
        );

        const signalingLayer = new SignalingLayerImpl();

        signalingLayer.setChatRoom(roomStub);

        /**
         * An additional initialize call is necessary to properly set instance
         * variable for calling.
         */
        peerConnection.initialize(roomStub, this._rtc, signalingLayer, configStub);

        return peerConnection;
    }

    /**
     * Invoked when a connection related issue has been encountered.
     *
     * @param {string} errorType - The constant indicating the type of the error
     * that occured.
     * @param {string} details - Optional additional data about the error.
     * @private
     * @returns {void}
     */
    _onError(errorType, details = '') {
        this._options.onError(this._options.peerJid, errorType, details);
    }

    /**
     * Callback invoked when the peer connection has received a remote media
     * stream.
     *
     * @param {JitsiRemoteTrack} jitsiRemoteTrack - The remote media stream
     * wrapped in {@code JitsiRemoteTrack}.
     * @private
     * @returns {void}
     */
    _onRemoteStream(jitsiRemoteTrack) {
        this._tracks.push(jitsiRemoteTrack);

        this._options.onRemoteStream(jitsiRemoteTrack);
    }

    /**
     * Callback invoked when {@code JingleSessionPC} needs to signal a message
     * out to the remote peer.
     *
     * @param {XML} iq - The message to signal out.
     * @private
     * @returns {void}
     */
    _onSendMessage(iq) {
        this._options.onSendMessage(this._options.peerJid, iq);
    }

    /**
     * Callback invoked in response to an agreement to start a proxy connection.
     * The passed in jingle element should contain an SDP answer to a previously
     * sent SDP offer.
     *
     * @param {Object} $jingle - The jingle element wrapped in jQuery.
     * @private
     * @returns {void}
     */
    _onSessionAccept($jingle) {
        if (!this._peerConnection) {
            logger.error('Received an answer when no peer connection exists.');

            return;
        }

        this._peerConnection.setAnswer($jingle);
    }

    /**
     * Callback invoked in response to a request to start a proxy connection.
     * The passed in jingle element should contain an SDP offer.
     *
     * @param {Object} $jingle - The jingle element wrapped in jQuery.
     * @private
     * @returns {void}
     */
    _onSessionInitiate($jingle) {
        if (this._peerConnection) {
            logger.error('Received an offer when an offer was already sent.');

            return;
        }

        this._peerConnection = this._createPeerConnection();

        this._peerConnection.acceptOffer(
            $jingle,
            () => { /** no-op */ },
            () => this._onError(
                this._options.peerJid,
                ACTIONS.CONNECTION_ERROR,
                'session initiate error'
            )
        );
    }

    /**
     * Callback invoked in response to a request to disconnect an active proxy
     * connection. Cleans up tracks and the peer connection.
     *
     * @private
     * @returns {void}
     */
    _onSessionTerminate() {
        this._tracks.forEach(track => track.dispose());
        this._tracks = [];

        if (this._peerConnection) {
            this._peerConnection.onTerminated();
        }

        if (this._rtc) {
            this._rtc.removeListener(
                RTCEvents.REMOTE_TRACK_ADDED,
                this._onRemoteStream
            );

            this._rtc.destroy();
        }
    }

    /**
     * Callback invoked in response to ICE candidates from the remote peer.
     * The passed in jingle element should contain an ICE candidate.
     *
     * @param {Object} $jingle - The jingle element wrapped in jQuery.
     * @private
     * @returns {void}
     */
    _onTransportInfo($jingle) {
        this._peerConnection.addIceCandidates($jingle);
    }
}
