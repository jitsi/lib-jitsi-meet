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
    all: boolean;

    /**
     * Source names to drop from the subscription.
     */
    exclude: string[];

    /**
     * Source names to additionally forward on top of the baseline (e.g. opt-in/translated sources that are
     * not delivered by `all`).
     */
    include: string[];
}
