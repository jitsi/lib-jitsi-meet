/**
 * Implements a simple hash code for a string (see
 * https://en.wikipedia.org/wiki/Java_hashCode()).
 *
 * @param {string} string - The string to return a hash of.
 * @return {number} the integer hash code of the string.
 */
function integerHash(string: string): number {
    if (!string) {
        return 0;
    }

    let char: number, hash = 0;

    for (let i = 0; i < string.length; i++) {
        char = string.charCodeAt(i);
        hash += char * Math.pow(31, string.length - 1 - i);
        hash = Math.abs(hash | 0); // eslint-disable-line no-bitwise
    }

    return hash;
}

export default integerHash;
