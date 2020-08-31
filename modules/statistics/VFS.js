/**
 * Calculates the average (arithmetic mean) of the given values.
 * @param {Array<number>} values
 * @return {number}
 */
function average(values) {
    return values.reduce((sum, x) => sum + x, 0) / values.length;
}

/**
 * Calculates the absolute average deviation for the given values.
 * @param {Array<number>} values
 * @param {number} avg - arithmetic mean of the {@code values}.
 * @return {number}
 */
function absAverageDeviation(values, avg) {
    return Math.floor(values.reduce((sum, x) => sum + Math.abs(avg - x), 0) / values.length);
}

/**
 * Class calculates "video fluidity statistics" based on the inter frame render intervals. The idea is to tell when
 * a browser is struggling with video rendering by judging on the durations between each frame rendered. If the delays
 * are very different from each other then the video will appear less fluid and that usually happens when machine is
 * overloaded and not able to keep up.
 */
export class VFS {
    /**
     * Initializes the new instance.
     * @param {number} n - the size of the timestamps buffer.
     */
    constructor(n) {
        this._intervals = [];
        this._lastTimestamp = undefined;
        this.n = n;
    }

    /**
     * The method must be called after a video frame is rendered.
     *
     * @returns {void}
     */
    onFrameRendered() {
        if (!this._lastTimestamp) {
            this._lastTimestamp = Date.now();

            return;
        }

        if (this._intervals.length >= this.n - 1) {
            this._intervals.shift();
        }

        const now = Date.now();
        const interval = now - this._lastTimestamp;

        // Assume the window was hidden if the delay > 1 sec even though it can also happen under really bad load too
        if (interval > 1000) {
            this.reset();
        } else {
            this._intervals.push(interval);
        }

        this._lastTimestamp = now;
    }

    /**
     * Calculates the video fluidity statistics and returns them in an object if there was enough data collected,
     * otherwise the method will return undefined.
     *
     * @returns {{
     *     absAvgDev: number,
     *     avgFps: number,
     *     absAvgDevPerc: number,
     *     avgFrameInterval: number
     *     }|undefined}
     */
    calcStats() {
        if (this._intervals.length < this.n - 1) {
            return undefined;
        }

        const intervals = this._intervals;
        const avgFrameInterval = average(intervals);
        const absAvgDev = absAverageDeviation(intervals, avgFrameInterval);

        return {
            avgFrameInterval,
            avgFps: avgFrameInterval ? 1000 / avgFrameInterval : undefined,
            absAvgDev,
            absAvgDevPerc: (absAvgDev / avgFrameInterval) * 100
        };
    }

    /**
     * Resets the calculations by emptying the timestamp buffer. This should be done whenever the video track's
     * specification changes enough to invalidate any currently stored results. That will be for example when target FPS
     * or resolution is adjusted by the bandwidth estimation, quality settings or load prevention mechanisms.
     *
     * @returns {void}
     */
    reset() {
        this._intervals = [];
        this._lastTimestamp = undefined;
    }
}
