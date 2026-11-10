
import { getLogger } from '@jitsi/logger';
import { isEqual } from 'lodash-es';

import JitsiConference from '../../JitsiConference';
import {
    ILegacyReceiverAudioSubscriptionMessage,
    IReceiverAudioSubscriptionMessage,
    normalizeReceiverAudioSubscription
} from '../../service/RTC/ReceiverAudioSubscription';
import RTC from '../RTC/RTC';

const logger = getLogger('qc:ReceiveAudioController');

/**
 * Controller for the local endpoint's remote-audio subscription. The subscription sent to the bridge combines
 * three dimensions: `all` (the baseline — forward every regular source), `include` (extra opt-in sources on
 * top) and `exclude` (sources to drop). The default is `all: true`.
 *
 * The include set has two layers: the base include from {@link setAudioSubscriptionMode}, and per-service
 * synthetic subscriptions (audio translation, voice agents — see {@link setServiceIncludes}). The
 * message sent to the bridge carries their union, so each layer can change without clobbering the others.
 */
export class ReceiverAudioController {
    private _rtc: RTC;

    /**
     * Whether the baseline subscription to every regular remote source is active. Defaults to true.
     */
    private _all: boolean;

    /**
     * Source names dropped from the subscription.
     */
    private _exclude: string[];

    /**
     * Source names additionally forwarded on top of the baseline, as set through
     * {@link setAudioSubscriptionMode} (the per-service synthetic sets are kept separately).
     */
    private _include: string[];

    /**
     * Synthetic source names subscribed per service (serviceId -> source names).
     */
    private _serviceIncludes: Map<string, string[]>;

    /**
     * Creates a new instance of the ReceiverAudioController.
     */
    constructor(conference: JitsiConference) {
        this._rtc = conference.rtc;
        this._all = true;
        this._exclude = [];
        this._include = [];
        this._serviceIncludes = new Map();
    }

    /**
     * Gets the current audio subscription as it is sent to the bridge (the include set is the union of the
     * base include and every service's synthetic subscription).
     *
     * @returns {IReceiverAudioSubscriptionMessage} The current audio subscription.
     */
    get audioSubscription(): IReceiverAudioSubscriptionMessage {
        return {
            all: this._all,
            exclude: [ ...this._exclude ],
            include: this._effectiveInclude()
        };
    }

    /**
     * The union of the base include and every service's synthetic subscription, deduplicated.
     *
     * @returns {Array<string>}
     */
    private _effectiveInclude(): string[] {
        const union = new Set(this._include);

        for (const sources of this._serviceIncludes.values()) {
            for (const source of sources) {
                union.add(source);
            }
        }

        return Array.from(union);
    }

    /**
     * Sends the current subscription to the bridge.
     *
     * @returns {void}
     */
    private _send(): void {
        this._rtc.sendReceiverAudioSubscriptionMessage({
            all: this._all,
            exclude: this._exclude,
            include: this._effectiveInclude()
        });
    }

    /**
     * Returns the source names currently subscribed for a service.
     *
     * @param {string} serviceId - The service whose sources to return, e.g. a {@code SyntheticAudioService} value.
     * @returns {Array<string>}
     */
    getServiceIncludes(serviceId: string): string[] {
        return [ ...this._serviceIncludes.get(serviceId) ?? [] ];
    }

    /**
     * Whether any service currently subscribes to synthetic sources, i.e. the subscription sent to the bridge
     * carries includes beyond the default baseline.
     *
     * @returns {boolean}
     */
    hasSyntheticIncludes(): boolean {
        return this._serviceIncludes.size > 0;
    }

    /**
     * Replaces the set of synthetic sources subscribed for a service and re-sends the effective subscription. Each
     * service replaces only its own set; the bridge always receives the union across services.
     *
     * @param {string} serviceId - The service whose sources to replace, e.g. a {@code SyntheticAudioService} value.
     * @param {Array<string>} sourceNames - The service's full desired set of source names.
     * @returns {void}
     */
    setServiceIncludes(serviceId: string, sourceNames: string[]): void {
        const deduped = Array.from(new Set(sourceNames));

        if (isEqual(this._serviceIncludes.get(serviceId) ?? [], deduped)) {
            logger.debug(`Ignoring synthetic subscription for ${serviceId}, no change needed.`);

            return;
        }

        logger.info(`Synthetic subscription for ${serviceId}: [${deduped.join(', ')}]`);

        if (deduped.length === 0) {
            this._serviceIncludes.delete(serviceId);
        } else {
            this._serviceIncludes.set(serviceId, deduped);
        }
        this._send();
    }

    /**
     * Mutes or unmutes all remote audio by toggling the baseline. The explicit include/exclude overlays (e.g.
     * opted-in translated sources) are preserved so they are restored on unmute rather than lost across the cycle.
     *
     * @param {boolean} muted - Indicates whether the remote audio should be muted.
     * @returns {void}
     */
    muteRemoteAudio(muted: boolean): void {
        this.setAudioSubscriptionMode({
            all: !muted,
            exclude: this._exclude,
            include: this._include
        });
    }

    /**
     * Re-sends the current audio subscription to the bridge. Used when the bridge channel (re)opens so the
     * bridge always learns the receiver's subscription (the default { all: true } until includes are added).
     *
     * @returns {void}
     */
    resendSubscription(): void {
        this._send();
    }

    /**
     * Sets the full audio subscription (all / include / exclude). No-op when nothing changed. Also accepts the
     * legacy { mode, list } message for backwards compatibility, normalising it to the current shape.
     *
     * @param {IReceiverAudioSubscriptionMessage | ILegacyReceiverAudioSubscriptionMessage} message - The
     * subscription to apply.
     * @returns {void}
     */
    setAudioSubscriptionMode(
            message: IReceiverAudioSubscriptionMessage | ILegacyReceiverAudioSubscriptionMessage): void {
        const { all, exclude, include } = normalizeReceiverAudioSubscription(message);

        if (this._all === all && isEqual(this._exclude, exclude) && isEqual(this._include, include)) {
            logger.debug('Ignoring ReceiverAudioSubscription, no change needed.');

            return;
        }

        this._all = all;
        this._exclude = exclude;
        this._include = include;
        this._send();
    }

}
