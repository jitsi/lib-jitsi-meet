/* Copyright @ 2015 - Present, 8x8 Inc
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import clonedeep from 'lodash.clonedeep';

import transform from './transform.js';

const PLAN_B_MIDS = [ 'audio', 'video', 'data' ];
const findSimGroup = ssrcGroup => ssrcGroup.find(grp => grp.semantics === 'SIM');
const findFidGroup = ssrcGroup => ssrcGroup.find(grp => grp.semantics === 'FID');

/**
 * Add the ssrcs of the SIM group and their corresponding FID group ssrcs
 * to the m-line.
 * @param {Object} mLine - The m-line to which ssrcs have to be added.
 * @param {Object} simGroup - The SIM group whose ssrcs have to be added to
 * the m-line.
 * @param {Object} sourceGroups - inverted source-group map.
 * @param {Array<Object>} sourceList - array containing all the sources.
 */
function addSimGroupSources(mLine, simGroup, sourceGroups, sourceList) {
    if (!mLine || !simGroup) {
        return;
    }
    const findSourcebyId = src => sourceList.find(source => source.id.toString() === src);

    simGroup.ssrcs.forEach(src => {
        mLine.sources.push(findSourcebyId(src));

        // find the related FID group member for this ssrc.
        const relatedFidGroup = sourceGroups[parseInt(src, 10)].find(grp => grp.semantics === 'FID');

        if (relatedFidGroup) {
            const relatedSsrc = relatedFidGroup.ssrcs.find(s => s !== src);

            mLine.sources.push(findSourcebyId(relatedSsrc));
            mLine.ssrcGroups.push(relatedFidGroup);
        }
    });

    // Add the SIM group last.
    mLine.ssrcGroups.push(simGroup);
}

/**
 * Add ssrcs and ssrc-groups to the m-line. When a primary ssrc, i.e., the
 * first ssrc in a SIM group is passed, all the other ssrcs from the SIM
 * group and the other ssrcs from the related FID groups are added to the same
 * m-line since they all belong to the same remote source. Since the ssrcs are
 * not guaranteed to be in the correct order, try to find if a SIM group exists,
 * if not, just add the FID group.
 * @param {Object} mLine - The m-line to which ssrcs have to be added.
 * @param {Object} ssrc - the primary ssrc.
 * @param {Object} sourceGroups - inverted source-group map.
 * @param {Array<Object>} sourceList - array containing all the sources.
 * @returns {void}
 */
function addSourcesToMline(mLine, ssrc, sourceGroups, sourceList) {
    if (!mLine || !ssrc) {
        return;
    }
    mLine.sources = [];
    mLine.ssrcGroups = [];

    // If there are no associated ssrc-groups, just add the ssrc and msid.
    if (!sourceGroups[ssrc.id]) {
        mLine.sources.push(ssrc);
        mLine.msid = ssrc.msid;

        return;
    }
    const findSourcebyId = src => sourceList.find(source => source.id.toString() === src);

    // Find the SIM and FID groups that this ssrc belongs to.
    const simGroup = findSimGroup(sourceGroups[ssrc.id]);
    const fidGroup = findFidGroup(sourceGroups[ssrc.id]);

    // Add the ssrcs for the SIM group and their corresponding FID groups.
    if (simGroup) {
        addSimGroupSources(mLine, simGroup, sourceGroups, sourceList);
    } else if (fidGroup) {
        // check if the other ssrc from this FID group is part of a SIM group
        const otherSsrc = fidGroup.ssrcs.find(s => s !== ssrc);
        const simGroup2 = findSimGroup(sourceGroups[otherSsrc]);

        if (simGroup2) {
            addSimGroupSources(mLine, simGroup2, sourceGroups, sourceList);
        } else {
            // Add the FID group ssrcs.
            fidGroup.ssrcs.forEach(src => {
                mLine.sources.push(findSourcebyId(src));
            });
            mLine.ssrcGroups.push(fidGroup);
        }
    }

    // Set the msid for the media description using the msid attribute of the ssrcs.
    mLine.msid = mLine.sources[0].msid;
}

/**
 * Checks if there is a mline for the given ssrc or its related primary ssrc.
 * We always implode the SIM group to the first ssrc in the SIM group before sRD,
 * so we also check if mline for that ssrc exists.
 * For example:
 * If the following ssrcs are in a SIM group,
 * <ssrc-group xmlns=\"urn:xmpp:jingle:apps:rtp:ssma:0\" semantics=\"SIM\">
 *        <source ssrc=\"1806330949\"/>
 *        <source ssrc=\"4173145196\"/>
 *        <source ssrc=\"2002632207\"/>
 * </ssrc-group>
 * This method returns true for any one of the 3 ssrcs if there is a mline for 1806330949.
 * @param {Object} ssrc - ssrc to check.
 * @param {Object} sourceGroups - inverted source-group map.
 * @param {Array<Object>} mlines - mlines in the description

 * @returns {Boolean} - Returns true if mline for the given ssrc or the related primary ssrc
 * exists, returns false otherwise.
 */
