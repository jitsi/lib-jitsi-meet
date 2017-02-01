import { getLogger } from "jitsi-meet-logger";
const logger = getLogger(__filename);
import * as transform from 'sdp-transform';
import * as SDPUtil from "./SDPUtil";

/**
 * Begin helper functions
 */
/**
 * Given a video mline (as parsed from transform.parse),
 *  return the single primary video ssrcs
 * @param {object} videoMLine the video MLine from which to extract the
 *  primary video ssrc
 * @returns {number} the primary video ssrc
 */
function getPrimarySsrc (videoMLine) {
    if (!videoMLine.ssrcs) {
        return;
    }
    let numSsrcs = videoMLine.ssrcs
        .map(ssrcInfo => ssrcInfo.id)
        .filter((ssrc, index, array) => array.indexOf(ssrc) === index)
        .length;
    if (numSsrcs === 1) {
        return videoMLine.ssrcs[0].id;
    } else {
        let findGroup = (mLine, groupName) => {
            return mLine
                .ssrcGroups
                .filter(group => group.semantics === groupName)[0];
        };
        // Look for a SIM or FID group
        if (videoMLine.ssrcGroups) {
            let simGroup = findGroup(videoMLine, "SIM");
            if (simGroup) {
                return SDPUtil.parseGroupSsrcs(simGroup)[0];
            }
            let fidGroup = findGroup(videoMLine, "FID");
            if (fidGroup) {
                return SDPUtil.parseGroupSsrcs(fidGroup)[0];
            }
        }
    }
}

/**
 * End helper functions
 */

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
    constructor () {
        this.clearSsrcCache();
    }

    /**
     * Clear the cached primary and primary rtx ssrcs so that
     *  they will not be used for the next call to
     *  makeVideoPrimarySsrcsConsistent
     */
    clearSsrcCache () {
        this.cachedPrimarySsrc = null;
    }

    /**
     * Explicitly set the primary ssrc to be used in
     *  makeVideoPrimarySsrcsConsistent
     * @param {number} primarySsrc the primarySsrc to be used
     *  in future calls to makeVideoPrimarySsrcsConsistent
     */
    setPrimarySsrc (primarySsrc) {
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
    makeVideoPrimarySsrcsConsistent (sdpStr) {
        let parsedSdp = transform.parse(sdpStr);
        let videoMLine =
            parsedSdp.media.find(mLine => mLine.type === "video");
        if (videoMLine.direction === "inactive") {
            logger.info("Sdp-consistency doing nothing, " +
                "video mline is inactive");
            return sdpStr;
        }
        if (videoMLine.direction === "recvonly") {
            // If the mline is recvonly, we'll add the primary
            //  ssrc as a recvonly ssrc
            videoMLine.ssrcs = videoMLine.ssrcs || [];
            if (this.cachedPrimarySsrc) {
                videoMLine.ssrcs.push({
                    id: this.cachedPrimarySsrc,
                    attribute: "cname",
                    value: "recvonly-" + this.cachedPrimarySsrc
                });
            } else {
                logger.error("No SSRC found for the recvonly video stream!");
            }
        } else {
            let newPrimarySsrc = getPrimarySsrc(videoMLine);
            if (!newPrimarySsrc) {
                logger.info("Sdp-consistency couldn't parse new primary ssrc");
                return sdpStr;
            }
            if (!this.cachedPrimarySsrc) {
                this.cachedPrimarySsrc = newPrimarySsrc;
                logger.info("Sdp-consistency caching primary ssrc " + 
                    this.cachedPrimarySsrc);
            } else {
                logger.info("Sdp-consistency replacing new ssrc " + 
                    newPrimarySsrc + " with cached " + this.cachedPrimarySsrc);
                videoMLine.ssrcs.forEach(ssrcInfo => {
                    if (ssrcInfo.id === newPrimarySsrc) {
                        ssrcInfo.id = this.cachedPrimarySsrc;
                    }
                });
                if (videoMLine.ssrcGroups) {
                    videoMLine.ssrcGroups.forEach(group => {
                        if (group.semantics === "FID") {
                            let fidGroupSsrcs = SDPUtil.parseGroupSsrcs(group);
                            let primarySsrc = fidGroupSsrcs[0];
                            let rtxSsrc = fidGroupSsrcs[1];
                            if (primarySsrc === newPrimarySsrc) {
                                group.ssrcs = 
                                    this.cachedPrimarySsrc + " " + 
                                        rtxSsrc;
                            }
                        }
                    });
                }
            }
        }
        return transform.write(parsedSdp);
    }
}
