
export default class SdpTransformUtil {

    /**
     * Parses the primary SSRC of given SSRC group.
     * @param {object} group the SSRC group object as defined by
     * the 'sdp-transform'
     * @return {Number} the primary SSRC number
     */
    static parsePrimarySSRC(group) {
        return parseInt(group.ssrcs.split(" ")[0]);
    }

    /**
     * Parses the secondary SSRC of given SSRC group.
     * @param {object} group the SSRC group object as defined by
     * the 'sdp-transform'
     * @return {Number} the secondary SSRC number
     */
    static parseSecondarySSRC(group) {
        return parseInt(group.ssrcs.split(" ")[1]);
    }

    static findGroup(mLine, groupSemantics, ssrcs) {
        return mLine.ssrcGroups && mLine.ssrcGroups.find(
                (group) => group.semantics === groupSemantics
                    && !ssrcs || ssrcs === group.ssrcs);
    }

    static findGroupByPrimarySSRC(mLine, groupSemantics, primarySsrc) {
        return mLine.ssrcGroups && mLine.ssrcGroups.find(
                (group) => group.semantics === groupSemantics
                    && SdpTransformUtil.parsePrimarySSRC(group)
                        === primarySsrc);
    }

    static getSSRCCount(mLine) {
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
     * Selects the first media SDP of given name.
     * @param {string} mediaType the name of the media e.g. 'audio', 'video',
     * 'data'.
     * @return {boolean} <tt>true</tt> if the media of given type has been found
     * and selected or <tt>false</tt> otherwise.
     */
    static getMLine(parsedSDP, mediaType) {
        return parsedSDP.media.find(mLine => mLine.type === mediaType);
    }

    /**
     * Checks whether the currently selected media description contains given
     * SSRC number
     * @param {string} ssrcNumber
     * @return {boolean} <tt>true</tt> if given SSRC has been found or
     * <tt>false</tt> otherwise.
     */
    static containsSSRC(mLine, ssrcNumber) {
        return mLine.ssrcs.find(ssrcObj  => ssrcObj.id === ssrcNumber);
    }

    /**
     * Obtains value from SSRC attribute.
     * @param {number} ssrcNumber the SSRC number for whcih attribute is to be
     * found
     * @param {string} attrName the name of the SSRC attribute to be found.
     * @return {string|undefined} the value of SSRC attribute or
     * <tt>undefined</tt> if no such attribute exists.
     */
    static getSSRCAttrValue(mLine, ssrcNumber, attrName) {
        const attribute = mLine.ssrcs.find(
            ssrcObj => ssrcObj.id === ssrcNumber
                && ssrcObj.attribute === attrName);
        return attribute ? attribute.value : undefined;
    }

    /**
     * Removes all attributes for given SSRC number.
     * @param {number} ssrcNum the SSRC number for which all attributes will be
     * removed.
     */
    static removeSSRC(mLine, ssrcNum) {
        mLine.ssrcs = mLine.ssrcs.filter(ssrcObj => ssrcObj.id !== ssrcNum);
    }

    /**
     * Adds SSRC attribute
     * @param {object} ssrcObj the SSRC attribute object as defined in
     * the 'sdp-transform' lib.
     */
    static addSSRCAttribute(mLine, ssrcObj) {
        (mLine.ssrcs || (mLine.ssrcs = [])).push(ssrcObj);
    }

    /**
     * Finds all groups matching given semantic's name.
     * @param {string} semantics the name of the semantics
     * @return {Array.<object>} an array of SSRC group objects as defined by
     * the 'sdp-transform' lib.
     */
    static findGroups(mLine, semantics) {
        return mLine.ssrcGroups
            && mLine.ssrcGroups.filter(group => group.semantics === semantics);
    }

    /**
     * Finds the primary video SSRC. Currently selected media type must be
     * 'video'.
     * @returns {number|undefined} the primary video ssrc
     */
    static getPrimaryVideoSsrc (mLine) {

        let numSsrcs = SdpTransformUtil.getSSRCCount(mLine);
        if (numSsrcs === 1) {
            // Not using _ssrcs on purpose here
            return mLine.ssrcs[0].id;
        } else {
            // Look for a SIM or FID group
            if (mLine.ssrcGroups) {
                let simGroup = SdpTransformUtil.findGroup(mLine, "SIM");
                if (simGroup) {
                    return SdpTransformUtil.parsePrimarySSRC(simGroup);
                }
                let fidGroup = this.findGroup("FID");
                if (fidGroup) {
                    return SdpTransformUtil.parsePrimarySSRC(fidGroup);
                }
            }
        }
    }

    /**
     * Obtains RTX SSRC from the currently selected video media line (the
     * secondary SSRC of the first "FID" group found)
     * @param {number} primarySsrc the video ssrc for which to find the
     * corresponding rtx ssrc
     * @returns {number|undefined} the rtx ssrc (or undefined if there isn't
     * one)
     */
    static getRtxSSRC (mLine, primarySsrc) {
        let fidGroup
            = SdpTransformUtil.findGroupByPrimarySSRC(
                mLine, "FID", primarySsrc);
        return fidGroup
            ? SdpTransformUtil.parseSecondarySSRC(fidGroup) : undefined;
    }

    /**
     * Obtains all SSRCs of the currently selected media line.
     * @return {Array.<number>} an array with all SSRC as numbers.
     */
    static getSSRCs (mLine) {
        if (!mLine.ssrcs) {
            return [];
        } else {
            return mLine.ssrcs.map(ssrcInfo => ssrcInfo.id)
                .filter(
                    (ssrc, index, array) => array.indexOf(ssrc) === index);
        }
    }

    /**
     * Obtains primary video SSRCs (video media line must be selected).
     * @return {Array.<number>} an array of all primary video SSRCs as numbers.
     */
    static getPrimaryVideoSSRCs (mLine) {
        const mediaType = mLine.type;

        if (mediaType !== 'video') {
            throw new Error(
                "getPrimaryVideoSSRCs doesn't work with '" + mediaType +"'");
        }

        let videoSSRCs = SdpTransformUtil.getSSRCs(mLine);

        if (!mLine.ssrcGroups) {
            return videoSSRCs;
        }

        for (const ssrcGroupInfo of mLine.ssrcGroups) {
            // Right now, FID groups are the only ones we parse to
            // disqualify streams.  If/when others arise we'll
            // need to add support for them here
            if (ssrcGroupInfo.semantics === "FID") {
                // secondary FID streams should be filtered out
                let secondarySsrc
                    = SdpTransformUtil.parseSecondarySSRC(ssrcGroupInfo);
                videoSSRCs.splice(
                    videoSSRCs.indexOf(secondarySsrc), 1);
            }
        }
        return videoSSRCs;
    }

    /**
     * Dumps all SSRC groups of the currently selected media line to JSON.
     */
    static dumpSSRCGroups(mLine) {
        return JSON.stringify(mLine.ssrcGroups);
    }

    /**
     * Removes all SSRC groups which contain given SSRC number at any position.
     * @param {number} ssrc the SSRC for which all matching groups are to be
     * removed.
     */
    static removeGroupsWithSSRC(mLine, ssrc) {
        if (!mLine.ssrcGroups) {
            return;
        }

        mLine.ssrcGroups
            = mLine.ssrcGroups
                .filter(groupInfo => groupInfo.ssrcs.indexOf(ssrc + "") === -1);
    }

    /**
     * Removes groups that match given semantics.
     * @param {string} semantics e.g. "SIM" or "FID"
     */
    static removeGroupsBySemantics(mLine, semantics) {
        if (mLine.ssrcGroups) {
            mLine.ssrcGroups
                = mLine.ssrcGroups
                       .filter(groupInfo => groupInfo.semantics !== semantics);
        }
    }

    /**
     * Replaces SSRC (does not affect SSRC groups, but only attributes).
     * @param {number} oldSSRC the old SSRC number
     * @param {number} newSSRC the new SSRC number
     */
    static replaceSSRC(mLine, oldSSRC, newSSRC) {
        if (mLine.ssrcs) {
            mLine.ssrcs.forEach(ssrcInfo => {
                if (ssrcInfo.id === oldSSRC) {
                    ssrcInfo.id = newSSRC;
                }
            });
        }
    }

    /**
     * Adds given SSRC group to the currently selected media.
     * @param {object} group the SSRC group object as defined by
     * the 'sdp-transform' lib.
     */
    static addSSRCGroup(mLine, group) {
        if (!mLine.ssrcGroups) {
            mLine.ssrcGroups = [];
        }
        mLine.ssrcGroups.push(group);
    }
}