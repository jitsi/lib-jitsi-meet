/* global Olm */

import kemBuilder, { KEM } from "@dashlane/pqc-kem-kyber512-browser";
import { safeJsonParse as _safeJsonParse } from "@jitsi/js-utils/json";
import { getLogger } from "@jitsi/logger";
import base64js from "base64-js";
import { Buffer } from "buffer";
import { isEqual } from "lodash-es";
import { v4 as uuidv4 } from "uuid";

import * as JitsiConferenceEvents from "../../JitsiConferenceEvents";
import Deferred from "../util/Deferred";
import Listenable from "../util/Listenable";
import { FEATURE_E2EE, JITSI_MEET_MUC_TYPE } from "../xmpp/xmpp";

import { E2EEErrors } from "./E2EEErrors";
import { generateSas } from "./SAS";
import { decryptSymmetric, encryptSymmetric } from "./crypto-utils";
import { KeyInfo } from "./KeyHandler";
import JitsiConference from "../../JitsiConference";
import JitsiParticipant from "../../JitsiParticipant";

const logger = getLogger(__filename);

const REQ_TIMEOUT = 5 * 1000;
const OLM_MESSAGE_TYPE = "olm";
const OLM_MESSAGE_TYPES = {
    ERROR: "error",
    KEY_INFO: "key-info",
    KEY_INFO_ACK: "key-info-ack",
    SESSION_ACK: "session-ack",
    PQ_SESSION_ACK: "pq-session-ack",
    SESSION_INIT: "session-init",
    PQ_SESSION_INIT: "pq-session-init",
    SAS_START: "sas-start",
    SAS_ACCEPT: "sas-accept",
    SAS_KEY: "sas-key",
    SAS_MAC: "sas-mac",
};

const OLM_SAS_NUM_BYTES = 6;
const OLM_KEY_VERIFICATION_MAC_INFO = "Jitsi-KEY_VERIFICATION_MAC";
const OLM_KEY_VERIFICATION_MAC_KEY_IDS = "Jitsi-KEY_IDS";

const kOlmData = Symbol("OlmData");

