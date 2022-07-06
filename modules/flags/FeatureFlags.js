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
     * @param {boolean} flags.sourceNameSignaling - Enables source names in the signaling.
     * @param {boolean} flags.receiveMultipleVideoStreams - Signal support for receiving multiple video streams.
     */
    init(flags) {
        this._runInLiteMode = Boolean(flags.runInLiteMode);

        this._sourceNameSignaling = Boolean(flags.sourceNameSignaling);
        this._receiveMultipleVideoStreams = Boolean(flags.receiveMultipleVideoStreams);
        this._sendMultipleVideoStreams = Boolean(flags.sendMultipleVideoStreams);
        this._ssrcRewriting = Boolean(flags.ssrcRewritingOnBridgeSupported);

        // For Chromium, check if Unified plan is enabled.
        this._usesUnifiedPlan = browser.supportsUnifiedPlan()
            && (!browser.isChromiumBased() || (flags.enableUnifiedOnChrome ?? true));

        logger.info(`Source name signaling: ${this._sourceNameSignaling},`
            + ` Send multiple video streams: ${this._sendMultipleVideoStreams},`
            + ` SSRC rewriting supported: ${this._ssrcRewriting},`
            + ` uses Unified plan: ${this._usesUnifiedPlan}`);
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
