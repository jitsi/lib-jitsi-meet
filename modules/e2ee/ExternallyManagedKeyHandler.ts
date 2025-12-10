import JitsiConference from '../../JitsiConference';

import { KeyHandler } from './KeyHandler';

/**
 * This module integrates {@link E2EEContext} with {external} in order to set the keys for encryption.
 */
export class ExternallyManagedKeyHandler extends KeyHandler {
    /**
     * Build a new ExternallyManagedKeyHandler instance, which will be used in a given conference.
     * @param conference - the current conference.
     */
    constructor(conference: JitsiConference) {
        super(conference, { sharedKey: true });
    }

    /**
     * Sets the key and index for End-to-End encryption.
     *
     * @param {CryptoKey} [keyInfo.encryptionKey] - encryption key.
     * @param {Number} [keyInfo.index] - the index of the encryption key.
     * @returns {void}
     */
    public async setKey(keyInfo: { encryptionKey: CryptoKey; index: number; }) {
        const keyData = await crypto.subtle.exportKey('raw', keyInfo.encryptionKey);

        this.e2eeCtx.setKey(undefined, new Uint8Array(keyData), keyInfo.index);
    }
}
