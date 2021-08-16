/* Copyright @ 2016 Atlassian Pty Ltd
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

var transform = require('sdp-transform');
var transformUtils = require('./transform-utils');
var parseSsrcs = transformUtils.parseSsrcs;
var writeSsrcs = transformUtils.writeSsrcs;

//region Constants

var DEFAULT_NUM_OF_LAYERS = 3;

//endregion

function getSsrcAttribute (mLine, ssrc, attributeName) {
    return mLine
        .ssrcs
        .filter(function(ssrcInfo) { return ssrcInfo.id === ssrc; })
        .filter(function(ssrcInfo) { return ssrcInfo.attribute === attributeName; })
        .map(function(ssrcInfo) { return ssrcInfo.value; })[0];
}

//region Ctor

function Simulcast(options) {

    this.options = options ? options : {};

    if (!this.options.numOfLayers) {
        this.options.numOfLayers = DEFAULT_NUM_OF_LAYERS;
    }
    console.log("SdpSimulcast: using " + this.options.numOfLayers + " layers");

    /**
     * An IN-ORDER list of the simulcast ssrcs
     * @type {list<number>}
     */
    this.ssrcCache = [];
}

//endregion

//region Stateless private utility functions

/**
 * Returns a random integer between min (included) and max (excluded)
 * Using Math.round() gives a non-uniform distribution!
 * @returns {number}
 */
function generateSSRC() {
    var min = 0, max = 0xffffffff;
    return Math.floor(Math.random() * (max - min)) + min;
};

function processVideo(session, action) {
    if (session == null || !Array.isArray(session.media)) {
        return;
    }

    session.media.forEach(function (mLine) {
        if (mLine.type === 'video') {
            action(mLine);
        }
    });
};

function validateDescription(desc)
{
    return desc && desc != null
        && desc.type && desc.type != ''
        && desc.sdp && desc.sdp != '';
}

function explodeRemoteSimulcast(mLine) {

    if (!mLine || !Array.isArray(mLine.ssrcGroups)) {
        return;
    }

    var sources = parseSsrcs(mLine);
    var order = [];

    // Find the SIM group and explode its sources.
    var j = mLine.ssrcGroups.length;
    while (j--) {

        if (mLine.ssrcGroups[j].semantics !== 'SIM') {
            continue;
        }

        var simulcastSsrcs = mLine.ssrcGroups[j].ssrcs.split(' ');

        for (var i = 0; i < simulcastSsrcs.length; i++) {

            var ssrc = simulcastSsrcs[i];
            order.push(ssrc);

            var parts = sources[ssrc].msid.split(' ');
            sources[ssrc].msid = [parts[0], '/', i, ' ', parts[1], '/', i].join('');
            sources[ssrc].cname = [sources[ssrc].cname, '/', i].join('');

            // Remove all the groups that this SSRC participates in.
            mLine.ssrcGroups.forEach(function (relatedGroup) {
                if (relatedGroup.semantics === 'SIM') {
                    return;
                }

                var relatedSsrcs = relatedGroup.ssrcs.split(' ');
                if (relatedSsrcs.indexOf(ssrc) === -1) {
                    return;
                }

                // Nuke all the related SSRCs.
                relatedSsrcs.forEach(function (relatedSSRC) {
                    sources[relatedSSRC].msid = sources[ssrc].msid;
                    sources[relatedSSRC].cname = sources[ssrc].cname;
                    if (relatedSSRC !== ssrc) {
                        order.push(relatedSSRC);
                    }
                });

                // Schedule the related group for nuking.
            })
        }

        mLine.ssrcs = writeSsrcs(sources, order);
        mLine.ssrcGroups.splice(j, 1);
    };
}

