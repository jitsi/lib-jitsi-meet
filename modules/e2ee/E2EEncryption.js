import browser from '../browser';

import { ExternallyManagedKeyHandler } from './ExternallyManagedKeyHandler';
import { ManagedKeyHandler } from './ManagedKeyHandler';
import { NativeManagedE2EEContext, isNativeE2EESupported } from './NativeE2EE';
import { disposeNativeManaged, prepareNativeParticipantLeave } from './NativeManagedLifecycle';
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
        this._conference = conference;
        if (e2ee.nativeManaged === true) {
            this._nativeContext = new NativeManagedE2EEContext(conference,
                error => conference._onNativeE2EEError(error));
            conference.rtc.setNativeE2EEContext(this._nativeContext);
        }
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
        if (e2ee.disabled || config.testing?.disableE2EE) {
            return false;
        }
        if (e2ee.nativeManaged === true) {
            return isNativeE2EESupported(config);
        }

        return browser.supportsInsertableStreams()
                || (config.enableEncodedTransformSupport && browser.supportsEncodedTransform());
    }

    /**
     * Indicates whether E2EE is currently enabled or not.
     *
     * @returns {boolean}
     */
    isEnabled() {
        return !this._nativeContext?.closed && this._keyHandler.isEnabled();
    }

    /**
     * Enables / disables End-To-End encryption.
     *
     * @param {boolean} enabled - whether E2EE should be enabled or not.
     * @returns {void}
     */
    async setEnabled(enabled) {
        if (this._nativeContext) {
            if (!enabled || this._nativeContext.closed) {
                await this.dispose();
                if (enabled) {
                    throw new Error('Native managed E2EE is terminally closed');
                }

                return;
            }
            await this._keyHandler._nativeLifecycle.run(() => this._keyHandler.setEnabled(true));
            await this._nativeContext.flush();
            if (!this._nativeContext.localReady) {
                throw new Error('Native local key is not ready');
            }
        } else {
            await this._keyHandler.setEnabled(enabled);
        }
    }

    /** Await terminal cleanup of the native conference and original handler resources. */
    dispose() {
        return this._nativeContext ? disposeNativeManaged(this._keyHandler) : Promise.resolve();
    }

    /** Remove native participant keys before original departure listeners run. */
    async participantLeft(id) {
        if (!this._nativeContext) {
            return;
        }
        const removal = this._nativeContext.cleanup(id);

        await prepareNativeParticipantLeave(this._keyHandler, id);
        await removal;
    }

    /** Return safe native completion evidence without exposing key material. */
    getNativeState(id) {
        return this._nativeContext?.snapshot(id) ?? null;
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
        this._keyHandler.sasVerification?.markParticipantVerified(participant, isVerified);
    }
}
