/* globals $ */

import { getLogger } from '@jitsi/logger';
import { $iq } from 'strophe.js';

import { MediaType } from '../../service/RTC/MediaType';
import { VideoType } from '../../service/RTC/VideoType';
import RTC from '../RTC/RTC';

import ProxyConnectionPC from './ProxyConnectionPC';
import { ACTIONS } from './constants';

const logger = getLogger(__filename);

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
    constructor(options = {}) {
        const {
            jitsiConnection,
            ...otherOptions
        } = options;

        /**
         * Holds a reference to the collection of all callbacks.
         *
         * @type {Object}
         */
        this._options = {
            pcConfig: jitsiConnection && jitsiConnection.xmpp.connection.jingle.p2pIceConfig,
            ...otherOptions
        };

        /**
         * The active instance of {@code ProxyConnectionService}.
         *
         * @type {ProxyConnectionPC|null}
         */
        this._peerConnection = null;

        // Bind event handlers so they are only bound once for every instance.
        this._onFatalError = this._onFatalError.bind(this);
        this._onSendMessage = this._onSendMessage.bind(this);
        this._onRemoteStream = this._onRemoteStream.bind(this);
    }

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
    processMessage(message) {
        const peerJid = message.from;

        if (!peerJid) {
            return;
        }

        // If a proxy connection has already been established and messages come
        // from another peer jid then those messages should be replied to with
        // a rejection.
        if (this._peerConnection
            && this._peerConnection.getPeerJid() !== peerJid) {
            this._onFatalError(
                peerJid,
                ACTIONS.CONNECTION_ERROR,
                'rejected'
            );

            return;
        }

        const iq = this._convertStringToXML(message.data.iq);
        const $jingle = iq && iq.find('jingle');
        const action = $jingle && $jingle.attr('action');

        if (action === ACTIONS.INITIATE) {
            this._peerConnection = this._createPeerConnection(peerJid, {
                isInitiator: false,
                receiveVideo: true
            });
        }

        // Truthy check for peer connection added to protect against possibly
        // receiving actions before an ACTIONS.INITIATE.
        if (this._peerConnection) {
            this._peerConnection.processMessage($jingle);
        }

        // Take additional steps to ensure the peer connection is cleaned up
        // if it is to be closed.
        if (action === ACTIONS.CONNECTION_ERROR
            || action === ACTIONS.UNAVAILABLE
            || action === ACTIONS.TERMINATE) {
            this._selfCloseConnection();
        }

        return;
    }

    /**
     * Instantiates and initiates a proxy peer connection.
     *
     * @param {string} peerJid - The jid of the remote client that should
     * receive messages.
     * @param {Array<JitsiLocalTrack>} localTracks - Initial media tracks to
     * send through to the peer.
     * @returns {void}
     */
    start(peerJid, localTracks = []) {
        this._peerConnection = this._createPeerConnection(peerJid, {
            isInitiator: true,
            receiveVideo: false
        });

        this._peerConnection.start(localTracks);
    }

    /**
     * Terminates any active proxy peer connection.
     *
     * @returns {void}
     */
    stop() {
        if (this._peerConnection) {
            this._peerConnection.stop();
        }

        this._peerConnection = null;
    }

    /**
     * Transforms a stringified xML into a XML wrapped in jQuery.
     *
     * @param {string} xml - The XML in string form.
     * @private
     * @returns {Object|null} A jQuery version of the xml. Null will be returned
     * if an error is encountered during transformation.
     */
    _convertStringToXML(xml) {
        try {
            const xmlDom = new DOMParser().parseFromString(xml, 'text/xml');

            return $(xmlDom);
        } catch (e) {
            logger.error('Attempted to convert incorrectly formatted xml');

            return null;
        }
    }

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
    _createPeerConnection(peerJid, options = {}) {
        if (!peerJid) {
            throw new Error('Cannot create ProxyConnectionPC without a peer.');
        }

        const pcOptions = {
            pcConfig: this._options.pcConfig,
            onError: this._onFatalError,
            onRemoteStream: this._onRemoteStream,
            onSendMessage: this._onSendMessage,
            peerJid,
            ...options
        };

        return new ProxyConnectionPC(pcOptions);
    }

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
    _onFatalError(peerJid, errorType, details = '') {
        logger.error(
            'Received a proxy connection error', peerJid, errorType, details);

        const iq = $iq({
            to: peerJid,
            type: 'set'
        })
            .c('jingle', {
                xmlns: 'urn:xmpp:jingle:1',
                action: errorType
            })
            .c('details')
            .t(details)
            .up();

        this._onSendMessage(peerJid, iq);

        if (this._peerConnection
            && this._peerConnection.getPeerJid() === peerJid) {
            this._selfCloseConnection();
        }
    }

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
    _onRemoteStream(jitsiRemoteTrack) {
        if (!this._options.onRemoteStream) {
            logger.error('Remote track received without callback.');
            jitsiRemoteTrack.dispose();

            return;
        }

        const isVideo = jitsiRemoteTrack.isVideoTrack();
        let videoType;

        if (isVideo) {
            videoType = this._options.convertVideoToDesktop
                ? VideoType.DESKTOP : VideoType.CAMERA;
        }

        // Grab the webrtc media stream and pipe it through the same processing
        // that would occur for a locally obtained media stream.
        const mediaStream = jitsiRemoteTrack.getOriginalStream();
        const jitsiLocalTracks = RTC.createLocalTracks(
            [
                {
                    deviceId:
                        `proxy:${this._peerConnection.getPeerJid()}`,
                    mediaType: isVideo ? MediaType.VIDEO : MediaType.AUDIO,
                    sourceType: 'proxy',
                    stream: mediaStream,
                    track: mediaStream.getVideoTracks()[0],
                    videoType
                }
            ]);

        this._options.onRemoteStream(jitsiLocalTracks[0]);
    }

    /**
     * Formats and forwards a message an iq to be sent to a peer jid.
     *
     * @param {string} peerJid - The jid the iq should be sent to.
     * @param {Object} iq - The iq which would be sent to the peer jid.
     * @private
     * @returns {void}
     */
    _onSendMessage(peerJid, iq) {
        if (!this._options.onSendMessage) {
            return;
        }

        try {
            const stringifiedIq
                = new XMLSerializer().serializeToString(iq.nodeTree || iq);

            this._options.onSendMessage(peerJid, { iq: stringifiedIq });
        } catch (e) {
            logger.error('Attempted to send an incorrectly formatted iq.');
        }
    }

    /**
     * Invoked when preemptively closing the {@code ProxyConnectionPC}.
     *
     * @private
     * @returns {void}
     */
    _selfCloseConnection() {
        this.stop();

        this._options.onConnectionClosed
            && this._options.onConnectionClosed();
    }
}
