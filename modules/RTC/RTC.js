/* global __filename */

import { getLogger } from 'jitsi-meet-logger';

import BridgeChannel from './BridgeChannel';
import GlobalOnErrorHandler from '../util/GlobalOnErrorHandler';
import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import JitsiLocalTrack from './JitsiLocalTrack';
import JitsiTrackError from '../../JitsiTrackError';
import * as JitsiTrackErrors from '../../JitsiTrackErrors';
import Listenable from '../util/Listenable';
import { safeCounterIncrement } from '../util/MathUtil';
import * as MediaType from '../../service/RTC/MediaType';
import browser from '../browser';
import RTCEvents from '../../service/RTC/RTCEvents';
import RTCUtils from './RTCUtils';
import Statistics from '../statistics/statistics';
import TraceablePeerConnection from './TraceablePeerConnection';
import VideoType from '../../service/RTC/VideoType';

const logger = getLogger(__filename);

/**
 * The counter used to generated id numbers assigned to peer connections
 * @type {number}
 */
let peerConnectionIdCounter = 0;

/**
 * The counter used to generate id number for the local
 * <code>MediaStreamTrack</code>s.
 * @type {number}
 */
let rtcTrackIdCounter = 0;

/**
 *
 * @param tracksInfo
 * @param options
 */
function createLocalTracks(tracksInfo, options) {
    const newTracks = [];
    let deviceId = null;

    tracksInfo.forEach(trackInfo => {
        if (trackInfo.mediaType === MediaType.AUDIO) {
            deviceId = options.micDeviceId;
        } else if (trackInfo.videoType === VideoType.CAMERA) {
            deviceId = options.cameraDeviceId;
        }
        rtcTrackIdCounter = safeCounterIncrement(rtcTrackIdCounter);
        const localTrack = new JitsiLocalTrack({
            ...trackInfo,
            deviceId,
            facingMode: options.facingMode,
            rtcId: rtcTrackIdCounter
        });

        newTracks.push(localTrack);
    });

    return newTracks;
}

/**
 * Creates {@code JitsiLocalTrack} instances from the passed in meta information
 * about MedieaTracks.
 *
 * @param {Object[]} mediaStreamMetaData - An array of meta information with
 * MediaTrack instances. Each can look like:
 * {{
 *     stream: MediaStream instance that holds a track with audio or video,
 *     track: MediaTrack within the MediaStream,
 *     videoType: "camera" or "desktop" or falsy,
 *     sourceId: ID of the desktopsharing source,
 *     sourceType: The desktopsharing source type
 * }}
 */
function _newCreateLocalTracks(mediaStreamMetaData = []) {
    return mediaStreamMetaData.map(metaData => {
        const {
            sourceId,
            sourceType,
            stream,
            track,
            videoType
        } = metaData;

        const { deviceId, facingMode } = track.getSettings();

        // FIXME Move rtcTrackIdCounter to a static method in JitsiLocalTrack
        // so RTC does not need to handle ID management. This move would be
        // safer to do once the old createLocalTracks is removed.
        rtcTrackIdCounter = safeCounterIncrement(rtcTrackIdCounter);

        return new JitsiLocalTrack({
            deviceId,
            facingMode,
            mediaType: track.kind,
            rtcId: rtcTrackIdCounter,
            sourceId,
            sourceType,
            stream,
            track,
            videoType: videoType || null
        });
    });
}

/**
 *
 */
