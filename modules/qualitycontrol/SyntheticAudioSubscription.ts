/**
 * The synthetic-audio subscription services known to the library. Synthetic sources are bridge-injected
 * audio streams (never sent by a client): they are excluded from the `all` baseline and forwarded only on
 * an explicit include, so each consuming feature manages its own opt-in set.
 */
export const enum SyntheticAudioService {

    /**
     * Bridge-side live audio translation: one synthetic source per (speaker, language), named
     * `{endpointId}-a0.{language}`.
     */
    AUDIO_TRANSLATION = 'audio-translation',

    /**
     * Voice agents (bot participants): one synthetic source per agent, named `{agentId}-a0` and
     * advertised through room metadata.
     */
    VOICE_AGENTS = 'voice-agents'
}

/**
 * The minimal surface a {@link SyntheticAudioSubscription} needs from its owning controller. Implemented by
 * {@code ReceiverAudioController}; kept as an interface so the two modules do not import each other's classes.
 */
export interface ISyntheticIncludeSink {

    /**
     * Returns the source names currently subscribed for a service.
     *
     * @param {string} serviceId - The service whose sources to return.
     * @returns {Array<string>}
     */
    getServiceIncludes: (serviceId: string) => string[];

    /**
     * Replaces the set of synthetic sources subscribed for a service and re-sends the effective
     * subscription (the union across all services) to the bridge.
     *
     * @param {string} serviceId - The service whose sources to replace.
     * @param {Array<string>} sourceNames - The service's full desired set of source names.
     * @returns {void}
     */
    setServiceIncludes: (serviceId: string, sourceNames: string[]) => void;
}

/**
 * A per-service handle on the receiver's synthetic-audio subscription.
 *
 * Multiple services (audio translation, voice agents) subscribe to bridge-injected synthetic sources
 * concurrently. Each service owns its handle and only ever replaces its own set; the controller sends the
 * union of all services' sets to the bridge, so services co-exist without clobbering one another.
 */
export class SyntheticAudioSubscription {
    private _sink: ISyntheticIncludeSink;
    private _serviceId: string;

    /**
     * Creates a handle for one service.
     *
     * @param {ISyntheticIncludeSink} sink - The controller owning the effective subscription.
     * @param {string} serviceId - The service this handle subscribes for.
     */
    constructor(sink: ISyntheticIncludeSink, serviceId: string) {
        this._sink = sink;
        this._serviceId = serviceId;
    }

    /**
     * The source names this service currently subscribes to.
     *
     * @returns {Array<string>}
     */
    get sources(): string[] {
        return this._sink.getServiceIncludes(this._serviceId);
    }

    /**
     * Replaces this service's full set of subscribed synthetic sources. Other services' subscriptions are
     * unaffected. An empty array clears this service's subscription.
     *
     * @param {Array<string>} sourceNames - The desired source names.
     * @returns {void}
     */
    setSources(sourceNames: string[]): void {
        this._sink.setServiceIncludes(this._serviceId, sourceNames);
    }

    /**
     * Clears this service's subscription (equivalent to {@code setSources([])}).
     *
     * @returns {void}
     */
    clear(): void {
        this.setSources([]);
    }
}