function implodeRemoteSimulcast(mLine) {

    if (!mLine || !Array.isArray(mLine.ssrcGroups)) {
        console.info('Halt: There are no SSRC groups in the remote ' +
                'description.');
        return;
    }

    var sources = parseSsrcs(mLine);

    // Find the SIM group and nuke it.
    mLine.ssrcGroups.forEach(function (simulcastGroup) {
        if (simulcastGroup.semantics !== 'SIM') {
            return;
        }

        console.info("Imploding SIM group: " + simulcastGroup.ssrcs);
        // Schedule the SIM group for nuking.
        simulcastGroup.nuke = true;

        var simulcastSsrcs = simulcastGroup.ssrcs.split(' ');

        // Nuke all the higher layer SSRCs.
        for (var i = 1; i < simulcastSsrcs.length; i++) {

            var ssrc = simulcastSsrcs[i];
            delete sources[ssrc];

            // Remove all the groups that this SSRC participates in.
            mLine.ssrcGroups.forEach(function (relatedGroup) {
                if (relatedGroup.semantics === 'SIM') {
                    return;
                }

                var relatedSsrcs = relatedGroup.ssrcs.split(' ');
                if (relatedSsrcs.indexOf(ssrc) === -1) {
                    return;
                }

                // Nuke all the related SSRCs.
                relatedSsrcs.forEach(function (relatedSSRC) {
                    delete sources[relatedSSRC];
                });

                // Schedule the related group for nuking.
                relatedGroup.nuke = true;
            })
        }

        return;
    });

    mLine.ssrcs = writeSsrcs(sources);

    // Nuke all the scheduled groups.
    var i = mLine.ssrcGroups.length;
    while (i--) {
        if (mLine.ssrcGroups[i].nuke) {
            mLine.ssrcGroups.splice(i, 1);
        }
    }
}

function removeGoogConference(mLine) {
    if (!mLine || typeof mLine.xGoogleFlag === 'undefined') {
        return;
    }

    mLine.xGoogleFlag = undefined;
}

function assertGoogConference(mLine) {
    if (!mLine) {
        return;
    }

    if (!Array.isArray(mLine.invalid)) {
        mLine.invalid = [];
    }

    if (!mLine.invalid.some(
            function (i) { return i.value === 'x-google-flag:conference' })) {
        mLine.invalid.push({'value': 'x-google-flag:conference'});
    }
}

Simulcast.prototype.clearSsrcCache = function() {
    this.ssrcCache = [];
}

/**
 * When we start as video muted, all of the video
 *  ssrcs get generated so we can include them as part
 *  of the original session-accept.  That means we
 *  need this library to restore to those same ssrcs
 *  the first time we unmute, so we need the ability to
 *  force its cache
 */
Simulcast.prototype.setSsrcCache = function(ssrcs) {
    this.ssrcCache = ssrcs;
}

//endregion

//region "Private" functions

/**
 * Given a video mLine, return a list of the video ssrcs
 *  in simulcast layer order (returns a list of just
 *  the primary ssrc if there are no simulcast layers)
 */
Simulcast.prototype._parseSimLayers = function (mLine) {
    var simGroup = mLine.ssrcGroups &&
        mLine.ssrcGroups.find(function(group) { return group.semantics === "SIM"; });
    if (simGroup) {
        return simGroup.ssrcs
            .split(" ")
            .map(function(ssrcStr) { return parseInt(ssrcStr) });
    } else {
        return [mLine.ssrcs[0].id];
    }
}

Simulcast.prototype._buildNewToOldSsrcMap = function (newSsrcList, oldSsrcList) {
    var ssrcMap = {};
    for (var i = 0; i < newSsrcList.length; ++i) {
        var newSsrc = newSsrcList[i];
        var oldSsrc = oldSsrcList[i] || null;
        ssrcMap[newSsrc] = oldSsrc;
    }
    return ssrcMap;
}

