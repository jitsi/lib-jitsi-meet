import * as transform from 'sdp-transform';

/**
 * Parses the primary SSRC of given SSRC group.
 * @param {object} group the SSRC group object as defined by the 'sdp-transform'
 * @return {Number} the primary SSRC number
 */
export function parsePrimarySSRC(group) {
    return parseInt(group.ssrcs.split(' ')[0], 10);
}

/**
 * Parses the secondary SSRC of given SSRC group.
 * @param {object} group the SSRC group object as defined by the 'sdp-transform'
 * @return {Number} the secondary SSRC number
 */
export function parseSecondarySSRC(group) {
    return parseInt(group.ssrcs.split(' ')[1], 10);
}

/**
 * Tells how many distinct SSRCs are contained in given media line.
 * @param {Object} mLine the media line object as defined by 'sdp-transform' lib
 * @return {number}
 */
function _getSSRCCount(mLine) {
    if (!mLine.ssrcs) {
        return 0;
    }

    return mLine.ssrcs
        .map(ssrcInfo => ssrcInfo.id)
        .filter((ssrc, index, array) => array.indexOf(ssrc) === index)
        .length;
}

/**
 * A wrapper around 'sdp-transform' media description object which provides
 * utility methods for common SDP/SSRC related operations.
 */
class MLineWrap {

    /**
     * Creates new <tt>MLineWrap</t>>
     * @param {Object} mLine the media line object as defined by 'sdp-transform'
     * lib.
     */
    constructor(mLine) {
        if (!mLine) {
            throw new Error('mLine is undefined');
        }

        this.mLine = mLine;
    }

    /**
     * Getter for the mLine's "ssrcs" array. If the array was undefined an empty
     * one will be preassigned.
     *
     * @return {Array<Object>} an array of 'sdp-transform' SSRC attributes
     * objects.
     */
    get ssrcs() {
        if (!this.mLine.ssrcs) {
            this.mLine.ssrcs = [];
        }

        return this.mLine.ssrcs;
    }

    /**
     * Setter for the mLine's "ssrcs" array.
     *
     * @param {Array<Object>} ssrcs an array of 'sdp-transform' SSRC attributes
     * objects.
     */
    set ssrcs(ssrcs) {
        this.mLine.ssrcs = ssrcs;
    }

    /**
     * Returns the direction of the underlying media description.
     * @return {string} the media direction name as defined in the SDP.
     */
    get direction() {
        return this.mLine.direction;
    }

    /**
     * Modifies the direction of the underlying media description.
     * @param {string} direction the new direction to be set
     */
    set direction(direction) {
        this.mLine.direction = direction;
    }

    /**
     * Exposes the SSRC group array of the underlying media description object.
     * @return {Array.<Object>}
     */
    get ssrcGroups() {
        if (!this.mLine.ssrcGroups) {
            this.mLine.ssrcGroups = [];
        }

        return this.mLine.ssrcGroups;
    }

    /**
     * Modifies the SSRC groups array of the underlying media description
     * object.
     * @param {Array.<Object>} ssrcGroups
     */
    set ssrcGroups(ssrcGroups) {
        this.mLine.ssrcGroups = ssrcGroups;
    }

    /**
     * Obtains value from SSRC attribute.
     * @param {number} ssrcNumber the SSRC number for which attribute is to be
     * found
     * @param {string} attrName the name of the SSRC attribute to be found.
     * @return {string|undefined} the value of SSRC attribute or
     * <tt>undefined</tt> if no such attribute exists.
     */
    getSSRCAttrValue(ssrcNumber, attrName) {
        const attribute = this.ssrcs.find(
            ssrcObj => ssrcObj.id === ssrcNumber
            && ssrcObj.attribute === attrName);


        return attribute && attribute.value;
    }

    /**
     * Removes all attributes for given SSRC number.
     * @param {number} ssrcNum the SSRC number for which all attributes will be
     * removed.
     */
    removeSSRC(ssrcNum) {
        if (!this.mLine.ssrcs || !this.mLine.ssrcs.length) {
            return;
        }

        this.mLine.ssrcs
            = this.mLine.ssrcs.filter(ssrcObj => ssrcObj.id !== ssrcNum);
    }

