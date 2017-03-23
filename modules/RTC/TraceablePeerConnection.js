/* global __filename, mozRTCPeerConnection, webkitRTCPeerConnection,
    RTCPeerConnection, RTCSessionDescription */

import { getLogger } from 'jitsi-meet-logger';
import * as GlobalOnErrorHandler from '../util/GlobalOnErrorHandler';
import JitsiRemoteTrack from './JitsiRemoteTrack';
import * as MediaType from '../../service/RTC/MediaType';
import LocalSdpMunger from './LocalSdpMunger';
import RTC from './RTC';
import RTCBrowserType from './RTCBrowserType.js';
import RTCEvents from '../../service/RTC/RTCEvents';
import RtxModifier from '../xmpp/RtxModifier.js';
import edgeRTCPeerConnection from './edgeRTCPeerConnection.js';

// FIXME SDP tools should end up in some kind of util module
import SDP from '../xmpp/SDP';
import SdpConsistency from '../xmpp/SdpConsistency.js';
import SDPUtil from '../xmpp/SDPUtil';
import * as SignalingEvents from '../../service/RTC/SignalingEvents';
import transform from 'sdp-transform';

const logger = getLogger(__filename);
const SIMULCAST_LAYERS = 3;

/* eslint-disable max-params */

/**
 * Creates new instance of 'TraceablePeerConnection'.
 *
 * @param {RTC} rtc the instance of <tt>RTC</tt> service
 * @param {number} id the peer connection id assigned by the parent RTC module.
 * @param {SignalingLayer} signalingLayer the signaling layer instance
 * @param {object} iceConfig WebRTC 'PeerConnection' ICE config
 * @param {object} constraints WebRTC 'PeerConnection' constraints
 * @param {boolean} isP2P indicates whether or not the new instance will be used
 * in a peer to peer connection
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
function TraceablePeerConnection(
        rtc,
        id,
        signalingLayer,
        iceConfig,
        constraints,
        isP2P,
        options) {

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
     * Indicates whether or not this instance is used in a peer to peer
     * connection.
     * @type {boolean}
     */
    this.isP2P = isP2P;

    // FIXME: We should support multiple streams per jid.
    /**
     * The map holds remote tracks associated with this peer connection.
     * It maps user's JID to media type and remote track
     * (one track per media type per user's JID).
     * @type {Map<string, Map<MediaType, JitsiRemoteTrack>>}
     */
    this.remoteTracks = new Map();

    /**
     * A map which stores local tracks mapped by {@link JitsiLocalTrack.rtcId}
     * @type {Map<number, JitsiLocalTrack>}
     */
    this.localTracks = new Map();

    /**
     * @typedef {Object} TPCGroupInfo
     * @property {string} semantics the SSRC groups semantics
     * @property {Array<number>} ssrcs group's SSRCs in order where the first
     * one is group's primary SSRC, the second one is secondary (RTX) and so
     * on...
     */
    /**
     * @typedef {Object} TPCSSRCInfo
     * @property {Array<number>} ssrcs an array which holds all track's SSRCs
     * @property {Array<TPCGroupInfo>} groups an array stores all track's SSRC
     * groups
     */
    /**
     * Holds the info about local track's SSRCs mapped per their
     * {@link JitsiLocalTrack.rtcId}
     * @type {Map<number, TPCSSRCInfo>}
     */
    this.localSSRCs = new Map();

    /**
     * The local ICE username fragment for this session.
     */
    this.localUfrag = null;

    /**
     * The remote ICE username fragment for this session.
     */
    this.remoteUfrag = null;

    /**
     * The signaling layer which operates this peer connection.
     * @type {SignalingLayer}
     */
    this.signalingLayer = signalingLayer;

    // SignalingLayer listeners
    this._peerVideoTypeChanged = this._peerVideoTypeChanged.bind(this);
    this.signalingLayer.on(
        SignalingEvents.PEER_VIDEO_TYPE_CHANGED,
        this._peerVideoTypeChanged);

    this._peerMutedChanged = this._peerMutedChanged.bind(this);
    this.signalingLayer.on(
        SignalingEvents.PEER_MUTED_CHANGED,
        this._peerMutedChanged);
    this.options = options;
    let RTCPeerConnectionType = null;

    if (RTCBrowserType.isFirefox()) {
        RTCPeerConnectionType = mozRTCPeerConnection;
    } else if (RTCBrowserType.isEdge()) {
        RTCPeerConnectionType = edgeRTCPeerConnection;
    } else if (RTCBrowserType.isTemasysPluginUsed()) {
        RTCPeerConnectionType = RTCPeerConnection;
    } else {
        RTCPeerConnectionType = webkitRTCPeerConnection;
    }
    this.peerconnection = new RTCPeerConnectionType(iceConfig, constraints);
    this.updateLog = [];
    this.stats = {};
    this.statsinterval = null;

    /**
     * @type {number}
     */
    this.maxstats = 0;
    const Interop = require('sdp-interop').Interop;

    this.interop = new Interop();
    const Simulcast = require('sdp-simulcast');

    this.simulcast = new Simulcast({ numOfLayers: SIMULCAST_LAYERS,
        explodeRemoteSimulcast: false });
    this.sdpConsistency = new SdpConsistency();

    /**
     * Munges local SDP provided to the Jingle Session in order to prevent from
     * sending SSRC updates on attach/detach and mute/unmute (for video).
     * @type {LocalSdpMunger}
     */
    this.localSdpMunger = new LocalSdpMunger(this);

    /**
     * TracablePeerConnection uses RTC's eventEmitter
     * @type {EventEmitter}
     */
    this.eventEmitter = rtc.eventEmitter;
    this.rtxModifier = new RtxModifier();

    // override as desired
    this.trace = (what, info) => {
        /* logger.warn('WTRACE', what, info);
        if (info && RTCBrowserType.isIExplorer()) {
            if (info.length > 1024) {
                logger.warn('WTRACE', what, info.substr(1024));
            }
            if (info.length > 2048) {
                logger.warn('WTRACE', what, info.substr(2048));
            }
        }*/
        this.updateLog.push({
            time: new Date(),
            type: what,
            value: info || ''
        });
    };
    this.onicecandidate = null;
    this.peerconnection.onicecandidate = event => {
        // FIXME: this causes stack overflow with Temasys Plugin
        if (!RTCBrowserType.isTemasysPluginUsed()) {
            this.trace(
                'onicecandidate',
                JSON.stringify(event.candidate, null, ' '));
        }

        if (this.onicecandidate !== null) {
            this.onicecandidate(event);
        }
    };
    this.onaddstream = null;
    this.peerconnection.onaddstream = event => {
        this.trace('onaddstream', event.stream.id);
        if (this.onaddstream !== null) {
            this.onaddstream(event);
        }
    };
    this.onremovestream = null;
    this.peerconnection.onremovestream = event => {
        this.trace('onremovestream', event.stream.id);
        if (this.onremovestream !== null) {
            this.onremovestream(event);
        }
    };
    this.peerconnection.onaddstream
        = event => this._remoteStreamAdded(event.stream);
    this.peerconnection.onremovestream
        = event => this._remoteStreamRemoved(event.stream);
    this.onsignalingstatechange = null;
    this.peerconnection.onsignalingstatechange = event => {
        this.trace('onsignalingstatechange', this.signalingState);
        if (this.onsignalingstatechange !== null) {
            this.onsignalingstatechange(event);
        }
    };
    this.oniceconnectionstatechange = null;
    this.peerconnection.oniceconnectionstatechange = event => {
        this.trace('oniceconnectionstatechange', this.iceConnectionState);
        if (this.oniceconnectionstatechange !== null) {
            this.oniceconnectionstatechange(event);
        }
    };
    this.onnegotiationneeded = null;
    this.peerconnection.onnegotiationneeded = event => {
        this.trace('onnegotiationneeded');
        if (this.onnegotiationneeded !== null) {
            this.onnegotiationneeded(event);
        }
    };
    this.ondatachannel = null;
    this.peerconnection.ondatachannel = event => {
        this.trace('ondatachannel', event);
        if (this.ondatachannel !== null) {
            this.ondatachannel(event);
        }
    };

    // XXX: do all non-firefox browsers which we support also support this?
    if (!RTCBrowserType.isFirefox() && this.maxstats) {
        this.statsinterval = window.setInterval(() => {
            this.peerconnection.getStats(stats => {
                const results = stats.result();
                const now = new Date();

                for (let i = 0; i < results.length; ++i) {
                    results[i].names().forEach(name => {
                        // eslint-disable-next-line no-shadow
                        const id = `${results[i].id}-${name}`;
                        let s = this.stats[id];

                        if (!s) {
                            this.stats[id] = s = {
                                startTime: now,
                                endTime: now,
                                values: [],
                                times: []
                            };
                        }
                        s.values.push(results[i].stat(name));
                        s.times.push(now.getTime());
                        if (s.values.length > this.maxstats) {
                            s.values.shift();
                            s.times.shift();
                        }
                        s.endTime = now;
                    });
                }
            });
        }, 1000);
    }

    logger.info(`Create new ${this}`);
}

