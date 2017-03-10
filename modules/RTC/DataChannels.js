// cache datachannels to avoid garbage collection
// https://code.google.com/p/chromium/issues/detail?id=405545

const logger = require('jitsi-meet-logger').getLogger(__filename);
const RTCEvents = require('../../service/RTC/RTCEvents');
const GlobalOnErrorHandler = require('../util/GlobalOnErrorHandler');

/**
 * Binds "ondatachannel" event listener to given PeerConnection instance.
 * @param peerConnection WebRTC peer connection instance.
 */
function DataChannels(peerConnection, emitter) {
    peerConnection.ondatachannel = this.onDataChannel.bind(this);
    this.eventEmitter = emitter;

    this._dataChannels = [];

    // Sample code for opening new data channel from Jitsi Meet to the bridge.
    // Although it's not a requirement to open separate channels from both bridge
    // and peer as single channel can be used for sending and receiving data.
    // So either channel opened by the bridge or the one opened here is enough
    // for communication with the bridge.
    /* var dataChannelOptions =
     {
     reliable: true
     };
     var dataChannel
     = peerConnection.createDataChannel("myChannel", dataChannelOptions);

     // Can be used only when is in open state
     dataChannel.onopen = function ()
     {
     dataChannel.send("My channel !!!");
     };
     dataChannel.onmessage = function (event)
     {
     var msgData = event.data;
     logger.info("Got My Data Channel Message:", msgData, dataChannel);
     };*/
}

/**
 * Callback triggered by PeerConnection when new data channel is opened
 * on the bridge.
 * @param event the event info object.
 */
DataChannels.prototype.onDataChannel = function(event) {
    const dataChannel = event.channel;
    const self = this;

    dataChannel.onopen = function() {
        logger.info('Data channel opened by the Videobridge!', dataChannel);

        // Code sample for sending string and/or binary data
        // Sends String message to the bridge
        // dataChannel.send("Hello bridge!");
        // Sends 12 bytes binary message to the bridge
        // dataChannel.send(new ArrayBuffer(12));

        self.eventEmitter.emit(RTCEvents.DATA_CHANNEL_OPEN);
    };

    dataChannel.onerror = function(error) {
        // FIXME: this one seems to be generated a bit too often right now
        // so we are temporarily commenting it before we have more clarity
        // on which of the errors we absolutely need to report
        // GlobalOnErrorHandler.callErrorHandler(
        //        new Error("Data Channel Error:" + error));
        logger.error('Data Channel Error:', error, dataChannel);
    };

    dataChannel.onmessage = function(event) {
        const data = event.data;
        // JSON
        let obj;

        try {
            obj = JSON.parse(data);
        } catch (e) {
            GlobalOnErrorHandler.callErrorHandler(e);
            logger.error(
                'Failed to parse data channel message as JSON: ',
                data,
                dataChannel,
                e);
        }
        if (('undefined' !== typeof obj) && (null !== obj)) {
            const colibriClass = obj.colibriClass;

            if ('DominantSpeakerEndpointChangeEvent' === colibriClass) {
                // Endpoint ID from the Videobridge.
                const dominantSpeakerEndpoint = obj.dominantSpeakerEndpoint;

                logger.info(
                    'Data channel new dominant speaker event: ',
                    dominantSpeakerEndpoint);
                self.eventEmitter.emit(RTCEvents.DOMINANT_SPEAKER_CHANGED,
                  dominantSpeakerEndpoint);
            } else if ('InLastNChangeEvent' === colibriClass) {
                let oldValue = obj.oldValue;
                let newValue = obj.newValue;

                // Make sure that oldValue and newValue are of type boolean.
                let type;

                if ((type = typeof oldValue) !== 'boolean') {
                    if (type === 'string') {
                        oldValue = oldValue == 'true';
                    } else {
                        oldValue = new Boolean(oldValue).valueOf();
                    }
                }
                if ((type = typeof newValue) !== 'boolean') {
                    if (type === 'string') {
                        newValue = newValue == 'true';
                    } else {
                        newValue = new Boolean(newValue).valueOf();
                    }
                }

                self.eventEmitter.emit(RTCEvents.LASTN_CHANGED, oldValue, newValue);
            } else if ('LastNEndpointsChangeEvent' === colibriClass) {
                // The new/latest list of last-n endpoint IDs.
                const lastNEndpoints = obj.lastNEndpoints;
                // The list of endpoint IDs which are entering the list of
                // last-n at this time i.e. were not in the old list of last-n
                // endpoint IDs.
                const endpointsEnteringLastN = obj.endpointsEnteringLastN;

                logger.info(
                    'Data channel new last-n event: ',
                    lastNEndpoints, endpointsEnteringLastN, obj);
                self.eventEmitter.emit(RTCEvents.LASTN_ENDPOINT_CHANGED,
                    lastNEndpoints, endpointsEnteringLastN, obj);
            } else if('EndpointMessage' === colibriClass) {
                self.eventEmitter.emit(
                    RTCEvents.ENDPOINT_MESSAGE_RECEIVED, obj.from,
                    obj.msgPayload);
            } else if ('EndpointConnectivityStatusChangeEvent' === colibriClass) {
                const endpoint = obj.endpoint;
                const isActive = obj.active === 'true';
                logger.info(
                    `Endpoint connection status changed: ${endpoint} active ? ${
                        isActive}`);
                self.eventEmitter.emit(RTCEvents.ENDPOINT_CONN_STATUS_CHANGED,
                    endpoint, isActive);
            } else {
                logger.debug('Data channel JSON-formatted message: ', obj);
                // The received message appears to be appropriately formatted
                // (i.e. is a JSON object which assigns a value to the mandatory
                // property colibriClass) so don't just swallow it, expose it to
                // public consumption.
                self.eventEmitter.emit(`rtc.datachannel.${colibriClass}`, obj);
            }
        }
    };

    dataChannel.onclose = function() {
        logger.info('The Data Channel closed', dataChannel);
        const idx = self._dataChannels.indexOf(dataChannel);
        if (idx > -1) {
            self._dataChannels = self._dataChannels.splice(idx, 1);
        }
    };
    this._dataChannels.push(dataChannel);
};

