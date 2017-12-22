import {
    TYPE_OPERATIONAL,
    TYPE_PAGE,
    TYPE_TRACK,
    TYPE_UI
} from '../../service/statistics/AnalyticsEvents';
import { getLogger } from 'jitsi-meet-logger';
import RTCBrowserType from '../RTC/RTCBrowserType';
import Settings from '../settings/Settings';

const MAX_CACHE_SIZE = 100;

// eslist-disable-line no-undef
const logger = getLogger(__filename);

/**
 * This class provides an API to lib-jitsi-meet and its users for sending
 * analytics events. It serves as a bridge to different backend implementations
 * ("analytics handlers") and a cache for events attempted to be sent before
 * the analytics handlers were enabled.
 *
 * The API is designed to be an easy replacement for the previous version of
 * this adapter, and is meant to be extended with more convenience methods.
 *
 *
 * The API calls are translated to objects with the following structure, which
 * are then passed to the sendEvent(event) function of the underlying handlers:
 *
 * {
 *    type,
 *
 *    action,
 *    actionSubject,
 *    actionSubjectId,
 *    attributes,
 *    categories,
 *    containerId,
 *    containerType,
 *    name,
 *    objectId,
 *    objectType,
 *    source,
 *    tags
 * }
 *
 * The 'type' is one of 'operational', 'page', 'track' or 'ui', and some of the
 * other properties are considered required according to the type.
 *
 * For events with type 'page', the required properties are: name.
 *
 * For events with type 'operational' and 'ui', the required properties are:
 * action, actionSubject, source
 *
 * For events with type 'page', the required properties are:
 * action, actionSubject, source, containerType, containerId, objectType,
 * objectId
 */
class AnalyticsAdapter {
    /**
     * Creates new AnalyticsAdapter instance.
     */
    constructor() {
        /**
         * Whether this AnalyticsAdapter has been disposed of or not. Once this
         * is set to true, the AnalyticsAdapter is disabled and does not accept
         * any more events, and it can not be re-enabled.
         * @type {boolean}
         */
        this.disposed = false;

        /**
         * The set of handlers to which events will be sent.
         * @type {Set<any>}
         */
        this.analyticsHandlers = new Set();

        /**
         * The cache of events which are not sent yet. The cache is enabled
         * while this field is truthy, and disabled otherwise.
         * @type {Array}
         */
        this.cache = [];

        /**
         * Map of properties that will be added to every event. Note that the
         * keys will be prefixed with "permanent.".
         */
        this.permanentProperties = {};

        this.addPermanentProperties({
            callstatsname: Settings.callStatsUserName,
            userAgent: navigator.userAgent,
            browserName: RTCBrowserType.getBrowserName()
        });
    }

    /**
     * Dispose analytics. Clears all handlers.
     */
    dispose() {
        this.setAnalyticsHandlers([]);
        this.disposed = true;
    }

    /**
     * Sets the handlers that are going to be used to send analytics. Sends any
     * cached events.
     * @param {Array} handlers the handlers
     */
    setAnalyticsHandlers(handlers) {
        if (this.disposed) {
            return;
        }

        this.analyticsHandlers = new Set(handlers);

        // Note that we disable the cache even if the set of handlers is empty.
        const cache = this.cache;

        this.cache = null;
        if (cache) {
            cache.forEach(event => this._sendEvent(event));
        }
    }

    /**
     * Adds a set of permanent properties to add this this AnalyticsAdapter.
     * Permanent properties will be added as "attributes" to events sent to
     * the underlying "analytics handlers", and their keys will be prefixed
     * by "permanent.", i.e. adding a permanent property {key: "value"} will
     * result in {"permanent.key": "value"} object to be added to the
     * "attributes" field of events.
     *
     * @param {Object} properties the properties to add
     */
    addPermanentProperties(properties) {
        for (const property in properties) {
            if (properties.hasOwnProperty(property)) {
                this.permanentProperties[`permanent.${property}`]
                    = properties[property];
            }
        }
    }