function checkIfMlineForSsrcExists(ssrc, sourceGroups, mlines) {
    const findMatchingMline = mline => {
        if (mline.sources) {
            return mline.sources.some(source => source.id === ssrc.id);
        }

        return false;
    };

    if (!mlines.find(findMatchingMline)) {
        // check if this ssrc is member of a SIM group. If so, check if there
        // is a matching m-line for the primary ssrc of the SIM group.
        if (!sourceGroups[ssrc.id]) {
            return false;
        }
        const simGroup = findSimGroup(sourceGroups[ssrc.id]);
        const fidGroup = findFidGroup(sourceGroups[ssrc.id]);

        if (simGroup) {
            return mlines.some(mline => mline.sources
                && mline.sources.some(src => src.id.toString() === simGroup.ssrcs[0]));
        } else if (fidGroup && ssrc.id.toString() !== fidGroup.ssrcs[0]) {
            const otherSsrc = { id: fidGroup.ssrcs[0] };

            return checkIfMlineForSsrcExists(otherSsrc, sourceGroups, mlines);

        }

        return false;
    }

    return true;
}

/**
 * Create an inverted sourceGroup map to put all the grouped ssrcs
 * in the same m-line.
 * @param {Array<Object>} sourceGroups
 * @returns {Object} - An inverted sourceGroup map.
 */
function createSourceGroupMap(sourceGroups) {
    const ssrc2group = {};

    if (!sourceGroups || !Array.isArray(sourceGroups)) {
        return ssrc2group;
    }
    sourceGroups.forEach(group => {
        if (group.ssrcs && Array.isArray(group.ssrcs)) {
            group.ssrcs.forEach(ssrc => {
                if (typeof ssrc2group[ssrc] === 'undefined') {
                    ssrc2group[ssrc] = [];
                }
                ssrc2group[ssrc].push(group);
            });
        }
    });

    return ssrc2group;
}

/**
 * Interop provides an API for tranforming a Plan B SDP to a Unified Plan SDP and
 * vice versa.
 */
export class Interop {
    /**
     * This method transforms a Unified Plan SDP to an equivalent Plan B SDP.
     * @param {RTCSessionDescription} description - The description in Unified plan format.
     * @returns RTCSessionDescription - The transformed session description.
     */
    toPlanB(description) {
        if (!description || typeof description.sdp !== 'string') {
            console.warn('An empty description was passed as an argument.');

            return description;
        }

        // Objectify the SDP for easier manipulation.
        const session = transform.parse(description.sdp);

        // If the SDP contains no media, there's nothing to transform.
        if (!session.media || !session.media.length) {
            console.warn('The description has no media.');

            return description;
        }

        // Make sure this is a unified plan sdp
        if (session.media.every(m => PLAN_B_MIDS.indexOf(m.mid) !== -1)) {
            console.warn('The description does not look like unified plan sdp');

            return description;
        }

        const media = {};
        const sessionMedia = session.media;

        session.media = [];
        sessionMedia.forEach(mLine => {
            const type = mLine.type;

            if (type === 'application') {
                mLine.mid = 'data';
                media[mLine.mid] = mLine;

                return;
            }
            if (typeof media[type] === 'undefined') {
                const bLine = clonedeep(mLine);

                // Copy the msid attribute to all the ssrcs if they belong to the same source group
                if (bLine.sources && Array.isArray(bLine.sources)) {
                    bLine.sources.forEach(source => {
                        mLine.msid ? source.msid = mLine.msid : delete source.msid;
                    });
                }

                // Do not signal the FID groups if there is no msid attribute present
                // on the sources as sesison-accept with this source info will fail strophe
                // validation and the session will not be established. This behavior is seen
                // on Firefox (with RTX enabled) when no video source is added at the join time.
                // FF generates two recvonly ssrcs with no msid and a corresponding FID group in
                // this case.
                if (!bLine.ssrcGroups || !mLine.msid) {
                    bLine.ssrcGroups = [];
                }
                delete bLine.msid;
                bLine.mid = type;
                media[type] = bLine;
            } else if (mLine.msid) {
                // Add sources and source-groups to the existing m-line of the same media type.
                if (mLine.sources && Array.isArray(mLine.sources)) {
                    // [VOWEL] copy msid to the sources from another video mid (2nd stream support)
                    mLine.sources.forEach(source => {
                        source.msid = mLine.msid;
                    });
                    media[type].sources = (media[type].sources || []).concat(mLine.sources);
                }
                if (typeof mLine.ssrcGroups !== 'undefined' && Array.isArray(mLine.ssrcGroups)) {
                    media[type].ssrcGroups = media[type].ssrcGroups.concat(mLine.ssrcGroups);
                }
            }
        });
        session.media = Object.values(media);

        // Bundle the media only if it is active.
        const bundle = [];

        Object.values(media).forEach(mline => {
            if (mline.direction !== 'inactive') {
                bundle.push(mline.mid);
            }
        });

        // We regenerate the BUNDLE group with the new mids.
        session.groups.forEach(group => {
            if (group.type === 'BUNDLE') {
                group.mids = bundle.join(' ');
            }
        });

        // msid semantic
        session.msidSemantic = {
            semantic: 'WMS',
            token: '*'
        };
        const resStr = transform.write(session);

        return new RTCSessionDescription({
            type: description.type,
            sdp: resStr
        });
    }

