import { getLogger } from '@jitsi/logger';

import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import * as JitsiE2EPingEvents from '../../service/e2eping/E2ePingEvents';

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
 * The number of requests to wait for before emitting an RTT value.
 */
const DEFAULT_NUM_REQUESTS = 5;

/**
 * The maximum number of messages per second to aim for. This is for the entire
 * conference, with the assumption that all endpoints join at once.
 */
const DEFAULT_MAX_MESSAGES_PER_SECOND = 250;

/**
 * The conference size beyond which e2e pings will be disabled.
 */
const DEFAULT_MAX_CONFERENCE_SIZE = 200;

/**
 * Saves e2e ping related state for a single JitsiParticipant.
 */
class ParticipantWrapper {
    /**
     * Creates a ParticipantWrapper
     * @param {JitsiParticipant} participant - The remote participant that this
     * object wraps.
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

        this.sendRequest = this.sendRequest.bind(this);
        this.handleResponse = this.handleResponse.bind(this);
        this.maybeLogRttAndStop = this.maybeLogRttAndStop.bind(this);
        this.scheduleNext = this.scheduleNext.bind(this);
        this.stop = this.stop.bind(this);
        this.getDelay = this.getDelay.bind(this);
        this.timeout = this.scheduleNext();
    }

    /**
     * Schedule the next ping to be sent.
     */
    scheduleNext() {
        return window.setTimeout(this.sendRequest, this.getDelay());
    }

    /**
     * Stop pinging this participant, canceling a scheduled ping, if any.
     */
    stop() {
        if (this.timeout) {
            window.clearTimeout(this.timeout);
        }
        this.e2eping.removeParticipant(this.id);
    }

    /**
     * Get the delay until the next ping in milliseconds.
     */
    getDelay() {
        const conferenceSize = this.e2eping.conference.getParticipants().length;
        const endpointPairs = conferenceSize * (conferenceSize - 1) / 2;
        const totalMessages = endpointPairs * this.e2eping.numRequests;
        const totalSeconds = totalMessages / this.e2eping.maxMessagesPerSecond;

        // Randomize between .5 and 1.5
        const r = 1.5 - Math.random();
        const delayBetweenMessages = r * Math.max(1000 * (totalSeconds / this.e2eping.numRequests), 1000);

        return delayBetweenMessages;
    }

    /**
     * Sends the next ping request.
     * @type {*}
     */
    sendRequest() {
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
    }

    /**
     * Handles a response from this participant.
     * @type {*}
     */
    handleResponse(response) {
        const request = this.requests[response.id];

        if (request) {
            request.rtt = window.performance.now() - request.timeSent;
        }
        this.maybeLogRttAndStop();
    }

    /**
     * Check if we've received the pre-configured number of responses, and if
     * so log the measured RTT and stop sending requests.
     * @type {*}
     */
    maybeLogRttAndStop() {
        // The RTT we'll report is the minimum RTT measured
        let rtt = Infinity;
        let request, requestId;
        let numRequestsWithResponses = 0;
        let totalNumRequests = 0;

        for (requestId in this.requests) {
            if (this.requests.hasOwnProperty(requestId)) {
                request = this.requests[requestId];

                totalNumRequests++;
                if (request.rtt) {
                    numRequestsWithResponses++;
                    rtt = Math.min(rtt, request.rtt);
                }
            }
        }

        if (numRequestsWithResponses >= this.e2eping.numRequests) {
            logger.info(`Measured RTT=${rtt} ms to ${this.id} (in ${this.participant.getProperty('region')})`);
            this.stop();

            this.e2eping.conference.eventEmitter.emit(
                JitsiE2EPingEvents.E2E_RTT_CHANGED, this.participant, rtt);

            return;
        } else if (totalNumRequests > 2 * this.e2eping.numRequests) {
            logger.info(`Stopping e2eping for ${this.id} because we sent ${totalNumRequests} with only `
                + `${numRequestsWithResponses} responses.`);
            this.stop();

            return;
        }

        this.timeout = this.scheduleNext();
    }
}

