/*eslint-disable max-len*/
/*jshint maxlen:false*/
import RtxModifier from "./RtxModifier.js";
import * as SampleSdpStrings from "./SampleSdpStrings.js";
import * as transform from 'sdp-transform';
import * as SDPUtil from "./SDPUtil";

/**
 * Returns the number of video ssrcs in the given sdp
 * @param {object} parsedSdp the sdp as parsed by transform.parse
 * @returns {number} the number of video ssrcs in the given sdp
 */
function numVideoSsrcs (parsedSdp) {
  let videoMLine = parsedSdp.media.find(m => m.type === "video");
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
function getPrimaryVideoSsrc (parsedSdp) {
  let videoMLine = parsedSdp.media.find(m => m.type === "video");
  return parseInt(SDPUtil.parsePrimaryVideoSsrc(videoMLine));
}

/**
 * Get the primary video ssrc(s) in the given sdp.
 * Only handles parsing 2 scenarios right now:
 * 1) Single video ssrc
 * 2) Multiple video ssrcs in a single simulcast group
 * @param {object} parsedSdp the sdp as parsed by transform.parse
 * @returns {list<number>} the primary video ssrcs in the given sdp
 */
function getPrimaryVideoSsrcs (parsedSdp) {
  let videoMLine = parsedSdp.media.find(m => m.type === "video");
  if (numVideoSsrcs(parsedSdp) === 1) {
    return [videoMLine.ssrcs[0].id];
  } else {
    let simGroups = getVideoGroups(parsedSdp, "SIM");
    if (simGroups.length > 1) {
      return;
    }
    let simGroup = simGroups[0];
    return SDPUtil.parseGroupSsrcs(simGroup);
  }
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
function getVideoGroups (parsedSdp, groupSemantics) {
  let videoMLine = parsedSdp.media.find(m => m.type === "video");
  videoMLine.ssrcGroups = videoMLine.ssrcGroups || [];
  return videoMLine.ssrcGroups
    .filter(g => g.semantics === groupSemantics);
}

describe ("RtxModifier", function() {
    beforeEach(function() {
      this.rtxModifier = new RtxModifier();
      this.transform = transform;
      this.SDPUtil = SDPUtil;
    });

    describe ("modifyRtxSsrcs", function() {
      describe ("when given an sdp with a single video ssrc", function() {
        beforeEach(function() {
          this.singleVideoSdp = SampleSdpStrings.plainVideoSdp;
          this.primaryVideoSsrc = getPrimaryVideoSsrc(this.singleVideoSdp);
        });
        it ("should add a single rtx ssrc", function() {
          // Call rtxModifier.modifyRtxSsrcs with an sdp that contains a single video
          //  ssrc.  The returned sdp should have an rtx ssrc and an fid group.
          let newSdpStr = this.rtxModifier.modifyRtxSsrcs(this.transform.write(this.singleVideoSdp));
          let newSdp = transform.parse(newSdpStr);
          let newPrimaryVideoSsrc = getPrimaryVideoSsrc(newSdp);
          expect(newPrimaryVideoSsrc).toEqual(this.primaryVideoSsrc);
          // Should now have an rtx ssrc as well
          expect(numVideoSsrcs(newSdp)).toEqual(2);
          // Should now have an FID group
          let fidGroups = getVideoGroups(newSdp, "FID");
          expect(fidGroups.length).toEqual(1);

          let fidGroup = fidGroups[0];
          let fidGroupPrimarySsrc = SDPUtil.parseGroupSsrcs(fidGroup)[0];
          expect(fidGroupPrimarySsrc).toEqual(this.primaryVideoSsrc);
        });

        it ("should re-use the same rtx ssrc for a primary ssrc it's seen before", function() {
          // Have rtxModifier generate an rtx ssrc via modifyRtxSsrcs.  Then call it again
          //  with the same primary ssrc in the sdp (but no rtx ssrc).  It should use
          //  the same rtx ssrc as before.
          let newSdpStr = this.rtxModifier.modifyRtxSsrcs(this.transform.write(this.singleVideoSdp));
          let newSdp = transform.parse(newSdpStr);

          let fidGroup = getVideoGroups(newSdp, "FID")[0];
          let fidGroupRtxSsrc = SDPUtil.parseGroupSsrcs(fidGroup)[1];

          // Now pass the original sdp through again 
          newSdpStr = this.rtxModifier.modifyRtxSsrcs(this.transform.write(this.singleVideoSdp));
          newSdp = transform.parse(newSdpStr);
          fidGroup = getVideoGroups(newSdp, "FID")[0];
          let newFidGroupRtxSsrc = SDPUtil.parseGroupSsrcs(fidGroup)[1];
          expect(newFidGroupRtxSsrc).toEqual(fidGroupRtxSsrc);
        });

        it ("should NOT re-use the same rtx ssrc for a primary ssrc it's seen before if the cache has been cleared", function() {
          // Call modifyRtxSsrcs to generate an rtx ssrc
          // Clear the rtxModifier cache
          // Call modifyRtxSsrcs to generate an rtx ssrc again with the same primary ssrc
          // --> We should get a different rtx ssrc
          let newSdpStr = this.rtxModifier.modifyRtxSsrcs(this.transform.write(this.singleVideoSdp));
          let newSdp = transform.parse(newSdpStr);

          let fidGroup = getVideoGroups(newSdp, "FID")[0];
          let fidGroupRtxSsrc = SDPUtil.parseGroupSsrcs(fidGroup)[1];
          this.rtxModifier.clearSsrcCache();

          // Now pass the original sdp through again
          newSdpStr = this.rtxModifier.modifyRtxSsrcs(this.transform.write(this.singleVideoSdp));
          newSdp = transform.parse(newSdpStr);
          fidGroup = getVideoGroups(newSdp, "FID")[0];
          let newFidGroupRtxSsrc = SDPUtil.parseGroupSsrcs(fidGroup)[1];
          expect(newFidGroupRtxSsrc).not.toEqual(fidGroupRtxSsrc);
        });

        it ("should use the rtx ssrc from the cache when the cache has been manually set", function() {
          // Manually set an rtx ssrc mapping in the cache
          // Call modifyRtxSsrcs
          // -->The rtx ssrc used should be the one we set
          let forcedRtxSsrc = 123456;
          let ssrcCache = new Map();
          ssrcCache.set(this.primaryVideoSsrc, forcedRtxSsrc);
          this.rtxModifier.setSsrcCache(ssrcCache);
          let newSdpStr = this.rtxModifier.modifyRtxSsrcs(this.transform.write(this.singleVideoSdp));
          let newSdp = transform.parse(newSdpStr);

          let fidGroup = getVideoGroups(newSdp, "FID")[0];
          let fidGroupRtxSsrc = SDPUtil.parseGroupSsrcs(fidGroup)[1];
          expect(fidGroupRtxSsrc).toEqual(forcedRtxSsrc);
        });
      });

      describe ("when given an sdp with multiple video ssrcs", function() {
        beforeEach(function() {
          this.multipleVideoSdp = SampleSdpStrings.simulcastSdp;
          this.primaryVideoSsrcs = getPrimaryVideoSsrcs(this.multipleVideoSdp);
        });

        it ("should add rtx ssrcs for all of them", function() {
          // Call rtxModifier.modifyRtxSsrcs with an sdp that contains multiple video
          //  ssrcs.  The returned sdp should have an rtx ssrc and an fid group for all of them.
          let newSdpStr = this.rtxModifier.modifyRtxSsrcs(this.transform.write(this.multipleVideoSdp));
          let newSdp = transform.parse(newSdpStr);
          let newPrimaryVideoSsrcs = getPrimaryVideoSsrcs(newSdp);
          expect(newPrimaryVideoSsrcs).toEqual(this.primaryVideoSsrcs);
          // Should now have rtx ssrcs as well
          expect(numVideoSsrcs(newSdp)).toEqual(this.primaryVideoSsrcs.length * 2);
          // Should now have FID groups
          let fidGroups = getVideoGroups(newSdp, "FID");
          expect(fidGroups.length).toEqual(this.primaryVideoSsrcs.length);
          fidGroups.forEach(fidGroup => {
            let fidGroupPrimarySsrc = SDPUtil.parseGroupSsrcs(fidGroup)[0];
            expect(this.primaryVideoSsrcs.indexOf(fidGroupPrimarySsrc)).not.toEqual(-1);
          });
        });

        it ("should re-use the same rtx ssrcs for any primary ssrc it's seen before", function() {
          // Have rtxModifier generate an rtx ssrc via modifyRtxSsrcs.  Then call it again
          //  with the same primary ssrc in the sdp (but no rtx ssrc).  It should use
          //  the same rtx ssrc as before.
          let newSdpStr = this.rtxModifier.modifyRtxSsrcs(this.transform.write(this.multipleVideoSdp));
          let newSdp = transform.parse(newSdpStr);

          let rtxMapping = new Map();
          let fidGroups = getVideoGroups(newSdp, "FID");
          // Save the first mapping that is made
          fidGroups.forEach(fidGroup => {
            let fidSsrcs = SDPUtil.parseGroupSsrcs(fidGroup);
            let fidGroupPrimarySsrc = fidSsrcs[0];
            let fidGroupRtxSsrc = fidSsrcs[1];
            rtxMapping.set(fidGroupPrimarySsrc, fidGroupRtxSsrc);
          });
          // Now pass the original sdp through again and make sure we get the same mapping
          newSdpStr = this.rtxModifier.modifyRtxSsrcs(this.transform.write(this.multipleVideoSdp));
          newSdp = transform.parse(newSdpStr);
          fidGroups = getVideoGroups(newSdp, "FID");
          fidGroups.forEach(fidGroup => {
            let fidSsrcs = SDPUtil.parseGroupSsrcs(fidGroup);
            let fidGroupPrimarySsrc = fidSsrcs[0];
            let fidGroupRtxSsrc = fidSsrcs[1];
            expect(rtxMapping.has(fidGroupPrimarySsrc)).toBe(true);
            expect(rtxMapping.get(fidGroupPrimarySsrc)).toEqual(fidGroupRtxSsrc);
          });
        });

        it ("should NOT re-use the same rtx ssrcs for any primary ssrc it's seen before if the cache has been cleared", function() {
          // Call modifyRtxSsrcs to generate an rtx ssrc
          // Clear the rtxModifier cache
          // Call modifyRtxSsrcs to generate rtx ssrcs again with the same primary ssrcs
          // --> We should get different rtx ssrcs
          let newSdpStr = this.rtxModifier.modifyRtxSsrcs(this.transform.write(this.multipleVideoSdp));
          let newSdp = transform.parse(newSdpStr);

          let rtxMapping = new Map();
          let fidGroups = getVideoGroups(newSdp, "FID");
          // Save the first mapping that is made
          fidGroups.forEach(fidGroup => {
            let fidSsrcs = SDPUtil.parseGroupSsrcs(fidGroup);
            let fidGroupPrimarySsrc = fidSsrcs[0];
            let fidGroupRtxSsrc = fidSsrcs[1];
            rtxMapping.set(fidGroupPrimarySsrc, fidGroupRtxSsrc);
          });

          this.rtxModifier.clearSsrcCache();
          // Now pass the original sdp through again and make sure we get the same mapping
          newSdpStr = this.rtxModifier.modifyRtxSsrcs(this.transform.write(this.multipleVideoSdp));
          newSdp = transform.parse(newSdpStr);
          fidGroups = getVideoGroups(newSdp, "FID");
          fidGroups.forEach(fidGroup => {
            let fidSsrcs = SDPUtil.parseGroupSsrcs(fidGroup);
            let fidGroupPrimarySsrc = fidSsrcs[0];
            let fidGroupRtxSsrc = fidSsrcs[1];
            expect(rtxMapping.has(fidGroupPrimarySsrc)).toBe(true);
            expect(rtxMapping.get(fidGroupPrimarySsrc)).not.toEqual(fidGroupRtxSsrc);
          });
        });

        it ("should use the rtx ssrcs from the cache when the cache has been manually set", function() {
          // Manually set an rtx ssrc mapping in the cache
          // Call modifyRtxSsrcs
          // -->The rtx ssrc used should be the one we set
          let rtxMapping = new Map();
          this.primaryVideoSsrcs.forEach(ssrc => {
            rtxMapping.set(ssrc, SDPUtil.generateSsrc());
          });
          this.rtxModifier.setSsrcCache(rtxMapping);

          let newSdpStr = this.rtxModifier.modifyRtxSsrcs(this.transform.write(this.multipleVideoSdp));
          let newSdp = transform.parse(newSdpStr);

          let fidGroups = getVideoGroups(newSdp, "FID");
          fidGroups.forEach(fidGroup => {
            let fidSsrcs = SDPUtil.parseGroupSsrcs(fidGroup);
            let fidGroupPrimarySsrc = fidSsrcs[0];
            let fidGroupRtxSsrc = fidSsrcs[1];
            expect(rtxMapping.has(fidGroupPrimarySsrc)).toBe(true);
            expect(rtxMapping.get(fidGroupPrimarySsrc)).toEqual(fidGroupRtxSsrc);
          });
        });
      });

      describe ("(corner cases)", function() {
        it ("should handle a recvonly video mline", function() {
          let sdp = SampleSdpStrings.plainVideoSdp;
          let videoMLine = sdp.media.find(m => m.type === "video");
          videoMLine.direction = "recvonly";
          let newSdpStr = this.rtxModifier.modifyRtxSsrcs(this.transform.write(sdp));
          expect(newSdpStr).toEqual(this.transform.write(sdp));
        });

        it ("should handle an inactive video mline", function() {
          let sdp = SampleSdpStrings.plainVideoSdp;
          let videoMLine = sdp.media.find(m => m.type === "video");
          videoMLine.direction = "inactive";
          let newSdpStr = this.rtxModifier.modifyRtxSsrcs(this.transform.write(sdp));
          expect(newSdpStr).toEqual(this.transform.write(sdp));
        });

        it ("should handle a video mline with no video ssrcs", function() {
          let sdp = SampleSdpStrings.plainVideoSdp;
          let videoMLine = sdp.media.find(m => m.type === "video");
          videoMLine.ssrcs = [];
          let newSdpStr = this.rtxModifier.modifyRtxSsrcs(this.transform.write(sdp));
          expect(newSdpStr).toEqual(this.transform.write(sdp));
        });
      });
    });
});

/*eslint-enable max-len*/
