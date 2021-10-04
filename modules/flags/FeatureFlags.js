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
    }

    /**
     * Checks if the source name signaling is enabled.
     *
     * @returns {boolean}
     */
    isSourceNameSignalingEnabled() {
        return this._sourceNameSignaling;
    }
}

export default new FeatureFlags();