Simulcast.prototype._fillInSourceDataFromCache = function(mLine) {
    console.log("SdpSimulcast restoring from cache: ", this.ssrcCache);
    var newSimSsrcs = this._parseSimLayers(mLine);
    console.log("SdpSimulcast Parsed new sim ssrcs: ", newSimSsrcs);
    var newMsid = getSsrcAttribute(mLine, newSimSsrcs[0], "msid");
    var newCname = getSsrcAttribute(mLine, newSimSsrcs[0], "cname");
    var ssrcsToReplace = this._buildNewToOldSsrcMap(newSimSsrcs, this.ssrcCache);
    console.log("SdpSimulcast built replacement map: ", ssrcsToReplace);
    // New sdp might only have 1 layer, so not every cached ssrc will have a new one
    //  to replace directly
    var ssrcsToAdd = this.ssrcCache
        .filter(function(ssrc) { return Object.values(ssrcsToReplace).indexOf(ssrc) === -1; });
    console.log("SdpSimulcast built ssrcs to add: ", ssrcsToAdd);

    // First do the replacements
    mLine.ssrcs.forEach(function(ssrc) {
        if (ssrcsToReplace[ssrc.id]) {
            ssrc.id = ssrcsToReplace[ssrc.id];
        }
    });
    // Now the adds
    ssrcsToAdd.forEach(function(ssrc) {
        mLine.ssrcs.push({
            id: ssrc,
            attribute: "msid",
            value: newMsid
        });
        mLine.ssrcs.push({
            id: ssrc,
            attribute: "cname",
            value: newCname
        });
    });
    mLine.ssrcGroups = mLine.ssrcGroups || [];
    mLine.ssrcGroups.push({
        semantics: "SIM",
        ssrcs: this.ssrcCache.join(" ")
    });
    return mLine;
}

Simulcast.prototype._generateSourceData = function(mLine, primarySsrc) {
    var addAssociatedStream = function(mLine, ssrc) {
        mLine.ssrcs.push({
            id: ssrc,
            attribute: "cname",
            value: primarySsrcCname
        });
        mLine.ssrcs.push({
            id: ssrc,
            attribute: "msid",
            value: primarySsrcMsid
        });
    }
    var primarySsrcMsid = getSsrcAttribute(mLine, primarySsrc, "msid");
    var primarySsrcCname = getSsrcAttribute(mLine, primarySsrc, "cname");

    // In Unified-plan mode, the a=ssrc lines with the msid attribute are not present
    // in the answers that Chrome and Safari generate for an offer received from Jicofo.
    // Generate these a=ssrc lines using the msid values from the a=msid line.
    if (this.options.usesUnifiedPlan && !primarySsrcMsid) {
        primarySsrcMsid = mLine.msid;
        var primarySsrcs = mLine.ssrcs;
        primarySsrcs.forEach(ssrc => {
            mLine.ssrcs.push({
                id: ssrc.id,
                attribute: "msid",
                value: primarySsrcMsid
            });
        });
    }

    // Generate sim layers
    var simSsrcs = [];
    for (var i = 0; i < this.options.numOfLayers - 1; ++i) {
        var simSsrc = generateSSRC();
        addAssociatedStream(mLine, simSsrc);
        simSsrcs.push(simSsrc);
    }
    mLine.ssrcGroups = mLine.ssrcGroups || [];
    mLine.ssrcGroups.push({
        semantics: "SIM",
        ssrcs: primarySsrc + " " + simSsrcs.join(" ")
    });
    return mLine;
}



