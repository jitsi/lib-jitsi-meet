/* global process */
import RTC from '../RTC/RTC';

/**
 * Used to make sure that {@link RTC.init} is called once for all tests.
 * @type {boolean}
 */
let rtcInitialized = false;

/**
 * A helper function to execute given asynchronous function N times in a chain. The execution chain will break if
 * the Promise returned by {@code f} is rejected.
 *
 * @param {Function} f - An asynchronous function which returns a Promise.
 * @param {number} n - How many times the functon should be called.
 * @returns {Promise<void>}
 */
export function callNTimesAsync(f, n) {
    let counter = 0;
    const callAndCount = () => {
        if (counter >= n) {
            return Promise.resolve();
        }

        counter += 1;

        return f().then(() => callAndCount());
    };

    return callAndCount();
}

/**
 * Calls given function N times. If the function is asynchronous (returns a Promise) then it will be converted
 * to {@link callNTimesAsync}.
 * @param {Function} f - The function to be executed.
 * @param {number} n - How many times the method is to be executed.
 * @return {PromiseLike<void> | Promise<void>}
 */
export function callNTimes(f, n) {
    for (let i = 0; i < n; i++) {
        const res = f();

        if (res && res.then) {
            return res.then(() => callNTimesAsync(f, n - 1));
        }
    }
}

/**
 * Executed given function with a delay.
 * @param {Function} f
 * @param {number} delayMs - The delay in milliseconds to wait before executing {@code f}.
 * @returns {Promise<void>}
 */
export function callWithDelay(f, delayMs) {
    const promise = new Promise(resolve => {
        setTimeout(() => {
            f();
            resolve();
        }, delayMs);
    });

    jasmine.clock().tick(delayMs);

    return promise;
}

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
