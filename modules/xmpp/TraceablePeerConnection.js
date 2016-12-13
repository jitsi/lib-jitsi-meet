/* global mozRTCPeerConnection, webkitRTCPeerConnection */

import { getLogger } from "jitsi-meet-logger";
const logger = getLogger(__filename);
var RTC = require('../RTC/RTC');
var RTCBrowserType = require("../RTC/RTCBrowserType.js");
var XMPPEvents = require("../../service/xmpp/XMPPEvents");
var transform = require('sdp-transform');
var RandomUtil = require('../util/RandomUtil');
var GlobalOnErrorHandler = require("../util/GlobalOnErrorHandler");

var SIMULCAST_LAYERS = 3;

function TraceablePeerConnection(ice_config, constraints, session) {
    var self = this;
    this.session = session;
    this.replaceSSRCs = {
        "audio": [],
        "video": []
    };
    this.recvOnlySSRCs = {};
    var RTCPeerConnectionType = null;
    if (RTCBrowserType.isFirefox()) {
        RTCPeerConnectionType = mozRTCPeerConnection;
    } else if (RTCBrowserType.isTemasysPluginUsed()) {
        RTCPeerConnectionType = RTCPeerConnection;
    } else {
        RTCPeerConnectionType = webkitRTCPeerConnection;
    }
    this.peerconnection = new RTCPeerConnectionType(ice_config, constraints);
    this.updateLog = [];
    this.stats = {};
    this.statsinterval = null;
    this.maxstats = 0; // limit to 300 values, i.e. 5 minutes; set to 0 to disable
    var Interop = require('sdp-interop').Interop;
    this.interop = new Interop();
    var Simulcast = require('sdp-simulcast');
    this.simulcast = new Simulcast({numOfLayers: SIMULCAST_LAYERS,
        explodeRemoteSimulcast: false});
    this.eventEmitter = this.session.room.eventEmitter;

    // override as desired
    this.trace = function (what, info) {
        /*logger.warn('WTRACE', what, info);
        if (info && RTCBrowserType.isIExplorer()) {
            if (info.length > 1024) {
                logger.warn('WTRACE', what, info.substr(1024));
            }
            if (info.length > 2048) {
                logger.warn('WTRACE', what, info.substr(2048));
            }
        }*/
        self.updateLog.push({
            time: new Date(),
            type: what,
            value: info || ""
        });
    };
    this.onicecandidate = null;
    this.peerconnection.onicecandidate = function (event) {
        // FIXME: this causes stack overflow with Temasys Plugin
        if (!RTCBrowserType.isTemasysPluginUsed())
            self.trace('onicecandidate', JSON.stringify(event.candidate, null, ' '));
        if (self.onicecandidate !== null) {
            self.onicecandidate(event);
        }
    };
    this.onaddstream = null;
    this.peerconnection.onaddstream = function (event) {
        self.trace('onaddstream', event.stream.id);
        if (self.onaddstream !== null) {
            self.onaddstream(event);
        }
    };
    this.onremovestream = null;
    this.peerconnection.onremovestream = function (event) {
        self.trace('onremovestream', event.stream.id);
        if (self.onremovestream !== null) {
            self.onremovestream(event);
        }
    };
    this.onsignalingstatechange = null;
    this.peerconnection.onsignalingstatechange = function (event) {
        self.trace('onsignalingstatechange', self.signalingState);
        if (self.onsignalingstatechange !== null) {
            self.onsignalingstatechange(event);
        }
    };
    this.oniceconnectionstatechange = null;
    this.peerconnection.oniceconnectionstatechange = function (event) {
        self.trace('oniceconnectionstatechange', self.iceConnectionState);
        if (self.oniceconnectionstatechange !== null) {
            self.oniceconnectionstatechange(event);
        }
    };
    this.onnegotiationneeded = null;
    this.peerconnection.onnegotiationneeded = function (event) {
        self.trace('onnegotiationneeded');
        if (self.onnegotiationneeded !== null) {
            self.onnegotiationneeded(event);
        }
    };
    self.ondatachannel = null;
    this.peerconnection.ondatachannel = function (event) {
        self.trace('ondatachannel', event);
        if (self.ondatachannel !== null) {
            self.ondatachannel(event);
        }
    };
    // XXX: do all non-firefox browsers which we support also support this?
    if (!RTCBrowserType.isFirefox() && this.maxstats) {
        this.statsinterval = window.setInterval(function() {
            self.peerconnection.getStats(function(stats) {
                var results = stats.result();
                var now = new Date();
                for (var i = 0; i < results.length; ++i) {
                    results[i].names().forEach(function (name) {
                        var id = results[i].id + '-' + name;
                        if (!self.stats[id]) {
                            self.stats[id] = {
                                startTime: now,
                                endTime: now,
                                values: [],
                                times: []
                            };
                        }
                        self.stats[id].values.push(results[i].stat(name));
                        self.stats[id].times.push(now.getTime());
                        if (self.stats[id].values.length > self.maxstats) {
                            self.stats[id].values.shift();
                            self.stats[id].times.shift();
                        }
                        self.stats[id].endTime = now;
                    });
                }
            });

        }, 1000);
    }
}

