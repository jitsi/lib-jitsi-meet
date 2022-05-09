/**
 * Parses the primary SSRC of given SSRC group.
 * @param {object} group the SSRC group object as defined by the 'sdp-transform'
 * @return {Number} the primary SSRC number
 */
export function parsePrimarySSRC(group: object): number;
/**
 * Parses the secondary SSRC of given SSRC group.
 * @param {object} group the SSRC group object as defined by the 'sdp-transform'
 * @return {Number} the secondary SSRC number
 */
export function parseSecondarySSRC(group: object): number;
/**
 * Utility class for SDP manipulation using the 'sdp-transform' library.
 *
 * Typical use usage scenario:
 *
 * const transformer = new SdpTransformWrap(rawSdp);
 * const videoMLine = transformer.selectMedia('video);
 * if (videoMLine) {
 *     videoMLiner.addSSRCAttribute({
 *         id: 2342343,
 *         attribute: "cname",
 *         value: "someCname"
 *     });
 *     rawSdp = transformer.toRawSdp();
 * }
 */
export class SdpTransformWrap {
    /**
     * Creates new instance and parses the raw SDP into objects using
     * 'sdp-transform' lib.
     * @param {string} rawSDP the SDP in raw text format.
     */
    constructor(rawSDP: string);
    parsedSDP: transform.SessionDescription;
    /**
     * Selects all the m-lines from the SDP for a given media type.
     *
     * @param {string} mediaType the name of the media e.g. 'audio', 'video', 'data'.
     * @return {MLineWrap|null} return {@link MLineWrap} instance for the media line or <tt>null</tt> if not found. The
     * object returned references the underlying SDP state held by this <tt>SdpTransformWrap</tt> instance (it's not a
     * copy).
     */
    selectMedia(mediaType: string): MLineWrap | null;
    /**
     * Converts the currently stored SDP state in this instance to raw text SDP
     * format.
     * @return {string}
     */
    toRawSDP(): string;
}
import * as transform from "sdp-transform";
/**
 * A wrapper around 'sdp-transform' media description object which provides
 * utility methods for common SDP/SSRC related operations.
 */
