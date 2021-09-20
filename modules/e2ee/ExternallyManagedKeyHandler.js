import { KeyHandler } from './KeyHandler';

/**
 * This module integrates {@link E2EEContext} with {external} in order to distribute the keys for encryption.
 */
export class ExternallyManagedKeyHandler extends KeyHandler {
    constructor(conference) {
        super(conference);
    }

    /**
     * 
     * @param {boolean} enabled - whether E2EE should be enabled or not.
     * @returns {void}
     *
    async setEnabledExtras(enabled) {
        if (enabled) {
            // Generate a random key in case we are enabling.
            this._key = enabled ? await this.importKey() : false;

            this.setKey(this._key, 0);
        }
    }*/

    setKey(keyInfo) {
        console.log("XXX LJM set key", keyInfo);
        this.e2eeCtx.setKey(undefined, { encryptionKey: keyInfo.encryptionKey }, keyInfo.index, true);
    }

    async importKey() {
        const keyBytes = new Uint8Array([97, 145, 133, 203, 63, 197, 49, 232, 87, 159, 169, 200, 59, 195, 77, 75, 150, 173, 189, 232, 44, 39, 8, 149, 250, 6, 238, 170, 255, 17, 110, 107]); 

        // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/importKey
        return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', true, [ 'encrypt', 'decrypt' ]);
    }
}