/* global __filename */

import {getLogger} from "jitsi-meet-logger";
const logger = getLogger(__filename);
import {SdpTransformWrap} from "./SdpTransformUtil";
import * as MediaType from "../../service/RTC/MediaType";

/**
 * Fakes local SDP, so that it will reflect current local tracks status inside
 * of the <tt>TraceablePeerConnection<tt/> and make operations like
 * attach/detach and video mute/unmute local operations. That means it prevents
 * from SSRC updates being sent to Jicofo/remote peer, so that there is no
 * sRD/sLD cycle on the remote side.
 */
export default class MungeLocalSdp {

    /**
     * Creates new <tt>MungeLocalSdp</tt> instance.
     *
     * @param {TraceablePeerConnection} traceablePeerConnection
     */
    constructor(traceablePeerConnection) {
        this.pc = traceablePeerConnection;
    }

    /**
     * Makes sure local SDP for audio media reflects current local tracks status
     * of the parent TPC.
     * @param {SdpTransformWrap} transformer the transformer instance which will
     * be used to process the SDP.
     * @return {boolean} <tt>true</tt> if any modification were made.
     * @private
     */
    _describeLocalAudioTracks(transformer) {

        const localAudio = this.pc.getLocalTracks(MediaType.AUDIO);
        if (!localAudio.length)
            return false;

        if (!transformer.selectMedia("audio")) {
            logger.error(
                "Unable to hack local audio track SDP - no 'audio' media");
            return false;
        }

        let modified = false;

        // FIXME not sure about this directions
        if (["sendrecv", "recvonly", "sendonly"]
                .indexOf(transformer.mediaDirection) !== -1) {

            localAudio.forEach((audioTrack) => {
                const isAttached = audioTrack._isAttachedToPC(this.pc);
                const shouldFake = !isAttached;

                logger.debug(
                    audioTrack + " isAttached: " + isAttached
                               + " => should fake audio SDP ?:" + shouldFake);
                if (shouldFake) {
                    // Inject removed SSRCs
                    let audioSSRC = this.pc.getLocalSSRC(audioTrack);
                    if (!audioSSRC) {
                        logger.error(
                            "Can't fake SDP for "
                                + audioTrack + " - no SSRC stored");
                        // Aborts the forEach on this particular track,
                        // but will continue with the other ones
                        return;
                    }

                    // FIXME come up with a message
                    // when there should not be audio SSRC anymore
                    if (transformer.getSSRCCount() > 0) {
                        logger.debug(
                            "Doing nothing - audio SSRCs are still there");
                        // audio SSRCs are still there
                        return;
                    }

                    modified = true;

                    // We need to fake sendrecv
                    transformer.mediaDirection = "sendrecv";

                    logger.debug("Injecting audio SSRC: " + audioSSRC);
                    transformer.addSSRCAttribute({
                        id: audioSSRC,
                        attribute: 'cname',
                        value: "injected-" + audioSSRC
                    });
                    transformer.addSSRCAttribute({
                        id: audioSSRC,
                        attribute: 'msid',
                        value: audioTrack.storedMSID
                    });
                }
            });
        } else {
            logger.error(
                "Not doing local audio transform for direction: "
                + transformer.mediaDirection);
        }

        return modified;
    }

