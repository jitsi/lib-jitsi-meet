/* global __filename */
import { getLogger } from 'jitsi-meet-logger';
import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import { createE2eRttEvent } from '../../service/statistics/AnalyticsEvents';
import * as E2ePingEvents
    from '../../service/e2eping/E2ePingEvents';
import Statistics from '../statistics/statistics';

const logger = getLogger(__filename);

/**
 * The 'type' of a message which designates an e2e ping request.
 * @type {string}
 */
const E2E_PING_REQUEST = 'e2e-ping-request';

/**
 * The 'type' of a message which designates an e2e ping response.
 * @type {string}
 */
const E2E_PING_RESPONSE = 'e2e-ping-response';

/**
 * Saves e2e ping related state for a single JitsiParticipant.
 */
class ParticipantState {
    /**
     * Creates a ParticipantState
     * @param {JitsiParticipant} participant
     * @param {E2ePing} e2eping
     */
    constructor(participant, e2eping) {
        // The JitsiParticipant
        this.participant = participant;

        // The E2ePing
        this.e2eping = e2eping;

        // Caches the ID
        this.id = participant.getId();

        // Recently sent requests
        this.requests = {};

        // The ID of the last sent request. We just increment it for each new
        // request. Start at 1 so we can consider only thruthy values valid.
        this.lastRequestId = 1;

        // If the data channel was already open (this is likely a participant
        // joining an existing conference) send a request immediately.
        if (e2eping.dataChannelOpened) {
            this.sendRequest();
        }

        this.pingInterval = window.setInterval(
            this.sendRequest, e2eping.pingIntervalMs);
        this.analyticsInterval = window.setTimeout(
            this.maybeSendAnalytics, this.e2eping.analyticsIntervalMs);
    }

    /**
     * Clears the interval which sends pings.
     * @type {*}
     */
    clearIntervals = function() {
        if (this.pingInterval) {
            window.clearInterval(this.pingInterval);
        }
        if (this.analyticsInterval) {
            window.clearInterval(this.analyticsInterval);
        }
    }.bind(this); // eslint-disable-line no-invalid-this

    /**
     * Sends the next ping request.
     * @type {*}
     */
    sendRequest = function() {
        const requestId = this.lastRequestId++;
        const requestMessage = {
            type: E2E_PING_REQUEST,
            id: requestId
        };

        this.e2eping.sendMessage(requestMessage, this.id);
        this.requests[requestId] = {
            id: requestId,
            timeSent: window.performance.now()
        };

    }.bind(this); // eslint-disable-line no-invalid-this

    /**
     * Handles a response from this participant.
     * @type {*}
     */
    handleResponse = function(response) {
        const request = this.requests[response.id];

        if (request) {
            request.rtt = window.performance.now() - request.timeSent;
            this.e2eping.conference.eventEmitter.emit(
                E2ePingEvents.E2E_RTT_CHANGED,
                this.participant,
                request.rtt);
        }

        this.maybeSendAnalytics();
    }.bind(this); // eslint-disable-line no-invalid-this

    /**
     * Goes over the requests, clearing ones which we don't need anymore, and
     * if it finds at least one request with a valid RTT in the last
     * 'analyticsIntervalMs' then sends an analytics event.
     * @type {*}
     */
    maybeSendAnalytics = function() {
        const now = window.performance.now();

        // The RTT we'll report is the minimum RTT measured in the last
        // analyticsInterval
        let rtt = Infinity;
        let request, requestId;

        // It's time to send analytics. Clean up all requests and find the
        for (requestId in this.requests) {
            if (this.requests.hasOwnProperty(requestId)) {
                request = this.requests[requestId];

                if (request.timeSent < now - this.e2eping.analyticsIntervalMs) {
                    // An old request. We don't care about it anymore.
                    delete this.requests[requestId];
                } else if (request.rtt) {
                    rtt = Math.min(rtt, request.rtt);
                }
            }
        }

        if (rtt < Infinity) {
            this.sendAnalytics(rtt);
        }
    }.bind(this); // eslint-disable-line no-invalid-this

    /**
     * Sends an analytics event for this participant with the given RTT.
     * @type {*}
     */
    sendAnalytics = function(rtt) {
        Statistics.sendAnalytics(createE2eRttEvent(
            this.id,
            this.participant.getProperty('region'),
            rtt));
    }.bind(this); // eslint-disable-line no-invalid-this
}

/**
 * Implements end-to-end ping (from one conference participant to another) via
 * the jitsi-videobridge channel (either WebRTC data channel or web socket).
 *
 * This class:
 * 1. Sends periodic ping requests to all other participants in the
 * conference.
 * 2. Responds to ping requests from other participants.
 * 3. Fires events with the end-to-end RTT to each participant whenever a
 * response is received.
 * 4. Fires analytics events with the end-to-end RTT periodically.
 */
