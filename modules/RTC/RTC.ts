import { getLogger } from '@jitsi/logger';
import { cloneDeep, isEqual } from 'lodash-es';

import JitsiConference, { IConferenceOptions } from '../../JitsiConference';
import { JitsiConferenceEvents } from '../../JitsiConferenceEvents';
import { BridgeVideoType } from '../../service/RTC/BridgeVideoType';
import { CameraFacingMode } from '../../service/RTC/CameraFacingMode';
import { MediaType } from '../../service/RTC/MediaType';
import { RTCEvents } from '../../service/RTC/RTCEvents';
import SignalingLayer, { SourceName } from '../../service/RTC/SignalingLayer';
import { VideoType } from '../../service/RTC/VideoType';
import browser from '../browser';
import { IReceiverVideoConstraints } from '../qualitycontrol/ReceiveVideoController';
import Listenable from '../util/Listenable';
import { safeCounterIncrement } from '../util/MathUtil';

import BridgeChannel from './BridgeChannel';
import JitsiLocalTrack, { IStreamEffect, ITrackConstraints } from './JitsiLocalTrack';
import JitsiRemoteTrack from './JitsiRemoteTrack';
import RTCUtils from './RTCUtils';
import { IFrameRateConfig } from './ScreenObtainer';
import TraceablePeerConnection, { IAudioQuality, ITPCOptions, IVideoQuality } from './TraceablePeerConnection';

// Extend RTCConfiguration to include the encodedInsertableStreams property
interface IExtendedRTCConfiguration extends RTCConfiguration {
    encodedInsertableStreams?: boolean;
}

const logger = getLogger('modules/RTC/RTC');

/**
 * The counter used to generated id numbers assigned to peer connections
 * @type {number}
 */
let peerConnectionIdCounter: number = 0;

/**
 * The counter used to generate id number for the local
 * <code>MediaStreamTrack</code>s.
 * @type {number}
 */
let rtcTrackIdCounter: number = 0;

/**
 * Interface for media stream metadata used in track creation
 */
export interface IMediaStreamMetaData {
    constraints?: ITrackConstraints;
    effects?: IStreamEffect[];
    sourceId?: string;
    sourceType?: string;
    stream: MediaStream;
    track: MediaStreamTrack;
    videoType?: VideoType;
}

/**
 * Creates {@code JitsiLocalTrack} instances from the passed in meta information
 * about MedieaTracks.
 *
 * @param {IMediaStreamMetaData[]} mediaStreamMetaData - An array of meta information with
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
function _createLocalTracks(mediaStreamMetaData: IMediaStreamMetaData[] = []): JitsiLocalTrack[] {
    return mediaStreamMetaData.map(metaData => {
        const {
            constraints,
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
            constraints: constraints || {},
            deviceId: deviceId || '',
            effects: effects || [],
            facingMode: facingMode as CameraFacingMode,
            mediaType: track.kind as MediaType,
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
 * Interface for RTC options
 */
export interface IRTCOptions {
    audioQuality?: IAudioQuality;
    desktopSharingFrameRate?: IFrameRateConfig;
    disableAEC?: boolean;
    disableAGC?: boolean;
    disableAP?: boolean;
    disableNS?: boolean;
    enableAnalyticsLogging?: boolean;
    mediaDevices?: {
        audio?: MediaTrackConstraints | boolean;
        video?: MediaTrackConstraints | boolean;
    };
    videoQuality?: IVideoQuality;
}

/**
 *
 */
export default class RTC extends Listenable {

    static options: IRTCOptions;

    private _channel: BridgeChannel;
    private _lastN: Optional<number>;
    private _forwardedSources: Nullable<string[]>;
    private _forwardedSourcesChangeListener: (forwardedSources?: string[]) => void;
    private _channelOpenListener?: () => void;
    private _receiverVideoConstraints?: IReceiverVideoConstraints;
    public conference: JitsiConference;
    public peerConnections: Map<number, TraceablePeerConnection>;
    public localTracks: JitsiLocalTrack[];
    public options: IRTCOptions | IConferenceOptions;

