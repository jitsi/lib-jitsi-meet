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

function getRtxSsrc (videoMLine, primarySsrc) {
    if (videoMLine.ssrcGroups) {
        return videoMLine
            .ssrcGroups
            .filter(ssrcGroup => ssrcGroup.semantics === "FID")
            .filter(ssrcGroup => 
                parseInt(ssrcGroup.ssrcs.split(" ")[0]) === primarySsrc)
            .map(ssrcGroup => ssrcGroup.ssrcs.split(" ")[1])
            .map(ssrcStr => parseInt(ssrcStr))[0];
    }
}
/**
 * End helper functions
 */


function SdpConsistency () {
    this.cachedPrimarySsrc = null;
    this.cachedPrimaryRtxSsrc = null;
}

SdpConsistency.prototype.clearSsrcCache = function() {
    this.cachedPrimarySsrc = null;
    this.cachedPrimaryRtxSsrc = null;
}

SdpConsistency.prototype.setPrimarySsrc = function(primarySsrc) {
    this.cachedPrimarySsrc = primarySsrc;
}

SdpConsistency.prototype.makeVideoPrimarySsrcsConsistent = function (sdpStr) {
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
},

module.exports = SdpConsistency;
