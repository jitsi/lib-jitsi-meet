/**
 * @const
 */
const ALPHANUM
    = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Hexadecimal digits.
 * @const
 */
const HEX_DIGITS = '0123456789abcdef';

/**
 * Generates random int within the range [min, max]
 * @param min the minimum value for the generated number
 * @param max the maximum value for the generated number
 * @returns random int number
 */
export function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Get random element from array or string.
 * @param {Array|string} arr source
 * @returns array element or string character
 */
export function randomElement<T>(arr: T[] | string): T | string {
    return arr[randomInt(0, arr.length - 1)];
}

/**
 * Generate random alphanumeric string.
 * @param {number} length expected string length
 * @returns {string} random string of specified length
 */
export function randomAlphanumStr(length: number): string {
    let result = '';

    for (let i = 0; i < length; i += 1) {
        result += randomElement(ALPHANUM);
    }

    return result;
}

/**
 * Exported interface.
 */
const RandomUtil = {
    /**
     * Returns a random hex digit.
     * @returns {*}
     */
    randomAlphanumStr,
    randomElement,
    randomHexDigit(): string {
        return randomElement(HEX_DIGITS) as string;
    },

    /**
     * Returns a random string of hex digits with length 'len'.
     * @param len the length.
     */
    randomHexString(len: number): string {
        let ret = '';

        while (len--) { // eslint-disable-line no-param-reassign
            ret += this.randomHexDigit();
        }

        return ret;
    },
    randomInt
};

export default RandomUtil;
