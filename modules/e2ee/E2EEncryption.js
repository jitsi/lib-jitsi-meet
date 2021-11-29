import browser from '../browser';

import { ExternallyManagedKeyHandler } from './ExternallyManagedKeyHandler';
import { ManagedKeyHandler } from './ManagedKeyHandler';
import { OlmAdapter } from './OlmAdapter';

/**
 * This module integrates {@link KeyHandler} with {@link JitsiConference} in order to enable E2E encryption.
 */
export class E2EEncryption {
    /**
     * A constructor.
     * @param {JitsiConference} conference - The conference instance for which E2E encryption is to be enabled.
     */
    constructor(conference) {
        const { e2ee = {} } = conference.options.config;

        this._externallyManaged = e2ee.externallyManagedKey;

        if (this._externallyManaged) {
            this._keyHandler = new ExternallyManagedKeyHandler(conference);
        } else {
            this._keyHandler = new ManagedKeyHandler(conference);
        }
    }

    /**
     * Indicates if E2EE is supported in the current platform.
     *
     * @param {object} config - Global configuration.
     * @returns {boolean}
     */
    static isSupported(config) {
        const { e2ee = {} } = config;

        if (!e2ee.externallyManagedKey && !OlmAdapter.isSupported()) {
            return false;
        }

        return !(config.testing && config.testing.disableE2EE)
            && (browser.supportsInsertableStreams()
                || (config.enableEncodedTransformSupport && browser.supportsEncodedTransform()));
    }

    /**
     * Indicates whether E2EE is currently enabled or not.
     *
     * @returns {boolean}
     */
    isEnabled() {
        return this._keyHandler.isEnabled();
    }

    /**
     * Enables / disables End-To-End encryption.
     *
     * @param {boolean} enabled - whether E2EE should be enabled or not.
     * @returns {void}
     */
    async setEnabled(enabled) {
        await this._keyHandler.setEnabled(enabled);
    }

    /**
     * Sets the key and index for End-to-End encryption.
     *
     * @param {CryptoKey} [keyInfo.encryptionKey] - encryption key.
     * @param {Number} [keyInfo.index] - the index of the encryption key.
     * @returns {void}
     */
    setEncryptionKey(keyInfo) {
        this._keyHandler.setKey(keyInfo);
    }
}
