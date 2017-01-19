import * as transform from 'sdp-transform';

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
                return parseInt(simGroup.ssrcs.split(" ")[0]);
            }
            let fidGroup = findGroup(videoMLine, "FID");
            if (fidGroup) {
                return parseInt(fidGroup.ssrcs.split(" ")[0]);
            }
        }
    }
}

/**
 * Given a video mline (as parsed from transform.parse),
 *  and a primary ssrc, return the corresponding rtx ssrc
 *  (if there is one) for that video ssrc
 * @param {object} videoMLine the video MLine from which to extract the
 *  rtx video ssrc
 * @param {number} primarySsrc the video ssrc for which to find the
 *  corresponding rtx ssrc
 * @returns {number} the rtx ssrc (or undefined if there isn't one)
 */
function getRtxSsrc (videoMLine, primarySsrc) {
    if (videoMLine.ssrcGroups) {
        let fidGroup = videoMLine.ssrcGroups.find(group => {
            if (group.semantics === "FID") {
                let groupPrimarySsrc = parseInt(group.ssrcs.split(" ")[0]);
                return groupPrimarySsrc === primarySsrc;
            }
        });
        if (fidGroup) {
          return parseInt(fidGroup.ssrcs.split(" ")[1]);
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
 * NOTE: This only keeps the 'primary' video ssrcs consistent: meaning
 * the primary video stream and an associated RTX stream, if it exists
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
        this.cachedPrimaryRtxSsrc = null;
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
            console.log("Sdp-consistency doing nothing, " +
                "video mline is inactive");
            return sdpStr;
        }
        if (videoMLine.direction === "recvonly") {
            // If the mline is recvonly, we'll add the primary
            //  ssrc as a recvonly ssrc
            videoMLine.ssrcs = videoMLine.ssrcs || [];
            videoMLine.ssrcs.push({
                id: this.cachedPrimarySsrc,
                attribute: "cname",
                value: "recvonly-" + this.cachedPrimarySsrc
            });
        } else {
            let newPrimarySsrc = getPrimarySsrc(videoMLine);
            if (!newPrimarySsrc) {
                console.log("Sdp-consistency couldn't parse new primary ssrc");
                return sdpStr;
            }
            let newPrimaryRtxSsrc = 
                getRtxSsrc(videoMLine, newPrimarySsrc);
            if (!this.cachedPrimarySsrc) {
                this.cachedPrimarySsrc = newPrimarySsrc;
                this.cachedPrimaryRtxSsrc = newPrimaryRtxSsrc;
                console.log("Sdp-consistency caching primary ssrc " + 
                    this.cachedPrimarySsrc + " and rtx " + 
                    this.cachedPrimaryRtxSsrc);
            } else {
                console.log("Sdp-consistency replacing new ssrc " + 
                    newPrimarySsrc + " with cached " + this.cachedPrimarySsrc + 
                    " and new rtx " + newPrimaryRtxSsrc + " with cached " + 
                    this.cachedPrimaryRtxSsrc);
                let self = this;
                videoMLine.ssrcs.forEach(ssrcInfo => {
                    if (ssrcInfo.id === newPrimarySsrc) {
                        ssrcInfo.id = self.cachedPrimarySsrc;
                    } else if (ssrcInfo.id === newPrimaryRtxSsrc) {
                        ssrcInfo.id = self.cachedPrimaryRtxSsrc;
                    }
                });
                if (videoMLine.ssrcGroups) {
                    videoMLine.ssrcGroups.forEach(group => {
                        if (group.semantics === "FID") {
                            let primarySsrc = 
                                parseInt(group.ssrcs.split(" ")[0]);
                            if (primarySsrc == self.cachedPrimarySsrc) {
                                group.ssrcs = 
                                    self.cachedPrimarySsrc + " " + 
                                        self.cachedPrimaryRtxSsrc;
                            }
                        }
                    });
                }
            }
        }
        return transform.write(parsedSdp);
    }
}