declare class MLineWrap {
    /**
     * Creates new <tt>MLineWrap</t>>
     * @param {Object} mLine the media line object as defined by 'sdp-transform'
     * lib.
     */
    constructor(mLine: any);
    mLine: any;
    /**
     * Setter for the mLine's "ssrcs" array.
     *
     * @param {Array<Object>} ssrcs an array of 'sdp-transform' SSRC attributes
     * objects.
     */
    set ssrcs(arg: any[]);
    /**
     * Getter for the mLine's "ssrcs" array. If the array was undefined an empty
     * one will be preassigned.
     *
     * @return {Array<Object>} an array of 'sdp-transform' SSRC attributes
     * objects.
     */
    get ssrcs(): any[];
    /**
     * Modifies the direction of the underlying media description.
     * @param {string} direction the new direction to be set
     */
    set direction(arg: string);
    /**
     * Returns the direction of the underlying media description.
     * @return {string} the media direction name as defined in the SDP.
     */
    get direction(): string;
    /**
     * Modifies the SSRC groups array of the underlying media description
     * object.
     * @param {Array.<Object>} ssrcGroups
     */
    set ssrcGroups(arg: any[]);
    /**
     * Exposes the SSRC group array of the underlying media description object.
     * @return {Array.<Object>}
     */
    get ssrcGroups(): any[];
    /**
     * Obtains value from SSRC attribute.
     * @param {number} ssrcNumber the SSRC number for which attribute is to be
     * found
     * @param {string} attrName the name of the SSRC attribute to be found.
     * @return {string|undefined} the value of SSRC attribute or
     * <tt>undefined</tt> if no such attribute exists.
     */
    getSSRCAttrValue(ssrcNumber: number, attrName: string): string | undefined;
    /**
     * Removes all attributes for given SSRC number.
     * @param {number} ssrcNum the SSRC number for which all attributes will be
     * removed.
     */
    removeSSRC(ssrcNum: number): void;
    /**
     * Adds SSRC attribute
     * @param {object} ssrcObj the SSRC attribute object as defined in
     * the 'sdp-transform' lib.
     */
    addSSRCAttribute(ssrcObj: object): void;
    /**
     * Finds a SSRC group matching both semantics and SSRCs in order.
     * @param {string} semantics the name of the semantics
     * @param {string} [ssrcs] group SSRCs as a string (like it's defined in
     * SSRC group object of the 'sdp-transform' lib) e.g. "1232546 342344 25434"
     * @return {object|undefined} the SSRC group object or <tt>undefined</tt> if
     * not found.
     */
    findGroup(semantics: string, ssrcs?: string): object | undefined;
    /**
     * Finds all groups matching given semantic's name.
     * @param {string} semantics the name of the semantics
     * @return {Array.<object>} an array of SSRC group objects as defined by
     * the 'sdp-transform' lib.
     */
    findGroups(semantics: string): Array<object>;
    /**
     * Finds all groups matching given semantic's name and group's primary SSRC.
     * @param {string} semantics the name of the semantics
     * @param {number} primarySSRC the primary SSRC number to be matched
     * @return {Object} SSRC group object as defined by the 'sdp-transform' lib.
     */
    findGroupByPrimarySSRC(semantics: string, primarySSRC: number): any;
    /**
     * @param {string|null} msid the media stream id or <tt>null</tt> to match
     * the first SSRC object with any 'msid' value.
     * @return {Object|undefined} the SSRC object as defined by 'sdp-transform'
     * lib.
     */
    findSSRCByMSID(msid: string | null): any | undefined;
    /**
     * Gets the SSRC count for the underlying media description.
     * @return {number}
     */
    getSSRCCount(): number;
    /**
     * Checks whether the underlying media description contains any SSRC groups.
     * @return {boolean} <tt>true</tt> if there are any SSRC groups or
     * <tt>false</tt> otherwise.
     */
    containsAnySSRCGroups(): boolean;
    /**
     * Finds the primary video SSRC.
     * @returns {number|undefined} the primary video ssrc
     * @throws Error if the underlying media description is not a video
     */
    getPrimaryVideoSsrc(): number | undefined;
    /**
     * Obtains RTX SSRC from the underlying video description (the
     * secondary SSRC of the first "FID" group found)
     * @param {number} primarySsrc the video ssrc for which to find the
     * corresponding rtx ssrc
     * @returns {number|undefined} the rtx ssrc (or undefined if there isn't
     * one)
     */
    getRtxSSRC(primarySsrc: number): number | undefined;
    /**
     * Obtains all SSRCs contained in the underlying media description.
     * @return {Array.<number>} an array with all SSRC as numbers.
     */
    getSSRCs(): Array<number>;
    /**
     * Obtains primary video SSRCs.
     * @return {Array.<number>} an array of all primary video SSRCs as numbers.
     * @throws Error if the wrapped media description is not a video.
     */
    getPrimaryVideoSSRCs(): Array<number>;
    /**
     * Dumps all SSRC groups of this media description to JSON.
     */
    dumpSSRCGroups(): string;
    /**
     * Removes all SSRC groups which contain given SSRC number at any position.
     * @param {number} ssrc the SSRC for which all matching groups are to be
     * removed.
     */
    removeGroupsWithSSRC(ssrc: number): void;
    /**
     * Removes groups that match given semantics.
     * @param {string} semantics e.g. "SIM" or "FID"
     */
    removeGroupsBySemantics(semantics: string): void;
    /**
     * Replaces SSRC (does not affect SSRC groups, but only attributes).
     * @param {number} oldSSRC the old SSRC number
     * @param {number} newSSRC the new SSRC number
     */
    replaceSSRC(oldSSRC: number, newSSRC: number): void;
    /**
     * Adds given SSRC group to this media description.
     * @param {object} group the SSRC group object as defined by
     * the 'sdp-transform' lib.
     */
    addSSRCGroup(group: object): void;
}
export {};
