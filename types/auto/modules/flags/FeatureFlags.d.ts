declare var _default: FeatureFlags;
export default _default;
/**
 * A global module for accessing information about different feature flags state.
 */
declare class FeatureFlags {
    /**
     * Configures the module.
     *
     * @param {boolean} flags.sourceNameSignaling - Enables source names in the signaling.
     */
    init(flags: any): void;
    _sourceNameSignaling: boolean;
    _sendMultipleVideoStreams: boolean;
    _usesUnifiedPlan: any;
    /**
     * Checks if multiple local video streams support is enabled.
     *
     * @returns {boolean}
     */
    isMultiStreamSupportEnabled(): boolean;
    /**
     * Checks if the source name signaling is enabled.
     *
     * @returns {boolean}
     */
    isSourceNameSignalingEnabled(): boolean;
}
