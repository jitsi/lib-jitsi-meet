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
     * @param {boolean} flags.sourceNameSignaling - Enables source names in the signaling.
     */
    init(flags) {
        this._sourceNameSignaling = Boolean(flags.sourceNameSignaling);
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
