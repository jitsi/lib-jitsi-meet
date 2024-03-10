/// <reference types="node" />

import { getLogger } from "@jitsi/logger";
import base64js from "base64-js";
import { debounce } from "lodash-es";

import * as JitsiConferenceEvents from "../../JitsiConferenceEvents";

import { KeyHandler, KeyInfo } from "./KeyHandler";
import { OlmAdapter } from "./OlmAdapter";
import { importKey, ratchet } from "./crypto-utils";

const logger = getLogger(__filename);

// Period which we'll wait before updating / rotating our keys when a participant
// joins or leaves.
const DEBOUNCE_PERIOD = 5000;

/**
 * This module integrates {@link E2EEContext} with {@link OlmAdapter} in order to distribute the keys for encryption.
 */
export class ManagedKeyHandler extends KeyHandler {
    private _pqKey: Uint8Array;
    private _olmKey: Uint8Array;
    private _conferenceJoined: boolean;
    _rotateKey: any;
    _ratchetKey: any;
    /**
     * Build a new AutomaticKeyHandler instance, which will be used in a given conference.
     */
    constructor(conference) {
        super(conference);

        this._pqKey = undefined;
        this._olmKey = undefined;
        this._conferenceJoined = false;

        this._olmAdapter = new OlmAdapter(conference);

        this._rotateKey = debounce(this._rotateKeyImpl, DEBOUNCE_PERIOD);
        this._ratchetKey = debounce(this._ratchetKeyImpl, DEBOUNCE_PERIOD);

        // Olm signalling events.
        this._olmAdapter.on(
            OlmAdapter.events.PARTICIPANT_KEY_UPDATED,
            this._onParticipantKeyUpdated.bind(this)
        );
        this._olmAdapter.on(
            OlmAdapter.events.GENERATE_KEYS,
            this._onKeyGeneration.bind(this)
        );

        this._olmAdapter.on(
            OlmAdapter.events.GENERATE_KEYS,
            this._onKeyGeneration.bind(this)
        );

        this._olmAdapter.on(
            OlmAdapter.events.PARTICIPANT_SAS_READY,
            this._onParticipantSasReady.bind(this)
        );

        this._olmAdapter.on(
            OlmAdapter.events.PARTICIPANT_SAS_AVAILABLE,
            this._onParticipantSasAvailable.bind(this)
        );

        this._olmAdapter.on(
            OlmAdapter.events.PARTICIPANT_VERIFICATION_COMPLETED,
            this._onParticipantVerificationCompleted.bind(this)
        );

        this.conference.on(
            JitsiConferenceEvents.PARTICIPANT_PROPERTY_CHANGED,
            this._onParticipantPropertyChanged.bind(this)
        );
        this.conference.on(
            JitsiConferenceEvents.USER_JOINED,
            this._onParticipantJoined.bind(this)
        );
        this.conference.on(
            JitsiConferenceEvents.USER_LEFT,
            this._onParticipantLeft.bind(this)
        );
        this.conference.on(JitsiConferenceEvents.CONFERENCE_JOINED, () => {
            this._conferenceJoined = true;
        });
    }

    /**
     * When E2EE is enabled it initializes sessions and sets the key.
     * Cleans up the sessions when disabled.
     *
     * @param {boolean} enabled - whether E2EE should be enabled or not.
     * @returns {void}
     */
    async _setEnabled(enabled) {
        if (!enabled) {
            this._olmAdapter.clearAllParticipantsSessions();
        }

        // Generate a random key in case we are enabling.
        this._onKeyGeneration();

        const { mediaKeyIndex, mediaKey } =
            await this._olmAdapter.initSessionsAndSetMediaKey(
                this._olmKey,
                this._pqKey
            );

        logger.info(`CHECKPOINT: my media key is ${base64js.fromByteArray(
            mediaKey
        )} or ${mediaKey} and
        index is ${mediaKeyIndex}`);

        // Set our key so we begin encrypting.
        this.setKey({ encryptionKey: mediaKey, index: mediaKeyIndex });
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
        if (newValue !== oldValue) {
            switch (name) {
                case "e2ee.idKey":
                    logger.debug(
                        `Participant ${participant.getId()} updated their id key: ${newValue}`
                    );
                    break;
                case "e2ee.enabled":
                    if (!newValue && this.enabled) {
                        this._olmAdapter.clearParticipantSession(participant);
                    }
                    break;
            }
        }
    }

