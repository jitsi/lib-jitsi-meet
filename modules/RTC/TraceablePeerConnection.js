/* global __filename, mozRTCPeerConnection, webkitRTCPeerConnection,
    RTCPeerConnection, RTCSessionDescription */

import { getLogger } from "jitsi-meet-logger";
import * as GlobalOnErrorHandler from "../util/GlobalOnErrorHandler";
import RTC from "./RTC";
import RTCBrowserType from "./RTCBrowserType.js";
import RTCEvents from "../../service/RTC/RTCEvents";
import RtxModifier from "../xmpp/RtxModifier.js";
// FIXME SDP tools should end up in some kind of util module
import SDP from "../xmpp/SDP";
import SdpConsistency from "../xmpp/SdpConsistency.js";
import SDPUtil from "../xmpp/SDPUtil";
import transform from "sdp-transform";

const logger = getLogger(__filename);
const SIMULCAST_LAYERS = 3;

/**
 * Creates new instance of 'TraceablePeerConnection'.
 *
 * @param {RTC} rtc the instance of <tt>RTC</tt> service
 * @param {number} id the peer connection id assigned by the parent RTC module.
 * @param {SignalingLayer} signalingLayer the signaling layer instance
 * @param {object} ice_config WebRTC 'PeerConnection' ICE config
 * @param {object} constraints WebRTC 'PeerConnection' constraints
 * @param {object} options <tt>TracablePeerConnection</tt> config options.
 * @param {boolean} options.disableSimulcast if set to 'true' will disable
 * the simulcast
 * @param {boolean} options.disableRtx if set to 'true' will disable the RTX
 * @param {boolean} options.preferH264 if set to 'true' H264 will be preferred
 * over other video codecs.
 *
 * FIXME: initially the purpose of TraceablePeerConnection was to be able to
 * debug the peer connection. Since many other responsibilities have been added
 * it would make sense to extract a separate class from it and come up with
 * a more suitable name.
 *
 * @constructor
 */
