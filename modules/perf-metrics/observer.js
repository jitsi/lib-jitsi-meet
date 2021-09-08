import { getLogger } from 'jitsi-meet-logger';

import { createPerfMetricsEvent } from '../../service/statistics/AnalyticsEvents';
import Statistics from '../statistics/statistics';

import { JITSI_METRIC_PREFIX } from './constants';

const logger = getLogger(__filename);

/**
 * Reference to the singleton performance observers.
 */
let observer;

/**
 * Initializes a {@link PerformanceObserver} for logging performance metrics.
 */
export function initialize() {
    if ('PerformanceObserver' in window) {
        if (observer) {
            dispose();
        }
        observer = new PerformanceObserver((list, observer_) => {
            const metrics = [];

            list.getEntries().forEach(entry => {
                if (observer === observer_ && entry.name.startsWith(JITSI_METRIC_PREFIX)) {
                    metrics.push(entry);
                    logger.debug(`${entry.name.replace(JITSI_METRIC_PREFIX, '')} took ${entry.duration}ms`);
                }
            });

            if (metrics.length > 0) {
                Statistics.sendAnalytics(createPerfMetricsEvent(metrics));
            }
        });

        observer.observe({
            buffered: true,
            type: 'measure'
        });
    }
}

/**
 * Stops the performance observer and clears all stored marks.
 */
function dispose() {
    // Clear all marks.
    window.performance.getEntriesByType('mark')
        .map(entry => entry.name)
        .filter(name => name.startsWith(JITSI_METRIC_PREFIX))
        .forEach(name => {
            window.performance.clearMarks(name);
        });

    // Clear all measures.
    window.performance.getEntriesByType('measure')
        .map(entry => entry.name)
        .filter(name => name.startsWith(JITSI_METRIC_PREFIX))
        .forEach(name => {
            window.performance.clearMeasures(name);
        });

    // Remove observer.
    if (observer) {
        observer.disconnect();
        observer = null;
    }
}