/* eslint-enable max-params */

/**
 * Returns a string representation of a SessionDescription object.
 */
const dumpSDP = function(description) {
    if (typeof description === 'undefined' || description === null) {
        return '';
    }

    return `type: ${description.type}\r\n${description.sdp}`;
};


/**
 * Forwards the {@link peerconnection.iceConnectionState} state except that it
 * will convert "completed" into "connected" where both mean that the ICE has
 * succeeded and is up and running. We never see "completed" state for
 * the JVB connection, but it started appearing for the P2P one. This method
 * allows to adapt old logic to this new situation.
 * @return {string}
 */
TraceablePeerConnection.prototype.getConnectionState = function() {
    const state = this.peerconnection.iceConnectionState;

    if (state === 'completed') {
        return 'connected';
    }

    return state;
};

/**
 * Tells whether or not this TPC instance is using Simulcast.
 * @return {boolean} <tt>true</tt> if simulcast is enabled and active or
 * <tt>false</tt> if it's turned off.
 */
TraceablePeerConnection.prototype.isSimulcastOn = function() {
    return !this.options.disableSimulcast
        && this.simulcast.isSupported()
        && !this.isP2P;
};

/**
 * Handles {@link SignalingEvents.PEER_VIDEO_TYPE_CHANGED}
 * @param {string} endpointId the video owner's ID (MUC nickname)
 * @param {VideoType} videoType the new value
 * @private
 */
TraceablePeerConnection.prototype._peerVideoTypeChanged
= function(endpointId, videoType) {
    // Check if endpointId has a value to avoid action on random track
    if (!endpointId) {
        logger.error(`No endpointID on peerVideoTypeChanged ${this}`);

        return;
    }
    const videoTrack = this.getRemoteTracks(endpointId, MediaType.VIDEO);

    if (videoTrack.length) {
        // NOTE 1 track per media type is assumed
        videoTrack[0]._setVideoType(videoType);
    }
};

/**
 * Handles remote track mute / unmute events.
 * @param {string} endpointId the track owner's identifier (MUC nickname)
 * @param {MediaType} mediaType "audio" or "video"
 * @param {boolean} isMuted the new mute state
 * @private
 */
TraceablePeerConnection.prototype._peerMutedChanged
= function(endpointId, mediaType, isMuted) {
    // Check if endpointId is a value to avoid doing action on all remote tracks
    if (!endpointId) {
        logger.error('On peerMuteChanged - no endpoint ID');

        return;
    }
    const track = this.getRemoteTracks(endpointId, mediaType);

    if (track.length) {
        // NOTE 1 track per media type is assumed
        track[0].setMute(isMuted);
    }
};

TraceablePeerConnection.prototype.getLocalTracks = function(mediaType) {
    let tracks = Array.from(this.localTracks.values());

    if (mediaType !== undefined) {
        tracks = tracks.filter(track => track.getType() === mediaType);
    }

    return tracks;
};

/**
 * Obtains all remote tracks currently known to this PeerConnection instance.
 * @param {string} [endpointId] the track owner's identifier (MUC nickname)
 * @param {MediaType} [mediaType] the remote tracks will be filtered
 * by their media type if this argument is specified.
 * @return {Array<JitsiRemoteTrack>}
 */
TraceablePeerConnection.prototype.getRemoteTracks
= function(endpointId, mediaType) {
    const remoteTracks = [];
    const endpoints
        = endpointId ? [ endpointId ] : this.remoteTracks.keys();

    for (const endpoint of endpoints) {
        const endpointTrackMap = this.remoteTracks.get(endpoint);

        if (!endpointTrackMap) {

            // Otherwise an empty Map() would have to be allocated above
            // eslint-disable-next-line no-continue
            continue;
        }

        for (const trackMediaType of endpointTrackMap.keys()) {
            // per media type filtering
            if (!mediaType || mediaType === trackMediaType) {
                const mediaTrack = endpointTrackMap.get(trackMediaType);

                if (mediaTrack) {
                    remoteTracks.push(mediaTrack);
                }
            }
        }
    }

    return remoteTracks;
};

