/**
 * This module integrates {@link KeyHandler} with {@link JitsiConference} in order to enable E2E encryption.
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
    _externallyManaged: any;
    _keyHandler: ExternallyManagedKeyHandler | ManagedKeyHandler;
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
     * Sets the key and index for End-to-End encryption.
     *
     * @param {CryptoKey} [keyInfo.encryptionKey] - encryption key.
     * @param {Number} [keyInfo.index] - the index of the encryption key.
     * @returns {void}
     */
    setEncryptionKey(keyInfo: any): void;
}
import { ExternallyManagedKeyHandler } from "./ExternallyManagedKeyHandler";
import { ManagedKeyHandler } from "./ManagedKeyHandler";
