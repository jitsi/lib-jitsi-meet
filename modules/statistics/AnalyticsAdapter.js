import {
    TYPE_OPERATIONAL,
    TYPE_PAGE,
    TYPE_TRACK,
    TYPE_UI
} from '../../service/statistics/AnalyticsEvents';
import { getLogger } from 'jitsi-meet-logger';
import { AnalyticsCacheAdapater } from 'js-utils';
import browser from '../browser';
import Settings from '../settings/Settings';

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
class AnalyticsAdapter extends AnalyticsCacheAdapater {
    /**
     * Creates new AnalyticsAdapter instance.
     */
    constructor() {
        super();

        /**
         * Map of properties that will be added to every event. Note that the
         * keys will be prefixed with "permanent.".
         */
        this.permanentProperties = {};

        /**
         * The name of the conference that this AnalyticsAdapter is associated
         * with.
         * @type {null}
         */
        this.conferenceName = '';

        this.addPermanentProperties({
            'callstats_name': Settings.callStatsUserName,
            'user_agent': navigator.userAgent,
            'browser_name': browser.getName()
        });
    }

    /**
     * Adds a set of permanent properties to this this AnalyticsAdapter.
     * Permanent properties will be added as "attributes" to events sent to
     * the underlying "analytics handlers", and their keys will be prefixed
     * by "permanent_", i.e. adding a permanent property {key: "value"} will
     * result in {"permanent_key": "value"} object to be added to the
     * "attributes" field of events.
     *
     * @param {Object} properties the properties to add
     */
    addPermanentProperties(properties) {
        for (const property in properties) {
            if (properties.hasOwnProperty(property)) {
                this.permanentProperties[`permanent_${property}`]
                    = properties[property];
            }
        }
    }

    /**
     * Sets the name of the conference that this AnalyticsAdapter is associated
     * with.
     * @param name the name to set.
     */
    setConferenceName(name) {
        this.conferenceName = name;
        this.addPermanentProperties({ 'conference_name': name });
    }

    /**
     * Sends an event with a given name and given properties. The first
     * parameter is either a string or an object. If it is a string, it is used
     * as the event name and the second parameter is used at the attributes to
     * attach to the event. If it is an object, it represents the whole event,
     * including any desired attributes, and the second parameter is ignored.
     *
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

        if (!this._verifyRequiredFields(event)) {
            logger.error(
                `Dropping a mis-formatted event: ${JSON.stringify(event)}`);

            return;
        }

        super.sendEvent(event);
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
    _verifyRequiredFields(event) {
        if (!event) {
            return false;
        }

        if (!event.type) {
            event.type = TYPE_OPERATIONAL;
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
     * Adds the permanent props.
     *
     * @param {Object} event - The event to be formatted.
     * @returns {Object} - The formatted event.
     *
     * @override
     */
    _formatEvent(event) {
        this._appendPermanentProperties(event);

        return event;
    }

    /**
     * Extends an event object with the configured permanent properties.
     * @param event the event to extend with permanent properties.
     * @private
     */
    _appendPermanentProperties(event) {
        if (!event.attributes) {
            event.attributes = {};
        }

        event.attributes
            = Object.assign(event.attributes, this.permanentProperties);
    }

}

export default new AnalyticsAdapter();
