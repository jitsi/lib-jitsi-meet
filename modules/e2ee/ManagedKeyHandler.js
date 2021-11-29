/* global __filename */

import { getLogger } from 'jitsi-meet-logger';
import debounce from 'lodash.debounce';

import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';

import { KeyHandler } from './KeyHandler';
import { OlmAdapter } from './OlmAdapter';
import { importKey, ratchet } from './crypto-utils';

const logger = getLogger(__filename);

// Period which we'll wait before updating / rotating our keys when a participant
// joins or leaves.
const DEBOUNCE_PERIOD = 5000;

/**
 * This module integrates {@link E2EEContext} with {@link OlmAdapter} in order to distribute the keys for encryption.
 */
export class ManagedKeyHandler extends KeyHandler {
    /**
     * Build a new AutomaticKeyHandler instance, which will be used in a given conference.
     */
    constructor(conference) {
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
     * When E2EE is enabled it initializes sessions and sets the key.
     * Cleans up the sessions when disabled.
     *
     * @param {boolean} enabled - whether E2EE should be enabled or not.
     * @returns {void}
     */
    async _setEnabled(enabled) {
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
    async _ratchetKeyImpl() {
        logger.debug('Ratchetting key');

        const material = await importKey(this._key);
        const newKey = await ratchet(material);

        this._key = new Uint8Array(newKey);

        const index = this._olmAdapter.updateCurrentKey(this._key);

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
    _onParticipantKeyUpdated(id, key, index) {
        logger.debug(`Participant ${id} updated their key`);

        this.e2eeCtx.setKey(id, key, index);
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
