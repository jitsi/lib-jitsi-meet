/* global __filename, module, require */
var logger = require("jitsi-meet-logger").getLogger(__filename);
var RTCEvents = require("../../service/RTC/RTCEvents");
import * as JitsiConferenceEvents from "../../JitsiConferenceEvents";

/**
 * Class is responsible for emitting
 * JitsiConferenceEvents.PARTICIPANT_CONN_STATUS_CHANGED events.
 *
 * @constructor
 * @param rtc {RTC} the RTC service instance
 * @param conference {JitsiConference} parent conference instance
 */
function ParticipantConnectionStatus(rtc, conference) {
    this.rtc = rtc;
    this.conference = conference;
    rtc.addListener(
        RTCEvents.ENDPOINT_CONN_STATUS_CHANGED,
        this.onEndpointConnStatusChanged.bind(this));
}

/**
 * Handles RTCEvents.ENDPOINT_CONN_STATUS_CHANGED triggered when we receive
 * notification over the data channel from the bridge about endpoint's
 * connection status update.
 * @param endpointId {string} the endpoint ID(MUC nickname/resource JID)
 * @param status {boolean} true if the connection is OK or false otherwise
 */
ParticipantConnectionStatus.prototype.onEndpointConnStatusChanged
= function(endpointId, status) {
    logger.debug(
        'Detector RTCEvents.ENDPOINT_CONN_STATUS_CHANGED(' + Date.now() +'): '
            + endpointId +": " + status);
    // Filter out events for the local JID for now
    if (endpointId !== this.conference.myUserId()) {
        this._changeConnectionStatus(endpointId, status);
    }
};

ParticipantConnectionStatus.prototype._changeConnectionStatus
= function (endpointId, newStatus) {
    var participant = this.conference.getParticipantById(endpointId);
    if (!participant) {
        // This will happen when participant exits the conference with broken
        // ICE connection and we join after that. The bridge keeps sending
        // that notification until the conference does not expire.
        logger.warn(
            'Missed participant connection status update - ' +
                'no participant for endpoint: ' + endpointId);
        return;
    }
    if (participant.isConnectionActive() !== newStatus) {
        participant._setIsConnectionActive(newStatus);
        logger.debug(
            'Emit endpoint conn status(' + Date.now() + '): ',
            endpointId, newStatus);
        this.conference.eventEmitter.emit(
            JitsiConferenceEvents.PARTICIPANT_CONN_STATUS_CHANGED,
            endpointId, newStatus);
    }
};

module.exports = ParticipantConnectionStatus;
