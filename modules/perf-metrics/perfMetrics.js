import { getLogger } from 'jitsi-meet-logger';

import { MEASURES } from './constants';
import * as observer from './observer';

const logger = getLogger(__filename);

/**
 * Stores the starting mark for the given name.
 *
 * @param {string} name - Name of the metric that will be measured.
 */
function markStart(name) {
    window.performance.mark(`${name}.start`);
}

/**
 * Stores the ending mark for the given name. A measurement will be stored and the
 * start end end marks will be removed.
 *
 * @param {string} name - Name of the metric that will be measured.
 */
function markEnd(name) {
    // Get the latest start mark. It's possible we have several marks with the same
    // name, for example in failed connection attempts. We will clean them up once
    // we match the ending one.
    const startMarkName = `${name}.start`;
    const [ startMark ] = window.performance.getEntriesByName(startMarkName).slice(-1);

    if (!startMark) {
        logger.warn(`${startMarkName} not found`);

        return;
    }

    const endMarkName = `${name}.end`;

    window.performance.mark(endMarkName);
    window.performance.measure(name, endMarkName);
}

export default {
    MEASURES,
    init: observer.initialize,
    markStart,
    markEnd
};
