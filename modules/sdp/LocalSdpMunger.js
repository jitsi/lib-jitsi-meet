import { isEqual } from 'lodash-es';

import { MediaDirection } from '../../service/RTC/MediaDirection';
import { MediaType } from '../../service/RTC/MediaType';
import browser from '../browser';

import { SdpTransformWrap } from './SdpTransformUtil';

/**
 * Fakes local SDP exposed to {@link JingleSessionPC} through the local description getter. Modifies the SDP, so that
 * the stream identifiers are unique across all of the local PeerConnections and that the source names and video types
 * are injected so that Jicofo can use them to identify the sources.
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
     * Updates or adds a 'msid' attribute for the local sources in the SDP. Also adds 'sourceName' and 'videoType'
     * (if applicable) attributes. All other source attributes like 'cname', 'label' and 'mslabel' are removed since
     * these are not processed by Jicofo.
     *
     * @param {MLineWrap} mediaSection - The media part (audio or video) of the session description which will be
     * modified in place.
     * @returns {void}
     * @private
     */
    _transformMediaIdentifiers(mediaSection, ssrcMap) {
        const mediaType = mediaSection.mLine.type;
        const mediaDirection = mediaSection.mLine.direction;
        const sources = [ ...new Set(mediaSection.mLine.ssrcs?.map(s => s.id)) ];
        let sourceName;

        if (ssrcMap.size) {
            const sortedSources = sources.slice().sort();

            for (const [ id, trackSsrcs ] of ssrcMap.entries()) {
                if (isEqual(sortedSources, [ ...trackSsrcs.ssrcs ].sort())) {
                    sourceName = id;
                }
            }
            for (const source of sources) {
                if ((mediaDirection === MediaDirection.SENDONLY || mediaDirection === MediaDirection.SENDRECV)
                    && sourceName) {
                    const msid = ssrcMap.get(sourceName).msid;
                    const generatedMsid = `${msid}-${this.tpc.id}`;
                    const existingMsid = mediaSection.ssrcs
                        .find(ssrc => ssrc.id === source && ssrc.attribute === 'msid');

                    // Always overwrite msid since we want the msid to be in this format even if the browser generates
                    // one. '<endpoint_id>-<mediaType>-<trackIndex>-<tpcId>' example - d8ff91-video-0-1
                    if (existingMsid) {
                        existingMsid.value = generatedMsid;
                    } else {
                        mediaSection.ssrcs.push({
                            id: source,
                            attribute: 'msid',
                            value: generatedMsid
                        });
                    }

                    // Inject source names as a=ssrc:3124985624 name:endpointA-v0
                    mediaSection.ssrcs.push({
                        id: source,
                        attribute: 'name',
                        value: sourceName
                    });

                    const videoType = this.tpc.getLocalVideoTracks()
                        .find(track => track.getSourceName() === sourceName)
                        ?.getVideoType();

                    if (mediaType === MediaType.VIDEO && videoType) {
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

        // Ignore the 'cname', 'label' and 'mslabel' attributes.
        mediaSection.ssrcs = mediaSection.ssrcs
            .filter(ssrc => ssrc.attribute === 'msid' || ssrc.attribute === 'name' || ssrc.attribute === 'videoType');

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
     * This transformation will make sure that stream identifiers are unique across all of the local PeerConnections
     * even if the same stream is used by multiple instances at the same time. It also injects 'sourceName' and
     * 'videoType' attribute.
     *
     * @param {RTCSessionDescription} sessionDesc - The local session description (this instance remains unchanged).
     * @param {Map<string, TPCSSRCInfo>} ssrcMap - The SSRC and source map for the local tracks.
     * @return {RTCSessionDescription} - Transformed local session description
     * (a modified copy of the one given as the input).
     */
    transformStreamIdentifiers(sessionDesc, ssrcMap) {
        if (!sessionDesc || !sessionDesc.sdp || !sessionDesc.type) {
            return sessionDesc;
        }

        const transformer = new SdpTransformWrap(sessionDesc.sdp);
        const audioMLine = transformer.selectMedia(MediaType.AUDIO)?.[0];

        if (audioMLine) {
            this._transformMediaIdentifiers(audioMLine, ssrcMap);
        }

        const videoMlines = transformer.selectMedia(MediaType.VIDEO);

        for (const videoMLine of videoMlines) {
            this._transformMediaIdentifiers(videoMLine, ssrcMap);
        }

        return {
            type: sessionDesc.type,
            sdp: transformer.toRawSDP()
        };
    }
}
