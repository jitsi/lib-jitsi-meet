export function deriveKeys(
    materialOlm: CryptoKey,
    materialPQ: CryptoKey
): Promise<{
    materialOlm: CryptoKey;
    materialPQ: CryptoKey;
    encryptionKey: CryptoKey;
}>; // TODO:

export function ratchet(
    material: CryptoKey,
): Promise<Uint8Array>; // TODO: check promise

export function importKey(keyBytes: Uint8Array): Promise<CryptoKey>; // TODO: check promise
