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
 */
export const encryptSymmetric = async (plaintext, key) => {
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

        const ciphertext = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv
        },
        secretKey,
        plaintext
        );

        return {
            ciphertext,
            iv
        };
    } catch (error) {
        console.error(`[SYMMETRIC_ENCRYPTION]: encryption failed, the key was ${key.length} long 
            and of type ${typeof key}, the plaintext was ${plaintext.length} long
            and of type ${typeof plaintext}. ERROR: `, error);
        throw error;
    }
};

/**
 * Decrypts data using AES-GCM.
 */
export const decryptSymmetric = async (ciphertext, iv, key) => {
    try {
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

        const plaintext = await crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv
        },
        secretKey,
        ciphertext
        );

        return plaintext;
    } catch (error) {
        console.error(`[SYMMETRIC_DECRYPTION]: decryption failed, the key was ${key.length} long 
            and of type ${typeof key}, the ciphertext was ${ciphertext.length} long
            and of type ${typeof ciphertext} and iv was ${iv.length} long and of 
            type ${typeof iv}. ERROR: `, error);
        throw error;
    }
};
