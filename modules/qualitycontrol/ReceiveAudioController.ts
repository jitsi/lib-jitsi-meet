
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
 * top, e.g. bridge-injected translated audio) and `exclude` (sources to drop). The default is `all: true`.
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
     * Source names additionally forwarded on top of the baseline (e.g. translated sources).
     */
    private _include: string[];

    /**
     * Creates a new instance of the ReceiverAudioController.
     */
    constructor(conference: JitsiConference) {
        this._rtc = conference.rtc;
        this._all = true;
        this._exclude = [];
        this._include = [];
    }

    /**
     * Gets the current audio subscription.
     *
     * @returns {IReceiverAudioSubscriptionMessage} The current audio subscription.
     */
    get audioSubscription(): IReceiverAudioSubscriptionMessage {
        return {
            all: this._all,
            exclude: [ ...this._exclude ],
            include: [ ...this._include ]
        };
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
            include: this._include
        });
    }

    /**
     * Mutes or unmutes all remote audio. Muting drops the baseline (receive nothing); unmuting restores it.
     *
     * @param {boolean} muted - Indicates whether the remote audio should be muted.
     * @returns {void}
     */
    muteRemoteAudio(muted: boolean): void {
        this.setAudioSubscriptionMode({
            all: !muted,
            exclude: [],
            include: []
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
     * Replaces the set of additionally-included sources (e.g. translated sources), preserving the `all`
     * baseline and any excludes.
     *
     * @param {Array<string>} include - The full set of source names to include on top of the baseline.
     * @returns {void}
     */
    setIncludeSources(include: string[]): void {
        this.setAudioSubscriptionMode({
            all: this._all,
            exclude: this._exclude,
            include
        });
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