export default class E2ePing {
    /**
     * @param {JitsiConference} conference
     * @param {Object} options
     */
    constructor(conference, options) {
        this.conference = conference;

        // The interval at which pings will be sent (<= 0 disables sending).
        this.pingIntervalMs = 10000;

        // The interval at which analytics events will be sent.
        this.analyticsIntervalMs = 60000;

        // Maps a participant ID to its ParticipantState
        this.participants = {};

        // Whether the WebRTC channel has been opened or not.
        this.dataChannelOpened = false;

        if (options && options.e2eping) {
            if (typeof options.e2eping.pingInterval === 'number') {
                this.pingIntervalMs = options.e2eping.pingInterval;
            }
            if (typeof options.e2eping.analyticsInterval === 'number') {
                this.analyticsIntervalMs = options.e2eping.analyticsInterval;
            }

            // We want to report at most once a ping interval.
            if (this.analyticsIntervalMs > 0 && this.analyticsIntervalMs
                < this.pingIntervalMs) {
                this.analyticsIntervalMs = this.pingIntervalMs;
            }
        }
        logger.info(
            `Initializing e2e ping; pingInterval=${
                this.pingIntervalMs}, analyticsInterval=${
                this.analyticsIntervalMs}.`);

        // Only subscribe to user join/leave events if sending pings is enabled.
        if (this.pingIntervalMs > 0) {
            conference.on(
                JitsiConferenceEvents.USER_JOINED,
                (id, participant) => this.participantJoined(participant));
            conference.on(
                JitsiConferenceEvents.USER_LEFT,
                (id, participant) => this.participantLeft(participant));
        }

        // Listen to E2E PING requests and responses from other participants
        // in the conference.
        conference.on(
            JitsiConferenceEvents.ENDPOINT_MESSAGE_RECEIVED,
            (participant, payload) => {
                if (payload.type === E2E_PING_REQUEST) {
                    this.handleRequest(participant, payload);
                } else if (payload.type === E2E_PING_RESPONSE) {
                    this.handleResponse(participant, payload);
                }
            });

        // We don't want to wait the whole interval before sending the first
        // request, but we can't send it immediately after the participant joins
        // either, because our data channel might not have initialized.
        // So once the data channel initializes, send requests to everyone.
        // Wait an additional 200ms to give a chance to the remote side (if it
        // also just connected as is the case for the first 2 participants in a
        // conference) to open its data channel.
        conference.on(
            JitsiConferenceEvents.DATA_CHANNEL_OPENED,
            () => {
                this.dataChannelOpened = true;
                for (const id in this.participants) {
                    if (this.participants.hasOwnProperty(id)) {
                        const participantState = this.participants[id];

                        window.setTimeout(participantState.sendRequest, 200);
                    }
                }
            });
    }

    /**
     * Handles a participant joining the conference. Starts to send ping
     * requests to the participant.
     * @param {JitsiParticipant} participant the participant that joined.
     */
    participantJoined(participant) {
        const id = participant.getId();

        if (this.participants[id]) {
            // State state left?
            logger.info(
                `Participant state already exists for ${id}. Clearing.`);
            this.participants[id].clearIntervals();
            delete this.participants[id];
        }

        this.participants[id] = new ParticipantState(participant, this);
    }

    /**
     * Handles a participant leaving the conference. Stops sending requests.
     * @param {JitsiParticipant} participant the participant that left.
     */
    participantLeft(participant) {
        const id = participant.getId();

        if (this.participants[id]) {
            this.participants[id].clearIntervals();
            delete this.participants[id];
        }
    }

    /**
     * Handles a ping request coming from another participant.
     * @param {JitsiParticipant} participant the participant who sent the
     * request.
     * @param {Object} request the request.
     */
    handleRequest(participant, request) {
        // If it's a valid request, just send a response.
        if (request && request.id) {
            const response = {
                type: E2E_PING_RESPONSE,
                id: request.id
            };

            this.sendMessage(response, participant.getId());
        } else {
            logger.info(
                `Received an invalid e2e ping request from ${
                    participant.getId()}.`);
        }
    }

    /**
     * Handles a ping response coming from another participant
     * @param {JitsiParticipant} participant the participant who sent the
     * response.
     * @param {Object} response the response.
     */
    handleResponse(participant, response) {
        const participantState = this.participants[participant.getId()];

        if (participantState) {
            participantState.handleResponse(response);
        }
    }

    /**
     * Sends a message to another participant over the bridge
     * @param {Object} message the message to send.
     * @param {string} to the ID of the destination participant.
     */
    sendMessage(message, to) {
        // It's a best-effort.
        try {
            this.conference.sendMessage(
                message, to, true /* sendThroughVideobridge */);
        } catch (error) {
            logger.warn('Failed to send a ping request or response.');
        }
    }
}

