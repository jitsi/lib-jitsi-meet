/**
 * Derives a set of keys from the master key.
 * @param {CryptoKey} material - master key to derive from
 *
 * See https://tools.ietf.org/html/draft-omara-sframe-00#section-4.3.1
 */
export async function deriveKeys(material) {
    const info = new ArrayBuffer();
    const textEncoder = new TextEncoder();

    // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey#HKDF
    // https://developer.mozilla.org/en-US/docs/Web/API/HkdfParams
    const encryptionKey = await crypto.subtle.deriveKey({
        name: 'HKDF',
        salt: textEncoder.encode('JFrameEncryptionKey'),
        hash: 'SHA-256',
        info
    }, material, {
        name: 'AES-CTR',
        length: 128
    }, false, [ 'encrypt', 'decrypt' ]);
    const authenticationKey = await crypto.subtle.deriveKey({
        name: 'HKDF',
        salt: textEncoder.encode('JFrameAuthenticationKey'),
        hash: 'SHA-256',
        info
    }, material, {
        name: 'HMAC',
        hash: 'SHA-256'
    }, false, [ 'sign' ]);
    const saltKey = await crypto.subtle.deriveBits({
        name: 'HKDF',
        salt: textEncoder.encode('JFrameSaltKey'),
        hash: 'SHA-256',
        info
    }, material, 128);

    return {
        material,
        encryptionKey,
        authenticationKey,
        saltKey
    };
}

/**
 * Ratchets a key. See
 * https://tools.ietf.org/html/draft-omara-sframe-00#section-4.3.5.1
 * @param {CryptoKey} material - base key material
 * @returns {ArrayBuffer} - ratcheted key material
 */
export async function ratchet(material) {
    const textEncoder = new TextEncoder();

    // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveBits
    return crypto.subtle.deriveBits({
        name: 'HKDF',
        salt: textEncoder.encode('JFrameRatchetKey'),
        hash: 'SHA-256',
        info: new ArrayBuffer()
    }, material, 256);
}

/**
 * Converts a raw key into a WebCrypto key object with default options
 * suitable for our usage.
 * @param {ArrayBuffer} keyBytes - raw key
 * @param {Array} keyUsages - key usages, see importKey documentation
 * @returns {CryptoKey} - the WebCrypto key.
 */
export async function importKey(keyBytes) {
    // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/importKey
    return crypto.subtle.importKey('raw', keyBytes, 'HKDF', false, [ 'deriveBits', 'deriveKey' ]);
}
