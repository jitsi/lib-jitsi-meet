import { getLogger } from '@jitsi/logger';

import { MediaDirection } from '../../service/RTC/MediaDirection';
import { MediaType } from '../../service/RTC/MediaType';
import { getSourceNameForJitsiTrack } from '../../service/RTC/SignalingLayer';
import { VideoType } from '../../service/RTC/VideoType';
import browser from '../browser';
import FeatureFlags from '../flags/FeatureFlags';

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
        this.audioSourcesToMsidMap = new Map();
        this.videoSourcesToMsidMap = new Map();
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

        const videoMLine = transformer.selectMedia(MediaType.VIDEO)?.[0];

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
    _generateMsidAttribute(mediaType, trackId, streamId) {
        if (!(mediaType && trackId)) {
            logger.error(`Unable to munge local MSID - track id=${trackId} or media type=${mediaType} is missing`);

            return null;
        }
        const pcId = this.tpc.id;

        return `${streamId}-${pcId} ${trackId}-${pcId}`;
    }

    /**
     * Updates or adds a 'msid' attribute in the format '<endpoint_id>-<mediaType>-<trackIndex>-<tpcId>'
     * example - d8ff91-video-0-1
     * All other attributes like 'cname', 'label' and 'mslabel' are removed since these are not processed by Jicofo.
     *
     * @param {MLineWrap} mediaSection - The media part (audio or video) of the session description which will be
     * modified in place.
     * @returns {void}
     * @private
     */
    _transformMediaIdentifiers(mediaSection) {
        const mediaType = mediaSection.mLine?.type;
        const mediaDirection = mediaSection.mLine?.direction;
        const msidLine = mediaSection.mLine?.msid;
        const sources = [ ...new Set(mediaSection.mLine?.ssrcs?.map(s => s.id)) ];
        const streamId = `${this.localEndpointId}-${mediaType}`;
        const trackId = msidLine && msidLine.split(' ')[1];

        // Always overwrite msid since we want the msid to be in this format even if the browser generates one.
        for (const source of sources) {
            const msid = mediaSection.ssrcs.find(ssrc => ssrc.id === source && ssrc.attribute === 'msid');

            // Update the msid if the 'msid' attribute exists.
            if (msid) {
                const streamAndTrackIDs = msid.value.split(' ');
                const trackID = streamAndTrackIDs[1];

                this._updateSourcesToMsidMap(mediaType, streamId, trackID);

                // Update the msid.
                const storedStreamId = mediaType === MediaType.VIDEO
                    ? this.videoSourcesToMsidMap.get(trackID)
                    : this.audioSourcesToMsidMap.get(trackID);

                msid.value = this._generateMsidAttribute(mediaType, trackID, storedStreamId);

            // Generate the msid attribute using the 'trackId' from the msid line from the media description. Only
            // descriptions that have the direction set to 'sendonly' or 'sendrecv' will have the 'a=msid' line.
            } else if (trackId) {
                this._updateSourcesToMsidMap(mediaType, streamId, trackId);

                const storedStreamId = mediaType === MediaType.VIDEO
                    ? this.videoSourcesToMsidMap.get(trackId)
                    : this.audioSourcesToMsidMap.get(trackId);
                const generatedMsid = this._generateMsidAttribute(mediaType, trackId, storedStreamId);

                mediaSection.ssrcs.push({
                    id: source,
                    attribute: 'msid',
                    value: generatedMsid
                });
            }
        }

        // Ignore the 'cname', 'label' and 'mslabel' attributes and only have the 'msid' attribute.
        mediaSection.ssrcs = mediaSection.ssrcs.filter(ssrc => ssrc.attribute === 'msid');

        // On FF when the user has started muted create answer will generate a recv only SSRC. We don't want to signal
        // this SSRC in order to reduce the load of the xmpp server for large calls. Therefore the SSRC needs to be
        // removed from the SDP.
        //
        // For all other use cases (when the user has had media but then the user has stopped it) we want to keep the
        // receive only SSRCs in the SDP. Otherwise source-remove will be triggered and the next time the user add a
        // track we will reuse the SSRCs and send source-add with the same SSRCs. This is problematic because of issues
        // on Chrome and FF (https://bugzilla.mozilla.org/show_bug.cgi?id=1768729) when removing and then adding the
        // same SSRC in the remote sdp the remote track is not rendered.
        if (browser.isFirefox()
            && (mediaDirection === MediaDirection.RECVONLY || mediaDirection === MediaDirection.INACTIVE)
            && (
                (mediaType === MediaType.VIDEO && !this.tpc._hasHadVideoTrack)
                || (mediaType === MediaType.AUDIO && !this.tpc._hasHadAudioTrack)
            )
        ) {
            mediaSection.ssrcs = undefined;
            mediaSection.ssrcGroups = undefined;
        }
    }

    /**
     * Updates the MSID map.
     *
     * @param {string} mediaType The media type.
     * @param {string} streamId The stream id.
     * @param {string} trackId The track id.
     * @returns {void}
     */
    _updateSourcesToMsidMap(mediaType, streamId, trackId) {
        if (mediaType === MediaType.VIDEO) {
            if (!this.videoSourcesToMsidMap.has(trackId)) {
                const generatedStreamId = `${streamId}-${this.videoSourcesToMsidMap.size}`;

                this.videoSourcesToMsidMap.set(trackId, generatedStreamId);
            }
        } else if (!this.audioSourcesToMsidMap.has(trackId)) {
            const generatedStreamId = `${streamId}-${this.audioSourcesToMsidMap.size}`;

            this.audioSourcesToMsidMap.set(trackId, generatedStreamId);
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
        const audioMLine = transformer.selectMedia(MediaType.AUDIO)?.[0];

        if (audioMLine) {
            this._transformMediaIdentifiers(audioMLine);
            this._injectSourceNames(audioMLine);
        }

        const videoMlines = transformer.selectMedia(MediaType.VIDEO);

        if (!FeatureFlags.isMultiStreamSendSupportEnabled()) {
            videoMlines.splice(1);
        }

        for (const videoMLine of videoMlines) {
            this._transformMediaIdentifiers(videoMLine);
            this._injectSourceNames(videoMLine);
        }

        // Plan-b clients generate new SSRCs and trackIds whenever tracks are removed and added back to the
        // peerconnection, therefore local track based map for msids needs to be reset after every transformation.
        if (!this.tpc._usesUnifiedPlan) {
            this.audioSourcesToMsidMap.clear();
            this.videoSourcesToMsidMap.clear();
        }

        return new RTCSessionDescription({
            type: sessionDesc.type,
            sdp: transformer.toRawSDP()
        });
    }

    /**
     * Injects source names. Source names are need to for multiple streams per endpoint support. The final plan is to
     * use the "mid" attribute for source names, but because the SDP to Jingle conversion still operates in the Plan-B
     * semantics (one source name per media), a custom "name" attribute is injected into SSRC lines..
     *
     * @param {MLineWrap} mediaSection - The media part (audio or video) of the session description which will be
     * modified in place.
     * @returns {void}
     * @private
     */
    _injectSourceNames(mediaSection) {
        const sources = [ ...new Set(mediaSection.mLine?.ssrcs?.map(s => s.id)) ];
        const mediaType = mediaSection.mLine?.type;

        if (!mediaType) {
            throw new Error('_transformMediaIdentifiers - no media type in mediaSection');
        }

        for (const source of sources) {
            const nameExists = mediaSection.ssrcs.find(ssrc => ssrc.id === source && ssrc.attribute === 'name');
            const msid = mediaSection.ssrcs.find(ssrc => ssrc.id === source && ssrc.attribute === 'msid').value;
            const streamId = msid.split(' ')[0];

            // Example stream id: d8ff91-video-8-1
            // In the example above 8 is the track index
            const trackIndexParts = streamId.split('-');
            const trackIndex = trackIndexParts[trackIndexParts.length - 2];
            const sourceName = getSourceNameForJitsiTrack(this.localEndpointId, mediaType, trackIndex);

            if (!nameExists) {
                // Inject source names as a=ssrc:3124985624 name:endpointA-v0
                mediaSection.ssrcs.push({
                    id: source,
                    attribute: 'name',
                    value: sourceName
                });
            }

            if (mediaType === MediaType.VIDEO) {
                const videoType = this.tpc.getLocalVideoTracks().find(track => track.getSourceName() === sourceName)
                    ?.getVideoType();

                if (videoType) {
                    // Inject videoType as a=ssrc:1234 videoType:desktop.
                    mediaSection.ssrcs.push({
                        id: source,
                        attribute: 'videoType',
                        value: videoType
                    });
                }
            }
        }
    }
}
