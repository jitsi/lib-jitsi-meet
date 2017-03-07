import * as transform from 'sdp-transform';

/**
 * Parses the primary SSRC of given SSRC group.
 * @param {object} group the SSRC group object as defined by the 'sdp-transform'
 * @return {Number} the primary SSRC number
 */
export function parsePrimarySSRC(group) {
    return parseInt(group.ssrcs.split(" ")[0]);
}

/**
 * Parses the secondary SSRC of given SSRC group.
 * @param {object} group the SSRC group object as defined by the 'sdp-transform'
 * @return {Number} the secondary SSRC number
 */
export function parseSecondarySSRC(group) {
    return parseInt(group.ssrcs.split(" ")[1]);
}

/**
 * Finds SSRC group for given semantics and SSRCs (optional)
 * @param {Object} mLine the media line object as defined by 'sdp-transform' lib
 * @param {string} groupSemantics
 * @param {string} ssrcs the list of group SSRCs as a string e.g. "10 20 30"
 * @return {Object|undefined} an SSRC group object as defined by
 * the 'sdp-transform' lib which matches given criteria or <tt>undefined</tt>
 * otherwise.
 */
function findGroup(mLine, groupSemantics, ssrcs) {
    return mLine.ssrcGroups && mLine.ssrcGroups.find(
            group => group.semantics === groupSemantics
                            && !ssrcs || ssrcs === group.ssrcs);
}

/**
 * Finds group that matches given smenatics and primary SSRC.
 * @param {Object} mLine the media line object as defined by 'sdp-transform' lib
 * @param {string} groupSemantics
 * @param {number} primarySsrc
 * @return {Object|undefined} an SSRC group object as defined by
 * the 'sdp-transform' lib which matches given criteria or <tt>undefined</tt>
 * otherwise.
 */
function findGroupByPrimarySSRC(mLine, groupSemantics, primarySsrc) {
    return mLine.ssrcGroups && mLine.ssrcGroups.find(
            group => group.semantics === groupSemantics
                            && parsePrimarySSRC(group) === primarySsrc);
}

/**
 * Tells how many distinct SSRCs are contained in given media line.
 * @param {Object} mLine the media line object as defined by 'sdp-transform' lib
 * @return {number}
 */
