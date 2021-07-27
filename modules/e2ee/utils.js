/**
 * Compares two byteArrays for equality.
 */
export function isArrayEqual(a1, a2) {
    if (a1.byteLength !== a2.byteLength) {
        return false;
    }
    for (let i = 0; i < a1.byteLength; i++) {
        if (a1[i] !== a2[i]) {
            return false;
        }
    }

    return true;
}

