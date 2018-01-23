

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