export default class RTC extends Listenable {
    /**
     *
     * @param conference
     * @param options
     */
    constructor(conference, options = {}) {
        super();
        this.conference = conference;

        /**
         * A map of active <tt>TraceablePeerConnection</tt>.
         * @type {Map.<number, TraceablePeerConnection>}
         */
        this.peerConnections = new Map();

        this.localTracks = [];

        this.options = options;

        // BridgeChannel instance.
        // @private
        // @type {BridgeChannel}
        this._channel = null;

        // A flag whether we had received that the channel had opened we can
        // get this flag out of sync if for some reason channel got closed
        // from server, a desired behaviour so we can see errors when this
        // happen.
        // @private
        // @type {boolean}
        this._channelOpen = false;

        /**
         * The value specified to the last invocation of setLastN before the
         * channel completed opening. If non-null, the value will be sent
         * through a channel (once) as soon as it opens and will then be
         * discarded.
         * @private
         * @type {number}
         */
        this._lastN = -1;

        /**
         * Defines the last N endpoints list. It can be null or an array once
         * initialised with a channel last N event.
         * @type {Array<string>|null}
         * @private
         */
        this._lastNEndpoints = null;

        /**
         * The number representing the maximum video height the local client
         * should receive from the bridge.
         *
         * @type {number|undefined}
         * @private
         */
        this._maxFrameHeight = undefined;

        /**
         * The endpoint ID of currently pinned participant or <tt>null</tt> if
         * no user is pinned.
         * @type {string|null}
         * @private
         */
        this._pinnedEndpoint = null;

        /**
         * The endpoint IDs of currently selected participants.
         *
         * @type {Array}
         * @private
         */
        this._selectedEndpoints = [];

        // The last N change listener.
        this._lastNChangeListener = this._onLastNChanged.bind(this);

        // Switch audio output device on all remote audio tracks. Local audio
        // tracks handle this event by themselves.
        if (RTCUtils.isDeviceChangeAvailable('output')) {
            RTCUtils.addListener(RTCEvents.AUDIO_OUTPUT_DEVICE_CHANGED,
                deviceId => this._updateAudioOutputForAudioTracks(deviceId));

            RTCUtils.addListener(
                RTCEvents.DEVICE_LIST_CHANGED,
                () => this._updateAudioOutputForAudioTracks(
                    RTCUtils.getAudioOutputDevice()));
        }
    }

    /**
     * Exposes the private helper for converting a WebRTC MediaStream to a
     * JitsiLocalTrack.
     *
     * @param {Array<Object>} tracksInfo
     * @returns {Array<JitsiLocalTrack>}
     */
    static newCreateLocalTracks(tracksInfo) {
        return _newCreateLocalTracks(tracksInfo);
    }

    /**
     * Creates the local MediaStreams.
     * @param {object} [options] Optional parameters.
     * @param {array} options.devices The devices that will be requested.
     * @param {string} options.resolution Resolution constraints.
     * @param {string} options.cameraDeviceId
     * @param {string} options.micDeviceId
     * @returns {*} Promise object that will receive the new JitsiTracks
     */
    static obtainAudioAndVideoPermissions(options) {
        const usesNewGumFlow = browser.usesNewGumFlow();
        const obtainMediaPromise = usesNewGumFlow
            ? RTCUtils.newObtainAudioAndVideoPermissions(options)
            : RTCUtils.obtainAudioAndVideoPermissions(options);

        return obtainMediaPromise.then(
            tracksInfo => {
                const tracks = usesNewGumFlow
                    ? _newCreateLocalTracks(tracksInfo)
                    : createLocalTracks(tracksInfo, options);

                return tracks.some(track => !track._isReceivingData())
                    ? Promise.reject(
                        new JitsiTrackError(
                            JitsiTrackErrors.NO_DATA_FROM_SOURCE))
                    : tracks;
            });
    }

    /**
     * Initializes the bridge channel of this instance.
     * At least one of both, peerconnection or wsUrl parameters, must be
     * given.
     * @param {RTCPeerConnection} [peerconnection] WebRTC peer connection
     * instance.
     * @param {string} [wsUrl] WebSocket URL.
     */
    initializeBridgeChannel(peerconnection, wsUrl) {
        this._channel = new BridgeChannel(
            peerconnection, wsUrl, this.eventEmitter);

        this._channelOpenListener = () => {
            // Mark that channel as opened.
            this._channelOpen = true;

            // When the channel becomes available, tell the bridge about
            // video selections so that it can do adaptive simulcast,
            // we want the notification to trigger even if userJid
            // is undefined, or null.
            try {
                this._channel.sendPinnedEndpointMessage(
                    this._pinnedEndpoint);
                this._channel.sendSelectedEndpointsMessage(
                    this._selectedEndpoints);

                if (typeof this._maxFrameHeight !== 'undefined') {
                    this._channel.sendReceiverVideoConstraintMessage(
                        this._maxFrameHeight);
                }
            } catch (error) {
                GlobalOnErrorHandler.callErrorHandler(error);
                logger.error(
                    `Cannot send selected(${this._selectedEndpoint})`
                    + `pinned(${this._pinnedEndpoint})`
                    + `frameHeight(${this._maxFrameHeight}) endpoint message`,
                    error);
            }

            this.removeListener(RTCEvents.DATA_CHANNEL_OPEN,
                this._channelOpenListener);
            this._channelOpenListener = null;

            // If setLastN was invoked before the bridge channel completed
            // opening, apply the specified value now that the channel
            // is open. NOTE that -1 is the default value assumed by both
            // RTC module and the JVB.
            if (this._lastN !== -1) {
                this._channel.sendSetLastNMessage(this._lastN);
            }
        };

        this.addListener(RTCEvents.DATA_CHANNEL_OPEN,
            this._channelOpenListener);

        // Add Last N change listener.
        this.addListener(RTCEvents.LASTN_ENDPOINT_CHANGED,
            this._lastNChangeListener);
    }