/**
 * Returns a string representation of a SessionDescription object.
 */
var dumpSDP = function(description) {
    if (typeof description === 'undefined' || description == null) {
        return '';
    }

    return 'type: ' + description.type + '\r\n' + description.sdp;
};

// cachedSsrcInfo = {
//   <media_type>: {
//      "groups": [
//          {
//              "primarySSRC": ...,
//              "group": {
//                  "semantics": "...",
//                  "ssrcs": "..., ..."
//              }
//          },
//      ],
//      "ssrcs": [...]
//   },
// }
TraceablePeerConnection.prototype.buildSsrcMap = function(cachedSsrcInfo, newSdp) {
    var parsedNewDesc = transform.parse(newSdp);
    var ssrcMap = {};

    var isSimGroup = (group) => group.semantics === "SIM";
    var isFidGroup = (group) => group.semantics === "FID";

    parsedNewDesc.media.forEach(function(mediaDescription) {
        if (!cachedSsrcInfo[mediaDescription.type]) {
            return {};
        }
        var cachedMediaSsrcInfo = cachedSsrcInfo[mediaDescription.type];
        // First map any ssrcs that are not members of groups

        // Find cached ssrcs that aren't in groups
        let cachedSsrcsNotInGroups = cachedMediaSsrcInfo.ssrcs.filter(function(ssrc) {
            if (cachedMediaSsrcInfo.groups) {
                cachedMediaSsrcInfo.groups.map(groupInfo => groupInfo.group).forEach(function(group) {
                    if (group.ssrcs.indexOf(ssrc) !== -1) {
                        return false;
                    }
                });
            }
            return true;
        });

        // Find new ssrcs that aren't in groups
        // (mediaDescription.ssrcs is a list of ssrc sdp lines, map and filter it
        // down to a unique list of ssrcs)
        let newSsrcs = mediaDescription.ssrcs.map(ssrcInfo => ssrcInfo.id).filter(
            (ssrc, index, array) => array.indexOf(ssrc) === index);
        let newSsrcsNotInGroups = newSsrcs.filter(function(ssrc) {
            if (mediaDescription.ssrcGroups) {
                mediaDescription.ssrcGroups.forEach(function(group) {
                    if (group.ssrcs.indexOf(ssrc) !== -1) {
                        return false;
                    }
                });
            }
            return true;
        });
        if (cachedSsrcsNotInGroups.length !== newSsrcsNotInGroups.length) {
            logger.warn("Cache has " + cachedSsrcsNotInGroups.length + " ungrouped ssrcs but " +
                "new sdp has " + newSsrcsNotInGroups.length + " ungrouped ssrcs");
            return {};
        }
        // Now do a dumb match across any ungrouped ssrcs based on the order we found them
        for (let i = 0; i < newSsrcsNotInGroups.length; ++i) {
            let newSsrc = newSsrcsNotInGroups[i];
            let cachedSsrc = cachedSsrcsNotInGroups[i];
            ssrcMap[newSsrc] = cachedSsrc;
        }

        cachedMediaSsrcInfo.groups = cachedMediaSsrcInfo.groups || [];
        // Now match simulcast grouped ssrcs
        let cachedSimGroups = cachedMediaSsrcInfo.groups.map(groupInfo => groupInfo.group).filter(isSimGroup);
        if (cachedSimGroups.length) {
            if (cachedSimGroups.length > 1) {
                logger.warn("Cache has more than one simulcast group, can't do mappings");
                return {};
            }
            let cachedSimGroup = cachedSimGroups[0];
            mediaDescription.ssrcGroups = mediaDescription.ssrcGroups || [];
            let newSimGroups = mediaDescription.ssrcGroups.filter(isSimGroup);
            if (newSimGroups) {
                if (newSimGroups.length > 1) {
                    logger.warn("New description has more than one simulcast group, can't do mappings");
                    return {};
                }
                let newSimGroup = newSimGroups[0];
                let cachedSimSsrcs = cachedSimGroup.ssrcs.split(" ");
                let newSimSsrcs = newSimGroup.ssrcs.split(" ");
                for (let i = 0; i < newSimSsrcs.length; ++i) {
                    ssrcMap[newSimSsrcs[i]] = cachedSimSsrcs[i];
                }
            }
        }
        // All primary ssrcs should be mapped at this point, so now do FID groups
        let cachedFidGroups = cachedMediaSsrcInfo.groups.map(groupInfo => groupInfo.group).filter(isFidGroup);
        let findFidGroupByPrimarySsrc = function(primarySsrc) {
            for (let i = 0; i < cachedFidGroups.length; ++i) {
                if (cachedFidGroups[i].ssrcs.split(" ")[0] === primarySsrc) {
                    return cachedFidGroups[i];
                }
            }
        };
        if (cachedFidGroups.length) {
            let newFidGroups = mediaDescription.ssrcGroups.filter(isFidGroup);
            for (let i = 0; i < newFidGroups.length; ++i) {
                let groupPrimarySsrc = newFidGroups[i].ssrcs.split(" ")[0];
                let groupSecondarySsrc = newFidGroups[i].ssrcs.split(" ")[1];
                // First map the primary ssrc of this group to its original ssrc
                let mappedPrimarySsrc = ssrcMap[groupPrimarySsrc];
                if (mappedPrimarySsrc) {
                    // Now we can find which ssrc the original is mapped to, and add a mapping from the new
                    //  secondary ssrc to the original secondary ssrc
                    var originalFidGroup = findFidGroupByPrimarySsrc(mappedPrimarySsrc);
                    if (originalFidGroup) {
                        let originalSecondarySsrc = originalFidGroup.ssrcs.split(" ")[1];
                        ssrcMap[groupSecondarySsrc] = originalSecondarySsrc;
                    }
                }
            }
        }
    });
    return ssrcMap;
};

