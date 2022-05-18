/**
 * The method will increase the given number by 1. If the given counter is equal
 * or greater to {@link Number.MAX_SAFE_INTEGER} then it will be rolled back to
 * 1.
 * @param {number} number - An integer counter value to be incremented.
 * @return {number} the next counter value increased by 1 (see the description
 * above for exception).
 */
export function safeCounterIncrement(number: number): number;
/**
 * Calculates the average value of am Array of numbers.
 *
 * @param {Float32Array} valueArray - Array of numbers.
 * @returns {number} - Number array average.
 */
export function calculateAverage(valueArray: Float32Array): number;
/**
 * Calculates a unique hash for a given string similar to Java's
 * implementation of String.hashCode()
 *
 * @param {String} string - String whose hash has to be calculated.
 * @returns {number} - Unique hash code calculated.
 */
export function hashString(string: string): number;
/**
 * Returns only the positive values from an array of numbers.
 *
 * @param {Float32Array} valueArray - Array of vad scores.
 * @returns {Array} - Array of positive numbers.
 */
export function filterPositiveValues(valueArray: Float32Array): any[];
/**
 * Compute the greatest common divisor using Euclid's algorithm.
 *
 * @param {number} num1
 * @param {number} num2
 * @returns {number}
 */
export function greatestCommonDivisor(num1: number, num2: number): number;
/**
 * Calculate least common multiple using gcd.
 *
 * @param {*} num1
 * @param {*} num2
 * @returns {number}
 */
export function leastCommonMultiple(num1: any, num2: any): number;
/**
 * This class calculates a simple running average that continually changes
 * as more data points are collected and added.
 */
export class RunningAverage {
    average: number;
    n: number;
    /**
     * Adds a new data point to the existing set of values and recomputes
     * the running average.
     * @param {number} value
     * @returns {void}
     */
    addNext(value: number): void;
    /**
     * Obtains the average value for the current subset of values.
     * @returns {number} - computed average.
     */
    getAverage(): number;
}