// Assumptions:
//  1) 'mLine' contains only a single primary video source
//   (i.e. it will not already have simulcast streams inserted)
//  2) 'mLine' MAY already contain an RTX stream for its video source
//  3) 'mLine' is in sendrecv or sendonly state
// Guarantees:
//  1) return mLine will contain 2 additional simulcast layers
//   generated
//  2) if the base video ssrc in mLine has been seen before,
//   then the same generated simulcast streams from before will
//   be used again
//  3) if rtx is enabled for the mLine, all generated simulcast
//   streams will have rtx streams generated as well
//  4) if rtx has been generated for a src before, we will generate
//   the same rtx stream again
Simulcast.prototype._restoreSimulcast = function(mLine) {
    // First, find the primary video source in the given
    // mLine and see if we've seen it before.
    var primarySsrc;
    var numSsrcs = mLine.ssrcs && mLine.ssrcs
        .map(function(ssrcInfo) { return ssrcInfo.id; })
        .filter(function(ssrc, index, array) {
            return array.indexOf(ssrc) === index;
        })
        .length || 0;
    var numGroups = (mLine.ssrcGroups && mLine.ssrcGroups.length) || 0;

    if (numSsrcs === 0 || numSsrcs > 2) {
        // Unsupported scenario
        return mLine;
    }
    if (numSsrcs == 2 && numGroups === 0) {
        // Unsupported scenario
        return mLine;
    }

    if (numSsrcs === 1) {
        primarySsrc = mLine.ssrcs[0].id;
    } else {
        // There must be an FID group, so parse
        //  that and pull the primary ssrc from there
        var fidGroup = mLine.ssrcGroups.filter(function(group) { return group.semantics === "FID"; })[0];
        if (fidGroup) {
            primarySsrc = parseInt(fidGroup.ssrcs.split(" ")[0]);
        } else {
            // Unsupported scenario
            return mLine;
        }
    }
    console.log("SdpSimulcast: current ssrc cache: ", this.ssrcCache);
    console.log("SdpSimulcast: parsed primary ssrc " + primarySsrc);

    var seenPrimarySsrc = this.ssrcCache.indexOf(primarySsrc) !== -1;

    if (seenPrimarySsrc) {
        console.log("SdpSimulcast: Have seen primary ssrc before, " +
            "filling in data from cache");
        mLine = this._fillInSourceDataFromCache(mLine);
    } else {
        console.log("SdpSimulcast: Have not seen primary ssrc before, " +
            "generating source data");
        mLine = this._generateSourceData(mLine, primarySsrc);
    }
    // Now update the cache to match whatever we've just put into this sdp
    this.ssrcCache = this._parseSimLayers(mLine);
    return mLine;
}

//endregion

//region "Public" functions

/**
 *
 * @param desc
 * @param enableConferenceFlag
 * @returns {RTCSessionDescription}
 */
Simulcast.prototype.mungeRemoteDescription = function (desc, enableConferenceFlag) {

    if (!validateDescription(desc)) {
        return desc;
    }

    var session = transform.parse(desc.sdp);

    var self = this;
    processVideo(session, function (mLine) {

        // Handle simulcast reception.
        if (self.options.explodeRemoteSimulcast) {
            explodeRemoteSimulcast(mLine);
        } else {
            implodeRemoteSimulcast(mLine);
        }

        // Add or remove "x-google-conference" from the remote description based on whether the client
        // has enabled simulcast for the local video source. For cases where we disable simulcast for desktop share,
        // it is necessary to remove the flag so that Chrome stops sending T1 temporal layers. It also fixes other
        // issues related to screensharing like https://bugs.chromium.org/p/chromium/issues/detail?id=1093819.
        if (!self.options.usesUnifiedPlan && enableConferenceFlag) {
            assertGoogConference(mLine);
        } else {
            removeGoogConference(mLine);
        }
    });

    return new RTCSessionDescription({
        type: desc.type,
        sdp: transform.write(session)
    });
};

/**
 *
 * NOTE this method should be called only if simulcast is supported by
 * the current browser, otherwise local SDP should not be munged.
 * @param desc
 * @returns {RTCSessionDescription}
 */
Simulcast.prototype.mungeLocalDescription = function (desc) {

    if (!validateDescription(desc)) {
        return desc;
    }

    var session = transform.parse(desc.sdp);

    var self = this;
    processVideo(session, function (mLine) {
        if (mLine.direction == 'recvonly' || mLine.direction == 'inactive')
        {
            return;
        }
        self._restoreSimulcast(mLine);
    });

    return new RTCSessionDescription({
        type: desc.type,
        sdp: transform.write(session)
    });
};

//endregion

module.exports = Simulcast;
