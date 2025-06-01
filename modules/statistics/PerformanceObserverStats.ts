import { getLogger } from '@jitsi/logger';

import * as StatisticsEvents from '../../service/statistics/Events';
import { RunningAverage } from '../util/MathUtil';

const logger = getLogger('modules/statistics/PerformanceObserverStats');
const MILLI_SECONDS = 1000;
const SECONDS = 60;

export interface ILongTasksStats {
    avgRatePerMinute: string;
    maxDurationMs: string | number;
}

/**
 * This class creates an observer that monitors browser's performance measurement events
 * as they are recorded in the browser's performance timeline and computes an average and
 * a maximum value for the long task events. Tasks are classified as long tasks if they take
 * longer than 50ms to execute on the main thread.
 */
export class PerformanceObserverStats {
    eventEmitter: any;
    longTasks: number;
    maxDuration: number;
    performanceStatsInterval: number;
    stats: RunningAverage;
    observer?: PerformanceObserver;
    longTaskEventHandler: ((list: PerformanceObserverEntryList) => void) | null;
    longTasksIntervalId: number | null;
    _lastTimeStamp?: number;

    /**
     * Creates a new instance of Performance observer statistics.
     *
     * @param {*} emitter Event emitter for emitting stats periodically
     * @param {*} statsInterval interval for calculating the stats
     */
    constructor(emitter: any, statsInterval: number) {
        this.eventEmitter = emitter;
        this.longTasks = 0;
        this.maxDuration = 0;
        this.performanceStatsInterval = statsInterval;
        this.stats = new RunningAverage();
        this.longTaskEventHandler = null;
        this.longTasksIntervalId = null;
    }

    /**
     * Obtains the average rate of long tasks observed per min and the
     * duration of the longest task recorded by the observer.
     * @returns {Object}
     */
    getLongTasksStats(): ILongTasksStats {
        return {
            avgRatePerMinute: (this.stats.getAverage() * SECONDS).toFixed(2), // calc rate per min
            maxDurationMs: this.maxDuration
        };
    }

    /**
     * Starts the performance observer by registering the callback function
     * that calculates the performance statistics periodically.
     * @returns {void}
     */
    startObserver(): void {
        // Create a handler for when the long task event is fired.
        this.longTaskEventHandler = (list: PerformanceObserverEntryList) => {
            const entries = list.getEntries();

            for (const task of entries) {
                this.longTasks++;
                this.maxDuration = parseFloat(Math.max(this.maxDuration, task.duration).toFixed(3));
            }
        };

        // Create an observer for monitoring long tasks.
        logger.info('Creating a Performance Observer for monitoring Long Tasks');
        this.observer = new PerformanceObserver(this.longTaskEventHandler);
        this.observer.observe({ type: 'longtask',
            buffered: true });
        const startTime = Date.now();

        // Calculate the average # of events/sec and emit a stats event.
        this.longTasksIntervalId = window.setInterval(() => {
            const now = Date.now();
            const interval = this._lastTimeStamp
                ? (now - this._lastTimeStamp) / MILLI_SECONDS
                : (now - startTime) / MILLI_SECONDS;
            const rate = this.longTasks / interval;

            this.stats.addNext(rate);
            this.eventEmitter.emit(
                StatisticsEvents.LONG_TASKS_STATS, this.getLongTasksStats());

            // Reset the counter and start counting events again.
            this.longTasks = 0;
            this._lastTimeStamp = Date.now();
        }, this.performanceStatsInterval);
    }

    /**
     * Stops the performance observer.
     * @returns {void}
     */
    stopObserver(): void {
        this.observer && this.observer.disconnect();
        this.longTaskEventHandler = null;
        if (this.longTasksIntervalId) {
            clearInterval(this.longTasksIntervalId);
            this.longTasksIntervalId = null;
        }
    }
}