/**
 * Closes all currently opened data channels.
 */
DataChannels.prototype.closeAllChannels = function() {
    this._dataChannels.forEach(dc => {
        // the DC will be removed from the array on 'onclose' event
        dc.close();
    });
};

/**
 * Sends a "selected endpoint changed" message via the data channel.
 * @param endpointId {string} the id of the selected endpoint
 * @throws NetworkError or InvalidStateError from RTCDataChannel#send (@see
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/send})
 * or Error with "No opened data channels found!" message.
 */
DataChannels.prototype.sendSelectedEndpointMessage = function(endpointId) {
    this._onXXXEndpointChanged('selected', endpointId);
};

/**
 * Sends a "pinned endpoint changed" message via the data channel.
 * @param endpointId {string} the id of the pinned endpoint
 * @throws NetworkError or InvalidStateError from RTCDataChannel#send (@see
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/send})
 * or Error with "No opened data channels found!" message.
 */
DataChannels.prototype.sendPinnedEndpointMessage = function(endpointId) {
    this._onXXXEndpointChanged('pinned', endpointId);
};

/**
 * Notifies Videobridge about a change in the value of a specific
 * endpoint-related property such as selected endpoint and pinned endpoint.
 *
 * @param xxx the name of the endpoint-related property whose value changed
 * @param userResource the new value of the endpoint-related property after the
 * change
 * @throws NetworkError or InvalidStateError from RTCDataChannel#send (@see
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/send})
 * or Error with "No opened data channels found!" message.
 */
DataChannels.prototype._onXXXEndpointChanged = function(xxx, userResource) {
    // Derive the correct words from xxx such as selected and Selected, pinned
    // and Pinned.
    const head = xxx.charAt(0);
    const tail = xxx.substring(1);
    const lower = head.toLowerCase() + tail;
    const upper = head.toUpperCase() + tail;
    logger.log(
            `sending ${lower} endpoint changed notification to the bridge: `,
            userResource);

    const jsonObject = {};

    jsonObject.colibriClass = `${upper}EndpointChangedEvent`;
    jsonObject[`${lower}Endpoint`]
        = userResource ? userResource : null;

    this.send(jsonObject);

    // Notify Videobridge about the specified endpoint change.
    logger.log(`${lower} endpoint changed: `, userResource);
};

DataChannels.prototype._some = function(callback, thisArg) {
    const dataChannels = this._dataChannels;

    if (dataChannels && dataChannels.length !== 0) {
        if (thisArg) {
            return dataChannels.some(callback, thisArg);
        }
        return dataChannels.some(callback);

    }
    return false;

};

/**
 * Sends passed object via the first found open datachannel
 * @param jsonObject {object} the object that will be sent
 * @throws NetworkError or InvalidStateError from RTCDataChannel#send (@see
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/send})
 * or Error with "No opened data channels found!" message.
 */
DataChannels.prototype.send = function(jsonObject) {
    if(!this._some(dataChannel => {
        if (dataChannel.readyState == 'open') {
            dataChannel.send(JSON.stringify(jsonObject));
            return true;
        }
    })) {
        throw new Error('No opened data channels found!');
    }
};

/**
 * Sends message via the datachannels.
 * @param to {string} the id of the endpoint that should receive the message.
 * If "" the message will be sent to all participants.
 * @param payload {object} the payload of the message.
 * @throws NetworkError or InvalidStateError from RTCDataChannel#send (@see
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/send})
 * or Error with "No opened data channels found!" message.
 */
DataChannels.prototype.sendDataChannelMessage = function(to, payload) {
    this.send({
        colibriClass: 'EndpointMessage',
        to,
        msgPayload: payload
    });
};

/**
 * Sends a "lastN value changed" message via the data channel.
 * @param value {int} The new value for lastN. -1 means unlimited.
 */
DataChannels.prototype.sendSetLastNMessage = function(value) {
    const jsonObject = {
        colibriClass : 'LastNChangedEvent',
        lastN : value
    };

    this.send(jsonObject);
    logger.log(`Channel lastN set to: ${value}`);
};

module.exports = DataChannels;
