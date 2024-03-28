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
        name: 'AES-GCM',
        length: 128
    }, false, [ 'encrypt', 'decrypt' ]);

    return {
        material,
        encryptionKey
    };
}

/**
 * Ratchets a key. See
 * https://tools.ietf.org/html/draft-omara-sframe-00#section-4.3.5.1
 * @param {CryptoKey} material - base key material
 * @returns {Promise<ArrayBuffer>} - ratcheted key material
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
 * @returns {Promise<CryptoKey>} - the WebCrypto key.
 */
export async function importKey(keyBytes) {
    // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/importKey
    return crypto.subtle.importKey('raw', keyBytes, 'HKDF', false, [ 'deriveBits', 'deriveKey' ]);
}

/**
 * Encrypts using AES-GCM
 * @param {ArrayBuffer} ciphertext - Ciphertext buffer
 * @param {ArrayBuffer} keyBytes - raw key
 * @returns {Promise<Uint8Array>} - The encrypted data as a Uint8Array.
 */
export const encryptSymmetric = async (ciphertext, key) => {
    try {

        const iv = crypto.getRandomValues(new Uint8Array(12));

        const secretKey = await crypto.subtle.importKey(
        'raw',
        key,
        {
            name: 'AES-GCM',
            length: 256
        },
        false,
        [ 'encrypt', 'decrypt' ]
        );

        const ciphertextBuffer = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv
        },
        secretKey,
        ciphertext
        );

        const ciphertextArray = new Uint8Array(ciphertextBuffer);

        const combined = new Uint8Array(iv.length + ciphertextArray.byteLength);

        combined.set(iv, 0);
        combined.set(ciphertextArray, iv.length);

        return combined;
    } catch (error) {
        console.error('Encryption failed:', error);
        throw new Error('Encryption operation failed.');
    }
};

/**
 * Decrypts data using AES-GCM.
 *
 * @param {Uint8Array} encryptArray - The combined IV and ciphertext.
 * @param {ArrayBuffer} key - The raw key used for decryption.
 * @returns {Promise<Uint8Array>} - The decrypted data as a Uint8Array.
 */
export const decryptSymmetric = async (encryptArray, key) => {
    try {
        const iv = encryptArray.slice(0, 12);

        const ciphertext = encryptArray.slice(12);

        const secretKey = await crypto.subtle.importKey(
        'raw',
        key,
        {
            name: 'AES-GCM',
            length: 256
        },
        false,
        [ 'encrypt', 'decrypt' ]
        );

        const decryptedBuffer = await crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv
        },
        secretKey,
        ciphertext
        );

        const decryptedData = new Uint8Array(decryptedBuffer);

        return decryptedData;
    } catch (error) {
        console.error('Decrypt failed:', error);
        throw new Error('Decrypt operation failed.');
    }
};