    /**
     * Receives events when Last N had changed.
     * @param {array} lastNEndpoints The new Last N endpoints.
     * @private
     */
    _onLastNChanged(lastNEndpoints = []) {
        const oldLastNEndpoints = this._lastNEndpoints || [];
        let leavingLastNEndpoints = [];
        let enteringLastNEndpoints = [];

        this._lastNEndpoints = lastNEndpoints;

        leavingLastNEndpoints = oldLastNEndpoints.filter(
            id => !this.isInLastN(id));

        enteringLastNEndpoints = lastNEndpoints.filter(
            id => oldLastNEndpoints.indexOf(id) === -1);

        this.conference.eventEmitter.emit(
            JitsiConferenceEvents.LAST_N_ENDPOINTS_CHANGED,
            leavingLastNEndpoints,
            enteringLastNEndpoints);
    }

    /**
     * Should be called when current media session ends and after the
     * PeerConnection has been closed using PeerConnection.close() method.
     */
    onCallEnded() {
        if (this._channel) {
            // The BridgeChannel is not explicitly closed as the PeerConnection
            // is closed on call ended which triggers datachannel onclose
            // events. If using a WebSocket, the channel must be closed since
            // it is not managed by the PeerConnection.
            // The reference is cleared to disable any logic related to the
            // channel.
            if (this._channel && this._channel.mode === 'websocket') {
                this._channel.close();
            }

            this._channel = null;
            this._channelOpen = false;
        }
    }

    /**
     * Sets the maximum video size the local participant should receive from
     * remote participants. Will cache the value and send it through the channel
     * once it is created.
     *
     * @param {number} maxFrameHeightPixels the maximum frame height, in pixels,
     * this receiver is willing to receive.
     * @returns {void}
     */
    setReceiverVideoConstraint(maxFrameHeight) {
        this._maxFrameHeight = maxFrameHeight;

        if (this._channel && this._channelOpen) {
            this._channel.sendReceiverVideoConstraintMessage(maxFrameHeight);
        }
    }

    /**
     * Elects the participants with the given ids to be the selected
     * participants in order to always receive video for this participant (even
     * when last n is enabled). If there is no channel we store it and send it
     * through the channel once it is created.
     *
     * @param {Array<string>} ids - The user ids.
     * @throws NetworkError or InvalidStateError or Error if the operation
     * fails.
     * @returns {void}
     */
    selectEndpoints(ids) {
        this._selectedEndpoints = ids;

        if (this._channel && this._channelOpen) {
            this._channel.sendSelectedEndpointsMessage(ids);
        }
    }

    /**
     * Elects the participant with the given id to be the pinned participant in
     * order to always receive video for this participant (even when last n is
     * enabled).
     * @param {stirng} id The user id.
     * @throws NetworkError or InvalidStateError or Error if the operation
     * fails.
     */
    pinEndpoint(id) {
        // Cache the value if channel is missing, till we open it.
        this._pinnedEndpoint = id;
        if (this._channel && this._channelOpen) {
            this._channel.sendPinnedEndpointMessage(id);
        }
    }

    /**
     *
     * @param eventType
     * @param listener
     */
    static addListener(eventType, listener) {
        RTCUtils.addListener(eventType, listener);
    }

    /**
     *
     * @param eventType
     * @param listener
     */
    static removeListener(eventType, listener) {
        RTCUtils.removeListener(eventType, listener);
    }

    /**
     *
     * @param options
     */
    static init(options = {}) {
        this.options = options;

        return RTCUtils.init(this.options);
    }

    /* eslint-disable max-params */