    /**
     * Advances (using ratcheting) the current key when a new participant joins the conference.
     * @private
     */
    _onParticipantJoined() {
        if (this._conferenceJoined && this.enabled) {
            this._ratchetKey();
        }
    }

    /**
     * Rotates the current key when a participant leaves the conference.
     * @private
     */
    _onParticipantLeft(id) {
        this.e2eeCtx.cleanup(id);

        if (this.enabled) {
            this._rotateKey();
        }
    }

    /**
     * Rotates the local key. Rotating the key implies creating a new one, then distributing it
     * to all participants and once they all received it, start using it.
     *
     * @private
     */
    async _rotateKeyImpl() {
        this._onKeyGeneration();

        let index;
        let key;

        try {
            const { mediaKeyIndex, mediaKey } =
                await this._olmAdapter.updateKey(this._olmKey, this._pqKey);

            index = mediaKeyIndex;
            key = mediaKey;
        } catch (error) {
            console.log("[ERROR_KEY_DERIVATION]: Cannot ratchet key ", error);
        }

        logger.info(`CHECKPOINT: my media key is ${base64js.fromByteArray(
            key
        )} and
        index is ${index}`);
        this.setKey({ encryptionKey: key, index });
    }

    setKey(keyInfo: KeyInfo) {
        this.e2eeCtx.setKey(
            this.conference.myUserId(),
            keyInfo.encryptionKey,
            keyInfo.index
        );
    }
    /**
     * Advances the current key by using ratcheting.
     *
     * @private
     */
    async _ratchetKeyImpl() {
        logger.debug("Ratchetting keys");

        const olmMaterial = await importKey(this._olmKey);
        this._olmKey = await ratchet(olmMaterial);

        const pqMaterial = await importKey(this._pqKey);
        this._pqKey = await ratchet(pqMaterial);

        const { key, index } = await this._olmAdapter.updateCurrentMediaKey(
            this._olmKey,
            this._pqKey
        );

        logger.info(`CHECKPOINT: my media key is ${base64js.fromByteArray(key)}
        and index is ${index}`);
        this.setKey({ encryptionKey: key, index });
    }

    /**
     * Handles an update in a participant's key.
     *
     * @param {string} id - The participant ID.
     * @param {Uint8Array | boolean} key - The new key for the participant.
     * @param {Number} index - The new key's index.
     * @private
     */
    _onParticipantKeyUpdated(id, key, index) {
        logger.info(`CHECKPOINT: Participant ${id} updated their key ${base64js.fromByteArray(
            key
        )} and
        index is ${index}`);
        this.e2eeCtx.setKey(id, key, index);
    }

    /**
     * Generates keys.
     *
     * @private
     */
    _onKeyGeneration() {
        if (!this._olmKey && !this._pqKey) {
            this._olmKey = this._generateKey();
            this._pqKey = this._generateKey();
            this._olmAdapter.updateCurrentMediaKey(this._olmKey, this._pqKey);
        }
    }

    /**
     * Handles the SAS ready event.
     *
     * @param {string} pId - The participant ID.
     * @param {Uint8Array} sas - The bytes from sas.generate_bytes..
     * @private
     */
    _onParticipantSasReady(pId, sas) {
        this.conference.eventEmitter.emit(
            JitsiConferenceEvents.E2EE_VERIFICATION_READY,
            pId,
            sas
        );
    }

    /**
     * Handles the sas available event.
     *
     * @param {string} pId - The participant ID.
     * @private
     */
    _onParticipantSasAvailable(pId) {
        this.conference.eventEmitter.emit(
            JitsiConferenceEvents.E2EE_VERIFICATION_AVAILABLE,
            pId
        );
    }

    /**
     * Handles the SAS completed event.
     *
     * @param {string} pId - The participant ID.
     * @param {boolean} success - Wheter the verification was succesfull.
     * @private
     */
    _onParticipantVerificationCompleted(pId, success, message) {
        this.conference.eventEmitter.emit(
            JitsiConferenceEvents.E2EE_VERIFICATION_COMPLETED,
            pId,
            success,
            message
        );
    }

    /**
     * Generates a new 256 bit random key.
     *
     * @returns {Uint8Array}
     * @private
     */
    _generateKey() {
        return window.crypto.getRandomValues(new Uint8Array(32));
    }
}
