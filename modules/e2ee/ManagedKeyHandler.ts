import { getLogger } from '@jitsi/logger';
import { debounce } from 'lodash-es';

import JitsiConference from '../../JitsiConference';
import { JitsiConferenceEvents } from '../../JitsiConferenceEvents';
import JitsiParticipant from '../../JitsiParticipant';

import { KeyHandler } from './KeyHandler';
import { OlmAdapter } from './OlmAdapter';
import { importKey, ratchet } from './crypto-utils';

const logger = getLogger('e2ee:ManagedKeyHandler');

// Period which we'll wait before updating / rotating our keys when a participant
// joins or leaves.
const DEBOUNCE_PERIOD = 5000;

/**
 * This module integrates {@link E2EEContext} with {@link OlmAdapter} in order to distribute the keys for encryption.
 */
export class ManagedKeyHandler extends KeyHandler {
    private _key?: Uint8Array | boolean;
    private _conferenceJoined: boolean;
    private _olmAdapter: OlmAdapter;
    private _rotateKey: () => void;
    private _ratchetKey: () => void;

    /**
     * Build a new AutomaticKeyHandler instance, which will be used in a given conference.
     */
    constructor(conference: JitsiConference) {
        super(conference);

        this._key = undefined;
        this._conferenceJoined = false;

        this._olmAdapter = new OlmAdapter(conference);

        this._rotateKey = debounce(this._rotateKeyImpl, DEBOUNCE_PERIOD);
        this._ratchetKey = debounce(this._ratchetKeyImpl, DEBOUNCE_PERIOD);

        // Olm signalling events.
        this._olmAdapter.on(
            OlmAdapter.events.PARTICIPANT_KEY_UPDATED,
            this._onParticipantKeyUpdated.bind(this));

        this._olmAdapter.on(
            OlmAdapter.events.PARTICIPANT_SAS_READY,
            this._onParticipantSasReady.bind(this));

        this._olmAdapter.on(
            OlmAdapter.events.PARTICIPANT_SAS_AVAILABLE,
            this._onParticipantSasAvailable.bind(this));

        this._olmAdapter.on(
            OlmAdapter.events.PARTICIPANT_VERIFICATION_COMPLETED,
            this._onParticipantVerificationCompleted.bind(this));

        this.conference.on(
            JitsiConferenceEvents.PARTICIPANT_PROPERTY_CHANGED,
            this._onParticipantPropertyChanged.bind(this));
        this.conference.on(
            JitsiConferenceEvents.USER_JOINED,
            this._onParticipantJoined.bind(this));
        this.conference.on(
            JitsiConferenceEvents.USER_LEFT,
            this._onParticipantLeft.bind(this));
        this.conference.on(
                JitsiConferenceEvents.CONFERENCE_JOINED,
                () => {
                    this._conferenceJoined = true;
                });
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
    private _onParticipantPropertyChanged(participant: JitsiParticipant, name: string, oldValue: any, newValue: any): void {
        switch (name) {
        case 'e2ee.idKey':
            logger.debug(`Participant ${participant.getId()} updated their id key: ${newValue}`);
            break;
        case 'e2ee.enabled':
            if (!newValue && this.enabled) {
                this._olmAdapter.clearParticipantSession(participant);
            }
            break;
        }
    }

    /**
     * Advances (using ratcheting) the current key when a new participant joins the conference.
     * @private
     */
    private _onParticipantJoined(): void {
        if (this._conferenceJoined && this.enabled) {
            this._ratchetKey();
        }
    }

    /**
     * Rotates the current key when a participant leaves the conference.
     * @private
     */
    private _onParticipantLeft(id: string): void {
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
    private async _rotateKeyImpl(): Promise<void> {
        logger.debug('Rotating key');

        this._key = this._generateKey();
        const index = await this._olmAdapter.updateKey(this._key);

        this.e2eeCtx.setKey(this.conference.myUserId(), this._key, index);
    }

    /**
     * Advances the current key by using ratcheting.
     *
     * @private
     */
    private async _ratchetKeyImpl(): Promise<void> {
        logger.debug('Ratchetting key');

        const material = await importKey(this._key as unknown as ArrayBuffer);
        const newKey = await ratchet(material);

        this._key = new Uint8Array(newKey);

        const index = this._olmAdapter.updateCurrentMediaKey(this._key);

        this.e2eeCtx.setKey(this.conference.myUserId(), this._key, index);
    }

    /**
     * Handles an update in a participant's key.
     *
     * @param {string} id - The participant ID.
     * @param {Uint8Array | boolean} key - The new key for the participant.
     * @param {Number} index - The new key's index.
     * @private
     */
    private _onParticipantKeyUpdated(id: string, key: Uint8Array | boolean, index: number): void {
        logger.debug(`Participant ${id} updated their key`);

        this.e2eeCtx.setKey(id, key, index);
    }

    /**
     * Handles the SAS ready event.
     *
     * @param {string} pId - The participant ID.
     * @param {Uint8Array} sas - The bytes from sas.generate_bytes..
     * @private
     */
    private _onParticipantSasReady(pId: string, sas: Uint8Array): void {
        this.conference.eventEmitter.emit(JitsiConferenceEvents.E2EE_VERIFICATION_READY, pId, sas);
    }

    /**
     * Handles the sas available event.
     *
     * @param {string} pId - The participant ID.
     * @private
     */
    private _onParticipantSasAvailable(pId: string): void {
        this.conference.eventEmitter.emit(JitsiConferenceEvents.E2EE_VERIFICATION_AVAILABLE, pId);
    }

    /**
     * Handles the SAS completed event.
     *
     * @param {string} pId - The participant ID.
     * @param {boolean} success - Wheter the verification was succesfull.
     * @private
     */
    private _onParticipantVerificationCompleted(pId: string, success: boolean, message?: string): void {
        this.conference.eventEmitter.emit(JitsiConferenceEvents.E2EE_VERIFICATION_COMPLETED, pId, success, message);
    }

    /**
     * Generates a new 256 bit random key.
     *
     * @returns {Uint8Array}
     * @private
     */
    private _generateKey(): Uint8Array {
        return window.crypto.getRandomValues(new Uint8Array(32));
    }

    /**
     * When E2EE is enabled it initializes sessions and sets the key.
     * Cleans up the sessions when disabled.
     *
     * @param {boolean} enabled - whether E2EE should be enabled or not.
     * @returns {void}
     */
    protected override _setEnabled = async (enabled: boolean): Promise<void> => {
        if (enabled) {
            await this._olmAdapter.initSessions();
        } else {
            this._olmAdapter.clearAllParticipantsSessions();
        }

        // Generate a random key in case we are enabling.
        this._key = enabled ? this._generateKey() : false;

        // Send it to others using the E2EE olm channel.
        const index = await this._olmAdapter.updateKey(this._key);

        // Set our key so we begin encrypting.
        this.e2eeCtx.setKey(this.conference.myUserId(), this._key, index);
    };


    /**
     * Returns the sasVerficiation object.
     *
     * @returns {Object}
     */
    get sasVerification(): OlmAdapter {
        return this._olmAdapter;
    }
}