/**
 * Injects receive only SSRC in the sdp if there are not other SSRCs.
 * @param desc the SDP that will be modified.
 * @returns the modified SDP.
 */
TraceablePeerConnection.prototype.ssrcReplacement = function (desc) {
    if (typeof desc !== 'object' || desc === null ||
        typeof desc.sdp !== 'string') {
        logger.warn('An empty description was passed as an argument.');
        return desc;
    }

    var session = transform.parse(desc.sdp);
    if (!Array.isArray(session.media))
    {
        return;
    }

    var modded = false;
    session.media.forEach(function (bLine) {
        if(!this.replaceSSRCs[bLine.type])
            return;

        modded = true;
        var SSRCs = this.replaceSSRCs[bLine.type].splice(0,1);
        while(SSRCs &&
            SSRCs.length){
            var ssrcOperation = SSRCs[0];
            switch(ssrcOperation.type) {
                case "mute":
                case "addMuted": {
                //FIXME: If we want to support multiple streams we have to add
                // recv-only ssrcs for the
                // muted streams on every change until the stream is unmuted
                // or removed. Otherwise the recv-only streams won't be included
                // in the SDP
                    if(!bLine.ssrcs)
                        bLine.ssrcs = [];
                    const groups = ssrcOperation.ssrc.groups;
                    let ssrc = null;
                    if(groups && groups.length) {
                        ssrc = groups[0].primarySSRC;
                    } else if(ssrcOperation.ssrc.ssrcs &&
                        ssrcOperation.ssrc.ssrcs.length) {
                        ssrc = ssrcOperation.ssrc.ssrcs[0];
                    } else {
                        GlobalOnErrorHandler.callErrorHandler(
                            new Error("SSRC replacement error!"));
                        logger.error("SSRC replacement error!");
                        break;
                    }
                    bLine.ssrcs.push({
                        id: ssrc,
                        attribute: 'cname',
                        value: ['recvonly-', ssrc].join('')
                    });
                    // If this is executed for another reason we are going to
                    // include that ssrc as receive only again instead of
                    // generating new one. Here we are assuming that we have
                    // only 1 video stream that is muted.
                    this.recvOnlySSRCs[bLine.type] = ssrc;
                    break;
                }
                case "unmute": {
                    if(!ssrcOperation.ssrc || !ssrcOperation.ssrc.ssrcs ||
                        !ssrcOperation.ssrc.ssrcs.length)
                        break;
                    var ssrcMap = this.buildSsrcMap({"video": ssrcOperation.ssrc}, desc.sdp);
                    bLine.ssrcs.forEach(function (ssrc) {
                        if(ssrcMap[ssrc.id]) {
                            ssrc.id = ssrcMap[ssrc.id];
                        }
                    });
                    if (bLine.ssrcGroups) {
                        bLine.ssrcGroups.forEach(function (group) {
                            // semantics and ssrc (string)
                            //replace the instances of all ssrcs in the groups field with their mappings
                            Object.keys(ssrcMap).forEach(function(ssrcToReplace) {
                                let ssrcToReplaceStr = ssrcToReplace + "";
                                if (group.ssrcs.indexOf(ssrcToReplaceStr) != -1) {
                                    group.ssrcs = group.ssrcs.replace(ssrcToReplaceStr, ssrcMap[ssrcToReplace]);
                                }
                            });
                        });
                    }
                    break;
                }
                default:
                    break;
            }
            SSRCs = this.replaceSSRCs[bLine.type].splice(0,1);
        }

        if (!Array.isArray(bLine.ssrcs) || bLine.ssrcs.length === 0)
        {
            const ssrc = this.recvOnlySSRCs[bLine.type]
                = this.recvOnlySSRCs[bLine.type] ||
                    RandomUtil.randomInt(1, 0xffffffff);
            bLine.ssrcs = [{
                id: ssrc,
                attribute: 'cname',
                value: ['recvonly-', ssrc].join('')
            }];
        }
    }.bind(this));

    return (!modded) ? desc : new RTCSessionDescription({
        type: desc.type,
        sdp: transform.write(session),
    });
};

