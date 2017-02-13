/* global mozRTCPeerConnection, webkitRTCPeerConnection */

import { getLogger } from "jitsi-meet-logger";
const logger = getLogger(__filename);
import SdpConsistency from "./SdpConsistency.js";
import RtxModifier from "./RtxModifier.js";
var RTCBrowserType = require("../RTC/RTCBrowserType.js");
var XMPPEvents = require("../../service/xmpp/XMPPEvents");
var transform = require('sdp-transform');
var SDP = require("./SDP");
var SDPUtil = require("./SDPUtil");

var SIMULCAST_LAYERS = 3;

function TraceablePeerConnection(ice_config, constraints, session) {
    var self = this;
    this.session = session;
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
    this.sdpConsistency = new SdpConsistency();
    this.rtxModifier = new RtxModifier();
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
    this.trace('addStream', stream ? stream.id : "null");
    if (stream)
        this.peerconnection.addStream(stream);
    if (ssrcInfo && ssrcInfo.type === "addMuted") {
        this.sdpConsistency.setPrimarySsrc(ssrcInfo.ssrc.ssrcs[0]);
        const simGroup = 
            ssrcInfo.ssrc.groups.find(groupInfo => {
                return groupInfo.group.semantics === "SIM";
            });
        if (simGroup) {
            const simSsrcs = SDPUtil.parseGroupSsrcs(simGroup.group);
            this.simulcast.setSsrcCache(simSsrcs);
        }
        const fidGroups =
            ssrcInfo.ssrc.groups.filter(groupInfo => {
                return groupInfo.group.semantics === "FID";
            });
        if (fidGroups) {
            const rtxSsrcMapping = new Map();
            fidGroups.forEach(fidGroup => {
                const fidGroupSsrcs = 
                    SDPUtil.parseGroupSsrcs(fidGroup.group);
                const primarySsrc = fidGroupSsrcs[0];
                const rtxSsrc = fidGroupSsrcs[1];
                rtxSsrcMapping.set(primarySsrc, rtxSsrc);
            });
            this.rtxModifier.setSsrcCache(rtxSsrcMapping);
        }
    }
};

