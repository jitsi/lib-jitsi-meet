import * as transform from 'sdp-transform';

import { MediaDirection } from '../../service/RTC/MediaDirection';
import { MediaType } from '../../service/RTC/MediaType';
import { getEffectiveSimulcastLayers, SSRC_GROUP_SEMANTICS } from '../../service/RTC/StandardVideoQualitySettings';

/**
 * This class handles SDP munging for enabling simulcast for local video streams in Unified plan. A set of random SSRCs
 * are generated for the higher layer streams and they are cached for a given mid. The cached SSRCs are then reused on
 * the subsequent iterations while munging the local description. This class also handles imploding of the simulcast
 * SSRCs for remote endpoints into the primary FID group in remote description since Jicofo signals all SSRCs relevant
 * to a given endpoint.
 */
export default class SdpSimulcast {
    private _ssrcCache: Map<string, Array<number>>;
    private _layersCache: Map<string, number>;

    /**
     * Creates a new instance.
     *
     * @param options
     */
    constructor() {
        this._ssrcCache = new Map();
        this._layersCache = new Map();
    }

    /**
     * Updates the given media description using the SSRCs that were cached for the mid associated
     * with the media description and returns the modified media description.
     *
     * @param mLine
     * @returns
     */
    _fillSsrcsFromCache(mLine: transform.MediaDescription): any {
        const mid = mLine.mid;
        const cachedSsrcs = this._ssrcCache.get(mid);
        const cachedNumLayers = this._layersCache.get(mid) || cachedSsrcs.length;
        const newSsrcs = this._parseSimLayers(mLine);
        const newMsid = this._getSsrcAttribute(mLine, newSsrcs[0], 'msid');
        const newCname = this._getSsrcAttribute(mLine, newSsrcs[0], 'cname');

        mLine.ssrcs = [];
        mLine.ssrcGroups = [];

        for (const ssrc of cachedSsrcs) {
            mLine.ssrcs.push({
                attribute: 'msid',
                id: ssrc,
                value: newMsid
            });
            mLine.ssrcs.push({
                attribute: 'cname',
                id: ssrc,
                value: newCname
            });
        }

        // Only add SIM group if we have more than one layer
        if (cachedNumLayers > 1) {
            mLine.ssrcGroups.push({
                semantics: SSRC_GROUP_SEMANTICS.SIM,
                ssrcs: cachedSsrcs.join(' ')
            });
        }

        return mLine;
    }

    /**
     * Generates a new set of SSRCs for the higher simulcast layers/streams and adds the attributes and SIM group to
     * the given media description and returns the modified media description.
     *
     * @param mLine
     * @param primarySsrc
     * @param numLayers - Number of simulcast layers to generate (determined dynamically based on capture resolution)
     * @returns
     */
    _generateNewSsrcsForSimulcast(mLine: transform.MediaDescription, primarySsrc: number, numLayers: number): any {
        const cname = this._getSsrcAttribute(mLine, primarySsrc, 'cname');
        let msid = this._getSsrcAttribute(mLine, primarySsrc, 'msid');

        // In Unified-plan mode, the a=ssrc lines with the msid attribute are not present (only cname attributes are
        // present) in the answers that Chrome and Safari generate for an offer received from Jicofo. Generate these
        // a=ssrc lines using the msid values from the a=msid line.
        if (!msid) {
            msid = mLine.msid;
            const primarySsrcs = mLine.ssrcs;

            primarySsrcs.forEach(ssrc => {
                mLine.ssrcs.push({
                    attribute: 'msid',
                    id: ssrc.id,
                    value: msid
                });
            });
        }

        // Generate SIM layers dynamically based on the number of layers needed.
        // For example, if numLayers is 1, no additional SSRCs are generated (simulcast disabled).
        // If numLayers is 2, one additional SSRC is generated. If numLayers is 3, two additional SSRCs are generated.
        const simSsrcs = [];

        for (let i = 0; i < numLayers - 1; ++i) {
            const simSsrc = this._generateSsrc();

            mLine.ssrcs.push({
                attribute: 'cname',
                id: simSsrc,
                value: cname
            });
            mLine.ssrcs.push({
                attribute: 'msid',
                id: simSsrc,
                value: msid
            });

            simSsrcs.push(simSsrc);
        }

        // Only add SIM group if we have more than one layer
        if (numLayers > 1) {
            mLine.ssrcGroups = mLine.ssrcGroups || [];
            mLine.ssrcGroups.push({
                semantics: SSRC_GROUP_SEMANTICS.SIM,
                ssrcs: `${primarySsrc} ${simSsrcs.join(' ')}`
            });
        }

        return mLine;
    }

