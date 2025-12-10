import JitsiConference from '../../JitsiConference';
import { KeyHandler } from './KeyHandler';

/**
 * This module integrates {@link E2EEContext} with {external} in order to set the keys for encryption.
 */

/**
 * Information about an encryption key for E2EE.
 */
export interface KeyInfo {
    encryptionKey: boolean | Uint8Array<ArrayBufferLike>;
    index: number;
}

/**
 * This module integrates {@link E2EEContext} with an external key provider
 * in order to set the keys for encryption.
 */
export class ExternallyManagedKeyHandler extends KeyHandler {
    constructor(conference: JitsiConference) {
        // The `sharedKey: true` flag tells the parent KeyHandler that
        // one key is used across the whole conference.
        super(conference, { sharedKey: true });
    }

    /**
     * Sets the key and index for End-to-End encryption.
     */
    setKey(keyInfo: KeyInfo): void {
        this.e2eeCtx.setKey(undefined, keyInfo.encryptionKey, keyInfo.index);
    }
}

