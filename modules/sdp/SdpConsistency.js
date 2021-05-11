/* global __filename */

import { getLogger } from 'jitsi-meet-logger';

import {
    parsePrimarySSRC,
    parseSecondarySSRC,
    SdpTransformWrap
} from './SdpTransformUtil';

const logger = getLogger(__filename);

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
    constructor(logPrefix) {
        this.clearVideoSsrcCache();
        this.logPrefix = logPrefix;
    }

    /**
     * Clear the cached video primary and primary rtx ssrcs so that
     *  they will not be used for the next call to
     *  makeVideoPrimarySsrcsConsistent
     */
    clearVideoSsrcCache() {
        this.cachedPrimarySsrc = null;
        this.injectRecvOnly = false;
    }

    /**
     * Explicitly set the primary ssrc to be used in
     *  makeVideoPrimarySsrcsConsistent
     * @param {number} primarySsrc the primarySsrc to be used
     *  in future calls to makeVideoPrimarySsrcsConsistent
     * @throws Error if <tt>primarySsrc</tt> is not a number
     */
    setPrimarySsrc(primarySsrc) {
        if (typeof primarySsrc !== 'number') {
            throw new Error('Primary SSRC must be a number!');
        }
        this.cachedPrimarySsrc = primarySsrc;
    }

    /**
     * Checks whether or not there is a primary video SSRC cached already.
     * @return {boolean}
     */
    hasPrimarySsrcCached() {
        return Boolean(this.cachedPrimarySsrc);
    }

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
    makeVideoPrimarySsrcsConsistent(sdpStr) {
        const sdpTransformer = new SdpTransformWrap(sdpStr);
        const videoMLine = sdpTransformer.selectMedia('video');

        if (!videoMLine) {
            logger.debug(`${this.logPrefix} no 'video' media found in the sdp: ${sdpStr}`);

            return sdpStr;
        }

        if (videoMLine.direction === 'recvonly') {
            // If the mline is recvonly, we'll add the primary
            //  ssrc as a recvonly ssrc
            if (this.cachedPrimarySsrc && this.injectRecvOnly) {
                videoMLine.addSSRCAttribute({
                    id: this.cachedPrimarySsrc,
                    attribute: 'cname',
                    value: `recvonly-${this.cachedPrimarySsrc}`
                });
            } else {
                logger.info(`${this.logPrefix} no SSRC found for the recvonly video stream!`);
            }
        } else {
            const newPrimarySsrc = videoMLine.getPrimaryVideoSsrc();

            if (!newPrimarySsrc) {
                logger.info(`${this.logPrefix} sdp-consistency couldn't parse new primary ssrc`);

                return sdpStr;
            }
            if (this.cachedPrimarySsrc) {
                videoMLine.replaceSSRC(newPrimarySsrc, this.cachedPrimarySsrc);
                for (const group of videoMLine.ssrcGroups) {
                    if (group.semantics === 'FID') {
                        const primarySsrc = parsePrimarySSRC(group);
                        const rtxSsrc = parseSecondarySSRC(group);

                        // eslint-disable-next-line max-depth
                        if (primarySsrc === newPrimarySsrc) {
                            group.ssrcs
                                = `${this.cachedPrimarySsrc} ${rtxSsrc}`;
                        }
                    }
                }
            } else {
                this.cachedPrimarySsrc = newPrimarySsrc;
            }
            this.injectRecvOnly = true;
        }

        return sdpTransformer.toRawSDP();
    }
}