    /**
     * Returns a random number to be used for the SSRC.
     *
     * @returns
     */
    _generateSsrc(): number {
        const max = 0xffffffff;

        return Math.floor(Math.random() * max);
    }

    /**
     * Returns the requested attribute value for a SSRC from a given media description.
     *
     * @param mLine
     * @param ssrc
     * @param attributeName
     * @returns
     */
    _getSsrcAttribute(mLine: transform.MediaDescription, ssrc: number, attributeName: string): Optional<string> {
        return mLine.ssrcs?.find(
            ssrcInfo => Number(ssrcInfo.id) === ssrc
            && ssrcInfo.attribute === attributeName)?.value;
    }

    /**
     * Returns an array of all the primary SSRCs in the SIM group for a given media description.
     *
     * @param mLine
     * @returns
     */
    _parseSimLayers(mLine: transform.MediaDescription): Nullable<Array<number>> {
        const simGroup = mLine.ssrcGroups?.find(group => group.semantics === SSRC_GROUP_SEMANTICS.SIM);

        if (simGroup) {
            return simGroup.ssrcs.split(' ').map(ssrc => Number(ssrc));
        }

        if (mLine.ssrcs?.length) {
            return [ Number(mLine.ssrcs[0].id) ];
        }

        return null;
    }

    /**
     * Munges the given media description to enable simulcast for the video media sections that are in either have
     * SENDRECV or SENDONLY as the media direction thereby ignoring all the RECVONLY transceivers created for remote
     * endpoints.
     * NOTE: This needs to be called only when simulcast is enabled.
     *
     * @param description - The RTCSessionDescription to munge
     * @param trackResolutionMap - Optional map of mid to capture resolution height for determining simulcast layers
     * @returns
     */
    mungeLocalDescription(
        description: RTCSessionDescription,
        trackResolutionMap?: Map<string, number>
    ): RTCSessionDescription {
        if (!description?.sdp) {
            return description;
        }
        const session = transform.parse(description.sdp);

        for (let media of session.media) {
            // Ignore recvonly and inactive transceivers created for remote sources.
            if (media.direction === MediaDirection.RECVONLY || media.direction === MediaDirection.INACTIVE) {
                continue;
            }

            // Ignore audio m-lines.
            if (media.type !== MediaType.VIDEO) {
                continue;
            }
            const mid = media.mid;
            const numSsrcs = new Set(media.ssrcs?.map(ssrcInfo => ssrcInfo.id));
            const numGroups = media.ssrcGroups?.length ?? 0;
            let primarySsrc: number;

            // Do not munge if the description has no ssrcs or if simulcast is already enabled.
            if (numSsrcs.size === 0 || numSsrcs.size > 2 || (numSsrcs.size === 2 && numGroups === 0)) {
                continue;
            }
            if (numSsrcs.size === 1) {
                primarySsrc = Number(media.ssrcs[0]?.id);
            } else {
                const fidGroup = media.ssrcGroups.find(group => group.semantics === SSRC_GROUP_SEMANTICS.FID);

                if (fidGroup) {
                    primarySsrc = Number(fidGroup.ssrcs.split(' ')[0]);
                }
            }

            // Determine number of layers dynamically based on capture resolution
            const captureHeight = trackResolutionMap?.get(mid);
            const effectiveLayers = captureHeight 
                ? getEffectiveSimulcastLayers(captureHeight)
                : getEffectiveSimulcastLayers(720); // Default to 3 layers if resolution unknown
            const numLayers = effectiveLayers.length;

            if (this._ssrcCache.has(mid)) {
                media = this._fillSsrcsFromCache(media);
            } else {
                media = this._generateNewSsrcsForSimulcast(media, primarySsrc, numLayers);
                const simulcastSsrcs = this._parseSimLayers(media);

                // Cache both SSRCs and the number of layers for this mid
                this._ssrcCache.set(mid, simulcastSsrcs);
                this._layersCache.set(mid, numLayers);
            }
        }

        return new RTCSessionDescription({
            sdp: transform.write(session),
            type: description.type
        });
    }
}
