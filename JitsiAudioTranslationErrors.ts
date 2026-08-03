/**
 * The error conditions returned by the audio-translation component when it rejects a translation request.
 * The string values are the XMPP error conditions the component replies with.
 */
export enum JitsiAudioTranslationErrors {

    /**
     * The translation request was malformed. Indicates a client bug rather than a user-actionable problem.
     */
    BAD_REQUEST = 'bad-request',

    /**
     * The local participant is not permitted to use audio translation.
     */
    FORBIDDEN = 'forbidden',

    /**
     * The target speaker is no longer present in the conference.
     */
    SPEAKER_UNAVAILABLE = 'item-not-found',

    /**
     * The per-receiver translation subscription limit was reached.
     */
    SUBSCRIPTION_LIMIT_REACHED = 'policy-violation',

    /**
     * An unrecognized error condition was returned by the component.
     */
    UNKNOWN = 'unknown'
}