    /**
     * Creates new <tt>TraceablePeerConnection</tt>
     * @param {SignalingLayer} signaling The signaling layer that will
     *      provide information about the media or participants which is not
     *      carried over SDP.
     * @param {object} iceConfig An object describing the ICE config like
     *      defined in the WebRTC specification.
     * @param {boolean} isP2P Indicates whether or not the new TPC will be used
     *      in a peer to peer type of session.
     * @param {object} options The config options.
     * @param {boolean} options.disableSimulcast If set to 'true' will disable
     *      the simulcast.
     * @param {boolean} options.disableRtx If set to 'true' will disable the
     *      RTX.
     * @param {boolean} options.disableH264 If set to 'true' H264 will be
     *      disabled by removing it from the SDP.
     * @param {boolean} options.preferH264 If set to 'true' H264 will be
     *      preferred over other video codecs.
     * @return {TraceablePeerConnection}
     */
    createPeerConnection(signaling, iceConfig, isP2P, options) {
        const pcConstraints = RTC.getPCConstraints(isP2P);

        if (typeof options.abtestSuspendVideo !== 'undefined') {
            RTCUtils.setSuspendVideo(pcConstraints, options.abtestSuspendVideo);

            Statistics.analytics.addPermanentProperties(
                { abtestSuspendVideo: options.abtestSuspendVideo });
        }

        // FIXME: We should rename iceConfig to pcConfig.
        if (browser.supportsSdpSemantics()) {
            iceConfig.sdpSemantics = 'plan-b';
        }

        peerConnectionIdCounter = safeCounterIncrement(peerConnectionIdCounter);

        const newConnection
            = new TraceablePeerConnection(
                this,
                peerConnectionIdCounter,
                signaling,
                iceConfig, pcConstraints,
                isP2P, options);

        this.peerConnections.set(newConnection.id, newConnection);

        return newConnection;
    }

    /* eslint-enable max-params */

    /**
     * Removed given peer connection from this RTC module instance.
     * @param {TraceablePeerConnection} traceablePeerConnection
     * @return {boolean} <tt>true</tt> if the given peer connection was removed
     * successfully or <tt>false</tt> if there was no peer connection mapped in
     * this RTC instance.
     */
    _removePeerConnection(traceablePeerConnection) {
        const id = traceablePeerConnection.id;

        if (this.peerConnections.has(id)) {
            // NOTE Remote tracks are not removed here.
            this.peerConnections.delete(id);

            return true;
        }

        return false;

    }

    /**
     *
     * @param track
     */
    addLocalTrack(track) {
        if (!track) {
            throw new Error('track must not be null nor undefined');
        }

        this.localTracks.push(track);

        track.conference = this.conference;
    }

    /**
     * Returns the current value for "lastN" - the amount of videos are going
     * to be delivered. When set to -1 for unlimited or all available videos.
     * @return {number}
     */
    getLastN() {
        return this._lastN;
    }

    /**
     * Get local video track.
     * @returns {JitsiLocalTrack|undefined}
     */
    getLocalVideoTrack() {
        const localVideo = this.getLocalTracks(MediaType.VIDEO);


        return localVideo.length ? localVideo[0] : undefined;
    }

    /**
     * Get local audio track.
     * @returns {JitsiLocalTrack|undefined}
     */
    getLocalAudioTrack() {
        const localAudio = this.getLocalTracks(MediaType.AUDIO);


        return localAudio.length ? localAudio[0] : undefined;
    }

    /**
     * Returns the local tracks of the given media type, or all local tracks if
     * no specific type is given.
     * @param {MediaType} [mediaType] Optional media type filter.
     * (audio or video).
     */
    getLocalTracks(mediaType) {
        let tracks = this.localTracks.slice();

        if (mediaType !== undefined) {
            tracks = tracks.filter(
                track => track.getType() === mediaType);
        }

        return tracks;
    }

    /**
     * Obtains all remote tracks currently known to this RTC module instance.
     * @param {MediaType} [mediaType] The remote tracks will be filtered
     *      by their media type if this argument is specified.
     * @return {Array<JitsiRemoteTrack>}
     */
    getRemoteTracks(mediaType) {
        let remoteTracks = [];

        for (const tpc of this.peerConnections.values()) {
            const pcRemoteTracks = tpc.getRemoteTracks(undefined, mediaType);

            if (pcRemoteTracks) {
                remoteTracks = remoteTracks.concat(pcRemoteTracks);
            }
        }

        return remoteTracks;
    }

    /**
     * Set mute for all local audio streams attached to the conference.
     * @param value The mute value.
     * @returns {Promise}
     */
    setAudioMute(value) {
        const mutePromises = [];

        this.getLocalTracks(MediaType.AUDIO).forEach(audioTrack => {
            // this is a Promise
            mutePromises.push(value ? audioTrack.mute() : audioTrack.unmute());
        });

        // We return a Promise from all Promises so we can wait for their
        // execution.
        return Promise.all(mutePromises);
    }

