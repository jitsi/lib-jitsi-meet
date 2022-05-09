/**
 *
 */
export default class RTC extends Listenable {
    /**
     * Exposes the private helper for converting a WebRTC MediaStream to a
     * JitsiLocalTrack.
     *
     * @param {Array<Object>} tracksInfo
     * @returns {Array<JitsiLocalTrack>}
     */
    static createLocalTracks(tracksInfo: Array<any>): Array<JitsiLocalTrack>;
    /**
     * Creates the local MediaStreams.
     * @param {object} [options] Optional parameters.
     * @param {array} options.devices The devices that will be requested.
     * @param {string} options.resolution Resolution constraints.
     * @param {string} options.cameraDeviceId
     * @param {string} options.micDeviceId
     * @returns {*} Promise object that will receive the new JitsiTracks
     */
    static obtainAudioAndVideoPermissions(options?: {
        devices: any[];
        resolution: string;
        cameraDeviceId: string;
        micDeviceId: string;
    }): any;
    /**
     *
     * @param eventType
     * @param listener
     */
    static addListener(eventType: any, listener: any): void;
    /**
     *
     * @param eventType
     * @param listener
     */
    static removeListener(eventType: any, listener: any): void;
    /**
     *
     * @param options
     */
    static init(options?: {}): void;
    /**
     *
     * @param elSelector
     * @param stream
     */
    static attachMediaStream(elSelector: any, stream: any): any;
    /**
     * Returns the id of the given stream.
     * @param {MediaStream} stream
     */
    static getStreamID(stream: MediaStream): any;
    /**
     * Returns the id of the given track.
     * @param {MediaStreamTrack} track
     */
    static getTrackID(track: MediaStreamTrack): any;
    /**
     * Returns true if retrieving the list of input devices is supported
     * and false if not.
     */
    static isDeviceListAvailable(): boolean;
    /**
     * Returns true if changing the input (camera / microphone) or output
     * (audio) device is supported and false if not.
     * @param {string} [deviceType] Type of device to change. Default is
     *      undefined or 'input', 'output' - for audio output device change.
     * @returns {boolean} true if available, false otherwise.
     */
    static isDeviceChangeAvailable(deviceType?: string): boolean;
    /**
     * Returns whether the current execution environment supports WebRTC (for
     * use within this library).
     *
     * @returns {boolean} {@code true} if WebRTC is supported in the current
     * execution environment (for use within this library); {@code false},
     * otherwise.
     */
    static isWebRtcSupported(): boolean;
    /**
     * Returns currently used audio output device id, '' stands for default
     * device
     * @returns {string}
     */
    static getAudioOutputDevice(): string;
    /**
     * Returns list of available media devices if its obtained, otherwise an
     * empty array is returned/
     * @returns {array} list of available media devices.
     */
    static getCurrentlyAvailableMediaDevices(): any[];
    /**
     * Returns whether available devices have permissions granted
     * @returns {Boolean}
     */
    static arePermissionsGrantedForAvailableDevices(): boolean;
    /**
     * Returns event data for device to be reported to stats.
     * @returns {MediaDeviceInfo} device.
     */
    static getEventDataForActiveDevice(device: any): MediaDeviceInfo;
    /**
     * Sets current audio output device.
     * @param {string} deviceId Id of 'audiooutput' device from
     *      navigator.mediaDevices.enumerateDevices().
     * @returns {Promise} resolves when audio output is changed, is rejected
     *      otherwise
     */
    static setAudioOutputDevice(deviceId: string): Promise<any>;
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
    static isUserStream(stream: MediaStream): boolean;
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
    static isUserStreamById(streamId: string): boolean;
    /**
     * Allows to receive list of available cameras/microphones.
     * @param {function} callback Would receive array of devices as an
     *      argument.
     */
    static enumerateDevices(callback: Function): void;
    /**
     * A method to handle stopping of the stream.
     * One point to handle the differences in various implementations.
     * @param {MediaStream} mediaStream MediaStream object to stop.
     */
    static stopMediaStream(mediaStream: MediaStream): void;
    /**
     * Returns whether the desktop sharing is enabled or not.
     * @returns {boolean}
     */
    static isDesktopSharingEnabled(): boolean;
    /**
     *
     * @param conference
     * @param options
     */
    constructor(conference: any, options?: {});
    conference: any;
    /**
     * A map of active <tt>TraceablePeerConnection</tt>.
     * @type {Map.<number, TraceablePeerConnection>}
     */
    peerConnections: Map<number, TraceablePeerConnection>;
    localTracks: any[];
    options: {};
    _channel: BridgeChannel;
    /**
     * The value specified to the last invocation of setLastN before the
     * channel completed opening. If non-null, the value will be sent
     * through a channel (once) as soon as it opens and will then be
     * discarded.
     * @private
     * @type {number}
     */
    private _lastN;
    /**
     * Defines the last N endpoints list. It can be null or an array once
     * initialised with a channel last N event.
     * @type {Array<string>|null}
     * @private
     */
    private _lastNEndpoints;
    /**
     * Defines the forwarded sources list. It can be null or an array once initialised with a channel forwarded
     * sources event.
     *
     * @type {Array<string>|null}
     * @private
     */
    private _forwardedSources;
    /**
     * The number representing the maximum video height the local client
     * should receive from the bridge.
     *
     * @type {number|undefined}
     * @private
     */
    private _maxFrameHeight;
    /**
     * The endpoint IDs of currently selected participants.
     *
     * @type {Array}
     * @private
     */
    private _selectedEndpoints;
    _lastNChangeListener: any;
    _forwardedSourcesChangeListener: any;
    /**
     * Callback invoked when the list of known audio and video devices has
     * been updated. Attempts to update the known available audio output
     * devices.
     *
     * @private
     * @returns {void}
     */
    private _onDeviceListChanged;
    /**
     * Updates the target audio output device for all remote audio tracks.
     *
     * @param {string} deviceId - The device id of the audio ouput device to
     * use for all remote tracks.
     * @private
     * @returns {void}
     */
    private _updateAudioOutputForAudioTracks;
    /**
     * The default video type assumed by the bridge.
     * @deprecated this will go away with multiple streams support
     * @type {BridgeVideoType}
     * @private
     */
    private _videoType;
    /**
     * Removes any listeners and stored state from this {@code RTC} instance.
     *
     * @returns {void}
     */
    destroy(): void;
    /**
     * Initializes the bridge channel of this instance.
     * At least one of both, peerconnection or wsUrl parameters, must be
     * given.
     * @param {RTCPeerConnection} [peerconnection] WebRTC peer connection
     * instance.
     * @param {string} [wsUrl] WebSocket URL.
     */
    initializeBridgeChannel(peerconnection?: RTCPeerConnection, wsUrl?: string): void;
    _channelOpenListener: () => void;
    /**
     * Receives events when Last N had changed.
     * @param {array} lastNEndpoints The new Last N endpoints.
     * @private
     */
    private _onLastNChanged;
    /**
     * Receives events when forwarded sources had changed.
     *
     * @param {array} forwardedSources The new forwarded sources.
     * @private
     */
    private _onForwardedSourcesChanged;
    /**
     * Should be called when current media session ends and after the
     * PeerConnection has been closed using PeerConnection.close() method.
     */
    onCallEnded(): void;
    /**
     * Sets the capture frame rate to be used for desktop tracks.
     *
     * @param {number} maxFps framerate to be used for desktop track capture.
     */
    setDesktopSharingFrameRate(maxFps: number): void;
    /**
     * Sets the receiver video constraints that determine how bitrate is allocated to each of the video streams
     * requested from the bridge. The constraints are cached and sent through the bridge channel once the channel
     * is established.
     * @param {*} constraints
     */
    setNewReceiverVideoConstraints(constraints: any): void;
    _receiverVideoConstraints: any;
    /**
     * Sets the maximum video size the local participant should receive from
     * remote participants. Will cache the value and send it through the channel
     * once it is created.
     *
     * @param {number} maxFrameHeightPixels the maximum frame height, in pixels,
     * this receiver is willing to receive.
     * @returns {void}
     */
    setReceiverVideoConstraint(maxFrameHeight: any): void;
    /**
     * Sets the video type and availability for the local video source.
     *
     * @param {string} videoType 'camera' for camera, 'desktop' for screenshare and
     * 'none' for when local video source is muted or removed from the peerconnection.
     * @returns {void}
     */
    setVideoType(videoType: string): void;
    /**
     * Sends the track's  video type to the JVB.
     * @param {SourceName} sourceName - the track's source name.
     * @param {BridgeVideoType} videoType - the track's video type.
     */
    sendSourceVideoType(sourceName: any, videoType: {
        CAMERA: string;
        DESKTOP: string;
        DESKTOP_HIGH_FPS: string;
        NONE: string;
    }): void;
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
    selectEndpoints(ids: Array<string>): void;
    /**
     * Creates new <tt>TraceablePeerConnection</tt>
     * @param {SignalingLayer} signaling The signaling layer that will provide information about the media or
     * participants which is not carried over SDP.
     * @param {object} pcConfig The {@code RTCConfiguration} to use for the WebRTC peer connection.
     * @param {boolean} isP2P Indicates whether or not the new TPC will be used in a peer to peer type of session.
     * @param {object} options The config options.
     * @param {boolean} options.enableInsertableStreams - Set to true when the insertable streams constraints is to be
     * enabled on the PeerConnection.
     * @param {boolean} options.disableSimulcast If set to 'true' will disable the simulcast.
     * @param {boolean} options.disableRtx If set to 'true' will disable the RTX.
     * @param {boolean} options.startSilent If set to 'true' no audio will be sent or received.
     * @return {TraceablePeerConnection}
     */
    createPeerConnection(signaling: any, pcConfig: object, isP2P: boolean, options: {
        enableInsertableStreams: boolean;
        disableSimulcast: boolean;
        disableRtx: boolean;
        startSilent: boolean;
    }): TraceablePeerConnection;
    /**
     * Removed given peer connection from this RTC module instance.
     * @param {TraceablePeerConnection} traceablePeerConnection
     * @return {boolean} <tt>true</tt> if the given peer connection was removed
     * successfully or <tt>false</tt> if there was no peer connection mapped in
     * this RTC instance.
     */
    _removePeerConnection(traceablePeerConnection: TraceablePeerConnection): boolean;
    /**
     *
     * @param track
     */
    addLocalTrack(track: any): void;
    /**
     * Get forwarded sources list.
     * @returns {Array<string>|null}
     */
    getForwardedSources(): Array<string> | null;
    /**
     * Get local video track.
     * @returns {JitsiLocalTrack|undefined}
     */
    getLocalVideoTrack(): JitsiLocalTrack | undefined;
    /**
     * Returns all the local video tracks.
     * @returns {Array<JitsiLocalTrack>}
     */
    getLocalVideoTracks(): Array<JitsiLocalTrack>;
    /**
     * Get local audio track.
     * @returns {JitsiLocalTrack|undefined}
     */
    getLocalAudioTrack(): JitsiLocalTrack | undefined;
    /**
     * Returns the endpoint id for the local user.
     * @returns {string}
     */
    getLocalEndpointId(): string;
    /**
     * Returns the local tracks of the given media type, or all local tracks if
     * no specific type is given.
     * @param {MediaType} [mediaType] Optional media type filter.
     * (audio or video).
     */
    getLocalTracks(mediaType?: MediaType): any[];
    /**
     * Obtains all remote tracks currently known to this RTC module instance.
     * @param {MediaType} [mediaType] The remote tracks will be filtered
     *      by their media type if this argument is specified.
     * @return {Array<JitsiRemoteTrack>}
     */
    getRemoteTracks(mediaType?: MediaType): Array<any>;
    /**
     * Set mute for all local audio streams attached to the conference.
     * @param value The mute value.
     * @returns {Promise}
     */
    setAudioMute(value: any): Promise<any>;
    /**
    * Set mute for all local video streams attached to the conference.
    * @param value The mute value.
    * @returns {Promise}
    */
    setVideoMute(value: any): Promise<any>;
    /**
     *
     * @param track
     */
    removeLocalTrack(track: any): void;
    /**
     * Closes the currently opened bridge channel.
     */
    closeBridgeChannel(): void;
    /**
     *
     * @param {TraceablePeerConnection} tpc
     * @param {number} ssrc
     * @param {number} audioLevel
     * @param {boolean} isLocal
     */
    setAudioLevel(tpc: TraceablePeerConnection, ssrc: number, audioLevel: number, isLocal: boolean): void;
    /**
     * Sends message via the bridge channel.
     * @param {string} to The id of the endpoint that should receive the
     *      message. If "" the message will be sent to all participants.
     * @param {object} payload The payload of the message.
     * @throws NetworkError or InvalidStateError or Error if the operation
     * fails or there is no data channel created.
     */
    sendChannelMessage(to: string, payload: object): void;
    /**
     * Sends the local stats via the bridge channel.
     * @param {Object} payload The payload of the message.
     * @throws NetworkError/InvalidStateError/Error if the operation fails or if there is no data channel created.
     */
    sendEndpointStatsMessage(payload: any): void;
    /**
     * Selects a new value for "lastN". The requested amount of videos are going
     * to be delivered after the value is in effect. Set to -1 for unlimited or
     * all available videos.
     * @param {number} value the new value for lastN.
     */
    setLastN(value: number): void;
    /**
     * Indicates if the endpoint id is currently included in the last N.
     * @param {string} id The endpoint id that we check for last N.
     * @returns {boolean} true if the endpoint id is in the last N or if we
     * don't have bridge channel support, otherwise we return false.
     */
    isInLastN(id: string): boolean;
    /**
     * Indicates if the source name is currently included in the forwarded sources.
     *
     * @param {string} sourceName The source name that we check for forwarded sources.
     * @returns {boolean} true if the source name is in the forwarded sources or if we don't have bridge channel
     * support, otherwise we return false.
     */
    isInForwardedSources(sourceName: string): boolean;
}
import Listenable from "../util/Listenable";
import TraceablePeerConnection from "./TraceablePeerConnection";
import BridgeChannel from "./BridgeChannel";
import JitsiLocalTrack from "./JitsiLocalTrack";
import { MediaType } from "../../service/RTC/MediaType";