/**
 * Called when new remote MediaStream is added to the PeerConnection.
 * @param {MediaStream} stream the WebRTC MediaStream for remote participant
 */
TraceablePeerConnection.prototype._remoteStreamAdded = function(stream) {
    const streamId = RTC.getStreamID(stream);

    if (!RTC.isUserStreamById(streamId)) {
        logger.info(
            `${this} ignored remote 'stream added' event for non-user stream`
             + `id: ${streamId}`);

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
TraceablePeerConnection.prototype._remoteTrackAdded = function(stream, track) {
    const streamId = RTC.getStreamID(stream);
    const mediaType = track.kind;

    logger.info(`${this} remote track added:`, streamId, mediaType);

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
    const mediaLines
        = remoteSDP.media.filter(mls => mls.startsWith(`m=${mediaType}`));

    if (!mediaLines.length) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error(
                `No media lines for type ${mediaType
                     } found in remote SDP for remote track: ${streamId}`));

        // Abort
        return;
    }

    let ssrcLines = SDPUtil.findLines(mediaLines[0], 'a=ssrc:');

    ssrcLines = ssrcLines.filter(
        line => {
            const msid
                = RTCBrowserType.isTemasysPluginUsed() ? 'mslabel' : 'msid';


            return line.indexOf(`${msid}:${streamId}`) !== -1;
        });
    if (!ssrcLines.length) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error(
                `No SSRC lines for streamId ${streamId
                     } for remote track, media type: ${mediaType}`));

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
                `No SSRC owner known for: ${trackSsrc
                     } for remote track, msid: ${streamId
                     } media type: ${mediaType}`));

        // Abort
        return;
    }

    logger.log(`${this} associated ssrc`, ownerEndpointId, trackSsrc);

    const peerMediaInfo
        = this.signalingLayer.getPeerMediaInfo(ownerEndpointId, mediaType);

    if (!peerMediaInfo) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error(
                `${this}: no peer media info available for ${
                    ownerEndpointId}`));

        return;
    }

    const muted = peerMediaInfo.muted;
    const videoType = peerMediaInfo.videoType; // can be undefined

    this._createRemoteTrack(
        ownerEndpointId, stream, track, mediaType, videoType, trackSsrc, muted);
};

// FIXME cleanup params
/* eslint-disable max-params */

/**
 * Initializes a new JitsiRemoteTrack instance with the data provided by
 * the signaling layer and SDP.
 *
 * @param {string} ownerEndpointId the owner's endpoint ID (MUC nickname)
 * @param {MediaStream} stream the WebRTC stream instance
 * @param {MediaStreamTrack} track the WebRTC track instance
 * @param {MediaType} mediaType the track's type of the media
 * @param {VideoType} [videoType] the track's type of the video (if applicable)
 * @param {string} ssrc the track's main SSRC number
 * @param {boolean} muted the initial muted status
 */
TraceablePeerConnection.prototype._createRemoteTrack
= function(ownerEndpointId, stream, track, mediaType, videoType, ssrc, muted) {
    const remoteTrack
        = new JitsiRemoteTrack(
            this.rtc, this.rtc.conference,
            ownerEndpointId,
            stream, track, mediaType, videoType, ssrc, muted, this.isP2P);
    let remoteTracksMap = this.remoteTracks.get(ownerEndpointId);

    if (!remoteTracksMap) {
        remoteTracksMap = new Map();
        this.remoteTracks.set(ownerEndpointId, remoteTracksMap);
    }

    if (remoteTracksMap.has(mediaType)) {
        logger.error(
            `${this} overwriting remote track! ${remoteTrack}`,
            ownerEndpointId, mediaType);
    }
    remoteTracksMap.set(mediaType, remoteTrack);

    // FIXME not cool to use RTC's eventEmitter
    this.rtc.eventEmitter.emit(RTCEvents.REMOTE_TRACK_ADDED, remoteTrack);
};

/* eslint-enable max-params */

/**
 * Handles remote stream removal.
 * @param stream the WebRTC MediaStream object which is being removed from the
 * PeerConnection
 */
TraceablePeerConnection.prototype._remoteStreamRemoved = function(stream) {
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
= function(stream, track) {
    const streamId = RTC.getStreamID(stream);
    const trackId = track && track.id;

    logger.info(`${this} - remote track removed: ${streamId}, ${trackId}`);

    if (!streamId) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error(`${this} remote track removal failed - no stream ID`));

        return;
    }

    if (!trackId) {
        GlobalOnErrorHandler.callErrorHandler(
            new Error(`${this} remote track removal failed - no track ID`));

        return;
    }

    if (!this._removeRemoteTrack(streamId, trackId)) {
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
            `${this} Removed track not found for msid: ${streamId},
             track id: ${trackId}`);
    }
};

/**
 * Finds remote track by it's stream and track ids.
 * @param {string} streamId the media stream id as defined by the WebRTC
 * @param {string} trackId the media track id as defined by the WebRTC
 * @return {JitsiRemoteTrack|undefined} the track's instance or
 * <tt>undefined</tt> if not found.
 * @private
 */
TraceablePeerConnection.prototype._getRemoteTrackById
= function(streamId, trackId) {
    // .find will break the loop once the first match is found
    for (const endpointTrackMap of this.remoteTracks.values()) {
        for (const mediaTrack of endpointTrackMap.values()) {
            // FIXME verify and try to use ===
            /* eslint-disable eqeqeq */
            if (mediaTrack.getStreamId() == streamId
                && mediaTrack.getTrackId() == trackId) {
                return mediaTrack;
            }

            /* eslint-enable eqeqeq */
        }
    }

    return undefined;
};

/**
 * Removes all JitsiRemoteTracks associated with given MUC nickname
 * (resource part of the JID). Returns array of removed tracks.
 *
 * @param {string} owner - The resource part of the MUC JID.
 * @returns {JitsiRemoteTrack[]}
 */
