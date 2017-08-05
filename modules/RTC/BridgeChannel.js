import { getLogger } from 'jitsi-meet-logger';

import RTCEvents from '../../service/RTC/RTCEvents';
import GlobalOnErrorHandler from '../util/GlobalOnErrorHandler';

const logger = getLogger(__filename);

/**
 * Handles a WebRTC RTCPeerConnection or a WebSocket instance to communicate
 * with the videobridge.
 */
export default class BridgeChannel {
    /**
     * Binds "ondatachannel" event listener on the given RTCPeerConnection
     * instance, or creates a WebSocket connection with the videobridge.
     * At least one of both, peerconnection or wsUrl parameters, must be
     * given.
     * @param {RTCPeerConnection} [peerconnection] WebRTC peer connection
     * instance.
     * @param {string} [wsUrl] WebSocket URL.
     * @param {EventEmitter} eventEmitter EventEmitter instance.
     */
    constructor(peerconnection, wsUrl, emitter) {
        if (!peerconnection && !wsUrl) {
            throw new TypeError(
                'At least peerconnection or wsUrl must be given');
        } else if (peerconnection && wsUrl) {
            throw new TypeError(
                'Just one of peerconnection or wsUrl must be given');
        }

        if (peerconnection) {
            logger.debug('constructor() with peerconnection');
        } else {
            logger.debug(`constructor() with wsUrl:"${wsUrl}"`);
        }

        // The underlying WebRTC RTCDataChannel or WebSocket instance.
        // @type {RTCDataChannel|WebSocket}
        this._channel = null;

        // @type {EventEmitter}
        this._eventEmitter = emitter;

        // Whether a RTCDataChannel or WebSocket is internally used.
        // @type {string} "datachannel" / "websocket"
        this._mode = null;

        // If a RTCPeerConnection is given, listen for new RTCDataChannel
        // event.
        if (peerconnection) {
            peerconnection.ondatachannel = event => {
                // NOTE: We assume that the "onDataChannel" event just fires
                // once.

                const datachannel = event.channel;

                // Handle the RTCDataChannel.
                this._handleChannel(datachannel);
                this._mode = 'datachannel';
            };

        // Otherwise create a WebSocket connection.
        } else if (wsUrl) {
            // Create a WebSocket instance.
            const ws = new WebSocket(wsUrl);

            // Handle the WebSocket.
            this._handleChannel(ws);
            this._mode = 'websocket';
        }
    }

    /**
     * The channel mode.
     * @return {string} "datachannel" or "websocket" (or null if not yet set).
     */
    get mode() {
        return this._mode;
    }

    /**
     * Closes the currently opened channel.
     */
    close() {
        if (this._channel) {
            try {
                this._channel.close();
            } catch (error) {} // eslint-disable-line no-empty

            this._channel = null;
        }
    }

    /**
     * Whether there is an underlying RTCDataChannel or WebSocket and it's
     * open.
     * @return {boolean}
     */
    isOpen() {
        return this._channel && (this._channel.readyState === 'open'
            || this._channel.readyState === WebSocket.OPEN);
    }

    /**
     * Sends message via the channel.
     * @param {string} to The id of the endpoint that should receive the
     * message. If "" the message will be sent to all participants.
     * @param  {object} payload The payload of the message.
     * @throws NetworkError or InvalidStateError from RTCDataChannel#send (@see
     * {@link https://developer.mozilla.org/docs/Web/API/RTCDataChannel/send})
     * or from WebSocket#send or Error with "No opened channel" message.
     */
    sendMessage(to, payload) {
        this._send({
            colibriClass: 'EndpointMessage',
            msgPayload: payload,
            to
        });
    }

    /**
     * Sends a "lastN value changed" message via the channel.
     * @param {number} value The new value for lastN. -1 means unlimited.
     */
    sendSetLastNMessage(value) {
        const jsonObject = {
            colibriClass: 'LastNChangedEvent',
            lastN: value
        };

        this._send(jsonObject);
        logger.log(`Channel lastN set to: ${value}`);
    }

    /**
     * Sends a "pinned endpoint changed" message via the channel.
     * @param {string} endpointId The id of the pinned endpoint.
     * @throws NetworkError or InvalidStateError from RTCDataChannel#send (@see
     * {@link https://developer.mozilla.org/docs/Web/API/RTCDataChannel/send})
     * or from WebSocket#send or Error with "No opened channel" message.
     */
    sendPinnedEndpointMessage(endpointId) {
        logger.log(
            'sending pinned changed notification to the bridge for endpoint ',
            endpointId);

        this._send({
            colibriClass: 'PinnedEndpointChangedEvent',
            pinnedEndpoint: endpointId || null
        });
    }

