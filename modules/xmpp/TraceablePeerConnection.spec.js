var TraceablePeerConnection = require("./TraceablePeerConnection.js");
var SampleSdps = require("./SampleSdpStrings.js");


describe("TraceablePeerConnection", function() {
    var session = {
        room: {
            eventEmitter: {}
        }
    };
    var constraints = {
        optional: [{
            googSuspendBelowMinBitrate: true
        }]
    };
    var iceConfig = {
        iceServers: []
    };
    var pc;
    beforeEach(function() {
        pc = new TraceablePeerConnection(iceConfig, constraints, session);
    });

    describe("buildSsrcMap", function() {
        var verifySsrcMap = function(ssrcMap, numExpectedMappings) {
            // We set up the data on the test such that the "old" ssrcs 
            // are the same as the "new" ssrcs, except the old ones 
            // have been changed to start with "1111".  We'll verify
            // by just comparing the last 4 between the new and mapped 
            // ssrcs in the ssrcMap.
            expect(Object.keys(ssrcMap).length).toEqual(numExpectedMappings);
            Object.keys(ssrcMap).forEach(function(newSsrc) {
                var newSsrcStr = newSsrc + "";
                var mappedSsrcStr = ssrcMap[newSsrc] + "";
                expect(newSsrcStr.substring(newSsrcStr.length - 4))
                    .toEqual(mappedSsrcStr.substring(mappedSsrcStr.length - 4));
            });
        };
        it("should map a plain video sdp correctly", function() {
            var cachedSsrcInfo = {
                "video": {
                    "ssrcs": [
                        1111014965,
                    ],
                },
            };
            var ssrcMap = 
                pc.buildSsrcMap(cachedSsrcInfo, SampleSdps.plainVideoSdp);
            verifySsrcMap(ssrcMap, cachedSsrcInfo.video.ssrcs.length);
        });
        it("should map an rtx sdp correctly", function() {
            var cachedSsrcInfo = {
                "video": {
                    "groups": [
                        {
                            "primarySSRC": 1111014965,
                            "group": {
                                "semantics": "FID",
                                "ssrcs": "1111014965 111199560"
                            }
                        },
                    ],
                    "ssrcs": [
                        1111014965,
                        111199560,
                    ],
                },
            };
            var ssrcMap = 
                pc.buildSsrcMap(cachedSsrcInfo, SampleSdps.rtxVideoSdp);
            verifySsrcMap(ssrcMap, cachedSsrcInfo.video.ssrcs.length);
        });

        it("should map a simulcast+rtx sdp correctly", function() {
            var cachedSsrcInfo = {
                "video": {
                    "groups": [
                        {
                            "primarySSRC": 1111014965,
                            "group": {
                                "semantics": "FID",
                                "ssrcs": "1111014965 111199560"
                            }
                        },
                        {
                            "primarySSRC": 1111014965,
                            "group": {
                                "semantics": "SIM",
                                "ssrcs": "1111014965 1111742055 1111111804"
                            }
                        },
                        {
                            "primarySSRC": 1111742055,
                            "group": {
                                "semantics": "FID",
                                "ssrcs": "1111742055 111113044"
                            }
                        },
                        {
                            "primarySSRC": 1111014965,
                            "group": {
                                "semantics": "FID",
                                "ssrcs": "1111111804 1111867077"
                            }
                        },
                    ],
                    "ssrcs": [
                        1111014965,
                        1111742055,
                        1111111804,
                        111199560,
                        111113044,
                        1111867077,
                    ],
                },
            };
            var ssrcMap = 
                pc.buildSsrcMap(cachedSsrcInfo, SampleSdps.simulcastRtxSdp);
            verifySsrcMap(ssrcMap, cachedSsrcInfo.video.ssrcs.length);
        });
    });

    describe("stripRtxGroups", function() {
        it("should strip rtx groups from the sdp", function() {
            var newDesc = 
                TraceablePeerConnection.
                    stripRtxGroups({sdp: SampleSdps.rtxVideoSdp});
            // The rtx ssrc (pulled directly from the sample) should no longer
            // be present anywhere in the sdp
            expect(newDesc.sdp.indexOf(984899560)).toEqual(-1);
        });
        it ("should strip rtx groups from a sim+rtx sdp", function() {
            var newDesc = 
                TraceablePeerConnection.
                    stripRtxGroups({sdp: SampleSdps.simulcastRtxSdp});
            // The rtx ssrc (pulled directly from the sample) should no longer
            // be present anywhere in the sdp
            expect(newDesc.sdp.indexOf(984899560)).toEqual(-1);
            expect(newDesc.sdp.indexOf(855213044)).toEqual(-1);
            expect(newDesc.sdp.indexOf(2963867077)).toEqual(-1);
        });
    });
});
