/* global $ */
var RTC = require('../RTC/RTC');
var logger = require("jitsi-meet-logger").getLogger(__filename);
var RTCBrowserType = require("../RTC/RTCBrowserType.js");
var XMPPEvents = require("../../service/xmpp/XMPPEvents");
var transform = require('sdp-transform');
var RandomUtil = require('../util/RandomUtil');

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

/**
 * Injects receive only SSRC in the sdp if there are not other SSRCs.
 * @param desc the SDP that will be modified.
 * @returns the modified SDP.
 */
TraceablePeerConnection.prototype.ssrcReplacement = function (desc) {
    if (typeof desc !== 'object' || desc === null ||
        typeof desc.sdp !== 'string') {
        console.warn('An empty description was passed as an argument.');
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
        // Stores all SSRCs that should be used on other SRD/SDL operations.
        // For every stream that is unmuted we need to replace it SSRC
        // otherwise we are going to send jingle packet.
        var permSSRCs = [];
        //FIXME: The code expects that we have only SIM group or we
        // don't have any groups and we have only one SSRC per
        // stream. If we add another groups (FID, etc) this code
        // must be changed.
        while(SSRCs &&
            SSRCs.length){
            var ssrcOperation = SSRCs[0];
            switch(ssrcOperation.type) {
                case "mute":
                case "addMuted":
                //FIXME: If we want to support multiple streams we have to add
                // recv-only ssrcs for the
                // muted streams on every change until the stream is unmuted
                // or removed. Otherwise the recv-only streams won't be included
                // in the SDP
                    if(!bLine.ssrcs)
                        bLine.ssrcs = [];
                    var groups = ssrcOperation.ssrc.groups;
                    var ssrc = null;
                    if(groups && groups.length) {
                        ssrc = groups[0].primarySSRC;
                    } else if(ssrcOperation.ssrc.ssrcs &&
                        ssrcOperation.ssrc.ssrcs.length) {
                        ssrc = ssrcOperation.ssrc.ssrcs[0];
                    } else {
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
                case "unmute":
                    if(!ssrcOperation.ssrc || !ssrcOperation.ssrc.ssrcs ||
                        !ssrcOperation.ssrc.ssrcs.length)
                        break;
                    var ssrcMap = {};
                    var ssrcLastIdx = ssrcOperation.ssrc.ssrcs.length - 1;
                    for(var i = 0; i < bLine.ssrcs.length; i++) {
                        var ssrc = bLine.ssrcs[i];
                        if (ssrc.attribute !== 'msid' &&
                            ssrc.value !== ssrcOperation.msid) {
                            continue;
                        }
                        ssrcMap[ssrc.id] =
                            ssrcOperation.ssrc.ssrcs[ssrcLastIdx];
                        ssrcLastIdx--;
                        if(ssrcLastIdx < 0)
                            break;
                    }
                    var groups = ssrcOperation.ssrc.groups;
                    if (typeof bLine.ssrcGroups !== 'undefined' &&
                        Array.isArray(bLine.ssrcGroups) && groups &&
                        groups.length) {
                        bLine.ssrcGroups.forEach(function (group) {
                            if(!group.ssrcs)
                                return;
                            var currentSSRCs = group.ssrcs.split(" ");
                            var newGroup = null;
                            for(var i = 0; i < groups.length; i++) {
                                newGroup = groups[i].group;
                                var newSSRCs = newGroup.ssrcs.split(" ");
                                if(newGroup.semantics !== group.semantics)
                                    continue;
                                var wrongGroup = false;
                                for(var j = 0; j < currentSSRCs.length; j++) {
                                    if(newGroup.ssrcs.indexOf(
                                        ssrcMap[currentSSRCs[j]]) === -1){
                                        wrongGroup = true;
                                        break;
                                    }
                                }
                                if(!wrongGroup) {
                                    for(j = 0; j < newSSRCs.length; j++) {
                                        ssrcMap[currentSSRCs[j]] = newSSRCs[j];
                                    }
                                    break;
                                }
                            }

                            group.ssrcs = newGroup.ssrcs;
                        });
                    }
                    bLine.ssrcs.forEach(function (ssrc) {
                        if(ssrcMap[ssrc.id]) {
                            ssrc.id = ssrcMap[ssrc.id];
                        }
                    });
                    // Storing the unmuted SSRCs.
                    permSSRCs.push(ssrcOperation);
                    break;
                default:
                break;
            }
            SSRCs = this.replaceSSRCs[bLine.type].splice(0,1);
        }
        // Restoring the unmuted SSRCs.
        this.replaceSSRCs[bLine.type] = permSSRCs;

        if (!Array.isArray(bLine.ssrcs) || bLine.ssrcs.length === 0)
        {
            var ssrc = this.recvOnlySSRCs[bLine.type]
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
        console.warn('An empty description was passed as an argument.');
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
    try
    {
        if(stream)
            this.peerconnection.addStream(stream);
        if(ssrcInfo && this.replaceSSRCs[ssrcInfo.mtype])
            this.replaceSSRCs[ssrcInfo.mtype].push(ssrcInfo);
    }
    catch (e)
    {
        logger.error(e);
    }
};

TraceablePeerConnection.prototype.removeStream = function (stream, stopStreams,
ssrcInfo) {
    this.trace('removeStream', stream.id);
    if(stopStreams) {
        RTC.stopMediaStream(stream);
    }

    try {
        // FF doesn't support this yet.
        if (this.peerconnection.removeStream) {
            this.peerconnection.removeStream(stream);
            // Removing all cached ssrcs for the streams that are removed or
            // muted.
            if(ssrcInfo && this.replaceSSRCs[ssrcInfo.mtype]) {
                for(i = 0; i < this.replaceSSRCs[ssrcInfo.mtype].length; i++) {
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
    } catch (e) {
        logger.error(e);
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

TraceablePeerConnection.prototype.setRemoteDescription
        = function (description, successCallback, failureCallback) {
    this.trace('setRemoteDescription::preTransform', dumpSDP(description));
    // TODO the focus should squeze or explode the remote simulcast
    description = this.simulcast.mungeRemoteDescription(description);
    this.trace('setRemoteDescription::postTransform (simulcast)', dumpSDP(description));

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
            self.trace('createAnswerOnSuccess::preTransform', dumpSDP(answer));
            // if we're running on FF, transform to Plan A first.
            if (RTCBrowserType.usesUnifiedPlan()) {
                answer = self.interop.toPlanB(answer);
                self.trace('createAnswerOnSuccess::postTransform (Plan B)',
                    dumpSDP(answer));
            }

            if (!self.session.room.options.disableSimulcast
                && self.simulcast.isSupported()) {
                answer = self.simulcast.mungeLocalDescription(answer);
                self.trace('createAnswerOnSuccess::postTransform (simulcast)',
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
    if (RTCBrowserType.isFirefox() || RTCBrowserType.isTemasysPluginUsed()) {
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
    if (!this.session.room.options.disableSimulcast
        && this.simulcast.isSupported()) {
        var ssrcInfo = {ssrcs: [], groups: []};
        for(var i = 0; i < SIMULCAST_LAYERS; i++)
            ssrcInfo.ssrcs.push(RandomUtil.randomInt(1, 0xffffffff));
        ssrcInfo.groups.push({
            primarySSRC: ssrcInfo.ssrcs[0],
            group: {ssrcs: ssrcInfo.ssrcs.join(" "), semantics: "SIM"}});
        return ssrcInfo;
    } else {
        return {ssrcs: [RandomUtil.randomInt(1, 0xffffffff)], groups: []};
    }
};

module.exports = TraceablePeerConnection;
