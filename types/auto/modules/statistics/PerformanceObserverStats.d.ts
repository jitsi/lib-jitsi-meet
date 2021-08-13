/**
 * This class creates an observer that monitors browser's performance measurement events
 * as they are recorded in the browser's performance timeline and computes an average and
 * a maximum value for the long task events. Tasks are classified as long tasks if they take
 * longer than 50ms to execute on the main thread.
 */
export class PerformanceObserverStats {
    /**
     * Creates a new instance of Performance observer statistics.
     *
     * @param {*} emitter Event emitter for emitting stats periodically
     * @param {*} statsInterval interval for calculating the stats
     */
    constructor(emitter: any, statsInterval: any);
    eventEmitter: any;
    longTasks: number;
    maxDuration: number;
    performanceStatsInterval: any;
    stats: RunningAverage;
    /**
     * Obtains the average rate of long tasks observed per min and the
     * duration of the longest task recorded by the observer.
     * @returns {Object}
     */
    getLongTasksStats(): any;
    /**
     * Starts the performance observer by registering the callback function
     * that calculates the performance statistics periodically.
     * @returns {void}
     */
    startObserver(): void;
    longTaskEventHandler: (list: any) => void;
    observer: PerformanceObserver;
    longTasksIntervalId: NodeJS.Timer;
    _lastTimeStamp: number;
    /**
     * Stops the performance observer.
     * @returns {void}
     */
    stopObserver(): void;
}
import { RunningAverage } from "../util/MathUtil";
