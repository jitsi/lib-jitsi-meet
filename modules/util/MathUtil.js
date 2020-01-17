

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
 * Returns only the positive values from an array of numbers.
 *
 * @param {Float32Array} valueArray - Array of vad scores.
 * @returns {Array} - Array of positive numbers.
 */
export function filterPositiveValues(valueArray) {
    return valueArray.filter(value => value >= 0);
}
