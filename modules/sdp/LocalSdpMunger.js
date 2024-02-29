import { getLogger } from '@jitsi/logger';

import { MediaDirection } from '../../service/RTC/MediaDirection';
import { MediaType } from '../../service/RTC/MediaType';
import { getSourceNameForJitsiTrack } from '../../service/RTC/SignalingLayer';
import browser from '../browser';

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
        let trackId = msidLine ? msidLine.split(' ')[1] : `${this.localEndpointId}-${mediaSection.mLine.mid}`;

        // Always overwrite msid since we want the msid to be in this format even if the browser generates one.
        for (const source of sources) {
            const msid = mediaSection.ssrcs.find(ssrc => ssrc.id === source && ssrc.attribute === 'msid');

            if (msid) {
                trackId = msid.value.split(' ')[1];
            }
            this._updateSourcesToMsidMap(mediaType, streamId, trackId);
            const storedStreamId = mediaType === MediaType.VIDEO
                ? this.videoSourcesToMsidMap.get(trackId)
                : this.audioSourcesToMsidMap.get(trackId);

            const generatedMsid = this._generateMsidAttribute(mediaType, trackId, storedStreamId);

            // Update the msid if the 'msid' attribute exists.
            if (msid) {
                msid.value = generatedMsid;

            // Generate the 'msid' attribute if there is a local source.
            } else if (mediaDirection === MediaDirection.SENDONLY || mediaDirection === MediaDirection.SENDRECV) {
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

        for (const videoMLine of videoMlines) {
            this._transformMediaIdentifiers(videoMLine);
            this._injectSourceNames(videoMLine);
        }

        // Reset the local tracks based maps for msid after every transformation since Chrome 122 is generating
        // a new set of SSRCs for the same source when the direction of transceiver changes because of a remote
        // source getting added on the p2p connection.
        this.audioSourcesToMsidMap.clear();
        this.videoSourcesToMsidMap.clear();

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