/**
 * Returns map with keys msid and values ssrc.
 * @param desc the SDP that will be modified.
 */
function extractSSRCMap(desc) {
    if (typeof desc !== 'object' || desc === null ||
        typeof desc.sdp !== 'string') {
        logger.warn('An empty description was passed as an argument.');
        return desc;
    }

    var ssrcList = {};
    var ssrcGroups = {};
    var session = transform.parse(desc.sdp);
    if (!Array.isArray(session.media))
    {
        return;
    }

    session.media.forEach(function (bLine) {
        if (!Array.isArray(bLine.ssrcs))
        {
            return;
        }

        if (typeof bLine.ssrcGroups !== 'undefined' &&
            Array.isArray(bLine.ssrcGroups)) {
            bLine.ssrcGroups.forEach(function (group) {
                if (typeof group.semantics !== 'undefined' &&
                    typeof group.ssrcs !== 'undefined') {
                    var primarySSRC = Number(group.ssrcs.split(' ')[0]);
                    ssrcGroups[primarySSRC] = ssrcGroups[primarySSRC] || [];
                    ssrcGroups[primarySSRC].push(group);
                }
            });
        }
        bLine.ssrcs.forEach(function (ssrc) {
            if(ssrc.attribute !== 'msid')
                return;
            ssrcList[ssrc.value] = ssrcList[ssrc.value] ||
                {groups: [], ssrcs: []};
            ssrcList[ssrc.value].ssrcs.push(ssrc.id);
            if(ssrcGroups[ssrc.id]){
                ssrcGroups[ssrc.id].forEach(function (group) {
                    ssrcList[ssrc.value].groups.push(
                        {primarySSRC: ssrc.id, group: group});
                });
            }
        });
    });

    return ssrcList;
}

