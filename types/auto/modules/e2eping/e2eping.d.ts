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
    constructor(conference: any, options: any, sendMessage: Function);
    conference: any;
    eventEmitter: any;
    sendMessage: Function;
    participants: {};
    numRequests: any;
    maxConferenceSize: any;
    maxMessagesPerSecond: any;
    /**
     * Handles a participant joining the conference. Starts to send ping
     * requests to the participant.
     *
     * @param {String} id - The ID of the participant.
     * @param {JitsiParticipant} participant - The participant that joined.
     */
    participantJoined(id: string, participant: any): void;
    /**
     * Handles a participant leaving the conference. Stops sending requests.
     *
     * @param {String} id - The ID of the participant.
     */
    participantLeft(id: string): void;
    /**
     * Handles a message that was received.
     *
     * @param participant - The message sender.
     * @param payload - The payload of the message.
     */
    messageReceived(participant: any, payload: any): void;
    /**
     * Delay processing USER_JOINED events until the MUC is fully joined,
     * otherwise the apparent conference size will be wrong.
     */
    conferenceJoined(): void;
    /**
     * Remove a participant without calling "stop".
     */
    removeParticipant(id: any): void;
    /**
     * Handles a ping request coming from another participant.
     *
     * @param {string} participantId - The ID of the participant who sent the
     * request.
     * @param {Object} request - The request.
     */
    handleRequest(participantId: string, request: any): void;
    /**
     * Handles a ping response coming from another participant
     * @param {string} participantId - The ID of the participant who sent the
     * response.
     * @param {Object} response - The response.
     */
    handleResponse(participantId: string, response: any): void;
    /**
     * Stops this E2ePing (i.e. stop sending requests).
     */
    stop(): void;
}
