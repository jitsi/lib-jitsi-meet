/**
 * The conditions of the reason element of a Jingle session-terminate, as defined in XEP-0166.
 */
export enum JingleReasonCondition {

    /**
     * The party prefers to use an existing session with the peer instead of a new one.
     */
    ALTERNATIVE_SESSION = 'alternative-session',

    /**
     * The party is busy and can't accept a session.
     */
    BUSY = 'busy',

    /**
     * The initiator cancels the session before it is accepted.
     */
    CANCEL = 'cancel',

    /**
     * The session ends because of a connectivity problem, e.g. ICE failed.
     */
    CONNECTIVITY_ERROR = 'connectivity-error',

    /**
     * The party declines the session.
     */
    DECLINE = 'decline',

    /**
     * The session ran past a time limit. Jicofo uses it to end the session of a participant left alone.
     */
    EXPIRED = 'expired',

    /**
     * The party couldn't start the processing of the application type.
     */
    FAILED_APPLICATION = 'failed-application',

    /**
     * The party couldn't establish connectivity for the transport method.
     */
    FAILED_TRANSPORT = 'failed-transport',

    /**
     * An error with no more specific condition.
     */
    GENERAL_ERROR = 'general-error',

    /**
     * The entity is going offline or is no longer available.
     */
    GONE = 'gone',

    /**
     * The party supports the application type but not the offered or negotiated parameters.
     */
    INCOMPATIBLE_PARAMETERS = 'incompatible-parameters',

    /**
     * The session ends because of a media processing problem.
     */
    MEDIA_ERROR = 'media-error',

    /**
     * The session violates a local security policy.
     */
    SECURITY_ERROR = 'security-error',

    /**
     * The session ends normally, not because of an error.
     */
    SUCCESS = 'success',

    /**
     * A request wasn't answered in time.
     */
    TIMEOUT = 'timeout',

    /**
     * The party supports none of the offered application types.
     */
    UNSUPPORTED_APPLICATIONS = 'unsupported-applications',

    /**
     * The party supports none of the offered transport methods.
     */
    UNSUPPORTED_TRANSPORTS = 'unsupported-transports'
}
