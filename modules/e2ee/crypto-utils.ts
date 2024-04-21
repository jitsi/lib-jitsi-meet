/**
 * Derives a set of keys from the master key.
 * @param {CryptoKey} material - master key to derive from
 *
 * See https://tools.ietf.org/html/draft-omara-sframe-00#section-4.3.1
 */
export async function deriveKeys(olmKey: Uint8Array, pqKey: Uint8Array): Promise<CryptoKey> {

    const textEncoder = new TextEncoder();
    const data = new Uint8Array([...olmKey, ...pqKey]);
    const concatKey = await crypto.subtle.digest("SHA-256", data);
    const material =  await importKey(new Uint8Array(concatKey));

    // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey#HKDF
    // https://developer.mozilla.org/en-US/docs/Web/API/HkdfParams
    const encryptionKey = await crypto.subtle.deriveKey(
        {
            name: "HKDF",
            salt: textEncoder.encode("JFrameEncryptionKey"),
            hash: "SHA-256",
            info: textEncoder.encode("JFrameInfo"),
        },
        material,
        {
            name: "AES-GCM",
            length: 256,
        },
        false,
        ["encrypt", "decrypt"]
    );

    return encryptionKey;
}

/**
 * Ratchets a key. See
 * https://tools.ietf.org/html/draft-omara-sframe-00#section-4.3.5.1
 * @param {CryptoKey} material - base key material
 * @returns {Promise<Uint8Array>} - ratcheted key material
 */
export async function ratchet(material: CryptoKey): Promise<Uint8Array> {
    const textEncoder = new TextEncoder();

    // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveBits
    const key = await crypto.subtle.deriveBits(
        {
            name: "HKDF",
            salt: textEncoder.encode("JFrameRatchetKey"),
            hash: "SHA-256",
            info: textEncoder.encode("JFrameInfo"),
        },
        material,
        256
    );
    return new Uint8Array(key);
}

/**
 * Converts a raw key into a WebCrypto key object with default options
 * suitable for our usage.
 * @param {ArrayBuffer} keyBytes - raw key
 * @param {Array} keyUsages - key usages, see importKey documentation
 * @returns {Promise<CryptoKey>} - the WebCrypto key.
 */
export async function importKey(keyBytes: Uint8Array): Promise<CryptoKey> {
    // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/importKey

    return crypto.subtle.importKey("raw", keyBytes, "HKDF", false, [
        "deriveBits",
        "deriveKey",
    ]);
}

/**
 * Encrypts using AES-GCM
 */
export const encryptSymmetric = async (plaintext:Uint8Array, key: Uint8Array): Promise <{ciphertext: Uint8Array, iv: Uint8Array}> => {
    try {
        const iv = crypto.getRandomValues(new Uint8Array(16));
        const secretKey = await crypto.subtle.importKey(
            "raw",
            key,
            {
                name: "AES-GCM",
                length: 256,
            },
            false,
            ["encrypt", "decrypt"]
        );

        const ciphertext = await crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv,
            },
            secretKey,
            plaintext
        );

        return {
            ciphertext: new Uint8Array(ciphertext),
            iv,
        };
    } catch (error) {
        console.error(
            "[SYMMETRIC_ENCRYPTION]: encryption failed. ERROR: #%d",
            error
        );
        throw error;
    }
};

/**
 * Decrypts data using AES-GCM.
 */
export const decryptSymmetric = async (ciphertext: Uint8Array, iv: Uint8Array, key: Uint8Array): Promise<Uint8Array> => {
    try {
        const secretKey = await crypto.subtle.importKey(
            "raw",
            key,
            {
                name: "AES-GCM",
                length: 256,
            },
            false,
            ["encrypt", "decrypt"]
        );

        const plaintext = await crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv,
            },
            secretKey,
            ciphertext
        );

        return new Uint8Array(plaintext);
    } catch (error) {
        console.error(
            "[SYMMETRIC_DECRYPTION]: decryption failed. ERROR: #%d",
            error
        );
        throw error;
    }
};
