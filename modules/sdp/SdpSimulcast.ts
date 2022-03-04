import { MediaDirection } from '../../service/RTC/MediaDirection';
import { MediaType } from '../../service/RTC/MediaType';

import * as transform from 'sdp-transform';

const DEFAULT_NUM_OF_LAYERS = 3;

interface Description {
    type: RTCSdpType;
    sdp: string;
}

interface Options {
    numOfLayers?: number
}

/**
 * This class handles SDP munging for enabling simulcast for local video streams in Unified plan. A set of random SSRCs
 * are generated for the higher layer streams and they are cached for a given mid. The cached SSRCs are then reused on
 * the subsequent iterations while munging the local description. This class also handles imploding of the simulcast
 * SSRCs for remote endpoints into the primary FID group in remote description since Jicofo signals all SSRCs relevant
 * to a given endpoint.
 */
export default class SdpSimulcast {
    private _options: Options;
    private _ssrcCache: Map<string, Array<number>>;

    /**
     * Creates a new instance.
     *
     * @param options
     */
    constructor(options: Options) {
        this._options = options;
        this._ssrcCache = new Map();

        if (!this._options.numOfLayers) {
            this._options.numOfLayers = DEFAULT_NUM_OF_LAYERS;
        }
    }

    /**
     * Updates the given media description using the SSRCs that were cached for the mid associated
     * with the media description and returns the modified media description.
     *
     * @param mLine
     * @returns
     */
     _fillSsrcsFromCache(mLine: transform.MediaDescription) : any {
        const mid = mLine.mid;
        const cachedSsrcs = this._ssrcCache.get(mid);
        const newSsrcs = this._parseSimLayers(mLine);
        const newMsid = this._getSsrcAttribute(mLine, newSsrcs[0], 'msid');
        const newCname = this._getSsrcAttribute(mLine, newSsrcs[0], 'cname');

        mLine.ssrcs = [];
        mLine.ssrcGroups = [];

        for (const ssrc of cachedSsrcs) {
            mLine.ssrcs.push({
                id: ssrc,
                attribute: 'msid',
                value: newMsid
            });
            mLine.ssrcs.push({
                id: ssrc,
                attribute: 'cname',
                value: newCname
            });
        }

        mLine.ssrcGroups.push({
            semantics: 'SIM',
            ssrcs: cachedSsrcs.join(' ')
        });

        return mLine;
    }

    /**
     * Generates a new set of SSRCs for the higher simulcast layers/streams and adds the attributes and SIM group to
     * the given media description and returns the modified media description.
     *
     * @param mLine
     * @param primarySsrc
     * @returns
     */
    _generateNewSsrcsForSimulcast(mLine: transform.MediaDescription, primarySsrc: number) : any {
        const cname = this._getSsrcAttribute(mLine, primarySsrc, 'cname');
        let msid = this._getSsrcAttribute(mLine, primarySsrc, 'msid');
        const addAssociatedAttributes = (mLine: transform.MediaDescription, ssrc: number) => {
            mLine.ssrcs.push({
                id: ssrc,
                attribute: 'cname',
                value: cname
            });
            mLine.ssrcs.push({
                id: ssrc,
                attribute: 'msid',
                value: msid
            });
        }

        // In Unified-plan mode, the a=ssrc lines with the msid attribute are not present (only cname attributes are
        // present) in the answers that Chrome and Safari generate for an offer received from Jicofo. Generate these
        // a=ssrc lines using the msid values from the a=msid line.
        if (!msid) {
            msid = mLine.msid;
            const primarySsrcs = mLine.ssrcs;

            primarySsrcs.forEach(ssrc => {
                mLine.ssrcs.push({
                    id: ssrc.id,
                    attribute: 'msid',
                    value: msid
                });
            })
        }

        // Generate SIM layers.
        const simSsrcs = [];

        for (let i = 0; i < this._options.numOfLayers - 1; ++i) {
            const simSsrc = this._generateSsrc();

            addAssociatedAttributes(mLine, simSsrc);
            simSsrcs.push(simSsrc);
        }

        mLine.ssrcGroups = mLine.ssrcGroups || [];
        mLine.ssrcGroups.push({
            semantics: 'SIM',
            ssrcs: primarySsrc + ' ' + simSsrcs.join(' ')
        });

        return mLine;
    }

