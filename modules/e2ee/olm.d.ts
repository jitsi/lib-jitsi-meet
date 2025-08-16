/**
 * Type definitions for the Olm cryptographic library
 */

export interface IOlmAccount {
    create(): void;
    free(): void;
    generate_one_time_keys(count: number): void;
    identity_keys(): string;
    mark_keys_as_published(): void;
    one_time_keys(): string;
    remove_one_time_keys(session: IOlmSession): void;
}

export interface IOlmSession {
    create_inbound(account: IOlmAccount, ciphertext: string): void;
    create_outbound(account: IOlmAccount, idKey: string, otKey: string): void;
    decrypt(type: number, ciphertext: string): string;
    encrypt(plaintext: string): { body: string; type: number };
    free(): void;
}

export interface IOlmSAS {
    calculate_mac(message: string, info: string): string;
    free(): void;
    generate_bytes(info: string, length: number): Uint8Array;
    get_pubkey(): string;
    is_their_key_set(): boolean;
    set_their_key(key: string): void;
}

export interface IOlmUtility {
    sha256(input: string): string;
    free(): void;
}

export interface IOlmIdKeys {
    curve25519: string;
    ed25519: string;
}

export interface IOlmStatic {
    init(): Promise<void>;
    get_library_version(): number[];
    Account: new () => IOlmAccount;
    Session: new () => IOlmSession;
    SAS: new () => IOlmSAS;
    Utility: new () => IOlmUtility;
}
