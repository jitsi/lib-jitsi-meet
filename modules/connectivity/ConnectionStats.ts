import { getLogger } from '@jitsi/logger';

import { createConnectionStageReachedEvent } from '../../service/statistics/AnalyticsEvents';
import Statistics from '../statistics/statistics';

const logger = getLogger(__filename);

/**
 * Sends analytics events for the connection times stored in the chat room.
 *
 * @param {Record<string, number>} connectionTimes - The connection times to send.
 * @param {string} prefix - The prefix to add to the event name.
 */
export function sendConnectionTimes(connectionTimes: Record<string, number>, prefix: string = ''): void {
    if (!connectionTimes) {
        return;
    }

    Object.keys(connectionTimes).forEach(key => {
        const event
            = createConnectionStageReachedEvent(
                `${prefix}${key}`,
                { value: connectionTimes[key] });

        Statistics.sendAnalytics(event);
    });
}

/**
 * Records the data channel opened time and sends an analytics event.
 *
 * @param {Record<string, number>} connectionTimes - The connection times object to update.
 * @param {number} time - The timestamp when the data channel was opened.
 */
export function onDataChannelOpened(connectionTimes: Record<string, number>, time: number): void {
    const key = 'data.channel.opened';

    logger.info(`(TIME) ${key}:\t`, time);
    // eslint-disable-next-line no-param-reassign
    connectionTimes[key] = time;
    Statistics.sendAnalytics(
        createConnectionStageReachedEvent(key, { value: time }));
}