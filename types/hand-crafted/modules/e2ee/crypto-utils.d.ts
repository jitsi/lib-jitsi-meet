export function deriveKeys( material: CryptoKey ): Promise<unknown>; // TODO:

export function ratchet( material: CryptoKey ): Promise<ArrayBuffer>; // TODO: check promise

export function importKey( keyBytes: ArrayBuffer, keyUsages: Array<unknown> ): Promise<CryptoKey>; // TODO: check promise