function getSSRCCount(mLine) {
    if (!mLine.ssrcs) {
        return 0;
    } else {
        return mLine.ssrcs
            .map(ssrcInfo => ssrcInfo.id)
            .filter((ssrc, index, array) => array.indexOf(ssrc) === index)
            .length;
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
     * Selects the first media SDP of given name.
     * @param {string} mediaType the name of the media e.g. 'audio', 'video',
     * 'data'.
     * @return {MLineWrap|null} return {@link MLineWrap} instance for the media
     * line or <tt>null</tt> if not found. The object returned references
     * the underlying SDP state held by this <tt>SdpTransformWrap</tt> instance
     * (it's not a copy).
     */
    selectMedia(mediaType) {
        const selectedMLine
            = this.parsedSDP.media.find(mLine => mLine.type === mediaType);
        return selectedMLine ? new MLineWrap(selectedMLine) : null;
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
            throw new Error("mLine is undefined");
        }

        this.mLine = mLine;
    }

    get _ssrcs () {
        if (!this.mLine.ssrcs) {
            this.mLine.ssrcs = [];
        }
        return this.mLine.ssrcs;
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
    set direction (direction) {
        this.mLine.direction = direction;
    }

    /**
     * Checks whether the underlying media description contains given SSRC
     * number.
     * @param {string} ssrcNumber
     * @return {boolean} <tt>true</tt> if given SSRC has been found or
     * <tt>false</tt> otherwise.
     */
    containsSSRC(ssrcNumber) {
        return !!this._ssrcs.find(
            ssrcObj => { return ssrcObj.id == ssrcNumber; });
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
        const attribute = this._ssrcs.find(
            ssrcObj => ssrcObj.id == ssrcNumber
            && ssrcObj.attribute === attrName);
        return attribute ? attribute.value : undefined;
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

        // FIXME it should be possible to remove those values more efficiently
        // than with splice ?
        this.mLine.ssrcs = this.mLine.ssrcs
            .filter(ssrcObj => ssrcObj.id !== ssrcNum);
    }

    /**
     * Adds SSRC attribute
     * @param {object} ssrcObj the SSRC attribute object as defined in
     * the 'sdp-transform' lib.
     */
    addSSRCAttribute(ssrcObj) {
        this._ssrcs.push(ssrcObj);
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
        return findGroup(this.mLine, semantics, ssrcs);
    }

    /**
     * Finds all groups matching given semantic's name.
     * @param {string} semantics the name of the semantics
     * @return {Array.<object>} an array of SSRC group objects as defined by
     * the 'sdp-transform' lib.
     */
    findGroups(semantics) {
        return this.mLine.ssrcGroups.filter(
            group => group.semantics === semantics);
    }

    /**
     * Finds all groups matching given semantic's name and group's primary SSRC.
     * @param {string} semantics the name of the semantics
     * @param {number} primarySSRC the primary SSRC number to be matched
     * @return {Array.<object>} an array of SSRC group objects as defined by
     * the 'sdp-transform' lib.
     */
    findGroupByPrimarySSRC(semantics, primarySSRC) {
        return findGroupByPrimarySSRC(
            this.mLine, semantics, primarySSRC);
    }

    /**
     * Gets the SSRC count for the underlying media description.
     * @return {number}
     */
    getSSRCCount() {
        return getSSRCCount(this.mLine);
    }

    /**
     * Checks whether the underlying media description contains any SSRC groups.
     * @return {boolean} <tt>true</tt> if there are any SSRC groups or
     * <tt>false</tt> otherwise.
     */
    containsAnySSRCGroups() {
        return !!this.mLine.ssrcGroups;
    }

    /**
     * Finds the primary video SSRC.
     * @returns {number|undefined} the primary video ssrc
     * @throws Error if the underlying media description is not a video
     */
    getPrimaryVideoSsrc () {
        const mediaType = this.mLine.type;

        if (mediaType !== 'video') {
            throw new Error(
                "getPrimarySsrc doesn't work with '" + mediaType +"'");
        }

        const numSsrcs = getSSRCCount(this.mLine);
        if (numSsrcs === 1) {
            // Not using _ssrcs on purpose here
            return this.mLine.ssrcs[0].id;
        } else {
            // Look for a SIM or FID group
            if (this.mLine.ssrcGroups) {
                const simGroup = this.findGroup("SIM");
                if (simGroup) {
                    return parsePrimarySSRC(simGroup);
                }
                const fidGroup = this.findGroup("FID");
                if (fidGroup) {
                    return parsePrimarySSRC(fidGroup);
                }
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
    getRtxSSRC (primarySsrc) {
        const fidGroup = this.findGroupByPrimarySSRC("FID", primarySsrc);
        return fidGroup && parseSecondarySSRC(fidGroup);
    }

    /**
     * Obtains all SSRCs contained in the underlying media description.
     * @return {Array.<number>} an array with all SSRC as numbers.
     */
    getSSRCs () {
        return this._ssrcs
            .map(ssrcInfo => ssrcInfo.id)
            .filter((ssrc, index, array) => array.indexOf(ssrc) === index);
    }

    /**
     * Obtains primary video SSRCs.
     * @return {Array.<number>} an array of all primary video SSRCs as numbers.
     * @throws Error if the wrapped media description is not a video.
     */
    getPrimaryVideoSSRCs () {
        const mediaType = this.mLine.type;

        if (mediaType !== 'video') {
            throw new Error(
                `getPrimaryVideoSSRCs doesn't work with ${mediaType}`);
        }

        const videoSSRCs = this.getSSRCs();

        this.forEachSSRCGroup(ssrcGroupInfo => {
            // Right now, FID groups are the only ones we parse to
            // disqualify streams.  If/when others arise we'll
            // need to add support for them here
            if (ssrcGroupInfo.semantics === "FID") {
                // secondary FID streams should be filtered out
                const secondarySsrc = parseSecondarySSRC(ssrcGroupInfo);
                videoSSRCs.splice(
                    videoSSRCs.indexOf(secondarySsrc), 1);
            }
        });
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
            .filter(groupInfo => groupInfo.ssrcs.indexOf(ssrc + "") === -1);
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
     * Executes given call back for each SSRC group
     * @param {function(object)} callback
     */
    forEachSSRCGroup(callback) {
        if (this.mLine.ssrcGroups) {
            this.mLine.ssrcGroups.forEach(callback);
        }
    }
    /**
     * Adds given SSRC group to this media description.
     * @param {object} group the SSRC group object as defined by
     * the 'sdp-transform' lib.
     */
    addSSRCGroup(group) {
        if (!this.mLine.ssrcGroups) {
            this.mLine.ssrcGroups = [];
        }
        this.mLine.ssrcGroups.push(group);
    }
}