    /**
     * Returns a random number to be used for the SSRC.
     *
     * @returns
     */
    _generateSsrc() : number {
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
    _getSsrcAttribute(mLine: transform.MediaDescription, ssrc: number, attributeName: string) : string | undefined {
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
    _parseSimLayers(mLine: transform.MediaDescription) : Array<number> | null {
        const simGroup = mLine.ssrcGroups?.find(group => group.semantics === 'SIM');

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
     * @param description
     * @returns
     */
    mungeLocalDescription(description: Description) : Description {
        if (!description || !description.sdp) {
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
                const fidGroup = media.ssrcGroups.find(group => group.semantics === 'FID');

                if (fidGroup) {
                    primarySsrc = Number(fidGroup.ssrcs.split(' ')[0]);
                }
            }

            if (this._ssrcCache.has(mid)) {
                media = this._fillSsrcsFromCache(media);
            } else {
                media = this._generateNewSsrcsForSimulcast(media, primarySsrc);
                const simulcastSsrcs = this._parseSimLayers(media);

                // Update the SSRCs in the cache so that they can re-used for the same mid again.
                this._ssrcCache.set(mid, simulcastSsrcs);
            }
        }

        return new RTCSessionDescription({
            type: description.type,
            sdp: transform.write(session)
        });
    }

    /**
     * Munges the given media description by removing the SSRCs and related FID groups for the higher layer streams.
     *
     * @param description
     * @returns
     */
    mungeRemoteDescription(description: Description) : Description {
        if (!description || !description.sdp) {
            return description;
        }

        const session = transform.parse(description.sdp);

        for (const media of session.media) {
            if (media.type !== MediaType.VIDEO) {
                continue;
            }

            if (media.direction !== MediaDirection.SENDONLY) {
                continue;
            }

            // Ignore m-lines that do not have any SSRCs or SSRC groups. These are the ones associated with remote
            // sources that have left the call. These will be recycled when a new remote source joins the call.
            if (!media.ssrcGroups?.length || !media?.ssrcs.length) {
                continue;
            }

            // Cache the SSRCs and the source groups.
            const mungedSsrcs = new Set(media.ssrcs.slice());
            const mungedSsrcGroups = new Set(media.ssrcGroups.slice());
            const fidGroups = media.ssrcGroups.filter(group => group.semantics === 'FID');
            const simGroup = media.ssrcGroups.find(group => group.semantics === 'SIM');
            const primarySsrc = simGroup?.ssrcs.split(' ')[0];;

            // When simulcast and RTX are both enabled.
            if (fidGroups.length && simGroup) {
                const fidGroup = fidGroups.find(group => group.ssrcs.includes(primarySsrc));
                const secondarySsrc = fidGroup.ssrcs.split(' ')[1];

                for (const ssrcGroup of media.ssrcGroups) {
                    if (ssrcGroup !== fidGroup) {
                        mungedSsrcGroups.delete(ssrcGroup);
                    }
                }
                for (const ssrc of media.ssrcs) {
                    if (ssrc.id.toString() !== primarySsrc
                        && ssrc.id.toString() !== secondarySsrc) {
                        mungedSsrcs.delete(ssrc);
                    }
                }

            // When simulcast is enabled but RTX is disabled.
            } else if (simGroup) {
                mungedSsrcGroups.delete(simGroup);

                for (const ssrc of media.ssrcs) {
                    if (ssrc.id.toString() !== primarySsrc) {
                        mungedSsrcs.delete(ssrc);
                    }
                }
            }

            media.ssrcs = Array.from(mungedSsrcs);
            media.ssrcGroups = Array.from(mungedSsrcGroups);
        }

        return new RTCSessionDescription ({
            type: description.type,
            sdp: transform.write(session)
        });
    }
}