    /**
     * Makes sure local SDP for video media reflects current local tracks status
     * of the parent TPC.
     *
     * NOTE 1 video track is assumed
     *
     * @param {SdpTransformWrap} transformer the transformer instance which will
     * be used to process the SDP.
     * @return {boolean} <tt>true</tt> if any modification were made.
     * @private
     */
    _describeLocalVideoTracks(transformer) {

        // Go over each video tracks and check if the SDP has to be changed
        const localVideos = this.pc.getLocalTracks(MediaType.VIDEO);
        if (!localVideos.length) {
            return false;
        } else if (localVideos.length !== 1) {
            logger.error(
                "There is more than 1 video track ! "
                    + "Strange things may happen !", localVideos);
        }

        if (!transformer.selectMedia("video")) {
            logger.error(
                "Unable to hack local video track SDP - no 'video' media");
            return false;
        }

        let modified = false;

        // FIXME not sure about this directions
        if (["sendrecv", "recvonly", "sendonly"]
                .indexOf(transformer.mediaDirection) !== -1) {

            localVideos.forEach((videoTrack) => {
                const isMuted = videoTrack.isMuted();
                const muteInProgress = videoTrack.inMuteOrUnmuteProgress;
                const isAttached = videoTrack._isAttachedToPC(this.pc);
                const shouldFakeSdp = isMuted || muteInProgress || !isAttached;
                logger.debug(
                    videoTrack
                    + " isMuted: " + isMuted
                    + ", is mute in progress: " + muteInProgress
                    + ", is attached ? : " + isAttached
                    +" => should fake sdp ? : " + shouldFakeSdp);
                if (shouldFakeSdp) {
                    // Inject removed SSRCs
                    let requiredSSRCs
                        = (this.pc.options.disableSimulcast || this.pc.isP2P)
                            ? [this.pc.sdpConsistency.cachedPrimarySsrc]
                            : this.pc.simulcast.ssrcCache;
                    if (!requiredSSRCs.length) {
                        logger.error(
                            "No SSRCs stored for: "
                                + videoTrack + " in " + this.pc);
                        return;
                    }
                    if (!transformer.getSSRCCount()) {
                        logger.error(
                            "No video SSRCs found "
                                + "(should be at least the recv-only one");
                        return;
                    }

                    modified = true;

                    // We need to fake sendrecv
                    transformer.mediaDirection = "sendrecv";

                    // Check if the recvonly has MSID
                    const primarySSRC = requiredSSRCs[0];
                    // FIXME the cname could come from the stream, but may
                    // turn out to be too complex. It is fine to come up
                    // with any value, as long as we only care about
                    // the actual SSRC values when deciding whether or not
                    // an update should be sent
                    const primaryCname = "injected-" + primarySSRC;

                    requiredSSRCs.forEach((ssrcNum) => {
                        // Remove old attributes
                        transformer.removeSSRC(ssrcNum);
                        // Inject
                        logger.debug(
                            "Injecting video SSRC: " + ssrcNum
                                + " for " + videoTrack);
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
                    });
                    if (requiredSSRCs.length > 1) {
                        const group = {
                            ssrcs: requiredSSRCs.join(" "),
                            semantics: "SIM"
                        };
                        if (!transformer.findGroup(
                                group.semantics, group.ssrcs)) {
                            // Inject the group
                            logger.debug(
                                "Injecting SIM group for " + videoTrack, group);
                            transformer.addSSRCGroup(group);
                        }
                    }
                    // Insert RTX
                    // FIXME in P2P RTX is used by Chrome regardless of this
                    // option status
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
                                        ssrcs: ssrcObj.id
                                                + " " + correspondingSSRC,
                                        semantics: "FID"
                                    };
                                    if (!transformer.findGroup(
                                            "FID", rtxGroup.ssrcs)) {
                                        transformer.addSSRCGroup(rtxGroup);
                                        logger.debug(
                                            "Injecting RTX group" +
                                            " for: " + ssrcObj.id,
                                            rtxGroup);
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
        } else {
            logger.error(
                "Not doing local video transform for direction: "
                    + transformer.mediaDirection);
        }

        return modified;
    }

    maybeMungeLocalSdp (desc) {
        // Nothing to be done in early stage when localDescription
        // is not available yet
        if (!this.pc.peerconnection.localDescription.sdp) {
            return;
        }

        const transformer = new SdpTransformWrap(desc.sdp);
        let modified = this._describeLocalAudioTracks(transformer);
        if (this._describeLocalVideoTracks(transformer)) {
            modified = true;
        }
        if (modified) {
            // Write
            desc.sdp = transformer.toRawSDP();
            //logger.info("Post TRANSFORM: ", desc.sdp);
        }
    }
}