    /**
     *
     * @param conference
     * @param options
     */
    constructor(conference: JitsiConference, options: IRTCOptions | IConferenceOptions = {}) {
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
         * Defines the forwarded sources list. It can be null or an array once initialised with a channel forwarded
         * sources event.
         *
         * @type {Array<string>|null}
         * @private
         */
        this._forwardedSources = null;

        // The forwarded sources change listener.
        this._forwardedSourcesChangeListener = this._onForwardedSourcesChanged.bind(this);

        this._onDeviceListChanged = this._onDeviceListChanged.bind(this);
        this._updateAudioOutputForAudioTracks = this._updateAudioOutputForAudioTracks.bind(this);

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
     * Updates the target audio output device for all remote audio tracks.
     *
     * @param {string} deviceId - The device id of the audio ouput device to
     * use for all remote tracks.
     * @private
     * @returns {void}
     */
    private _updateAudioOutputForAudioTracks(deviceId: string): void {
        const remoteAudioTracks = this.getRemoteTracks(MediaType.AUDIO);

        for (const track of remoteAudioTracks) {
            track.setAudioOutput(deviceId);
        }
    }


    /**
     * Callback invoked when the list of known audio and video devices has
     * been updated. Attempts to update the known available audio output
     * devices.
     *
     * @private
     * @returns {void}
     */
    private _onDeviceListChanged(): void {
        this._updateAudioOutputForAudioTracks(RTCUtils.getAudioOutputDevice());
    }

    /**
     * Receives events when forwarded sources had changed.
     *
     * @param {array} forwardedSources The new forwarded sources.
     * @private
     */
    private _onForwardedSourcesChanged(forwardedSources: string[] = []): void {
        const oldForwardedSources = this._forwardedSources || [];
        let leavingForwardedSources: string[] = [];
        let enteringForwardedSources: string[] = [];
        const timestamp = Date.now();

        this._forwardedSources = forwardedSources;

        leavingForwardedSources = oldForwardedSources.filter(sourceName => !this.isInForwardedSources(sourceName));

        enteringForwardedSources = forwardedSources.filter(
            sourceName => oldForwardedSources.indexOf(sourceName) === -1);

        logger.debug(`Forwarded sources changed leaving=${leavingForwardedSources}, entering=`
            + `${enteringForwardedSources} at ${timestamp}`);
        this.conference.eventEmitter.emit(
            JitsiConferenceEvents.FORWARDED_SOURCES_CHANGED,
            leavingForwardedSources,
            enteringForwardedSources,
            timestamp);
    }

    /**
     * Removed given peer connection from this RTC module instance.
     * @param {TraceablePeerConnection} traceablePeerConnection
     * @return {boolean} <tt>true</tt> if the given peer connection was removed
     * successfully or <tt>false</tt> if there was no peer connection mapped in
     * this RTC instance.
     * @internal
     */
    _removePeerConnection(traceablePeerConnection: TraceablePeerConnection): boolean {
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
     * @param options
     */
    public static init(options: IRTCOptions = {}): void {
        this.options = options;

        return RTCUtils.init(this.options);
    }


    /**
     * Exposes the private helper for converting a WebRTC MediaStream to a
     * JitsiLocalTrack.
     *
     * @param {IMediaStreamMetaData[]} tracksInfo
     * @returns {Array<JitsiLocalTrack>}
     */
    public static createLocalTracks(tracksInfo: IMediaStreamMetaData[]): Array<JitsiLocalTrack> {
        return _createLocalTracks(tracksInfo);
    }


    /**
     * Removes any listeners and stored state from this {@code RTC} instance.
     *
     * @returns {void}
     */
    public destroy(): void {
        RTCUtils.removeListener(RTCEvents.AUDIO_OUTPUT_DEVICE_CHANGED, this._updateAudioOutputForAudioTracks);
        RTCUtils.removeListener(RTCEvents.DEVICE_LIST_CHANGED, this._onDeviceListChanged);

        if (this._channelOpenListener) {
            this.removeListener(RTCEvents.DATA_CHANNEL_OPEN, this._channelOpenListener);
        }
    }

    /**
     * Creates the local MediaStreams.
     * @param {object} [options] Optional parameters.
     * @param {Array=} options.devices The devices that will be requested.
     * @param {string=} options.resolution Resolution constraints.
     * @param {string=} options.cameraDeviceId
     * @param {string=} options.micDeviceId
     * @returns {*} Promise object that will receive the new JitsiTracks
     */
    public static obtainAudioAndVideoPermissions(options = {}): Promise<Array<JitsiLocalTrack>> {
        // @ts-ignore import interface from rtcUtils after it get merged
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
    public initializeBridgeChannel(peerconnection: RTCPeerConnection, wsUrl: string): void {
        this._channel = new BridgeChannel(peerconnection, wsUrl, this.eventEmitter, this.conference);

        this._channelOpenListener = () => {
            const logError = (error, msgType, value) => {
                logger.error(`Cannot send ${msgType}(${JSON.stringify(value)}) endpoint message`, error);
            };

            // When the channel becomes available, tell the bridge about video selections so that it can do adaptive
            // simulcast, we want the notification to trigger even if userJid is undefined, or null.
            if (this._receiverVideoConstraints) {
                try {
                    this._channel.sendReceiverVideoConstraintsMessage(this._receiverVideoConstraints);
                } catch (error) {
                    logError(error, 'ReceiverVideoConstraints', this._receiverVideoConstraints);
                }
            }
            if (typeof this._lastN !== 'undefined' && this._lastN !== -1) {
                try {
                    this._channel.sendSetLastNMessage(this._lastN);
                } catch (error) {
                    logError(error, 'LastNChangedEvent', this._lastN);
                }
            }
        };
        this.addListener(RTCEvents.DATA_CHANNEL_OPEN, this._channelOpenListener);

        // Add forwarded sources change listener.
        this.addListener(RTCEvents.FORWARDED_SOURCES_CHANGED, this._forwardedSourcesChangeListener);
    }

    /**
     * Should be called when current media session ends and after the
     * PeerConnection has been closed using PeerConnection.close() method.
     */
    public onCallEnded(): void {
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
     * Sets the capture frame rate to be used for desktop tracks.
     *
     * @param {number} maxFps framerate to be used for desktop track capture.
     */
    public setDesktopSharingFrameRate(maxFps: number): void {
        RTCUtils.setDesktopSharingFrameRate(maxFps);
    }

    /**
     * Sets the receiver video constraints that determine how bitrate is allocated to each of the video streams
     * requested from the bridge. The constraints are cached and sent through the bridge channel once the channel
     * is established.
     * @param {IReceiverVideoConstraints} constraints
     */
    public setReceiverVideoConstraints(constraints: IReceiverVideoConstraints): void {
        if (isEqual(this._receiverVideoConstraints, constraints)) {
            return;
        }

        this._receiverVideoConstraints = cloneDeep(constraints);

        if (this._channel?.isOpen()) {
            this._channel.sendReceiverVideoConstraintsMessage(constraints);
        }
    }

    /**
     * Sends the track's  video type to the JVB.
     * @param {SourceName} sourceName - the track's source name.
     * @param {BridgeVideoType} videoType - the track's video type.
     */
    public sendSourceVideoType(sourceName: SourceName, videoType: BridgeVideoType): void {
        if (this._channel?.isOpen()) {
            this._channel.sendSourceVideoTypeMessage(sourceName, videoType);
        }
    }

    /* eslint-disable max-params */

    /**
     * Creates new <tt>TraceablePeerConnection</tt>
     * @param {SignalingLayer} signaling The signaling layer that will provide information about the media or
     * participants which is not carried over SDP.
     * @param {object} pcConfig The {@code RTCConfiguration} to use for the WebRTC peer connection.
     * @param {boolean} isP2P Indicates whether or not the new TPC will be used in a peer to peer type of session.
     * @param {object} options The config options.
     * @param {Object} options.audioQuality - Quality settings to applied on the outbound audio stream.
     * @param {boolean} options.capScreenshareBitrate if set to true, lower layers will be disabled for screenshare.
     * @param {Array<CodecMimeType>} options.codecSettings - codec settings to be applied for video streams.
     * @param {boolean} options.disableSimulcast if set to 'true' will disable the simulcast.
     * @param {boolean} options.disableRtx if set to 'true' will disable the RTX.
     * @param {boolean} options.enableInsertableStreams set to true when the insertable streams constraints is to be
     * enabled on the PeerConnection.
     * @param {boolean} options.forceTurnRelay If set to true, the browser will generate only Relay ICE candidates.
     * @param {boolean} options.startSilent If set to 'true' no audio will be sent or received.
     * @param {Object} options.videoQuality - Quality settings to applied on the outbound video streams.
     * @return {TraceablePeerConnection}
     */
    public createPeerConnection(signaling: SignalingLayer, pcConfig: IExtendedRTCConfiguration, isP2P: boolean, options: ITPCOptions): TraceablePeerConnection {
        const pcConstraints = {};

        if (options.enableInsertableStreams) {
            logger.debug('E2EE - setting insertable streams constraints');
            pcConfig.encodedInsertableStreams = true;
        }

        if (options.forceTurnRelay) {
            pcConfig.iceTransportPolicy = 'relay';
        }

        // Set the RTCBundlePolicy to max-bundle so that only one set of ice candidates is generated.
        // The default policy generates separate ice candidates for audio and video connections.
        // This change is necessary for Unified plan to work properly on Chrome and Safari.
        pcConfig.bundlePolicy = 'max-bundle';

        peerConnectionIdCounter = safeCounterIncrement(peerConnectionIdCounter);

        const newConnection
            = new TraceablePeerConnection(
                this,
                peerConnectionIdCounter,
                signaling,
                pcConfig, pcConstraints,
                isP2P, options);

        this.peerConnections.set(newConnection.id, newConnection);

        return newConnection;
    }

    /**
     *
     * @param track
     */
    public addLocalTrack(track: JitsiLocalTrack): void {
        if (!track) {
            throw new Error('track must not be null nor undefined');
        }

        this.localTracks.push(track);

        track.conference = this.conference;
    }

    /**
     * Get forwarded sources list.
     * @returns {Nullable<string[]>}
     */
    public getForwardedSources(): Nullable<string[]> {
        return this._forwardedSources;
    }

    /**
     * Get local video track.
     * @returns {Optional<JitsiLocalTrack>}
     */
    public getLocalVideoTrack(): Optional<JitsiLocalTrack> {
        const localVideo = this.getLocalTracks(MediaType.VIDEO);

        return localVideo.length ? localVideo[0] : undefined;
    }

    /**
     * Returns all the local video tracks.
     * @returns {Array<JitsiLocalTrack>}
     */
    public getLocalVideoTracks(): JitsiLocalTrack[] {
        return this.getLocalTracks(MediaType.VIDEO);
    }

    /**
     * Get local audio track.
     * @returns {Optional<JitsiLocalTrack>}
     */
    public getLocalAudioTrack(): Optional<JitsiLocalTrack> {
        const localAudio = this.getLocalTracks(MediaType.AUDIO);

        return localAudio.length ? localAudio[0] : undefined;
    }

    /**
     * Returns the endpoint id for the local user.
     * @returns {string}
     */
    public getLocalEndpointId(): string {
        return this.conference.myUserId();
    }

    /**
     * Returns the local tracks of the given media type, or all local tracks if
     * no specific type is given.
     * @param {MediaType} [mediaType] Optional media type filter.
     * (audio or video).
     */
    public getLocalTracks(mediaType?: MediaType): JitsiLocalTrack[] {
        if (!mediaType) {
            return this.localTracks.slice();
        }

        return this.localTracks.filter(
                track => track.getType() === mediaType);
    }

    /**
     * Obtains all remote tracks currently known to this RTC module instance.
     * @param {MediaType} [mediaType] The remote tracks will be filtered
     *      by their media type if this argument is specified.
     * @return {Array<JitsiRemoteTrack>}
     */
    public getRemoteTracks(mediaType?: MediaType): JitsiRemoteTrack[] {
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
     * @returns {Promise}
     */
    public setAudioMute(): Promise<void[]> {
        const mutePromises = [];

        this.getLocalTracks(MediaType.AUDIO).forEach(audioTrack => {
            mutePromises.push(audioTrack.mute());
        });

        return Promise.all(mutePromises);
    }

    /**
    * Set mute for all local video streams attached to the conference.
    * @returns {Promise}
    */
    public setVideoMute(): Promise<void[]> {
        const mutePromises = [];
        const tracks = this.localTracks.filter(
                track => track.getType() === MediaType.VIDEO
                && track.getVideoType() === VideoType.CAMERA);

        tracks.forEach(track => mutePromises.push(track.mute()));

        return Promise.all(mutePromises);
    }

    /**
    * Set mute for all local desktop video streams attached to the conference.
    * @returns {Promise}
    */
    public setDesktopMute(): Promise<void[]> {
        const mutePromises = [];
        const tracks = this.localTracks.filter(
                track => track.getType() === MediaType.VIDEO
                && track.getVideoType() === VideoType.DESKTOP);

        tracks.forEach(track => mutePromises.push(track.mute()));

        return Promise.all(mutePromises);
    }

    /**
     *
     * @param track
     */
    public removeLocalTrack(track: JitsiLocalTrack): void {
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
    public static attachMediaStream(elSelector: string, stream: MediaStream): void {
        return RTCUtils.attachMediaStream(elSelector, stream);
    }

    /**
     * Returns true if changing the input (camera / microphone) or output
     * (audio) device is supported and false if not.
     * @param {string} [deviceType] Type of device to change. Default is
     *      undefined or 'input', 'output' - for audio output device change.
     * @returns {boolean} true if available, false otherwise.
     */
    public static isDeviceChangeAvailable(deviceType: string): boolean {
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
    public static isWebRtcSupported(): boolean {
        return browser.isSupported();
    }

    /**
     * Returns currently used audio output device id, '' stands for default
     * device
     * @returns {string}
     */
    public static getAudioOutputDevice(): string {
        return RTCUtils.getAudioOutputDevice();
    }

    /**
     * Returns list of available media devices if its obtained, otherwise an
     * empty array is returned/
     * @returns {array} list of available media devices.
     */
    public static getCurrentlyAvailableMediaDevices(): MediaDeviceInfo[] {
        return RTCUtils.getCurrentlyAvailableMediaDevices();
    }

    /**
     * Returns event data for device to be reported to stats.
     * @returns {MediaDeviceInfo} device.
     */
    public static getEventDataForActiveDevice(device: MediaDeviceInfo): MediaDeviceInfo {
        return RTCUtils.getEventDataForActiveDevice(device);
    }

    /**
     * Sets current audio output device.
     * @param {string} deviceId Id of 'audiooutput' device from
     *      navigator.mediaDevices.enumerateDevices().
     * @returns {Promise} resolves when audio output is changed, is rejected
     *      otherwise
     */
    public static setAudioOutputDevice(deviceId: string): Promise<void> {
        return RTCUtils.setAudioOutputDevice(deviceId);
    }

    /**
     * Allows to receive list of available cameras/microphones.
     * @param {function} callback Would receive array of devices as an
     *      argument.
     */
    public static enumerateDevices(callback: (devices: MediaDeviceInfo[]) => void): void {
        RTCUtils.enumerateDevices(callback);
    }

    /**
     * A method to handle stopping of the stream.
     * One point to handle the differences in various implementations.
     * @param {MediaStream} mediaStream MediaStream object to stop.
     */
    public static stopMediaStream(mediaStream: MediaStream): void {
        RTCUtils.stopMediaStream(mediaStream);
    }

    /**
     * Returns whether the desktop sharing is enabled or not.
     * @returns {boolean}
     */
    public static isDesktopSharingEnabled(): boolean {
        return RTCUtils.isDesktopSharingEnabled();
    }

    /**
     * Closes the currently opened bridge channel.
     */
    public closeBridgeChannel(): void {
        if (this._channel) {
            this._channel.close();
            this._channel = null;
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
    public setAudioLevel(tpc: TraceablePeerConnection, ssrc: number, audioLevel: number, isLocal: boolean): void {
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
    public sendChannelMessage(to: string, payload: any): void {
        if (this._channel) {
            this._channel.sendMessage(to, payload);
        } else {
            throw new Error('BridgeChannel has not been initialized yet');
        }
    }

    /**
     * Sends the local stats via the bridge channel.
     * @param {Object} payload The payload of the message.
     * @throws NetworkError/InvalidStateError/Error if the operation fails or if there is no data channel created.
     */
    public sendEndpointStatsMessage(payload: any): void {
        if (this._channel?.isOpen()) {
            this._channel.sendEndpointStatsMessage(payload);
        }
    }

    /**
     * Sends a receiver audio subscription message.
     * @param {*} message
     */
    public sendReceiverAudioSubscriptionMessage(message: any): void {
        if (this._channel?.isOpen()) {
            this._channel.sendReceiverAudioSubscriptionMessage(message);
        }
    }

    /**
     * Selects a new value for "lastN". The requested amount of videos are going
     * to be delivered after the value is in effect. Set to -1 for unlimited or
     * all available videos.
     * @param {number} value the new value for lastN.
     */
    public setLastN(value: number): void {
        if (this._lastN !== value) {
            this._lastN = value;
            if (this._channel?.isOpen()) {
                this._channel.sendSetLastNMessage(value);
            }
            this.eventEmitter.emit(RTCEvents.LASTN_VALUE_CHANGED, value);
        }
    }

    /**
     * Indicates if the source name is currently included in the forwarded sources.
     *
     * @param {string} sourceName The source name that we check for forwarded sources.
     * @returns {boolean} true if the source name is in the forwarded sources or if we don't have bridge channel
     * support, otherwise we return false.
     */
    public isInForwardedSources(sourceName: string): boolean {
        return !this._forwardedSources // forwardedSources not initialised yet.
            || this._forwardedSources.indexOf(sourceName) > -1;
    }

}
