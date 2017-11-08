/* global __filename */

import { getLogger } from 'jitsi-meet-logger';
import * as MediaType from '../../service/RTC/MediaType';
import { SdpTransformWrap } from '../xmpp/SdpTransformUtil';

const logger = getLogger(__filename);

/**
 * Fakes local SDP exposed to {@link JingleSessionPC} through the local
 * description getter. Modifies the SDP, so that it will contain muted local
 * video tracks description, even though their underlying {MediaStreamTrack}s
 * are no longer in the WebRTC peerconnection. That prevents from SSRC updates
 * being sent to Jicofo/remote peer and prevents sRD/sLD cycle on the remote
 * side.
 */
export default class LocalSdpMunger {

    /**
     * Creates new <tt>LocalSdpMunger</tt> instance.
     *
     * @param {TraceablePeerConnection} tpc
     */
    constructor(tpc) {
        this.tpc = tpc;
    }

    /**
     * Makes sure that muted local video tracks associated with the parent
     * {@link TraceablePeerConnection} are described in the local SDP. It's done
     * in order to prevent from sending 'source-remove'/'source-add' Jingle
     * notifications when local video track is muted (<tt>MediaStream</tt> is
     * removed from the peerconnection).
     *
     * NOTE 1 video track is assumed
     *
     * @param {SdpTransformWrap} transformer the transformer instance which will
     * be used to process the SDP.
     * @return {boolean} <tt>true</tt> if there were any modifications to
     * the SDP wrapped by <tt>transformer</tt>.
     * @private
     */
    _addMutedLocalVideoTracksToSDP(transformer) {
        // Go over each video tracks and check if the SDP has to be changed
        const localVideos = this.tpc.getLocalTracks(MediaType.VIDEO);

        if (!localVideos.length) {
            return false;
        } else if (localVideos.length !== 1) {
            logger.error(
                `${this.tpc} there is more than 1 video track ! `
                    + 'Strange things may happen !', localVideos);
        }

        const videoMLine = transformer.selectMedia('video');

        if (!videoMLine) {
            logger.debug(
                `${this.tpc} unable to hack local video track SDP`
                    + '- no "video" media');

            return false;
        }

        let modified = false;

        for (const videoTrack of localVideos) {
            const muted = videoTrack.isMuted();
            const mediaStream = videoTrack.getOriginalStream();

            // During the mute/unmute operation there are periods of time when
            // the track's underlying MediaStream is not added yet to
            // the PeerConnection. The SDP needs to be munged in such case.
            const isInPeerConnection
                = mediaStream && this.tpc.isMediaStreamInPc(mediaStream);
            const shouldFakeSdp = muted || !isInPeerConnection;

            logger.debug(
                `${this.tpc} ${videoTrack} muted: ${
                    muted}, is in PeerConnection: ${
                    isInPeerConnection} => should fake sdp ? : ${
                    shouldFakeSdp}`);

            if (!shouldFakeSdp) {
                continue; // eslint-disable-line no-continue
            }

            // Inject removed SSRCs
            const requiredSSRCs
                = this.tpc.isSimulcastOn()
                    ? this.tpc.simulcast.ssrcCache
                    : [ this.tpc.sdpConsistency.cachedPrimarySsrc ];

            if (!requiredSSRCs.length) {
                logger.error(
                    `No SSRCs stored for: ${videoTrack} in ${this.tpc}`);

                continue; // eslint-disable-line no-continue
            }

            modified = true;

            // We need to fake sendrecv.
            // NOTE the SDP produced here goes only to Jicofo and is never set
            // as localDescription. That's why
            // TraceablePeerConnection.mediaTransferActive is ignored here.
            videoMLine.direction = 'sendrecv';

            // Check if the recvonly has MSID
            const primarySSRC = requiredSSRCs[0];

            // FIXME The cname could come from the stream, but may turn out to
            // be too complex. It is fine to come up with any value, as long as
            // we only care about the actual SSRC values when deciding whether
            // or not an update should be sent.
            const primaryCname = `injected-${primarySSRC}`;

            for (const ssrcNum of requiredSSRCs) {
                // Remove old attributes
                videoMLine.removeSSRC(ssrcNum);

                // Inject
                logger.debug(
                    `${this.tpc} injecting video SSRC: ${ssrcNum} for ${
                        videoTrack}`);
                videoMLine.addSSRCAttribute({
                    id: ssrcNum,
                    attribute: 'cname',
                    value: primaryCname
                });
                videoMLine.addSSRCAttribute({
                    id: ssrcNum,
                    attribute: 'msid',
                    value: videoTrack.storedMSID
                });
            }
            if (requiredSSRCs.length > 1) {
                const group = {
                    ssrcs: requiredSSRCs.join(' '),
                    semantics: 'SIM'
                };

                if (!videoMLine.findGroup(group.semantics, group.ssrcs)) {
                    // Inject the group
                    logger.debug(
                        `${this.tpc} injecting SIM group for ${videoTrack}`,
                        group);
                    videoMLine.addSSRCGroup(group);
                }
            }

            // Insert RTX
            // FIXME in P2P RTX is used by Chrome regardless of config option
            // status. Because of that 'source-remove'/'source-add'
            // notifications are still sent to remove/add RTX SSRC and FID group
            if (!this.tpc.options.disableRtx) {
                this.tpc.rtxModifier.modifyRtxSsrcs2(videoMLine);
            }
        }

        return modified;
    }

    /**
     * Maybe modifies local description to fake local video tracks SDP when
     * those are muted.
     *
     * @param {object} desc the WebRTC SDP object instance for the local
     * description.
     * @returns {RTCSessionDescription}
     */
    maybeAddMutedLocalVideoTracksToSDP(desc) {
        if (!desc) {
            throw new Error('No local description passed in.');
        }

        const transformer = new SdpTransformWrap(desc.sdp);

        if (this._addMutedLocalVideoTracksToSDP(transformer)) {
            return new RTCSessionDescription({
                type: desc.type,
                sdp: transformer.toRawSDP()
            });
        }

        return desc;
    }
}
