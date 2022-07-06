declare var _default: FeatureFlags;
export default _default;
/**
 * A global module for accessing information about different feature flags state.
 */
declare class FeatureFlags {
    /**
     * Configures the module.
     *
     * @param {boolean} flags.runInLiteMode - Enables lite mode for testing to disable media decoding.
     * @param {boolean} flags.sourceNameSignaling - Enables source names in the signaling.
     * @param {boolean} flags.receiveMultipleVideoStreams - Signal support for receiving multiple video streams.
     */
    init(flags: any): void;
    _runInLiteMode: boolean;
    _sourceNameSignaling: boolean;
    _receiveMultipleVideoStreams: boolean;
    _sendMultipleVideoStreams: boolean;
    _ssrcRewriting: boolean;
    _usesUnifiedPlan: any;
    /**
     * Checks if multiple local video streams support is enabled.
     *
     * @returns {boolean}
     */
    isMultiStreamSupportEnabled(): boolean;
    /**
     * Checks if receiving multiple video streams is supported.
     *
     * @returns {boolean}
     */
    isReceiveMultipleVideoStreamsSupported(): boolean;
    /**
     * Checks if the run in lite mode is enabled.
     * This will cause any media to be received and not decoded. (Directions are inactive and no ssrc and ssrc-groups
     * are added to the remote description). This can be used for various test scenarios.
     *
     * @returns {boolean}
     */
    isRunInLiteModeEnabled(): boolean;
    /**
     * Checks if the source name signaling is enabled.
     *
     * @returns {boolean}
     */
    isSourceNameSignalingEnabled(): boolean;
    /**
     * Checks if the clients supports re-writing of the SSRCs on the media streams by the bridge.
     * @returns {boolean}
     */
    isSsrcRewritingSupported(): boolean;
}
