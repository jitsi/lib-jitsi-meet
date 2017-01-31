/*eslint-disable max-len*/
/*jshint maxlen:false*/
var RtxModifier = require("./RtxModifier.js");
var SampleSdpStrings = require("./SampleSdpStrings.js");
var transform = require('sdp-transform');
var SDPUtil = require("./SDPUtil.js");

var numVideoSsrcs = function (parsedSdp) {
  let videoMLine = parsedSdp.media.find(m => m.type === "video");
  return videoMLine.ssrcs
    .map(ssrcInfo => ssrcInfo.id)
    .filter((ssrc, index, array) => array.indexOf(ssrc) === index)
    .length;
};

var getPrimaryVideoSsrc = function (parsedSdp) {
  return getPrimaryVideoSsrcs(parsedSdp)[0];
};

// Only handles parsing 2 scenarios right now:
// 1) Single video ssrc
// 2) Multiple video ssrcs in a single simulcast group
var getPrimaryVideoSsrcs = function (parsedSdp) {
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
};

var getVideoGroups = function (parsedSdp, groupSemantics) {
  let videoMLine = parsedSdp.media.find(m => m.type === "video");
  videoMLine.ssrcGroups = videoMLine.ssrcGroups || [];
  return videoMLine.ssrcGroups
    .filter(g => g.semantics === groupSemantics);
};

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
          let ssrcCache = {};
          ssrcCache[this.primaryVideoSsrc] = forcedRtxSsrc;
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

          let rtxMapping = {};
          let fidGroups = getVideoGroups(newSdp, "FID");
          // Save the first mapping that is made
          fidGroups.forEach(fidGroup => {
            let fidSsrcs = SDPUtil.parseGroupSsrcs(fidGroup);
            let fidGroupPrimarySsrc = fidSsrcs[0];
            let fidGroupRtxSsrc = fidSsrcs[1];
            rtxMapping[fidGroupPrimarySsrc] = fidGroupRtxSsrc;
          });
          // Now pass the original sdp through again and make sure we get the same mapping
          newSdpStr = this.rtxModifier.modifyRtxSsrcs(this.transform.write(this.multipleVideoSdp));
          newSdp = transform.parse(newSdpStr);
          fidGroups = getVideoGroups(newSdp, "FID");
          fidGroups.forEach(fidGroup => {
            let fidSsrcs = SDPUtil.parseGroupSsrcs(fidGroup);
            let fidGroupPrimarySsrc = fidSsrcs[0];
            let fidGroupRtxSsrc = fidSsrcs[1];
            expect(rtxMapping[fidGroupPrimarySsrc]).toBeTruthy();
            expect(rtxMapping[fidGroupPrimarySsrc]).toEqual(fidGroupRtxSsrc);
          });
        });

        it ("should NOT re-use the same rtx ssrcs for any primary ssrc it's seen before if the cache has been cleared", function() {
          // Call modifyRtxSsrcs to generate an rtx ssrc
          // Clear the rtxModifier cache
          // Call modifyRtxSsrcs to generate rtx ssrcs again with the same primary ssrcs
          // --> We should get different rtx ssrcs
          let newSdpStr = this.rtxModifier.modifyRtxSsrcs(this.transform.write(this.multipleVideoSdp));
          let newSdp = transform.parse(newSdpStr);

          let rtxMapping = {};
          let fidGroups = getVideoGroups(newSdp, "FID");
          // Save the first mapping that is made
          fidGroups.forEach(fidGroup => {
            let fidSsrcs = SDPUtil.parseGroupSsrcs(fidGroup);
            let fidGroupPrimarySsrc = fidSsrcs[0];
            let fidGroupRtxSsrc = fidSsrcs[1];
            rtxMapping[fidGroupPrimarySsrc] = fidGroupRtxSsrc;
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
            expect(rtxMapping[fidGroupPrimarySsrc]).toBeTruthy();
            expect(rtxMapping[fidGroupPrimarySsrc]).not.toEqual(fidGroupRtxSsrc);
          });
        });

        it ("should use the rtx ssrcs from the cache when the cache has been manually set", function() {
          // Manually set an rtx ssrc mapping in the cache
          // Call modifyRtxSsrcs
          // -->The rtx ssrc used should be the one we set
          let rtxMapping = {};
          this.primaryVideoSsrcs.forEach(ssrc => {
            rtxMapping[ssrc] = SDPUtil.generateSsrc();
          });
          this.rtxModifier.setSsrcCache(rtxMapping);

          let newSdpStr = this.rtxModifier.modifyRtxSsrcs(this.transform.write(this.multipleVideoSdp));
          let newSdp = transform.parse(newSdpStr);

          let fidGroups = getVideoGroups(newSdp, "FID");
          fidGroups.forEach(fidGroup => {
            let fidSsrcs = SDPUtil.parseGroupSsrcs(fidGroup);
            let fidGroupPrimarySsrc = fidSsrcs[0];
            let fidGroupRtxSsrc = fidSsrcs[1];
            expect(rtxMapping[fidGroupPrimarySsrc]).toBeTruthy();
            expect(rtxMapping[fidGroupPrimarySsrc]).toEqual(fidGroupRtxSsrc);
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
