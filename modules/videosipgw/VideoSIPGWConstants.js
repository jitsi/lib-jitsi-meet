/**
 * Status that video SIP GW service is available.
 * @type {string}
 */
export const STATUS_AVAILABLE = 'available';

/**
 * Status that video SIP GW service is not available.
 * @type {string}
 */
export const STATUS_UNDEFINED = 'undefined';

/**
 * Status that video SIP GW service is available but there are no free nodes
 * at the moment to serve new requests.
 * @type {string}
 */
export const STATUS_BUSY = 'busy';

/**
 * Video SIP GW session state, currently running.
 * @type {string}
 */
export const STATE_ON = 'on';

/**
 * Video SIP GW session state, currently stopped and not running.
 * @type {string}
 */
export const STATE_OFF = 'off';

/**
 * Video SIP GW session state, currently is starting.
 * @type {string}
 */
export const STATE_PENDING = 'pending';

/**
 * Video SIP GW session state, has observed some issues and is retrying at the
 * moment.
 * @type {string}
 */
export const STATE_RETRYING = 'retrying';

/**
 * Video SIP GW session state, tried to start but it failed.
 * @type {string}
 */
export const STATE_FAILED = 'failed';
