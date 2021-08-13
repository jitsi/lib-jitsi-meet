/**
 * Instantiates a new ProxyConnectionPC and ensures only one exists at a given
 * time. Currently it assumes ProxyConnectionPC is used only for screensharing
 * and assumes IQs to be used for communication.
 */
export default class ProxyConnectionService {
    /**
     * Initializes a new {@code ProxyConnectionService} instance.
     *
     * @param {Object} options - Values to initialize the instance with.
     * @param {boolean} [options.convertVideoToDesktop] - Whether or not proxied video should be returned as a desktop
     * stream. Defaults to false.
     * @param {Object} [options.pcConfig] - The {@code RTCConfiguration} to use for the WebRTC peer connection.
     * @param {JitsiConnection} [options.jitsiConnection] - The {@code JitsiConnection} which will be used to fetch
     * TURN credentials for the P2P connection.
     * @param {Function} options.onRemoteStream - Callback to invoke when a remote video stream has been received and
     * converted to a {@code JitsiLocakTrack}. The {@code JitsiLocakTrack} will be passed in.
     * @param {Function} options.onSendMessage - Callback to invoke when a message has to be sent (signaled) out. The
     * arguments passed in are the jid to send the message to and the message.
     */
    constructor(options?: {
        convertVideoToDesktop?: boolean;
        pcConfig?: any;
        jitsiConnection?: any;
        onRemoteStream: Function;
        onSendMessage: Function;
    });
    /**
     * Holds a reference to the collection of all callbacks.
     *
     * @type {Object}
     */
    _options: any;
    /**
     * The active instance of {@code ProxyConnectionService}.
     *
     * @type {ProxyConnectionPC|null}
     */
    _peerConnection: ProxyConnectionPC | null;
    /**
     * Callback invoked when an error occurs that should cause
     * {@code ProxyConnectionPC} to be closed if the peer is currently
     * connected. Sends an error message/reply back to the peer.
     *
     * @param {string} peerJid - The peer jid with which the connection was
     * attempted or started, and to which an iq with error details should be
     * sent.
     * @param {string} errorType - The constant indicating the type of the error
     * that occured.
     * @param {string} details - Optional additional data about the error.
     * @private
     * @returns {void}
     */
    private _onFatalError;
    /**
     * Formats and forwards a message an iq to be sent to a peer jid.
     *
     * @param {string} peerJid - The jid the iq should be sent to.
     * @param {Object} iq - The iq which would be sent to the peer jid.
     * @private
     * @returns {void}
     */
    private _onSendMessage;
    /**
     * Callback invoked when the remote peer of the {@code ProxyConnectionPC}
     * has offered a media stream. The stream is converted into a
     * {@code JitsiLocalTrack} for local usage if the {@code onRemoteStream}
     * callback is defined.
     *
     * @param {JitsiRemoteTrack} jitsiRemoteTrack - The {@code JitsiRemoteTrack}
     * for the peer's media stream.
     * @private
     * @returns {void}
     */
    private _onRemoteStream;
    /**
     * Parses a message object regarding a proxy connection to create a new
     * proxy connection or update and existing connection.
     *
     * @param {Object} message - A message object regarding establishing or
     * updating a proxy connection.
     * @param {Object} message.data - An object containing additional message
     * details.
     * @param {string} message.data.iq - The stringified iq which explains how
     * and what to update regarding the proxy connection.
     * @param {string} message.from - The message sender's full jid. Used for
     * sending replies.
     * @returns {void}
     */
    processMessage(message: {
        data: {
            iq: string;
        };
        from: string;
    }): void;
    /**
     * Instantiates and initiates a proxy peer connection.
     *
     * @param {string} peerJid - The jid of the remote client that should
     * receive messages.
     * @param {Array<JitsiLocalTrack>} localTracks - Initial media tracks to
     * send through to the peer.
     * @returns {void}
     */
    start(peerJid: string, localTracks?: Array<any>): void;
    /**
     * Terminates any active proxy peer connection.
     *
     * @returns {void}
     */
    stop(): void;
    /**
     * Transforms a stringified xML into a XML wrapped in jQuery.
     *
     * @param {string} xml - The XML in string form.
     * @private
     * @returns {Object|null} A jQuery version of the xml. Null will be returned
     * if an error is encountered during transformation.
     */
    private _convertStringToXML;
    /**
     * Helper for creating an instance of {@code ProxyConnectionPC}.
     *
     * @param {string} peerJid - The jid of the remote peer with which the
     * {@code ProxyConnectionPC} will be established with.
     * @param {Object} options - Additional defaults to instantiate the
     * {@code ProxyConnectionPC} with. See the constructor of ProxyConnectionPC
     * for more details.
     * @private
     * @returns {ProxyConnectionPC}
     */
    private _createPeerConnection;
    /**
     * Invoked when preemptively closing the {@code ProxyConnectionPC}.
     *
     * @private
     * @returns {void}
     */
    private _selfCloseConnection;
}
import ProxyConnectionPC from "./ProxyConnectionPC";
