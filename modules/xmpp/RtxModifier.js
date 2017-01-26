import { getLogger } from "jitsi-meet-logger";
const logger = getLogger(__filename);
import * as transform from 'sdp-transform';
var SDPUtil = require("./SDPUtil");

/**
 * Begin helper functions
 */
/**
 * Given a videoMLine, returns a list of the video
 *  ssrcs (those used to actually send video, not
 *  any associated secondary streams)
 * @param {object} videoMLine media line object from transform.parse
 * @returns {list<string>} list of primary video ssrcs
 */
function getPrimaryVideoSsrcs (videoMLine) {
    let videoSsrcs = videoMLine.ssrcs
        .map(ssrcInfo => ssrcInfo.id)
        .filter((ssrc, index, array) => array.indexOf(ssrc) === index);

    if (videoMLine.ssrcGroups) {
        videoMLine.ssrcGroups.forEach((ssrcGroupInfo) => {
            // Right now, FID groups are the only ones we parse to 
            //  disqualify streams.  If/when others arise we'll
            //  need to add support for them here
            if (ssrcGroupInfo.semantics === "FID") {
                // secondary FID streams should be filtered out
                let secondarySsrc = ssrcGroupInfo.ssrcs.split(" ")[1];
                videoSsrcs.splice(
                  videoSsrcs.indexOf(parseInt(secondarySsrc)), 1);
            }
        });
    }
    return videoSsrcs;
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
 * Updates or inserts the appropriate rtx information for primarySsrc with
 *  the given rtxSsrc.  If no rtx ssrc for primarySsrc currently exists, it will
 *  add the appropriate ssrc and ssrc group lines.  If primarySsrc already has
 *  an rtx ssrc, the appropriate ssrc and group lines will be updated
 * @param {object} videoMLine video mline object that will be updated (in place)
 * @param {object} primarySsrcInfo the info (ssrc, msid & cname) for the primary ssrc
 * @param {number} rtxSsrc the rtx ssrc to associate with the primary ssrc
 */
function updateAssociatedRtxStream (videoMLine, primarySsrcInfo, rtxSsrc) {
    logger.info("Updating mline to associate " + rtxSsrc + 
        " rtx ssrc with primary stream ", primarySsrcInfo.id);
    let primarySsrc = primarySsrcInfo.id;
    let primarySsrcMsid = primarySsrcInfo.msid;
    let primarySsrcCname = primarySsrcInfo.cname;

    let previousAssociatedRtxStream = 
        getRtxSsrc (videoMLine, primarySsrc);
    if (previousAssociatedRtxStream === rtxSsrc) {
        logger.info(rtxSsrc + " was already associated with " +
            primarySsrc);
        return;
    }
    if (previousAssociatedRtxStream) {
        logger.info(primarySsrc + " was previously assocaited with rtx " +
            previousAssociatedRtxStream + ", removing all references to it");
        // Stream already had an rtx ssrc that is different than the one given,
        //  remove all trace of the old one
        videoMLine.ssrcs = videoMLine.ssrcs
            .filter(ssrcInfo => ssrcInfo.id !== previousAssociatedRtxStream);
        logger.info("groups before filtering for " + 
            previousAssociatedRtxStream);
        logger.info(JSON.stringify(videoMLine.ssrcGroups));
        videoMLine.ssrcGroups = videoMLine.ssrcGroups
            .filter(groupInfo => {
                return groupInfo
                    .ssrcs
                    .indexOf(previousAssociatedRtxStream + "") === -1;
            });
    }
    videoMLine.ssrcs.push({
        id: rtxSsrc,
        attribute: "cname",
        value: primarySsrcCname
    });
    videoMLine.ssrcs.push({
        id: rtxSsrc,
        attribute: "msid",
        value: primarySsrcMsid
    });
    videoMLine.ssrcGroups = videoMLine.ssrcGroups || [];
    videoMLine.ssrcGroups.push({
        semantics: "FID",
        ssrcs: primarySsrc + " " + rtxSsrc
    });
}
/**
 * End helper functions
 */

/**
 * Adds any missing RTX streams for video streams
 *  and makes sure that they remain consistent
 */
export default class RtxModifier {
    /**
     * Constructor
     */
    constructor () {
        /**
         * Map of video ssrc to corresponding RTX
         *  ssrc
         */
        this.correspondingRtxSsrcs = {};
    }

    /**
     * Clear the cached map of primary video ssrcs to
     *  their corresponding rtx ssrcs so that they will
     *  not be used for the next call to modifyRtxSsrcs
     */
    clearSsrcCache () {
        this.correspondingRtxSsrcs = {};
    }

    /**
     * Explicitly set the primary video ssrc -> rtx ssrc
     *  mapping to be used in modifyRtxSsrcs
     * @param {object} ssrcMapping a mapping of primary video
     *  ssrcs to their corresponding rtx ssrcs
     */
    setSsrcCache (ssrcMapping) {
        logger.info("Setting ssrc cache to ", ssrcMapping);
        this.correspondingRtxSsrcs = ssrcMapping;
    }

    /**
     * Adds RTX ssrcs for any video ssrcs that don't
     *  already have them.  If the video ssrc has been
     *  seen before, and already had an RTX ssrc generated,
     *  the same RTX ssrc will be used again.
     * @param {string} sdpStr sdp in raw string format
     */
    modifyRtxSsrcs (sdpStr) {
        let parsedSdp = transform.parse(sdpStr);
        let videoMLine = 
            parsedSdp.media.find(mLine => mLine.type === "video");
        if (videoMLine.direction === "inactive" ||
                videoMLine.direction === "recvonly") {
            logger.info("RtxModifier doing nothing, video " +
                "m line is inactive or recvonly");
            return sdpStr;
        }
        if (!videoMLine.ssrcs) {
          logger.info("RtxModifier doing nothing, no video ssrcs present");
          return sdpStr;
        }
        logger.info("Current ssrc mapping: ", this.correspondingRtxSsrcs);
        let primaryVideoSsrcs = getPrimaryVideoSsrcs(videoMLine);
        logger.info("Parsed primary video ssrcs ", primaryVideoSsrcs, " " +
            "making sure all have rtx streams");
        primaryVideoSsrcs.forEach(ssrc => {
            let msid = SDPUtil.getSsrcAttribute(videoMLine, ssrc, "msid");
            let cname = SDPUtil.getSsrcAttribute(videoMLine, ssrc, "cname");
            let correspondingRtxSsrc = this.correspondingRtxSsrcs[ssrc];
            if (correspondingRtxSsrc) {
                logger.info("Already have an associated rtx ssrc for " +
                    " video ssrc " + ssrc + ": " + 
                    correspondingRtxSsrc);
            } else {
                logger.info("No previously associated rtx ssrc for " +
                    " video ssrc " + ssrc);
                // If there's one in the sdp already for it, we'll just set
                //  that as the corresponding one
                let previousAssociatedRtxStream = 
                    getRtxSsrc (videoMLine, ssrc);
                if (previousAssociatedRtxStream) {
                    logger.info("Rtx stream " + previousAssociatedRtxStream + 
                        " already existed in the sdp as an rtx stream for " +
                        ssrc);
                    correspondingRtxSsrc = previousAssociatedRtxStream;
                } else {
                    correspondingRtxSsrc = SDPUtil.generateSsrc();
                    logger.info("Generated rtx ssrc " + correspondingRtxSsrc + 
                        " for ssrc " + ssrc);
                }
                logger.info("Caching rtx ssrc " + correspondingRtxSsrc + 
                    " for video ssrc " + ssrc);
                this.correspondingRtxSsrcs[ssrc] = correspondingRtxSsrc;
            }
            updateAssociatedRtxStream(
                videoMLine, 
                {
                    id: ssrc,
                    cname: cname,
                    msid: msid
                },
                correspondingRtxSsrc);
        });
        return transform.write(parsedSdp);
    }

    /**
     * Remove all reference to any rtx ssrcs that 
     *  don't correspond to the primary stream.
     * Must be called *after* any simulcast streams
     *  have been imploded
     * @param {string} sdpStr sdp in raw string format
     */
    implodeRemoteRtxSsrcs (sdpStr) {
        let parsedSdp = transform.parse(sdpStr);
        let videoMLine = 
            parsedSdp.media.find(mLine => mLine.type === "video");
        if (videoMLine.direction === "inactive" ||
                videoMLine.direction === "recvonly") {
            logger.info("RtxModifier doing nothing, video " +
                "m line is inactive or recvonly");
            return sdpStr;
        }
        if (!videoMLine.ssrcGroups) {
            // Nothing to do
            return sdpStr;
        }

        // Returns true if the given ssrc is present
        //  in the mLine's ssrc list
        let ssrcExists = (ssrcToFind) => {
            return videoMLine.ssrcs.
              find((ssrc) => ssrc.id + "" === ssrcToFind);
        };
        let ssrcsToRemove = [];
        videoMLine.ssrcGroups.forEach(group => {
            if (group.semantics === "FID") {
                let primarySsrc = group.ssrcs.split(" ")[0];
                let rtxSsrc = group.ssrcs.split(" ")[1];
                if (!ssrcExists(primarySsrc)) {
                    ssrcsToRemove.push(rtxSsrc);
                }
            }
        });
        videoMLine.ssrcs = videoMLine.ssrcs
            .filter(ssrc => ssrcsToRemove.indexOf(ssrc.id + "") === -1);
        videoMLine.ssrcGroups = videoMLine.ssrcGroups
            .filter(group => {
                let ssrcs = group.ssrcs.split(" ");
                for (let i = 0; i < ssrcs.length; ++i) {
                    if (ssrcsToRemove.indexOf(ssrcs[i]) !== -1) {
                        return false;
                    }
                }
                return true;
            });
        return transform.write(parsedSdp);
    }
}