/**
 * Takes a SessionDescription object and returns a "normalized" version.
 * Currently it only takes care of ordering the a=ssrc lines.
 */
var normalizePlanB = function(desc) {
    if (typeof desc !== 'object' || desc === null ||
        typeof desc.sdp !== 'string') {
        logger.warn('An empty description was passed as an argument.');
        return desc;
    }

    var transform = require('sdp-transform');
    var session = transform.parse(desc.sdp);

    if (typeof session !== 'undefined' &&
        typeof session.media !== 'undefined' && Array.isArray(session.media)) {
        session.media.forEach(function (mLine) {

            // Chrome appears to be picky about the order in which a=ssrc lines
            // are listed in an m-line when rtx is enabled (and thus there are
            // a=ssrc-group lines with FID semantics). Specifically if we have
            // "a=ssrc-group:FID S1 S2" and the "a=ssrc:S2" lines appear before
            // the "a=ssrc:S1" lines, SRD fails.
            // So, put SSRC which appear as the first SSRC in an FID ssrc-group
            // first.
            var firstSsrcs = [];
            var newSsrcLines = [];

            if (typeof mLine.ssrcGroups !== 'undefined' &&
                Array.isArray(mLine.ssrcGroups)) {
                mLine.ssrcGroups.forEach(function (group) {
                    if (typeof group.semantics !== 'undefined' &&
                        group.semantics === 'FID') {
                        if (typeof group.ssrcs !== 'undefined') {
                            firstSsrcs.push(Number(group.ssrcs.split(' ')[0]));
                        }
                    }
                });
            }

            if (typeof mLine.ssrcs !== 'undefined' && Array.isArray(mLine.ssrcs)) {
                var i;
                for (i = 0; i<mLine.ssrcs.length; i++){
                    if (typeof mLine.ssrcs[i] === 'object'
                        && typeof mLine.ssrcs[i].id !== 'undefined'
                        && firstSsrcs.indexOf(mLine.ssrcs[i].id) >= 0) {
                        newSsrcLines.push(mLine.ssrcs[i]);
                        delete mLine.ssrcs[i];
                    }
                }

                for (i = 0; i<mLine.ssrcs.length; i++){
                    if (typeof mLine.ssrcs[i] !== 'undefined') {
                        newSsrcLines.push(mLine.ssrcs[i]);
                    }
                }

                mLine.ssrcs = newSsrcLines;
            }
        });
    }

    var resStr = transform.write(session);
    return new RTCSessionDescription({
        type: desc.type,
        sdp: resStr
    });
};

