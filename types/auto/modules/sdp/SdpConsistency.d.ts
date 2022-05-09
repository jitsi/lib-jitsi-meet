/**
 * Handles the work of keeping video ssrcs consistent across multiple
 * o/a cycles, making it such that all stream operations can be
 * kept local and do not need to be signaled.
 * NOTE: This only keeps the 'primary' video ssrc consistent: meaning
 * the primary video stream
 */
export default class SdpConsistency {
    /**
     * Constructor
     * @param {string} logPrefix the log prefix appended to every logged
     * message, currently used to distinguish for which
     * <tt>TraceablePeerConnection</tt> the instance works.
     */
    constructor(logPrefix: string);
    logPrefix: string;
    /**
     * Clear the cached video primary and primary rtx ssrcs so that
     *  they will not be used for the next call to
     *  makeVideoPrimarySsrcsConsistent
     */
    clearVideoSsrcCache(): void;
    cachedPrimarySsrc: any;
    injectRecvOnly: boolean;
    /**
     * Explicitly set the primary ssrc to be used in
     *  makeVideoPrimarySsrcsConsistent
     * @param {number} primarySsrc the primarySsrc to be used
     *  in future calls to makeVideoPrimarySsrcsConsistent
     * @throws Error if <tt>primarySsrc</tt> is not a number
     */
    setPrimarySsrc(primarySsrc: number): void;
    /**
     * Checks whether or not there is a primary video SSRC cached already.
     * @return {boolean}
     */
    hasPrimarySsrcCached(): boolean;
    /**
     * Given an sdp string, either:
     *  1) record the primary video and primary rtx ssrcs to be
     *   used in future calls to makeVideoPrimarySsrcsConsistent or
     *  2) change the primary and primary rtx ssrcs in the given sdp
     *   to match the ones previously cached
     * @param {string} sdpStr the sdp string to (potentially)
     *  change to make the video ssrcs consistent
     * @returns {string} a (potentially) modified sdp string
     *  with ssrcs consistent with this class' cache
     */
    makeVideoPrimarySsrcsConsistent(sdpStr: string): string;
}
