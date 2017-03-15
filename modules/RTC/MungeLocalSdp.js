/* global __filename */

import { getLogger } from 'jitsi-meet-logger';
import * as MediaType from '../../service/RTC/MediaType';
import { SdpTransformWrap } from '../xmpp/SdpTransformUtil';

const logger = getLogger(__filename);

/**
 * Fakes local SDP, so that it will reflect current local tracks status inside
 * of the <tt>TraceablePeerConnection<tt/> and make operations like
 * attach/detach and video mute/unmute local operations. That means it prevents
 * from SSRC updates being sent to Jicofo/remote peer, so that there is no
 * sRD/sLD cycle on the remote side.
 *
 * FIXME audio SSRC is not consistent, between attach and detach
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
                `Not doing local audio transform for direction: ${
                    audioMLine.direction}`);

            return false;
        }

        let modified = false;

        for (const audioTrack of localAudio) {
            const isAttached = audioTrack._isAttachedToPC(this.pc);
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
            const audioSSRC = this.pc.getLocalSSRC(audioTrack);

            if (!audioSSRC) {
                logger.error(
                    `Can't fake SDP for ${
                        audioTrack} - no SSRC stored`);

                // Aborts the forEach on this particular track,
                // but will continue with the other ones
                // eslint-disable-next-line no-continue
                continue;
            }

            // FIXME come up with a message
            // when there should not be audio SSRC anymore
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
                value: audioTrack.storedMSID
            });
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
                `Not doing local video transform for direction: ${
                    videoMLine.direction}`);

            return false;
        }

        let modified = false;

        for (const videoTrack of localVideos) {
            const isMuted = videoTrack.isMuted();
            const muteInProgress = videoTrack.inMuteOrUnmuteProgress;
            const isAttached = videoTrack._isAttachedToPC(this.pc);
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
                = this.pc.isSimulcastOn()
                    ? this.pc.simulcast.ssrcCache
                    : [ this.pc.sdpConsistency.cachedPrimarySsrc ];

            if (!requiredSSRCs.length) {
                logger.error(
                    `No SSRCs stored for: ${videoTrack} in ${this.pc}`);

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
            // FIXME in P2P RTX is used by Chrome regardless of this
            // option status
            if (this.pc.options.disableRtx) {

                // eslint-disable-next-line no-continue
                continue;
            }

            // FIXME rtxModifier should be reused for this part
            const rtxSSRCs = this.pc.rtxModifier.correspondingRtxSsrcs;

            // These are the SSRC object that contain "msid"
            const streamSSRCs
                = videoMLine.ssrcs.filter(
                    ssrcObj => ssrcObj.attribute === 'msid');

            for (const ssrcObj of streamSSRCs) {
                const correspondingSSRC = rtxSSRCs.get(ssrcObj.id);

                if (correspondingSSRC) {
                    // Remove old attributes
                    videoMLine.removeSSRC(correspondingSSRC);

                    // Add new
                    videoMLine.addSSRCAttribute({
                        id: correspondingSSRC,
                        attribute: 'msid',
                        value: ssrcObj.value
                    });
                    videoMLine.addSSRCAttribute({
                        id: correspondingSSRC,
                        attribute: 'cname',
                        value: primaryCname
                    });
                    const rtxGroup = {
                        ssrcs: `${ssrcObj.id} ${correspondingSSRC}`,
                        semantics: 'FID'
                    };

                    if (!videoMLine.findGroup('FID', rtxGroup.ssrcs)) {
                        videoMLine.addSSRCGroup(rtxGroup);
                        logger.debug(
                            `Injecting RTX group for: ${ssrcObj.id}`, rtxGroup);
                    }
                } else {
                    // FIXME explain better
                    // Logging on debug, because it's normal
                    // if the SSRCs are already in the SDP
                    logger.debug(
                        `No corresponding SSRC found for: ${ssrcObj.id}`,
                        rtxSSRCs);
                }
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

            // logger.info("Post TRANSFORM: ", desc.sdp);
        }
    }
}
