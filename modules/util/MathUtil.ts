/**
 * The method will increase the given number by 1. If the given counter is equal
 * or greater to {@link Number.MAX_SAFE_INTEGER} then it will be rolled back to
 * 1.
 * @param {number} number - An integer counter value to be incremented.
 * @return {number} the next counter value increased by 1 (see the description
 * above for exception).
 */
export function safeCounterIncrement(number: number): number {
    let nextValue = number;

    if (number >= Number.MAX_SAFE_INTEGER) {
        nextValue = 0;
    }

    return nextValue + 1;
}

/**
 * Calculates the average value of an Array of numbers.
 *
 * @param {Float32Array} valueArray - Array of numbers.
 * @returns {number} - Number array average.
 */
export function calculateAverage(valueArray: Float32Array): number {
    return valueArray.length > 0 ? valueArray.reduce((a, b) => a + b) / valueArray.length : 0;
}

/**
 * Calculates a unique hash for a given string similar to Java's
 * implementation of String.hashCode()
 *
 * @param {string} string - String whose hash has to be calculated.
 * @returns {number} - Unique hash code calculated.
 */
export function hashString(string: string): number {
    let hash = 0;

    for (let i = 0; i < string.length; i++) {
        hash += Math.pow(string.charCodeAt(i) * 31, string.length - i);

        /* eslint-disable no-bitwise */
        hash = hash & hash; // Convert to 32bit integer
    }

    return Math.abs(hash);
}

/**
 * Returns only the positive values from an array of numbers.
 *
 * @param {Float32Array} valueArray - Array of vad scores.
 * @returns {number[]} - Array of positive numbers.
 */
export function filterPositiveValues(valueArray: Float32Array): number[] {
    return Array.from(valueArray).filter(value => value >= 0);
}

/**
 * This class calculates a simple running average that continually changes
 * as more data points are collected and added.
 */
export class RunningAverage {
    private average: number;
    private n: number;

    /**
     * Creates an instance of the running average calculator.
     */
    constructor() {
        this.average = 0;
        this.n = 0;
    }

    /**
     * Adds a new data point to the existing set of values and recomputes
     * the running average.
     * @param {number} value
     * @returns {void}
     */
    addNext(value: number): void {
        if (typeof value !== 'number') {
            return;
        }
        this.n += 1;
        this.average = this.average + ((value - this.average) / this.n);
    }

    /**
     * Obtains the average value for the current subset of values.
     * @returns {number} - computed average.
     */
    getAverage(): number {
        return this.average;
    }
}

/**
 * Subtracts the two numbers passed or returns 0 if any of the arguments are not a number.
 *
 * @param {*} x - The number we subtract from.
 * @param {*} y - The number we subtract.
 * @returns {number} - x - y or 0 if x or y is not a number.
 */
export function safeSubtract(x: any, y: any): number {
    return isValidNumber(x) && isValidNumber(y) ? x - y : 0;
}

/**
 * Checks if the given value is a valid number.
 *
 * @param n - The value to check.
 * @returns - `true` if the value is a valid number, `false` otherwise.
 */
export function isValidNumber(n: any): boolean {
    const v = Number.parseInt(n, 10);

    return Number.isFinite(v); // Filter out NaN and Infinity.
}
