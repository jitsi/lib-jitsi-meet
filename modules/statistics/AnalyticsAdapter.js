import RTCBrowserType from '../RTC/RTCBrowserType';
import Settings from '../settings/Settings';

/**
 * Interface for analytics handlers.
 */
class AnalyticsAbstract {
    /**
     *
     */
    sendEvent() {} // eslint-disable-line no-empty-function
}

/**
 * Handler that caches all the events.
 * @extends AnalyticsAbstract
 */
class CacheAnalytics extends AnalyticsAbstract {
    /**
     *
     */
    constructor() {
        super();

        // some events may happen before init or implementation script download
        // in this case we accumulate them in this array and send them on init
        this.eventCache = [];
    }

    /**
     * Cache analytics event.
     * @param {String} action the name of the event
     * @param {Object} data can be any JSON object
     */
    sendEvent(action, data = {}) {
        this.eventCache.push({
            action,
            data
        });
    }

    /**
     * Clears the cached events.
     * @returns {Array} with the cached events.
     */
    drainCachedEvents() {
        const eventCacheCopy = this.eventCache.slice();

        this.eventCache = [];

        return eventCacheCopy;
    }

}

const cacheAnalytics = new CacheAnalytics();

/**
 * This class will store and manage the handlers that are going to be used.
 */
class AnalyticsAdapter {
    /**
     * Creates new AnalyticsAdapter instance.
     */
    constructor() {
        this.disposed = false;
        this.browserName = RTCBrowserType.getBrowserName();
        this.analyticsHandlers = new Set();

        /**
         * Map of properties that will be added to every event
         */
        this.permanentProperties = {
            callstatsname: Settings.callStatsUserName
        };

        this.analyticsHandlers.add(cacheAnalytics);
    }

    /**
     * Sends analytics event.
     * @param {String} action the name of the event
     * @param {Object} data can be any JSON object
     */
    sendEvent(action, data = {}) {
        const modifiedData = Object.assign(
            { browserName: this.browserName }, this.permanentProperties, data);

        this.analyticsHandlers.forEach(
            analytics =>
                analytics.sendEvent(
                    action,
                    analytics === cacheAnalytics ? data : modifiedData
                )
        );
    }

    /**
     * Dispose analytics. Clears all handlers.
     */
    dispose() {
        cacheAnalytics.drainCachedEvents();
        this.analyticsHandlers.clear();
        this.disposed = true;
    }

    /**
     * Sets the handlers that are going to be used to send analytics and send
     * the cached events.
     * @param {Array} handlers the handlers
     */
    setAnalyticsHandlers(handlers) {
        if (this.disposed) {
            return;
        }
        this.analyticsHandlers = new Set(handlers);
        cacheAnalytics.drainCachedEvents().forEach(
            ev => this.sendEvent(ev.action, ev.data));
    }

    /**
     * Adds map of properties that will be added to every event.
     * @param {Object} properties the map of properties
     */
    addPermanentProperties(properties) {
        Object.assign(this.permanentProperties, properties);
    }
}

export default new AnalyticsAdapter();