var getters = {
    signalingState: function () {
        return this.peerconnection.signalingState;
    },
    iceConnectionState: function () {
        return this.peerconnection.iceConnectionState;
    },
    localDescription:  function() {
        var desc = this.peerconnection.localDescription;

        this.trace('getLocalDescription::preTransform', dumpSDP(desc));

        // if we're running on FF, transform to Plan B first.
        if (RTCBrowserType.usesUnifiedPlan()) {
            desc = this.interop.toPlanB(desc);
            this.trace('getLocalDescription::postTransform (Plan B)',
                dumpSDP(desc));
        }
        return desc;
    },
    remoteDescription:  function() {
        var desc = this.peerconnection.remoteDescription;
        this.trace('getRemoteDescription::preTransform', dumpSDP(desc));

        // if we're running on FF, transform to Plan B first.
        if (RTCBrowserType.usesUnifiedPlan()) {
            desc = this.interop.toPlanB(desc);
            this.trace('getRemoteDescription::postTransform (Plan B)', dumpSDP(desc));
        }
        return desc;
    }
};
Object.keys(getters).forEach(function (prop) {
    Object.defineProperty(
        TraceablePeerConnection.prototype,
        prop, {
            get: getters[prop]
        }
    );
});

TraceablePeerConnection.prototype.addStream = function (stream, ssrcInfo) {
    this.trace('addStream', stream? stream.id : "null");
    if(stream)
        this.peerconnection.addStream(stream);
    if(ssrcInfo && this.replaceSSRCs[ssrcInfo.mtype]) {
        this.replaceSSRCs[ssrcInfo.mtype].push(ssrcInfo);
    }
};

TraceablePeerConnection.prototype.removeStream = function (stream, stopStreams,
ssrcInfo) {
    this.trace('removeStream', stream.id);
    if(stopStreams) {
        RTC.stopMediaStream(stream);
    }
    // FF doesn't support this yet.
    if (this.peerconnection.removeStream) {
        this.peerconnection.removeStream(stream);
        // Removing all cached ssrcs for the streams that are removed or
        // muted.
        if(ssrcInfo && this.replaceSSRCs[ssrcInfo.mtype]) {
            for(var i = 0; i < this.replaceSSRCs[ssrcInfo.mtype].length; i++) {
                var op = this.replaceSSRCs[ssrcInfo.mtype][i];
                if(op.type === "unmute" &&
                    op.ssrc.ssrcs.join("_") ===
                    ssrcInfo.ssrc.ssrcs.join("_")) {
                    this.replaceSSRCs[ssrcInfo.mtype].splice(i, 1);
                    break;
                }
            }
            this.replaceSSRCs[ssrcInfo.mtype].push(ssrcInfo);
        }
    }
};

TraceablePeerConnection.prototype.createDataChannel = function (label, opts) {
    this.trace('createDataChannel', label, opts);
    return this.peerconnection.createDataChannel(label, opts);
};

TraceablePeerConnection.prototype.setLocalDescription
        = function (description, successCallback, failureCallback) {
    this.trace('setLocalDescription::preTransform', dumpSDP(description));
    // if we're running on FF, transform to Plan A first.
    if (RTCBrowserType.usesUnifiedPlan()) {
        description = this.interop.toUnifiedPlan(description);
        this.trace('setLocalDescription::postTransform (Plan A)',
            dumpSDP(description));
    }

    var self = this;
    this.peerconnection.setLocalDescription(description,
        function () {
            self.trace('setLocalDescriptionOnSuccess');
            successCallback();
        },
        function (err) {
            self.trace('setLocalDescriptionOnFailure', err);
            self.eventEmitter.emit(XMPPEvents.SET_LOCAL_DESCRIPTION_FAILED,
                err, self.peerconnection);
            failureCallback(err);
        }
    );
};