    /**
     * Sends an event with a given name and given properties. The event type
     * is set to "operational", and the required fields are all set to the given
     * event name.
     * @param {String|Object} eventName either a string to be used as the name
     * of the event, or an event object. If an event object is passed, the
     * properties parameters is ignored.
     * @param {Object} properties the properties/attributes to attach to the
     * event, if eventName is a string.
     */
    sendEvent(eventName, properties = {}) {
        let event = null;

        if (typeof eventName === 'string') {
            event = {
                type: TYPE_OPERATIONAL,
                action: eventName,
                actionSubject: eventName,
                source: eventName,
                attributes: properties
            };
        } else if (typeof eventName === 'object') {
            event = eventName;
        }

        if (!AnalyticsAdapter._verifyRequiredFields(event)) {
            logger.error(
                `Dropping a mis-formatted event: ${JSON.stringify(event)}`);

            return;
        }

        this._sendEvent(event);
    }

    /**
     *
     * @param event
     */
    sendOperationalEvent(event) {
        event.type = TYPE_OPERATIONAL;

        if (!AnalyticsAdapter._verifyRequiredFields(event)) {
            logger.error(
                `Dropping a mis-formatted operational event: ${
                    JSON.stringify(event)}`);

            return;
        }

        this._sendEvent(event);
    }

    /**
     *
     * @param name
     */
    sendPageEvent(name) {
        const event = { type: TYPE_PAGE,
            name };

        if (!AnalyticsAdapter._verifyRequiredFields(event)) {
            logger.error(
                `Dropping a mis-formatted page event: ${
                    JSON.stringify(event)}`);

            return;
        }

        this._sendEvent(event);
    }

    /**
     *
     * @param event
     */
    sendUIEvent(event) {
        event.type = TYPE_UI;

        if (!AnalyticsAdapter._verifyRequiredFields(event)) {
            logger.error(
                `Dropping a mis-formatted UI event: ${JSON.stringify(event)}`);

            return;
        }

        this._sendEvent(event);

    }


    /**
     * XXX this deserves an explanation
     * @param event
     * @private
     */
    static _verifyRequiredFields(event) {
        if (!event) {
            return false;
        }

        const type = event.type;

        if (type !== TYPE_OPERATIONAL && type !== TYPE_PAGE
            && type !== TYPE_UI && type !== TYPE_TRACK) {
            logger.error(`Unknown event type: ${type}`);

            return false;
        }

        if (type === TYPE_PAGE) {
            return Boolean(event.name);
        }

        // Try to set some reasonable default values in case some of the
        // parameters required by the handler API are missing.
        event.action = event.action || event.name || event.actionSubject;
        event.actionSubject = event.actionSubject || event.name || event.action;
        event.source = event.source || event.name || event.action
            || event.actionSubject;

        if (!event.action || !event.actionSubject || !event.source) {
            logger.error(
                'Required field missing (action, actionSubject or source)');

            return false;
        }

        // Track events have additional required fields.
        if (type === TYPE_TRACK) {
            event.objectType = event.objectType || 'generic-object-type';
            event.containerType
                = event.containerType || 'generic-container-type';

            if (!event.objectType || !event.objectId
                || !event.containerType || !event.containerId) {
                logger.error(
                    'Required field missing (containerId, containerType, '
                        + 'objectId or objectType)');

                return false;
            }
        }

        return true;
    }

    /**
     * Saves an event to the cache, if the cache is enabled.
     * @param event the event to save.
     * @returns {boolean} true if the event was saved, and false otherwise (i.e.
     * if the cache was disabled).
     * @private
     */
    _maybeCacheEvent(event) {
        if (this.cache) {
            this.cache.push(event);

            // We limit the size of the cache, in case the user fails to ever
            // set the analytics handlers.
            if (this.cache.length > MAX_CACHE_SIZE) {
                this.cache.splice(0, 1);
            }

            return true;
        }

        return false;

    }

    /**
     *
     * @param event
     * @private
     */
    _sendEvent(event) {
        if (this._maybeCacheEvent(event)) {
            // The event was consumed by the cache.
        } else {
            // We append the permanent properties at the time we send the event,
            // not at the time we receive it.
            const extendedEvent = this._appendPermanentProperties(event);

            this.analyticsHandlers.forEach(
                handler => handler.sendEvent(extendedEvent));
        }
    }

    /**
     * Extends an event object with the configured permanent properties.
     * @param event the event to extend with permanent properties.
     * @returns {any & ({}|*)} the extended event
     * @private
     */
    _appendPermanentProperties(event) {
        return Object.assign(event, this.permanentProperties);
    }

}

export default new AnalyticsAdapter();
