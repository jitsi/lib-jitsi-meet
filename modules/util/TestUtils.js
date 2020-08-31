/* global process */
import RTC from '../RTC/RTC';

/**
 * Used to make sure that {@link RTC.init} is called once for all tests.
 * @type {boolean}
 */
let rtcInitialized = false;

/**
 * Any test which needs the {@link RTC} module to be initialized should use this method to have it initialized once.
 * @returns {void}
 */
export function maybeInitRTC() {
    if (!rtcInitialized) {
        RTC.init({});
        rtcInitialized = true;
    }
}

/**
 * Returns a Promise resolved after {@code process.nextTick} with the option to advance Jasmine timers.
 *
 * @param {number} [advanceTimer] - the value to be passed to Jasmine clock's tick method.
 * @returns {Promise<void>}
 */
export function nextTick(advanceTimer) {
    advanceTimer && jasmine.clock().tick(advanceTimer);

    return new Promise(resolve => process.nextTick(resolve));
}