function TraceablePeerConnection(rtc, id, signalingLayer, ice_config,
                                 constraints, options) {
    var self = this;
    /**
     * The parent instance of RTC service which created this
     * <tt>TracablePeerConnection</tt>.
     * @type {RTC}
     */
    this.rtc = rtc;
    /**
     * The peer connection identifier assigned by the RTC module.
     * @type {number}
     */
    this.id = id;
    /**
     * The signaling layer which operates this peer connection.
     * @type {SignalingLayer}
     */
    this.signalingLayer = signalingLayer;
    this.options = options;
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
    /**
     * @type {number}
     */
    this.maxstats = 0;
    var Interop = require('sdp-interop').Interop;
    this.interop = new Interop();
    var Simulcast = require('sdp-simulcast');
    this.simulcast = new Simulcast({numOfLayers: SIMULCAST_LAYERS,
        explodeRemoteSimulcast: false});
    this.sdpConsistency = new SdpConsistency();
    /**
     * TracablePeerConnection uses RTC's eventEmitter
     * @type {EventEmitter}
     */
    this.eventEmitter = rtc.eventEmitter;
    this.rtxModifier = new RtxModifier();

    // override as desired
    this.trace = function (what, info) {
        /* logger.warn('WTRACE', what, info);
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
        if (!RTCBrowserType.isTemasysPluginUsed()) {
            self.trace(
                'onicecandidate',
                JSON.stringify(event.candidate, null, ' '));
        }

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
    this.peerconnection.onaddstream = function (event) {
        self._remoteStreamAdded(event.stream);
    };
    this.peerconnection.onremovestream = function (event) {
        self._remoteStreamRemoved(event.stream);
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
 * Called when new remote MediaStream is added to the PeerConnection.
 * @param {MediaStream} stream the WebRTC MediaStream for remote participant
 */
TraceablePeerConnection.prototype._remoteStreamAdded = function (stream) {
    if (!RTC.isUserStream(stream)) {
        logger.info(
            "Ignored remote 'stream added' event for non-user stream", stream);
        return;
    }
    // Bind 'addtrack'/'removetrack' event handlers
    if (RTCBrowserType.isChrome() || RTCBrowserType.isNWJS()
        || RTCBrowserType.isElectron()) {
        stream.onaddtrack = event => {
            this._remoteTrackAdded(event.target, event.track);
        };
        stream.onremovetrack = event => {
            this._remoteTrackRemoved(event.target, event.track);
        };
    }
    // Call remoteTrackAdded for each track in the stream
    const streamAudioTracks = stream.getAudioTracks();
    for (const audioTrack of streamAudioTracks) {
        this._remoteTrackAdded(stream, audioTrack);
    }
    const streamVideoTracks = stream.getVideoTracks();
    for (const videoTrack of streamVideoTracks) {
        this._remoteTrackAdded(stream, videoTrack);
    }
};


/**
 * Called on "track added" and "stream added" PeerConnection events (because we
 * handle streams on per track basis). Finds the owner and the SSRC for
 * the track and passes that to ChatRoom for further processing.
 * @param {MediaStream} stream the WebRTC MediaStream instance which is
 * the parent of the track
 * @param {MediaStreamTrack} track the WebRTC MediaStreamTrack added for remote
 * participant
 */
TraceablePeerConnection.prototype._remoteTrackAdded = function (stream, track) {
    const streamId = RTC.getStreamID(stream);
    const mediaType = track.kind;

    logger.info("Remote track added", streamId, mediaType);

    // look up an associated JID for a stream id
    if (!mediaType) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error(
                `MediaType undefined for remote track, stream id: ${streamId}`
            ));
        // Abort
        return;
    }

    const remoteSDP = new SDP(this.remoteDescription.sdp);
    const mediaLines = remoteSDP.media.filter(
        function (mediaLines){
            return mediaLines.startsWith("m=" + mediaType);
        });
    if (!mediaLines.length) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error(
                "No media lines for type " + mediaType
                    + " found in remote SDP for remote track: " + streamId));
        // Abort
        return;
    }

    let ssrcLines = SDPUtil.find_lines(mediaLines[0], 'a=ssrc:');

    ssrcLines = ssrcLines.filter(
        function (line) {
            const msid
                = RTCBrowserType.isTemasysPluginUsed() ? 'mslabel' : 'msid';
            return line.indexOf(msid + ':' + streamId) !== -1;
        });
    if (!ssrcLines.length) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error(
                "No SSRC lines for streamId " + streamId
                    + " for remote track, media type: " + mediaType));
        // Abort
        return;
    }

    // FIXME the length of ssrcLines[0] not verified, but it will fail
    // with global error handler anyway
    const trackSsrc = ssrcLines[0].substring(7).split(' ')[0];
    const ownerEndpointId = this.signalingLayer.getSSRCOwner(trackSsrc);

    if (!ownerEndpointId) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error(
                "No SSRC owner known for: " + trackSsrc
                    + " for remote track, msid: " + streamId
                    + " media type: " + mediaType));
        // Abort
        return;
    }

    logger.log('associated ssrc', ownerEndpointId, trackSsrc);

    const peerMediaInfo
        = this.signalingLayer.getPeerMediaInfo(ownerEndpointId, mediaType);

    if (!peerMediaInfo) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error("No peer media info available for: " + ownerEndpointId));
        // Abort
        return;
    }

    const muted = peerMediaInfo.muted;
    const videoType = peerMediaInfo.videoType; // can be undefined

    this.rtc._createRemoteTrack(
        ownerEndpointId, stream, track, mediaType, videoType, trackSsrc, muted);
};

/**
 * Handles remote stream removal.
 * @param stream the WebRTC MediaStream object which is being removed from the
 * PeerConnection
 */
TraceablePeerConnection.prototype._remoteStreamRemoved = function (stream) {
    if (!RTC.isUserStream(stream)) {
        const id = RTC.getStreamID(stream);
        logger.info(
            `Ignored remote 'stream removed' event for non-user stream ${id}`);
        return;
    }
    // Call remoteTrackRemoved for each track in the stream
    const streamVideoTracks = stream.getVideoTracks();
    for (const videoTrack of streamVideoTracks) {
        this._remoteTrackRemoved(stream, videoTrack);
    }
    const streamAudioTracks = stream.getAudioTracks();
    for (const audioTrack of streamAudioTracks) {
        this._remoteTrackRemoved(stream, audioTrack);
    }
};

/**
 * Handles remote media track removal.
 * @param {MediaStream} stream WebRTC MediaStream instance which is the parent
 * of the track.
 * @param {MediaStreamTrack} track the WebRTC MediaStreamTrack which has been
 * removed from the PeerConnection.
 */
