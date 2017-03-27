/* global __filename */

import { getLogger } from 'jitsi-meet-logger';
import * as MediaType from '../../service/RTC/MediaType';
import { SdpTransformWrap } from '../xmpp/SdpTransformUtil';

const logger = getLogger(__filename);

/**
 * Fakes local SDP, so that it will reflect detached local tracks associated
 * with the {@link TraceablePeerConnection} and make operations like
 * attach/detach and video mute/unmute local operations. That means it prevents
 * from SSRC updates being sent to Jicofo/remote peer, so that there is no
 * sRD/sLD cycle on the remote side.
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
     * Makes sure that detached local audio tracks stored in the parent
     * {@link TraceablePeerConnection} are described in the local SDP.
     * It's done in order to prevent from sending 'source-remove'/'source-add'
     * Jingle notifications when local audio track is detached from
     * the {@link TraceablePeerConnection}.
     * @param {SdpTransformWrap} transformer the transformer instance which will
     * be used to process the SDP.
     * @return {boolean} <tt>true</tt> if there were any modifications to
     * the SDP wrapped by <tt>transformer</tt>.
     * @private
     */
    _addDetachedLocalAudioTracksToSDP(transformer) {
        const localAudio = this.tpc.getLocalTracks(MediaType.AUDIO);

        if (!localAudio.length) {
            return false;
        }
        const audioMLine = transformer.selectMedia('audio');

        if (!audioMLine) {
            logger.error(
                'Unable to hack local audio track SDP - no "audio" media');

            return false;
        }

        if (audioMLine.direction === 'inactive') {
            logger.error(
                'Not doing local audio transform for "inactive" direction');

            return false;
        }

        let modified = false;

        for (const audioTrack of localAudio) {
            const isAttached = audioTrack._isAttachedToPC(this.tpc);
            const shouldFake = !isAttached;

            logger.debug(
                `${audioTrack} isAttached: ${isAttached
                    } => should fake audio SDP ?: ${shouldFake}`);

            if (!shouldFake) {
                // not using continue increases indentation
                // eslint-disable-next-line no-continue
                continue;
            }

            // Inject removed SSRCs
            const audioSSRC = this.tpc.getLocalSSRC(audioTrack);
            const audioMSID = audioTrack.storedMSID;

            if (!audioSSRC) {
                logger.error(
                    `Can't fake SDP for ${audioTrack} - no SSRC stored`);

                // Aborts the forEach on this particular track,
                // but will continue with the other ones
                // eslint-disable-next-line no-continue
                continue;
            } else if (!audioMSID) {
                logger.error(
                    `No MSID stored for local audio SSRC: ${audioSSRC}`);

                // eslint-disable-next-line no-continue
                continue;
            }

            if (audioMLine.getSSRCCount() > 0) {
                logger.debug(
                    'Doing nothing - audio SSRCs are still there');

                // audio SSRCs are still there
                // eslint-disable-next-line no-continue
                continue;
            }

            modified = true;

            // We need to fake sendrecv
            audioMLine.direction = 'sendrecv';

            logger.debug(`Injecting audio SSRC: ${audioSSRC}`);
            audioMLine.addSSRCAttribute({
                id: audioSSRC,
                attribute: 'cname',
                value: `injected-${audioSSRC}`
            });
            audioMLine.addSSRCAttribute({
                id: audioSSRC,
                attribute: 'msid',
                value: audioMSID
            });
        }

        return modified;
    }

    /**
     * Makes sure that detached (or muted) local video tracks associated with
     * the parent {@link TraceablePeerConnection} are described in the local
     * SDP. It's done in order to prevent from sending
     * 'source-remove'/'source-add' Jingle notifications when local video track
     * is detached from the {@link TraceablePeerConnection} (or muted).
     *
     * NOTE 1 video track is assumed
     *
     * @param {SdpTransformWrap} transformer the transformer instance which will
     * be used to process the SDP.
     * @return {boolean} <tt>true</tt> if there were any modifications to
     * the SDP wrapped by <tt>transformer</tt>.
     * @private
     */
    _addDetachedLocalVideoTracksToSDP(transformer) {
        // Go over each video tracks and check if the SDP has to be changed
        const localVideos = this.tpc.getLocalTracks(MediaType.VIDEO);

        if (!localVideos.length) {
            return false;
        } else if (localVideos.length !== 1) {
            logger.error(
                'There is more than 1 video track ! '
                    + 'Strange things may happen !', localVideos);
        }

        const videoMLine = transformer.selectMedia('video');

        if (!videoMLine) {
            logger.error(
                'Unable to hack local video track SDP - no "video" media');

            return false;
        }

        if (videoMLine.direction === 'inactive') {
            logger.error(
                'Not doing local video transform for "inactive" direction.');

            return false;
        }

        let modified = false;

        for (const videoTrack of localVideos) {
            const isMuted = videoTrack.isMuted();
            const muteInProgress = videoTrack.inMuteOrUnmuteProgress;
            const isAttached = videoTrack._isAttachedToPC(this.tpc);
            const shouldFakeSdp = isMuted || muteInProgress || !isAttached;

            logger.debug(
                `${videoTrack
                 } isMuted: ${isMuted
                 }, is mute in progress: ${muteInProgress
                 }, is attached ? : ${isAttached
                 } => should fake sdp ? : ${shouldFakeSdp}`);

            if (!shouldFakeSdp) {
                // eslint-disable-next-line no-continue
                continue;
            }

            // Inject removed SSRCs
            const requiredSSRCs
                = this.tpc.isSimulcastOn()
                    ? this.tpc.simulcast.ssrcCache
                    : [ this.tpc.sdpConsistency.cachedPrimarySsrc ];

            if (!requiredSSRCs.length) {
                logger.error(
                    `No SSRCs stored for: ${videoTrack} in ${this.tpc}`);

                // eslint-disable-next-line no-continue
                continue;
            }
            if (!videoMLine.getSSRCCount()) {
                logger.error(
                    'No video SSRCs found '
                        + '(should be at least the recv-only one');

                // eslint-disable-next-line no-continue
                continue;
            }

            modified = true;

            // We need to fake sendrecv
            videoMLine.direction = 'sendrecv';

            // Check if the recvonly has MSID
            const primarySSRC = requiredSSRCs[0];

            // FIXME the cname could come from the stream, but may
            // turn out to be too complex. It is fine to come up
            // with any value, as long as we only care about
            // the actual SSRC values when deciding whether or not
            // an update should be sent
            const primaryCname = `injected-${primarySSRC}`;

            for (const ssrcNum of requiredSSRCs) {
                // Remove old attributes
                videoMLine.removeSSRC(ssrcNum);

                // Inject
                logger.debug(
                    `Injecting video SSRC: ${ssrcNum} for ${videoTrack}`);
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
                        `Injecting SIM group for ${videoTrack}`, group);
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
     * Maybe modifies local description to fake local tracks SDP when those are
     * either muted or detached from the <tt>PeerConnection</tt>.
     *
     * @param {object} desc the WebRTC SDP object instance for the local
     * description.
     */
    maybeMungeLocalSdp(desc) {
        // Nothing to be done in early stage when localDescription
        // is not available yet
        if (!desc || !desc.sdp) {
            return;
        }

        const transformer = new SdpTransformWrap(desc.sdp);
        let modified = this._addDetachedLocalAudioTracksToSDP(transformer);

        if (this._addDetachedLocalVideoTracksToSDP(transformer)) {
            modified = true;
        }
        if (modified) {
            // Write
            desc.sdp = transformer.toRawSDP();

            // logger.info("Post TRANSFORM: ", desc.sdp);
        }
    }
}
