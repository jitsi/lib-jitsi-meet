import { getLogger } from '@jitsi/logger';

import { AnalyticsEvents } from '../../service/statistics/AnalyticsEvents';
import browser from '../browser';

const MAX_CACHE_SIZE = 100;

const logger = getLogger('stats:AnalyticsAdapter');

/**
 * Type for analytics event objects.
 */
export interface IAnalyticsEvent {
    action?: string;
    actionSubject?: string;
    actionSubjectId?: string;
    attributes?: Record<string, unknown>;
    categories?: string[];
    containerId?: string;
    containerType?: string;
    name?: string;
    objectId?: string;
    objectType?: string;
    source?: string;
    tags?: string[];
    type: string;
}

/**
 * Type for analytics handler objects.
 */
export interface IAnalyticsHandler {
    dispose?: () => void;
    sendEvent: (event: IAnalyticsEvent) => void;
    setUserProperties: (properties: Record<string, unknown>) => void;
}

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
     * Whether this AnalyticsAdapter has been disposed of or not. Once this
     * is set to true, the AnalyticsAdapter is disabled and does not accept
     * any more events, and it can not be re-enabled.
     * @type {boolean}
     */
    private disposed: boolean;

    /**
     * The set of handlers to which events will be sent.
     * @type {Set<AnalyticsHandler>}
     */
    private analyticsHandlers: Set<IAnalyticsHandler>;

    /**
     * The cache of events which are not sent yet. The cache is enabled
     * while this field is truthy, and disabled otherwise.
     * @type {AnalyticsEvent[] | null}
     */
    private cache: IAnalyticsEvent[] | null;

    /**
     * Map of properties that will be added to every event. Note that the
     * keys will be prefixed with "permanent.".
     */
    private permanentProperties: Record<string, unknown>;

    /**
     * The name of the conference that this AnalyticsAdapter is associated
     * with.
     * @type {string}
     */
    private conferenceName: string;

    /**
     * Creates new AnalyticsAdapter instance.
     */
    constructor() {
        this.reset();
    }

    /**
     * Saves an event to the cache, if the cache is enabled.
     * @param event the event to save.
     * @returns {boolean} true if the event was saved, and false otherwise (i.e.
     * if the cache was disabled).
     * @private
     */
    private _maybeCacheEvent(event: IAnalyticsEvent): boolean {
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
    private _sendEvent(event: IAnalyticsEvent): void {
        if (this._maybeCacheEvent(event)) {
            // The event was consumed by the cache.
        } else {
            this.analyticsHandlers.forEach(handler => {
                try {
                    handler.sendEvent(event);
                } catch (e) {
                    logger.warn(`Error sending analytics event: ${e}`);
                }
            });
        }
    }


    /**
     * Set the user properties to the analytics handlers.
     *
     * @returns {void}
     */
    private _setUserProperties(): void {
        this.analyticsHandlers.forEach(handler => {
            try {
                handler.setUserProperties(this.permanentProperties);
            } catch (error) {
                logger.warn('Error in setUserProperties method of one of the '
                    + `analytics handlers: ${error}`);
            }
        });
    }

    /**
     * Checks whether an event has all of the required fields set, and tries
     * to fill in some of the missing fields with reasonable default values.
     * Returns true if after this operation the event has all of the required
     * fields set, and false otherwise (if some of the required fields were not
     * set and the attempt to fill them in with a default failed).
     *
     * @param event the event object.
     * @return {boolean} true if the event (after the call to this function)
     * contains all of the required fields, and false otherwise.
     * @private
     */
    private _verifyRequiredFields(event: IAnalyticsEvent | null): boolean {
        if (!event) {
            return false;
        }

        if (!event.type) {
            event.type = AnalyticsEvents.TYPE_OPERATIONAL;
        }

        const type = event.type;

        if (type !== AnalyticsEvents.TYPE_OPERATIONAL && type !== AnalyticsEvents.TYPE_PAGE
                && type !== AnalyticsEvents.TYPE_UI && type !== AnalyticsEvents.TYPE_TRACK) {
            logger.error(`Unknown event type: ${type}`);

            return false;
        }

        if (type === AnalyticsEvents.TYPE_PAGE) {
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
        if (type === AnalyticsEvents.TYPE_TRACK) {
            event.objectType = event.objectType || 'generic-object-type';
            event.containerType = event.containerType || 'conference';
            if (event.containerType === 'conference' && !event.containerId) {
                event.containerId = this.conferenceName;
            }


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
     * Adds a set of permanent properties to this this AnalyticsAdapter.
     * Permanent properties will be added as "attributes" to events sent to
     * the underlying "analytics handlers", and their keys will be prefixed
     * by "permanent_", i.e. adding a permanent property {key: "value"} will
     * result in {"permanent_key": "value"} object to be added to the
     * "attributes" field of events.
     *
     * @param {Record<string, unknown>} properties the properties to add
     */
    public addPermanentProperties(properties: Record<string, unknown>): void {
        this.permanentProperties = {
            ...this.permanentProperties,
            ...properties
        };

        this._setUserProperties();
    }

    /**
         * Dispose analytics. Clears all handlers.
         */
    public dispose(): void {
        logger.debug('Disposing of analytics adapter.');

        if (this.analyticsHandlers && this.analyticsHandlers.size > 0) {
            this.analyticsHandlers.forEach(handler => {
                if (typeof handler.dispose === 'function') {
                    handler.dispose();
                }
            });
        }

        this.setAnalyticsHandlers([]);
        this.disposed = true;
    }

    /**
     * Reset the state to the initial one.
     *
     * @returns {void}
     */
    public reset(): void {
        this.disposed = false;
        this.analyticsHandlers = new Set();
        this.cache = [];
        this.permanentProperties = {};
        this.conferenceName = '';
        this.addPermanentProperties({
            'browser_name': browser.getName(),
            'user_agent': navigator.userAgent
        });
    }

    /**
     * Sends an event with a given name and given properties. The first
     * parameter is either a string or an object. If it is a string, it is used
     * as the event name and the second parameter is used at the attributes to
     * attach to the event. If it is an object, it represents the whole event,
     * including any desired attributes, and the second parameter is ignored.
     *
     * @param {String|IAnalyticsEvent} eventName either a string to be used as the name
     * of the event, or an event object. If an event object is passed, the
     * properties parameters is ignored.
     * @param {Record<string, unknown>} properties the properties/attributes to attach to the
     * event, if eventName is a string.
     */
    public sendEvent(eventName: string | IAnalyticsEvent, properties: Record<string, unknown> = {}): void {
        if (this.disposed) {
            return;
        }

        let event: IAnalyticsEvent | null = null;

        if (typeof eventName === 'string') {
            event = {
                action: eventName,
                actionSubject: eventName,
                attributes: properties,
                source: eventName,
                type: AnalyticsEvents.TYPE_OPERATIONAL
            };
        } else if (typeof eventName === 'object') {
            event = eventName;
        }

        if (!this._verifyRequiredFields(event)) {
            logger.error(
                `Dropping a mis-formatted event: ${JSON.stringify(event)}`);

            return;
        }

        this._sendEvent(event);
    }

    /**
         * Sets the handlers that are going to be used to send analytics. Sends any
         * cached events.
         * @param {IAnalyticsHandler[]} handlers the handlers
         */
    public setAnalyticsHandlers(handlers: IAnalyticsHandler[]): void {
        if (this.disposed) {
            return;
        }

        this.analyticsHandlers = new Set(handlers);

        this._setUserProperties();

        // Note that we disable the cache even if the set of handlers is empty.
        const cache = this.cache;

        this.cache = null;
        if (cache) {
            cache.forEach(event => this._sendEvent(event));
        }
    }


    /**
     * Sets the name of the conference that this AnalyticsAdapter is associated
     * with.
     * @param name the name to set.
     */
    public setConferenceName(name: string): void {
        this.conferenceName = name;
        this.addPermanentProperties({ 'conference_name': name });
    }

}

export default new AnalyticsAdapter();