// TODO(brian): maybe this makes sense as an optional "stripRtxGroups" method
// in interop?
var stripRtxGroups = function(description) {
    let parsedDescription = transform.parse(description.sdp);
    let videoDescription = parsedDescription.media.filter(desc => desc.type === "video")[0];
    if (videoDescription && videoDescription.ssrcGroups) {
        let rtxSsrcs = [];
        videoDescription.ssrcGroups.forEach(function(ssrcGroup) {
            if (ssrcGroup.semantics === "FID") {
                rtxSsrcs.push(ssrcGroup.ssrcs.split(" ")[1]);
            }
        });
        videoDescription.ssrcGroups = videoDescription.ssrcGroups.filter(function(ssrcGroup) {
            return ssrcGroup.semantics !== "FID";
        });
        videoDescription.ssrcs = videoDescription.ssrcs.filter(function(ssrcInfo) {
            return rtxSsrcs.indexOf(ssrcInfo.id + "") === -1;
        });
    }
    description.sdp = transform.write(parsedDescription);
    return description;
};

TraceablePeerConnection.prototype.setRemoteDescription
        = function (description, successCallback, failureCallback) {
    this.trace('setRemoteDescription::preTransform', dumpSDP(description));
    // TODO the focus should squeze or explode the remote simulcast
    description = this.simulcast.mungeRemoteDescription(description);
    this.trace('setRemoteDescription::postTransform (simulcast)', dumpSDP(description));

    // if we're running on FF, strip out and RTX groups
    if (RTCBrowserType.isFirefox()) {
        description = stripRtxGroups(description);
        this.trace('setRemoteDescription::postTransform (strip rtx)', dumpSDP(description));
    }

    // if we're running on FF, transform to Plan A first.
    if (RTCBrowserType.usesUnifiedPlan()) {
        description = this.interop.toUnifiedPlan(description);
        this.trace('setRemoteDescription::postTransform (Plan A)', dumpSDP(description));
    }

    if (RTCBrowserType.usesPlanB()) {
        description = normalizePlanB(description);
    }

    var self = this;
    this.peerconnection.setRemoteDescription(description,
        function () {
            self.trace('setRemoteDescriptionOnSuccess');
            successCallback();
        },
        function (err) {
            self.trace('setRemoteDescriptionOnFailure', err);
            self.eventEmitter.emit(XMPPEvents.SET_REMOTE_DESCRIPTION_FAILED,
                err, self.peerconnection);
            failureCallback(err);
        }
    );
    /*
     if (this.statsinterval === null && this.maxstats > 0) {
     // start gathering stats
     }
     */
};

TraceablePeerConnection.prototype.close = function () {
    this.trace('stop');
    if (this.statsinterval !== null) {
        window.clearInterval(this.statsinterval);
        this.statsinterval = null;
    }
    this.peerconnection.close();
};

TraceablePeerConnection.prototype.createAnswer
        = function (successCallback, failureCallback, constraints) {
    var self = this;
    this.trace('createAnswer', JSON.stringify(constraints, null, ' '));
    this.peerconnection.createAnswer(
        function (answer) {
            try {
                self.trace(
                    'createAnswerOnSuccess::preTransform', dumpSDP(answer));
                // if we're running on FF, transform to Plan A first.
                if (RTCBrowserType.usesUnifiedPlan()) {
                    answer = self.interop.toPlanB(answer);
                    self.trace('createAnswerOnSuccess::postTransform (Plan B)',
                        dumpSDP(answer));
                }

                if (!self.session.room.options.disableSimulcast
                    && self.simulcast.isSupported()) {
                    answer = self.simulcast.mungeLocalDescription(answer);
                    self.trace(
                        'createAnswerOnSuccess::postTransform (simulcast)',
                        dumpSDP(answer));
                }

                if (!RTCBrowserType.isFirefox())
                {
                    answer = self.ssrcReplacement(answer);
                    self.trace('createAnswerOnSuccess::mungeLocalVideoSSRC',
                        dumpSDP(answer));
                }

                self.eventEmitter.emit(XMPPEvents.SENDRECV_STREAMS_CHANGED,
                    extractSSRCMap(answer));

                successCallback(answer);
            } catch (e) {
                // there can be error modifying the answer, for example
                // for ssrcReplacement there was a track with ssrc that is null
                // and if we do not catch the error no callback is called
                // at all
                self.trace('createAnswerOnError', e);
                self.trace('createAnswerOnError', dumpSDP(answer));
                logger.error('createAnswerOnError', e, dumpSDP(answer));
                failureCallback(e);
            }
        },
        function(err) {
            self.trace('createAnswerOnFailure', err);
            self.eventEmitter.emit(XMPPEvents.CREATE_ANSWER_FAILED, err,
                self.peerconnection);
            failureCallback(err);
        },
        constraints
    );
};

