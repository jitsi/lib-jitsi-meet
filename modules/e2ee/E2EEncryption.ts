import base64js from "base64-js";

import browser from "../browser";

import { ManagedKeyHandler } from "./ManagedKeyHandler";
import { OlmAdapter } from "./OlmAdapter";
import { KeyHandler } from "./KeyHandler";

/**
 * This module integrates {@link KeyHandler} with {@link JitsiConference} in order to enable E2E encryption.
 */
export class E2EEncryption {
    private _keyHandler: KeyHandler;
    /**
     * A constructor.
     * @param {JitsiConference} conference - The conference instance for which E2E encryption is to be enabled.
     */
    constructor(conference) {
        this._keyHandler = new ManagedKeyHandler(conference);
    }

    /**
     * Indicates if E2EE is supported in the current platform.
     *
     * @param {object} config - Global configuration.
     * @returns {boolean}
     */
    static isSupported(config) {
        if (!OlmAdapter.isSupported()) {
            return false;
        }

        return (
            !(config.testing && config.testing.disableE2EE) &&
            (browser.supportsInsertableStreams() ||
                (config.enableEncodedTransformSupport &&
                    browser.supportsEncodedTransform()))
        );
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
    setEncryptionKey(olmKey, pqKey, index) {
        this._keyHandler.setKey(olmKey, pqKey, index);
    }

    /**
     * Starts the verification process of the participant
     *
     * @param {Participant} - participant to be verified.
     * @returns {void}
     */
    startVerification(participant) {
        this._keyHandler.sasVerification?.startVerification(participant);
    }

    /**
     * Marks the channel as verified
     *
     * @param {Participant} - participant to be verified.
     * @param {boolean} isVerified - whether the verification was succesfull.
     * @returns {void}
     */
    markParticipantVerified(participant, isVerified) {
        this._keyHandler.sasVerification?.markParticipantVerified(
            participant,
            isVerified
        );
    }
}
