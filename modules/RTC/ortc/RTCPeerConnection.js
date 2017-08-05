/* global __filename, RTCIceGatherer, RTCIceTransport, RTCDtlsTransport,
RTCRtpSender, RTCRtpReceiver */

import { getLogger } from 'jitsi-meet-logger';
import yaeti from 'yaeti';

import RTCSessionDescription from './RTCSessionDescription';
import * as utils from './utils';
import { InvalidStateError } from './errors';
import RandomUtil from '../../util/RandomUtil';
import SDPUtil from '../../xmpp/SDPUtil';

const logger = getLogger(__filename);

const RTCSignalingState = {
    stable: 'stable',
    haveLocalOffer: 'have-local-offer',
    haveRemoteOffer: 'have-remote-offer',
    closed: 'closed'
};

const RTCIceGatheringState = {
    new: 'new',
    gathering: 'gathering',
    complete: 'complete'
};

const CNAME = `jitsi-ortc-cname-${RandomUtil.randomInt(10000, 99999)}`;

/**
 * RTCPeerConnection shim for ORTC based endpoints (such as Edge).
 *
 * The interface is based on the W3C specification of 2015, which matches
 * the implementation of Chrome nowadays:
 *
 *   https://www.w3.org/TR/2015/WD-webrtc-20150210/
 *
 * It also implements Plan-B for multi-stream, and assumes single BUNDLEd
 * transport and rtcp-mux.
 */
export default class ortcRTCPeerConnection extends yaeti.EventTarget {
    /**
     */
    constructor(pcConfig) {
        super();

        logger.debug('constructor() pcConfig:', pcConfig);

        // Buffered local ICE candidates (in WebRTC format).
        // @type {sequence<RTCIceCandidate>}
        this._bufferedIceCandidates = [];

        // Closed flag.
        // @type {Boolean}
        this._closed = false;

        // RTCDtlsTransport.
        // @type {RTCDtlsTransport}
        this._dtlsTransport = null;

        // RTCIceGatherer.
        // @type {RTCIceGatherer}
        this._iceGatherer = null;

        // RTCPeerConnection iceGatheringState.
        // NOTE: This should not be needed, but Edge does not implement
        // iceGatherer.state.
        // @type {RTCIceGatheringState}
        this._iceGatheringState = RTCIceGatheringState.new;

        // RTCIceTransport.
        // @type {RTCIceTransport}
        this._iceTransport = null;

        // Local RTP capabilities (filtered with remote ones).
        // @type {RTCRtpCapabilities}
        this._localCapabilities = null;

        // Local RTCSessionDescription.
        // @type {RTCSessionDescription}
        this._localDescription = null;

        // Map with info regarding local media.
        // - index: MediaStreamTrack.id
        // - value: Object
        //   - rtpSender: Associated RTCRtpSender instance
        //   - stream: Associated MediaStream instance
        //   - ssrc: Provisional or definitive SSRC
        //   - rtxSsrc: Provisional or definitive SSRC for RTX
        //   - sending: Boolean indicating whether rtpSender.send() was called.
        this._localTrackInfos = new Map();

        // Ordered Map with MID as key and kind as value.
        // @type {map<String, String>}
        this._mids = new Map();

        // Remote RTCSessionDescription.
        // @type {RTCSessionDescription}
        this._remoteDescription = null;

        // Map of remote streams.
        // - index: MediaStream.jitsiRemoteId (as signaled in remote SDP)
        // - value: MediaStream (locally generated so id does not match)
        // @type {map<Number, MediaStream>}
        this._remoteStreams = new Map();

        // Map with info about receiving media.
        // - index: Media SSRC
        // - value: Object
        //   - kind: 'audio' / 'video'
        //   - ssrc: Media SSRC
        //   - rtxSsrc: RTX SSRC (may be unset)
        //   - streamId: MediaStream.jitsiRemoteId
        //   - trackId: MediaStreamTrack.jitsiRemoteId
        //   - cname: CNAME
        //   - stream: MediaStream
        //   - track: MediaStreamTrack
        //   - rtpReceiver: Associated RTCRtpReceiver instance
        // @type {map<Number, Object>}
        this._remoteTrackInfos = new Map();

        // Local SDP global fields.
        this._sdpGlobalFields = {
            id: SDPUtil.generateSsrc(),
            version: 0
        };

        // RTCPeerConnection signalingState.
        // @type {RTCSignalingState}
        this._signalingState = RTCSignalingState.stable;

        // Create the RTCIceGatherer.
        this._setIceGatherer(pcConfig);

        // Create the RTCIceTransport.
        this._setIceTransport(this._iceGatherer);

        // Create the RTCDtlsTransport.
        this._setDtlsTransport(this._iceTransport);
    }

    /**
     * Current ICE+DTLS connection state.
     * @return {RTCPeerConnectionState}
     */
    get connectionState() {
        return this._dtlsTransport.state;
    }

    /**
     * Current ICE connection state.
     * @return {RTCIceConnectionState}
     */
    get iceConnectionState() {
        return this._iceTransport.state;
    }

    /**
     * Current ICE gathering state.
     * @return {RTCIceGatheringState}
     */
    get iceGatheringState() {
        return this._iceGatheringState;
    }

    /**
     * Gets the local description.
     * @return {RTCSessionDescription}
     */
    get localDescription() {
        return this._localDescription;
    }

    /**
     * Gets the remote description.
     * @return {RTCSessionDescription}
     */
    get remoteDescription() {
        return this._remoteDescription;
    }

    /**
     * Current signaling state.
     * @return {RTCSignalingState}
     */
    get signalingState() {
        return this._signalingState;
    }

    /**
     * Adds a remote ICE candidate. Implements both the old callbacks based
     * signature and the new Promise based style.
     *
     * Arguments in Promise mode:
     * @param {RTCIceCandidate} candidate
     *
     * Arguments in callbacks mode:
     * @param {RTCIceCandidate} candidate
     * @param {function()} callback
     * @param {function(error)} errback
     */
    addIceCandidate(candidate, ...args) {
        let usePromise;
        let callback;
        let errback;

        if (!candidate) {
            throw new TypeError('candidate missing');
        }

        if (args.length === 0) {
            usePromise = true;
        } else {
            usePromise = false;
            callback = args[0];
            errback = args[1];

            if (typeof callback !== 'function') {
                throw new TypeError('callback missing');
            }

            if (typeof errback !== 'function') {
                throw new TypeError('errback missing');
            }
        }

        logger.debug('addIceCandidate() candidate:', candidate);

        if (usePromise) {
            return this._addIceCandidate(candidate);
        }

        this._addIceCandidate(candidate)
            .then(() => callback())
            .catch(error => errback(error));
    }

    /**
     * Adds a local MediaStream.
     * @param {MediaStream} stream.
     * NOTE: Deprecated API.
     */
    addStream(stream) {
        logger.debug('addStream()');

        this._addStream(stream);
    }

