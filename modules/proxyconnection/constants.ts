/**
 * The know jingle actions that can be sent and should be acted upon by
 * {@code ProxyConnectionService} and {@code ProxyConnectionPC}.
 */
export enum ACTIONS {
    ACCEPT = 'session-accept',
    CONNECTION_ERROR = 'connection-error-encountered',
    INITIATE = 'session-initiate',
    TERMINATE = 'session-terminate',
    TRANSPORT_INFO = 'transport-info',
    UNAVAILABLE = 'unavailable'
};
