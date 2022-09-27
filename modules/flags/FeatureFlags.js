import { getLogger } from '@jitsi/logger';

import browser from '../browser';

const logger = getLogger('FeatureFlags');

/**
 * A global module for accessing information about different feature flags state.
 */
class FeatureFlags {
    /**
     * Configures the module.
     *
     * @param {boolean} flags.runInLiteMode - Enables lite mode for testing to disable media decoding.
     * @param {boolean} flags.receiveMultipleVideoStreams - Signal support for receiving multiple video streams.
     * @param {boolean} flags.sendMultipleVideoStreams - Signal support for sending multiple video streams.
     * @param {boolean} flags.sourceNameSignaling - Enables source names in the signaling.
     * @param {boolean} flags.ssrcRewritingEnabled - Use SSRC rewriting. Requires sourceNameSignaling to be enabled.
     * @param {boolean} flags.enableUnifiedOnChrome - Use unified plan signaling on chrome browsers.
     */
    init(flags) {
        this._runInLiteMode = Boolean(flags.runInLiteMode);
        this._receiveMultipleVideoStreams = flags.receiveMultipleVideoStreams ?? true;
        this._sendMultipleVideoStreams = flags.sendMultipleVideoStreams ?? true;
        this._sourceNameSignaling = flags.sourceNameSignaling ?? true;
        this._ssrcRewriting = this._sourceNameSignaling && Boolean(flags.ssrcRewritingEnabled);

        // For Chromium, check if Unified plan is enabled.
        this._usesUnifiedPlan = browser.supportsUnifiedPlan()
            && (!browser.isChromiumBased() || (flags.enableUnifiedOnChrome ?? true));

        logger.info(` Receive multiple video streams: ${this._receiveMultipleVideoStreams},`
            + ` Send multiple video streams: ${this._sendMultipleVideoStreams},`
            + ` Source name signaling: ${this._sourceNameSignaling},`
            + ` SSRC rewriting: ${this._ssrcRewriting},`
            + ` Unified plan: ${this._usesUnifiedPlan}`);
    }

    /**
     * Checks if multiple local video streams support is enabled.
     *
     * @returns {boolean}
     */
    isMultiStreamSupportEnabled() {
        return this._sourceNameSignaling && this._sendMultipleVideoStreams && this._usesUnifiedPlan;
    }

    /**
     * Checks if receiving multiple video streams is supported.
     *
     * @returns {boolean}
     */
    isReceiveMultipleVideoStreamsSupported() {
        return this._receiveMultipleVideoStreams;
    }

    /**
     * Checks if the run in lite mode is enabled.
     * This will cause any media to be received and not decoded. (Directions are inactive and no ssrc and ssrc-groups
     * are added to the remote description). This can be used for various test scenarios.
     *
     * @returns {boolean}
     */
    isRunInLiteModeEnabled() {
        return this._runInLiteMode;
    }

    /**
     * Checks if the source name signaling is enabled.
     *
     * @returns {boolean}
     */
    isSourceNameSignalingEnabled() {
        return this._sourceNameSignaling;
    }

    /**
     * Checks if the clients supports re-writing of the SSRCs on the media streams by the bridge.
     * @returns {boolean}
     */
    isSsrcRewritingSupported() {
        return this._ssrcRewriting;
    }
}

export default new FeatureFlags();