const OlmAdapterEvents = {
    PARTICIPANT_E2EE_CHANNEL_READY: "olm.participant_e2ee_channel_ready",
    PARTICIPANT_SAS_AVAILABLE: "olm.participant_sas_available",
    PARTICIPANT_SAS_READY: "olm.participant_sas_ready",
    PARTICIPANT_KEY_UPDATED: "olm.partitipant_key_updated",
    PARTICIPANT_VERIFICATION_COMPLETED:
        "olm.participant_verification_completed",
    GENERATE_KEYS: "olm.generate_keys",
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
    private readonly _conf: JitsiConference;
    private _kem: KEM;
    private _init: boolean;
    private _mediaKeyOlm: Uint8Array;
    private _mediaKeyPQ: Uint8Array;
    private _mediaKey: Uint8Array;
    private _mediaKeyIndex: number;
    private _reqs: Map<Uint8Array, Deferred>;
    private _publicKey: Uint8Array;
    private _privateKey: Uint8Array;
    private _olmAccount: any;
    private _idKeys: any;
    static events: {
        PARTICIPANT_E2EE_CHANNEL_READY: string;
        PARTICIPANT_SAS_AVAILABLE: string;
        PARTICIPANT_SAS_READY: string;
        PARTICIPANT_KEY_UPDATED: string;
        PARTICIPANT_VERIFICATION_COMPLETED: string;
        GENERATE_KEYS: string;
    };
    /**
     * Creates an adapter instance for the given conference.
     */
    constructor(conference) {
        super();
        this._conf = conference;
        this._kem = undefined;
        this._mediaKeyOlm = undefined;
        this._mediaKeyPQ = undefined;
        this._mediaKey = undefined;
        this._mediaKeyIndex = -1;
        this._reqs = new Map();
        this._publicKey = undefined;
        this._privateKey = undefined;
        this._init = false;
    }

    async enableOLM(): Promise<boolean> {
        if (OlmAdapter.isSupported()) {
            if (!(await this._bootstrapOlm())) {
                return false;
            }
            this._conf.on(
                JitsiConferenceEvents.ENDPOINT_MESSAGE_RECEIVED,
                this._onEndpointMessageReceived.bind(this)
            );
            this._conf.on(
                JitsiConferenceEvents.CONFERENCE_LEFT,
                this._onConferenceLeft.bind(this)
            );
            this._conf.on(
                JitsiConferenceEvents.USER_LEFT,
                this._onParticipantLeft.bind(this)
            );
            this._conf.on(
                JitsiConferenceEvents.PARTICIPANT_PROPERTY_CHANGED,
                this._onParticipantPropertyChanged.bind(this)
            );
            return true;
        } else {
            return false;
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

    async sendKeyInfoToAll() {
        // Broadcast it.
        const promises = [];
        const localParticipantId = this._conf.myUserId();

        for (const participant of this._conf.getParticipants()) {
            if (
                participant.hasFeature(FEATURE_E2EE) &&
                localParticipantId < participant.getId()
            ) {
                const pId = participant.getId();
                const olmData = this._getParticipantOlmData(participant);

                // TODO: skip those who don't support E2EE.
                if (!olmData.session || !olmData.pqSessionKey) {
                    logger.warn(`Tried to send KEY_INFO to participant ${participant.getDisplayName()}
                     but we have no session
                     ${olmData.session} and ${olmData.pqSessionKey}`);

                    // eslint-disable-next-line no-continue
                    continue;
                }
                const uuid = uuidv4();

                const { ciphertextStr, ivStr } = await this._encryptKeyInfoPQ(
                    olmData.pqSessionKey
                );

                const data = {
                    [JITSI_MEET_MUC_TYPE]: OLM_MESSAGE_TYPE,
                    olm: {
                        type: OLM_MESSAGE_TYPES.KEY_INFO,
                        data: {
                            ciphertext: this._encryptKeyInfo(olmData.session),
                            pqCiphertext: ciphertextStr,
                            iv: ivStr,
                            uuid,
                        },
                    },
                };
                const d = new Deferred();

                d.setRejectTimeout(REQ_TIMEOUT);
                d.catch(() => {
                    this._reqs.delete(uuid);
                });
                this._reqs.set(uuid, d);
                promises.push(d);

                logger.info(
                    `updateKey: sent KEY_INFO to ${participant.getDisplayName()}`
                );

                this._sendMessage(data, pId);
            }
        }

        await Promise.allSettled(promises);
    }

    async initSessions() {
        const promises = [];
        const localParticipantId = this._conf.myUserId();

        for (const participant of this._conf.getParticipants()) {
            if (
                participant.hasFeature(FEATURE_E2EE) &&
                localParticipantId < participant.getId()
            ) {
                logger.info(
                    `CHECK: initSessionsAndSetMediaKey sent _sessionInitialization to ${participant.getId()}`
                );
                promises.push(this._sendSessionInit(participant));
            }
        }

        await Promise.allSettled(promises);
    }

    /**
     * Starts new olm sessions with every other participant that has the participantId "smaller" the localParticipantId.
     */
    async initSessionsAndSetMediaKey(
        olmKey: Uint8Array,
        pqKey: Uint8Array
    ): Promise<{ mediaKey: Uint8Array; mediaKeyIndex: number }> {
        logger.info("initSessionsAndSetMediaKey started");
        if (this._init) {
            throw new Error("initSessionsAndSetMediaKey called multiple times");
        } else {
            this._init = await this.enableOLM();
            if (!this._init)
                throw new Error("initSessionsAndSetMediaKey couldn't init olm");

            await this.initSessions();
            logger.info(
                "CHECK: initSessionsAndSetMediaKey is done waiting and starts KEY_INFO"
            );
            const keyInfo = await this.updateKey(olmKey, pqKey);

            return keyInfo;
        }
    }

    /**
     * Indicates if olm is supported on the current platform.
     *
     * @returns {boolean}
     */
    static isSupported() {
        return typeof window.Olm !== "undefined";
    }

    /**
     * Updates the current participant key and distributes it to all participants in the conference
     * by sending a key-info message.
     *
     * @param {Uint8Array|boolean} key - The new key.
     * @param {Uint8Array|boolean} pqKey - The new key.
     * @retrns {Promise<Number>}
     */
    async updateKey(
        key: Uint8Array,
        pqkey: Uint8Array
    ): Promise<{ mediaKeyIndex: number; mediaKey: Uint8Array }> {
        logger.info("updateKey: started");
        this._mediaKeyOlm = key;
        this._mediaKeyPQ = pqkey;

        // Store it locally for new sessions.
        const { key: newMediaKey, index } = await this.updateCurrentMediaKey(
            key,
            pqkey
        );
        this._mediaKey = newMediaKey;
        this._mediaKeyIndex = index;
        this._mediaKeyIndex++;

        await this.sendKeyInfoToAll();

        // TODO: retry failed ones?

        return { mediaKeyIndex: this._mediaKeyIndex, mediaKey: this._mediaKey };
    }

    /**
     * Derives one key from two
     * @param {Uint8Array} key1 - The first key.
     * @param {Uint8Array} key2 - The second key.
     * @returns {Uint8Array}
     */
    async deriveKey(key1: Uint8Array, key2: Uint8Array): Promise<Uint8Array> {
        if (key1 === undefined || key1.length === 0) {
            throw new Error("deriveKey: olm key is undefined");
        }

        if (key2 === undefined || key2.length === 0) {
            throw new Error("deriveKey: pq key is undefined");
        }

        const key1Str = base64js.fromByteArray(key1);
        const key2Str = base64js.fromByteArray(key2);
        const olmUtil = new window.Olm.Utility();
        const data = key1Str + key2Str;
        const result = olmUtil.sha256(data);

        olmUtil.free();

        return new Uint8Array(Buffer.from(result, "base64"));
    }

    /**
     * Updates the current participant key.
     * @param {Uint8Array} olmKey - The new key.
     * @param {Uint8Array} pqKey - The new key.
     * @returns {Uint8Array}
     */
    async updateCurrentMediaKey(olmKey, pqKey) {
        this._mediaKey = await this.deriveKey(olmKey, pqKey);
        this._mediaKeyOlm = olmKey;
        this._mediaKeyPQ = pqKey;

        return { key: this._mediaKey, index: this._mediaKeyIndex };
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
     * Initializes kem and creates key pair
     * @returns {Promise<{ publicKey: Uint8Array, privateKey: Uint8Array }>}
     * @private
     */
    async _initializeKemAndKeys() {
        this._kem = await kemBuilder();

        const { publicKey, privateKey } = await this._kem.keypair();

        this._publicKey = publicKey;
        this._privateKey = privateKey;
    }

    /**
     * Encapsulates a key and returns a shared secret and its ciphertext
     * @param {Uint8Array} publicKey - The public key.
     * @returns {Promise<{ sharedSecret: Uint8Array, ciphertext: Uint8Array }>}
     * @private
     */
    async _encapsulateKey(publicKey: Uint8Array): Promise<{
        ciphertext: Uint8Array;
        sharedSecret: Uint8Array;
    }> {
        if (this._kem === undefined) {
            this._kem = await kemBuilder();
        }
        if (publicKey === undefined || publicKey.length === 0) {
            return Promise.reject(new Error("Public KEM key is undefined"));
        }

        return this._kem.encapsulate(publicKey);
    }

    /**
     * Decapsulates a key
     * @param {Uint8Array} ciphertext - The encrypted sharedKey.
     * @param {Uint8Array} privateKey - The private key.
     * @returns {Promise<{ sharedSecret: Uint8Array }>}
     * @private
     */
    async _decapsulateKey(
        ciphertext: Uint8Array,
        privateKey: Uint8Array
    ): Promise<{
        sharedSecret: Uint8Array;
    }> {
        if (this._kem === undefined) {
            this._kem = await kemBuilder();
        }

        return this._kem.decapsulate(ciphertext, privateKey);
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
                E2EEErrors.E2EE_SAS_CHANNEL_VERIFICATION_FAILED
            );

            return;
        }

        if (!olmData.sasVerification) {
            logger.warn(
                `Participant ${pId} does not have valid sasVerification`
            );
            this.eventEmitter.emit(
                OlmAdapterEvents.PARTICIPANT_VERIFICATION_COMPLETED,
                pId,
                false,
                E2EEErrors.E2EE_SAS_INVALID_SAS_VERIFICATION
            );

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
        try {
            await window.Olm.init();

            this._olmAccount = new window.Olm.Account();
            this._olmAccount.create();

            this._idKeys = _safeJsonParse(this._olmAccount.identity_keys());

            // Should create keys and key on bootstrap.
            await this._initializeKemAndKeys();
            this._onIdKeysReady(this._idKeys);
            return true;
        } catch (e) {
            logger.error("Failed to initialize Olm", e);
            return false;
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
            logger.warn(
                `Tried to start verification with participant ${pId} but we have no session`
            );

            return;
        }

        if (olmData.sasVerification) {
            logger.warn(
                `There is already a verification in progress with participant ${pId}`
            );

            return;
        }

        olmData.sasVerification = {
            sas: new window.Olm.SAS(),
            transactionId: uuidv4(),
        };

        const startContent = {
            transactionId: olmData.sasVerification.transactionId,
        };

        olmData.sasVerification.startContent = startContent;
        olmData.sasVerification.isInitiator = true;

        const startMessage = {
            [JITSI_MEET_MUC_TYPE]: OLM_MESSAGE_TYPE,
            olm: {
                type: OLM_MESSAGE_TYPES.SAS_START,
                data: startContent,
            },
        };

        this._sendMessage(startMessage, pId);
    }

    /**
     * Publishes our own Olmn id key in presence.
     * @private
     */
    _onIdKeysReady(idKeys) {
        // Publish it in presence.
        for (const keyType in idKeys) {
            if (idKeys.hasOwnProperty(keyType)) {
                const key = idKeys[keyType];

                this._conf.setLocalParticipantProperty(
                    `e2ee.idKey.${keyType}`,
                    key
                );
            }
        }
    }

    /**
     * Event posted when the E2EE signalling channel has been established with the given participant.
     * @private
     */
    _onParticipantE2EEChannelReady(id) {
        logger.info(
            `CHECK: E2EE channel with participant ${id} is ready. Ready for KEY_INFO`
        );
    }

    /**
     * Internal helper for encrypting the current key information for a given participant.
     *
     * @param {Olm.Session} session - Participant's session.
     * @returns {string} - The encrypted text with the key information.
     * @private
     */
    _encryptKeyInfo(session) {
        let keyInfo: KeyInfo = { encryptionKey: undefined, index: -1 };

        if (this._mediaKeyOlm !== undefined) {
            keyInfo.encryptionKey = this._mediaKeyOlm
                ? base64js.fromByteArray(this._mediaKeyOlm)
                : false;
            keyInfo.index = this._mediaKeyIndex;
        }

        return session.encrypt(JSON.stringify(keyInfo));
    }

    /**
     * Internal helper for encrypting the current key information via pq channel for a given participant.
     *
     * @param {Uint8Array} pqSessionKey - Participant's pq session key
     * @returns {Uint8Array, Uint8Array} - The encrypted text with the key information.
     * @private
     */
    async _encryptKeyInfoPQ(
        pqSessionKey: Uint8Array
    ): Promise<{ ciphertextStr: Uint8Array; ivStr: Uint8Array }> {
        const mediaKey = this._mediaKeyPQ;

        if (pqSessionKey === undefined || pqSessionKey.length === 0) {
            throw new Error("[KEY_ENCRYPTION]: pqSessionKey is undefined");
        }
        if (mediaKey === undefined || mediaKey.length === 0) {
            throw new Error("[KEY_ENCRYPTION]:media key is undefined");
        }

        try {
            const { ciphertext, iv } = await encryptSymmetric(
                mediaKey,
                pqSessionKey
            );
            const ciphertextStr = base64js.fromByteArray(
                Buffer.from(ciphertext)
            );
            const ivStr = base64js.fromByteArray(iv);

            return { ciphertextStr, ivStr };
        } catch (error) {
            throw new Error(
                `[KEY_ENCRYPTION]: _encryptKeyInfoPQ failed: ${error}`
            );
        }
    }

    /**
     * Internal helper for encrypting the current key information via pq channel for a given participant.
     *
     * @param {Uint8Array} ciphertext - The ciphertext
     * @param {Uint8Array} iv - The IV
     * @param {Uint8Array} pqSessionKey - Participant's pq session key
     * @returns {Uint8Array} - The encrypted text with the key information.
     * @private
     */
    async _decryptKeyInfoPQ(
        ciphertext: Uint8Array,
        iv: Uint8Array,
        pqSessionKey: Uint8Array
    ): Promise<Uint8Array> {
        if (ciphertext === undefined || ciphertext.length === 0) {
            throw new Error("[KEY_DECRYPTION]: ciphertext is undefined");
        }
        if (iv === undefined || iv.length === 0) {
            return Promise.reject(
                new Error("[KEY_DECRYPTION]: iv is undefined")
            );
        }
        if (pqSessionKey === undefined || pqSessionKey.byteLength === 0) {
            return Promise.reject(
                new Error("[KEY_DECRYPTION]: key is undefined")
            );
        }

        try {
            const ciphertextArray = Buffer.from(
                base64js.toByteArray(ciphertext),
                "base64"
            );
            const ivArray = base64js.toByteArray(iv);
            const plaintext = await decryptSymmetric(
                ciphertextArray,
                ivArray,
                pqSessionKey
            );
            // const plaintextBuffer = Buffer.from(plaintext, 'base64');

            return new Uint8Array(plaintext);
        } catch (error) {
            throw new Error(
                `[KEY_DECRYPTION]: _decryptKeyInfoPQ failed: ${error}`
            );
        }
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
        await this._init;

        for (const participant of this._conf.getParticipants()) {
            this._onParticipantLeft(participant);
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
            logger.warn(
                "_onEndpointMessageReceived: Incorrectly formatted message: "
            );

            return;
        }

        await this._init;

        const msg = payload.olm;
        const pId = participant.getId();
        const olmData = this._getParticipantOlmData(participant);
        const peerName = participant.getDisplayName();

        switch (msg.type) {
            case OLM_MESSAGE_TYPES.SESSION_INIT: {
                logger.info(`Got SESSION_INIT from ${peerName}`);

                if (olmData.session) {
                    logger.error(
                        `SESSION_INIT: Session with ${peerName} already established`
                    );
                    this._sendError(
                        participant,
                        `SESSION_INIT: Session with ${peerName} already established`
                    );
                } else {
                    let kyberCiphertext;

                    try {
                        this.eventEmitter.emit(OlmAdapterEvents.GENERATE_KEYS);

                        // Create a session for communicating with this participant.
                        const session = new window.Olm.Session();

                        session.create_outbound(
                            this._olmAccount,
                            msg.data.idKey,
                            msg.data.otKey
                        );
                        olmData.session = session;

                        const participantEncapsulationKey: Uint8Array =
                            base64js.toByteArray(msg.data.publicKey);

                        const { ciphertext, sharedSecret } =
                            await this._encapsulateKey(
                                participantEncapsulationKey
                            );

                        kyberCiphertext = base64js.fromByteArray(ciphertext);
                        olmData._kemSecret = sharedSecret;
                    } catch (error) {
                        logger.error(`SESSION_INIT failed for ${peerName}`);
                        this._sendError(
                            participant,
                            `SESSION_INIT failed for ${peerName}`
                        );
                    }
                    const publicKeyString = base64js.fromByteArray(
                        this._publicKey
                    );

                    // Send ACK
                    const ack = {
                        [JITSI_MEET_MUC_TYPE]: OLM_MESSAGE_TYPE,
                        olm: {
                            type: OLM_MESSAGE_TYPES.PQ_SESSION_INIT,
                            data: {
                                uuid: msg.data.uuid,
                                publicKey: publicKeyString,
                                pqCiphertext: kyberCiphertext,
                            },
                        },
                    };

                    this._sendMessage(ack, pId);
                }
                break;
            }
            case OLM_MESSAGE_TYPES.PQ_SESSION_INIT: {
                logger.info(`CHECK: Got PQ_SESSION_INIT from ${peerName}`);

                if (olmData.pqSessionKey) {
                    logger.error(
                        `PQ_SESSION_INIT: Session for ${peerName} already established`
                    );

                    this._sendError(
                        participant,
                        `PQ_SESSION_INIT: Session for ${peerName} already established`
                    );
                } else {
                    // Create a session for communicating with this participant.
                    let kyberCiphertext;

                    try {
                        const pqCiphertext = base64js.toByteArray(
                            msg.data.pqCiphertext
                        );

                        const { sharedSecret: decapsilatedSecret } =
                            await this._decapsulateKey(
                                pqCiphertext,
                                this._privateKey
                            );

                        const participantPublicKey64 = base64js.toByteArray(
                            msg.data.publicKey
                        );
                        const { ciphertext, sharedSecret } =
                            await this._encapsulateKey(participantPublicKey64);

                        olmData.pqSessionKey = await this.deriveKey(
                            decapsilatedSecret,
                            sharedSecret
                        );

                        kyberCiphertext = base64js.fromByteArray(ciphertext);
                    } catch (error) {
                        logger.error(`PQ_SESSION_INIT failed for ${peerName}`);

                        this._sendError(
                            participant,
                            `PQ_SESSION_INIT failed for ${peerName}`
                        );
                    }

                    // Send ACK
                    const ack = {
                        [JITSI_MEET_MUC_TYPE]: OLM_MESSAGE_TYPE,
                        olm: {
                            type: OLM_MESSAGE_TYPES.PQ_SESSION_ACK,
                            data: {
                                uuid: msg.data.uuid,
                                pqCiphertext: kyberCiphertext,
                            },
                        },
                    };
                    logger.info(`Send PQ_SESSION_ACK to ${peerName}`);
                    this._sendMessage(ack, pId);
                }
                break;
            }
            case OLM_MESSAGE_TYPES.PQ_SESSION_ACK: {
                logger.info(`Got PQ_SESSION_ACK from ${peerName}`);

                if (olmData.pqSessionKey) {
                    logger.error(
                        `PQ_SESSION_ACK: Session with ${peerName} is already established`
                    );

                    this._sendError(
                        participant,
                        `PQ_SESSION_ACK: Session with ${peerName} is already established`
                    );
                } else {
                    try {
                        const pqCiphertext = base64js.toByteArray(
                            msg.data.pqCiphertext
                        );

                        const { sharedSecret: decapsilatedSecret } =
                            await this._decapsulateKey(
                                pqCiphertext,
                                this._privateKey
                            );

                        olmData.pqSessionKey = await this.deriveKey(
                            olmData._kemSecret,
                            decapsilatedSecret
                        );
                    } catch (error) {
                        logger.error(`PQ_SESSION_ACK failed for ${peerName}`);

                        this._sendError(
                            participant,
                            `PQ_SESSION_ACK failed for ${peerName}`
                        );
                    }

                    const ack = {
                        [JITSI_MEET_MUC_TYPE]: OLM_MESSAGE_TYPE,
                        olm: {
                            type: OLM_MESSAGE_TYPES.SESSION_ACK,
                            data: {
                                ciphertext: this._encryptKeyInfo(
                                    olmData.session
                                ),
                                uuid: msg.data.uuid,
                            },
                        },
                    };

                    this._sendMessage(ack, pId);

                    this._onParticipantE2EEChannelReady(peerName);
                }
                break;
            }
            case OLM_MESSAGE_TYPES.SESSION_ACK: {
                logger.info(`Got SESSION_ACK from ${peerName}`);

                if (olmData.session) {
                    logger.warn(
                        `Session with ${peerName} is already established`
                    );

                    this._sendError(
                        participant,
                        `Session  with ${peerName} is already established`
                    );
                } else if (msg.data.uuid === olmData.pendingSessionUuid) {
                    const { ciphertext } = msg.data;
                    const d = this._reqs.get(msg.data.uuid);
                    const session = new window.Olm.Session();

                    session.create_inbound(this._olmAccount, ciphertext.body);

                    // Remove OT keys that have been used to setup this session.
                    this._olmAccount.remove_one_time_keys(session);
                    olmData.session = session;
                    olmData.pendingSessionUuid = undefined;

                    this._onParticipantE2EEChannelReady(peerName);

                    this._reqs.delete(msg.data.uuid);
                    d.resolve();
                } else {
                    logger.error(`SESSION_ACK wrong UUID for ${peerName}`);

                    this._sendError(
                        participant,
                        `SESSION_ACK wrong UUID for ${peerName}`
                    );
                }
                break;
            }
            case OLM_MESSAGE_TYPES.ERROR: {
                logger.error(msg.data.error);

                break;
            }
            case OLM_MESSAGE_TYPES.KEY_INFO: {
                logger.info(`Got KEY_INFO from ${peerName}`);

                if (olmData.session && olmData.pqSessionKey) {
                    const { ciphertext, pqCiphertext, iv } = msg.data;
                    logger.info(`KEY_INFO from ${peerName}: we entered if and ciphertext is ${ciphertext.type}
                        and ${ciphertext.body}`);
                    const data = olmData.session.decrypt(
                        ciphertext.type,
                        ciphertext.body
                    );
                    logger.info(
                        `KEY_INFO from ${peerName}: dec result is ${data}`
                    );
                    const json = safeJsonParse(data);
                    logger.info(`KEY_INFO from ${peerName}: we decrypted ecc`);

                    const pqKey = await this._decryptKeyInfoPQ(
                        pqCiphertext,
                        iv,
                        olmData.pqSessionKey
                    );
                    logger.info(
                        `KEY_INFO from ${peerName}: we decrypted kyber`
                    );
                    logger.info(
                        `KEY_INFO from ${peerName}: we have ${json.encryptionKey}, and ${pqKey} and index ${json.index}`
                    );

                    if (
                        json.encryptionKey !== undefined &&
                        pqKey !== undefined &&
                        json.index !== undefined
                    ) {
                        logger.info(
                            `KEY_INFO from ${peerName}: we entered another if`
                        );
                        const key = json.encryptionKey
                            ? base64js.toByteArray(json.encryptionKey)
                            : false;

                        if (!isEqual(olmData.lastKey, key)) {
                            logger.info(
                                `KEY_INFO from ${peerName}: we entered yet another if, unbelivable`
                            );
                            olmData.lastKey = key;
                            const mediaKey = await this.deriveKey(key, pqKey);

                            logger.info(
                                `KEY_INFO: Media key for ${peerName} is ${base64js.fromByteArray(
                                    mediaKey
                                )}`
                            );

                            this.eventEmitter.emit(
                                OlmAdapterEvents.PARTICIPANT_KEY_UPDATED,
                                pId,
                                mediaKey,
                                this._mediaKeyIndex++
                            );
                        }

                        const { ciphertextStr, ivStr } =
                            await this._encryptKeyInfoPQ(olmData.pqSessionKey);

                        // Send ACK.
                        const ack = {
                            [JITSI_MEET_MUC_TYPE]: OLM_MESSAGE_TYPE,
                            olm: {
                                type: OLM_MESSAGE_TYPES.KEY_INFO_ACK,
                                data: {
                                    ciphertext: this._encryptKeyInfo(
                                        olmData.session
                                    ),
                                    pqCiphertext: ciphertextStr,
                                    iv: ivStr,
                                    uuid: msg.data.uuid,
                                },
                            },
                        };

                        this._sendMessage(ack, pId);
                    }
                } else {
                    logger.error(
                        `Received KEY_INFO from ${peerName}) but we have no session for them!`
                    );

                    this._sendError(
                        participant,
                        `Received KEY_INFO from ${peerName} but we have no session for them!`
                    );
                }
                break;
            }
            case OLM_MESSAGE_TYPES.KEY_INFO_ACK: {
                logger.info(`Got KEY_INFO_ACK from ${peerName}`);

                if (olmData.session && olmData.pqSessionKey) {
                    const { ciphertext, pqCiphertext, iv } = msg.data;
                    const data = olmData.session.decrypt(
                        ciphertext.type,
                        ciphertext.body
                    );
                    const json = safeJsonParse(data);

                    const pqKey = await this._decryptKeyInfoPQ(
                        pqCiphertext,
                        iv,
                        olmData.pqSessionKey
                    );

                    if (
                        json.encryptionKey !== undefined &&
                        pqKey !== undefined &&
                        json.index !== undefined
                    ) {
                        const key = json.encryptionKey
                            ? base64js.toByteArray(json.encryptionKey)
                            : false;

                        if (!isEqual(olmData.lastKey, key)) {
                            olmData.lastKey = key;
                            const mediaKey = await this.deriveKey(key, pqKey);

                            logger.info(
                                `KEY_INFO_ACK: media key for ${peerName} is ${base64js.fromByteArray(
                                    mediaKey
                                )}`
                            );

                            this.eventEmitter.emit(
                                OlmAdapterEvents.PARTICIPANT_KEY_UPDATED,
                                pId,
                                mediaKey,
                                this._mediaKeyIndex++
                            );
                        }
                    }
                    const d = this._reqs.get(msg.data.uuid);

                    this._reqs.delete(msg.data.uuid);

                    d.resolve();
                } else {
                    logger.error(
                        `Received KEY_INFO_ACK from ${peerName} but we have no session for them!`
                    );
                    this._sendError(
                        participant,
                        `Received KEY_INFO_ACK from ${peerName} but we have no session for them!`
                    );
                }
                break;
            }
            case OLM_MESSAGE_TYPES.SAS_START: {
                if (!olmData.session) {
                    logger.error(
                        `Received sas init message from ${pId} but we have no session for them!`
                    );

                    this._sendError(
                        participant,
                        "No session found while processing sas-init"
                    );

                    return;
                }

                if (olmData.sasVerification?.sas) {
                    logger.warn(`SAS already created for participant ${pId}`);
                    this.eventEmitter.emit(
                        OlmAdapterEvents.PARTICIPANT_VERIFICATION_COMPLETED,
                        pId,
                        false,
                        E2EEErrors.E2EE_SAS_INVALID_SAS_VERIFICATION
                    );

                    return;
                }

                const { transactionId } = msg.data;

                const sas = new window.Olm.SAS();

                olmData.sasVerification = {
                    sas,
                    transactionId,
                    isInitiator: false,
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
                            commitment,
                        },
                    },
                };

                this._sendMessage(acceptMessage, pId);
                break;
            }
            case OLM_MESSAGE_TYPES.SAS_ACCEPT: {
                if (!olmData.session) {
                    logger.error(
                        `Received sas accept message from ${pId} but we have no session!`
                    );

                    this._sendError(
                        participant,
                        "No session found while processing sas-accept"
                    );

                    return;
                }

                const { commitment, transactionId } = msg.data;

                if (!olmData.sasVerification) {
                    logger.warn(
                        `SAS_ACCEPT Participant ${pId} does not have valid sasVerification`
                    );
                    this.eventEmitter.emit(
                        OlmAdapterEvents.PARTICIPANT_VERIFICATION_COMPLETED,
                        pId,
                        false,
                        E2EEErrors.E2EE_SAS_INVALID_SAS_VERIFICATION
                    );

                    return;
                }

                if (olmData.sasVerification.sasCommitment) {
                    logger.error(
                        `Already received sas commitment message from ${pId}!`
                    );

                    this._sendError(
                        participant,
                        "Already received sas commitment message from ${pId}!"
                    );

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
                            transactionId,
                        },
                    },
                };

                this._sendMessage(keyMessage, pId);

                olmData.sasVerification.keySent = true;
                break;
            }
            case OLM_MESSAGE_TYPES.SAS_KEY: {
                if (!olmData.session) {
                    logger.error(
                        `Received sas key message from ${pId} but we have no session for them!`
                    );

                    this._sendError(
                        participant,
                        "No session found while processing sas-key"
                    );

                    return;
                }

                if (!olmData.sasVerification) {
                    logger.warn(
                        `SAS_KEY Participant ${pId} does not have valid sasVerification`
                    );
                    this.eventEmitter.emit(
                        OlmAdapterEvents.PARTICIPANT_VERIFICATION_COMPLETED,
                        pId,
                        false,
                        E2EEErrors.E2EE_SAS_INVALID_SAS_VERIFICATION
                    );

                    return;
                }

                const {
                    isInitiator,
                    sas,
                    sasCommitment,
                    startContent,
                    keySent,
                } = olmData.sasVerification;

                if (sas.is_their_key_set()) {
                    logger.warn("SAS already has their key!");

                    return;
                }

                const { key: theirKey, transactionId } = msg.data;

                if (sasCommitment) {
                    const commitment = this._computeCommitment(
                        theirKey,
                        startContent
                    );

                    if (sasCommitment !== commitment) {
                        this._sendError(
                            participant,
                            "OlmAdapter commitments mismatched"
                        );
                        this.eventEmitter.emit(
                            OlmAdapterEvents.PARTICIPANT_VERIFICATION_COMPLETED,
                            pId,
                            false,
                            E2EEErrors.E2EE_SAS_COMMITMENT_MISMATCHED
                        );
                        olmData.sasVerification.free();

                        return;
                    }
                }

                sas.set_their_key(theirKey);

                const pubKey = sas.get_pubkey();

                const myInfo = `${this.myId}|${pubKey}`;
                const theirInfo = `${pId}|${theirKey}`;

                const info = isInitiator
                    ? `${myInfo}|${theirInfo}`
                    : `${theirInfo}|${myInfo}`;

                const sasBytes = sas.generate_bytes(info, OLM_SAS_NUM_BYTES);
                const generatedSas = generateSas(sasBytes);

                this.eventEmitter.emit(
                    OlmAdapterEvents.PARTICIPANT_SAS_READY,
                    pId,
                    generatedSas
                );

                if (keySent) {
                    return;
                }

                const keyMessage = {
                    [JITSI_MEET_MUC_TYPE]: OLM_MESSAGE_TYPE,
                    olm: {
                        type: OLM_MESSAGE_TYPES.SAS_KEY,
                        data: {
                            key: pubKey,
                            transactionId,
                        },
                    },
                };

                this._sendMessage(keyMessage, pId);

                olmData.sasVerification.keySent = true;
                break;
            }
            case OLM_MESSAGE_TYPES.SAS_MAC: {
                if (!olmData.session) {
                    logger.error(
                        `Received sas mac message from ${pId} but we have no session for them!`
                    );

                    this._sendError(
                        participant,
                        "No session found while processing sas-mac"
                    );

                    return;
                }

                const { keys, mac, transactionId } = msg.data;

                if (!mac || !keys) {
                    logger.warn("Invalid SAS MAC message");

                    return;
                }

                if (!olmData.sasVerification) {
                    logger.warn(
                        `SAS_MAC Participant ${pId} does not have valid sasVerification`
                    );

                    return;
                }

                const sas = olmData.sasVerification.sas;

                // Verify the received MACs.
                const baseInfo = `${OLM_KEY_VERIFICATION_MAC_INFO}${pId}${this.myId}${transactionId}`;
                const keysMac = sas.calculate_mac(
                    Object.keys(mac).sort().join(","), // eslint-disable-line newline-per-chained-call
                    baseInfo + OLM_KEY_VERIFICATION_MAC_KEY_IDS
                );

                if (keysMac !== keys) {
                    logger.error("SAS verification error: keys MAC mismatch");
                    this.eventEmitter.emit(
                        OlmAdapterEvents.PARTICIPANT_VERIFICATION_COMPLETED,
                        pId,
                        false,
                        E2EEErrors.E2EE_SAS_KEYS_MAC_MISMATCH
                    );

                    return;
                }

                if (!olmData.ed25519) {
                    logger.warn("SAS verification error: Missing ed25519 key");

                    this.eventEmitter.emit(
                        OlmAdapterEvents.PARTICIPANT_VERIFICATION_COMPLETED,
                        pId,
                        false,
                        E2EEErrors.E2EE_SAS_MISSING_KEY
                    );

                    return;
                }

                for (const [keyInfo, computedMac] of Object.entries(mac)) {
                    const ourComputedMac = sas.calculate_mac(
                        olmData.ed25519,
                        baseInfo + keyInfo
                    );

                    if (computedMac !== ourComputedMac) {
                        logger.error("SAS verification error: MAC mismatch");
                        this.eventEmitter.emit(
                            OlmAdapterEvents.PARTICIPANT_VERIFICATION_COMPLETED,
                            pId,
                            false,
                            E2EEErrors.E2EE_SAS_MAC_MISMATCH
                        );

                        return;
                    }
                }

                this.eventEmitter.emit(
                    OlmAdapterEvents.PARTICIPANT_VERIFICATION_COMPLETED,
                    pId,
                    true
                );

                break;
            }
        }
    }

    /**
     * Handles a participant leaving. When a participant leaves their olm session is destroyed.
     *
     * @private
     */
    _onParticipantLeft(participant) {
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
    async _onParticipantPropertyChanged(
        participant: JitsiParticipant,
        name: string,
        oldValue,
        newValue
    ) {
        switch (name) {
            case "e2ee.enabled":
                if (newValue && !oldValue && this._conf.isE2EEEnabled()) {
                    if (!this._init) {
                        throw new Error(
                            "_onParticipantPropertyChanged is called before init"
                        );
                    }
                    await this.sendKeyInfoToAll();
                }
                break;
            case "e2ee.idKey.ed25519":
                const olmData = this._getParticipantOlmData(participant);
                olmData.ed25519 = newValue;
                const participantId = participant.getId();
                this.eventEmitter.emit(
                    OlmAdapterEvents.PARTICIPANT_SAS_AVAILABLE,
                    participantId
                );
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
                    error,
                },
            },
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
    _sendSessionInit(participant: JitsiParticipant) {
        logger.info(
            `CHECK: _sendSessionInit started for ${participant.getDisplayName()}`
        );
        const pId = participant.getId();
        const olmData = this._getParticipantOlmData(participant);

        if (olmData.session) {
            logger.warn(`Tried to send session-init to ${participant.getDisplayName()}
            but we already have a session`);

            return Promise.reject();
        }

        if (olmData.pendingSessionUuid !== undefined) {
            logger.warn(`Tried to send session-init to ${participant.getDisplayName()}
         but we already have a pending session`);

            return Promise.reject();
        }

        try {
            this.eventEmitter.emit(OlmAdapterEvents.GENERATE_KEYS);

            // Generate a One Time Key.
            this._olmAccount.generate_one_time_keys(1);

            const otKeys = _safeJsonParse(this._olmAccount.one_time_keys());
            const otKey = Object.values(otKeys.curve25519)[0];

            if (!otKey) {
                return Promise.reject(new Error("No one-time-keys generated"));
            }

            // Mark the OT keys (one really) as published so they are not reused.
            this._olmAccount.mark_keys_as_published();

            const publicKeyString = base64js.fromByteArray(this._publicKey);

            const uuid = uuidv4();
            const init = {
                [JITSI_MEET_MUC_TYPE]: OLM_MESSAGE_TYPE,
                olm: {
                    type: OLM_MESSAGE_TYPES.SESSION_INIT,
                    data: {
                        idKey: this._idKeys.curve25519,
                        otKey,
                        publicKey: publicKeyString,
                        uuid,
                    },
                },
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
        } catch (e) {
            logger.error(
                `_sendSessionInit failed for ${participant.getDisplayName()} with ${e}`
            );
            this._sendError(
                participant,
                `_sendSessionInit failed for ${participant.getDisplayName()} with ${e}`
            );
        }
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
            baseInfo + deviceKeyId
        );
        keyList.push(deviceKeyId);

        const keys = sas.calculate_mac(
            keyList.sort().join(","),
            baseInfo + OLM_KEY_VERIFICATION_MAC_KEY_IDS
        );

        const macMessage = {
            [JITSI_MEET_MUC_TYPE]: OLM_MESSAGE_TYPE,
            olm: {
                type: OLM_MESSAGE_TYPES.SAS_MAC,
                data: {
                    keys,
                    mac,
                    transactionId,
                },
            },
        };

        this._sendMessage(macMessage, pId);
    }

    /**
     * Computes the commitment.
     */
    _computeCommitment(pubKey, data) {
        const olmUtil = new window.Olm.Utility();
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
        return _safeJsonParse(data);
    } catch (e) {
        return {};
    }
}

OlmAdapter.events = OlmAdapterEvents;