    /**
     * Closes the RTCPeerConnection and all the underlying ORTC objects.
     */
    close() {
        if (this._closed) {
            return;
        }

        this._closed = true;

        logger.debug('close()');

        this._updateAndEmitSignalingStateChange(RTCSignalingState.closed);

        // Close RTCIceGatherer.
        // NOTE: Not yet implemented by Edge.
        try {
            this._iceGatherer.close();
        } catch (error) {
            logger.warn(`iceGatherer.close() failed:${error}`);
        }

        // Close RTCIceTransport.
        try {
            this._iceTransport.stop();
        } catch (error) {
            logger.warn(`iceTransport.stop() failed:${error}`);
        }

        // Close RTCDtlsTransport.
        try {
            this._dtlsTransport.stop();
        } catch (error) {
            logger.warn(`dtlsTransport.stop() failed:${error}`);
        }

        // Close and clear RTCRtpSenders.
        for (const info of this._localTrackInfos.values()) {
            const rtpSender = info.rtpSender;

            try {
                rtpSender.stop();
            } catch (error) {
                logger.warn(`rtpSender.stop() failed:${error}`);
            }
        }

        this._localTrackInfos.clear();

        // Close and clear RTCRtpReceivers.
        for (const info of this._remoteTrackInfos.values()) {
            const rtpReceiver = info.rtpReceiver;

            try {
                rtpReceiver.stop();
            } catch (error) {
                logger.warn(`rtpReceiver.stop() failed:${error}`);
            }
        }

        this._remoteTrackInfos.clear();

        // Clear remote streams.
        this._remoteStreams.clear();
    }

    /**
     * Creates a local answer. Implements both the old callbacks based signature
     * and the new Promise based style.
     *
     * Arguments in Promise mode:
     * @param {RTCOfferOptions} [options]
     *
     * Arguments in callbacks mode:
     * @param {function(desc)} callback
     * @param {function(error)} errback
     * @param {MediaConstraints} [constraints]
     */
    createAnswer(...args) {
        let usePromise;
        let options;
        let callback;
        let errback;

        if (args.length <= 1) {
            usePromise = true;
            options = args[0];
        } else {
            usePromise = false;
            callback = args[0];
            errback = args[1];
            options = args[2];

            if (typeof callback !== 'function') {
                throw new TypeError('callback missing');
            }

            if (typeof errback !== 'function') {
                throw new TypeError('errback missing');
            }
        }

        logger.debug('createAnswer() options:', options);

        if (usePromise) {
            return this._createAnswer(options);
        }

        this._createAnswer(options)
            .then(desc => callback(desc))
            .catch(error => errback(error));
    }

    /**
     * Creates a RTCDataChannel.
     */
    createDataChannel() {
        logger.debug('createDataChannel()');

        // NOTE: DataChannels not implemented in Edge.
        throw new Error('createDataChannel() not supported in Edge');
    }

    /**
     * Creates a local offer. Implements both the old callbacks based signature
     * and the new Promise based style.
     *
     * Arguments in Promise mode:
     * @param {RTCOfferOptions} [options]
     *
     * Arguments in callbacks mode:
     * @param {function(desc)} callback
     * @param {function(error)} errback
     * @param {MediaConstraints} [constraints]
     */
    createOffer(...args) {
        let usePromise;
        let options;
        let callback;
        let errback;

        if (args.length <= 1) {
            usePromise = true;
            options = args[0];
        } else {
            usePromise = false;
            callback = args[0];
            errback = args[1];
            options = args[2];

            if (typeof callback !== 'function') {
                throw new TypeError('callback missing');
            }

            if (typeof errback !== 'function') {
                throw new TypeError('errback missing');
            }
        }

        logger.debug('createOffer() options:', options);

        if (usePromise) {
            return this._createOffer(options);
        }

        this._createOffer(options)
            .then(desc => callback(desc))
            .catch(error => errback(error));
    }

    /**
     * Gets a sequence of local MediaStreams.
     * @return {sequence<MediaStream>}
     */
    getLocalStreams() {
        return Array.from(this._localTrackInfos.values())
            .map(info => info.stream)
            .filter((elem, pos, arr) => arr.indexOf(elem) === pos);
    }

    /**
     * Gets a sequence of remote MediaStreams.
     * @return {sequence<MediaStream>}
     */
    getRemoteStreams() {
        return Array.from(this._remoteStreams.values());
    }

    /**
     * Get RTP statistics. Implements both the old callbacks based signature
     * and the new Promise based style.
     *
     * Arguments in Promise mode:
     * @param {MediaStreamTrack} [selector]
     *
     * Arguments in callbacks mode:
     * @param {MediaStreamTrack} [selector]
     * @param {function(desc)} callback
     * @param {function(error)} errback
     */
    getStats(...args) {
        let usePromise;
        let selector;
        let callback;
        let errback;

        if (typeof args[0] === 'function') {
            usePromise = false;
            callback = args[0];
            errback = args[1];
        } else if (typeof args[1] === 'function') {
            usePromise = false;
            selector = args[0];
            callback = args[1];
            errback = args[2];
        } else {
            usePromise = true;
            selector = args[0];
        }

        if (!usePromise && !errback) {
            errback = error => {
                logger.error(`getStats() failed: ${error}`);
                logger.error(error.stack);
            };
        }

        if (usePromise) {
            return this._getStats(selector);
        }

        this._getStats(selector)
            .then(stats => callback(stats))
            .catch(error => errback(error));
    }

    /**
     * Removes a local MediaStream.
     * @param {MediaStream} stream.
     * NOTE: Deprecated API.
     */
    removeStream(stream) {
        logger.debug('removeStream()');

        this._removeStream(stream);
    }

    /**
     * Applies a local description. Implements both the old callbacks based
     * signature and the new Promise based style.
     *
     * Arguments in Promise mode:
     * @param {RTCSessionDescriptionInit} desc
     *
     * Arguments in callbacks mode:
     * @param {RTCSessionDescription} desc
     * @param {function()} callback
     * @param {function(error)} errback
     */
    setLocalDescription(desc, ...args) {
        let usePromise;
        let callback;
        let errback;

        if (!desc) {
            throw new TypeError('description missing');
        }

        if (args.length === 0) {
            usePromise = true;
        } else {
            usePromise = false;
            callback = args[0];
            errback = args[1];

            if (typeof callback !== 'function') {
                throw new TypeError('callback missing');
            }

            if (typeof errback !== 'function') {
                throw new TypeError('errback missing');
            }
        }

        logger.debug('setLocalDescription() desc:', desc);

        if (usePromise) {
            return this._setLocalDescription(desc);
        }

        this._setLocalDescription(desc)
            .then(() => callback())
            .catch(error => errback(error));
    }

    /**
     * Applies a remote description. Implements both the old callbacks based
     * signature and the new Promise based style.
     *
     * Arguments in Promise mode:
     * @param {RTCSessionDescriptionInit} desc
     *
     * Arguments in callbacks mode:
     * @param {RTCSessionDescription} desc
     * @param {function()} callback
     * @param {function(error)} errback
     */
    setRemoteDescription(desc, ...args) {
        let usePromise;
        let callback;
        let errback;

        if (!desc) {
            throw new TypeError('description missing');
        }

        if (args.length === 0) {
            usePromise = true;
        } else {
            usePromise = false;
            callback = args[0];
            errback = args[1];

            if (typeof callback !== 'function') {
                throw new TypeError('callback missing');
            }

            if (typeof errback !== 'function') {
                throw new TypeError('errback missing');
            }
        }

        logger.debug('setRemoteDescription() desc:', desc);

        if (usePromise) {
            return this._setRemoteDescription(desc);
        }

        this._setRemoteDescription(desc)
            .then(() => callback())
            .catch(error => errback(error));
    }

    /**
     * Promise based implementation for addIceCandidate().
     * @return {Promise}
     * @private
     */
    _addIceCandidate(candidate) { // eslint-disable-line no-unused-vars
        if (this._closed) {
            return Promise.reject(
                new InvalidStateError('RTCPeerConnection closed'));
        }

        // NOTE: Edge does not support Trickle-ICE so just candidates in the
        // remote SDP are applied. Candidates given later would be just
        // ignored, so notify the called about that.
        return Promise.reject(new Error('addIceCandidate() not supported'));
    }

