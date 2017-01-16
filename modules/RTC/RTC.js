/* global */

var logger = require("jitsi-meet-logger").getLogger(__filename);
var RTCEvents = require("../../service/RTC/RTCEvents.js");
import RTCUtils from "./RTCUtils.js";
var JitsiLocalTrack = require("./JitsiLocalTrack.js");
import JitsiTrackError from "../../JitsiTrackError";
import * as JitsiTrackErrors from "../../JitsiTrackErrors";
var DataChannels = require("./DataChannels");
var JitsiRemoteTrack = require("./JitsiRemoteTrack.js");
import * as MediaType from "../../service/RTC/MediaType";
var TraceablePeerConnection = require("./TraceablePeerConnection");
var VideoType = require("../../service/RTC/VideoType");
var GlobalOnErrorHandler = require("../util/GlobalOnErrorHandler");
import Listenable from "../util/Listenable";

function createLocalTracks(tracksInfo, options) {
    var newTracks = [];
    var deviceId = null;
    tracksInfo.forEach(function(trackInfo){
        if (trackInfo.mediaType === MediaType.AUDIO) {
            deviceId = options.micDeviceId;
        } else if (trackInfo.videoType === VideoType.CAMERA){
            deviceId = options.cameraDeviceId;
        }
        var localTrack
            = new JitsiLocalTrack(
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
         * @type {Map.<number, TraceablePeerConnection>}
         */
        this.peerConnections = new Map();
        /**
         * The counter used to generated id numbers assigned to peer connections
         * @type {number}
         */
        this.peerConnectionIdCounter = 1;

        this.localTracks = [];
        //FIXME: We should support multiple streams per jid.
        this.remoteTracks = {};
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
     * @param {SignalingLayer} signaling the signaling layer that will
     * provide information about the media or participants which is not carried
     * over SDP.
     * @param {Object} iceConfig an object describing the ICE config like
     * defined in the WebRTC specification.
     * @param {Object} options the config options
     * @param {boolean} options.disableSimulcast if set to 'true' will disable
     * the simulcast
     * @param {boolean} options.disableRtx if set to 'true' will disable the RTX
     * @param {boolean} options.preferH264 if set to 'true' H264 will be
     * preferred over other video codecs.
     * @return {TraceablePeerConnection}
     */
    createPeerConnection (signaling, iceConfig, options) {
        const newConnection
            = new TraceablePeerConnection(
                this,
                this.peerConnectionIdCounter,
                signaling, iceConfig, RTC.getPCConstraints(), options);

        this.peerConnections.set(newConnection.id, newConnection);
        this.peerConnectionIdCounter += 1;
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
        if (this.peerConnections.has(id)) {
            // NOTE Remote tracks are not removed here.
            this.peerConnections.delete(id);
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
     * Obtains all remote tracks currently known to this RTC module instance.
     * @param {MediaType} [mediaType] the remote tracks will be filtered
     * by their media type if this argument is specified.
     * @return {Array<JitsiRemoteTrack>}
     */
    getRemoteTracks (mediaType) {
        const remoteTracks = [];
        const remoteEndpoints = Object.keys(this.remoteTracks);

        for (const endpoint of remoteEndpoints) {
            const endpointMediaTypes = Object.keys(this.remoteTracks[endpoint]);

            for (const trackMediaType of endpointMediaTypes) {
                // per media type filtering
                if (mediaType && mediaType !== trackMediaType) {
                    continue;
                }

                const mediaTrack = this.remoteTracks[endpoint][trackMediaType];

                if (mediaTrack) {
                    remoteTracks.push(mediaTrack);
                }
            }
        }
        return remoteTracks;
    }

    /**
     * Gets JitsiRemoteTrack for the passed MediaType associated with given MUC
     * nickname (resource part of the JID).
     * @param type audio or video.
     * @param resource the resource part of the MUC JID
     * @returns {JitsiRemoteTrack|null}
     */
    getRemoteTrackByType (type, resource) {
        if (this.remoteTracks[resource])
            return this.remoteTracks[resource][type];
        else
            return null;
    }

    /**
     * Gets JitsiRemoteTrack for AUDIO MediaType associated with given MUC nickname
     * (resource part of the JID).
     * @param resource the resource part of the MUC JID
     * @returns {JitsiRemoteTrack|null}
     */
    getRemoteAudioTrack (resource) {
        return this.getRemoteTrackByType(MediaType.AUDIO, resource);
    }

    /**
     * Gets JitsiRemoteTrack for VIDEO MediaType associated with given MUC nickname
     * (resource part of the JID).
     * @param resource the resource part of the MUC JID
     * @returns {JitsiRemoteTrack|null}
     */
    getRemoteVideoTrack (resource) {
        return this.getRemoteTrackByType(MediaType.VIDEO, resource);
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
     * Initializes a new JitsiRemoteTrack instance with the data provided by
     * the signaling layer and SDP.
     *
     * @param {string} ownerEndpointId
     * @param {MediaStream} stream
     * @param {MediaStreamTrack} track
     * @param {MediaType} mediaType
     * @param {VideoType|undefined} videoType
     * @param {string} ssrc
     * @param {boolean} muted
     */
    _createRemoteTrack (ownerEndpointId,
                        stream, track, mediaType, videoType, ssrc, muted) {
        const remoteTrack
            = new JitsiRemoteTrack(
                this, this.conference, ownerEndpointId, stream, track,
                mediaType, videoType, ssrc, muted);
        const remoteTracks
            = this.remoteTracks[ownerEndpointId]
                || (this.remoteTracks[ownerEndpointId] = {});

        if (remoteTracks[mediaType]) {
            logger.error(
                "Overwriting remote track!", ownerEndpointId, mediaType);
        }
        remoteTracks[mediaType] = remoteTrack;

        this.eventEmitter.emit(RTCEvents.REMOTE_TRACK_ADDED, remoteTrack);
    }

    /**
     * Removes all JitsiRemoteTracks associated with given MUC nickname
     * (resource part of the JID). Returns array of removed tracks.
     *
     * @param {string} owner - The resource part of the MUC JID.
     * @returns {JitsiRemoteTrack[]}
     */
    removeRemoteTracks (owner) {
        const removedTracks = [];

        if (this.remoteTracks[owner]) {
            const removedAudioTrack
                = this.remoteTracks[owner][MediaType.AUDIO];
            const removedVideoTrack
                = this.remoteTracks[owner][MediaType.VIDEO];

            removedAudioTrack && removedTracks.push(removedAudioTrack);
            removedVideoTrack && removedTracks.push(removedVideoTrack);

            delete this.remoteTracks[owner];
        }
        return removedTracks;
    }

    /**
     * Finds remote track by it's stream and track ids.
     * @param {string} streamId the media stream id as defined by the WebRTC
     * @param {string} trackId the media track id as defined by the WebRTC
     * @return {JitsiRemoteTrack|undefined}
     * @private
     */
    _getRemoteTrackById (streamId, trackId) {
        let result = undefined;

        // .find will break the loop once the first match is found
        Object.keys(this.remoteTracks).find((endpoint) => {
            const endpointTracks = this.remoteTracks[endpoint];

            return endpointTracks && Object.keys(endpointTracks).find(
                (mediaType) => {
                    const mediaTrack = endpointTracks[mediaType];

                    if (mediaTrack
                        && mediaTrack.getStreamId() == streamId
                        && mediaTrack.getTrackId() == trackId) {
                        result = mediaTrack;
                        return true;
                    } else {
                        return false;
                    }
                });
        });

        return result;
    }

    /**
     * Removes <tt>JitsiRemoteTrack</tt> identified by given stream and track
     * ids.
     *
     * @param {string} streamId media stream id as defined by the WebRTC
     * @param {string} trackId media track id as defined by the WebRTC
     * @returns {JitsiRemoteTrack|undefined} the track which has been removed or
     * <tt>undefined</tt> if no track matching given stream and track ids was
     * found.
     */
    _removeRemoteTrack (streamId, trackId) {
        const toBeRemoved = this._getRemoteTrackById(streamId, trackId);

        if (toBeRemoved) {
            toBeRemoved.dispose();

            delete this.remoteTracks[
                toBeRemoved.getParticipantId()][toBeRemoved.getType()];

            this.rtc.eventEmitter.emit(
                RTCEvents.REMOTE_TRACK_REMOVED, toBeRemoved);
        }

        return toBeRemoved;
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

    setAudioLevel (resource, audioLevel) {
        if(!resource)
            return;
        var audioTrack = this.getRemoteAudioTrack(resource);
        if(audioTrack) {
            audioTrack.setAudioLevel(audioLevel);
        }
    }

    /**
     * Searches in localTracks(session stores ssrc for audio and video) and
     * remoteTracks for the ssrc and returns the corresponding resource.
     * @param ssrc the ssrc to check.
     */
    getResourceBySSRC (ssrc) {
        if (this.getLocalTracks().find(
                localTrack => { return localTrack.getSSRC() == ssrc; })) {
            return this.conference.myUserId();
        }

        const track = this.getRemoteTrackBySSRC(ssrc);
        return track ? track.getParticipantId() : null;
    }

    /**
     * Searches in remoteTracks for the ssrc and returns the corresponding
     * track.
     * @param ssrc the ssrc to check.
     * @return {JitsiRemoteTrack|undefined} return the first remote track that
     * matches given SSRC or <tt>undefined</tt> if no such track was found.
     */
    getRemoteTrackBySSRC (ssrc) {
        return this.getRemoteTracks().find(function (remoteTrack) {
            return ssrc == remoteTrack.getSSRC();
        });
    }

    /**
     * Handles remote track mute / unmute events.
     * @param type {string} "audio" or "video"
     * @param isMuted {boolean} the new mute state
     * @param from {string} user id
     */
    handleRemoteTrackMute (type, isMuted, from) {
        var track = this.getRemoteTrackByType(type, from);
        if (track) {
            track.setMute(isMuted);
        }
    }

    /**
     * Handles remote track video type events
     * @param value {string} the new video type
     * @param from {string} user id
     */
    handleRemoteTrackVideoTypeChanged (value, from) {
        var videoTrack = this.getRemoteVideoTrack(from);
        if (videoTrack) {
            videoTrack._setVideoType(value);
        }
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
