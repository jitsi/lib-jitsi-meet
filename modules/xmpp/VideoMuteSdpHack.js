/* global __filename */

import {getLogger} from "jitsi-meet-logger";
const logger = getLogger(__filename);
import {getValues} from "../util/JSUtil";
import {SdpTransformWrap} from "./SdpTransformUtil";

export default class VideoMuteSdpHack {

    constructor(traceablePeerConnection) {
        this.pc = traceablePeerConnection;
    }

    maybeHackLocalSdp (desc) {
        // Go over each video tracks and check if the SDP has to be changed
        const localVideos
            = getValues(this.pc.localTracks)
                .filter(track => track.isVideoTrack());
        if (!localVideos.length)
            return;

        const transformer = new SdpTransformWrap(desc.sdp);

        if (!transformer.selectMedia("video")) {
            logger.error(
                "Unable to hack local video track SDP - no 'video' media");
            return;
        }

        // FIXME not sure about this directions
        if (["sendrecv", "recvonly", "sendonly"]
                .indexOf(transformer.mediaDirection) !== -1) {

            logger.info(
                "Localtracks/videos", this.pc.localTracks, localVideos);

            let modified = false;
            localVideos.forEach((videoTrack) => {
                const isMuted = videoTrack.isMuted();
                const muteInProgress = videoTrack.inMuteOrUnmuteProgress;
                logger.info(
                    "isMuted: " + isMuted
                    + " in progress: " + muteInProgress,
                    videoTrack.rtcId);
                if (isMuted || muteInProgress) {
                    // We need to fake sendrecv
                    transformer.mediaDirection = "sendrecv";
                    // Inject removed SSRCs
                    const trackRtcId = videoTrack.rtcId;
                    let requiredSSRCs
                        = this.pc.options.disableSimulcast
                        ? [this.pc.sdpConsistency.cachedPrimarySsrc]
                        : this.pc.simulcast.ssrcCache;
                    if (!requiredSSRCs.length) {
                        logger.error("No SSRCs stored for: " + trackRtcId);
                        return;
                    }
                    if (!transformer.getSSRCCount()) {
                        logger.error(
                            "No video SSRCs found "
                            + "(should be at least the recv-only one");
                        return;
                    }

                    modified = true;

                    // Check if the recvonly has MSID
                    const primarySSRC = requiredSSRCs[0];
                    // FIXME the cname could come from the stream, but may
                    // turn out to be too complex. It is fine to come up
                    // with any value, as long as we only care about
                    // the actual SSRC values when deciding whether or not
                    // an update should be sent
                    const primaryCname = "injected-" + primarySSRC;

                    if (transformer.removeSSRCAttribute(
                            primarySSRC, "mslabel")) {
                        logger.debug("Removed primary SSRC's 'mslabel'");
                    }
                    if (transformer.removeSSRCAttribute(
                            primarySSRC, "label")) {
                        logger.debug("Removed primary SSRC's 'label'");
                    }
                    requiredSSRCs.forEach((ssrcNum) => {
                        // Inject
                        //if (!transformer.containsSSRC(ssrcNum)) {
                        // Remove old attributes
                        transformer.removeSSRC(ssrcNum);
                        logger.debug(
                            "Injecting video SSRC: " + ssrcNum);
                        transformer.addSSRCAttribute({
                            id: ssrcNum,
                            attribute: 'cname',
                            value: primaryCname
                        });
                        transformer.addSSRCAttribute({
                            id: ssrcNum,
                            attribute: 'msid',
                            value: videoTrack.storedMSID
                        });
                        //}
                    });
                    if (requiredSSRCs.length > 1) {
                        const group = {
                            ssrcs: requiredSSRCs.join(" "),
                            semantics: "SIM"
                        };
                        if (!transformer.findGroup(
                                group.semantics, group.ssrcs)) {
                            // Inject the group
                            logger.debug("Injecting SIM group", group);
                            transformer.addSSRCGroup(group);
                        }
                    }
                    // Insert RTX
                    if (!this.pc.options.disableRtx) {
                        const rtxSSRCs
                            = this.pc.rtxModifier.correspondingRtxSsrcs;
                        transformer.forEachSSRCAttr((ssrcObj => {
                            // Trigger only once per SSRC when processing msid
                            if (ssrcObj.attribute === "msid") {
                                const correspondingSSRC
                                    = rtxSSRCs.get(ssrcObj.id);
                                if (correspondingSSRC) {
                                    // Remove old attributes
                                    transformer.removeSSRC(correspondingSSRC);
                                    // Add new
                                    transformer.addSSRCAttribute({
                                        id: correspondingSSRC,
                                        attribute: 'msid',
                                        value: ssrcObj.value
                                    });
                                    transformer.addSSRCAttribute({
                                        id: correspondingSSRC,
                                        attribute: 'cname',
                                        value: primaryCname
                                    });
                                    const rtxGroup = {
                                        ssrcs: ssrcObj.id +
                                                " " + correspondingSSRC,
                                        semantics: "FID"
                                    };
                                    if (!transformer.findGroup(
                                            "FID", rtxGroup)) {
                                        transformer.addSSRCGroup(rtxGroup);
                                        logger.debug(
                                            "Injecting RTX SSRC and groups" +
                                            " for: " + ssrcObj.id,
                                            correspondingSSRC);
                                    }
                                } else {
                                    // FIXME explain better
                                    // Logging on debug, because it's normal
                                    // if the SSRCs are already in the SDP
                                    logger.debug(
                                        "No corresponding SSRC found for: "
                                        + ssrcObj.id, rtxSSRCs);
                                }
                            }
                        }));
                    }
                }
            });
            if (modified) {
                // Write
                desc.sdp = transformer.toRawSDP();
                logger.debug("Post TRANSFORM: ", desc.sdp);
            }
        } else {
            logger.debug(
                "Not doing transform for direction: "
                    + transformer.mediaDirection);
        }
    }
}