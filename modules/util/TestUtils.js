/* global process */
/**
 * Returns a Promise resolved after {@code process.nextTick}.
 *
 * @returns {Promise<void>}
 */
export function nextTick() {
    return new Promise(resolve => process.nextTick(resolve));
}