    /**
     * Implementation for addStream().
     * @private
     */
    _addStream(stream) {
        if (this._closed) {
            throw new InvalidStateError('RTCPeerConnection closed');
        }

        // Create a RTCRtpSender for each track.
        for (const track of stream.getTracks()) {
            // Ignore if ended.
            if (track.readyState === 'ended') {
                logger.warn('ignoring ended MediaStreamTrack');

                continue; // eslint-disable-line no-continue
            }

            // Ignore if track is already present.
            if (this._localTrackInfos.has(track.id)) {
                logger.warn('ignoring already handled MediaStreamTrack');

                continue; // eslint-disable-line no-continue
            }

            const rtpSender = new RTCRtpSender(track, this._dtlsTransport);

            // Store it in the map.
            this._localTrackInfos.set(track.id, {
                rtpSender,
                stream
            });
        }

        // Check for local tracks removal.
        for (const [ trackId, info ] of this._localTrackInfos) {
            const track = info.rtpSender.track;

            // Check if any of the local tracks has been stopped.
            if (track.readyState === 'ended') {
                logger.warn(
                    '_addStream() an already handled track was stopped, '
                    + `track.id:${track.id}`);

                try {
                    info.rtpSender.stop();
                } catch (error) {
                    logger.warn(`rtpSender.stop() failed:${error}`);
                }

                // Remove from the map.
                this._localTrackInfos.delete(track.id);

            // Also, if the stream was already handled, check whether tracks
            // have been removed via stream.removeTrack() and, if so, stop
            // their RtpSenders.
            } else if (info.stream === stream
                && !stream.getTrackById(trackId)) {
                logger.warn(
                    '_addStream() a track in this stream was removed, '
                    + `track.id:${trackId}`);

                try {
                    info.rtpSender.stop();
                } catch (error) {
                    logger.warn(`rtpSender.stop() failed:${error}`);
                }

                // Remove from the map.
                this._localTrackInfos.delete(track.id);
            }
        }

        // It may need to renegotiate.
        this._emitNegotiationNeeded();
    }

    /**
     * Promise based implementation for createAnswer().
     * @returns {Promise}
     * @private
     */
    _createAnswer(options) { // eslint-disable-line no-unused-vars
        if (this._closed) {
            return Promise.reject(
                new InvalidStateError('RTCPeerConnection closed'));
        }

        if (this.signalingState !== RTCSignalingState.haveRemoteOffer) {
            return Promise.reject(new InvalidStateError(
                `invalid signalingState "${this.signalingState}"`));
        }

        // Create an answer.
        const localDescription = this._createLocalDescription('answer');

        // Resolve with it.
        return Promise.resolve(localDescription);
    }

    /**
     * Creates the local RTCSessionDescription.
     * @param {String} type - 'offer' / 'answer'.
     * @return {RTCSessionDescription}
     */
    _createLocalDescription(type) {
        const sdpObject = {};
        const localIceParameters = this._iceGatherer.getLocalParameters();
        const localIceCandidates = this._iceGatherer.getLocalCandidates();
        const localDtlsParameters = this._dtlsTransport.getLocalParameters();
        const remoteDtlsParameters = this._dtlsTransport.getRemoteParameters();
        const localCapabilities = this._localCapabilities;
        const localTrackInfos = this._localTrackInfos;

        // Increase SDP version if an offer.
        if (type === 'offer') {
            this._sdpGlobalFields.version++;
        }

        // SDP global fields.
        sdpObject.version = 0;
        sdpObject.origin = {
            address: '127.0.0.1',
            ipVer: 4,
            netType: 'IN',
            sessionId: this._sdpGlobalFields.id,
            sessionVersion: this._sdpGlobalFields.version,
            username: 'jitsi-ortc-webrtc-shim'
        };
        sdpObject.name = '-';
        sdpObject.timing = {
            start: 0,
            stop: 0
        };
        sdpObject.msidSemantic = {
            semantic: 'WMS',
            token: '*'
        };
        sdpObject.groups = [
            {
                mids: Array.from(this._mids.keys()).join(' '),
                type: 'BUNDLE'
            }
        ];
        sdpObject.media = [];

        // DTLS fingerprint.
        sdpObject.fingerprint = {
            hash: localDtlsParameters.fingerprints[0].value,
            type: localDtlsParameters.fingerprints[0].algorithm
        };

        // Let's check whether there is video RTX.
        let hasVideoRtx = false;

        for (const codec of localCapabilities.codecs) {
            if (codec.kind === 'video' && codec.name === 'rtx') {
                hasVideoRtx = true;
                break;
            }
        }

        // Add m= sections.
        for (const [ mid, kind ] of this._mids) {
            addMediaSection.call(this, mid, kind);
        }

        // Create a RTCSessionDescription.
        const localDescription = new RTCSessionDescription({
            type,
            _sdpObject: sdpObject
        });

        logger.debug('_createLocalDescription():', localDescription);

        return localDescription;

        /**
         * Add a m= section.
         */
        function addMediaSection(mid, kind) {
            const mediaObject = {};

            // m= line.
            mediaObject.type = kind;

            switch (kind) {
            case 'audio':
            case 'video':
                mediaObject.protocol = 'RTP/SAVPF';
                mediaObject.port = 9;
                mediaObject.direction = 'sendrecv';
                break;
            case 'application':
                mediaObject.protocol = 'DTLS/SCTP';
                mediaObject.port = 0; // Reject m section.
                mediaObject.payloads = '0'; // Just put something.
                mediaObject.direction = 'inactive';
                break;
            }

            // c= line.
            mediaObject.connection = {
                ip: '127.0.0.1',
                version: 4
            };

            // a=mid attribute.
            mediaObject.mid = mid;

            // ICE.
            mediaObject.iceUfrag = localIceParameters.usernameFragment;
            mediaObject.icePwd = localIceParameters.password;
            mediaObject.candidates = [];

            for (const candidate of localIceCandidates) {
                const candidateObject = {};

                // rtcp-mux is assumed, so component is always 1 (RTP).
                candidateObject.component = 1;
                candidateObject.foundation = candidate.foundation;
                candidateObject.ip = candidate.ip;
                candidateObject.port = candidate.port;
                candidateObject.priority = candidate.priority;
                candidateObject.transport
                    = candidate.protocol.toLowerCase();
                candidateObject.type = candidate.type;
                if (candidateObject.transport === 'tcp') {
                    candidateObject.tcptype = candidate.tcpType;
                }

                mediaObject.candidates.push(candidateObject);
            }

            mediaObject.endOfCandidates = 'end-of-candidates';

            // DTLS.
            // If 'offer' always use 'actpass'.
            if (type === 'offer') {
                mediaObject.setup = 'actpass';
            } else {
                mediaObject.setup = remoteDtlsParameters.role === 'server'
                    ? 'active' : 'passive';
            }

            if (kind === 'audio' || kind === 'video') {
                mediaObject.rtp = [];
                mediaObject.rtcpFb = [];
                mediaObject.fmtp = [];

                // Array of payload types.
                const payloads = [];

                // Add codecs.
                for (const codec of localCapabilities.codecs) {
                    if (codec.kind && codec.kind !== kind) {
                        continue; // eslint-disable-line no-continue
                    }

                    payloads.push(codec.preferredPayloadType);

                    const rtpObject = {
                        codec: codec.name,
                        payload: codec.preferredPayloadType,
                        rate: codec.clockRate
                    };

                    if (codec.numChannels > 1) {
                        rtpObject.encoding = codec.numChannels;
                    }

                    mediaObject.rtp.push(rtpObject);

                    // If codec has parameters add them into a=fmtp attributes.
                    if (codec.parameters) {
                        const paramFmtp = {
                            config: '',
                            payload: codec.preferredPayloadType
                        };

                        for (const name of Object.keys(codec.parameters)) {
                            /* eslint-disable max-depth */
                            if (paramFmtp.config) {
                                paramFmtp.config += ';';
                            }
                            /* eslint-enable max-depth */

                            paramFmtp.config
                                += `${name}=${codec.parameters[name]}`;
                        }

                        if (paramFmtp.config) {
                            mediaObject.fmtp.push(paramFmtp);
                        }
                    }

                    // Set RTCP feedback.
                    for (const fb of codec.rtcpFeedback || []) {
                        mediaObject.rtcpFb.push({
                            payload: codec.preferredPayloadType,
                            subtype: fb.parameter || undefined,
                            type: fb.type
                        });
                    }
                }

                // If there are no codecs, set this m section as unavailable.
                if (payloads.length === 0) {
                    mediaObject.payloads = '9'; // Just put something.
                    mediaObject.port = 0;
                    mediaObject.direction = 'inactive';
                } else {
                    mediaObject.payloads = payloads.join(' ');
                }

                // SSRCs.
                mediaObject.ssrcs = [];
                mediaObject.ssrcGroups = [];

                // Add RTP sending stuff.
                for (const info of localTrackInfos.values()) {
                    const rtpSender = info.rtpSender;
                    const streamId = info.stream.id;
                    const track = rtpSender.track;

                    // Ignore if ended.
                    if (track.readyState === 'ended') {
                        continue; // eslint-disable-line no-continue
                    }

                    if (track.kind !== kind) {
                        continue; // eslint-disable-line no-continue
                    }

                    // Set a random provisional SSRC if not set.
                    if (!info.ssrc) {
                        info.ssrc = SDPUtil.generateSsrc();
                    }

                    // Whether RTX should be enabled.
                    const enableRtx = hasVideoRtx && track.kind === 'video';

                    // Set a random provisional RTX SSRC if not set.
                    if (enableRtx && !info.rtxSsrc) {
                        info.rtxSsrc = info.ssrc + 1;
                    }

                    mediaObject.ssrcs.push({
                        attribute: 'cname',
                        id: info.ssrc,
                        value: CNAME
                    });

                    mediaObject.ssrcs.push({
                        attribute: 'msid',
                        id: info.ssrc,
                        value: `${streamId} ${track.id}`
                    });

                    mediaObject.ssrcs.push({
                        attribute: 'mslabel',
                        id: info.ssrc,
                        value: streamId
                    });

                    mediaObject.ssrcs.push({
                        attribute: 'label',
                        id: info.ssrc,
                        value: track.id
                    });

                    if (enableRtx) {
                        mediaObject.ssrcs.push({
                            attribute: 'cname',
                            id: info.rtxSsrc,
                            value: CNAME
                        });

                        mediaObject.ssrcs.push({
                            attribute: 'msid',
                            id: info.rtxSsrc,
                            value: `${streamId} ${track.id}`
                        });

                        mediaObject.ssrcs.push({
                            attribute: 'mslabel',
                            id: info.rtxSsrc,
                            value: streamId
                        });

                        mediaObject.ssrcs.push({
                            attribute: 'label',
                            id: info.rtxSsrc,
                            value: track.id
                        });

                        mediaObject.ssrcGroups.push({
                            semantics: 'FID',
                            ssrcs: `${info.ssrc} ${info.rtxSsrc}`
                        });
                    }
                }

                // RTP header extensions.
                mediaObject.ext = [];

                for (const extension of localCapabilities.headerExtensions) {
                    if (extension.kind && extension.kind !== kind) {
                        continue; // eslint-disable-line no-continue
                    }

                    mediaObject.ext.push({
                        value: extension.preferredId,
                        uri: extension.uri
                    });
                }

                // a=rtcp-mux attribute.
                mediaObject.rtcpMux = 'rtcp-mux';

                // a=rtcp-rsize.
                mediaObject.rtcpRsize = 'rtcp-rsize';
            }

            // Add the media section.
            sdpObject.media.push(mediaObject);
        }
    }

