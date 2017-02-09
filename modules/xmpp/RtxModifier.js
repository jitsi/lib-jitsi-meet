import { getLogger } from "jitsi-meet-logger";
const logger = getLogger(__filename);
import * as transform from 'sdp-transform';
import * as SDPUtil from "./SDPUtil";

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
                let groupPrimarySsrc = SDPUtil.parseGroupSsrcs(group)[0];
                return groupPrimarySsrc === primarySsrc;
            }
        });
        if (fidGroup) {
          return SDPUtil.parseGroupSsrcs(fidGroup)[1];
        }
    }
}

/**
 * Updates or inserts the appropriate rtx information for primarySsrc with
 *  the given rtxSsrc.  If no rtx ssrc for primarySsrc currently exists, it will
 *  add the appropriate ssrc and ssrc group lines.  If primarySsrc already has
 *  an rtx ssrc, the appropriate ssrc and group lines will be updated
 * @param {object} videoMLine video mline object that will be updated (in place)
 * @param {object} primarySsrcInfo the info (ssrc, msid & cname) for the 
 *  primary ssrc
 * @param {number} rtxSsrc the rtx ssrc to associate with the primary ssrc
 */
function updateAssociatedRtxStream (videoMLine, primarySsrcInfo, rtxSsrc) {
    logger.debug("Updating mline to associate " + rtxSsrc + 
        " rtx ssrc with primary stream ", primarySsrcInfo.id);
    let primarySsrc = primarySsrcInfo.id;
    let primarySsrcMsid = primarySsrcInfo.msid;
    let primarySsrcCname = primarySsrcInfo.cname;

    let previousAssociatedRtxStream = 
        getRtxSsrc (videoMLine, primarySsrc);
    if (previousAssociatedRtxStream === rtxSsrc) {
        logger.debug(rtxSsrc + " was already associated with " +
            primarySsrc);
        return;
    }
    if (previousAssociatedRtxStream) {
        logger.debug(primarySsrc + " was previously assocaited with rtx " +
            previousAssociatedRtxStream + ", removing all references to it");
        // Stream already had an rtx ssrc that is different than the one given,
        //  remove all trace of the old one
        videoMLine.ssrcs = videoMLine.ssrcs
            .filter(ssrcInfo => ssrcInfo.id !== previousAssociatedRtxStream);
        logger.debug("groups before filtering for " + 
            previousAssociatedRtxStream);
        logger.debug(JSON.stringify(videoMLine.ssrcGroups));
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
        this.correspondingRtxSsrcs = new Map();
    }

    /**
     * Clear the cached map of primary video ssrcs to
     *  their corresponding rtx ssrcs so that they will
     *  not be used for the next call to modifyRtxSsrcs
     */
    clearSsrcCache () {
        this.correspondingRtxSsrcs.clear();
    }

    /**
     * Explicitly set the primary video ssrc -> rtx ssrc
     *  mapping to be used in modifyRtxSsrcs
     * @param {Map} ssrcMapping a mapping of primary video
     *  ssrcs to their corresponding rtx ssrcs
     */
    setSsrcCache (ssrcMapping) {
        logger.debug("Setting ssrc cache to ", ssrcMapping);
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
            logger.debug("RtxModifier doing nothing, video " +
                "m line is inactive or recvonly");
            return sdpStr;
        }
        if (!videoMLine.ssrcs) {
          logger.debug("RtxModifier doing nothing, no video ssrcs present");
          return sdpStr;
        }
        logger.debug("Current ssrc mapping: ", this.correspondingRtxSsrcs);
        let primaryVideoSsrcs = getPrimaryVideoSsrcs(videoMLine);
        logger.debug("Parsed primary video ssrcs ", primaryVideoSsrcs, " " +
            "making sure all have rtx streams");
        primaryVideoSsrcs.forEach(ssrc => {
            let msid = SDPUtil.getSsrcAttribute(videoMLine, ssrc, "msid");
            let cname = SDPUtil.getSsrcAttribute(videoMLine, ssrc, "cname");
            let correspondingRtxSsrc = this.correspondingRtxSsrcs.get(ssrc);
            if (correspondingRtxSsrc) {
                logger.debug("Already have an associated rtx ssrc for " +
                    " video ssrc " + ssrc + ": " + 
                    correspondingRtxSsrc);
            } else {
                logger.debug("No previously associated rtx ssrc for " +
                    " video ssrc " + ssrc);
                // If there's one in the sdp already for it, we'll just set
                //  that as the corresponding one
                let previousAssociatedRtxStream = 
                    getRtxSsrc (videoMLine, ssrc);
                if (previousAssociatedRtxStream) {
                    logger.debug("Rtx stream " + previousAssociatedRtxStream + 
                        " already existed in the sdp as an rtx stream for " +
                        ssrc);
                    correspondingRtxSsrc = previousAssociatedRtxStream;
                } else {
                    correspondingRtxSsrc = SDPUtil.generateSsrc();
                    logger.debug("Generated rtx ssrc " + correspondingRtxSsrc + 
                        " for ssrc " + ssrc);
                }
                logger.debug("Caching rtx ssrc " + correspondingRtxSsrc + 
                    " for video ssrc " + ssrc);
                this.correspondingRtxSsrcs.set(ssrc, correspondingRtxSsrc);
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
     * Strip all rtx streams from the given sdp
     * @param {string} sdpStr sdp in raw string format
     * @returns {string} sdp string with all rtx streams stripped
     */
    stripRtx (sdpStr) {
        const parsedSdp = transform.parse(sdpStr);
        const videoMLine = 
            parsedSdp.media.find(mLine => mLine.type === "video");
        if (videoMLine.direction === "inactive" ||
                videoMLine.direction === "recvonly") {
            logger.debug("RtxModifier doing nothing, video " +
                "m line is inactive or recvonly");
            return sdpStr;
        }
        if (!videoMLine.ssrcs) {
          logger.debug("RtxModifier doing nothing, no video ssrcs present");
          return sdpStr;
        }
        if (!videoMLine.ssrcGroups) {
          logger.debug("RtxModifier doing nothing, " + 
              "no video ssrcGroups present");
          return sdpStr;
        }
        const fidGroups = videoMLine.ssrcGroups
            .filter(group => group.semantics === "FID");
        // Remove the fid groups from the mline
        videoMLine.ssrcGroups = videoMLine.ssrcGroups
            .filter(group => group.semantics !== "FID");
        // Get the rtx ssrcs and remove them from the mline
        const ssrcsToRemove = [];
        fidGroups.forEach(fidGroup => {
            const groupSsrcs = SDPUtil.parseGroupSsrcs(fidGroup);
            const rtxSsrc = groupSsrcs[1];
            ssrcsToRemove.push(rtxSsrc);
        });
        videoMLine.ssrcs = videoMLine.ssrcs
            .filter(line => ssrcsToRemove.indexOf(line.id) === -1);
        
        return transform.write(parsedSdp);
    }
}