    /**
     * This method transforms a Plan B SDP to an equivalent Unified Plan SDP.
     * @param {RTCSessionDescription} description - The description in plan-b format.
     * @param {RTCSessionDescription} current - The current description set on
     * the peerconnection in Unified-plan format, i.e., the readonly attribute
     * remoteDescription on the RTCPeerConnection object.
     * @returns RTCSessionDescription - The transformed session description.
     */
    toUnifiedPlan(description, current = null) {
        if (!description || typeof description.sdp !== 'string') {
            console.warn('An empty description was passed as an argument.');

            return description;
        }

        // Objectify the SDP for easier manipulation.
        const session = transform.parse(description.sdp);

        // If the SDP contains no media, there's nothing to transform.
        if (!session.media || !session.media.length) {
            console.warn('The description has no media.');

            return description;
        }

        // Make sure this is a plan-b sdp.
        if (session.media.length > 3 || session.media.every(m => PLAN_B_MIDS.indexOf(m.mid) === -1)) {
            console.warn('The description does not look like plan-b');

            return description;
        }
        const currentDesc = current ? transform.parse(current.sdp) : null;
        const media = {};

        session.media.forEach(mLine => {
            const type = mLine.type;

            if (type === 'application') {
                if (!currentDesc || !currentDesc.media) {
                    const newMline = clonedeep(mLine);

                    newMline.mid = Object.keys(media).length.toString();
                    media[mLine.mid] = newMline;

                    return;
                }
                const mLineForData = currentDesc.media.findIndex(m => m.type === type);

                if (mLineForData) {
                    currentDesc.media[mLineForData] = mLine;
                    currentDesc.media[mLineForData].mid = mLineForData;
                }

                return;
            }

            // Create an inverted sourceGroup map here to put all the grouped SSRCs in the same m-line.
            const ssrc2group = createSourceGroupMap(mLine.ssrcGroups);

            // If there are no sources advertised for a media type, add the description if this is the first
            // remote offer, i.e., no current description was passed. Chrome in Unified plan does not produce
            // recvonly ssrcs unlike Firefox and Safari.
            if (!mLine.sources) {
                if (!currentDesc) {
                    const newMline = clonedeep(mLine);

                    newMline.mid = Object.keys(media).length.toString();
                    media[mLine.mid] = newMline;
                }

                return;
            }
            mLine.sources.forEach((ssrc, idx) => {
                // Do not add the receive-only ssrcs that Jicofo sends in the source-add.
                // These ssrcs do not have the "msid" attribute set.
                if (!ssrc.msid) {
                    return;
                }

                // If there is no description set on the peerconnection, create new m-lines.
                if (!currentDesc || !currentDesc.media) {
                    if (checkIfMlineForSsrcExists(ssrc, ssrc2group, Object.values(media))) {
                        return;
                    }
                    const newMline = clonedeep(mLine);

                    newMline.mid = Object.keys(media).length.toString();
                    newMline.direction = idx
                        ? 'sendonly'
                        : mLine.direction === 'sendonly' ? 'sendonly' : 'sendrecv';
                    newMline.bundleOnly = undefined;
                    addSourcesToMline(newMline, ssrc, ssrc2group, mLine.sources);
                    media[newMline.mid] = newMline;

                    return;
                }

                // Create and append the m-lines to the existing description.
                if (checkIfMlineForSsrcExists(ssrc, ssrc2group, currentDesc.media)) {
                    return;
                }
                const newMline = clonedeep(mLine);

                newMline.mid = currentDesc.media.length.toString();
                newMline.direction = 'sendonly';
                addSourcesToMline(newMline, ssrc, ssrc2group, mLine.sources);
                currentDesc.media.push(newMline);
            });
        });
        session.media = currentDesc ? currentDesc.media : Object.values(media);
        const mids = [];

        session.media.forEach(mLine => {
            mids.push(mLine.mid);
        });

        // We regenerate the BUNDLE group (since we regenerated the mids)
        session.groups.forEach(group => {
            if (group.type === 'BUNDLE') {
                group.mids = mids.join(' ');
            }
        });

        // msid semantic
        session.msidSemantic = {
            semantic: 'WMS',
            token: '*'
        };

        // Increment the session version every time.
        session.origin.sessionVersion++;
        const resultSdp = transform.write(session);

        return new RTCSessionDescription({
            type: description.type,
            sdp: resultSdp
        });
    }
}