    /**
     * Promise based implementation for createOffer().
     * @returns {Promise}
     * @private
     */
    _createOffer(options) { // eslint-disable-line no-unused-vars
        if (this._closed) {
            return Promise.reject(
                new InvalidStateError('RTCPeerConnection closed'));
        }

        if (this.signalingState !== RTCSignalingState.stable) {
            return Promise.reject(new InvalidStateError(
                `invalid signalingState "${this.signalingState}"`));
        }

        // NOTE: P2P mode not yet supported, so createOffer() should never be
        // called.
        return Promise.reject(new Error('createoOffer() not yet supported'));
    }

    /**
     * Emit 'addstream' event.
     * @private
     */
    _emitAddStream(stream) {
        if (this._closed) {
            return;
        }

        logger.debug('emitting "addstream"');

        const event = new yaeti.Event('addstream');

        event.stream = stream;
        this.dispatchEvent(event);
    }

    /**
     * May emit buffered ICE candidates.
     * @private
     */
    _emitBufferedIceCandidates() {
        if (this._closed) {
            return;
        }

        for (const sdpCandidate of this._bufferedIceCandidates) {
            if (!sdpCandidate) {
                continue; // eslint-disable-line no-continue
            }

            // Now we have set the MID values of the SDP O/A, so let's fill the
            // sdpMIndex of the candidate.
            sdpCandidate.sdpMIndex = this._mids.keys().next().value;

            logger.debug(
                'emitting buffered "icecandidate", candidate:', sdpCandidate);

            const event = new yaeti.Event('icecandidate');

            event.candidate = sdpCandidate;
            this.dispatchEvent(event);
        }

        this._bufferedIceCandidates = [];
    }

    /**
     * May emit 'connectionstatechange' event.
     * @private
     */
    _emitConnectionStateChange() {
        if (this._closed && this.connectionState !== 'closed') {
            return;
        }

        logger.debug(
            'emitting "connectionstatechange", connectionState:',
            this.connectionState);

        const event = new yaeti.Event('connectionstatechange');

        this.dispatchEvent(event);
    }

    /**
     * May emit 'icecandidate' event.
     * @private
     */
    _emitIceCandidate(candidate) {
        if (this._closed) {
            return;
        }

        let sdpCandidate = null;

        if (candidate) {
            // NOTE: We assume BUNDLE so let's just emit candidates for the
            // first m= section.
            const sdpMIndex = this._mids.keys().next().value;
            const sdpMLineIndex = 0;
            let sdpAttribute
                = `candidate:${candidate.foundation} 1 ${candidate.protocol}`
                + ` ${candidate.priority} ${candidate.ip} ${candidate.port}`
                + ` typ ${candidate.type}`;

            if (candidate.relatedAddress) {
                sdpAttribute += ` raddr ${candidate.relatedAddress}`;
            }
            if (candidate.relatedPort) {
                sdpAttribute += ` rport ${candidate.relatedPort}`;
            }
            if (candidate.protocol === 'tcp') {
                sdpAttribute += ` tcptype ${candidate.tcpType}`;
            }

            sdpCandidate = {
                candidate: sdpAttribute,
                component: 1, // rtcp-mux assumed, so always 1 (RTP).
                foundation: candidate.foundation,
                ip: candidate.ip,
                port: candidate.port,
                priority: candidate.priority,
                protocol: candidate.protocol,
                type: candidate.type,
                sdpMIndex,
                sdpMLineIndex
            };

            if (candidate.protocol === 'tcp') {
                sdpCandidate.tcptype = candidate.tcpType;
            }
            if (candidate.relatedAddress) {
                sdpCandidate.relatedAddress = candidate.relatedAddress;
            }
            if (candidate.relatedPort) {
                sdpCandidate.relatedPort = candidate.relatedPort;
            }
        }

        // If we don't have yet a local description, buffer the candidate.
        if (this._localDescription) {
            logger.debug(
                'emitting "icecandidate", candidate:', sdpCandidate);

            const event = new yaeti.Event('icecandidate');

            event.candidate = sdpCandidate;
            this.dispatchEvent(event);
        } else {
            logger.debug(
                'buffering gathered ICE candidate:', sdpCandidate);

            this._bufferedIceCandidates.push(sdpCandidate);
        }
    }

