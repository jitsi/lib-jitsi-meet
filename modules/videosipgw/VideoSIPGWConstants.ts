export enum VideoSIPGWStatusConstants {
    /**
     * Status that video SIP GW service is available.
     */
    STATUS_AVAILABLE = 'available',

    /**
     * Status that video SIP GW service is not available.
     */
    STATUS_UNDEFINED = 'undefined',

    /**
     * Status that video SIP GW service is available but there are no free nodes
     * at the moment to serve new requests.
     */
    STATUS_BUSY = 'busy'
};

export enum VideoSIPGWStateConstants {
    /**
     * Video SIP GW session state, currently running.
     */
    STATE_ON = 'on',

    /**
     * Video SIP GW session state, currently stopped and not running.
     */
    STATE_OFF = 'off',

    /**
     * Video SIP GW session state, currently is starting.
     */
    STATE_PENDING = 'pending',

    /**
     * Video SIP GW session state, has observed some issues and is retrying at the
     * moment.
     */
    STATE_RETRYING = 'retrying',

    /**
     * Video SIP GW session state, tried to start but it failed.
     */
    STATE_FAILED = 'failed'
};

export enum VideoSIPGWErrorConstants {
    /**
     * Error on trying to create video SIP GW session in conference where
     * there is no room connection (hasn't joined or has left the room).
     */
    ERROR_NO_CONNECTION = 'error_no_connection',

    /**
     * Error on trying to create video SIP GW session with address for which
     * there is an already created session.
     */
    ERROR_SESSION_EXISTS = 'error_session_already_exists'
};

// exported for backward compatibility
export const STATUS_AVAILABLE = VideoSIPGWStatusConstants.STATUS_AVAILABLE;
export const STATUS_UNDEFINED = VideoSIPGWStatusConstants.STATUS_UNDEFINED;
export const STATUS_BUSY = VideoSIPGWStatusConstants.STATUS_BUSY;

export const STATE_ON = VideoSIPGWStateConstants.STATE_ON;
export const STATE_OFF = VideoSIPGWStateConstants.STATE_OFF;
export const STATE_PENDING = VideoSIPGWStateConstants.STATE_PENDING;
export const STATE_RETRYING = VideoSIPGWStateConstants.STATE_RETRYING;
export const STATE_FAILED = VideoSIPGWStateConstants.STATE_FAILED;

export const ERROR_NO_CONNECTION = VideoSIPGWErrorConstants.ERROR_NO_CONNECTION;
export const ERROR_SESSION_EXISTS = VideoSIPGWErrorConstants.ERROR_SESSION_EXISTS;