    /**
     *
     * @param track
     */
    removeLocalTrack(track) {
        const pos = this.localTracks.indexOf(track);

        if (pos === -1) {
            return;
        }

        this.localTracks.splice(pos, 1);
    }

    /**
     * Removes all JitsiRemoteTracks associated with given MUC nickname
     * (resource part of the JID). Returns array of removed tracks.
     *
     * @param {string} Owner The resource part of the MUC JID.
     * @returns {JitsiRemoteTrack[]}
     */
    removeRemoteTracks(owner) {
        let removedTracks = [];

        for (const tpc of this.peerConnections.values()) {
            const pcRemovedTracks = tpc.removeRemoteTracks(owner);

            removedTracks = removedTracks.concat(pcRemovedTracks);
        }

        logger.debug(
            `Removed remote tracks for ${owner}`
                + ` count: ${removedTracks.length}`);

        return removedTracks;
    }

    /**
     *
     */
    static getPCConstraints(isP2P) {
        const pcConstraints
            = isP2P ? RTCUtils.p2pPcConstraints : RTCUtils.pcConstraints;

        if (!pcConstraints) {
            return {};
        }

        return JSON.parse(JSON.stringify(pcConstraints));
    }

    /**
     *
     * @param elSelector
     * @param stream
     */
    static attachMediaStream(elSelector, stream) {
        return RTCUtils.attachMediaStream(elSelector, stream);
    }

    /**
     * Returns the id of the given stream.
     * @param {MediaStream} stream
     */
    static getStreamID(stream) {
        return RTCUtils.getStreamID(stream);
    }

    /**
     * Returns the id of the given track.
     * @param {MediaStreamTrack} track
     */
    static getTrackID(track) {
        return RTCUtils.getTrackID(track);
    }

    /**
     * Returns true if retrieving the the list of input devices is supported
     * and false if not.
     */
    static isDeviceListAvailable() {
        return RTCUtils.isDeviceListAvailable();
    }

    /**
     * Returns true if changing the input (camera / microphone) or output
     * (audio) device is supported and false if not.
     * @param {string} [deviceType] Type of device to change. Default is
     *      undefined or 'input', 'output' - for audio output device change.
     * @returns {boolean} true if available, false otherwise.
     */
    static isDeviceChangeAvailable(deviceType) {
        return RTCUtils.isDeviceChangeAvailable(deviceType);
    }

    /**
     * Returns whether the current execution environment supports WebRTC (for
     * use within this library).
     *
     * @returns {boolean} {@code true} if WebRTC is supported in the current
     * execution environment (for use within this library); {@code false},
     * otherwise.
     */
    static isWebRtcSupported() {
        return browser.isSupported();
    }

    /**
     * Returns currently used audio output device id, '' stands for default
     * device
     * @returns {string}
     */
    static getAudioOutputDevice() {
        return RTCUtils.getAudioOutputDevice();
    }

    /**
     * Returns list of available media devices if its obtained, otherwise an
     * empty array is returned/
     * @returns {array} list of available media devices.
     */
    static getCurrentlyAvailableMediaDevices() {
        return RTCUtils.getCurrentlyAvailableMediaDevices();
    }

    /**
     * Returns event data for device to be reported to stats.
     * @returns {MediaDeviceInfo} device.
     */
    static getEventDataForActiveDevice(device) {
        return RTCUtils.getEventDataForActiveDevice(device);
    }

    /**
     * Sets current audio output device.
     * @param {string} deviceId Id of 'audiooutput' device from
     *      navigator.mediaDevices.enumerateDevices().
     * @returns {Promise} resolves when audio output is changed, is rejected
     *      otherwise
     */
    static setAudioOutputDevice(deviceId) {
        return RTCUtils.setAudioOutputDevice(deviceId);
    }

    /**
     * Returns <tt>true<tt/> if given WebRTC MediaStream is considered a valid
     * "user" stream which means that it's not a "receive only" stream nor a
     * "mixed" JVB stream.
     *
     * Clients that implement Unified Plan, such as Firefox use recvonly
     * "streams/channels/tracks" for receiving remote stream/tracks, as opposed
     * to Plan B where there are only 3 channels: audio, video and data.
     *
     * @param {MediaStream} stream The WebRTC MediaStream instance.
     * @returns {boolean}
     */
    static isUserStream(stream) {
        return RTC.isUserStreamById(RTCUtils.getStreamID(stream));
    }

