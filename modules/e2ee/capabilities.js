import { getLogger } from '@jitsi/logger';

import browser from '../browser';

import { OlmAdapter } from './OlmAdapter';

const logger = getLogger('e2ee:capabilities');

/**
 * Checks if the runtime environment supports E2EE with all required capabilities.
 *
 * This performs comprehensive runtime checks including:
 * - Secure context (HTTPS/localhost)
 * - Insertable Streams or Encoded Transform API
 * - Olm library availability (for managed keys)
 *
 * @param {object} config - The E2EE configuration object.
 * @param {boolean} config.externallyManagedKey - Whether E2EE uses externally managed keys.
 * @returns {boolean} True if E2EE is fully supported in this environment.
 */
export function detectE2EESupport(config = {}) {
    // Check secure context - E2EE requires HTTPS or localhost
    if (typeof globalThis.isSecureContext !== 'undefined' && !globalThis.isSecureContext) {
        logger.debug('E2EE not supported: not a secure context (HTTPS required)');
        return false;
    }

    // Check for insertable streams or encoded transform support
    const hasInsertableStreams = browser.supportsInsertableStreams();
    const hasEncodedTransform = config.enableEncodedTransformSupport && browser.supportsEncodedTransform();

    if (!hasInsertableStreams && !hasEncodedTransform) {
        logger.debug('E2EE not supported: neither insertable streams nor encoded transform available');
        return false;
    }

    // For managed keys, we need Olm support
    if (!config.externallyManagedKey && !OlmAdapter.isSupported()) {
        logger.debug('E2EE not supported: Olm library not available (required for managed keys)');
        return false;
    }

    // All checks passed
    return true;
}

/**
 * Attempts to bootstrap the Olm library to verify it can be initialized.
 * This is a more thorough check than just checking if Olm exists.
 *
 * @returns {Promise<boolean>} True if Olm can be successfully initialized.
 */
export async function verifyOlmBootstrap() {
    if (!OlmAdapter.isSupported()) {
        return false;
    }

    try {
        // Test if Olm can be initialized
        await window.Olm.init();
        return true;
    } catch (e) {
        logger.warn('Olm library present but failed to initialize', e);
        return false;
    }
}