TraceablePeerConnection.prototype._remoteTrackRemoved
= function (stream, track) {
    const streamId = RTC.getStreamID(stream);
    const trackId = track && track.id;

    logger.info("Remote track removed", streamId, trackId);

    if (!streamId) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error("Remote track removal failed - no stream ID"));
        // Abort
        return;
    }

    if (!trackId) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error("Remote track removal failed - no track ID"));
        // Abort
        return;
    }

    if (!this.rtc._removeRemoteTrack(streamId, trackId)) {
        // NOTE this warning is always printed when user leaves the room,
        // because we remove remote tracks manually on MUC member left event,
        // before the SSRCs are removed by Jicofo. In most cases it is fine to
        // ignore this warning, but still it's better to keep it printed for
        // debugging purposes.
        //
        // We could change the behaviour to emit track removed only from here,
        // but the order of the events will change and consuming apps could
        // behave unexpectedly (the "user left" event would come before "track
        // removed" events).
        logger.warn(
            `Removed track not found for msid: ${streamId},
             track id: ${trackId}`);
    }
};

/**
 * @typedef {Object} SSRCGroupInfo
 * @property {Array<number>} ssrcs group's SSRCs
 * @property {string} semantics
 */
/**
 * @typedef {Object} TrackSSRCInfo
 * @property {Array<number>} ssrcs track's SSRCs
 * @property {Array<SSRCGroupInfo>} groups track's SSRC groups
 */
/**
 * Returns map with keys msid and <tt>TrackSSRCInfo</tt> values.
 * @param {Object} desc the WebRTC SDP instance.
 * @return {Map<string,TrackSSRCInfo>}
 */
