
import browser from '../browser';

/**
 * A global module for accessing information about different feature flags state.
 */
class FeatureFlags {
    /**
     * Configures the module.
     *
     * @param {object} flags - The feature flags.
     * @param {boolean=} flags.runInLiteMode - Enables lite mode for testing to disable media decoding.
     * @param {boolean=} flags.ssrcRewritingEnabled - Use SSRC rewriting. Requires sourceNameSignaling to be enabled.
     */
    init(flags) {
        this._runInLiteMode = Boolean(flags.runInLiteMode);
        this._ssrcRewriting = Boolean(flags.ssrcRewritingEnabled);
    }

    /**
     * Checks if multiple local video streams support is enabled.
     *
     * @returns {boolean}
     */
    isMultiStreamSendSupportEnabled() {
        return browser.supportsUnifiedPlan();
    }

    /**
     * Checks if the run in lite mode is enabled.
     * This will cause any media to be received and not decoded. (Insertable streams are used to discard
     * all media before it is decoded). This can be used for various test scenarios.
     *
     * @returns {boolean}
     */
    isRunInLiteModeEnabled() {
        return this._runInLiteMode && browser.supportsInsertableStreams();
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
