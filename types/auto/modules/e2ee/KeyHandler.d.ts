/**
 * Abstract class that integrates {@link E2EEContext} with a key management system.
 */
export class KeyHandler extends Listenable {
    /**
     * Build a new KeyHandler instance, which will be used in a given conference.
     * @param {JitsiConference} conference - the current conference.
     * @param {object} options - the options passed to {E2EEContext}, see implemention.
     */
    constructor(conference: any, options?: object);
    conference: any;
    e2eeCtx: E2EEContext;
    enabled: boolean;
    _enabling: Deferred;
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
     * Sets the key for End-to-End encryption.
     *
     * @returns {void}
     */
    setEncryptionKey(): void;
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
import Listenable from "../util/Listenable";
import E2EEContext from "./E2EEContext";
import Deferred from "../util/Deferred";