    /**
     * Sends a "selected endpoint changed" message via the channel.
     * @param {string} endpointId The id of the selected endpoint.
     * @throws NetworkError or InvalidStateError from RTCDataChannel#send (@see
     * {@link https://developer.mozilla.org/docs/Web/API/RTCDataChannel/send})
     * or from WebSocket#send or Error with "No opened channel" message.
     */
    sendSelectedEndpointMessage(endpointId) {
        logger.log(
            'sending selected changed notification to the bridge for endpoint ',
            endpointId);

        this._send({
            colibriClass: 'SelectedEndpointChangedEvent',
            selectedEndpoint: endpointId || null
        });
    }

    /**
     * Sends a "receiver video constraint" message via the channel.
     * @param {Number} maxFrameHeightPixels the maximum frame height,
     * in pixels, this receiver is willing to receive
     */
    sendReceiverVideoConstraintMessage(maxFrameHeightPixels) {
        logger.log('sending a ReceiverVideoConstraint message with '
            + `a maxFrameHeight of ${maxFrameHeightPixels} pixels`);
        this._send({
            colibriClass: 'ReceiverVideoConstraint',
            maxFrameHeight: maxFrameHeightPixels
        });
    }

    /**
     * Set events on the given RTCDataChannel or WebSocket instance.
     */
    _handleChannel(channel) {
        const emitter = this._eventEmitter;

        channel.onopen = () => {
            logger.info(`${this._mode} channel opened`);

            // Code sample for sending string and/or binary data.
            // Sends string message to the bridge:
            //     channel.send("Hello bridge!");
            // Sends 12 bytes binary message to the bridge:
            //     channel.send(new ArrayBuffer(12));

            emitter.emit(RTCEvents.DATA_CHANNEL_OPEN);
        };

        channel.onerror = error => {
            logger.error('Channel error:', error);
        };

        channel.onmessage = ({ data }) => {
            // JSON object.
            let obj;

            try {
                obj = JSON.parse(data);
            } catch (error) {
                GlobalOnErrorHandler.callErrorHandler(error);
                logger.error(
                    'Failed to parse channel message as JSON: ',
                    data, error);

                return;
            }

            const colibriClass = obj.colibriClass;

            switch (colibriClass) {
            case 'DominantSpeakerEndpointChangeEvent': {
                // Endpoint ID from the Videobridge.
                const dominantSpeakerEndpoint = obj.dominantSpeakerEndpoint;

                logger.info(
                    'Channel new dominant speaker event: ',
                    dominantSpeakerEndpoint);
                emitter.emit(
                    RTCEvents.DOMINANT_SPEAKER_CHANGED,
                    dominantSpeakerEndpoint);
                break;
            }
            case 'EndpointConnectivityStatusChangeEvent': {
                const endpoint = obj.endpoint;
                const isActive = obj.active === 'true';

                logger.info(
                    `Endpoint connection status changed: ${endpoint} active ? ${
                        isActive}`);
                emitter.emit(RTCEvents.ENDPOINT_CONN_STATUS_CHANGED,
                    endpoint, isActive);

                break;
            }
            case 'EndpointMessage': {
                emitter.emit(
                    RTCEvents.ENDPOINT_MESSAGE_RECEIVED, obj.from,
                    obj.msgPayload);

                break;
            }
            case 'LastNEndpointsChangeEvent': {
                // The new/latest list of last-n endpoint IDs.
                const lastNEndpoints = obj.lastNEndpoints;

                logger.info('Channel new last-n event: ',
                    lastNEndpoints, obj);
                emitter.emit(RTCEvents.LASTN_ENDPOINT_CHANGED,
                    lastNEndpoints, obj);

                break;
            }
            default: {
                logger.debug('Channel JSON-formatted message: ', obj);

                // The received message appears to be appropriately formatted
                // (i.e. is a JSON object which assigns a value to the
                // mandatory property colibriClass) so don't just swallow it,
                // expose it to public consumption.
                emitter.emit(`rtc.datachannel.${colibriClass}`, obj);
            }
            }
        };

        channel.onclose = () => {
            logger.info('Channel closed');

            // Remove the channel.
            this._channel = null;
        };

        // Store the channel.
        this._channel = channel;
    }

    /**
     * Sends passed object via the channel.
     * @param {object} jsonObject The object that will be sent.
     * @throws NetworkError or InvalidStateError from RTCDataChannel#send (@see
     * {@link https://developer.mozilla.org/docs/Web/API/RTCDataChannel/send})
     * or from WebSocket#send or Error with "No opened channel" message.
     */
    _send(jsonObject) {
        const channel = this._channel;

        if (!this.isOpen()) {
            throw new Error('No opened channel');
        }

        channel.send(JSON.stringify(jsonObject));
    }
}