TraceablePeerConnection.prototype.addIceCandidate
        // eslint-disable-next-line no-unused-vars
        = function (candidate, successCallback, failureCallback) {
    //var self = this;
    this.trace('addIceCandidate', JSON.stringify(candidate, null, ' '));
    this.peerconnection.addIceCandidate(candidate);
    /* maybe later
     this.peerconnection.addIceCandidate(candidate,
     function () {
     self.trace('addIceCandidateOnSuccess');
     successCallback();
     },
     function (err) {
     self.trace('addIceCandidateOnFailure', err);
     failureCallback(err);
     }
     );
     */
};

TraceablePeerConnection.prototype.getStats = function(callback, errback) {
    // TODO: Is this the correct way to handle Opera, Temasys?
    if (RTCBrowserType.isFirefox()
            || RTCBrowserType.isTemasysPluginUsed()
            || RTCBrowserType.isReactNative()) {
        // ignore for now...
        if(!errback)
            errback = function () {};
        this.peerconnection.getStats(null, callback, errback);
    } else {
        this.peerconnection.getStats(callback);
    }
};

/**
 * Generate ssrc info object for a stream with the following properties:
 * - ssrcs - Array of the ssrcs associated with the stream.
 * - groups - Array of the groups associated with the stream.
 */
TraceablePeerConnection.prototype.generateNewStreamSSRCInfo = function () {
    var ssrcInfo = {
        ssrcs: [],
        groups: []
    };
    let generateSsrc = () => RandomUtil.randomInt(1, 0xffffffff);
    if (!this.session.room.options.disableSimulcast
        && this.simulcast.isSupported()) {
        ssrcInfo = {ssrcs: [], groups: []};
        for(var i = 0; i < SIMULCAST_LAYERS; i++) {
            ssrcInfo.ssrcs.push(generateSsrc());
        }
        ssrcInfo.groups.push({
            primarySSRC: ssrcInfo.ssrcs[0],
            group: {ssrcs: ssrcInfo.ssrcs.join(" "), semantics: "SIM"}});
    } else {
        // If we didn't add any simulcast ssrcs, just add a single one
        ssrcInfo.ssrcs.push(generateSsrc());
    }
    if (!this.session.room.options.disableRtx) {
        // If RTX is enabled, we'll add a corresponding rtx stream for
        // every generated stream
        let rtxSsrcs = [];
        ssrcInfo.ssrcs.forEach(function(ssrc) {
            let rtxSsrc = generateSsrc();
            rtxSsrcs.push(rtxSsrc);
            ssrcInfo.groups.push({
                primarySSRC: ssrc,
                group: {
                    semantics: "FID",
                    ssrcs: ssrc + " " + rtxSsrc
                }
            });
        });
        rtxSsrcs.forEach(rtxSsrc => ssrcInfo.ssrcs.push(rtxSsrc));
    }
    
    return ssrcInfo;
};

module.exports = TraceablePeerConnection;
module.exports.stripRtxGroups = stripRtxGroups;
