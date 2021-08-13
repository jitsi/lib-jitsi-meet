/**
 * This class implements an End-to-End Encrypted communication channel between every two peers
 * in the conference. This channel uses libolm to achieve E2EE.
 *
 * The created channel is then used to exchange the secret key that each participant will use
 * to encrypt the actual media (see {@link E2EEContext}).
 *
 * A simple JSON message based protocol is implemented, which follows a request - response model:
 * - session-init: Initiates an olm session establishment procedure. This message will be sent
 *                 by the participant who just joined, to everyone else.
 * - session-ack: Completes the olm session etablishment. This messsage may contain ancilliary
 *                encrypted data, more specifically the sender's current key.
 * - key-info: Includes the sender's most up to date key information.
 * - key-info-ack: Acknowledges the reception of a key-info request. In addition, it may contain
 *                 the sender's key information, if available.
 * - error: Indicates a request processing error has occurred.
 *
 * These requessts and responses are transport independent. Currently they are sent using XMPP
 * MUC private messages.
 */
export class OlmAdapter extends Listenable {
    /**
     * Indicates if olm is supported on the current platform.
     *
     * @returns {boolean}
     */
    static isSupported(): boolean;
    /**
     * Creates an adapter instance for the given conference.
     */
    constructor(conference: any);
    _conf: any;
    _init: Deferred;
    _key: boolean | Uint8Array;
    _keyIndex: number;
    _reqs: Map<any, any>;
    _sessionInitialization: Deferred;
    /**
     * Starts new olm sessions with every other participant that has the participantId "smaller" the localParticipantId.
     */
    initSessions(): Promise<void>;
    /**
     * Updates the current participant key and distributes it to all participants in the conference
     * by sending a key-info message.
     *
     * @param {Uint8Array|boolean} key - The new key.
     * @retrns {Promise<Number>}
     */
    updateKey(key: Uint8Array | boolean): Promise<number>;
    /**
     * Updates the current participant key.
     * @param {Uint8Array|boolean} key - The new key.
     * @returns {number}
    */
    updateCurrentKey(key: Uint8Array | boolean): number;
    /**
     * Frees the olmData session for the given participant.
     *
     */
    clearParticipantSession(participant: any): void;
    /**
     * Frees the olmData sessions for all participants.
     *
     */
    clearAllParticipantsSessions(): void;
    /**
     * Internal helper to bootstrap the olm library.
     *
     * @returns {Promise<void>}
     * @private
     */
    private _bootstrapOlm;
    _olmAccount: any;
    _idKey: any;
    /**
     * Publishes our own Olmn id key in presence.
     * @private
     */
    private _onIdKeyReady;
    /**
     * Event posted when the E2EE signalling channel has been established with the given participant.
     * @private
     */
    private _onParticipantE2EEChannelReady;
    /**
     * Internal helper for encrypting the current key information for a given participant.
     *
     * @param {Olm.Session} session - Participant's session.
     * @returns {string} - The encrypted text with the key information.
     * @private
     */
    private _encryptKeyInfo;
    /**
     * Internal helper for getting the olm related data associated with a participant.
     *
     * @param {JitsiParticipant} participant - Participant whose data wants to be extracted.
     * @returns {Object}
     * @private
     */
    private _getParticipantOlmData;
    /**
     * Handles leaving the conference, cleaning up olm sessions.
     *
     * @private
     */
    private _onConferenceLeft;
    /**
     * Main message handler. Handles 1-to-1 messages received from other participants
     * and send the appropriate replies.
     *
     * @private
     */
    private _onEndpointMessageReceived;
    /**
     * Handles a participant leaving. When a participant leaves their olm session is destroyed.
     *
     * @private
     */
    private _onParticipantLeft;
    /**
    * Handles an update in a participant's presence property.
    *
    * @param {JitsiParticipant} participant - The participant.
    * @param {string} name - The name of the property that changed.
    * @param {*} oldValue - The property's previous value.
    * @param {*} newValue - The property's new value.
    * @private
    */
    private _onParticipantPropertyChanged;
    /**
     * Builds and sends an error message to the target participant.
     *
     * @param {JitsiParticipant} participant - The target participant.
     * @param {string} error - The error message.
     * @returns {void}
     */
    _sendError(participant: any, error: string): void;
    /**
     * Internal helper to send the given object to the given participant ID.
     * This function merely exists so the transport can be easily swapped.
     * Currently messages are transmitted via XMPP MUC private messages.
     *
     * @param {object} data - The data that will be sent to the target participant.
     * @param {string} participantId - ID of the target participant.
     */
    _sendMessage(data: object, participantId: string): void;
    /**
     * Builds and sends the session-init request to the target participant.
     *
     * @param {JitsiParticipant} participant - Participant to whom we'll send the request.
     * @returns {Promise} - The promise will be resolved when the session-ack is received.
     * @private
     */
    private _sendSessionInit;
}
export namespace OlmAdapter {
    export { OlmAdapterEvents as events };
}
import Listenable from "../util/Listenable";
import Deferred from "../util/Deferred";
declare namespace OlmAdapterEvents {
    const OLM_ID_KEY_READY: string;
    const PARTICIPANT_E2EE_CHANNEL_READY: string;
    const PARTICIPANT_KEY_UPDATED: string;
}
export {};
