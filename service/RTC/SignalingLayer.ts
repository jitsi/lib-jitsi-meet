import Listenable from '../../modules/util/Listenable';

import { MediaType } from './MediaType';
import { VideoType } from './VideoType';

export type EndpointId = string;
export type SourceName = string;

export interface ISourceInfo {
    muted?: boolean;
    sourceName: SourceName;
    videoType?: string;
}

export interface IPeerMediaInfo {
    muted: boolean;
    videoType?: string;
}
/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Generates a source name.
 *
 * @param {EndpointId} endpointId - Jitsi Endpoint Id.
 * @param {MediaType} mediaType - the media type string.
 * @param {number} trackIdx - Track index (or sender idx? - to be figured out) starting from 0.
 * @returns {SourceName} eg. endpointA-v0
 */
export function getSourceNameForJitsiTrack(endpointId: EndpointId, mediaType: MediaType, trackIdx: number): SourceName {
    const firstLetterOfMediaType = mediaType.substring(0, 1);

    return `${endpointId}-${firstLetterOfMediaType}${trackIdx}`;
}

/**
 * Extracts MediaType from give source name (must be in the correct format as generated by
 * {@link getSourceNameForJitsiTrack}).
 *
 * @param {SourceName} sourceName - the source name.
 * @returns {MediaType}
 */
export function getMediaTypeFromSourceName(sourceName: SourceName): MediaType {
    const firstLetterOfMediaTypeIdx = sourceName.lastIndexOf('-') + 1;

    if (firstLetterOfMediaTypeIdx <= 0) {
        throw new Error(`Invalid source name: ${sourceName}`);
    }

    const firstLetterOfMediaType = sourceName.substr(firstLetterOfMediaTypeIdx, 1);

    for (const type of Object.values(MediaType)) {
        if (type.substr(0, 1) === firstLetterOfMediaType) {
            return type;
        }
    }

    throw new Error(`Invalid source name: ${sourceName}`);
}

/**
 * Extracts source index (zero based) from a given source name (must be in the correct format as generated by
 * {@link getSourceNameForJitsiTrack}).
 *
 * @param {SourceName} sourceName - the source name, eg. endpointA-v0.
 * @returns {number}
 */
export function getSourceIndexFromSourceName(sourceName: SourceName): number {
    const nameParts = sourceName.split('-');
    const trackIdx = Number(nameParts[nameParts.length - 1].substring(1));

    if (Number.isNaN(trackIdx)) {
        throw new Error(`Failed to parse track idx for source name: ${sourceName}`);
    }

    return trackIdx;
}

/**
 * An object that carries the info about specific media type advertised by
 * participant in the signaling channel.
 * @typedef {Object} IPeerMediaInfo
 * @property {boolean} muted indicates if the media is currently muted
 * @property {VideoType|undefined} videoType the type of the video if applicable
 */

/**
 * Interface used to expose the information carried over the signaling channel
 * which is not available to the RTC module in the media SDP.
 *
 * @interface SignalingLayer
 */
export default class SignalingLayer extends Listenable {
    /**
     * Obtains the info about given media advertised in the MUC presence of
     * the participant identified by the given MUC JID.
     * @param {string} owner the MUC jid of the participant for whom
     * {@link PeerMediaInfo} will be obtained.
     * @param {MediaType} mediaType the type of the media for which presence
     * @param {SourceName} sourceName - The name of the source for which the info is to be obtained.
     * info will be obtained.
     * @return {IPeerMediaInfo|null} presenceInfo an object with media presence
     * info or <tt>null</tt> either if there is no presence available for given
     * JID or if the media type given is invalid.
     *
     * @deprecated This method is to be replaced with getPeerSourceInfo.
     */
    getPeerMediaInfo(
            owner: string, mediaType: MediaType, sourceName: SourceName
    ): IPeerMediaInfo | null { // eslint-disable-line no-unused-vars
        throw new Error('not implemented');
    }

    /**
     * Obtains the info about a source for given name and endpoint ID.
     * @param {EndpointId} owner - The owner's endpoint ID.
     * @param {SourceName} sourceName - The name of the source for which the info is to be obtained.
     * @returns {ISourceInfo | undefined}
     */
    getPeerSourceInfo(
            owner: EndpointId, sourceName: SourceName
    ): ISourceInfo | undefined { // eslint-disable-line no-unused-vars
        throw new Error('not implemented');
    }

    /**
     * Obtains the endpoint ID for given SSRC.
     * @param {number} ssrc the SSRC number.
     * @return {string|null} the endpoint ID for given media SSRC.
     */
    getSSRCOwner(ssrc: number): string | null { // eslint-disable-line no-unused-vars
        throw new Error('not implemented');
    }

    /**
     * Obtains the source name for given SSRC.
     * @param {number} ssrc the track's SSRC identifier.
     * @returns {SourceName | undefined} the track's source name.
     */
    getTrackSourceName(ssrc: number): SourceName | undefined { // eslint-disable-line no-unused-vars
        throw new Error('not implemented');
    }

    /**
     * Removes the association between a given SSRC and its current owner so that it can re-used when the SSRC gets
     * remapped to another source from a different endpoint.
     * @param {number} ssrc a list of SSRCs.
     */
    removeSSRCOwners(ssrcList: number[]): void { // eslint-disable-line no-unused-vars
    }

    /**
     * Set an SSRC owner.
     *
     * @param {number} ssrc - An SSRC to be owned.
     * @param {string} endpointId - Owner's ID (MUC nickname).
     * @param {string} sourceName - The related source name.
     * @throws TypeError if <tt>ssrc</tt> is not a number.
     */
    setSSRCOwner(ssrc: number, endpointId: string, sourceName: string): void { // eslint-disable-line no-unused-vars
    }

    /**
     * Adjusts muted status of given track.
     *
     * @param {SourceName} sourceName - the name of the track's source.
     * @param {boolean} muted - the new muted status.
     * @returns {boolean}
     */
    setTrackMuteStatus(sourceName: SourceName, muted: boolean) { // eslint-disable-line no-unused-vars
    }

    /**
     * Sets track's video type.
     * @param {SourceName} sourceName - the track's source name.
     * @param {VideoType} videoType - the new video type.
     * @returns {boolean}
     */
    setTrackVideoType(sourceName: SourceName, videoType: VideoType) { // eslint-disable-line no-unused-vars
    }

    /**
     * Removes the SSRCs associated with a given endpoint from the SSRC owners.
     *
     * @param {string} id endpoint id of the participant leaving the call.
     * @returns {void}
     */
    updateSsrcOwnersOnLeave(id: string): void { // eslint-disable-line no-unused-vars
    }
}
