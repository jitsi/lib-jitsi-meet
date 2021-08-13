/**
 * Returns a Promise resolved after {@code process.nextTick} with the option to advance Jasmine timers.
 *
 * @param {number} [advanceTimer] - the value to be passed to Jasmine clock's tick method.
 * @returns {Promise<void>}
 */
export function nextTick(advanceTimer?: number): Promise<void>;