    /**
     * Adds SSRC attribute
     * @param {object} ssrcObj the SSRC attribute object as defined in
     * the 'sdp-transform' lib.
     */
    addSSRCAttribute(ssrcObj) {
        this.ssrcs.push(ssrcObj);
    }

    /**
     * Finds a SSRC group matching both semantics and SSRCs in order.
     * @param {string} semantics the name of the semantics
     * @param {string} [ssrcs] group SSRCs as a string (like it's defined in
     * SSRC group object of the 'sdp-transform' lib) e.g. "1232546 342344 25434"
     * @return {object|undefined} the SSRC group object or <tt>undefined</tt> if
     * not found.
     */
    findGroup(semantics, ssrcs) {
        return this.ssrcGroups.find(
            group =>
                group.semantics === semantics
                    && (!ssrcs || ssrcs === group.ssrcs));
    }

    /**
     * Finds all groups matching given semantic's name.
     * @param {string} semantics the name of the semantics
     * @return {Array.<object>} an array of SSRC group objects as defined by
     * the 'sdp-transform' lib.
     */
    findGroups(semantics) {
        return this.ssrcGroups.filter(
            group => group.semantics === semantics);
    }

    /**
     * Finds all groups matching given semantic's name and group's primary SSRC.
     * @param {string} semantics the name of the semantics
     * @param {number} primarySSRC the primary SSRC number to be matched
     * @return {Object} SSRC group object as defined by the 'sdp-transform' lib.
     */
    findGroupByPrimarySSRC(semantics, primarySSRC) {
        return this.ssrcGroups.find(
            group => group.semantics === semantics
                && parsePrimarySSRC(group) === primarySSRC);
    }

    /**
     * @param {string|null} msid the media stream id or <tt>null</tt> to match
     * the first SSRC object with any 'msid' value.
     * @return {Object|undefined} the SSRC object as defined by 'sdp-transform'
     * lib.
     */
    findSSRCByMSID(msid) {
        return this.ssrcs.find(
            ssrcObj => ssrcObj.attribute === 'msid'
                && (msid === null || ssrcObj.value === msid));
    }

    /**
     * Gets the SSRC count for the underlying media description.
     * @return {number}
     */
    getSSRCCount() {
        return _getSSRCCount(this.mLine);
    }

    /**
     * Checks whether the underlying media description contains any SSRC groups.
     * @return {boolean} <tt>true</tt> if there are any SSRC groups or
     * <tt>false</tt> otherwise.
     */
    containsAnySSRCGroups() {
        return this.mLine.ssrcGroups !== undefined;
    }

    /**
     * Finds the primary video SSRC.
     * @returns {number|undefined} the primary video ssrc
     * @throws Error if the underlying media description is not a video
     */
    getPrimaryVideoSsrc() {
        const mediaType = this.mLine.type;

        if (mediaType !== 'video') {
            throw new Error(
                `getPrimarySsrc doesn't work with '${mediaType}'`);
        }

        const numSsrcs = _getSSRCCount(this.mLine);

        if (numSsrcs === 1) {
            // Not using "ssrcs" getter on purpose here
            return this.mLine.ssrcs[0].id;
        }

        // Look for a SIM, FID, or FEC-FR group
        if (this.mLine.ssrcGroups) {
            const simGroup = this.findGroup('SIM');

            if (simGroup) {
                return parsePrimarySSRC(simGroup);
            }
            const fidGroup = this.findGroup('FID');

            if (fidGroup) {
                return parsePrimarySSRC(fidGroup);
            }
            const fecGroup = this.findGroup('FEC-FR');

            if (fecGroup) {
                return parsePrimarySSRC(fecGroup);
            }
        }

    }

    /**
     * Obtains RTX SSRC from the underlying video description (the
     * secondary SSRC of the first "FID" group found)
     * @param {number} primarySsrc the video ssrc for which to find the
     * corresponding rtx ssrc
     * @returns {number|undefined} the rtx ssrc (or undefined if there isn't
     * one)
     */
    getRtxSSRC(primarySsrc) {
        const fidGroup = this.findGroupByPrimarySSRC('FID', primarySsrc);


        return fidGroup && parseSecondarySSRC(fidGroup);
    }

