/* global Olm */

import { getLogger } from '@jitsi/logger';
import base64js from 'base64-js';
import isEqual from 'lodash.isequal';
import { v4 as uuidv4 } from 'uuid';

import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import Deferred from '../util/Deferred';
import Listenable from '../util/Listenable';
import { FEATURE_E2EE, JITSI_MEET_MUC_TYPE } from '../xmpp/xmpp';

import { E2EEErrors } from './E2EEErrors';
import { generateSas } from './SAS';

const logger = getLogger(__filename);

const REQ_TIMEOUT = 5 * 1000;
const OLM_MESSAGE_TYPE = 'olm';
const OLM_MESSAGE_TYPES = {
    ERROR: 'error',
    KEY_INFO: 'key-info',
    KEY_INFO_ACK: 'key-info-ack',
    SESSION_ACK: 'session-ack',
    SESSION_INIT: 'session-init',
    SAS_START: 'sas-start',
    SAS_ACCEPT: 'sas-accept',
    SAS_KEY: 'sas-key',
    SAS_MAC: 'sas-mac'
};

const OLM_SAS_NUM_BYTES = 6;
const OLM_KEY_VERIFICATION_MAC_INFO = 'Jitsi-KEY_VERIFICATION_MAC';
const OLM_KEY_VERIFICATION_MAC_KEY_IDS = 'Jitsi-KEY_IDS';

const kOlmData = Symbol('OlmData');

