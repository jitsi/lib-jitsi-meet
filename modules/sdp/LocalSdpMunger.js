/* global __filename */

import { getLogger } from 'jitsi-meet-logger';

import MediaDirection from '../../service/RTC/MediaDirection';
import * as MediaType from '../../service/RTC/MediaType';
import VideoType from '../../service/RTC/VideoType';

import { SdpTransformWrap } from './SdpTransformUtil';

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
     * @param {string} localEndpointId - The endpoint id of the local user.
     */
    constructor(tpc, localEndpointId) {
        this.tpc = tpc;
        this.localEndpointId = localEndpointId;
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
            const isCamera = videoTrack.videoType === VideoType.CAMERA;

            // During the mute/unmute operation there are periods of time when
            // the track's underlying MediaStream is not added yet to
            // the PeerConnection. The SDP needs to be munged in such case.
            const isInPeerConnection
                = mediaStream && this.tpc.isMediaStreamInPc(mediaStream);
            const shouldFakeSdp = isCamera && (muted || !isInPeerConnection);

            if (!shouldFakeSdp) {
                continue; // eslint-disable-line no-continue
            }

            // Inject removed SSRCs
            const requiredSSRCs
                = this.tpc.isSimulcastOn()
                    ? this.tpc.simulcast.ssrcCache
                    : [ this.tpc.sdpConsistency.cachedPrimarySsrc ];

            if (!requiredSSRCs.length) {
                logger.error(`No SSRCs stored for: ${videoTrack} in ${this.tpc}`);

                continue; // eslint-disable-line no-continue
            }

            modified = true;

            // We need to fake sendrecv.
            // NOTE the SDP produced here goes only to Jicofo and is never set
            // as localDescription. That's why
            // TraceablePeerConnection.mediaTransferActive is ignored here.
            videoMLine.direction = MediaDirection.SENDRECV;

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
     * Returns a string that can be set as the MSID attribute for a source.
     *
     * @param {string} mediaType - Media type of the source.
     * @param {string} trackId - Id of the MediaStreamTrack associated with the source.
     * @param {string} streamId - Id of the MediaStream associated with the source.
     * @returns {string|null}
     */
    _generateMsidAttribute(mediaType, trackId, streamId = null) {
        if (!(mediaType && trackId)) {
            logger.warn(`Unable to munge local MSID - track id=${trackId} or media type=${mediaType} is missing`);

            return null;
        }
        const pcId = this.tpc.id;

        // Handle a case on Firefox when the browser doesn't produce a 'a:ssrc' line with the 'msid' attribute or has
        // '-' for the stream id part of the msid line. Jicofo needs an unique identifier to be associated with a ssrc
        // and uses the msid for that.
        if (streamId === '-' || !streamId) {
            return `${this.localEndpointId}-${mediaType}-${pcId} ${trackId}-${pcId}`;
        }

        return `${streamId}-${pcId} ${trackId}-${pcId}`;
    }

    /**
     * Modifies 'cname', 'msid', 'label' and 'mslabel' by appending
     * the id of {@link LocalSdpMunger#tpc} at the end, preceding by a dash
     * sign.
     *
     * @param {MLineWrap} mediaSection - The media part (audio or video) of the
     * session description which will be modified in place.
     * @returns {void}
     * @private
     */
    _transformMediaIdentifiers(mediaSection) {
        const pcId = this.tpc.id;

        for (const ssrcLine of mediaSection.ssrcs) {
            switch (ssrcLine.attribute) {
            case 'cname':
            case 'label':
            case 'mslabel':
                ssrcLine.value = ssrcLine.value && `${ssrcLine.value}-${pcId}`;
                break;
            case 'msid': {
                if (ssrcLine.value) {
                    const streamAndTrackIDs = ssrcLine.value.split(' ');

                    if (streamAndTrackIDs.length === 2) {
                        ssrcLine.value
                            = this._generateMsidAttribute(
                                mediaSection.mLine?.type,
                                streamAndTrackIDs[1],
                                streamAndTrackIDs[0]);
                    } else {
                        logger.warn(`Unable to munge local MSID - weird format detected: ${ssrcLine.value}`);
                    }
                }
                break;
            }
            }
        }

        // Additional transformations related to MSID are applicable to Unified-plan implementation only.
        if (!this.tpc.usesUnifiedPlan()) {
            return;
        }

        // If the msid attribute is missing, then remove the ssrc from the transformed description so that a
        // source-remove is signaled to Jicofo. This happens when the direction of the transceiver (or m-line)
        // is set to 'inactive' or 'recvonly' on Firefox, Chrome (unified) and Safari.
        const mediaDirection = mediaSection.mLine?.direction;

        if (mediaDirection === MediaDirection.RECVONLY || mediaDirection === MediaDirection.INACTIVE) {
            mediaSection.ssrcs = undefined;
            mediaSection.ssrcGroups = undefined;

        // Add the msid attribute if it is missing when the direction is sendrecv/sendonly. Firefox doesn't produce a
        // a=ssrc line with msid attribute for p2p connection.
        } else {
            const msidLine = mediaSection.mLine?.msid;
            const trackId = msidLine && msidLine.split(' ')[1];
            const sources = [ ...new Set(mediaSection.mLine?.ssrcs?.map(s => s.id)) ];

            for (const source of sources) {
                const msidExists = mediaSection.ssrcs
                    .find(ssrc => ssrc.id === source && ssrc.attribute === 'msid');

                if (!msidExists) {
                    const generatedMsid = this._generateMsidAttribute(mediaSection.mLine?.type, trackId);

                    mediaSection.ssrcs.push({
                        id: source,
                        attribute: 'msid',
                        value: generatedMsid
                    });
                }
            }
        }
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

    /**
     * This transformation will make sure that stream identifiers are unique
     * across all of the local PeerConnections even if the same stream is used
     * by multiple instances at the same time.
     * Each PeerConnection assigns different SSRCs to the same local
     * MediaStream, but the MSID remains the same as it's used to identify
     * the stream by the WebRTC backend. The transformation will append
     * {@link TraceablePeerConnection#id} at the end of each stream's identifier
     * ("cname", "msid", "label" and "mslabel").
     *
     * @param {RTCSessionDescription} sessionDesc - The local session
     * description (this instance remains unchanged).
     * @return {RTCSessionDescription} - Transformed local session description
     * (a modified copy of the one given as the input).
     */
    transformStreamIdentifiers(sessionDesc) {
        // FIXME similar check is probably duplicated in all other transformers
        if (!sessionDesc || !sessionDesc.sdp || !sessionDesc.type) {
            return sessionDesc;
        }

        const transformer = new SdpTransformWrap(sessionDesc.sdp);
        const audioMLine = transformer.selectMedia('audio');

        if (audioMLine) {
            this._transformMediaIdentifiers(audioMLine);
        }

        const videoMLine = transformer.selectMedia('video');

        if (videoMLine) {
            this._transformMediaIdentifiers(videoMLine);
        }

        return new RTCSessionDescription({
            type: sessionDesc.type,
            sdp: transformer.toRawSDP()
        });
    }
}
