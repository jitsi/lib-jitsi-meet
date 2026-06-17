import browser from '../browser';

/**
 * A global module for accessing information about different feature flags state.
 */
class FeatureFlags {
    private _runInLiteMode: boolean;
    private _ssrcRewriting: boolean;
    private _rtpMidDemux: boolean;

    /**
     * Configures the module.
     *
     * @param {object} flags - The feature flags.
     * @param {Optional<boolean>} flags.runInLiteMode - Enables lite mode for testing to disable media decoding.
     * @param {Optional<boolean>} flags.ssrcRewritingEnabled - Use SSRC rewriting.
     * @param {Optional<boolean>} flags.rtpMidDemuxEnabled - Allow the bridge to demux forwarded media by the RTP
     * sdes:mid header extension (requires SSRC rewriting).
     */
    init(flags: {
        rtpMidDemuxEnabled?: Optional<boolean>;
        runInLiteMode?: Optional<boolean>;
        ssrcRewritingEnabled?: Optional<boolean>;
    }) {
        this._runInLiteMode = Boolean(flags.runInLiteMode);
        this._ssrcRewriting = Boolean(flags.ssrcRewritingEnabled);
        this._rtpMidDemux = Boolean(flags.rtpMidDemuxEnabled);
    }

    /**
     * Checks if the client supports demuxing media forwarded by the bridge using the RTP sdes:mid header extension.
     * Requires SSRC rewriting, since the per-slot mids are signaled in the bridge's source-map messages. Limited to
     * Chromium-based browsers: Firefox does not deliver received media on an m-line that negotiates sdes:mid even when
     * the bridge stamps the matching mid (verified empirically), so it keeps the {@code TPCUtils._stripSdesMid}
     * workaround and SSRC-only demuxing.
     *
     * @returns {boolean}
     */
    isRtpMidDemuxSupported(): boolean {
        return this._rtpMidDemux && this._ssrcRewriting && browser.isChromiumBased();
    }

    /**
     * Checks if the run in lite mode is enabled.
     * This will cause any media to be received and not decoded. (Insertable streams are used to discard
     * all media before it is decoded). This can be used for various test scenarios.
     *
     * @returns {boolean}
     */
    isRunInLiteModeEnabled(): boolean {
        return this._runInLiteMode && browser.supportsInsertableStreams();
    }

    /**
     * Checks if the clients supports re-writing of the SSRCs on the media streams by the bridge.
     * @returns {boolean}
     */
    isSsrcRewritingSupported(): boolean {
        return this._ssrcRewriting;
    }
}

export default new FeatureFlags();
