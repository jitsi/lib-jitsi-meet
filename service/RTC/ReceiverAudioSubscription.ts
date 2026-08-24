/**
 * Enum representing the audio subscription options for remote audio streams. Retained for backwards
 * compatibility: {@link normalizeReceiverAudioSubscription} maps the legacy { mode, list } message to the
 * current {@link IReceiverAudioSubscriptionMessage} shape.
 */
export enum ReceiverAudioSubscription {
    /**
     * Subscribe to all remote audio streams signaled in the conference.
     */
    ALL = 'All',

    /**
     * Subscribe to all remote audio streams except the explicitly excluded ones.
     */
    EXCLUDE = 'Exclude',

    /**
     * Subscribe only to the explicitly included remote audio streams.
     */
    INCLUDE = 'Include',

    /**
     * Do not subscribe to any remote audio streams.
     */
    NONE = 'None'
}

/**
 * Message describing which remote audio streams the local endpoint wants the Jitsi Videobridge to forward.
 * The three fields combine rather than being mutually exclusive: `all` is the baseline (forward every regular
 * source); `include` adds extra sources on top (e.g. bridge-injected translated audio that `all` never
 * delivers); `exclude` drops specific sources. See the bridge's route-loudest configuration at
 * https://github.com/jitsi/jitsi-videobridge/blob/master/jvb/src/main/resources/reference.conf
 */
export interface IReceiverAudioSubscriptionMessage {
    /**
     * Whether to subscribe to every regular remote audio source (the baseline). Defaults to true; set to
     * false to receive only the explicitly included sources (or nothing when `include` is empty).
     */
    all?: boolean;

    /**
     * Source names to drop from the subscription. Defaults to an empty list.
     */
    exclude?: string[];

    /**
     * Source names to additionally forward on top of the baseline (e.g. opt-in/translated sources that are
     * not delivered by `all`). Defaults to an empty list.
     */
    include?: string[];
}

/**
 * Legacy audio-subscription message shape (pre `{ all, include, exclude }`). Still accepted by
 * {@link JitsiConference.setAudioSubscriptionMode} and normalised via {@link normalizeReceiverAudioSubscription}.
 */
export interface ILegacyReceiverAudioSubscriptionMessage {
    /**
     * Source names for the INCLUDE/EXCLUDE modes.
     */
    list?: string[];

    /**
     * The subscription mode.
     */
    mode: ReceiverAudioSubscription;
}

/**
 * Normalises a legacy { mode, list } message to the { all, include, exclude } shape, or returns an
 * already-current message with its fields defaulted.
 *
 * @param {IReceiverAudioSubscriptionMessage | ILegacyReceiverAudioSubscriptionMessage} message - The message.
 * @returns {IReceiverAudioSubscriptionMessage} The normalised subscription.
 */
export function normalizeReceiverAudioSubscription(
        message: IReceiverAudioSubscriptionMessage | ILegacyReceiverAudioSubscriptionMessage
): IReceiverAudioSubscriptionMessage {
    if ('mode' in message) {
        const list = message.list ?? [];

        switch (message.mode) {
        case ReceiverAudioSubscription.NONE:
            return { all: false, exclude: [], include: [] };
        case ReceiverAudioSubscription.INCLUDE:
            return { all: false, exclude: [], include: list };
        case ReceiverAudioSubscription.EXCLUDE:
            return { all: true, exclude: list, include: [] };
        default:
            return { all: true, exclude: [], include: [] };
        }
    }

    return {
        all: message.all ?? true,
        exclude: message.exclude ?? [],
        include: message.include ?? []
    };
}
