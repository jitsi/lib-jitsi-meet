/* global __filename, RTCIceGatherer, RTCIceTransport */

import { getLogger } from 'jitsi-meet-logger';
import yaeti from 'yaeti';

import { InvalidStateError } from './errors';

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

/**
 * RTCPeerConnection shim for ORTC based endpoints (such as Edge).
 *
 * The interface is based on the W3C specification of 2015, which matches
 * the implementation of Chrome nowadays:
 *
 *   https://www.w3.org/TR/2015/WD-webrtc-20150210/
 */
export default class ortcRTCPeerConnection extends yaeti.EventTarget {
    /**
     */
    constructor(pcConfig) {
        super();

        logger.debug('constructor() pcConfig:', pcConfig);

        // Closed flag.
        // @type {boolean}
        this._closed = false;

        // Create a RTCIceGatherer.
        // @type {RTCIceGatherer}
        this._iceGatherer = this._createIceGatherer(pcConfig);

        // RTCPeerConnection iceGatheringState.
        // NOTE: This should not be needed, but Edge does not implement
        // iceGatherer.state.
        // @type {RTCIceGatheringState}
        this._iceGatheringState = RTCIceGatheringState.new;

        // Create a RTCIceTransport.
        // @type {RTCIceTransport}
        this._iceTransport = this._createIceTransport(this._iceGatherer);

        // Local RTCSessionDescription.
        // @type {RTCSessionDescription}
        this._localDescription = null;

        // Set of local MediaStreams.
        // @type {Set<MediaStream>}
        this._localStreams = new Set();

        // Remote RTCSessionDescription.
        // @type {RTCSessionDescription}
        this._remoteDescription = null;

        // Set of remote MediaStreams.
        // @type {Set<MediaStream>}
        this._remoteStreams = new Set();

        // RTCPeerConnection signalingState.
        // @type {RTCSignalingState}
        this._signalingState = RTCSignalingState.stable;
    }

    /**
     * Gets the current signaling state.
     * @return {RTCSignalingState}
     */
    get signalingState() {
        return this._signalingState;
    }

    /**
     * Gets the current ICE gathering state.
     * @return {RTCIceGatheringState}
     */
    get iceGatheringState() {
        return this._iceGatheringState;
    }

    /**
     * Gets the current ICE connection state.
     * @return {RTCIceConnectionState}
     */
    get iceConnectionState() {
        return this._iceTransport.state;
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
     * Closes the RTCPeerConnection.
     */
    close() {
        if (this._closed) {
            return;
        }

        this._closed = true;

        logger.debug('close()');

        this._updateAndEmitSignalingStateChange(RTCSignalingState.closed);

        // Close iceGatherer.
        // NOTE: Not yet implemented by Edge.
        try {
            this._iceGatherer.close();
        } catch (error) {
            logger.warn(`iceGatherer.close() failed:${error}`);
        }

        // Close iceTransport.
        try {
            this._iceTransport.stop();
        } catch (error) {
            logger.warn(`iceTransport.stop() failed:${error}`);
        }

        // Clear local/remote streams.
        this._localStreams.clear();
        this._remoteStreams.clear();

        // TODO: Close and emit more stuff.
    }

    /**
     * Creates a local offer. Implements both the old callbacks based signature
     * and the new Promise based style.
     *
     * Arguments in Promise mode:
     * @param {RTCOfferOptions} options
     *
     * Arguments in callbacks mode:
     * @param {function(desc)} callback
     * @param {function(error)} errback
     * @param {MediaConstraints} constraints
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
     * Creates a local answer. Implements both the old callbacks based signature
     * and the new Promise based style.
     *
     * Arguments in Promise mode:
     * @param {RTCOfferOptions} options
     *
     * Arguments in callbacks mode:
     * @param {function(desc)} callback
     * @param {function(error)} errback
     * @param {MediaConstraints} constraints
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
     * Removes a local MediaStream.
     * @param {MediaStream} stream.
     * NOTE: Deprecated API.
     */
    removeStream(stream) {
        logger.debug('removeStream()');

        this._removeStream(stream);
    }

    /**
     * Creates a RTCDataChannel.
     * TBD
     */
    createDataChannel() {
        logger.debug('createDataChannel()');
    }

    /**
     * Gets a sequence of local MediaStreams.
     */
    getLocalStreams() {
        return Array.from(this._localStreams);
    }

    /**
     * Gets a sequence of remote MediaStreams.
     */
    getRemoteStreams() {
        return Array.from(this._remoteStreams);
    }

    /**
     * TBD
     */
    getStats() {
        // TBD
    }

    /**
     * Creates and returns a RTCIceGatherer.
     * @return {RTCIceGatherer}
     * @private
     */
    _createIceGatherer(pcConfig) {
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

        return iceGatherer;
    }

    /**
     * Creates and returns a RTCIceTransport.
     * @return {RTCIceTransport}
     * @private
     */
    _createIceTransport(iceGatherer) {
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

            this._emitIceConnectionStateChange();
        };

        // TODO: More stuff to be done.

        return iceTransport;
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

        // TODO: More stuff to be done.
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

        // TODO: More stuff to be done.
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

        switch (desc.type) {
        case 'offer':
            if (this.signalingState !== RTCSignalingState.stable) {
                return Promise.reject(new InvalidStateError(
                    `invalid signalingState "${this.signalingState}"`));
            }

            break;

        case 'answer':
            if (this.signalingState !== RTCSignalingState.haveRemoteOffer) {
                return Promise.reject(new InvalidStateError(
                    `invalid signalingState "${this.signalingState}"`));
            }

            break;

        default:
            throw new TypeError(`unsupported description.type "${desc.type}"`);
        }

        // TODO: More stuff to be done.
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

        switch (desc.type) {
        case 'offer':
            if (this.signalingState !== RTCSignalingState.stable) {
                return Promise.reject(new InvalidStateError(
                    `invalid signalingState "${this.signalingState}"`));
            }

            break;

        case 'answer':
            if (this.signalingState !== RTCSignalingState.haveLocalOffer) {
                return Promise.reject(new InvalidStateError(
                    `invalid signalingState "${this.signalingState}"`));
            }

            break;

        default:
            throw new TypeError(`unsupported description.type "${desc.type}"`);
        }

        // TODO: More stuff to be done.
    }

    /**
     * Implementation for addStream().
     * @private
     */
    _addStream(stream) {
        if (this._closed) {
            throw new InvalidStateError('RTCPeerConnection closed');
        }

        if (this._localStreams.has(stream)) {
            return;
        }

        this._localStreams.add(stream);

        // It may need to renegotiate.
        this._emitNegotiationNeeded();
    }

    /**
     * Implementation for removeStream().
     * @private
     */
    _removeStream(stream) {
        if (this._closed) {
            throw new InvalidStateError('RTCPeerConnection closed');
        }

        if (!this._localStreams.has(stream)) {
            return;
        }

        this._localStreams.delete(stream);

        // It may need to renegotiate.
        this._emitNegotiationNeeded();
    }

    /**
     * May update signalingState and emit 'signalingstatechange' event.
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

    /**
     * May emit 'negotiationneeded' event.
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
     * May update iceGatheringState and emit 'icegatheringstatechange' event.
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
     * May emit 'iceconnectionstatechange' event.
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
     * May emit 'icecandidate' event.
     */
    _emitIceCandidate(candidate) {
        if (this._closed) {
            return;
        }

        const event = new yaeti.Event('icecandidate');

        logger.debug(
            'emitting "icecandidate", candidate:', candidate);

        event.candidate = candidate;
        this.dispatchEvent(event);
    }
}