    /**
     * Obtains all SSRCs contained in the underlying media description.
     * @return {Array.<number>} an array with all SSRC as numbers.
     */
    getSSRCs() {
        return this.ssrcs
            .map(ssrcInfo => ssrcInfo.id)
            .filter((ssrc, index, array) => array.indexOf(ssrc) === index);
    }

    /**
     * Obtains primary video SSRCs.
     * @return {Array.<number>} an array of all primary video SSRCs as numbers.
     * @throws Error if the wrapped media description is not a video.
     */
    getPrimaryVideoSSRCs() {
        const mediaType = this.mLine.type;

        if (mediaType !== 'video') {
            throw new Error(
                `getPrimaryVideoSSRCs doesn't work with ${mediaType}`);
        }

        const videoSSRCs = this.getSSRCs();

        for (const ssrcGroupInfo of this.ssrcGroups) {
            // Right now, FID and FEC-FR groups are the only ones we parse to
            // disqualify streams.  If/when others arise we'll
            // need to add support for them here
            if (ssrcGroupInfo.semantics === 'FID'
                    || ssrcGroupInfo.semantics === 'FEC-FR') {
                // secondary streams should be filtered out
                const secondarySsrc = parseSecondarySSRC(ssrcGroupInfo);

                videoSSRCs.splice(
                    videoSSRCs.indexOf(secondarySsrc), 1);
            }
        }

        return videoSSRCs;
    }

    /**
     * Dumps all SSRC groups of this media description to JSON.
     */
    dumpSSRCGroups() {
        return JSON.stringify(this.mLine.ssrcGroups);
    }

    /**
     * Removes all SSRC groups which contain given SSRC number at any position.
     * @param {number} ssrc the SSRC for which all matching groups are to be
     * removed.
     */
    removeGroupsWithSSRC(ssrc) {
        if (!this.mLine.ssrcGroups) {
            return;
        }

        this.mLine.ssrcGroups = this.mLine.ssrcGroups
            .filter(groupInfo => groupInfo.ssrcs.indexOf(`${ssrc}`) === -1);
    }

    /**
     * Removes groups that match given semantics.
     * @param {string} semantics e.g. "SIM" or "FID"
     */
    removeGroupsBySemantics(semantics) {
        if (!this.mLine.ssrcGroups) {
            return;
        }

        this.mLine.ssrcGroups
            = this.mLine.ssrcGroups
                .filter(groupInfo => groupInfo.semantics !== semantics);
    }

    /**
     * Replaces SSRC (does not affect SSRC groups, but only attributes).
     * @param {number} oldSSRC the old SSRC number
     * @param {number} newSSRC the new SSRC number
     */
    replaceSSRC(oldSSRC, newSSRC) {
        if (this.mLine.ssrcs) {
            this.mLine.ssrcs.forEach(ssrcInfo => {
                if (ssrcInfo.id === oldSSRC) {
                    ssrcInfo.id = newSSRC;
                }
            });
        }
    }

    /**
     * Adds given SSRC group to this media description.
     * @param {object} group the SSRC group object as defined by
     * the 'sdp-transform' lib.
     */
    addSSRCGroup(group) {
        this.ssrcGroups.push(group);
    }
}

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
    constructor(rawSDP) {
        this.parsedSDP = transform.parse(rawSDP);
    }

    /**
     * Selects all the m-lines from the SDP for a given media type.
     *
     * @param {string} mediaType the name of the media e.g. 'audio', 'video', 'data'.
     * @return {MLineWrap|null} return {@link MLineWrap} instance for the media line or <tt>null</tt> if not found. The
     * object returned references the underlying SDP state held by this <tt>SdpTransformWrap</tt> instance (it's not a
     * copy).
     */
    selectMedia(mediaType) {
        const selectedMLines = this.parsedSDP.media
            .filter(mLine => mLine.type === mediaType)
            .map(mLine => new MLineWrap(mLine));

        return selectedMLines ?? null;
    }

    /**
     * Converts the currently stored SDP state in this instance to raw text SDP
     * format.
     * @return {string}
     */
    toRawSDP() {
        return transform.write(this.parsedSDP);
    }
}
