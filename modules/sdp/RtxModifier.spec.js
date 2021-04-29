/* eslint-disable max-len*/
import * as transform from 'sdp-transform';

import RtxModifier from './RtxModifier.js';
import SDPUtil from './SDPUtil';
import { default as SampleSdpStrings } from './SampleSdpStrings.js';

/**
 * Returns the number of video ssrcs in the given sdp
 * @param {object} parsedSdp the sdp as parsed by transform.parse
 * @returns {number} the number of video ssrcs in the given sdp
 */
function numVideoSsrcs(parsedSdp) {
    const videoMLine = parsedSdp.media.find(m => m.type === 'video');

    return videoMLine.ssrcs
        .map(ssrcInfo => ssrcInfo.id)
        .filter((ssrc, index, array) => array.indexOf(ssrc) === index)
        .length;
}

/**
 * Return the (single) primary video ssrc in the given sdp
 * @param {object} parsedSdp the sdp as parsed by transform.parse
 * @returns {number} the primary video ssrc in the given sdp
 */
function getPrimaryVideoSsrc(parsedSdp) {
    const videoMLine = parsedSdp.media.find(m => m.type === 'video');


    return parseInt(SDPUtil.parsePrimaryVideoSsrc(videoMLine), 10);
}

/**
 * Get the primary video ssrc(s) in the given sdp.
 * Only handles parsing 2 scenarios right now:
 * 1) Single video ssrc
 * 2) Multiple video ssrcs in a single simulcast group
 * @param {object} parsedSdp the sdp as parsed by transform.parse
 * @returns {list<number>} the primary video ssrcs in the given sdp
 */
function getPrimaryVideoSsrcs(parsedSdp) {
    const videoMLine = parsedSdp.media.find(m => m.type === 'video');

    if (numVideoSsrcs(parsedSdp) === 1) {
        return [ videoMLine.ssrcs[0].id ];
    }
    const simGroups = getVideoGroups(parsedSdp, 'SIM');

    if (simGroups.length > 1) {
        return;
    }
    const simGroup = simGroups[0];


    return SDPUtil.parseGroupSsrcs(simGroup);

}

/**
 * Get the video groups that match the passed semantics from the
 *  given sdp
 * @param {object} parsedSDp the sdp as parsed by transform.parse
 * @param {string} groupSemantics the semantics string of the groups
 *  the caller is interested in
 * @returns {list<object>} a list of the groups from the given sdp
 *  that matched the passed semantics
 */
function getVideoGroups(parsedSdp, groupSemantics) {
    const videoMLine = parsedSdp.media.find(m => m.type === 'video');

    videoMLine.ssrcGroups = videoMLine.ssrcGroups || [];

    return videoMLine.ssrcGroups
        .filter(g => g.semantics === groupSemantics);
}

