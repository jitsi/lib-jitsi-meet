/**
 * End helper functions
 */
/**
 * Adds any missing RTX streams for video streams
 *  and makes sure that they remain consistent
 */
export default class RtxModifier {
    /**
     * Map of video ssrc to corresponding RTX
     *  ssrc
     */
    correspondingRtxSsrcs: Map<any, any>;
    /**
     * Clear the cached map of primary video ssrcs to
     *  their corresponding rtx ssrcs so that they will
     *  not be used for the next call to modifyRtxSsrcs
     */
    clearSsrcCache(): void;
    /**
     * Explicitly set the primary video ssrc -> rtx ssrc
     *  mapping to be used in modifyRtxSsrcs
     * @param {Map} ssrcMapping a mapping of primary video
     *  ssrcs to their corresponding rtx ssrcs
     */
    setSsrcCache(ssrcMapping: Map<any, any>): void;
    /**
     * Adds RTX ssrcs for any video ssrcs that don't already have them.  If the video ssrc has been seen before, and
     * already had an RTX ssrc generated, the same RTX ssrc will be used again.
     *
     * @param {string} sdpStr sdp in raw string format
     * @returns {string} The modified sdp in raw string format.
     */
    modifyRtxSsrcs(sdpStr: string): string;
    /**
     * Does the same thing as {@link modifyRtxSsrcs}, but takes the {@link MLineWrap} instance wrapping video media as
     * an argument.
     * @param {MLineWrap} videoMLine
     * @return {boolean} <tt>true</tt> if the SDP wrapped by {@link SdpTransformWrap} has been modified or
     * <tt>false</tt> otherwise.
     */
    modifyRtxSsrcs2(videoMLine: any): boolean;
    /**
     * Strip all rtx streams from the given sdp.
     *
     * @param {string} sdpStr sdp in raw string format
     * @returns {string} sdp string with all rtx streams stripped
     */
    stripRtx(sdpStr: string): string;
}
