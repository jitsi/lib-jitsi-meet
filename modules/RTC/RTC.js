/* global __filename */

import { getLogger } from 'jitsi-meet-logger';

import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import * as MediaType from '../../service/RTC/MediaType';
import RTCEvents from '../../service/RTC/RTCEvents';
import VideoType from '../../service/RTC/VideoType';
import browser from '../browser';
import Statistics from '../statistics/statistics';
import GlobalOnErrorHandler from '../util/GlobalOnErrorHandler';
import Listenable from '../util/Listenable';
import { safeCounterIncrement } from '../util/MathUtil';

import BridgeChannel from './BridgeChannel';
import JitsiLocalTrack from './JitsiLocalTrack';
import RTCUtils from './RTCUtils';
import TraceablePeerConnection from './TraceablePeerConnection';


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
 *     sourceType: The desktopsharing source type,
 *     effects: Array of effect types
 * }}
 */
function _createLocalTracks(mediaStreamMetaData = []) {
    return mediaStreamMetaData.map(metaData => {
        const {
            sourceId,
            sourceType,
            stream,
            track,
            videoType,
            effects
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
            videoType: videoType || null,
            effects
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

        /**
         * The value specified to the last invocation of setLastN before the
         * channel completed opening. If non-null, the value will be sent
         * through a channel (once) as soon as it opens and will then be
         * discarded.
         * @private
         * @type {number}
         */
        this._lastN = undefined;

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
         * The endpoint IDs of currently selected participants.
         *
         * @type {Array}
         * @private
         */
        this._selectedEndpoints = null;

        // The last N change listener.
        this._lastNChangeListener = this._onLastNChanged.bind(this);

        this._onDeviceListChanged = this._onDeviceListChanged.bind(this);
        this._updateAudioOutputForAudioTracks
            = this._updateAudioOutputForAudioTracks.bind(this);

        // The default video type assumed by the bridge.
        this._videoType = VideoType.NONE;

        // Switch audio output device on all remote audio tracks. Local audio
        // tracks handle this event by themselves.
        if (RTCUtils.isDeviceChangeAvailable('output')) {
            RTCUtils.addListener(
                RTCEvents.AUDIO_OUTPUT_DEVICE_CHANGED,
                this._updateAudioOutputForAudioTracks
            );

            RTCUtils.addListener(
                RTCEvents.DEVICE_LIST_CHANGED,
                this._onDeviceListChanged
            );
        }
    }

    /**
     * Removes any listeners and stored state from this {@code RTC} instance.
     *
     * @returns {void}
     */
    destroy() {
        RTCUtils.removeListener(RTCEvents.AUDIO_OUTPUT_DEVICE_CHANGED, this._updateAudioOutputForAudioTracks);
        RTCUtils.removeListener(RTCEvents.DEVICE_LIST_CHANGED, this._onDeviceListChanged);

        if (this._channelOpenListener) {
            this.removeListener(
                RTCEvents.DATA_CHANNEL_OPEN,
                this._channelOpenListener
            );
        }
    }

    /**
     * Exposes the private helper for converting a WebRTC MediaStream to a
     * JitsiLocalTrack.
     *
     * @param {Array<Object>} tracksInfo
     * @returns {Array<JitsiLocalTrack>}
     */
    static createLocalTracks(tracksInfo) {
        return _createLocalTracks(tracksInfo);
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
        return RTCUtils.obtainAudioAndVideoPermissions(options)
            .then(tracksInfo => _createLocalTracks(tracksInfo));

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
        this._channel = new BridgeChannel(peerconnection, wsUrl, this.eventEmitter);

        this._channelOpenListener = () => {
            const logError = (error, msgType, value) => {
                GlobalOnErrorHandler.callErrorHandler(error);
                logger.error(`Cannot send ${msgType}(${JSON.stringify(value)}) endpoint message`, error);
            };

            // When the channel becomes available, tell the bridge about video selections so that it can do adaptive
            // simulcast, we want the notification to trigger even if userJid is undefined, or null.
            if (this._receiverVideoConstraints) {
                try {
                    this._channel.sendNewReceiverVideoConstraintsMessage(this._receiverVideoConstraints);
                } catch (error) {
                    logError(error, 'ReceiverVideoConstraints', this._receiverVideoConstraints);
                }
            }
            if (this._selectedEndpoints) {
                try {
                    this._channel.sendSelectedEndpointsMessage(this._selectedEndpoints);
                } catch (error) {
                    logError(error, 'SelectedEndpointsChangedEvent', this._selectedEndpoint);
                }
            }
            if (typeof this._maxFrameHeight !== 'undefined') {
                try {
                    this._channel.sendReceiverVideoConstraintMessage(this._maxFrameHeight);
                } catch (error) {
                    logError(error, 'ReceiverVideoConstraint', this._maxFrameHeight);
                }
            }
            if (typeof this._lastN !== 'undefined' && this._lastN !== -1) {
                try {
                    this._channel.sendSetLastNMessage(this._lastN);
                } catch (error) {
                    logError(error, 'LastNChangedEvent', this._lastN);
                }
            }
            try {
                this._channel.sendVideoTypeMessage(this._videoType);
            } catch (error) {
                logError(error, 'VideoTypeMessage', this._videoType);
            }

            this.removeListener(RTCEvents.DATA_CHANNEL_OPEN, this._channelOpenListener);
            this._channelOpenListener = null;
        };
        this.addListener(RTCEvents.DATA_CHANNEL_OPEN, this._channelOpenListener);

        // Add Last N change listener.
        this.addListener(RTCEvents.LASTN_ENDPOINT_CHANGED, this._lastNChangeListener);
    }

    /**
     * Callback invoked when the list of known audio and video devices has
     * been updated. Attempts to update the known available audio output
     * devices.
     *
     * @private
     * @returns {void}
     */
    _onDeviceListChanged() {
        this._updateAudioOutputForAudioTracks(RTCUtils.getAudioOutputDevice());
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
        }
    }

    /**
     * Sets the receiver video constraints that determine how bitrate is allocated to each of the video streams
     * requested from the bridge. The constraints are cached and sent through the bridge channel once the channel
     * is established.
     * @param {*} constraints
     */
    setNewReceiverVideoConstraints(constraints) {
        this._receiverVideoConstraints = constraints;

        if (this._channel && this._channel.isOpen()) {
            this._channel.sendNewReceiverVideoConstraintsMessage(constraints);
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

        if (this._channel && this._channel.isOpen()) {
            this._channel.sendReceiverVideoConstraintMessage(maxFrameHeight);
        }
    }

    /**
     * Sets the video type and availability for the local video source.
     *
     * @param {string} videoType 'camera' for camera, 'desktop' for screenshare and
     * 'none' for when local video source is muted or removed from the peerconnection.
     * @returns {void}
     */
    setVideoType(videoType) {
        if (this._videoType !== videoType) {
            this._videoType = videoType;

            if (this._channel && this._channel.isOpen()) {
                this._channel.sendVideoTypeMessage(videoType);
            }
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

        if (this._channel && this._channel.isOpen()) {
            this._channel.sendSelectedEndpointsMessage(ids);
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
     * @param {boolean} options.enableInsertableStreams - Set to true when the insertable streams constraints is to be
     * enabled on the PeerConnection.
     * @param {boolean} options.disableSimulcast If set to 'true' will disable
     *      the simulcast.
     * @param {boolean} options.disableRtx If set to 'true' will disable the
     *      RTX.
     * @param {boolean} options.disableH264 If set to 'true' H264 will be
     *      disabled by removing it from the SDP.
     * @param {boolean} options.preferH264 If set to 'true' H264 will be
     *      preferred over other video codecs.
     * @param {boolean} options.startSilent If set to 'true' no audio will be sent or received.
     * @return {TraceablePeerConnection}
     */
    createPeerConnection(signaling, iceConfig, isP2P, options) {
        const pcConstraints = JSON.parse(JSON.stringify(RTCUtils.pcConstraints));

        if (typeof options.abtestSuspendVideo !== 'undefined') {
            RTCUtils.setSuspendVideo(pcConstraints, options.abtestSuspendVideo);

            Statistics.analytics.addPermanentProperties(
                { abtestSuspendVideo: options.abtestSuspendVideo });
        }

        // FIXME: We should rename iceConfig to pcConfig.

        if (options.enableInsertableStreams) {
            logger.debug('E2EE - setting insertable streams constraints');
            iceConfig.encodedInsertableStreams = true;
            iceConfig.forceEncodedAudioInsertableStreams = true; // legacy, to be removed in M88.
            iceConfig.forceEncodedVideoInsertableStreams = true; // legacy, to be removed in M88.
        }

        const supportsSdpSemantics = browser.isReactNative()
            || (browser.isChromiumBased() && !options.usesUnifiedPlan);

        if (supportsSdpSemantics) {
            iceConfig.sdpSemantics = 'plan-b';
        }

        if (options.forceTurnRelay) {
            iceConfig.iceTransportPolicy = 'relay';
        }

        // Set the RTCBundlePolicy to max-bundle so that only one set of ice candidates is generated.
        // The default policy generates separate ice candidates for audio and video connections.
        // This change is necessary for Unified plan to work properly on Chrome and Safari.
        iceConfig.bundlePolicy = 'max-bundle';

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
     * Returns the endpoint id for the local user.
     * @returns {string}
     */
    getLocalEndpointId() {
        return this.conference.myUserId();
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
    * Set mute for all local video streams attached to the conference.
    * @param value The mute value.
    * @returns {Promise}
    */
    setVideoMute(value) {
        const mutePromises = [];

        this.getLocalTracks(MediaType.VIDEO).concat(this.getLocalTracks(MediaType.PRESENTER))
            .forEach(videoTrack => {
                // this is a Promise
                mutePromises.push(value ? videoTrack.mute() : videoTrack.unmute());
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
     * Returns true if retrieving the list of input devices is supported
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
     * Returns whether available devices have permissions granted
     * @returns {Boolean}
     */
    static arePermissionsGrantedForAvailableDevices() {
        return RTCUtils.arePermissionsGrantedForAvailableDevices();
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
            this._channel = null;

            this.removeListener(RTCEvents.LASTN_ENDPOINT_CHANGED, this._lastNChangeListener);
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
     * Sends the local stats via the bridge channel.
     * @param {Object} payload The payload of the message.
     * @throws NetworkError/InvalidStateError/Error if the operation fails or if there is no data channel created.
     */
    sendEndpointStatsMessage(payload) {
        if (this._channel && this._channel.isOpen()) {
            this._channel.sendEndpointStatsMessage(payload);
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
            if (this._channel && this._channel.isOpen()) {
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