    /**
     * Returns <tt>true<tt/> if a WebRTC MediaStream identified by given stream
     * ID is considered a valid "user" stream which means that it's not a
     * "receive only" stream nor a "mixed" JVB stream.
     *
     * Clients that implement Unified Plan, such as Firefox use recvonly
     * "streams/channels/tracks" for receiving remote stream/tracks, as opposed
     * to Plan B where there are only 3 channels: audio, video and data.
     *
     * @param {string} streamId The id of WebRTC MediaStream.
     * @returns {boolean}
     */
    static isUserStreamById(streamId) {
        return streamId && streamId !== 'mixedmslabel'
            && streamId !== 'default';
    }

    /**
     * Allows to receive list of available cameras/microphones.
     * @param {function} callback Would receive array of devices as an
     *      argument.
     */
    static enumerateDevices(callback) {
        RTCUtils.enumerateDevices(callback);
    }

    /**
     * A method to handle stopping of the stream.
     * One point to handle the differences in various implementations.
     * @param {MediaStream} mediaStream MediaStream object to stop.
     */
    static stopMediaStream(mediaStream) {
        RTCUtils.stopMediaStream(mediaStream);
    }

    /**
     * Returns whether the desktop sharing is enabled or not.
     * @returns {boolean}
     */
    static isDesktopSharingEnabled() {
        return RTCUtils.isDesktopSharingEnabled();
    }

    /**
     * Closes the currently opened bridge channel.
     */
    closeBridgeChannel() {
        if (this._channel) {
            this._channel.close();
            this._channelOpen = false;

            this.removeListener(RTCEvents.LASTN_ENDPOINT_CHANGED,
                this._lastNChangeListener);
        }
    }

    /* eslint-disable max-params */
    /**
     *
     * @param {TraceablePeerConnection} tpc
     * @param {number} ssrc
     * @param {number} audioLevel
     * @param {boolean} isLocal
     */
    setAudioLevel(tpc, ssrc, audioLevel, isLocal) {
        const track = tpc.getTrackBySSRC(ssrc);

        if (!track) {
            return;
        } else if (!track.isAudioTrack()) {
            logger.warn(`Received audio level for non-audio track: ${ssrc}`);

            return;
        } else if (track.isLocal() !== isLocal) {
            logger.error(
                `${track} was expected to ${isLocal ? 'be' : 'not be'} local`);
        }

        track.setAudioLevel(audioLevel, tpc);
    }

    /* eslint-enable max-params */

    /**
     * Sends message via the bridge channel.
     * @param {string} to The id of the endpoint that should receive the
     *      message. If "" the message will be sent to all participants.
     * @param {object} payload The payload of the message.
     * @throws NetworkError or InvalidStateError or Error if the operation
     * fails or there is no data channel created.
     */
    sendChannelMessage(to, payload) {
        if (this._channel) {
            this._channel.sendMessage(to, payload);
        } else {
            throw new Error('Channel support is disabled!');
        }
    }

    /**
     * Selects a new value for "lastN". The requested amount of videos are going
     * to be delivered after the value is in effect. Set to -1 for unlimited or
     * all available videos.
     * @param {number} value the new value for lastN.
     */
    setLastN(value) {
        if (this._lastN !== value) {
            this._lastN = value;
            if (this._channel && this._channelOpen) {
                this._channel.sendSetLastNMessage(value);
            }
            this.eventEmitter.emit(RTCEvents.LASTN_VALUE_CHANGED, value);
        }
    }

    /**
     * Indicates if the endpoint id is currently included in the last N.
     * @param {string} id The endpoint id that we check for last N.
     * @returns {boolean} true if the endpoint id is in the last N or if we
     * don't have bridge channel support, otherwise we return false.
     */
    isInLastN(id) {
        return !this._lastNEndpoints // lastNEndpoints not initialised yet.
            || this._lastNEndpoints.indexOf(id) > -1;
    }

    /**
     * Updates the target audio output device for all remote audio tracks.
     *
     * @param {string} deviceId - The device id of the audio ouput device to
     * use for all remote tracks.
     * @private
     * @returns {void}
     */
    _updateAudioOutputForAudioTracks(deviceId) {
        const remoteAudioTracks = this.getRemoteTracks(MediaType.AUDIO);

        for (const track of remoteAudioTracks) {
            track.setAudioOutput(deviceId);
        }
    }
}