function extractSSRCMap(desc) {
    /**
     * Track SSRC infos mapped by stream ID (msid)
     * @type {Map<string,TrackSSRCInfo>}
     */
    const ssrcMap = new Map();
    /**
     * Groups mapped by primary SSRC number
     * @type {Map<number,Array<SSRCGroupInfo>>}
     */
    const groupsMap = new Map();

    if (typeof desc !== 'object' || desc === null ||
        typeof desc.sdp !== 'string') {
        logger.warn('An empty description was passed as an argument.');
        return ssrcMap;
    }

    const session = transform.parse(desc.sdp);

    if (!Array.isArray(session.media)) {
        return ssrcMap;
    }

    for (const mLine of session.media) {
        if (!Array.isArray(mLine.ssrcs)) {
            continue;
        }

        if (Array.isArray(mLine.ssrcGroups)) {
            for (const group of mLine.ssrcGroups) {
                if (typeof group.semantics !== 'undefined' &&
                    typeof group.ssrcs !== 'undefined') {
                    // Parse SSRCs and store as numbers
                    const groupSSRCs
                        = group.ssrcs.split(' ')
                                     .map(ssrcStr => parseInt(ssrcStr));
                    const primarySSRC = groupSSRCs[0];
                    // Note that group.semantics is already present
                    group.ssrcs = groupSSRCs;
                    if (!groupsMap.has(primarySSRC)) {
                        groupsMap.set(primarySSRC, []);
                    }
                    groupsMap.get(primarySSRC).push(group);
                }
            }
        }
        for (const ssrc of mLine.ssrcs) {
            if (ssrc.attribute !== 'msid') {
                continue;
            }

            const msid = ssrc.value;
            let ssrcInfo = ssrcMap.get(msid);

            if (!ssrcInfo) {
                ssrcInfo = {
                    ssrcs: [],
                    groups: []
                };
                ssrcMap.set(msid, ssrcInfo);
            }

            const ssrcNumber = ssrc.id;

            ssrcInfo.ssrcs.push(ssrcNumber);

            if (groupsMap.has(ssrcNumber)) {
                const ssrcGroups = groupsMap.get(ssrcNumber);

                for (const group of ssrcGroups) {
                    ssrcInfo.groups.push(group);
                }
            }
        }
    }

    return ssrcMap;
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

            if (Array.isArray(mLine.ssrcs)) {
                var i;
                for (i = 0; i < mLine.ssrcs.length; i++){
                    if (typeof mLine.ssrcs[i] === 'object'
                        && typeof mLine.ssrcs[i].id !== 'undefined'
                        && firstSsrcs.indexOf(mLine.ssrcs[i].id) >= 0) {
                        newSsrcLines.push(mLine.ssrcs[i]);
                        delete mLine.ssrcs[i];
                    }
                }

                for (i = 0; i < mLine.ssrcs.length; i++){
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
    signalingState () {
        return this.peerconnection.signalingState;
    },
    iceConnectionState () {
        return this.peerconnection.iceConnectionState;
    },
    localDescription() {
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
    remoteDescription() {
        var desc = this.peerconnection.remoteDescription;
        this.trace('getRemoteDescription::preTransform', dumpSDP(desc));

        // if we're running on FF, transform to Plan B first.
        if (RTCBrowserType.usesUnifiedPlan()) {
            desc = this.interop.toPlanB(desc);
            this.trace(
                'getRemoteDescription::postTransform (Plan B)', dumpSDP(desc));
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
    if (stream) {
        this.peerconnection.addStream(stream);
    }
    if (ssrcInfo && ssrcInfo.type === "addMuted") {
        this.sdpConsistency.setPrimarySsrc(ssrcInfo.ssrcs[0]);
        const simGroup
            = ssrcInfo.groups.find(groupInfo => groupInfo.semantics === "SIM");
        if (simGroup) {
            this.simulcast.setSsrcCache(simGroup.ssrcs);
        }
        const fidGroups
            = ssrcInfo.groups.filter(
                groupInfo => groupInfo.semantics === "FID");
        if (fidGroups) {
            const rtxSsrcMapping = new Map();
            fidGroups.forEach(fidGroup => {
                const primarySsrc = fidGroup.ssrcs[0];
                const rtxSsrc = fidGroup.ssrcs[1];
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
            self.eventEmitter.emit(
                RTCEvents.SET_LOCAL_DESCRIPTION_FAILED,
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
            this.trace(
        'setRemoteDescription::postTransform (simulcast)',
        dumpSDP(description));

            if (this.options.preferH264) {
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
                this.trace(
            'setRemoteDescription::postTransform (Plan A)',
            dumpSDP(description));
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
            self.eventEmitter.emit(RTCEvents.SET_REMOTE_DESCRIPTION_FAILED,
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

/**
 * Makes the underlying TraceablePeerConnection forget the current primary video
 * SSRC.
 * @deprecated
 */
TraceablePeerConnection.prototype.clearRecvonlySsrc = function () {
    logger.info("Clearing primary video SSRC!");
    this.sdpConsistency.clearSsrcCache();
};

TraceablePeerConnection.prototype.close = function () {
    this.trace('stop');
    if (!this.rtc._removePeerConnection(this)) {
        logger.error("RTC._removePeerConnection returned false");
    }
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
        answer => {
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
                if (!this.options.disableSimulcast
                    && this.simulcast.isSupported()) {
                    answer = this.simulcast.mungeLocalDescription(answer);
                    this.trace(
                        'createAnswerOnSuccess::postTransform (simulcast)',
                        dumpSDP(answer));
                }

                if (!this.options.disableRtx && !RTCBrowserType.isFirefox()) {
                    answer.sdp = this.rtxModifier.modifyRtxSsrcs(answer.sdp);
                    this.trace(
                        'createAnswerOnSuccess::postTransform (rtx modifier)',
                        dumpSDP(answer));
                }

                // Fix the setup attribute (see _fixAnswerRFC4145Setup for
                //  details)
                const remoteDescription = new SDP(this.remoteDescription.sdp);
                const localDescription = new SDP(answer.sdp);
                _fixAnswerRFC4145Setup(remoteDescription, localDescription);
                answer.sdp = localDescription.raw;

                this.eventEmitter.emit(RTCEvents.SENDRECV_STREAMS_CHANGED,
                    extractSSRCMap(answer));

                successCallback(answer);
            } catch (e) {
                this.trace('createAnswerOnError', e);
                this.trace('createAnswerOnError', dumpSDP(answer));
                logger.error('createAnswerOnError', e, dumpSDP(answer));
                failureCallback(e);
            }
        },
        err => {
            this.trace('createAnswerOnFailure', err);
            this.eventEmitter.emit(RTCEvents.CREATE_ANSWER_FAILED, err,
                this.peerconnection);
            failureCallback(err);
        },
        constraints
    );
        };

TraceablePeerConnection.prototype.addIceCandidate
        // eslint-disable-next-line no-unused-vars
        = function (candidate, successCallback, failureCallback) {
    // var self = this;
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
        if(!errback) {
            errback = function () {};
        }
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
    if (!this.options.disableSimulcast
        && this.simulcast.isSupported()) {
        for (let i = 0; i < SIMULCAST_LAYERS; i++) {
            ssrcInfo.ssrcs.push(SDPUtil.generateSsrc());
        }
        ssrcInfo.groups.push({
            ssrcs: ssrcInfo.ssrcs.slice(),
            semantics: "SIM"
        });
    } else {
        ssrcInfo = {
            ssrcs: [SDPUtil.generateSsrc()],
            groups: []
        };
    }
    if (!this.options.disableRtx && !RTCBrowserType.isFirefox()) {
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
                ssrcs: [primarySsrc, rtxSsrc],
                semantics: "FID"
            });
        }
    }
    return ssrcInfo;
};

module.exports = TraceablePeerConnection;
