import { getLogger } from 'jitsi-meet-logger';

import RTCEvents from '../../service/RTC/RTCEvents';
import { createBridgeChannelClosedEvent } from '../../service/statistics/AnalyticsEvents';
import Statistics from '../statistics/statistics';
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
     * @param {EventEmitter} emitter the EventEmitter instance to use for event emission.
     */
    constructor(peerconnection, wsUrl, emitter) {
        if (!peerconnection && !wsUrl) {
            throw new TypeError('At least peerconnection or wsUrl must be given');
        } else if (peerconnection && wsUrl) {
            throw new TypeError('Just one of peerconnection or wsUrl must be given');
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

        // Indicates whether the connection retries are enabled or not.
        this._areRetriesEnabled = false;

        // Indicates whether the connection was closed from the client or not.
        this._closedFromClient = false;

        // If a RTCPeerConnection is given, listen for new RTCDataChannel
        // event.
        if (peerconnection) {
            const datachannel
                = peerconnection.createDataChannel(
                    'JVB data channel', {
                        protocol: 'http://jitsi.org/protocols/colibri'
                    });

            // Handle the RTCDataChannel.
            this._handleChannel(datachannel);
            this._mode = 'datachannel';

        // Otherwise create a WebSocket connection.
        } else if (wsUrl) {
            this._areRetriesEnabled = true;
            this._wsUrl = wsUrl;
            this._initWebSocket();
        }
    }

    /**
     * Initializes the web socket channel.
     *
     * @returns {void}
     */
    _initWebSocket() {
        // Create a WebSocket instance.
        const ws = new WebSocket(this._wsUrl);

        // Handle the WebSocket.
        this._handleChannel(ws);
        this._mode = 'websocket';
    }

    /**
     * Starts the websocket connection retries.
     *
     * @returns {void}
     */
    _startConnectionRetries() {
        let timeoutS = 1;

        const reload = () => {
            if (this.isOpen()) {
                return;
            }
            this._initWebSocket(this._wsUrl);
            timeoutS = Math.min(timeoutS * 2, 60);
            this._retryTimeout = setTimeout(reload, timeoutS * 1000);
        };

        this._retryTimeout = setTimeout(reload, timeoutS * 1000);
    }

    /**
     * Stops the websocket connection retries.
     *
     * @returns {void}
     */
    _stopConnectionRetries() {
        if (this._retryTimeout) {
            clearTimeout(this._retryTimeout);
            this._retryTimeout = undefined;
        }
    }

    /**
     * Retries to establish the websocket connection after the connection was closed by the server.
     *
     * @param {CloseEvent} closeEvent - The close event that triggered the retries.
     * @returns {void}
     */
    _retryWebSocketConnection(closeEvent) {
        if (!this._areRetriesEnabled) {
            return;
        }
        const { code, reason } = closeEvent;

        Statistics.sendAnalytics(createBridgeChannelClosedEvent(code, reason));
        this._areRetriesEnabled = false;
        this._eventEmitter.once(RTCEvents.DATA_CHANNEL_OPEN, () => {
            this._stopConnectionRetries();
            this._areRetriesEnabled = true;
        });
        this._startConnectionRetries();
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
        this._closedFromClient = true;
        this._stopConnectionRetries();
        this._areRetriesEnabled = false;
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
        logger.log(`Sending lastN=${value}.`);

        this._send({
            colibriClass: 'LastNChangedEvent',
            lastN: value
        });
    }

    /**
     * Sends a "selected endpoints changed" message via the channel.
     *
     * @param {Array<string>} endpointIds - The ids of the selected endpoints.
     * @throws NetworkError or InvalidStateError from RTCDataChannel#send (@see
     * {@link https://developer.mozilla.org/docs/Web/API/RTCDataChannel/send})
     * or from WebSocket#send or Error with "No opened channel" message.
     */
    sendSelectedEndpointsMessage(endpointIds) {
        logger.log(`Sending selected endpoints: ${endpointIds}.`);

        this._send({
            colibriClass: 'SelectedEndpointsChangedEvent',
            selectedEndpoints: endpointIds
        });
    }

    /**
     * Sends a "receiver video constraint" message via the channel.
     * @param {Number} maxFrameHeightPixels the maximum frame height,
     * in pixels, this receiver is willing to receive
     */
    sendReceiverVideoConstraintMessage(maxFrameHeightPixels) {
        logger.log(`Sending ReceiverVideoConstraint with maxFrameHeight=${maxFrameHeightPixels}px`);
        this._send({
            colibriClass: 'ReceiverVideoConstraint',
            maxFrameHeight: maxFrameHeightPixels
        });
    }

    /**
     * Sends a 'ReceiverVideoConstraints' message via the bridge channel.
     *
     * @param {ReceiverVideoConstraints} constraints video constraints.
     */
    sendNewReceiverVideoConstraintsMessage(constraints) {
        logger.log(`Sending ReceiverVideoConstraints with ${JSON.stringify(constraints)}`);
        this._send({
            colibriClass: 'ReceiverVideoConstraints',
            ...constraints
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

        channel.onerror = event => {
            // WS error events contain no information about the failure (this is available in the onclose event) and
            // the event references the WS object itself, which causes hangs on mobile.
            if (this._mode !== 'websocket') {
                logger.error(`Channel error: ${event.message}`);
            }
        };

        channel.onmessage = ({ data }) => {
            // JSON object.
            let obj;

            try {
                obj = JSON.parse(data);
            } catch (error) {
                GlobalOnErrorHandler.callErrorHandler(error);
                logger.error('Failed to parse channel message as JSON: ', data, error);

                return;
            }

            const colibriClass = obj.colibriClass;

            switch (colibriClass) {
            case 'DominantSpeakerEndpointChangeEvent': {
                const { dominantSpeakerEndpoint, previousSpeakers = [] } = obj;

                logger.debug(`Dominant speaker: ${dominantSpeakerEndpoint}, previous speakers: ${previousSpeakers}`);
                emitter.emit(RTCEvents.DOMINANT_SPEAKER_CHANGED, dominantSpeakerEndpoint, previousSpeakers);
                break;
            }
            case 'EndpointConnectivityStatusChangeEvent': {
                const endpoint = obj.endpoint;
                const isActive = obj.active === 'true';

                logger.info(`Endpoint connection status changed: ${endpoint} active=${isActive}`);
                emitter.emit(RTCEvents.ENDPOINT_CONN_STATUS_CHANGED, endpoint, isActive);

                break;
            }
            case 'EndpointMessage': {
                emitter.emit(RTCEvents.ENDPOINT_MESSAGE_RECEIVED, obj.from, obj.msgPayload);

                break;
            }
            case 'LastNEndpointsChangeEvent': {
                // The new/latest list of last-n endpoint IDs (i.e. endpoints for which the bridge is sending video).
                const lastNEndpoints = obj.lastNEndpoints;

                logger.info(`New forwarded endpoints: ${lastNEndpoints}`);
                emitter.emit(RTCEvents.LASTN_ENDPOINT_CHANGED, lastNEndpoints);

                break;
            }
            case 'SenderVideoConstraints': {
                const videoConstraints = obj.videoConstraints;

                if (videoConstraints) {
                    logger.info(`SenderVideoConstraints: ${JSON.stringify(videoConstraints)}`);
                    emitter.emit(RTCEvents.SENDER_VIDEO_CONSTRAINTS_CHANGED, videoConstraints);
                }
                break;
            }
            case 'ServerHello': {
                logger.info(`Received ServerHello, version=${obj.version}.`);
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

        channel.onclose = event => {
            logger.info(`Channel closed by ${this._closedFromClient ? 'client' : 'server'}`);

            if (this._mode === 'websocket') {
                if (!this._closedFromClient) {
                    logger.error(`Channel closed: ${event.code} ${event.reason}`);
                    this._retryWebSocketConnection(event);
                }
            }

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
            logger.error('Bridge Channel send: no opened channel.');
            throw new Error('No opened channel');
        }

        channel.send(JSON.stringify(jsonObject));
    }
}
