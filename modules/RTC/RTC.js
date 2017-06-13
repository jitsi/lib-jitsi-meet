/* global __filename */

import { getLogger } from 'jitsi-meet-logger';

import DataChannels from './DataChannels';
import GlobalOnErrorHandler from '../util/GlobalOnErrorHandler';
import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import JitsiLocalTrack from './JitsiLocalTrack';
import JitsiTrackError from '../../JitsiTrackError';
import * as JitsiTrackErrors from '../../JitsiTrackErrors';
import Listenable from '../util/Listenable';
import * as MediaType from '../../service/RTC/MediaType';
import RTCEvents from '../../service/RTC/RTCEvents';
import RTCUtils from './RTCUtils';
import TraceablePeerConnection from './TraceablePeerConnection';
import VideoType from '../../service/RTC/VideoType';

const logger = getLogger(__filename);

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
        rtcTrackIdCounter += 1;
        const localTrack
            = new JitsiLocalTrack(
                rtcTrackIdCounter,
                trackInfo.stream,
                trackInfo.track,
                trackInfo.mediaType,
                trackInfo.videoType,
                trackInfo.resolution,
                deviceId,
                options.facingMode);

        newTracks.push(localTrack);
    });

    return newTracks;
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

        /**
         * The counter used to generated id numbers assigned to peer connections
         * @type {number}
         */
        this.peerConnectionIdCounter = 1;

        this.localTracks = [];

        this.options = options;

        // A flag whether we had received that the data channel had opened
        // we can get this flag out of sync if for some reason data channel got
        // closed from server, a desired behaviour so we can see errors when
        // this happen
        this.dataChannelsOpen = false;

        /**
         * The value specified to the last invocation of setLastN before the
         * data channels completed opening. If non-null, the value will be sent
         * through a data channel (once) as soon as it opens and will then be
         * discarded.
         *
         * @private
         * @type {number}
         */
        this._lastN = -1;

        /**
         * Defines the last N endpoints list. It can be null or an array once
         * initialised with a datachannel last N event.
         * @type {Array<string>|null}
         * @private
         */
        this._lastNEndpoints = null;

        /**
         * The endpoint ID of currently pinned participant or <tt>null</tt> if
         * no user is pinned.
         * @type {string|null}
         * @private
         */
        this._pinnedEndpoint = null;

        /**
         * The endpoint ID of currently selected participant or <tt>null</tt> if
         * no user is selected.
         * @type {string|null}
         * @private
         */
        this._selectedEndpoint = null;

        // The last N change listener.
        this._lastNChangeListener = this._onLastNChanged.bind(this);

        // Switch audio output device on all remote audio tracks. Local audio
        // tracks handle this event by themselves.
        if (RTCUtils.isDeviceChangeAvailable('output')) {
            RTCUtils.addListener(RTCEvents.AUDIO_OUTPUT_DEVICE_CHANGED,
                deviceId => {
                    const remoteAudioTracks
                        = this.getRemoteTracks(MediaType.AUDIO);

                    for (const track of remoteAudioTracks) {
                        track.setAudioOutput(deviceId);
                    }
                });
        }
    }

    /**
     * Creates the local MediaStreams.
     * @param {Object} [options] optional parameters
     * @param {Array} options.devices the devices that will be requested
     * @param {string} options.resolution resolution constraints
     * @param {bool} options.dontCreateJitsiTrack if <tt>true</tt> objects with
     * the following structure {stream: the Media Stream, type: "audio" or
     * "video", videoType: "camera" or "desktop"} will be returned trough the
     * Promise, otherwise JitsiTrack objects will be returned.
     * @param {string} options.cameraDeviceId
     * @param {string} options.micDeviceId
     * @returns {*} Promise object that will receive the new JitsiTracks
     */
    static obtainAudioAndVideoPermissions(options) {
        return RTCUtils.obtainAudioAndVideoPermissions(options).then(
            tracksInfo => {
                const tracks = createLocalTracks(tracksInfo, options);


                return tracks.some(track => !track._isReceivingData())
                    ? Promise.reject(
                        new JitsiTrackError(
                            JitsiTrackErrors.NO_DATA_FROM_SOURCE))
                    : tracks;
            });
    }

    /**
     * Initializes the data channels of this instance.
     * @param peerconnection the associated PeerConnection.
     */
    initializeDataChannels(peerconnection) {
        if (this.options.config.openSctp) {
            this.dataChannels = new DataChannels(peerconnection,
                this.eventEmitter);

            this._dataChannelOpenListener = () => {
                // mark that dataChannel is opened
                this.dataChannelsOpen = true;

                // when the data channel becomes available, tell the bridge
                // about video selections so that it can do adaptive simulcast,
                // we want the notification to trigger even if userJid
                // is undefined, or null.
                try {
                    this.dataChannels.sendPinnedEndpointMessage(
                        this._pinnedEndpoint);
                    this.dataChannels.sendSelectedEndpointMessage(
                        this._selectedEndpoint);
                } catch (error) {
                    GlobalOnErrorHandler.callErrorHandler(error);
                    logger.error(
                        `Cannot send selected(${this._selectedEndpoint})`
                        + `pinned(${this._pinnedEndpoint}) endpoint message.`,
                        error);
                }

                this.removeListener(RTCEvents.DATA_CHANNEL_OPEN,
                    this._dataChannelOpenListener);
                this._dataChannelOpenListener = null;

                // If setLastN was invoked before the data channels completed
                // opening, apply the specified value now that the data channels
                // are open. NOTE that -1 is the default value assumed by both
                // RTC module and the JVB.
                if (this._lastN !== -1) {
                    this.dataChannels.sendSetLastNMessage(this._lastN);
                }
            };
            this.addListener(RTCEvents.DATA_CHANNEL_OPEN,
                this._dataChannelOpenListener);

            // Add Last N change listener.
            this.addListener(RTCEvents.LASTN_ENDPOINT_CHANGED,
                this._lastNChangeListener);
        }
    }

    /**
     * Receives events when Last N had changed.
     * @param {array} lastNEndpoints the new Last N endpoints.
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
        if (this.dataChannels) {
            // DataChannels are not explicitly closed as the PeerConnection
            // is closed on call ended which triggers data channel onclose
            // events. The reference is cleared to disable any logic related
            // to the data channels.
            this.dataChannels = null;
            this.dataChannelsOpen = false;
        }
    }

    /**
     * Elects the participant with the given id to be the selected participant
     * in order to always receive video for this participant (even when last n
     * is enabled).
     * If there is no data channel we store it and send it through the channel
     * once it is created.
     * @param id {string} the user id.
     * @throws NetworkError or InvalidStateError or Error if the operation
     * fails.
     */
    selectEndpoint(id) {
        // cache the value if channel is missing, till we open it
        this._selectedEndpoint = id;
        if (this.dataChannels && this.dataChannelsOpen) {
            this.dataChannels.sendSelectedEndpointMessage(id);
        }
    }

    /**
     * Elects the participant with the given id to be the pinned participant in
     * order to always receive video for this participant (even when last n is
     * enabled).
     * @param id {string} the user id
     * @throws NetworkError or InvalidStateError or Error if the operation
     * fails.
     */
    pinEndpoint(id) {
        // cache the value if channel is missing, till we open it
        this._pinnedEndpoint = id;
        if (this.dataChannels && this.dataChannelsOpen) {
            this.dataChannels.sendPinnedEndpointMessage(id);
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
     */
    static isRTCReady() {
        return RTCUtils.isRTCReady();
    }

    /**
     *
     * @param options
     */
    static init(options = {}) {
        this.options = options;

        return RTCUtils.init(this.options);
    }

    /**
     *
     */
    static getDeviceAvailability() {
        return RTCUtils.getDeviceAvailability();
    }

    /* eslint-disable max-params */

    /**
     * Creates new <tt>TraceablePeerConnection</tt>
     * @param {SignalingLayer} signaling the signaling layer that will
     * provide information about the media or participants which is not carried
     * over SDP.
     * @param {Object} iceConfig an object describing the ICE config like
     * defined in the WebRTC specification.
     * @param {boolean} isP2P indicates whether or not the new TPC will be used
     * in a peer to peer type of session
     * @param {Object} options the config options
     * @param {boolean} options.disableSimulcast if set to 'true' will disable
     * the simulcast
     * @param {boolean} options.disableRtx if set to 'true' will disable the RTX
     * @param {boolean} options.preferH264 if set to 'true' H264 will be
     * preferred over other video codecs.
     * @return {TraceablePeerConnection}
     */
    createPeerConnection(signaling, iceConfig, isP2P, options) {
        const newConnection
            = new TraceablePeerConnection(
                this,
                this.peerConnectionIdCounter,
                signaling, iceConfig, RTC.getPCConstraints(), isP2P, options);

        this.peerConnections.set(newConnection.id, newConnection);
        this.peerConnectionIdCounter += 1;

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
     * @param {MediaType} [mediaType] optional media type filter
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
     * @param {MediaType} [mediaType] the remote tracks will be filtered
     * by their media type if this argument is specified.
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
     * @param value the mute value
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
     * @param {string} owner - The resource part of the MUC JID.
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
    static getPCConstraints() {
        return RTCUtils.pcConstraints;
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
     *
     * @param stream
     */
    static getStreamID(stream) {
        return RTCUtils.getStreamID(stream);
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
     * @params {string} [deviceType] - type of device to change. Default is
     *      undefined or 'input', 'output' - for audio output device change.
     * @returns {boolean} true if available, false otherwise.
     */
    static isDeviceChangeAvailable(deviceType) {
        return RTCUtils.isDeviceChangeAvailable(deviceType);
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
     * @returns {Array} list of available media devices.
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
     * @param {string} deviceId - id of 'audiooutput' device from
     *      navigator.mediaDevices.enumerateDevices()
     * @returns {Promise} - resolves when audio output is changed, is rejected
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
     * @param {MediaStream} stream the WebRTC MediaStream instance
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
     * @param {string} streamId the id of WebRTC MediaStream
     * @returns {boolean}
     */
    static isUserStreamById(streamId) {
        return streamId && streamId !== 'mixedmslabel'
            && streamId !== 'default';
    }

    /**
     * Allows to receive list of available cameras/microphones.
     * @param {function} callback would receive array of devices as an argument
     */
    static enumerateDevices(callback) {
        RTCUtils.enumerateDevices(callback);
    }

    /**
     * A method to handle stopping of the stream.
     * One point to handle the differences in various implementations.
     * @param mediaStream MediaStream object to stop.
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
     * Closes all currently opened data channels.
     */
    closeAllDataChannels() {
        if (this.dataChannels) {
            this.dataChannels.closeAllChannels();
            this.dataChannelsOpen = false;

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
     * Sends message via the datachannels.
     * @param to {string} the id of the endpoint that should receive the
     * message. If "" the message will be sent to all participants.
     * @param payload {object} the payload of the message.
     * @throws NetworkError or InvalidStateError or Error if the operation
     * fails or there is no data channel created
     */
    sendDataChannelMessage(to, payload) {
        if (this.dataChannels) {
            this.dataChannels.sendDataChannelMessage(to, payload);
        } else {
            throw new Error('Data channels support is disabled!');
        }
    }

    /**
     * Selects a new value for "lastN". The requested amount of videos are going
     * to be delivered after the value is in effect. Set to -1 for unlimited or
     * all available videos.
     * @param value {number} the new value for lastN.
     */
    setLastN(value) {
        if (this._lastN !== value) {
            this._lastN = value;
            if (this.dataChannels && this.dataChannelsOpen) {
                this.dataChannels.sendSetLastNMessage(value);
            }
            this.eventEmitter.emit(RTCEvents.LASTN_VALUE_CHANGED, value);
        }
    }

    /**
     * Indicates if the endpoint id is currently included in the last N.
     *
     * @param {string} id the endpoint id that we check for last N.
     * @returns {boolean} true if the endpoint id is in the last N or if we
     * don't have data channel support, otherwise we return false.
     */
    isInLastN(id) {
        return !this._lastNEndpoints // lastNEndpoints not initialised yet
            || this._lastNEndpoints.indexOf(id) > -1;
    }
}
