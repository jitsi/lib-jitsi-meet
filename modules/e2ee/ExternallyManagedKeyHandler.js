import { KeyHandler } from './KeyHandler';

/**
 * This module integrates {@link E2EEContext} with {external} in order to set the keys for encryption.
 */
export class ExternallyManagedKeyHandler extends KeyHandler {
    /**
     * Build a new ExternallyManagedKeyHandler instance, which will be used in a given conference.
     */
    constructor(conference) {
        super(conference, { shareKey: true });
    }

    /**
     * Sets the key for End-to-End encryption.
     *
     * @param {Object} keyInfo whether to enable E2EE or not.
     * @returns {void}
    */
    setKey(keyInfo) {
        this.e2eeCtx.setKey(undefined, { encryptionKey: keyInfo.encryptionKey }, keyInfo.index);
    }
}
