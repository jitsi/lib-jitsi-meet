/// <reference types="node" />

import { getLogger } from "@jitsi/logger";
import { debounce } from "lodash-es";

import * as JitsiConferenceEvents from "../../JitsiConferenceEvents";

import { KeyHandler } from "./KeyHandler";
import { OlmAdapter } from "./OlmAdapter";
import { importKey, ratchet } from "./crypto-utils";
import JitsiParticipant from "../../JitsiParticipant";

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
     * @returns {boolean}
     */
    async _setEnabled(enabled: boolean): Promise<boolean> {
        if (!enabled) {
            this._olmAdapter.clearAllParticipantsSessions();
            return false;
        }

        try {
            this._onKeyGeneration();
            await this._olmAdapter.initSessions();
            console.log(
                "CHECK: all olm sessions should be established now!!!!!!"
            );
            const mediaKeyIndex = await this._olmAdapter.updateKey(
                this._olmKey,
                this._pqKey
            );

            // Set our key so we begin encrypting.
            this.setKey(this._olmKey, this._pqKey, mediaKeyIndex);
        } catch (e) {
            console.log(`_setEnabled got error ${e}`);
            return false;
        }

        return true;
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
    _onParticipantLeft(id: string) {
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

        const index = await this._olmAdapter.updateKey(
            this._olmKey,
            this._pqKey
        );
        this.setKey(this._olmKey, this._pqKey, index);
    }

    setKey(olmKey: Uint8Array, pqKey: Uint8Array, index: number) {
        this.e2eeCtx.setKey(this.conference.myUserId(), olmKey, pqKey, index);
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

        const index = await this._olmAdapter.updateCurrentMediaKey(
            this._olmKey,
            this._pqKey
        );

        this.setKey(this._olmKey, this._pqKey, index);
    }

    /**
     * Handles an update in a participant's key.
     *
     * @param {string} id - The participant ID.
     * @param {Uint8Array | boolean} key - The new key for the participant.
     * @param {Number} index - The new key's index.
     * @private
     */
    _onParticipantKeyUpdated(
        id: string,
        olmKey: Uint8Array,
        pqKey: Uint8Array,
        index: number
    ) {
        logger.info(
            "CHECKPOINT: _onParticipantKeyUpdated called setKey with id",
            id,
            "olm key",
            olmKey,
            "pq key",
            pqKey,
            "index",
            index
        );
        this.e2eeCtx.setKey(id, olmKey, pqKey, index);
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
    _onParticipantSasReady(pId: string, sas: Uint8Array) {
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
    _onParticipantSasAvailable(pId: string) {
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
    _onParticipantVerificationCompleted(
        pId: string,
        success: boolean,
        message
    ) {
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
