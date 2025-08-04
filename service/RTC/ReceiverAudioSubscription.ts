/**
 * Enum representing the audio subscription options for remote audio streams. The Jitsi Vide Bridge will forward the
 * remote audio streams to the client based on the selected subscription option and also based on the route loudest
 * configuration described at
 * https://github.com/jitsi/jitsi-videobridge/blob/master/jvb/src/main/resources/reference.conf#L344
 */
export enum ReceiverAudioSubscription {
    /**
     * Subscribe to all remote audio streams signaled in the conference.
     */
    ALL = 'All',

    /**
     * Subscribe to all remote audio streams signaled in the conference, except for the one that are explicitly
     * excluded.
     */
    EXCLUDE = 'Exclude',

    /**
     * Subscribe only to the remote audio streams that are explicitly included in the subscription.
     */
    INCLUDE = 'Include',

    /**
     * Do not subscribe to any remote audio streams signaled in the conference.
     */
    NONE = 'None'
}

/**
 * Interface representing a message for audio subscription updates.
 */
export interface IReceiverAudioSubscriptionMessage {
    list?: string[];
    mode: ReceiverAudioSubscription;
}