    /**
     * May emit 'iceconnectionstatechange' event.
     * @private
     */
    _emitIceConnectionStateChange() {
        if (this._closed && this.iceConnectionState !== 'closed') {
            return;
        }

        logger.debug(
            'emitting "iceconnectionstatechange", iceConnectionState:',
            this.iceConnectionState);

        const event = new yaeti.Event('iceconnectionstatechange');

        this.dispatchEvent(event);
    }

    /**
     * May emit 'negotiationneeded' event.
     * @private
     */
    _emitNegotiationNeeded() {
        // Ignore if signalingState is not 'stable'.
        if (this.signalingState !== RTCSignalingState.stable) {
            return;
        }

        logger.debug('emitting "negotiationneeded"');

        const event = new yaeti.Event('negotiationneeded');

        this.dispatchEvent(event);
    }

    /**
     * Emit 'removestream' event.
     * @private
     */
    _emitRemoveStream(stream) {
        if (this._closed) {
            return;
        }

        logger.debug('emitting "removestream"');

        const event = new yaeti.Event('removestream');

        event.stream = stream;
        this.dispatchEvent(event);
    }

    /**
     * Get RTP parameters for a RTCRtpReceiver.
     * @private
     * @return {RTCRtpParameters}
     */
    _getParametersForRtpReceiver(kind, data) {
        const ssrc = data.ssrc;
        const rtxSsrc = data.rtxSsrc;
        const cname = data.cname;
        const localCapabilities = this._localCapabilities;
        const parameters = {
            codecs: [],
            degradationPreference: 'balanced',
            encodings: [],
            headerExtensions: [],
            muxId: '',
            rtcp: {
                cname,
                compound: true, // NOTE: Implemented in Edge.
                mux: true,
                reducedSize: true // NOTE: Not yet implemented in Edge.
            }
        };

        const codecs = [];
        let codecPayloadType;

        for (const codecCapability of localCapabilities.codecs) {
            if (codecCapability.kind !== kind
                || codecCapability.name === 'rtx') {
                continue; // eslint-disable-line no-continue
            }

            codecPayloadType = codecCapability.preferredPayloadType;
            codecs.push({
                clockRate: codecCapability.clockRate,
                maxptime: codecCapability.maxptime,
                mimeType: codecCapability.mimeType,
                name: codecCapability.name,
                numChannels: codecCapability.numChannels,
                parameters: codecCapability.parameters,
                payloadType: codecCapability.preferredPayloadType,
                ptime: codecCapability.ptime,
                rtcpFeedback: codecCapability.rtcpFeedback
            });

            break;
        }

        if (rtxSsrc) {
            for (const codecCapability of localCapabilities.codecs) {
                if (codecCapability.kind !== kind
                    || codecCapability.name !== 'rtx') {
                    continue; // eslint-disable-line no-continue
                }

                codecs.push({
                    clockRate: codecCapability.clockRate,
                    mimeType: codecCapability.mimeType,
                    name: 'rtx',
                    parameters: codecCapability.parameters,
                    payloadType: codecCapability.preferredPayloadType,
                    rtcpFeedback: codecCapability.rtcpFeedback
                });

                break;
            }
        }

        parameters.codecs = codecs;

        const encoding = {
            active: true,
            codecPayloadType,
            ssrc
        };

        if (rtxSsrc) {
            encoding.rtx = {
                ssrc: rtxSsrc
            };
        }

        parameters.encodings.push(encoding);

        for (const extension of localCapabilities.headerExtensions) {
            if (extension.kind !== kind) {
                continue; // eslint-disable-line no-continue
            }

            parameters.headerExtensions.push({
                encrypt: extension.preferredEncrypt,
                id: extension.preferredId,
                uri: extension.uri
            });
        }

        return parameters;
    }

    /**
     * Get RTP parameters for a RTCRtpSender.
     * @private
     * @return {RTCRtpParameters}
     */
    _getParametersForRtpSender(kind, data) {
        const ssrc = data.ssrc;
        const rtxSsrc = data.rtxSsrc;
        const cname = CNAME;
        const localCapabilities = this._localCapabilities;
        const parameters = {
            codecs: [],
            degradationPreference: 'balanced',
            encodings: [],
            headerExtensions: [],
            muxId: '',
            rtcp: {
                cname,
                compound: true, // NOTE: Implemented in Edge.
                mux: true,
                reducedSize: true // NOTE: Not yet implemented in Edge.
            }
        };

        const codecs = [];
        let codecPayloadType;

        for (const codecCapability of localCapabilities.codecs) {
            if (codecCapability.kind !== kind
                || codecCapability.name === 'rtx') {
                continue; // eslint-disable-line no-continue
            }

            codecPayloadType = codecCapability.preferredPayloadType;
            codecs.push({
                clockRate: codecCapability.clockRate,
                maxptime: codecCapability.maxptime,
                mimeType: codecCapability.mimeType,
                name: codecCapability.name,
                numChannels: codecCapability.numChannels,
                parameters: codecCapability.parameters,
                payloadType: codecCapability.preferredPayloadType,
                ptime: codecCapability.ptime,
                rtcpFeedback: codecCapability.rtcpFeedback
            });

            break;
        }

        if (rtxSsrc) {
            for (const codecCapability of localCapabilities.codecs) {
                if (codecCapability.kind !== kind
                    || codecCapability.name !== 'rtx') {
                    continue; // eslint-disable-line no-continue
                }

                codecs.push({
                    clockRate: codecCapability.clockRate,
                    mimeType: codecCapability.mimeType,
                    name: 'rtx',
                    parameters: codecCapability.parameters,
                    payloadType: codecCapability.preferredPayloadType,
                    rtcpFeedback: codecCapability.rtcpFeedback
                });

                break;
            }
        }

        parameters.codecs = codecs;

        const encoding = {
            active: true,
            codecPayloadType,
            ssrc
        };

        if (rtxSsrc) {
            encoding.rtx = {
                ssrc: rtxSsrc
            };
        }

        parameters.encodings.push(encoding);

        for (const extension of localCapabilities.headerExtensions) {
            if (extension.kind !== kind) {
                continue; // eslint-disable-line no-continue
            }

            parameters.headerExtensions.push({
                encrypt: extension.preferredEncrypt,
                id: extension.preferredId,
                uri: extension.uri
            });
        }

        return parameters;
    }

