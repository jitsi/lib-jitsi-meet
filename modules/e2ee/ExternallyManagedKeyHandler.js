import { KeyHandler } from './KeyHandler';

/**
 * This module integrates {@link E2EEContext} with {external} in order to distribute the keys for encryption.
 */
export class ExternallyManagedKeyHandler extends KeyHandler {
    constructor(conference) {
        super(conference, { shareKey: true });
    }

    setKey(keyInfo) {
        this.e2eeCtx.setKey(undefined, { encryptionKey: keyInfo.encryptionKey }, keyInfo.index);
    }
}