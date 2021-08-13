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
    constructor(options?: {
        pcConfig?: any;
        isInitiator?: boolean;
        onRemoteStream: Function;
        peerJid: string;
        receiveVideo?: boolean;
        onSendMessage: Function;
    });
    _options: {
        pcConfig: any;
        isInitiator: boolean;
        onRemoteStream: Function;
        peerJid: string;
        receiveVideo: boolean;
        onSendMessage: Function;
        receiveAudio: boolean;
    };
    /**
     * Instances of {@code JitsiTrack} associated with this instance of
     * {@code ProxyConnectionPC}.
     *
     * @type {Array<JitsiTrack>}
     */
    _tracks: Array<any>;
    /**
     * The active instance of {@code JingleSessionPC}.
     *
     * @type {JingleSessionPC|null}
     */
    _peerConnection: JingleSessionPC | null;
    /**
     * Invoked when a connection related issue has been encountered.
     *
     * @param {string} errorType - The constant indicating the type of the error
     * that occured.
     * @param {string} details - Optional additional data about the error.
     * @private
     * @returns {void}
     */
    private _onError;
    /**
     * Callback invoked when the peer connection has received a remote media
     * stream.
     *
     * @param {JitsiRemoteTrack} jitsiRemoteTrack - The remote media stream
     * wrapped in {@code JitsiRemoteTrack}.
     * @private
     * @returns {void}
     */
    private _onRemoteStream;
    /**
     * Callback invoked when {@code JingleSessionPC} needs to signal a message
     * out to the remote peer.
     *
     * @param {XML} iq - The message to signal out.
     * @private
     * @returns {void}
     */
    private _onSendMessage;
    /**
     * Returns the jid of the remote peer with which this peer connection should
     * be established with.
     *
     * @returns {string}
     */
    getPeerJid(): string;
    /**
     * Updates the peer connection based on the passed in jingle.
     *
     * @param {Object} $jingle - An XML jingle element, wrapped in query,
     * describing how the peer connection should be updated.
     * @returns {void}
     */
    processMessage($jingle: any): void;
    /**
     * Instantiates a peer connection and starts the offer/answer cycle to
     * establish a connection with a remote peer.
     *
     * @param {Array<JitsiLocalTrack>} localTracks - Initial local tracks to add
     * to add to the peer connection.
     * @returns {void}
     */
    start(localTracks?: Array<any>): void;
    /**
     * Begins the process of disconnecting from a remote peer and cleaning up
     * the peer connection.
     *
     * @returns {void}
     */
    stop(): void;
    /**
     * Instantiates a new {@code JingleSessionPC} by stubbing out the various
     * dependencies of {@code JingleSessionPC}.
     *
     * @private
     * @returns {JingleSessionPC}
     */
    private _createPeerConnection;
    /**
     * Create an instance of {@code RTC} as it is required for peer
     * connection creation by {@code JingleSessionPC}. An existing instance
     * of {@code RTC} from elsewhere should not be re-used because it is
     * a stateful grouping of utilities.
     */
    _rtc: RTC;
    /**
     * Callback invoked in response to an agreement to start a proxy connection.
     * The passed in jingle element should contain an SDP answer to a previously
     * sent SDP offer.
     *
     * @param {Object} $jingle - The jingle element wrapped in jQuery.
     * @private
     * @returns {void}
     */
    private _onSessionAccept;
    /**
     * Callback invoked in response to a request to start a proxy connection.
     * The passed in jingle element should contain an SDP offer.
     *
     * @param {Object} $jingle - The jingle element wrapped in jQuery.
     * @private
     * @returns {void}
     */
    private _onSessionInitiate;
    /**
     * Callback invoked in response to a request to disconnect an active proxy
     * connection. Cleans up tracks and the peer connection.
     *
     * @private
     * @returns {void}
     */
    private _onSessionTerminate;
    /**
     * Callback invoked in response to ICE candidates from the remote peer.
     * The passed in jingle element should contain an ICE candidate.
     *
     * @param {Object} $jingle - The jingle element wrapped in jQuery.
     * @private
     * @returns {void}
     */
    private _onTransportInfo;
}
import JingleSessionPC from "../xmpp/JingleSessionPC";
import RTC from "../RTC/RTC";