    /**
     * Promise based implementation for getStats().
     * @return {Promise} RTCStats dictionary.
     * @private
     */
    _getStats(selector) { // eslint-disable-line no-unused-vars
        if (this._closed) {
            return Promise.reject(
                new InvalidStateError('RTCPeerConnection closed'));
        }

        const iceGatherer = this._iceGatherer;
        const iceTransport = this._iceTransport;
        const rtpSenders = [];
        const rtpReceivers = [];
        const promises = [];

        // Get RtpSenders.
        for (const info of this._localTrackInfos.values()) {
            const { rtpSender, sending } = info;

            if (sending) {
                rtpSenders.push(rtpSender);
            }
        }

        // Get RtpReceivers.
        for (const info of this._remoteTrackInfos.values()) {
            const { rtpReceiver } = info;

            rtpReceivers.push(rtpReceiver);
        }

        // Collect all the stats.

        if (iceGatherer) {
            promises.push(
                iceGatherer.getStats()
                    .catch(() => null));
        }

        if (iceTransport) {
            promises.push(
                iceTransport.getStats()
                    .catch(() => null));

            // NOTE: Proprietary stuff in Edge.
            if (typeof iceTransport.msGetStats === 'function') {
                promises.push(
                    iceTransport.msGetStats()
                        .catch(() => null));
            }
        }

        for (const rtpSender of rtpSenders) {
            const isAudio = rtpSender.track.kind === 'audio';

            promises.push(rtpSender.getStats()
                .then(data => {
                    // Remove audioLevel from type="track" stats if this is
                    // not an audio sender.
                    if (!isAudio) {
                        for (const key of Object.keys(data)) {
                            const stat = data[key];

                            if (stat.type === 'track') {
                                delete stat.audioLevel;
                            }
                        }
                    }

                    return data;
                })
                .catch(() => null));
        }

        for (const rtpReceiver of rtpReceivers) {
            const isAudio = rtpReceiver.track.kind === 'audio';

            promises.push(rtpReceiver.getStats()
                .then(data => {
                    // Remove audioLevel from type="track" stats if this is
                    // not an audio receiver.
                    if (!isAudio) {
                        for (const key of Object.keys(data)) {
                            const stat = data[key];

                            if (stat.type === 'track') {
                                delete stat.audioLevel;
                            }
                        }
                    }

                    return data;
                })
                .catch(() => null));
        }

        return Promise.all(promises)
            .then(datas => {
                const stats = {};

                for (const data of datas) {
                    if (!data) {
                        continue; // eslint-disable-line no-continue
                    }

                    for (const key of Object.keys(data)) {
                        stats[key] = data[key];
                    }
                }

                return stats;
            });
    }

    /**
     * Handles the local initial answer.
     * @return {Promise}
     * @private
     */
    _handleLocalInitialAnswer(desc) {
        logger.debug('_handleLocalInitialAnswer(), desc:', desc);

        const sdpObject = desc.sdpObject;

        // Update local capabilities as decided by the app.
        this._localCapabilities = utils.extractCapabilities(sdpObject);

        logger.debug('local capabilities:', this._localCapabilities);

        // NOTE: We assume that the answer given by the app does not change
        // SSRC or PT values. If so, things won't work as expected.
    }

    /**
     * Handles a local re-answer.
     * @return {Promise}
     * @private
     */
    _handleLocalReAnswer(desc) {
        logger.debug('_handleLocalReAnswer(), desc:', desc);

        const sdpObject = desc.sdpObject;

        // Update local capabilities as decided by the app.
        this._localCapabilities = utils.extractCapabilities(sdpObject);

        logger.debug('local capabilities:', this._localCapabilities);

        // NOTE: We assume that the answer given by the app does not change
        // SSRC or PT values. If so, things won't work as expected.
    }

    /**
     * Handles the remote initial offer.
     * @return {Promise}
     * @private
     */
    _handleRemoteInitialOffer(desc) {
        logger.debug('_handleRemoteInitialOffer(), desc:', desc);

        const sdpObject = desc.sdpObject;

        // Set MID values.
        this._mids = utils.extractMids(sdpObject);

        // Get remote RTP capabilities.
        const remoteCapabilities = utils.extractCapabilities(sdpObject);

        logger.debug('remote capabilities:', remoteCapabilities);

        // Get local RTP capabilities (filter them with remote capabilities).
        this._localCapabilities
            = utils.getLocalCapabilities(remoteCapabilities);

        // Start ICE and DTLS.
        this._startIceAndDtls(desc);
    }

    /**
     * Handles a remote re-offer.
     * @return {Promise}
     * @private
     */
    _handleRemoteReOffer(desc) {
        logger.debug('_handleRemoteReOffer(), desc:', desc);

        const sdpObject = desc.sdpObject;

        // Update MID values (just in case).
        this._mids = utils.extractMids(sdpObject);

        // Get remote RTP capabilities (filter them with remote capabilities).
        const remoteCapabilities = utils.extractCapabilities(sdpObject);

        logger.debug('remote capabilities:', remoteCapabilities);

        // Update local RTP capabilities (just in case).
        this._localCapabilities
            = utils.getLocalCapabilities(remoteCapabilities);
    }

    /**
     * Start receiving remote media.
     */
    _receiveMedia() {
        logger.debug('_receiveMedia()');

        const currentRemoteSsrcs = new Set(this._remoteTrackInfos.keys());
        const newRemoteTrackInfos
            = utils.extractTrackInfos(this._remoteDescription.sdpObject);

        // Map of new remote MediaStream indexed by MediaStream.jitsiRemoteId.
        const addedRemoteStreams = new Map();

        // Map of remote MediaStream indexed by added MediaStreamTrack.
        // NOTE: Just filled for already existing streams.
        const addedRemoteTracks = new Map();

        // Map of remote MediaStream indexed by removed MediaStreamTrack.
        const removedRemoteTracks = new Map();

        logger.debug(
            '_receiveMedia() remote track infos:', newRemoteTrackInfos);

        // Check new tracks.
        for (const [ ssrc, info ] of newRemoteTrackInfos) {
            // If already handled, ignore it.
            if (currentRemoteSsrcs.has(ssrc)) {
                continue; // eslint-disable-line no-continue
            }

            logger.debug(`_receiveMedia() new remote track, ssrc:${ssrc}`);

            // Otherwise append to the map.
            this._remoteTrackInfos.set(ssrc, info);

            const kind = info.kind;
            const rtxSsrc = info.rtxSsrc;
            const streamRemoteId = info.streamId;
            const trackRemoteId = info.trackId;
            const cname = info.cname;
            const isNewStream = !this._remoteStreams.has(streamRemoteId);
            let stream;

            if (isNewStream) {
                logger.debug(
                    `_receiveMedia() new remote stream, id:${streamRemoteId}`);

                // Create a new MediaStream.
                stream = new MediaStream();

                // Set custom property with the remote id.
                stream.jitsiRemoteId = streamRemoteId;

                addedRemoteStreams.set(streamRemoteId, stream);
                this._remoteStreams.set(streamRemoteId, stream);
            } else {
                stream = this._remoteStreams.get(streamRemoteId);
            }

            const rtpReceiver = new RTCRtpReceiver(this._dtlsTransport, kind);
            const parameters = this._getParametersForRtpReceiver(kind, {
                ssrc,
                rtxSsrc,
                cname
            });

            // Store the track into the info object.
            // NOTE: This should not be needed, but Edge has a bug:
            //   https://developer.microsoft.com/en-us/microsoft-edge/platform/
            //   issues/12399497/
            info.track = rtpReceiver.track;

            // Set error handler.
            rtpReceiver.onerror = ev => {
                logger.error('rtpReceiver "error" event, event:');
                logger.error(ev);
            };

            // Fill the info with the stream and rtpReceiver.
            info.stream = stream;
            info.rtpReceiver = rtpReceiver;

            logger.debug(
                'calling rtpReceiver.receive(), parameters:', parameters);

            // Start receiving media.
            try {
                rtpReceiver.receive(parameters);

                // Get the associated MediaStreamTrack.
                const track = info.track;

                // Set custom property with the remote id.
                track.jitsiRemoteId = trackRemoteId;

                // Add the track to the stream.
                stream.addTrack(track);

                if (!addedRemoteStreams.has(streamRemoteId)) {
                    addedRemoteTracks.set(track, stream);
                }
            } catch (error) {
                logger.error(`rtpReceiver.receive() failed:${error.message}`);
                logger.error(error);
            }
        }

        // Check track removal.
        for (const ssrc of currentRemoteSsrcs) {
            if (newRemoteTrackInfos.has(ssrc)) {
                continue; // eslint-disable-line no-continue
            }

            logger.debug(`_receiveMedia() remote track removed, ssrc:${ssrc}`);

            const info = this._remoteTrackInfos.get(ssrc);
            const stream = info.stream;
            const track = info.track;
            const rtpReceiver = info.rtpReceiver;

            try {
                rtpReceiver.stop();
            } catch (error) {
                logger.warn(`rtpReceiver.stop() failed:${error}`);
            }

            removedRemoteTracks.set(track, stream);
            stream.removeTrack(track);
            this._remoteTrackInfos.delete(ssrc);
        }

        // Emit MediaStream 'addtrack' for new tracks in already existing
        // streams.
        for (const [ track, stream ] of addedRemoteTracks) {
            const event = new Event('addtrack');

            event.track = track;
            stream.dispatchEvent(event);
        }

        // Emit MediaStream 'removetrack' for removed tracks.
        for (const [ track, stream ] of removedRemoteTracks) {
            const event = new Event('removetrack');

            event.track = track;
            stream.dispatchEvent(event);
        }

        // Emit RTCPeerConnection 'addstream' for new remote streams.
        for (const stream of addedRemoteStreams.values()) {
            // Check whether at least a track was added, otherwise ignore it.
            if (stream.getTracks().length === 0) {
                logger.warn(
                    'ignoring new stream for which no track could be added');

                addedRemoteStreams.delete(stream.jitsiRemoteId);
                this._remoteStreams.delete(stream.jitsiRemoteId);
            } else {
                this._emitAddStream(stream);
            }
        }

        // Emit RTCPeerConnection 'removestream' for removed remote streams.
        for (const [ streamRemoteId, stream ] of this._remoteStreams) {
            if (stream.getTracks().length > 0) {
                continue; // eslint-disable-line no-continue
            }

            this._remoteStreams.delete(streamRemoteId);
            this._emitRemoveStream(stream);
        }
    }

