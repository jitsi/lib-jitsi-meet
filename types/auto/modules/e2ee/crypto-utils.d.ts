/**
 * Derives a set of keys from the master key.
 * @param {CryptoKey} material - master key to derive from
 *
 * See https://tools.ietf.org/html/draft-omara-sframe-00#section-4.3.1
 */
export function deriveKeys(material: CryptoKey): Promise<{
    material: CryptoKey;
    encryptionKey: CryptoKey;
}>;
/**
 * Ratchets a key. See
 * https://tools.ietf.org/html/draft-omara-sframe-00#section-4.3.5.1
 * @param {CryptoKey} material - base key material
 * @returns {Promise<ArrayBuffer>} - ratcheted key material
 */
export function ratchet(material: CryptoKey): Promise<ArrayBuffer>;
/**
 * Converts a raw key into a WebCrypto key object with default options
 * suitable for our usage.
 * @param {ArrayBuffer} keyBytes - raw key
 * @param {Array} keyUsages - key usages, see importKey documentation
 * @returns {Promise<CryptoKey>} - the WebCrypto key.
 */
export function importKey(keyBytes: ArrayBuffer): Promise<CryptoKey>;
