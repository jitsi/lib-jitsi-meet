/* global */

var logger = require("jitsi-meet-logger").getLogger(__filename);
var RTCEvents = require("../../service/RTC/RTCEvents.js");
import RTCUtils from "./RTCUtils.js";
import {getValues} from "../util/JSUtil";
var JitsiLocalTrack = require("./JitsiLocalTrack.js");
import JitsiTrackError from "../../JitsiTrackError";
import * as JitsiTrackErrors from "../../JitsiTrackErrors";
var DataChannels = require("./DataChannels");
import * as MediaType from "../../service/RTC/MediaType";
var TraceablePeerConnection = require("./TraceablePeerConnection");
var VideoType = require("../../service/RTC/VideoType");
var GlobalOnErrorHandler = require("../util/GlobalOnErrorHandler");
import Listenable from "../util/Listenable";

let rtcTrackIdCounter = 0;

function createLocalTracks(tracksInfo, options) {
    var newTracks = [];
    var deviceId = null;
    tracksInfo.forEach(function(trackInfo){
        if (trackInfo.mediaType === MediaType.AUDIO) {
            deviceId = options.micDeviceId;
        } else if (trackInfo.videoType === VideoType.CAMERA){
            deviceId = options.cameraDeviceId;
        }
        rtcTrackIdCounter += 1;
        var localTrack
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

export default class RTC extends Listenable {
    constructor(conference, options = {}) {
        super();
        this.conference = conference;
        /**
         * A map of active <tt>TraceablePeerConnection</tt>.
         * @type {Object.<number, TraceablePeerConnection>}
         */
        this.peerConnections = { };
        /**
         * The counter used to generated id numbers assigned to peer connections
         * @type {number}
         */
        this.peerConnIdCounter = 1;

        this.localTracks = [];
        this.options = options;
        // A flag whether we had received that the data channel had opened
        // we can get this flag out of sync if for some reason data channel got
        // closed from server, a desired behaviour so we can see errors when this
        // happen
        this.dataChannelsOpen = false;

        // Switch audio output device on all remote audio tracks. Local audio tracks
        // handle this event by themselves.
        if (RTCUtils.isDeviceChangeAvailable('output')) {
            RTCUtils.addListener(RTCEvents.AUDIO_OUTPUT_DEVICE_CHANGED,
                (deviceId) => {
                    this.getRemoteTracks(MediaType.AUDIO).forEach(
                        function (track) {
                            track.setAudioOutput(deviceId);
                        });
                });
        }
    }

    /**
     * Creates the local MediaStreams.
     * @param {Object} [options] optional parameters
     * @param {Array} options.devices the devices that will be requested
     * @param {string} options.resolution resolution constraints
     * @param {bool} options.dontCreateJitsiTrack if <tt>true</tt> objects with the
     * following structure {stream: the Media Stream,
     * type: "audio" or "video", videoType: "camera" or "desktop"}
     * will be returned trough the Promise, otherwise JitsiTrack objects will be
     * returned.
     * @param {string} options.cameraDeviceId
     * @param {string} options.micDeviceId
     * @returns {*} Promise object that will receive the new JitsiTracks
     */
    static obtainAudioAndVideoPermissions (options) {
        return RTCUtils.obtainAudioAndVideoPermissions(options).then(
            function (tracksInfo) {
                var tracks = createLocalTracks(tracksInfo, options);
                return !tracks.some(track =>
                    !track._isReceivingData())? tracks
                        : Promise.reject(new JitsiTrackError(
                            JitsiTrackErrors.NO_DATA_FROM_SOURCE));
        });
    }

    /**
     * Initializes the data channels of this instance.
     * @param peerconnection the associated PeerConnection.
     */
    initializeDataChannels (peerconnection) {
        if(this.options.config.openSctp) {
            this.dataChannels = new DataChannels(peerconnection,
                this.eventEmitter);
            this._dataChannelOpenListener = () => {
                // mark that dataChannel is opened
                this.dataChannelsOpen = true;
                // when the data channel becomes available, tell the bridge
                // about video selections so that it can do adaptive simulcast,
                // we want the notification to trigger even if userJid
                // is undefined, or null.
                // XXX why do we not do the same for pinned endpoints?
                try {
                    this.dataChannels.sendSelectedEndpointMessage(
                        this.selectedEndpoint);
                } catch (error) {
                    GlobalOnErrorHandler.callErrorHandler(error);
                    logger.error("Cannot sendSelectedEndpointMessage ",
                        this.selectedEndpoint, ". Error: ", error);
                }

                this.removeListener(RTCEvents.DATA_CHANNEL_OPEN,
                    this._dataChannelOpenListener);
                this._dataChannelOpenListener = null;
            };
            this.addListener(RTCEvents.DATA_CHANNEL_OPEN,
                this._dataChannelOpenListener);
        }
    }

    /**
     * Should be called when current media session ends and after the
     * PeerConnection has been closed using PeerConnection.close() method.
     */
    onCallEnded () {
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
    selectEndpoint (id) {
        // cache the value if channel is missing, till we open it
        this.selectedEndpoint = id;
        if(this.dataChannels && this.dataChannelsOpen)
            this.dataChannels.sendSelectedEndpointMessage(id);
    }

    /**
     * Elects the participant with the given id to be the pinned participant in
     * order to always receive video for this participant (even when last n is
     * enabled).
     * @param id {string} the user id
     * @throws NetworkError or InvalidStateError or Error if the operation fails.
     */
    pinEndpoint (id) {
        if(this.dataChannels) {
            this.dataChannels.sendPinnedEndpointMessage(id);
        } else {
            // FIXME: cache value while there is no data channel created
            // and send the cached state once channel is created
            throw new Error("Data channels support is disabled!");
        }
    }

    static addListener (eventType, listener) {
        RTCUtils.addListener(eventType, listener);
    }

    static removeListener (eventType, listener) {
        RTCUtils.removeListener(eventType, listener);
    }

    static isRTCReady () {
        return RTCUtils.isRTCReady();
    }

    static init (options = {}) {
        this.options = options;
        return RTCUtils.init(this.options);
    }

    static getDeviceAvailability () {
        return RTCUtils.getDeviceAvailability();
    }

    /**
     * Creates new <tt>TraceablePeerConnection</tt>
     * @param {SignallingLayer} signalling the signalling layer that will
     * provide information about the media or participants which is not carried
     * over SDP.
     * @param iceConfig an object describing the ICE config like defined in
     * the WebRTC specification.
     * @param {Object} options the config options
     * @param {boolean} options.disableSimulcast if set to 'true' will disable
     * the simulcast
     * @param {boolean} options.disableRtx if set to 'true' will disable the RTX
     * @param {boolean} options.preferH264 if set to 'true' H264 will be
     * preferred over other video codecs.
     * @param {boolean} options.disableRtx <tt>true</tt> to disable RTX
     * @param {boolean} isP2P indicates whether or not the new TPC will be used
     * in a peer to peer type of session
     * @return {TraceablePeerConnection}
     */
    createPeerConnection (signalling, iceConfig, options, isP2P) {
        const newConnection
            = new TraceablePeerConnection(
                this,
                this.peerConnIdCounter,
                signalling, iceConfig, RTC.getPCConstraints(), options, isP2P);

        this.peerConnections[newConnection.id] = newConnection;
        this.peerConnIdCounter += 1;
        return newConnection;
    }

    /**
     * Removed given peer connection from this RTC module instance.
     * @param {TraceablePeerConnection} traceablePeerConnection
     * @return {boolean} <tt>true</tt> if the given peer connection was removed
     * successfully or <tt>false</tt> if there was no peer connection mapped in
     * this RTC instance.
     */
    _removePeerConnection (traceablePeerConnection) {
        const id = traceablePeerConnection.id;
        if (this.peerConnections[id]) {
            // NOTE Remote tracks are not removed here.
            delete this.peerConnections[id];
            return true;
        } else {
            return false;
        }
    }

    addLocalTrack (track) {
        if (!track)
            throw new Error('track must not be null nor undefined');

        this.localTracks.push(track);

        track.conference = this.conference;
    }

    /**
     * Get local video track.
     * @returns {JitsiLocalTrack|undefined}
     */
    getLocalVideoTrack () {
        const localVideo = this.getLocalTracks(MediaType.VIDEO);
        return localVideo.length ? localVideo[0] : undefined;
    }

    /**
     * Get local audio track.
     * @returns {JitsiLocalTrack|undefined}
     */
    getLocalAudioTrack () {
        const localAudio = this.getLocalTracks(MediaType.AUDIO);
        return localAudio.length ? localAudio[0] : undefined;
    }

    /**
     * Returns the local tracks of the given media type, or all local tracks if
     * no specific type is given.
     * @param {MediaType} [mediaType] optional media type filter
     * (audio or video).
     */
    getLocalTracks (mediaType) {
        let tracks = this.localTracks.slice();
        if (mediaType !== undefined) {
            tracks = tracks.filter(
                (track) => { return track.getType() === mediaType; });
        }
        return tracks;
    }

    /**
     * Runs a callback on each PeerConnection currently stored in the RTC
     * module. If callback return any non-null value during execution
     * the execution loop will be aborted and the result will be returned.
     * @param {function(TraceablePeerConnection)} callback the function to be
     * executed
     * @return {*} any first non-null nor undefined value returned by
     * the callback.
     * @private
     */
    _iteratePeerConnections (callback) {
        return Object.keys(this.peerConnections).find(function (id) {
            const pc = this.peerConnections[id];
            return callback.apply(this, [pc]);
        }, this);
    }

    /**
     * Obtains all remote tracks currently known to this RTC module instance.
     * @param {MediaType} [mediaType] the remote tracks will be filtered
     * by their media type if this argument is specified.
     * @return {Array<JitsiRemoteTrack>}
     */
    getRemoteTracks (mediaType) {
        let remoteTracks = [];
        this._iteratePeerConnections(function (pc) {
            const pcRemoteTracks = pc.getRemoteTracks(undefined, mediaType);
            if (pcRemoteTracks) {
                remoteTracks = remoteTracks.concat(pcRemoteTracks);
            }
        });
        return remoteTracks;
    }

    /**
     * Set mute for all local audio streams attached to the conference.
     * @param value the mute value
     * @returns {Promise}
     */
    setAudioMute (value) {
        const mutePromises = [];
        this.getLocalTracks(MediaType.AUDIO).forEach(function(audioTrack){
            // this is a Promise
            mutePromises.push(value ? audioTrack.mute() : audioTrack.unmute());
        });
        // we return a Promise from all Promises so we can wait for their execution
        return Promise.all(mutePromises);
    }

    removeLocalTrack (track) {
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
    removeRemoteTracks (owner) {
        let removedTracks = [];

        this._iteratePeerConnections(function (pc) {
            const pcRemovedTracks = pc.removeRemoteTracks(owner);
            removedTracks = removedTracks.concat(pcRemovedTracks);
        });

        logger.debug(
            "Removed remote tracks for " + owner
                + " count: " + removedTracks.length);

        return removedTracks;
    }

    static getPCConstraints () {
        return RTCUtils.pc_constraints;
    }

    static attachMediaStream (elSelector, stream) {
        return RTCUtils.attachMediaStream(elSelector, stream);
    }

    static getStreamID (stream) {
        return RTCUtils.getStreamID(stream);
    }

    /**
     * Returns true if retrieving the the list of input devices is supported
     * and false if not.
     */
    static isDeviceListAvailable () {
        return RTCUtils.isDeviceListAvailable();
    }

    /**
     * Returns true if changing the input (camera / microphone) or output
     * (audio) device is supported and false if not.
     * @params {string} [deviceType] - type of device to change. Default is
     *      undefined or 'input', 'output' - for audio output device change.
     * @returns {boolean} true if available, false otherwise.
     */
    static isDeviceChangeAvailable (deviceType) {
        return RTCUtils.isDeviceChangeAvailable(deviceType);
    }

    /**
     * Returns currently used audio output device id, '' stands for default
     * device
     * @returns {string}
     */
    static getAudioOutputDevice () {
        return RTCUtils.getAudioOutputDevice();
    }

    /**
     * Returns list of available media devices if its obtained, otherwise an
     * empty array is returned/
     * @returns {Array} list of available media devices.
     */
    static getCurrentlyAvailableMediaDevices () {
        return RTCUtils.getCurrentlyAvailableMediaDevices();
    }

    /**
     * Returns event data for device to be reported to stats.
     * @returns {MediaDeviceInfo} device.
     */
    static getEventDataForActiveDevice (device) {
        return RTCUtils.getEventDataForActiveDevice(device);
    }

    /**
     * Sets current audio output device.
     * @param {string} deviceId - id of 'audiooutput' device from
     *      navigator.mediaDevices.enumerateDevices()
     * @returns {Promise} - resolves when audio output is changed, is rejected
     *      otherwise
     */
    static setAudioOutputDevice (deviceId) {
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
    static isUserStream (stream) {
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
    static isUserStreamById (streamId) {
        return (streamId && streamId !== "mixedmslabel"
            && streamId !== "default");
    }

    /**
     * Allows to receive list of available cameras/microphones.
     * @param {function} callback would receive array of devices as an argument
     */
    static enumerateDevices (callback) {
        RTCUtils.enumerateDevices(callback);
    }

    /**
     * A method to handle stopping of the stream.
     * One point to handle the differences in various implementations.
     * @param mediaStream MediaStream object to stop.
     */
    static stopMediaStream (mediaStream) {
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
    closeAllDataChannels () {
        if(this.dataChannels) {
            this.dataChannels.closeAllChannels();
            this.dataChannelsOpen = false;
        }
    }

    dispose () { }

    setAudioLevel (ssrc, audioLevel) {
        const track = this._getTrackBySSRC(ssrc);

        if(!track) {
            return;
        }
        if (!track.isAudioTrack()) {
            logger.warn("Received audio level for non-audio track: " + ssrc);
            return;
        }

        track.setAudioLevel(audioLevel);
    }

    /**
     * Searches in localTracks(session stores ssrc for audio and video) and
     * remoteTracks for the ssrc and returns the corresponding resource.
     * @param ssrc the ssrc to check.
     */
    getResourceBySSRC (ssrc) {
        const track = this._getTrackBySSRC(ssrc);
        return track ? track.getParticipantId() : undefined;
    }

    _getTrackBySSRC (ssrc) {
        let track
            = this.getLocalTracks().find(
                (localTrack) => {
                    // It is important that SSRC is not compared with ===,
                    // because the code calling this method is inconsistent
                    // about string vs number types
                    return getValues(this.peerConnections)
                        .find(pc => pc.getLocalSSRC(localTrack) == ssrc);
                });
        if (!track) {
            track = this._getRemoteTrackBySSRC(ssrc);
        }

        return track;
    }

    /**
     * Searches in remoteTracks for the ssrc and returns the corresponding
     * track.
     * @param ssrc the ssrc to check.
     * @return {JitsiRemoteTrack|undefined} return the first remote tracks that
     * matches given SSRC or <tt>undefined</tt> if no such track was found.
     * @private
     */
    _getRemoteTrackBySSRC (ssrc) {
        return this.getRemoteTracks().find(function (remoteTrack) {
            return ssrc == remoteTrack.getSSRC();
        });
    }

    /**
     * Sends message via the datachannels.
     * @param to {string} the id of the endpoint that should receive the
     * message. If "" the message will be sent to all participants.
     * @param payload {object} the payload of the message.
     * @throws NetworkError or InvalidStateError or Error if the operation
     * fails or there is no data channel created
     */
    sendDataChannelMessage (to, payload) {
        if(this.dataChannels) {
            this.dataChannels.sendDataChannelMessage(to, payload);
        } else {
            throw new Error("Data channels support is disabled!");
        }
    }

    /**
     * Selects a new value for "lastN". The requested amount of videos are going
     * to be delivered after the value is in effect. Set to -1 for unlimited or
     * all available videos.
     * @param value {int} the new value for lastN.
     * @trows Error if there is no data channel created.
     */
    setLastN (value) {
        if (this.dataChannels) {
            this.dataChannels.sendSetLastNMessage(value);
        } else {
            throw new Error("Data channels support is disabled!");
        }
    }
}