TraceablePeerConnection.prototype.removeStream = function (stream) {
    this.trace('removeStream', stream.id);
    // FF doesn't support this yet.
    if (this.peerconnection.removeStream) {
        this.peerconnection.removeStream(stream);
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

    if (this.session.room.options.preferH264) {
        const parsedSdp = transform.parse(description.sdp);
        const videoMLine = parsedSdp.media.find(m => m.type === "video");
        SDPUtil.preferVideoCodec(videoMLine, "h264");
        description.sdp = transform.write(parsedSdp);
    }

    // if we're running on FF, transform to Plan A first.
    if (RTCBrowserType.usesUnifiedPlan()) {
        description.sdp = this.rtxModifier.stripRtx(description.sdp);
        this.trace('setRemoteDescription::postTransform (stripRtx)', dumpSDP(description));
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

/**
 * Makes the underlying TraceablePeerConnection generate new SSRC for
 * the recvonly video stream.
 * @deprecated
 */
TraceablePeerConnection.prototype.generateRecvonlySsrc = function() {
    // FIXME replace with SDPUtil.generateSsrc (when it's added)
    const newSSRC = this.generateNewStreamSSRCInfo().ssrcs[0];
    logger.info("Generated new recvonly SSRC: " + newSSRC);
    this.sdpConsistency.setPrimarySsrc(newSSRC);
};

TraceablePeerConnection.prototype.close = function () {
    this.trace('stop');
    if (this.statsinterval !== null) {
        window.clearInterval(this.statsinterval);
        this.statsinterval = null;
    }
    this.peerconnection.close();
};

/**
 * Modifies the values of the setup attributes (defined by
 * {@link http://tools.ietf.org/html/rfc4145#section-4}) of a specific SDP
 * answer in order to overcome a delay of 1 second in the connection
 * establishment between Chrome and Videobridge.
 *
 * @param {SDP} offer - the SDP offer to which the specified SDP answer is
 * being prepared to respond
 * @param {SDP} answer - the SDP to modify
 * @private
 */
var _fixAnswerRFC4145Setup = function (offer, answer) {
    if (!RTCBrowserType.isChrome()) {
        // It looks like Firefox doesn't agree with the fix (at least in its
        // current implementation) because it effectively remains active even
        // after we tell it to become passive. Apart from Firefox which I tested
        // after the fix was deployed, I tested Chrome only. In order to prevent
        // issues with other browsers, limit the fix to Chrome for the time
        // being.
        return;
    }

    // XXX Videobridge is the (SDP) offerer and WebRTC (e.g. Chrome) is the
    // answerer (as orchestrated by Jicofo). In accord with
    // http://tools.ietf.org/html/rfc5245#section-5.2 and because both peers
    // are ICE FULL agents, Videobridge will take on the controlling role and
    // WebRTC will take on the controlled role. In accord with
    // https://tools.ietf.org/html/rfc5763#section-5, Videobridge will use the
    // setup attribute value of setup:actpass and WebRTC will be allowed to
    // choose either the setup attribute value of setup:active or
    // setup:passive. Chrome will by default choose setup:active because it is
    // RECOMMENDED by the respective RFC since setup:passive adds additional
    // latency. The case of setup:active allows WebRTC to send a DTLS
    // ClientHello as soon as an ICE connectivity check of its succeeds.
    // Unfortunately, Videobridge will be unable to respond immediately because
    // may not have WebRTC's answer or may have not completed the ICE
    // connectivity establishment. Even more unfortunate is that in the
    // described scenario Chrome's DTLS implementation will insist on
    // retransmitting its ClientHello after a second (the time is in accord
    // with the respective RFC) and will thus cause the whole connection
    // establishment to exceed at least 1 second. To work around Chrome's
    // idiosyncracy, don't allow it to send a ClientHello i.e. change its
    // default choice of setup:active to setup:passive.
    if (offer && answer
            && offer.media && answer.media
            && offer.media.length == answer.media.length) {
        answer.media.forEach(function (a, i) {
            if (SDPUtil.find_line(
                    offer.media[i],
                    'a=setup:actpass',
                    offer.session)) {
                answer.media[i]
                    = a.replace(/a=setup:active/g, 'a=setup:passive');
            }
        });
        answer.raw = answer.session + answer.media.join('');
    }
};

TraceablePeerConnection.prototype.createAnswer
        = function (successCallback, failureCallback, constraints) {
    this.trace('createAnswer', JSON.stringify(constraints, null, ' '));
    this.peerconnection.createAnswer(
        (answer) => {
            try {
                this.trace(
                    'createAnswerOnSuccess::preTransform', dumpSDP(answer));
                // if we're running on FF, transform to Plan A first.
                if (RTCBrowserType.usesUnifiedPlan()) {
                    answer = this.interop.toPlanB(answer);
                    this.trace('createAnswerOnSuccess::postTransform (Plan B)',
                        dumpSDP(answer));
                }

                /**
                 * We don't keep ssrcs consitent for Firefox because rewriting
                 *  the ssrcs between createAnswer and setLocalDescription
                 *  breaks the caching in sdp-interop (sdp-interop must
                 *  know about all ssrcs, and it updates its cache in
                 *  toPlanB so if we rewrite them after that, when we
                 *  try and go back to unified plan it will complain
                 *  about unmapped ssrcs)
                 */
                if (!RTCBrowserType.isFirefox()) {
                    answer.sdp = this.sdpConsistency.makeVideoPrimarySsrcsConsistent(answer.sdp);
                    this.trace('createAnswerOnSuccess::postTransform (make primary video ssrcs consistent)',
                        dumpSDP(answer));
                }

                // Add simulcast streams if simulcast is enabled
                if (!this.session.room.options.disableSimulcast
                    && this.simulcast.isSupported()) {
                    answer = this.simulcast.mungeLocalDescription(answer);
                    this.trace(
                        'createAnswerOnSuccess::postTransform (simulcast)',
                        dumpSDP(answer));
                }

                if (!this.session.room.options.disableRtx && !RTCBrowserType.isFirefox()) {
                    answer.sdp = this.rtxModifier.modifyRtxSsrcs(answer.sdp);
                    this.trace(
                        'createAnswerOnSuccess::postTransform (rtx modifier)',
                        dumpSDP(answer));
                }

                // Fix the setup attribute (see _fixAnswerRFC4145Setup for
                //  details)
                let remoteDescription = new SDP(this.remoteDescription.sdp);
                let localDescription = new SDP(answer.sdp);
                _fixAnswerRFC4145Setup(remoteDescription, localDescription);
                answer.sdp = localDescription.raw;

                this.eventEmitter.emit(XMPPEvents.SENDRECV_STREAMS_CHANGED,
                    extractSSRCMap(answer));

                successCallback(answer);
            } catch (e) {
                this.trace('createAnswerOnError', e);
                this.trace('createAnswerOnError', dumpSDP(answer));
                logger.error('createAnswerOnError', e, dumpSDP(answer));
                failureCallback(e);
            }
        },
        (err) => {
            this.trace('createAnswerOnFailure', err);
            this.eventEmitter.emit(XMPPEvents.CREATE_ANSWER_FAILED, err,
                this.peerconnection);
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
    let ssrcInfo = {ssrcs: [], groups: []};
    if (!this.session.room.options.disableSimulcast
        && this.simulcast.isSupported()) {
        for (let i = 0; i < SIMULCAST_LAYERS; i++) {
            ssrcInfo.ssrcs.push(SDPUtil.generateSsrc());
        }
        ssrcInfo.groups.push({
            primarySSRC: ssrcInfo.ssrcs[0],
            group: {ssrcs: ssrcInfo.ssrcs.join(" "), semantics: "SIM"}});
        ssrcInfo;
    } else {
        ssrcInfo = {ssrcs: [SDPUtil.generateSsrc()], groups: []};
    }
    if (!this.session.room.options.disableRtx) {
        // Specifically use a for loop here because we'll
        //  be adding to the list we're iterating over, so we
        //  only want to iterate through the items originally
        //  on the list
        const currNumSsrcs = ssrcInfo.ssrcs.length;
        for (let i = 0; i < currNumSsrcs; ++i) {
            const primarySsrc = ssrcInfo.ssrcs[i];
            const rtxSsrc = SDPUtil.generateSsrc();
            ssrcInfo.ssrcs.push(rtxSsrc);
            ssrcInfo.groups.push({
                primarySSRC: primarySsrc,
                group: { 
                    ssrcs: primarySsrc + " " + rtxSsrc,
                    semantics: "FID"
                }
            });
        }
    }
    return ssrcInfo;
};

module.exports = TraceablePeerConnection;