    /**
     * Implementation for removeStream().
     * @private
     */
    _removeStream(stream) {
        if (this._closed) {
            throw new InvalidStateError('RTCPeerConnection closed');
        }

        // Stop and remove the RTCRtpSender associated to each track.
        for (const track of stream.getTracks()) {
            // Ignore if track not present.
            if (!this._localTrackInfos.has(track.id)) {
                continue; // eslint-disable-line no-continue
            }

            const rtpSender = this._localTrackInfos.get(track.id).rtpSender;

            try {
                rtpSender.stop();
            } catch (error) {
                logger.warn(`rtpSender.stop() failed:${error}`);
            }

            // Remove from the map.
            this._localTrackInfos.delete(track.id);
        }

        // It may need to renegotiate.
        this._emitNegotiationNeeded();
    }

    /**
     * Start sending our media to the remote.
     */
    _sendMedia() {
        logger.debug('_sendMedia()');

        for (const info of this._localTrackInfos.values()) {
            // Ignore if already sending.
            if (info.sending) {
                continue; // eslint-disable-line no-continue
            }

            const rtpSender = info.rtpSender;
            const ssrc = info.ssrc;
            const rtxSsrc = info.rtxSsrc;
            const track = rtpSender.track;
            const kind = track.kind;

            const parameters = this._getParametersForRtpSender(kind, {
                ssrc,
                rtxSsrc
            });

            logger.debug(
                'calling rtpSender.send(), parameters:', parameters);

            // Start sending media.
            try {
                rtpSender.send(parameters);

                // Update sending field.
                info.sending = true;
            } catch (error) {
                logger.error(`rtpSender.send() failed:${error.message}`);
                logger.error(error);
            }
        }
    }

    /**
     * Creates the RTCDtlsTransport.
     * @private
     */
    _setDtlsTransport(iceTransport) {
        const dtlsTransport = new RTCDtlsTransport(iceTransport);

        // NOTE: Not yet implemented by Edge.
        dtlsTransport.onstatechange = () => {
            logger.debug(
                'dtlsTransport "statechange" event, '
                + `state:${dtlsTransport.state}`);

            this._emitConnectionStateChange();
        };

        // NOTE: Not standard, but implemented by Edge.
        dtlsTransport.ondtlsstatechange = () => {
            logger.debug(
                'dtlsTransport "dtlsstatechange" event, '
                + `state:${dtlsTransport.state}`);

            this._emitConnectionStateChange();
        };

        dtlsTransport.onerror = ev => {
            let message;

            if (ev.message) {
                message = ev.message;
            } else if (ev.error) {
                message = ev.error.message;
            }

            logger.error(`dtlsTransport "error" event, message:${message}`);

            // TODO: Edge does not set state to 'failed' on error. We may
            // hack it.

            this._emitConnectionStateChange();
        };

        this._dtlsTransport = dtlsTransport;
    }

    /**
     * Creates the RTCIceGatherer.
     * @private
     */
    _setIceGatherer(pcConfig) {
        const iceGatherOptions = {
            gatherPolicy: pcConfig.iceTransportPolicy || 'all',
            iceServers: pcConfig.iceServers || []
        };
        const iceGatherer = new RTCIceGatherer(iceGatherOptions);

        // NOTE: Not yet implemented by Edge.
        iceGatherer.onstatechange = () => {
            logger.debug(
                `iceGatherer "statechange" event, state:${iceGatherer.state}`);

            this._updateAndEmitIceGatheringStateChange(iceGatherer.state);
        };

        iceGatherer.onlocalcandidate = ev => {
            let candidate = ev.candidate;

            // NOTE: Not yet implemented by Edge.
            const complete = ev.complete;

            logger.debug(
                'iceGatherer "localcandidate" event, candidate:', candidate);

            // NOTE: Instead of null candidate or complete:true, current Edge
            // signals end of gathering with an empty candidate object.
            if (complete
                || !candidate
                || Object.keys(candidate).length === 0) {

                candidate = null;

                this._updateAndEmitIceGatheringStateChange(
                    RTCIceGatheringState.complete);
                this._emitIceCandidate(null);
            } else {
                this._emitIceCandidate(candidate);
            }
        };

        iceGatherer.onerror = ev => {
            const errorCode = ev.errorCode;
            const errorText = ev.errorText;

            logger.error(
                `iceGatherer "error" event, errorCode:${errorCode}, `
                + `errorText:${errorText}`);
        };

        // NOTE: Not yet implemented by Edge, which starts gathering
        // automatically.
        try {
            iceGatherer.gather();
        } catch (error) {
            logger.warn(`iceGatherer.gather() failed:${error}`);
        }

        this._iceGatherer = iceGatherer;
    }

    /**
     * Creates the RTCIceTransport.
     * @private
     */
    _setIceTransport(iceGatherer) {
        const iceTransport = new RTCIceTransport(iceGatherer);

        // NOTE: Not yet implemented by Edge.
        iceTransport.onstatechange = () => {
            logger.debug(
                'iceTransport "statechange" event, '
                + `state:${iceTransport.state}`);

            this._emitIceConnectionStateChange();
        };

        // NOTE: Not standard, but implemented by Edge.
        iceTransport.onicestatechange = () => {
            logger.debug(
                'iceTransport "icestatechange" event, '
                + `state:${iceTransport.state}`);

            if (iceTransport.state === 'completed') {
                logger.debug(
                    'nominated candidate pair:',
                    iceTransport.getNominatedCandidatePair());
            }

            this._emitIceConnectionStateChange();
        };

        iceTransport.oncandidatepairchange = ev => {
            logger.debug(
                'iceTransport "candidatepairchange" event, '
                + `pair:${ev.pair}`);
        };

        this._iceTransport = iceTransport;
    }