const OlmAdapterEvents = {
    PARTICIPANT_E2EE_CHANNEL_READY: 'olm.participant_e2ee_channel_ready',
    PARTICIPANT_SAS_AVAILABLE: 'olm.participant_sas_available',
    PARTICIPANT_SAS_READY: 'olm.participant_sas_ready',
    PARTICIPANT_KEY_UPDATED: 'olm.partitipant_key_updated',
    PARTICIPANT_VERIFICATION_COMPLETED: 'olm.participant_verification_completed'
};

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
     * Creates an adapter instance for the given conference.
     */
    constructor(conference) {
        super();

        this._conf = conference;
        this._init = new Deferred();
        this._mediaKey = undefined;
        this._mediaKeyIndex = -1;
        this._reqs = new Map();
        this._sessionInitialization = undefined;

        if (OlmAdapter.isSupported()) {
            this._bootstrapOlm();

            this._conf.on(JitsiConferenceEvents.ENDPOINT_MESSAGE_RECEIVED, this._onEndpointMessageReceived.bind(this));
            this._conf.on(JitsiConferenceEvents.CONFERENCE_LEFT, this._onConferenceLeft.bind(this));
            this._conf.on(JitsiConferenceEvents.USER_LEFT, this._onParticipantLeft.bind(this));
            this._conf.on(JitsiConferenceEvents.PARTICIPANT_PROPERTY_CHANGED,
                this._onParticipantPropertyChanged.bind(this));
        } else {
            this._init.reject(new Error('Olm not supported'));
        }
    }

    /**
     * Returns the current participants conference ID.
     *
     * @returns {string}
     */
    get myId() {
        return this._conf.myUserId();
    }

    /**
     * Starts new olm sessions with every other participant that has the participantId "smaller" the localParticipantId.
     */
    async initSessions() {
        if (this._sessionInitialization) {
            throw new Error('OlmAdapter initSessions called multiple times');
        } else {
            this._sessionInitialization = new Deferred();

            await this._init;

            const promises = [];
            const localParticipantId = this._conf.myUserId();

            for (const participant of this._conf.getParticipants()) {
                if (participant.hasFeature(FEATURE_E2EE) && localParticipantId < participant.getId()) {
                    promises.push(this._sendSessionInit(participant));
                }
            }

            await Promise.allSettled(promises);

            // TODO: retry failed ones.

            this._sessionInitialization.resolve();
            this._sessionInitialization = undefined;
        }
    }

    /**
     * Indicates if olm is supported on the current platform.
     *
     * @returns {boolean}
     */
    static isSupported() {
        return typeof window.Olm !== 'undefined';
    }

    /**
     * Updates the current participant key and distributes it to all participants in the conference
     * by sending a key-info message.
     *
     * @param {Uint8Array|boolean} key - The new key.
     * @retrns {Promise<Number>}
     */
    async updateKey(key) {
        // Store it locally for new sessions.
        this._mediaKey = key;
        this._mediaKeyIndex++;

        // Broadcast it.
        const promises = [];

        for (const participant of this._conf.getParticipants()) {
            const pId = participant.getId();
            const olmData = this._getParticipantOlmData(participant);

            // TODO: skip those who don't support E2EE.
            if (!olmData.session) {
                logger.warn(`Tried to send key to participant ${pId} but we have no session`);

                // eslint-disable-next-line no-continue
                continue;
            }

            const uuid = uuidv4();
            const data = {
                [JITSI_MEET_MUC_TYPE]: OLM_MESSAGE_TYPE,
                olm: {
                    type: OLM_MESSAGE_TYPES.KEY_INFO,
                    data: {
                        ciphertext: this._encryptKeyInfo(olmData.session),
                        uuid
                    }
                }
            };
            const d = new Deferred();

            d.setRejectTimeout(REQ_TIMEOUT);
            d.catch(() => {
                this._reqs.delete(uuid);
            });
            this._reqs.set(uuid, d);
            promises.push(d);

            this._sendMessage(data, pId);
        }

        await Promise.allSettled(promises);

        // TODO: retry failed ones?

        return this._mediaKeyIndex;
    }

    /**
     * Updates the current participant key.
     * @param {Uint8Array|boolean} key - The new key.
     * @returns {number}
    */
    updateCurrentMediaKey(key) {
        this._mediaKey = key;

        return this._mediaKeyIndex;
    }

    /**
     * Frees the olmData session for the given participant.
     *
     */
    clearParticipantSession(participant) {
        const olmData = this._getParticipantOlmData(participant);

        if (olmData.session) {
            olmData.session.free();
            olmData.session = undefined;
        }
    }

    /**
     * Frees the olmData sessions for all participants.
     *
     */
    clearAllParticipantsSessions() {
        for (const participant of this._conf.getParticipants()) {
            this.clearParticipantSession(participant);
        }
    }

    /**
     * Sends sacMac if channel verification waas successful.
     *
     */
    markParticipantVerified(participant, isVerified) {
        const olmData = this._getParticipantOlmData(participant);

        const pId = participant.getId();

        if (!isVerified) {
            olmData.sasVerification = undefined;
            logger.warn(`Verification failed for participant ${pId}`);
            this.eventEmitter.emit(
                OlmAdapterEvents.PARTICIPANT_VERIFICATION_COMPLETED,
                pId,
                false,
                E2EEErrors.E2EE_SAS_CHANNEL_VERIFICATION_FAILED);

            return;
        }

        if (!olmData.sasVerification) {
            logger.warn(`Participant ${pId} does not have valid sasVerification`);
            this.eventEmitter.emit(
                OlmAdapterEvents.PARTICIPANT_VERIFICATION_COMPLETED,
                pId,
                false,
                E2EEErrors.E2EE_SAS_INVALID_SAS_VERIFICATION);

            return;
        }

        const { sas, sasMacSent } = olmData.sasVerification;

        if (sas && sas.is_their_key_set() && !sasMacSent) {
            this._sendSasMac(participant);

            // Mark the MAC as sent so we don't send it multiple times.
            olmData.sasVerification.sasMacSent = true;
        }
    }

    /**
     * Internal helper to bootstrap the olm library.
     *
     * @returns {Promise<void>}
     * @private
     */
    async _bootstrapOlm() {
        logger.debug('Initializing Olm...');

        try {
            await Olm.init();

            this._olmAccount = new Olm.Account();
            this._olmAccount.create();

            this._idKeys = JSON.parse(this._olmAccount.identity_keys());

            logger.debug(`Olm ${Olm.get_library_version().join('.')} initialized`);
            this._init.resolve();
            this._onIdKeysReady(this._idKeys);
        } catch (e) {
            logger.error('Failed to initialize Olm', e);
            this._init.reject(e);
        }
    }

    /**
     * Starts the verification process for the given participant as described here
     * https://spec.matrix.org/latest/client-server-api/#short-authentication-string-sas-verification
     *
     *    |                                 |
          | m.key.verification.start        |
          |-------------------------------->|
          |                                 |
          |       m.key.verification.accept |
          |<--------------------------------|
          |                                 |
          | m.key.verification.key          |
          |-------------------------------->|
          |                                 |
          |          m.key.verification.key |
          |<--------------------------------|
          |                                 |
          | m.key.verification.mac          |
          |-------------------------------->|
          |                                 |
          |          m.key.verification.mac |
          |<--------------------------------|
          |                                 |
     *
     * @param {JitsiParticipant} participant - The target participant.
     * @returns {Promise<void>}
     * @private
     */
    startVerification(participant) {
        const pId = participant.getId();
        const olmData = this._getParticipantOlmData(participant);

        if (!olmData.session) {
            logger.warn(`Tried to start verification with participant ${pId} but we have no session`);

            return;
        }

        if (olmData.sasVerification) {
            logger.warn(`There is already a verification in progress with participant ${pId}`);

            return;
        }

        olmData.sasVerification = {
            sas: new Olm.SAS(),
            transactionId: uuidv4()
        };

        const startContent = {
            transactionId: olmData.sasVerification.transactionId
        };

        olmData.sasVerification.startContent = startContent;
        olmData.sasVerification.isInitiator = true;

        const startMessage = {
            [JITSI_MEET_MUC_TYPE]: OLM_MESSAGE_TYPE,
            olm: {
                type: OLM_MESSAGE_TYPES.SAS_START,
                data: startContent
            }
        };

        this._sendMessage(startMessage, pId);
    }

    /**
     * Publishes our own Olmn id key in presence.
     * @private
     */
    _onIdKeysReady(idKeys) {
        logger.debug(`Olm id key ready: ${idKeys}`);

        // Publish it in presence.
        for (const keyType in idKeys) {
            if (idKeys.hasOwnProperty(keyType)) {
                const key = idKeys[keyType];

                this._conf.setLocalParticipantProperty(`e2ee.idKey.${keyType}`, key);
            }
        }
    }

    /**
     * Event posted when the E2EE signalling channel has been established with the given participant.
     * @private
     */
    _onParticipantE2EEChannelReady(id) {
        logger.debug(`E2EE channel with participant ${id} is ready`);
    }

    /**
     * Internal helper for encrypting the current key information for a given participant.
     *
     * @param {Olm.Session} session - Participant's session.
     * @returns {string} - The encrypted text with the key information.
     * @private
     */
    _encryptKeyInfo(session) {
        const keyInfo = {};

        if (this._mediaKey !== undefined) {
            keyInfo.key = this._mediaKey ? base64js.fromByteArray(this._mediaKey) : false;
            keyInfo.keyIndex = this._mediaKeyIndex;
        }

        return session.encrypt(JSON.stringify(keyInfo));
    }

    /**
     * Internal helper for getting the olm related data associated with a participant.
     *
     * @param {JitsiParticipant} participant - Participant whose data wants to be extracted.
     * @returns {Object}
     * @private
     */
    _getParticipantOlmData(participant) {
        participant[kOlmData] = participant[kOlmData] || {};

        return participant[kOlmData];
    }

    /**
     * Handles leaving the conference, cleaning up olm sessions.
     *
     * @private
     */
    async _onConferenceLeft() {
        logger.debug('Conference left');

        await this._init;

        for (const participant of this._conf.getParticipants()) {
            this._onParticipantLeft(participant.getId(), participant);
        }

        if (this._olmAccount) {
            this._olmAccount.free();
            this._olmAccount = undefined;
        }
    }

    /**
     * Main message handler. Handles 1-to-1 messages received from other participants
     * and send the appropriate replies.
     *
     * @private
     */
    async _onEndpointMessageReceived(participant, payload) {
        if (payload[JITSI_MEET_MUC_TYPE] !== OLM_MESSAGE_TYPE) {
            return;
        }

        if (!payload.olm) {
            logger.warn('Incorrectly formatted message');

            return;
        }

        await this._init;

        const msg = payload.olm;
        const pId = participant.getId();
        const olmData = this._getParticipantOlmData(participant);

        switch (msg.type) {
        case OLM_MESSAGE_TYPES.SESSION_INIT: {
            if (olmData.session) {
                logger.warn(`Participant ${pId} already has a session`);

                this._sendError(participant, 'Session already established');
            } else {
                // Create a session for communicating with this participant.

                const session = new Olm.Session();

                session.create_outbound(this._olmAccount, msg.data.idKey, msg.data.otKey);
                olmData.session = session;

                // Send ACK
                const ack = {
                    [JITSI_MEET_MUC_TYPE]: OLM_MESSAGE_TYPE,
                    olm: {
                        type: OLM_MESSAGE_TYPES.SESSION_ACK,
                        data: {
                            ciphertext: this._encryptKeyInfo(session),
                            uuid: msg.data.uuid
                        }
                    }
                };

                this._sendMessage(ack, pId);
                this._onParticipantE2EEChannelReady(pId);
            }
            break;
        }
        case OLM_MESSAGE_TYPES.SESSION_ACK: {
            if (olmData.session) {
                logger.warn(`Participant ${pId} already has a session`);

                this._sendError(participant, 'No session found');
            } else if (msg.data.uuid === olmData.pendingSessionUuid) {
                const { ciphertext } = msg.data;
                const d = this._reqs.get(msg.data.uuid);
                const session = new Olm.Session();

                session.create_inbound(this._olmAccount, ciphertext.body);

                // Remove OT keys that have been used to setup this session.
                this._olmAccount.remove_one_time_keys(session);

                // Decrypt first message.
                const data = session.decrypt(ciphertext.type, ciphertext.body);

                olmData.session = session;
                olmData.pendingSessionUuid = undefined;

                this._onParticipantE2EEChannelReady(pId);

                this._reqs.delete(msg.data.uuid);
                d.resolve();

                const json = safeJsonParse(data);

                if (json.key) {
                    const key = base64js.toByteArray(json.key);
                    const keyIndex = json.keyIndex;

                    olmData.lastKey = key;
                    this.eventEmitter.emit(OlmAdapterEvents.PARTICIPANT_KEY_UPDATED, pId, key, keyIndex);
                }
            } else {
                logger.warn('Received ACK with the wrong UUID');

                this._sendError(participant, 'Invalid UUID');
            }
            break;
        }
        case OLM_MESSAGE_TYPES.ERROR: {
            logger.error(msg.data.error);

            break;
        }
        case OLM_MESSAGE_TYPES.KEY_INFO: {
            if (olmData.session) {
                const { ciphertext } = msg.data;
                const data = olmData.session.decrypt(ciphertext.type, ciphertext.body);
                const json = safeJsonParse(data);

                if (json.key !== undefined && json.keyIndex !== undefined) {
                    const key = json.key ? base64js.toByteArray(json.key) : false;
                    const keyIndex = json.keyIndex;

                    if (!isEqual(olmData.lastKey, key)) {
                        olmData.lastKey = key;
                        this.eventEmitter.emit(OlmAdapterEvents.PARTICIPANT_KEY_UPDATED, pId, key, keyIndex);
                    }

                    // Send ACK.
                    const ack = {
                        [JITSI_MEET_MUC_TYPE]: OLM_MESSAGE_TYPE,
                        olm: {
                            type: OLM_MESSAGE_TYPES.KEY_INFO_ACK,
                            data: {
                                ciphertext: this._encryptKeyInfo(olmData.session),
                                uuid: msg.data.uuid
                            }
                        }
                    };

                    this._sendMessage(ack, pId);
                }
            } else {
                logger.debug(`Received key info message from ${pId} but we have no session for them!`);

                this._sendError(participant, 'No session found while processing key-info');
            }
            break;
        }
        case OLM_MESSAGE_TYPES.KEY_INFO_ACK: {
            if (olmData.session) {
                const { ciphertext } = msg.data;
                const data = olmData.session.decrypt(ciphertext.type, ciphertext.body);
                const json = safeJsonParse(data);

                if (json.key !== undefined && json.keyIndex !== undefined) {
                    const key = json.key ? base64js.toByteArray(json.key) : false;
                    const keyIndex = json.keyIndex;

                    if (!isEqual(olmData.lastKey, key)) {
                        olmData.lastKey = key;
                        this.eventEmitter.emit(OlmAdapterEvents.PARTICIPANT_KEY_UPDATED, pId, key, keyIndex);
                    }
                }

                const d = this._reqs.get(msg.data.uuid);

                this._reqs.delete(msg.data.uuid);
                d.resolve();
            } else {
                logger.debug(`Received key info ack message from ${pId} but we have no session for them!`);

                this._sendError(participant, 'No session found while processing key-info-ack');
            }
            break;
        }
        case OLM_MESSAGE_TYPES.SAS_START: {
            if (!olmData.session) {
                logger.debug(`Received sas init message from ${pId} but we have no session for them!`);

                this._sendError(participant, 'No session found while processing sas-init');

                return;
            }

            if (olmData.sasVerification?.sas) {
                logger.warn(`SAS already created for participant ${pId}`);
                this.eventEmitter.emit(
                    OlmAdapterEvents.PARTICIPANT_VERIFICATION_COMPLETED,
                    pId,
                    false,
                    E2EEErrors.E2EE_SAS_INVALID_SAS_VERIFICATION);

                return;
            }

            const { transactionId } = msg.data;

            const sas = new Olm.SAS();

            olmData.sasVerification = {
                sas,
                transactionId,
                isInitiator: false
            };

            const pubKey = olmData.sasVerification.sas.get_pubkey();
            const commitment = this._computeCommitment(pubKey, msg.data);

            /* The first phase of the verification process, the Key agreement phase
                https://spec.matrix.org/latest/client-server-api/#short-authentication-string-sas-verification
            */
            const acceptMessage = {
                [JITSI_MEET_MUC_TYPE]: OLM_MESSAGE_TYPE,
                olm: {
                    type: OLM_MESSAGE_TYPES.SAS_ACCEPT,
                    data: {
                        transactionId,
                        commitment
                    }
                }
            };

            this._sendMessage(acceptMessage, pId);
            break;
        }
        case OLM_MESSAGE_TYPES.SAS_ACCEPT: {
            if (!olmData.session) {
                logger.debug(`Received sas accept message from ${pId} but we have no session for them!`);

                this._sendError(participant, 'No session found while processing sas-accept');

                return;
            }

            const { commitment, transactionId } = msg.data;


            if (!olmData.sasVerification) {
                logger.warn(`SAS_ACCEPT Participant ${pId} does not have valid sasVerification`);
                this.eventEmitter.emit(
                    OlmAdapterEvents.PARTICIPANT_VERIFICATION_COMPLETED,
                    pId,
                    false,
                    E2EEErrors.E2EE_SAS_INVALID_SAS_VERIFICATION);

                return;
            }

            if (olmData.sasVerification.sasCommitment) {
                logger.debug(`Already received sas commitment message from ${pId}!`);

                this._sendError(participant, 'Already received sas commitment message from ${pId}!');

                return;
            }

            olmData.sasVerification.sasCommitment = commitment;

            const pubKey = olmData.sasVerification.sas.get_pubkey();

            // Send KEY.
            const keyMessage = {
                [JITSI_MEET_MUC_TYPE]: OLM_MESSAGE_TYPE,
                olm: {
                    type: OLM_MESSAGE_TYPES.SAS_KEY,
                    data: {
                        key: pubKey,
                        transactionId
                    }
                }
            };

            this._sendMessage(keyMessage, pId);

            olmData.sasVerification.keySent = true;
            break;
        }
        case OLM_MESSAGE_TYPES.SAS_KEY: {
            if (!olmData.session) {
                logger.debug(`Received sas key message from ${pId} but we have no session for them!`);

                this._sendError(participant, 'No session found while processing sas-key');

                return;
            }

            if (!olmData.sasVerification) {
                logger.warn(`SAS_KEY Participant ${pId} does not have valid sasVerification`);
                this.eventEmitter.emit(
                    OlmAdapterEvents.PARTICIPANT_VERIFICATION_COMPLETED,
                    pId,
                    false,
                    E2EEErrors.E2EE_SAS_INVALID_SAS_VERIFICATION);

                return;
            }

            const { isInitiator, sas, sasCommitment, startContent, keySent } = olmData.sasVerification;

            if (sas.is_their_key_set()) {
                logger.warn('SAS already has their key!');

                return;
            }

            const { key: theirKey, transactionId } = msg.data;

            if (sasCommitment) {
                const commitment = this._computeCommitment(theirKey, startContent);

                if (sasCommitment !== commitment) {
                    this._sendError(participant, 'OlmAdapter commitments mismatched');
                    this.eventEmitter.emit(
                        OlmAdapterEvents.PARTICIPANT_VERIFICATION_COMPLETED,
                        pId,
                        false,
                        E2EEErrors.E2EE_SAS_COMMITMENT_MISMATCHED);
                    olmData.sasVerification.free();

                    return;
                }
            }

            sas.set_their_key(theirKey);

            const pubKey = sas.get_pubkey();

            const myInfo = `${this.myId}|${pubKey}`;
            const theirInfo = `${pId}|${theirKey}`;

            const info = isInitiator ? `${myInfo}|${theirInfo}` : `${theirInfo}|${myInfo}`;

            const sasBytes = sas.generate_bytes(info, OLM_SAS_NUM_BYTES);
            const generatedSas = generateSas(sasBytes);

            this.eventEmitter.emit(OlmAdapterEvents.PARTICIPANT_SAS_READY, pId, generatedSas);

            if (keySent) {
                return;
            }

            const keyMessage = {
                [JITSI_MEET_MUC_TYPE]: OLM_MESSAGE_TYPE,
                olm: {
                    type: OLM_MESSAGE_TYPES.SAS_KEY,
                    data: {
                        key: pubKey,
                        transactionId
                    }
                }
            };

            this._sendMessage(keyMessage, pId);

            olmData.sasVerification.keySent = true;
            break;
        }
        case OLM_MESSAGE_TYPES.SAS_MAC: {
            if (!olmData.session) {
                logger.debug(`Received sas mac message from ${pId} but we have no session for them!`);

                this._sendError(participant, 'No session found while processing sas-mac');

                return;
            }

            const { keys, mac, transactionId } = msg.data;

            if (!mac || !keys) {
                logger.warn('Invalid SAS MAC message');

                return;
            }

            if (!olmData.sasVerification) {
                logger.warn(`SAS_MAC Participant ${pId} does not have valid sasVerification`);

                return;
            }

            const sas = olmData.sasVerification.sas;

            // Verify the received MACs.
            const baseInfo = `${OLM_KEY_VERIFICATION_MAC_INFO}${pId}${this.myId}${transactionId}`;
            const keysMac = sas.calculate_mac(
                Object.keys(mac).sort().join(','), // eslint-disable-line newline-per-chained-call
                baseInfo + OLM_KEY_VERIFICATION_MAC_KEY_IDS
            );

            if (keysMac !== keys) {
                logger.error('SAS verification error: keys MAC mismatch');
                this.eventEmitter.emit(
                    OlmAdapterEvents.PARTICIPANT_VERIFICATION_COMPLETED,
                    pId,
                    false,
                    E2EEErrors.E2EE_SAS_KEYS_MAC_MISMATCH);

                return;
            }

            if (!olmData.ed25519) {
                logger.warn('SAS verification error: Missing ed25519 key');

                this.eventEmitter.emit(
                    OlmAdapterEvents.PARTICIPANT_VERIFICATION_COMPLETED,
                    pId,
                    false,
                    E2EEErrors.E2EE_SAS_MISSING_KEY);

                return;
            }

            for (const [ keyInfo, computedMac ] of Object.entries(mac)) {
                const ourComputedMac = sas.calculate_mac(
                    olmData.ed25519,
                    baseInfo + keyInfo
                );

                if (computedMac !== ourComputedMac) {
                    logger.error('SAS verification error: MAC mismatch');
                    this.eventEmitter.emit(
                        OlmAdapterEvents.PARTICIPANT_VERIFICATION_COMPLETED,
                        pId,
                        false,
                        E2EEErrors.E2EE_SAS_MAC_MISMATCH);

                    return;
                }
            }

            logger.info(`SAS MAC verified for participant ${pId}`);
            this.eventEmitter.emit(OlmAdapterEvents.PARTICIPANT_VERIFICATION_COMPLETED, pId, true);

            break;
        }
        }
    }

    /**
     * Handles a participant leaving. When a participant leaves their olm session is destroyed.
     *
     * @private
     */
    _onParticipantLeft(id, participant) {
        logger.debug(`Participant ${id} left`);

        this.clearParticipantSession(participant);
    }

    /**
    * Handles an update in a participant's presence property.
    *
    * @param {JitsiParticipant} participant - The participant.
    * @param {string} name - The name of the property that changed.
    * @param {*} oldValue - The property's previous value.
    * @param {*} newValue - The property's new value.
    * @private
    */
    async _onParticipantPropertyChanged(participant, name, oldValue, newValue) {
        const participantId = participant.getId();
        const olmData = this._getParticipantOlmData(participant);

        switch (name) {
        case 'e2ee.enabled':
            if (newValue && this._conf.isE2EEEnabled()) {
                const localParticipantId = this._conf.myUserId();
                const participantFeatures = await participant.getFeatures();

                if (participantFeatures.has(FEATURE_E2EE) && localParticipantId < participantId) {
                    if (this._sessionInitialization) {
                        await this._sessionInitialization;
                    }
                    await this._sendSessionInit(participant);

                    const uuid = uuidv4();

                    const d = new Deferred();

                    d.setRejectTimeout(REQ_TIMEOUT);
                    d.catch(() => {
                        this._reqs.delete(uuid);
                        olmData.pendingSessionUuid = undefined;
                    });
                    this._reqs.set(uuid, d);

                    const data = {
                        [JITSI_MEET_MUC_TYPE]: OLM_MESSAGE_TYPE,
                        olm: {
                            type: OLM_MESSAGE_TYPES.KEY_INFO,
                            data: {
                                ciphertext: this._encryptKeyInfo(olmData.session),
                                uuid
                            }
                        }
                    };

                    this._sendMessage(data, participantId);
                }
            }
            break;
        case 'e2ee.idKey.ed25519':
            olmData.ed25519 = newValue;
            this.eventEmitter.emit(OlmAdapterEvents.PARTICIPANT_SAS_AVAILABLE, participantId);
            break;
        }
    }

    /**
     * Builds and sends an error message to the target participant.
     *
     * @param {JitsiParticipant} participant - The target participant.
     * @param {string} error - The error message.
     * @returns {void}
     */
    _sendError(participant, error) {
        const pId = participant.getId();
        const err = {
            [JITSI_MEET_MUC_TYPE]: OLM_MESSAGE_TYPE,
            olm: {
                type: OLM_MESSAGE_TYPES.ERROR,
                data: {
                    error
                }
            }
        };

        this._sendMessage(err, pId);
    }

    /**
     * Internal helper to send the given object to the given participant ID.
     * This function merely exists so the transport can be easily swapped.
     * Currently messages are transmitted via XMPP MUC private messages.
     *
     * @param {object} data - The data that will be sent to the target participant.
     * @param {string} participantId - ID of the target participant.
     */
    _sendMessage(data, participantId) {
        this._conf.sendMessage(data, participantId);
    }

    /**
     * Builds and sends the session-init request to the target participant.
     *
     * @param {JitsiParticipant} participant - Participant to whom we'll send the request.
     * @returns {Promise} - The promise will be resolved when the session-ack is received.
     * @private
     */
    _sendSessionInit(participant) {
        const pId = participant.getId();
        const olmData = this._getParticipantOlmData(participant);

        if (olmData.session) {
            logger.warn(`Tried to send session-init to ${pId} but we already have a session`);

            return Promise.reject();
        }

        if (olmData.pendingSessionUuid !== undefined) {
            logger.warn(`Tried to send session-init to ${pId} but we already have a pending session`);

            return Promise.reject();
        }

        // Generate a One Time Key.
        this._olmAccount.generate_one_time_keys(1);

        const otKeys = JSON.parse(this._olmAccount.one_time_keys());
        const otKey = Object.values(otKeys.curve25519)[0];

        if (!otKey) {
            return Promise.reject(new Error('No one-time-keys generated'));
        }

        // Mark the OT keys (one really) as published so they are not reused.
        this._olmAccount.mark_keys_as_published();

        const uuid = uuidv4();
        const init = {
            [JITSI_MEET_MUC_TYPE]: OLM_MESSAGE_TYPE,
            olm: {
                type: OLM_MESSAGE_TYPES.SESSION_INIT,
                data: {
                    idKey: this._idKeys.curve25519,
                    otKey,
                    uuid
                }
            }
        };

        const d = new Deferred();

        d.setRejectTimeout(REQ_TIMEOUT);
        d.catch(() => {
            this._reqs.delete(uuid);
            olmData.pendingSessionUuid = undefined;
        });
        this._reqs.set(uuid, d);

        this._sendMessage(init, pId);

        // Store the UUID for matching with the ACK.
        olmData.pendingSessionUuid = uuid;

        return d;
    }

    /**
     * Builds and sends the SAS MAC message to the given participant.
     * The second phase of the verification process, the Key verification phase
        https://spec.matrix.org/latest/client-server-api/#short-authentication-string-sas-verification
     */
    _sendSasMac(participant) {
        const pId = participant.getId();
        const olmData = this._getParticipantOlmData(participant);
        const { sas, transactionId } = olmData.sasVerification;

        // Calculate and send MAC with the keys to be verified.
        const mac = {};
        const keyList = [];
        const baseInfo = `${OLM_KEY_VERIFICATION_MAC_INFO}${this.myId}${pId}${transactionId}`;

        const deviceKeyId = `ed25519:${pId}`;

        mac[deviceKeyId] = sas.calculate_mac(
            this._idKeys.ed25519,
            baseInfo + deviceKeyId);
        keyList.push(deviceKeyId);

        const keys = sas.calculate_mac(
            keyList.sort().join(','),
            baseInfo + OLM_KEY_VERIFICATION_MAC_KEY_IDS
        );

        const macMessage = {
            [JITSI_MEET_MUC_TYPE]: OLM_MESSAGE_TYPE,
            olm: {
                type: OLM_MESSAGE_TYPES.SAS_MAC,
                data: {
                    keys,
                    mac,
                    transactionId
                }
            }
        };

        this._sendMessage(macMessage, pId);
    }

    /**
     * Computes the commitment.
     */
    _computeCommitment(pubKey, data) {
        const olmUtil = new Olm.Utility();
        const commitment = olmUtil.sha256(pubKey + JSON.stringify(data));

        olmUtil.free();

        return commitment;
    }
}

/**
 * Helper to ensure JSON parsing always returns an object.
 *
 * @param {string} data - The data that needs to be parsed.
 * @returns {object} - Parsed data or empty object in case of failure.
 */
function safeJsonParse(data) {
    try {
        return JSON.parse(data);
    } catch (e) {
        return {};
    }
}

OlmAdapter.events = OlmAdapterEvents;
