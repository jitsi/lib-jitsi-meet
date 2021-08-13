declare var _default: AnalyticsAdapter;
export default _default;
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
declare class AnalyticsAdapter {
    /**
     * Reset the state to the initial one.
     *
     * @returns {void}
     */
    reset(): void;
    /**
     * Whether this AnalyticsAdapter has been disposed of or not. Once this
     * is set to true, the AnalyticsAdapter is disabled and does not accept
     * any more events, and it can not be re-enabled.
     * @type {boolean}
     */
    disposed: boolean;
    /**
     * The set of handlers to which events will be sent.
     * @type {Set<any>}
     */
    analyticsHandlers: Set<any>;
    /**
     * The cache of events which are not sent yet. The cache is enabled
     * while this field is truthy, and disabled otherwise.
     * @type {Array}
     */
    cache: any[];
    /**
     * Map of properties that will be added to every event. Note that the
     * keys will be prefixed with "permanent.".
     */
    permanentProperties: any;
    /**
     * The name of the conference that this AnalyticsAdapter is associated
     * with.
     * @type {null}
     */
    conferenceName: any;
    /**
     * Dispose analytics. Clears all handlers.
     */
    dispose(): void;
    /**
     * Sets the handlers that are going to be used to send analytics. Sends any
     * cached events.
     * @param {Array} handlers the handlers
     */
    setAnalyticsHandlers(handlers: any[]): void;
    /**
     * Set the user properties to the analytics handlers.
     *
     * @returns {void}
     */
    _setUserProperties(): void;
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
    addPermanentProperties(properties: any): void;
    /**
     * Sets the name of the conference that this AnalyticsAdapter is associated
     * with.
     * @param name the name to set.
     */
    setConferenceName(name: any): void;
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
    sendEvent(eventName: string | any, properties?: any): void;
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
    private _verifyRequiredFields;
    /**
     * Saves an event to the cache, if the cache is enabled.
     * @param event the event to save.
     * @returns {boolean} true if the event was saved, and false otherwise (i.e.
     * if the cache was disabled).
     * @private
     */
    private _maybeCacheEvent;
    /**
     *
     * @param event
     * @private
     */
    private _sendEvent;
}