describe('RtxModifier', () => {
    let rtxModifier;

    beforeEach(() => {
        rtxModifier = new RtxModifier();
    });

    describe('modifyRtxSsrcs', () => {
        describe('when given an sdp with a single video ssrc', () => {
            let primaryVideoSsrc, singleVideoSdp;

            beforeEach(() => {
                singleVideoSdp = SampleSdpStrings.plainVideoSdp;
                primaryVideoSsrc = getPrimaryVideoSsrc(singleVideoSdp);
            });
            it('should add a single rtx ssrc', () => {
                // Call rtxModifier.modifyRtxSsrcs with an sdp that contains a single video
                //  ssrc.  The returned sdp should have an rtx ssrc and an fid group.
                const newSdpStr = rtxModifier.modifyRtxSsrcs(transform.write(singleVideoSdp));
                const newSdp = transform.parse(newSdpStr);
                const newPrimaryVideoSsrc = getPrimaryVideoSsrc(newSdp);

                expect(newPrimaryVideoSsrc).toEqual(primaryVideoSsrc);

                // Should now have an rtx ssrc as well
                expect(numVideoSsrcs(newSdp)).toEqual(2);

                // Should now have an FID group
                const fidGroups = getVideoGroups(newSdp, 'FID');

                expect(fidGroups.length).toEqual(1);

                const fidGroup = fidGroups[0];
                const fidGroupPrimarySsrc = SDPUtil.parseGroupSsrcs(fidGroup)[0];

                expect(fidGroupPrimarySsrc).toEqual(primaryVideoSsrc);
            });

            it('should re-use the same rtx ssrc for a primary ssrc it\'s seen before', () => {
                // Have rtxModifier generate an rtx ssrc via modifyRtxSsrcs.  Then call it again
                //  with the same primary ssrc in the sdp (but no rtx ssrc).  It should use
                //  the same rtx ssrc as before.
                let newSdpStr = rtxModifier.modifyRtxSsrcs(transform.write(singleVideoSdp));
                let newSdp = transform.parse(newSdpStr);

                let fidGroup = getVideoGroups(newSdp, 'FID')[0];
                const fidGroupRtxSsrc = SDPUtil.parseGroupSsrcs(fidGroup)[1];

                // Now pass the original sdp through again
                newSdpStr = rtxModifier.modifyRtxSsrcs(transform.write(singleVideoSdp));
                newSdp = transform.parse(newSdpStr);
                fidGroup = getVideoGroups(newSdp, 'FID')[0];
                const newFidGroupRtxSsrc = SDPUtil.parseGroupSsrcs(fidGroup)[1];

                expect(newFidGroupRtxSsrc).toEqual(fidGroupRtxSsrc);
            });

            it('should NOT re-use the same rtx ssrc for a primary ssrc it\'s seen before if the cache has been cleared', () => {
                // Call modifyRtxSsrcs to generate an rtx ssrc
                // Clear the rtxModifier cache
                // Call modifyRtxSsrcs to generate an rtx ssrc again with the same primary ssrc
                // --> We should get a different rtx ssrc
                let newSdpStr = rtxModifier.modifyRtxSsrcs(transform.write(singleVideoSdp));
                let newSdp = transform.parse(newSdpStr);

                let fidGroup = getVideoGroups(newSdp, 'FID')[0];
                const fidGroupRtxSsrc = SDPUtil.parseGroupSsrcs(fidGroup)[1];

                rtxModifier.clearSsrcCache();

                // Now pass the original sdp through again
                newSdpStr = rtxModifier.modifyRtxSsrcs(transform.write(singleVideoSdp));
                newSdp = transform.parse(newSdpStr);
                fidGroup = getVideoGroups(newSdp, 'FID')[0];
                const newFidGroupRtxSsrc = SDPUtil.parseGroupSsrcs(fidGroup)[1];

                expect(newFidGroupRtxSsrc).not.toEqual(fidGroupRtxSsrc);
            });

            it('should use the rtx ssrc from the cache when the cache has been manually set', () => {
                // Manually set an rtx ssrc mapping in the cache
                // Call modifyRtxSsrcs
                // -->The rtx ssrc used should be the one we set
                const forcedRtxSsrc = 123456;
                const ssrcCache = new Map();

                ssrcCache.set(primaryVideoSsrc, forcedRtxSsrc);
                rtxModifier.setSsrcCache(ssrcCache);
                const newSdpStr = rtxModifier.modifyRtxSsrcs(transform.write(singleVideoSdp));
                const newSdp = transform.parse(newSdpStr);

                const fidGroup = getVideoGroups(newSdp, 'FID')[0];
                const fidGroupRtxSsrc = SDPUtil.parseGroupSsrcs(fidGroup)[1];

                expect(fidGroupRtxSsrc).toEqual(forcedRtxSsrc);
            });
        });

        describe('when given an sdp with multiple video ssrcs', () => {
            let multipleVideoSdp, primaryVideoSsrcs;

            beforeEach(() => {
                multipleVideoSdp = SampleSdpStrings.simulcastSdp;
                primaryVideoSsrcs = getPrimaryVideoSsrcs(multipleVideoSdp);
            });

            it('should add rtx ssrcs for all of them', () => {
                // Call rtxModifier.modifyRtxSsrcs with an sdp that contains multiple video
                //  ssrcs.  The returned sdp should have an rtx ssrc and an fid group for all of them.
                const newSdpStr = rtxModifier.modifyRtxSsrcs(transform.write(multipleVideoSdp));
                const newSdp = transform.parse(newSdpStr);
                const newPrimaryVideoSsrcs = getPrimaryVideoSsrcs(newSdp);

                expect(newPrimaryVideoSsrcs).toEqual(primaryVideoSsrcs);

                // Should now have rtx ssrcs as well
                expect(numVideoSsrcs(newSdp)).toEqual(primaryVideoSsrcs.length * 2);

                // Should now have FID groups
                const fidGroups = getVideoGroups(newSdp, 'FID');

                expect(fidGroups.length).toEqual(primaryVideoSsrcs.length);
                fidGroups.forEach(fidGroup => {
                    const fidGroupPrimarySsrc = SDPUtil.parseGroupSsrcs(fidGroup)[0];

                    expect(primaryVideoSsrcs.indexOf(fidGroupPrimarySsrc)).not.toEqual(-1);
                });
            });

            it('should re-use the same rtx ssrcs for any primary ssrc it\'s seen before', () => {
                // Have rtxModifier generate an rtx ssrc via modifyRtxSsrcs.  Then call it again
                //  with the same primary ssrc in the sdp (but no rtx ssrc).  It should use
                //  the same rtx ssrc as before.
                let newSdpStr = rtxModifier.modifyRtxSsrcs(transform.write(multipleVideoSdp));
                let newSdp = transform.parse(newSdpStr);

                const rtxMapping = new Map();
                let fidGroups = getVideoGroups(newSdp, 'FID');

                // Save the first mapping that is made

                fidGroups.forEach(fidGroup => {
                    const fidSsrcs = SDPUtil.parseGroupSsrcs(fidGroup);
                    const fidGroupPrimarySsrc = fidSsrcs[0];
                    const fidGroupRtxSsrc = fidSsrcs[1];

                    rtxMapping.set(fidGroupPrimarySsrc, fidGroupRtxSsrc);
                });

                // Now pass the original sdp through again and make sure we get the same mapping
                newSdpStr = rtxModifier.modifyRtxSsrcs(transform.write(multipleVideoSdp));
                newSdp = transform.parse(newSdpStr);
                fidGroups = getVideoGroups(newSdp, 'FID');
                fidGroups.forEach(fidGroup => {
                    const fidSsrcs = SDPUtil.parseGroupSsrcs(fidGroup);
                    const fidGroupPrimarySsrc = fidSsrcs[0];
                    const fidGroupRtxSsrc = fidSsrcs[1];

                    expect(rtxMapping.has(fidGroupPrimarySsrc)).toBe(true);
                    expect(rtxMapping.get(fidGroupPrimarySsrc)).toEqual(fidGroupRtxSsrc);
                });
            });

            it('should NOT re-use the same rtx ssrcs for any primary ssrc it\'s seen before if the cache has been cleared', () => {
                // Call modifyRtxSsrcs to generate an rtx ssrc
                // Clear the rtxModifier cache
                // Call modifyRtxSsrcs to generate rtx ssrcs again with the same primary ssrcs
                // --> We should get different rtx ssrcs
                let newSdpStr = rtxModifier.modifyRtxSsrcs(transform.write(multipleVideoSdp));
                let newSdp = transform.parse(newSdpStr);

                const rtxMapping = new Map();
                let fidGroups = getVideoGroups(newSdp, 'FID');

                // Save the first mapping that is made

                fidGroups.forEach(fidGroup => {
                    const fidSsrcs = SDPUtil.parseGroupSsrcs(fidGroup);
                    const fidGroupPrimarySsrc = fidSsrcs[0];
                    const fidGroupRtxSsrc = fidSsrcs[1];

                    rtxMapping.set(fidGroupPrimarySsrc, fidGroupRtxSsrc);
                });

                rtxModifier.clearSsrcCache();

                // Now pass the original sdp through again and make sure we get the same mapping
                newSdpStr = rtxModifier.modifyRtxSsrcs(transform.write(multipleVideoSdp));
                newSdp = transform.parse(newSdpStr);
                fidGroups = getVideoGroups(newSdp, 'FID');
                fidGroups.forEach(fidGroup => {
                    const fidSsrcs = SDPUtil.parseGroupSsrcs(fidGroup);
                    const fidGroupPrimarySsrc = fidSsrcs[0];
                    const fidGroupRtxSsrc = fidSsrcs[1];

                    expect(rtxMapping.has(fidGroupPrimarySsrc)).toBe(true);
                    expect(rtxMapping.get(fidGroupPrimarySsrc)).not.toEqual(fidGroupRtxSsrc);
                });
            });

            it('should use the rtx ssrcs from the cache when the cache has been manually set', () => {
                // Manually set an rtx ssrc mapping in the cache
                // Call modifyRtxSsrcs
                // -->The rtx ssrc used should be the one we set
                const rtxMapping = new Map();

                primaryVideoSsrcs.forEach(ssrc => {
                    rtxMapping.set(ssrc, SDPUtil.generateSsrc());
                });
                rtxModifier.setSsrcCache(rtxMapping);

                const newSdpStr = rtxModifier.modifyRtxSsrcs(transform.write(multipleVideoSdp));
                const newSdp = transform.parse(newSdpStr);

                const fidGroups = getVideoGroups(newSdp, 'FID');

                fidGroups.forEach(fidGroup => {
                    const fidSsrcs = SDPUtil.parseGroupSsrcs(fidGroup);
                    const fidGroupPrimarySsrc = fidSsrcs[0];
                    const fidGroupRtxSsrc = fidSsrcs[1];

                    expect(rtxMapping.has(fidGroupPrimarySsrc)).toBe(true);
                    expect(rtxMapping.get(fidGroupPrimarySsrc)).toEqual(fidGroupRtxSsrc);
                });
            });
        });

        describe('when given an sdp with a flexfec stream', () => {
            it('should not add rtx for the flexfec ssrc', () => {
                const flexFecSdp = SampleSdpStrings.flexFecSdp;
                const newSdpStr = rtxModifier.modifyRtxSsrcs(transform.write(flexFecSdp));
                const newSdp = transform.parse(newSdpStr);
                const fidGroups = getVideoGroups(newSdp, 'FID');

                expect(fidGroups.length).toEqual(1);
            });
        });

        describe('(corner cases)', () => {
            it('should handle a recvonly video mline', () => {
                const sdp = SampleSdpStrings.plainVideoSdp;
                const videoMLine = sdp.media.find(m => m.type === 'video');

                videoMLine.direction = 'recvonly';
                const newSdpStr = rtxModifier.modifyRtxSsrcs(transform.write(sdp));

                expect(newSdpStr).toEqual(transform.write(sdp));
            });

            it('should handle a video mline with no video ssrcs', () => {
                const sdp = SampleSdpStrings.plainVideoSdp;
                const videoMLine = sdp.media.find(m => m.type === 'video');

                videoMLine.ssrcs = [];
                const newSdpStr = rtxModifier.modifyRtxSsrcs(transform.write(sdp));

                expect(newSdpStr).toEqual(transform.write(sdp));
            });
        });
    });

    describe('stripRtx', () => {
        beforeEach(() => { }); // eslint-disable-line no-empty-function
        it('should strip all rtx streams from an sdp with rtx', () => {
            const sdpStr = transform.write(SampleSdpStrings.rtxVideoSdp);
            const newSdpStr = rtxModifier.stripRtx(sdpStr);
            const newSdp = transform.parse(newSdpStr);
            const fidGroups = getVideoGroups(newSdp, 'FID');

            expect(fidGroups.length).toEqual(0);
            expect(numVideoSsrcs(newSdp)).toEqual(1);
        });
        it('should do nothing to an sdp with no rtx', () => {
            const sdpStr = transform.write(SampleSdpStrings.plainVideoSdp);
            const newSdpStr = rtxModifier.stripRtx(sdpStr);

            expect(newSdpStr).toEqual(sdpStr);
        });
    });
});

/* eslint-enable max-len*/
