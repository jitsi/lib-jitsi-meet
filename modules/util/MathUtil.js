
/**
 * The method will increase the given number by 1. If the given counter is equal
 * or greater to {@link Number.MAX_SAFE_INTEGER} then it will be rolled back to
 * 1.
 * @param {number} number - An integer counter value to be incremented.
 * @return {number} the next counter value increased by 1 (see the description
 * above for exception).
 */
export function safeCounterIncrement(number) {
    let nextValue = number;

    if (number >= Number.MAX_SAFE_INTEGER) {
        nextValue = 0;
    }

    return nextValue + 1;
}

/**
 * Calculates the average value of am Array of numbers.
 *
 * @param {Float32Array} valueArray - Array of numbers.
 * @returns {number} - Number array average.
 */
export function calculateAverage(valueArray) {
    return valueArray.length > 0 ? valueArray.reduce((a, b) => a + b) / valueArray.length : 0;
}

/**
 * Calculates a unique hash for a given string similar to Java's
 * implementation of String.hashCode()
 *
 * @param {String} string - String whose hash has to be calculated.
 * @returns {number} - Unique hash code calculated.
 */
export function hashString(string) {
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
 * @returns {Array} - Array of positive numbers.
 */
export function filterPositiveValues(valueArray) {
    return valueArray.filter(value => value >= 0);
}

/**
 * This class calculates a simple running average that continually changes
 * as more data points are collected and added.
 */
export class RunningAverage {
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
    addNext(value) {
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
    getAverage() {
        return this.average;
    }
}
