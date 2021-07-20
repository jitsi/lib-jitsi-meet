/**
 * This module integrates {@link E2EEContext} with {@link JitsiConference} in order to enable E2E encryption.
 */
export class E2EEncryption {
    /**
     * Indicates if E2EE is supported in the current platform.
     *
     * @param {object} config - Global configuration.
     * @returns {boolean}
     */
    static isSupported(config: object): boolean;
    /**
     * A constructor.
     * @param {JitsiConference} conference - The conference instance for which E2E encryption is to be enabled.
     */
    constructor(conference: any);
    conference: any;
    _conferenceJoined: boolean;
    _enabled: boolean;
    _initialized: boolean;
    _key: any;
    _signatureKeyPair: CryptoKeyPair;
    _e2eeCtx: E2EEContext;
    _olmAdapter: OlmAdapter;
    _ratchetKey: any;
    _rotateKey: any;
    /**
     * Indicates whether E2EE is currently enabled or not.
     *
     * @returns {boolean}
     */
    isEnabled(): boolean;
    /**
     * Enables / disables End-To-End encryption.
     *
     * @param {boolean} enabled - whether E2EE should be enabled or not.
     * @returns {void}
     */
    setEnabled(enabled: boolean): void;
    /**
     * Generates a new 256 bit random key.
     *
     * @returns {Uint8Array}
     * @private
     */
    private _generateKey;
    /**
     * Setup E2EE on the new track that has been added to the conference, apply it on all the open peerconnections.
     * @param {JitsiLocalTrack} track - the new track that's being added to the conference.
     * @private
     */
    private _onLocalTrackAdded;
    /**
     * Setups E2E encryption for the new session.
     * @param {JingleSessionPC} session - the new media session.
     * @private
     */
    private _onMediaSessionStarted;
    /**
     * Publushes our own Olmn id key in presence.
     * @private
     */
    private _onOlmIdKeyReady;
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
     * Event posted when the E2EE signalling channel has been established with the given participant.
     * @private
     */
    private _onParticipantE2EEChannelReady;
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
     * Advances the current key by using ratcheting.
     *
     * @private
     */
    private _ratchetKeyImpl;
    /**
     * Rotates the local key. Rotating the key implies creating a new one, then distributing it
     * to all participants and once they all received it, start using it.
     *
     * @private
     */
    private _rotateKeyImpl;
    /**
     * Setup E2EE for the receiving side.
     *
     * @private
     */
    private _setupReceiverE2EEForTrack;
    /**
     * Setup E2EE for the sending side.
     *
     * @param {JingleSessionPC} session - the session which sends the media produced by the track.
     * @param {JitsiLocalTrack} track - the local track for which e2e encoder will be configured.
     * @private
     */
    private _setupSenderE2EEForTrack;
    /**
     * Setup E2EE on the sender that is created for the unmuted local video track.
     * @param {JitsiLocalTrack} track - the track for which muted status has changed.
     * @private
     */
    private _trackMuteChanged;
}
import E2EEContext from "./E2EEContext";
import { OlmAdapter } from "./OlmAdapter";
