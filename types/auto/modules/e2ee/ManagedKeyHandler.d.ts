/**
 * This module integrates {@link E2EEContext} with {@link OlmAdapter} in order to distribute the keys for encryption.
 */
export class ManagedKeyHandler extends KeyHandler {
    /**
     * Build a new AutomaticKeyHandler instance, which will be used in a given conference.
     */
    constructor(conference: any);
    _key: any;
    _conferenceJoined: boolean;
    _olmAdapter: OlmAdapter;
    _rotateKey: any;
    _ratchetKey: any;
    /**
     * When E2EE is enabled it initializes sessions and sets the key.
     * Cleans up the sessions when disabled.
     *
     * @param {boolean} enabled - whether E2EE should be enabled or not.
     * @returns {void}
     */
    _setEnabled(enabled: boolean): void;
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
     * Advances (using ratcheting) the current key when a new participant joins the conference.
     * @private
     */
    private _onParticipantJoined;
    /**
     * Rotates the current key when a participant leaves the conference.
     * @private
     */
    private _onParticipantLeft;
    /**
     * Rotates the local key. Rotating the key implies creating a new one, then distributing it
     * to all participants and once they all received it, start using it.
     *
     * @private
     */
    private _rotateKeyImpl;
    /**
     * Advances the current key by using ratcheting.
     *
     * @private
     */
    private _ratchetKeyImpl;
    /**
     * Handles an update in a participant's key.
     *
     * @param {string} id - The participant ID.
     * @param {Uint8Array | boolean} key - The new key for the participant.
     * @param {Number} index - The new key's index.
     * @private
     */
    private _onParticipantKeyUpdated;
    /**
     * Generates a new 256 bit random key.
     *
     * @returns {Uint8Array}
     * @private
     */
    private _generateKey;
}
import { KeyHandler } from "./KeyHandler";
import { OlmAdapter } from "./OlmAdapter";
