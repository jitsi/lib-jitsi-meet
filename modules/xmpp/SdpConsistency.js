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
     */
    constructor() {
        this.clearSsrcCache();
    }

    /**
     * Clear the cached primary and primary rtx ssrcs so that
     *  they will not be used for the next call to
     *  makeVideoPrimarySsrcsConsistent
     */
    clearSsrcCache() {
        this.cachedPrimarySsrc = null;
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
            logger.error(`No 'video' media found in the sdp: ${sdpStr}`);
            return sdpStr;
        }
        if (videoMLine.direction === 'inactive') {
            logger.info(
                'Sdp-consistency doing nothing, video mline is inactive');
            return sdpStr;
        }
        if (videoMLine.direction === 'recvonly') {
            // If the mline is recvonly, we'll add the primary
            //  ssrc as a recvonly ssrc
            if (this.cachedPrimarySsrc) {
                videoMLine.addSSRCAttribute({
                    id: this.cachedPrimarySsrc,
                    attribute: 'cname',
                    value: `recvonly-${this.cachedPrimarySsrc}`
                });
            } else {
                logger.error('No SSRC found for the recvonly video stream!');
            }
        } else {
            const newPrimarySsrc = videoMLine.getPrimaryVideoSsrc();
            if (!newPrimarySsrc) {
                logger.info('Sdp-consistency couldn\'t parse new primary ssrc');
                return sdpStr;
            }
            if (!this.cachedPrimarySsrc) {
                this.cachedPrimarySsrc = newPrimarySsrc;
                logger.info(
                    `Sdp-consistency caching primary ssrc ${
                        this.cachedPrimarySsrc}`);
            } else {
                logger.info(
                    `Sdp-consistency replacing new ssrc ${newPrimarySsrc
                        } with cached ${this.cachedPrimarySsrc}`);
                videoMLine.replaceSSRC(
                    newPrimarySsrc, this.cachedPrimarySsrc);
                for (const group of videoMLine.ssrcGroups) {
                    if (group.semantics === 'FID') {
                        const primarySsrc = parsePrimarySSRC(group);
                        const rtxSsrc = parseSecondarySSRC(group);
                        if (primarySsrc === newPrimarySsrc) {
                            group.ssrcs
                                = `${this.cachedPrimarySsrc} ${rtxSsrc}`;
                        }
                    }
                }
            }
        }
        return sdpTransformer.toRawSDP();
    }
}
