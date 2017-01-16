var transform = require('sdp-transform');

/**
 * Begin helper functions
 */
function getPrimarySsrc (videoMLine) {
    if (!videoMLine.ssrcs) {
        return;
    }
    let numSsrcs = videoMLine.ssrcs
        .filter(ssrcInfo => ssrcInfo.attribute === "msid")
        .map(ssrcInfo => ssrcInfo.id)
        .filter((ssrc, index, array) => array.indexOf(ssrc) === index)
        .length;
    if (numSsrcs === 1) {
        return videoMLine.ssrcs
            .filter(ssrcInfo => ssrcInfo.attribute === "msid")
            .map(ssrcInfo => ssrcInfo.id)[0];
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
 * End helper functions
 */

/**
 * Handles the work of keeping video ssrcs consistent across multiple
 * o/a cycles, making it such that all stream operations can be
 * kept local and do not need to be signaled.
 * NOTE: This only keeps the 'primary' video ssrc consistent: meaning
 * the primary video stream
 */
class SdpConsistency {
    constructor () {
        this.clearSsrcCache();
    }

    clearSsrcCache () {
        this.cachedPrimarySsrc = null;
    }

    setPrimarySsrc (primarySsrc) {
        this.cachedPrimarySsrc = primarySsrc;
    }

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
            if (!this.cachedPrimarySsrc) {
                this.cachedPrimarySsrc = newPrimarySsrc;
                console.log("Sdp-consistency caching primary ssrc " + 
                    this.cachedPrimarySsrc);
            } else {
                console.log("Sdp-consistency replacing new ssrc " + 
                    newPrimarySsrc + " with cached " + this.cachedPrimarySsrc);
                videoMLine.ssrcs.forEach(ssrcInfo => {
                    if (ssrcInfo.id === newPrimarySsrc) {
                        ssrcInfo.id = this.cachedPrimarySsrc;
                    }
                });
                if (videoMLine.ssrcGroups) {
                    videoMLine.ssrcGroups.forEach(group => {
                        if (group.semantics === "FID") {
                            let primarySsrc = 
                                parseInt(group.ssrcs.split(" ")[0]);
                            let rtxSsrc = 
                                parseInt(group.ssrcs.split(" ")[1]);
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

module.exports = SdpConsistency;