/**
 * Implements end-to-end ping (from one conference participant to another) via
 * the jitsi-videobridge channel (either WebRTC data channel or web socket).
 *
 * TODO: use a broadcast message instead of individual pings to each remote
 * participant.
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
     * @param {JitsiConference} conference - The conference.
     * @param {Function} sendMessage - The function to use to send a message.
     * @param {Object} options
     */
    constructor(conference, options, sendMessage) {
        this.conference = conference;
        this.eventEmitter = conference.eventEmitter;
        this.sendMessage = sendMessage;

        // Maps a participant ID to its ParticipantWrapper
        this.participants = {};

        this.numRequests = DEFAULT_NUM_REQUESTS;
        this.maxConferenceSize = DEFAULT_MAX_CONFERENCE_SIZE;
        this.maxMessagesPerSecond = DEFAULT_MAX_MESSAGES_PER_SECOND;

        if (options && options.e2eping) {
            if (typeof options.e2eping.numRequests === 'number') {
                this.numRequests = options.e2eping.numRequests;
            }
            if (typeof options.e2eping.maxConferenceSize === 'number') {
                this.maxConferenceSize = options.e2eping.maxConferenceSize;
            }
            if (typeof options.e2eping.maxMessagesPerSecond === 'number') {
                this.maxMessagesPerSecond = options.e2eping.maxMessagesPerSecond;
            }
        }
        logger.info(
            `Initializing e2e ping with numRequests=${this.numRequests}, maxConferenceSize=${this.maxConferenceSize}, `
            + `maxMessagesPerSecond=${this.maxMessagesPerSecond}.`);

        this.participantJoined = this.participantJoined.bind(this);

        this.participantLeft = this.participantLeft.bind(this);
        conference.on(JitsiConferenceEvents.USER_LEFT, this.participantLeft);

        this.messageReceived = this.messageReceived.bind(this);
        conference.on(JitsiConferenceEvents.ENDPOINT_MESSAGE_RECEIVED, this.messageReceived);

        this.conferenceJoined = this.conferenceJoined.bind(this);
        conference.on(JitsiConferenceEvents.CONFERENCE_JOINED, this.conferenceJoined);
    }

    /**
     * Delay processing USER_JOINED events until the MUC is fully joined,
     * otherwise the apparent conference size will be wrong.
     */
    conferenceJoined() {
        this.conference.getParticipants().forEach(p => this.participantJoined(p.getId(), p));
        this.conference.on(JitsiConferenceEvents.USER_JOINED, this.participantJoined);
    }

    /**
     * Handles a message that was received.
     *
     * @param participant - The message sender.
     * @param payload - The payload of the message.
     */
    messageReceived(participant, payload) {
        // Listen to E2E PING requests and responses from other participants
        // in the conference.
        if (payload.type === E2E_PING_REQUEST) {
            this.handleRequest(participant.getId(), payload);
        } else if (payload.type === E2E_PING_RESPONSE) {
            this.handleResponse(participant.getId(), payload);
        }
    }

    /**
     * Handles a participant joining the conference. Starts to send ping
     * requests to the participant.
     *
     * @param {String} id - The ID of the participant.
     * @param {JitsiParticipant} participant - The participant that joined.
     */
    participantJoined(id, participant) {
        if (this.participants[id]) {
            logger.info(`Participant wrapper already exists for ${id}. Clearing.`);
            this.participants[id].stop();
        }

        if (this.conference.getParticipants().length > this.maxConferenceSize) {
            return;
        }

        // We don't need to send e2eping in both directions for a pair of
        // endpoints. Force only one direction with just string comparison of
        // the IDs.
        if (this.conference.myUserId() > id) {
            logger.info(`Starting e2eping for participant ${id}`);
            this.participants[id] = new ParticipantWrapper(participant, this);
        }
    }

    /**
     * Remove a participant without calling "stop".
     */
    removeParticipant(id) {
        if (this.participants[id]) {
            delete this.participants[id];
        }
    }

    /**
     * Handles a participant leaving the conference. Stops sending requests.
     *
     * @param {String} id - The ID of the participant.
     */
    participantLeft(id) {
        if (this.participants[id]) {
            this.participants[id].stop();
            delete this.participants[id];
        }
    }

    /**
     * Handles a ping request coming from another participant.
     *
     * @param {string} participantId - The ID of the participant who sent the
     * request.
     * @param {Object} request - The request.
     */
    handleRequest(participantId, request) {
        // If it's a valid request, just send a response.
        if (request && request.id) {
            const response = {
                type: E2E_PING_RESPONSE,
                id: request.id
            };

            this.sendMessage(response, participantId);
        } else {
            logger.info(`Received an invalid e2e ping request from ${participantId}.`);
        }
    }

    /**
     * Handles a ping response coming from another participant
     * @param {string} participantId - The ID of the participant who sent the
     * response.
     * @param {Object} response - The response.
     */
    handleResponse(participantId, response) {
        const participantWrapper = this.participants[participantId];

        if (participantWrapper) {
            participantWrapper.handleResponse(response);
        }
    }

    /**
     * Stops this E2ePing (i.e. stop sending requests).
     */
    stop() {
        logger.info('Stopping e2eping');

        this.conference.off(JitsiConferenceEvents.USER_JOINED, this.participantJoined);
        this.conference.off(JitsiConferenceEvents.USER_LEFT, this.participantLeft);
        this.conference.off(JitsiConferenceEvents.ENDPOINT_MESSAGE_RECEIVED, this.messageReceived);

        for (const id in this.participants) {
            if (this.participants.hasOwnProperty(id)) {
                this.participants[id].stop();
            }
        }

        this.participants = {};
    }
}

