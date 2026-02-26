/**
 * Derives a set of keys from the master key.
 * @param {CryptoKey} material - master key to derive from
 *
 * See https://tools.ietf.org/html/draft-omara-sframe-00#section-4.3.1
 */
export async function deriveKeys(material: CryptoKey): Promise<{ encryptionKey: CryptoKey; material: CryptoKey; }> {
    const info = new ArrayBuffer();
    const textEncoder = new TextEncoder();

    // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey#HKDF
    // https://developer.mozilla.org/en-US/docs/Web/API/HkdfParams
    const encryptionKey = await crypto.subtle.deriveKey({
        hash: 'SHA-256',
        info,
        name: 'HKDF',
        salt: textEncoder.encode('JFrameEncryptionKey')
    }, material, {
        length: 128,
        name: 'AES-GCM'
    }, false, [ 'encrypt', 'decrypt' ]);

    return {
        encryptionKey,
        material
    };
}

/**
 * Ratchets a key. See
 * https://tools.ietf.org/html/draft-omara-sframe-00#section-4.3.5.1
 * @param {CryptoKey} material - base key material
 * @returns {Promise<ArrayBuffer>} - ratcheted key material
 */
export async function ratchet(material: CryptoKey): Promise<ArrayBuffer> {
    const textEncoder = new TextEncoder();

    // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveBits
    return await crypto.subtle.deriveBits({
        hash: 'SHA-256',
        info: new ArrayBuffer(),
        name: 'HKDF',
        salt: textEncoder.encode('JFrameRatchetKey')
    }, material, 256);
}

/**
 * Converts a raw key into a WebCrypto key object with default options
 * suitable for our usage.
 * @param {ArrayBuffer} keyBytes - raw key
 * @param {Array} keyUsages - key usages, see importKey documentation
 * @returns {Promise<CryptoKey>} - the WebCrypto key.
 */
export async function importKey(keyBytes: ArrayBuffer): Promise<CryptoKey> {
    // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/importKey
    return await crypto.subtle.importKey('raw', keyBytes, 'HKDF', false, [ 'deriveBits', 'deriveKey' ]);
}