    /**
     * Promise based implementation for setLocalDescription().
     * @returns {Promise}
     * @private
     */
    _setLocalDescription(desc) {
        if (this._closed) {
            return Promise.reject(
                new InvalidStateError('RTCPeerConnection closed'));
        }

        let localDescription;

        try {
            localDescription = new RTCSessionDescription(desc);
        } catch (error) {
            return Promise.reject(new TypeError(
                `invalid RTCSessionDescriptionInit: ${error}`));
        }

        switch (desc.type) {
        case 'offer': {
            if (this.signalingState !== RTCSignalingState.stable) {
                return Promise.reject(new InvalidStateError(
                    `invalid signalingState "${this.signalingState}"`));
            }

            // NOTE: P2P mode not yet supported, so createOffer() should never
            // has been called, neither setLocalDescription() with an offer.
            return Promise.reject(new TypeError(
                'setLocalDescription() with type "offer" not supported'));
        }
        case 'answer': {
            if (this.signalingState !== RTCSignalingState.haveRemoteOffer) {
                return Promise.reject(new InvalidStateError(
                    `invalid signalingState "${this.signalingState}"`));
            }

            const isLocalInitialAnswer = Boolean(!this._localDescription);

            return Promise.resolve()
                .then(() => {
                    // Different handling for initial answer and re-answer.
                    if (isLocalInitialAnswer) {
                        return this._handleLocalInitialAnswer(localDescription);
                    } else { // eslint-disable-line no-else-return
                        return this._handleLocalReAnswer(localDescription);
                    }
                })
                .then(() => {
                    logger.debug('setLocalDescription() succeed');

                    // Update local description.
                    this._localDescription = localDescription;

                    // Update signaling state.
                    this._updateAndEmitSignalingStateChange(
                        RTCSignalingState.stable);

                    // If initial answer, emit buffered ICE candidates.
                    if (isLocalInitialAnswer) {
                        this._emitBufferedIceCandidates();
                    }

                    // Send our RTP.
                    this._sendMedia();

                    // Receive remote RTP.
                    this._receiveMedia();
                })
                .catch(error => {
                    logger.error(
                        `setLocalDescription() failed: ${error.message}`);
                    logger.error(error);

                    throw error;
                });
        }
        default:
            return Promise.reject(new TypeError(
                `unsupported description.type "${desc.type}"`));
        }
    }

    /**
     * Promise based implementation for setRemoteDescription().
     * @returns {Promise}
     * @private
     */
    _setRemoteDescription(desc) {
        if (this._closed) {
            return Promise.reject(
                new InvalidStateError('RTCPeerConnection closed'));
        }

        let remoteDescription;

        try {
            remoteDescription = new RTCSessionDescription(desc);
        } catch (error) {
            return Promise.reject(new TypeError(
                `invalid RTCSessionDescriptionInit: ${error}`));
        }

        switch (desc.type) {
        case 'offer': {
            if (this.signalingState !== RTCSignalingState.stable) {
                return Promise.reject(new InvalidStateError(
                    `invalid signalingState "${this.signalingState}"`));
            }

            const isRemoteInitialOffer = Boolean(!this._remoteDescription);

            return Promise.resolve()
                .then(() => {
                    // Different handling for initial answer and re-answer.
                    if (isRemoteInitialOffer) {
                        return this._handleRemoteInitialOffer(
                            remoteDescription);
                    } else { // eslint-disable-line no-else-return
                        return this._handleRemoteReOffer(remoteDescription);
                    }
                })
                .then(() => {
                    logger.debug('setRemoteDescription() succeed');

                    // Update remote description.
                    this._remoteDescription = remoteDescription;

                    // Update signaling state.
                    this._updateAndEmitSignalingStateChange(
                        RTCSignalingState.haveRemoteOffer);
                })
                .catch(error => {
                    logger.error(`setRemoteDescription() failed: ${error}`);

                    throw error;
                });
        }
        case 'answer': {
            if (this.signalingState !== RTCSignalingState.haveLocalOffer) {
                return Promise.reject(new InvalidStateError(
                    `invalid signalingState "${this.signalingState}"`));
            }

            // NOTE: P2P mode not yet supported, so createOffer() should never
            // has been called, neither setRemoteDescription() with an answer.
            return Promise.reject(new TypeError(
                'setRemoteDescription() with type "answer" not supported'));
        }
        default:
            return Promise.reject(new TypeError(
                `unsupported description.type "${desc.type}"`));
        }
    }

    /**
     * Start ICE and DTLS connection procedures.
     * @param {RTCSessionDescription} desc - Remote description.
     */
    _startIceAndDtls(desc) {
        const sdpObject = desc.sdpObject;
        const remoteIceParameters
            = utils.extractIceParameters(sdpObject);
        const remoteIceCandidates
            = utils.extractIceCandidates(sdpObject);
        const remoteDtlsParameters
            = utils.extractDtlsParameters(sdpObject);

        // Start the RTCIceTransport.
        switch (desc.type) {
        case 'offer':
            this._iceTransport.start(
                this._iceGatherer, remoteIceParameters, 'controlled');
            break;
        case 'answer':
            this._iceTransport.start(
                this._iceGatherer, remoteIceParameters, 'controlling');
            break;
        }

        // Add remote ICE candidates.
        // NOTE: Remove candidates that Edge doesn't like.
        for (const candidate of remoteIceCandidates) {
            if (candidate.port === 0 || candidate.port === 9) {
                continue; // eslint-disable-line no-continue
            }

            this._iceTransport.addRemoteCandidate(candidate);
        }

        // Also signal a 'complete' candidate as per spec.
        // NOTE: It should be {complete: true} but Edge prefers {}.
        // NOTE: We know that addCandidate() is never used so we need to signal
        // end of candidates (otherwise the RTCIceTransport never enters the
        // 'completed' state).
        this._iceTransport.addRemoteCandidate({});

        // Set desired remote DTLS role (as we receive the offer).
        switch (desc.type) {
        case 'offer':
            remoteDtlsParameters.role = 'server';
            break;
        case 'answer':
            remoteDtlsParameters.role = 'client';
            break;
        }

        // Start RTCDtlsTransport.
        this._dtlsTransport.start(remoteDtlsParameters);
    }

    /**
     * May update iceGatheringState and emit 'icegatheringstatechange' event.
     * @private
     */
    _updateAndEmitIceGatheringStateChange(state) {
        if (this._closed || state === this.iceGatheringState) {
            return;
        }

        this._iceGatheringState = state;

        logger.debug(
            'emitting "icegatheringstatechange", iceGatheringState:',
            this.iceGatheringState);

        const event = new yaeti.Event('icegatheringstatechange');

        this.dispatchEvent(event);
    }

    /**
     * May update signalingState and emit 'signalingstatechange' event.
     * @private
     */
    _updateAndEmitSignalingStateChange(state) {
        if (state === this.signalingState) {
            return;
        }

        this._signalingState = state;

        logger.debug(
            'emitting "signalingstatechange", signalingState:',
            this.signalingState);

        const event = new yaeti.Event('signalingstatechange');

        this.dispatchEvent(event);
    }
}