TraceablePeerConnection.prototype.removeRemoteTracks = function(owner) {
    const removedTracks = [];
    const remoteTracksMap = this.remoteTracks.get(owner);

    if (remoteTracksMap) {
        const removedAudioTrack = remoteTracksMap.get(MediaType.AUDIO);
        const removedVideoTrack = remoteTracksMap.get(MediaType.VIDEO);

        removedAudioTrack && removedTracks.push(removedAudioTrack);
        removedVideoTrack && removedTracks.push(removedVideoTrack);

        this.remoteTracks.delete(owner);
    }

    logger.debug(
        `${this} removed remote tracks for ${owner
            } count: ${removedTracks.length}`);

    return removedTracks;
};

/**
 * Removes and disposes <tt>JitsiRemoteTrack</tt> identified by given stream and
 * track ids.
 *
 * @param {string} streamId the media stream id as defined by the WebRTC
 * @param {string} trackId the media track id as defined by the WebRTC
 * @returns {JitsiRemoteTrack|undefined} the track which has been removed or
 * <tt>undefined</tt> if no track matching given stream and track ids was
 * found.
 */
TraceablePeerConnection.prototype._removeRemoteTrack
= function(streamId, trackId) {
    const toBeRemoved = this._getRemoteTrackById(streamId, trackId);

    if (toBeRemoved) {
        toBeRemoved.dispose();

        const remoteTracksMap
            = this.remoteTracks.get(toBeRemoved.getParticipantId());

        // If _getRemoteTrackById succeeded it must be a valid value or
        // we're good to crash
        if (!remoteTracksMap.delete(toBeRemoved.getType())) {
            logger.error(
                `Failed to remove ${toBeRemoved} - type mapping messed up ?`);
        }

        // FIXME not cool to use RTC's eventEmitter
        this.rtc.eventEmitter.emit(
            RTCEvents.REMOTE_TRACK_REMOVED, toBeRemoved);
    }

    return toBeRemoved;
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

    if (typeof desc !== 'object' || desc === null
        || typeof desc.sdp !== 'string') {
        logger.warn('An empty description was passed as an argument.');

        return ssrcMap;
    }

    const session = transform.parse(desc.sdp);

    if (!Array.isArray(session.media)) {
        return ssrcMap;
    }

    for (const mLine of session.media) {
        if (!Array.isArray(mLine.ssrcs)) {
            continue; // eslint-disable-line no-continue
        }

        if (Array.isArray(mLine.ssrcGroups)) {
            for (const group of mLine.ssrcGroups) {
                if (typeof group.semantics !== 'undefined'
                    && typeof group.ssrcs !== 'undefined') {
                    // Parse SSRCs and store as numbers
                    const groupSSRCs
                        = group.ssrcs.split(' ')
                                     .map(ssrcStr => parseInt(ssrcStr, 10));
                    const primarySSRC = groupSSRCs[0];

                    // Note that group.semantics is already present

                    group.ssrcs = groupSSRCs;

                    // eslint-disable-next-line max-depth
                    if (!groupsMap.has(primarySSRC)) {
                        groupsMap.set(primarySSRC, []);
                    }
                    groupsMap.get(primarySSRC).push(group);
                }
            }
        }
        for (const ssrc of mLine.ssrcs) {
            if (ssrc.attribute !== 'msid') {
                continue; // eslint-disable-line no-continue
            }

            const msid = ssrc.value;
            let ssrcInfo = ssrcMap.get(msid);

            if (!ssrcInfo) {
                ssrcInfo = {
                    ssrcs: [],
                    groups: [],
                    msid
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
const normalizePlanB = function(desc) {
    if (typeof desc !== 'object' || desc === null
        || typeof desc.sdp !== 'string') {
        logger.warn('An empty description was passed as an argument.');

        return desc;
    }

    // eslint-disable-next-line no-shadow
    const transform = require('sdp-transform');
    const session = transform.parse(desc.sdp);

    if (typeof session !== 'undefined'
            && typeof session.media !== 'undefined'
            && Array.isArray(session.media)) {
        session.media.forEach(mLine => {

            // Chrome appears to be picky about the order in which a=ssrc lines
            // are listed in an m-line when rtx is enabled (and thus there are
            // a=ssrc-group lines with FID semantics). Specifically if we have
            // "a=ssrc-group:FID S1 S2" and the "a=ssrc:S2" lines appear before
            // the "a=ssrc:S1" lines, SRD fails.
            // So, put SSRC which appear as the first SSRC in an FID ssrc-group
            // first.
            const firstSsrcs = [];
            const newSsrcLines = [];

            if (typeof mLine.ssrcGroups !== 'undefined'
                && Array.isArray(mLine.ssrcGroups)) {
                mLine.ssrcGroups.forEach(group => {
                    if (typeof group.semantics !== 'undefined'
                        && group.semantics === 'FID') {
                        if (typeof group.ssrcs !== 'undefined') {
                            firstSsrcs.push(Number(group.ssrcs.split(' ')[0]));
                        }
                    }
                });
            }

            if (Array.isArray(mLine.ssrcs)) {
                let i;

                for (i = 0; i < mLine.ssrcs.length; i++) {
                    if (typeof mLine.ssrcs[i] === 'object'
                        && typeof mLine.ssrcs[i].id !== 'undefined'
                        && firstSsrcs.indexOf(mLine.ssrcs[i].id) >= 0) {
                        newSsrcLines.push(mLine.ssrcs[i]);
                        delete mLine.ssrcs[i];
                    }
                }

                for (i = 0; i < mLine.ssrcs.length; i++) {
                    if (typeof mLine.ssrcs[i] !== 'undefined') {
                        newSsrcLines.push(mLine.ssrcs[i]);
                    }
                }

                mLine.ssrcs = newSsrcLines;
            }
        });
    }

    const resStr = transform.write(session);


    return new RTCSessionDescription({
        type: desc.type,
        sdp: resStr
    });
};

/**
 *
 * @param {JitsiLocalTrack} localTrack
 */
TraceablePeerConnection.prototype.getLocalSSRC = function(localTrack) {
    const ssrcInfo = this._getSSRC(localTrack.rtcId);

    return ssrcInfo && ssrcInfo.ssrcs[0];
};

/* eslint-disable-next-line vars-on-top */
const getters = {
    signalingState() {
        return this.peerconnection.signalingState;
    },
    iceConnectionState() {
        return this.peerconnection.iceConnectionState;
    },
    localDescription() {
        let desc = this.peerconnection.localDescription;

        this.trace('getLocalDescription::preTransform', dumpSDP(desc));

        // if we're running on FF, transform to Plan B first.
        if (RTCBrowserType.usesUnifiedPlan()) {
            desc = this.interop.toPlanB(desc);
            this.trace('getLocalDescription::postTransform (Plan B)',
                dumpSDP(desc));
        }

        if (RTCBrowserType.doesVideoMuteByStreamRemove()) {
            this.localSdpMunger.maybeMungeLocalSdp(desc);
            logger.debug(
                'getLocalDescription::postTransform (munge local SDP)', desc);
        }

        return desc || {};
    },
    remoteDescription() {
        let desc = this.peerconnection.remoteDescription;

        this.trace('getRemoteDescription::preTransform', dumpSDP(desc));

        // if we're running on FF, transform to Plan B first.
        if (RTCBrowserType.usesUnifiedPlan()) {
            desc = this.interop.toPlanB(desc);
            this.trace(
                'getRemoteDescription::postTransform (Plan B)', dumpSDP(desc));
        }

        return desc || {};
    }
};

Object.keys(getters).forEach(prop => {
    Object.defineProperty(
        TraceablePeerConnection.prototype,
        prop, {
            get: getters[prop]
        }
    );
});

TraceablePeerConnection.prototype._getSSRC = function(rtcId) {
    return this.localSSRCs.get(rtcId);
};

/**
 * Add {@link JitsiLocalTrack} to this TPC.
 * @param {JitsiLocalTrack} track
 */
TraceablePeerConnection.prototype.addTrack = function(track) {
    const rtcId = track.rtcId;

    logger.info(`add ${track} to: ${this}`);

    if (this.localTracks.has(rtcId)) {
        logger.error(`${track} is already in ${this}`);

        return;
    }

    this.localTracks.set(rtcId, track);
    track._addPeerConnection(this);

    const webrtcStream = track.getOriginalStream();

    if (webrtcStream) {
        this._addStream(webrtcStream);

    // It's not ok for a track to not have a WebRTC stream if:
    } else if (!RTCBrowserType.doesVideoMuteByStreamRemove()
                || track.isAudioTrack()
                || (track.isVideoTrack() && !track.isMuted())) {
        logger.error(`${this} no WebRTC stream for: ${track}`);
    }

    // Muted video tracks do not have WebRTC stream
    if (RTCBrowserType.doesVideoMuteByStreamRemove()
            && track.isVideoTrack() && track.isMuted()) {
        const ssrcInfo = this.generateNewStreamSSRCInfo(track);

        this.sdpConsistency.setPrimarySsrc(ssrcInfo.ssrcs[0]);
        const simGroup
            = ssrcInfo.groups.find(groupInfo => groupInfo.semantics === 'SIM');

        if (simGroup) {
            this.simulcast.setSsrcCache(simGroup.ssrcs);
        }
        const fidGroups
            = ssrcInfo.groups.filter(
                groupInfo => groupInfo.semantics === 'FID');

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

/**
 * Adds local track as part of the unmute operation.
 * @param {JitsiLocalTrack} track the track to be added as part of the unmute
 * operation
 * @return {boolean} <tt>true</tt> if the state of underlying PC has changed and
 * the renegotiation is required or <tt>false</tt> otherwise.
 */
TraceablePeerConnection.prototype.addTrackUnmute = function(track) {
    if (!this._assertTrackBelongs('addTrackUnmute', track)) {
        // Abort
        return false;
    }

    if (track._isAttachedToPC(this)) {
        logger.info(`Adding ${track} as unmute to ${this}`);
        const webRtcStream = track.getOriginalStream();

        if (!webRtcStream) {
            logger.error(
                `Unable to add ${track} as unmute to ${this}`
                    + ' - no WebRTC stream');

            return false;
        }
        this._addStream(webRtcStream);

        return true;
    }

    logger.info(`Not adding detached ${track} as unmute to ${this}`);

    return false;
};

/**
 * Adds WebRTC media stream to the underlying PeerConnection
 * @param {MediaStream} mediaStream
 * @private
 */
TraceablePeerConnection.prototype._addStream = function(mediaStream) {
    this.peerconnection.addStream(mediaStream);
};

/**
 * Removes WebRTC media stream from the underlying PeerConection
 * @param {MediaStream} mediaStream
 */
TraceablePeerConnection.prototype._removeStream = function(mediaStream) {
    if (RTCBrowserType.isFirefox()) {
        this._handleFirefoxRemoveStream(mediaStream);
    } else {
        this.peerconnection.removeStream(mediaStream);
    }
};

/**
 * This method when called will check if given <tt>localTrack</tt> belongs to
 * this TPC (that it has been previously added using {@link addTrack}). If the
 * track does not belong an error message will be logged.
 * @param {string} methodName the method name that will be logged in an error
 * message
 * @param {JitsiLocalTrack} localTrack
 * @return {boolean} <tt>true</tt> if given local track belongs to this TPC or
 * <tt>false</tt> otherwise.
 * @private
 */
TraceablePeerConnection.prototype._assertTrackBelongs
= function(methodName, localTrack) {
    const doesBelong = this.localTracks.has(localTrack.rtcId);

    if (!doesBelong) {
        logger.error(
            `${methodName}: ${localTrack} does not belong to ${this}`);
    }

    return doesBelong;
};

/**
 * Checks whether given track is attached to this TPC. See
 * {@link JitsiLocalTrack._isAttachedToPC} and {@link attachTrack} for more
 * info.
 * @param {JitsiLocalTrack} localTrack
 * @return {boolean} <tt>true</tt> if attached or <tt>false</tt> otherwise
 * @private
 */
TraceablePeerConnection.prototype._isTrackAttached = function(localTrack) {
    return localTrack._isAttachedToPC(this);
};

/**
 * Detaches given local track from this peer connection. A detached track will
 * be removed from the underlying <tt>PeerConnection</tt>, but it will remain
 * associated with this TPC. The {@link LocalSdpMunger} module will fake the
 * local description exposed to {@link JingleSessionPC} in the way that track's
 * SSRC will be still on place. It will prevent from any signaling updates and
 * make other participants think that the track is still there even though they
 * will receive no data for the underlying media stream.
 * @param {JitsiLocalTrack} localTrack
 */
TraceablePeerConnection.prototype.detachTrack = function(localTrack) {
    if (!this._assertTrackBelongs('detachTrack', localTrack)) {
        // Abort
        return;
    } else if (!localTrack._isAttachedToPC(this)) {
        // Abort
        logger.error(
            'An attempt to detach a not-attached '
                + `${localTrack} from ${this} was made`);

        return;
    }

    const webRtcStream = localTrack.getOriginalStream();

    // Muted video track will not have WebRTC stream
    if (webRtcStream) {
        this._removeStream(webRtcStream);
    } else if (localTrack.isVideoTrack() && localTrack.isMuted()) {
        // It is normal that muted video track does not have WebRTC stream
    } else {
        logger.error(`${this} detach ${localTrack} - no WebRTC stream`);
    }

    localTrack._removePeerConnection(this);

    logger.debug(`Detached ${localTrack} from ${this}`);
};

/**
 * This operation reverts {@link detachTrack} (see for more info). The
 * underlying <tt>MediaStream</tt> will be added back to the peer connection
 * and {@link LocalSdpMunger} module will no longer fake it's SSRC through the
 * local description exposed to {@link JingleSessionPC}.
 * @param {JitsiLocalTrack} localTrack
 */
TraceablePeerConnection.prototype.attachTrack = function(localTrack) {
    if (!this._assertTrackBelongs('attachTrack', localTrack)) {
        // Abort
        return;
    } else if (localTrack._isAttachedToPC(this)) {
        // Abort
        logger.error(
            'An attempt to attach an already attached '
            + `${localTrack} to ${this} was made`);

        return;
    }

    localTrack._addPeerConnection(this);

    logger.debug(`Attached ${localTrack} to ${this}`);

    // Muted video tracks are not added to the PeerConnection
    if (!localTrack.isVideoTrack() || !localTrack.isMuted()) {
        const webRtcStream = localTrack.getOriginalStream();

        if (webRtcStream) {
            this._addStream(webRtcStream);

            return true;
        }

        logger.error(`${this} attach - no WebRTC stream for: ${localTrack}`);

        return false;
    }

    logger.debug(`${this} attach ${localTrack} - not adding to PC`);

    return false;
};

/**
 * Remove local track from this TPC.
 * @param {JitsiLocalTrack} localTrack the track to be removed from this TPC.
 *
 * FIXME It should probably remove a boolean just like {@link removeTrackMute}
 *       The same applies to addTrack.
 */
TraceablePeerConnection.prototype.removeTrack = function(localTrack) {
    const webRtcStream = localTrack.getOriginalStream();

    this.trace(
        'removeStream',
        localTrack.rtcId, webRtcStream ? webRtcStream.id : undefined);

    if (!this._assertTrackBelongs('removeStream', localTrack)) {
        // Abort - nothing to be done here
        return;
    }
    this.localTracks.delete(localTrack.rtcId);
    this.localSSRCs.delete(localTrack.rtcId);

    // A detached track will not require removal
    if (this._isTrackAttached(localTrack)) {
        localTrack._removePeerConnection(this);
    }

    if (webRtcStream) {
        if (RTCBrowserType.isFirefox()) {
            this._handleFirefoxRemoveStream(webRtcStream);
        } else {
            this.peerconnection.removeStream(webRtcStream);
        }
    }
};

/**
 * Removes local track as part of the mute operation.
 * @param {JitsiLocalTrack} localTrack the local track to be remove as part of
 * the mute operation.
 * @return {boolean} <tt>true</tt> if the underlying PeerConnection's state has
 * changed and the renegotiation is required or <tt>false</tt> otherwise.
 */
TraceablePeerConnection.prototype.removeTrackMute = function(localTrack) {
    const webRtcStream = localTrack.getOriginalStream();

    this.trace(
        'removeStreamMute',
        localTrack.rtcId, webRtcStream ? webRtcStream.id : null);

    if (!this._assertTrackBelongs('removeStreamMute', localTrack)) {
        // Abort - nothing to be done here
        return false;
    } else if (!localTrack._isAttachedToPC(this)) {
        // Abort - nothing to be done here
        logger.warn(
            `Not removing detached ${localTrack} as unmute from ${this}`);

        return false;
    }

    if (webRtcStream) {
        logger.info(
            `Removing ${localTrack} as mute from ${this}`);
        this._removeStream(webRtcStream);

        return true;
    }

    logger.error(`removeStreamMute - no WebRTC stream for ${localTrack}`);

    return false;
};

/**
 * Remove stream handling for firefox
 * @param stream: webrtc media stream
 */
TraceablePeerConnection.prototype._handleFirefoxRemoveStream
= function(stream) {
    if (!stream) {
        // There is nothing to be changed
        return;
    }
    let sender = null;

    // On Firefox we don't replace MediaStreams as this messes up the
    // m-lines (which can't be removed in Plan Unified) and brings a lot
    // of complications. Instead, we use the RTPSender and remove just
    // the track.
    let track = null;

    if (stream.getAudioTracks() && stream.getAudioTracks().length) {
        track = stream.getAudioTracks()[0];
    } else if (stream.getVideoTracks() && stream.getVideoTracks().length) {
        track = stream.getVideoTracks()[0];
    }

    if (!track) {
        logger.error('Cannot remove tracks: no tracks.');

        return;
    }

    // Find the right sender (for audio or video)
    this.peerconnection.getSenders().some(s => {
        if (s.track === track) {
            sender = s;

            return true;
        }

        return false;
    });

    if (sender) {
        this.peerconnection.removeTrack(sender);
    } else {
        logger.log('Cannot remove tracks: no RTPSender.');
    }
};

TraceablePeerConnection.prototype.createDataChannel = function(label, opts) {
    this.trace('createDataChannel', label, opts);

    return this.peerconnection.createDataChannel(label, opts);
};

TraceablePeerConnection.prototype.setLocalDescription
= function(description, successCallback, failureCallback) {
    let localSdp = description;

    this.trace('setLocalDescription::preTransform', dumpSDP(localSdp));

    // if we're using unified plan, transform to it first.
    if (RTCBrowserType.usesUnifiedPlan()) {
        localSdp = this.interop.toUnifiedPlan(localSdp);
        this.trace(
            'setLocalDescription::postTransform (Unified Plan)',
            dumpSDP(localSdp));
    }

    this.peerconnection.setLocalDescription(localSdp,
        () => {
            this.trace('setLocalDescriptionOnSuccess');
            const localUfrag = SDPUtil.getUfrag(localSdp.sdp);

            if (localUfrag !== this.localUfrag) {
                this.localUfrag = localUfrag;
                this.rtc.eventEmitter.emit(
                    RTCEvents.LOCAL_UFRAG_CHANGED, this, localUfrag);
            }
            successCallback();
        },
        err => {
            this.trace('setLocalDescriptionOnFailure', err);
            this.eventEmitter.emit(
                RTCEvents.SET_LOCAL_DESCRIPTION_FAILED,
                err, this.peerconnection);
            failureCallback(err);
        }
    );
};

TraceablePeerConnection.prototype.setRemoteDescription
= function(description, successCallback, failureCallback) {
    this.trace('setRemoteDescription::preTransform', dumpSDP(description));

    // TODO the focus should squeze or explode the remote simulcast
    // eslint-disable-next-line no-param-reassign
    description = this.simulcast.mungeRemoteDescription(description);
    this.trace(
        'setRemoteDescription::postTransform (simulcast)',
        dumpSDP(description));

    if (this.options.preferH264) {
        const parsedSdp = transform.parse(description.sdp);
        const videoMLine = parsedSdp.media.find(m => m.type === 'video');

        SDPUtil.preferVideoCodec(videoMLine, 'h264');
        description.sdp = transform.write(parsedSdp);
    }

    // If the browser uses unified plan, transform to it first
    if (RTCBrowserType.usesUnifiedPlan()) {
        description.sdp = this.rtxModifier.stripRtx(description.sdp);
        this.trace(
                'setRemoteDescription::postTransform (stripRtx)',
                dumpSDP(description));

        // eslint-disable-next-line no-param-reassign
        description = this.interop.toUnifiedPlan(description);
        this.trace(
                'setRemoteDescription::postTransform (Plan A)',
                dumpSDP(description));
    } else {
        // Plan B
        // eslint-disable-next-line no-param-reassign
        description = normalizePlanB(description);
    }

    this.peerconnection.setRemoteDescription(
        description,
        () => {
            this.trace('setRemoteDescriptionOnSuccess');
            const remoteUfrag = SDPUtil.getUfrag(description.sdp);

            if (remoteUfrag !== this.remoteUfrag) {
                this.remoteUfrag = remoteUfrag;
                this.rtc.eventEmitter.emit(
                    RTCEvents.REMOTE_UFRAG_CHANGED, this, remoteUfrag);
            }
            successCallback();
        },
        err => {
            this.trace('setRemoteDescriptionOnFailure', err);
            this.eventEmitter.emit(
                RTCEvents.SET_REMOTE_DESCRIPTION_FAILED,
                err,
                this.peerconnection);
            failureCallback(err);
        });
};

/**
 * Makes the underlying TraceablePeerConnection generate new SSRC for
 * the recvonly video stream.
 * @deprecated
 */
TraceablePeerConnection.prototype.generateRecvonlySsrc = function() {
    // FIXME replace with SDPUtil.generateSsrc (when it's added)
    const newSSRC = this.generateNewStreamSSRCInfo().ssrcs[0];

    logger.info(`Generated new recvonly SSRC: ${newSSRC}`);
    this.sdpConsistency.setPrimarySsrc(newSSRC);
};

/**
 * Makes the underlying TraceablePeerConnection forget the current primary video
 * SSRC.
 * @deprecated
 */
TraceablePeerConnection.prototype.clearRecvonlySsrc = function() {
    logger.info('Clearing primary video SSRC!');
    this.sdpConsistency.clearVideoSsrcCache();
};

TraceablePeerConnection.prototype.close = function() {
    this.trace('stop');

    // Off SignalingEvents
    this.signalingLayer.off(
        SignalingEvents.PEER_MUTED_CHANGED, this._peerMutedChanged);
    this.signalingLayer.off(
        SignalingEvents.PEER_VIDEO_TYPE_CHANGED, this._peerVideoTypeChanged);

    if (!this.rtc._removePeerConnection(this)) {
        logger.error('RTC._removePeerConnection returned false');
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
const _fixAnswerRFC4145Setup = function(offer, answer) {
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
            && offer.media.length === answer.media.length) {
        answer.media.forEach((a, i) => {
            if (SDPUtil.findLine(
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
= function(successCallback, failureCallback, constraints) {
    this._createOfferOrAnswer(
        false /* answer */, successCallback, failureCallback, constraints);
};

TraceablePeerConnection.prototype.createOffer
= function(successCallback, failureCallback, constraints) {
    this._createOfferOrAnswer(
        true /* offer */, successCallback, failureCallback, constraints);
};

/* eslint-disable max-params */

TraceablePeerConnection.prototype._createOfferOrAnswer
= function(isOffer, successCallback, failureCallback, constraints) {
    const logName = isOffer ? 'Offer' : 'Answer';

    this.trace(`create${logName}`, JSON.stringify(constraints, null, ' '));

    const offerOrAnswerMethod
        = isOffer
            ? this.peerconnection.createOffer.bind(this.peerconnection)
            : this.peerconnection.createAnswer.bind(this.peerconnection);

    offerOrAnswerMethod(
        resultSdp => {
            try {
                this.trace(
                    `create${logName}OnSuccess::preTransform`,
                    dumpSDP(resultSdp));

                // if we're using unified plan, transform to Plan B.
                if (RTCBrowserType.usesUnifiedPlan()) {
                    // eslint-disable-next-line no-param-reassign
                    resultSdp = this.interop.toPlanB(resultSdp);
                    this.trace(
                        `create${logName}OnSuccess::postTransform (Plan B)`,
                        dumpSDP(resultSdp));
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
                    // If there are no local video tracks, then a "recvonly"
                    // SSRC needs to be generated
                    if (!this.getLocalTracks(MediaType.VIDEO).length) {
                        this.sdpConsistency.setPrimarySsrc(
                            SDPUtil.generateSsrc());
                    }
                    resultSdp.sdp
                        = this.sdpConsistency.makeVideoPrimarySsrcsConsistent(
                            resultSdp.sdp);
                    resultSdp.sdp
                        = this.sdpConsistency.makeAudioSSRCConsistent(
                            resultSdp.sdp);
                    this.trace(
                        `create${logName}OnSuccess::postTransform `
                             + '(make primary audio/video ssrcs consistent)',
                        dumpSDP(resultSdp));
                }

                // Add simulcast streams if simulcast is enabled
                if (this.isSimulcastOn()) {

                    // eslint-disable-next-line no-param-reassign
                    resultSdp = this.simulcast.mungeLocalDescription(resultSdp);
                    this.trace(
                        `create${logName}`
                            + 'OnSuccess::postTransform (simulcast)',
                        dumpSDP(resultSdp));
                }

                if (!this.options.disableRtx && RTCBrowserType.supportsRtx()) {
                    resultSdp.sdp
                        = this.rtxModifier.modifyRtxSsrcs(resultSdp.sdp);
                    this.trace(
                        `create${logName}`
                             + 'OnSuccess::postTransform (rtx modifier)',
                        dumpSDP(resultSdp));
                }

                // Fix the setup attribute (see _fixAnswerRFC4145Setup for
                //  details)
                if (!isOffer) {
                    const remoteDescription
                        = new SDP(this.remoteDescription.sdp);
                    const localDescription = new SDP(resultSdp.sdp);

                    _fixAnswerRFC4145Setup(remoteDescription, localDescription);
                    resultSdp.sdp = localDescription.raw;
                }

                const ssrcMap = extractSSRCMap(resultSdp);

                logger.info('Got SSRC MAP: ', ssrcMap);

                // Set up the ssrcHandler for the new track before we add it at
                // the lower levels
                this._applyLocalSSRCMap(ssrcMap);

                successCallback(resultSdp);
            } catch (e) {
                this.trace(`create${logName}OnError`, e);
                this.trace(`create${logName}OnError`, dumpSDP(resultSdp));
                logger.error(
                    `create${logName}OnError`, e, dumpSDP(resultSdp));
                failureCallback(e);
            }
        },
        err => {
            this.trace(`create${logName}OnFailure`, err);
            const eventType
                = isOffer
                    ? RTCEvents.CREATE_OFFER_FAILED
                    : RTCEvents.CREATE_ANSWER_FAILED;

            this.eventEmitter.emit(eventType, err, this.peerconnection);
            failureCallback(err);
        },
        constraints);
};

/* eslint-enable max-params */

/**
 * Extract primary SSRC from given {@link TrackSSRCInfo} object.
 * @param {TrackSSRCInfo} ssrcObj
 * @return {number|null} the primary SSRC or <tt>null</tt>
 */
function extractPrimarySSRC(ssrcObj) {
    if (ssrcObj && ssrcObj.groups && ssrcObj.groups.length) {
        return ssrcObj.groups[0].ssrcs[0];
    } else if (ssrcObj && ssrcObj.ssrcs && ssrcObj.ssrcs.length) {
        return ssrcObj.ssrcs[0];
    }

    return null;
}

/**
 * Applies SSRC map extracted from the latest local description to local tracks.
 * @param {Map<string,TrackSSRCInfo>} ssrcMap
 * @private
 */
TraceablePeerConnection.prototype._applyLocalSSRCMap = function(ssrcMap) {
    for (const track of this.localTracks.values()) {
        const trackMSID = track.getMSID();

        if (ssrcMap.has(trackMSID)) {
            const newSSRC = ssrcMap.get(trackMSID);

            if (!newSSRC) {
                logger.error(`No SSRC found for: ${trackMSID} in ${this}`);

                return;
            }
            const oldSSRC = this.localSSRCs.get(track.rtcId);
            const newSSRCNum = extractPrimarySSRC(newSSRC);
            const oldSSRCNum = extractPrimarySSRC(oldSSRC);

            // eslint-disable-next-line no-negated-condition
            if (newSSRCNum !== oldSSRCNum) {
                if (oldSSRCNum === null) {
                    logger.info(
                        `Setting new local SSRC for ${track} in ${this}`,
                        newSSRC);
                } else {
                    logger.error(
                        `Overwriting SSRC for ${track} ${trackMSID} in ${this
                        } with: `, newSSRC);
                }
                this.localSSRCs.set(track.rtcId, newSSRC);
            } else {
                logger.debug(
                    `Not updating local SSRC for ${track} ${trackMSID} to: `
                        + `${newSSRCNum} in ${this}`);
            }
        } else {
            logger.warn(`No local track matched with: ${trackMSID} in ${this}`);
        }
    }
};

TraceablePeerConnection.prototype.addIceCandidate
= function(candidate, successCallback, failureCallback) {
    // var self = this;
    this.trace('addIceCandidate', JSON.stringify(candidate, null, ' '));
    this.peerconnection.addIceCandidate(
        candidate, successCallback, failureCallback);

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
        this.peerconnection.getStats(
            null,
            callback,
            errback || (() => {
                // Making sure that getStats won't fail if error callback is
                // not passed.
            }));
    } else {
        this.peerconnection.getStats(callback);
    }
};

/**
 * Generates and stores new SSRC info object for given local track.
 * The method should be called only for a video track being added to this TPC
 * in the muted state (given that the current browser uses this strategy).
 * @param {JitsiLocalTrack} track
 * @return {TPCSSRCInfo}
 */
TraceablePeerConnection.prototype.generateNewStreamSSRCInfo = function(track) {
    const rtcId = track.rtcId;
    let ssrcInfo = this._getSSRC(rtcId);

    if (ssrcInfo) {
        logger.error(`Will overwrite local SSRCs for track ID: ${rtcId}`);
    }
    if (this.isSimulcastOn()) {
        ssrcInfo = {
            ssrcs: [],
            groups: []
        };
        for (let i = 0; i < SIMULCAST_LAYERS; i++) {
            ssrcInfo.ssrcs.push(SDPUtil.generateSsrc());
        }
        ssrcInfo.groups.push({
            ssrcs: ssrcInfo.ssrcs.slice(),
            semantics: 'SIM'
        });
    } else {
        ssrcInfo = {
            ssrcs: [ SDPUtil.generateSsrc() ],
            groups: []
        };
    }
    if (!this.options.disableRtx && RTCBrowserType.supportsRtx()) {
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
                ssrcs: [ primarySsrc, rtxSsrc ],
                semantics: 'FID'
            });
        }
    }
    ssrcInfo.msid = track.storedMSID;
    this.localSSRCs.set(rtcId, ssrcInfo);

    return ssrcInfo;
};

/**
 * Creates a text representation of this <tt>TraceablePeerConnection</tt>
 * instance.
 * @return {string}
 */
TraceablePeerConnection.prototype.toString = function() {
    return `TPC[${this.id},p2p:${this.isP2P}]`;
};

module.exports = TraceablePeerConnection;
