/**
 * Creates new instance of 'TraceablePeerConnection'.
 *
 * @param {RTC} rtc the instance of <tt>RTC</tt> service
 * @param {number} id the peer connection id assigned by the parent RTC module.
 * @param {SignalingLayer} signalingLayer the signaling layer instance
 * @param {object} pcConfig The {@code RTCConfiguration} to use for the WebRTC peer connection.
 * @param {object} constraints WebRTC 'PeerConnection' constraints
 * @param {boolean} isP2P indicates whether or not the new instance will be used in a peer to peer connection.
 * @param {object} options <tt>TracablePeerConnection</tt> config options.
 * @param {boolean} options.disableSimulcast if set to 'true' will disable the simulcast.
 * @param {boolean} options.disableRtx if set to 'true' will disable the RTX.
 * @param {string} options.disabledCodec the mime type of the code that should not be negotiated on the peerconnection.
 * @param {string} options.preferredCodec the mime type of the codec that needs to be made the preferred codec for the
 * peerconnection.
 * @param {boolean} options.startSilent If set to 'true' no audio will be sent or received.
 * @param {boolean} options.usesUnifiedPlan Indicates if the  browser is running in unified plan mode.
 *
 * FIXME: initially the purpose of TraceablePeerConnection was to be able to
 * debug the peer connection. Since many other responsibilities have been added
 * it would make sense to extract a separate class from it and come up with
 * a more suitable name.
 *
 * @constructor
 */
export default function TraceablePeerConnection(rtc: RTC, id: number, signalingLayer: any, pcConfig: object, constraints: object, isP2P: boolean, options: {
    disableSimulcast: boolean;
    disableRtx: boolean;
    disabledCodec: string;
    preferredCodec: string;
    startSilent: boolean;
    usesUnifiedPlan: boolean;
}): void;
export default class TraceablePeerConnection {
    /**
     * Creates new instance of 'TraceablePeerConnection'.
     *
     * @param {RTC} rtc the instance of <tt>RTC</tt> service
     * @param {number} id the peer connection id assigned by the parent RTC module.
     * @param {SignalingLayer} signalingLayer the signaling layer instance
     * @param {object} pcConfig The {@code RTCConfiguration} to use for the WebRTC peer connection.
     * @param {object} constraints WebRTC 'PeerConnection' constraints
     * @param {boolean} isP2P indicates whether or not the new instance will be used in a peer to peer connection.
     * @param {object} options <tt>TracablePeerConnection</tt> config options.
     * @param {boolean} options.disableSimulcast if set to 'true' will disable the simulcast.
     * @param {boolean} options.disableRtx if set to 'true' will disable the RTX.
     * @param {string} options.disabledCodec the mime type of the code that should not be negotiated on the peerconnection.
     * @param {string} options.preferredCodec the mime type of the codec that needs to be made the preferred codec for the
     * peerconnection.
     * @param {boolean} options.startSilent If set to 'true' no audio will be sent or received.
     * @param {boolean} options.usesUnifiedPlan Indicates if the  browser is running in unified plan mode.
     *
     * FIXME: initially the purpose of TraceablePeerConnection was to be able to
     * debug the peer connection. Since many other responsibilities have been added
     * it would make sense to extract a separate class from it and come up with
     * a more suitable name.
     *
     * @constructor
     */
    constructor(rtc: RTC, id: number, signalingLayer: any, pcConfig: object, constraints: object, isP2P: boolean, options: {
        disableSimulcast: boolean;
        disableRtx: boolean;
        disabledCodec: string;
        preferredCodec: string;
        startSilent: boolean;
        usesUnifiedPlan: boolean;
    });
    /**
     * Indicates whether or not this peer connection instance is actively
     * sending/receiving audio media. When set to <tt>false</tt> the SDP audio
     * media direction will be adjusted to 'inactive' in order to suspend
     * the transmission.
     * @type {boolean}
     * @private
     */
    private audioTransferActive;
    /**
     * The DTMF sender instance used to send DTMF tones.
     *
     * @type {RTCDTMFSender|undefined}
     * @private
     */
    private _dtmfSender;
    /**
     * @typedef {Object} TouchToneRequest
     * @property {string} tones - The DTMF tones string as defined by
     * {@code RTCDTMFSender.insertDTMF}, 'tones' argument.
     * @property {number} duration - The amount of time in milliseconds that
     * each DTMF should last.
     * @property {string} interToneGap - The length of time in miliseconds to
     * wait between tones.
     */
    /**
     * TouchToneRequests which are waiting to be played. This queue is filled
     * if there are touch tones currently being played.
     *
     * @type {Array<TouchToneRequest>}
     * @private
     */
    private _dtmfTonesQueue;
    /**
     * Indicates whether or not this peer connection instance is actively
     * sending/receiving video media. When set to <tt>false</tt> the SDP video
     * media direction will be adjusted to 'inactive' in order to suspend
     * the transmission.
     * @type {boolean}
     * @private
     */
    private videoTransferActive;
    /**
     * The parent instance of RTC service which created this
     * <tt>TracablePeerConnection</tt>.
     * @type {RTC}
     */
    rtc: RTC;
    /**
     * The peer connection identifier assigned by the RTC module.
     * @type {number}
     */
    id: number;
    /**
     * Indicates whether or not this instance is used in a peer to peer
     * connection.
     * @type {boolean}
     */
    isP2P: boolean;
    /**
     * The map holds remote tracks associated with this peer connection. It maps user's JID to media type and a set of
     * remote tracks.
     * @type {Map<string, Map<MediaType, Set<JitsiRemoteTrack>>>}
     */
    remoteTracks: Map<string, Map<MediaType, Set<JitsiRemoteTrack>>>;
    /**
     * A map which stores local tracks mapped by {@link JitsiLocalTrack.rtcId}
     * @type {Map<number, JitsiLocalTrack>}
     */
    localTracks: Map<number, any>;
    /**
     * Keeps tracks of the WebRTC <tt>MediaStream</tt>s that have been added to
     * the underlying WebRTC PeerConnection.
     * @type {Array}
     * @private
     */
    private _addedStreams;
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
    localSSRCs: Map<number, {
        /**
         * an array which holds all track's SSRCs
         */
        ssrcs: Array<number>;
        /**
         * an array stores all track's SSRC
         * groups
         */
        groups: {
            /**
             * the SSRC groups semantics
             */
            semantics: string;
            /**
             * group's SSRCs in order where the first
             * one is group's primary SSRC, the second one is secondary (RTX) and so
             * on...
             */
            ssrcs: Array<number>;
        }[];
    }>;
    /**
     * The local ICE username fragment for this session.
     */
    localUfrag: any;
    /**
     * The remote ICE username fragment for this session.
     */
    remoteUfrag: any;
    /**
     * The DTLS transport object for the PeerConnection.
     * Note: this assume only one shared transport exists because we bundled
     *       all streams on the same underlying transport.
     */
    _dtlsTransport: RTCDtlsTransport;
    /**
     * The signaling layer which operates this peer connection.
     * @type {SignalingLayer}
     */
    signalingLayer: any;
    _peerVideoTypeChanged: any;
    _peerMutedChanged: any;
    options: {
        disableSimulcast: boolean;
        disableRtx: boolean;
        disabledCodec: string;
        preferredCodec: string;
        startSilent: boolean;
        usesUnifiedPlan: boolean;
    };
    peerconnection: RTCPeerConnection;
    tpcUtils: TPCUtils;
    updateLog: any[];
    stats: {};
    statsinterval: number;
    /**
     * Flag used to indicate if simulcast is turned off and a cap of 500 Kbps is applied on screensharing.
     */
    _capScreenshareBitrate: any;
    /**
    * Flag used to indicate if the browser is running in unified  plan mode.
    */
    _usesUnifiedPlan: boolean;
    /**
     * Flag used to indicate if RTCRtpTransceiver#setCodecPreferences is to be used instead of SDP
     * munging for codec selection.
     */
    _usesTransceiverCodecPreferences: boolean;
    /**
     * @type {number} The max number of stats to keep in this.stats. Limit to
     * 300 values, i.e. 5 minutes; set to 0 to disable
     */
    maxstats: number;
    interop: any;
    simulcast: any;
    sdpConsistency: SdpConsistency;
    /**
     * Munges local SDP provided to the Jingle Session in order to prevent from
     * sending SSRC updates on attach/detach and mute/unmute (for video).
     * @type {LocalSdpMunger}
     */
    localSdpMunger: LocalSdpMunger;
    /**
     * TracablePeerConnection uses RTC's eventEmitter
     * @type {EventEmitter}
     */
    eventEmitter: any;
    rtxModifier: RtxModifier;
    /**
     * The height constraint applied on the video sender. The default value is 2160 (4K) when layer suspension is
     * explicitly disabled.
     */
    _senderVideoMaxHeight: number;
    /**
     * The height constraints to be applied on the sender per local video source (source name as the key).
     * @type {Map<string, number>}
     */
    _senderMaxHeights: Map<string, number>;
    trace: (what: any, info: any) => void;
    onicecandidate: any;
    onTrack: (evt: any) => void;
    onsignalingstatechange: any;
    oniceconnectionstatechange: any;
    onnegotiationneeded: any;
    onconnectionstatechange: any;
    ondatachannel: any;
    private _processStat;
    /**
     * Forwards the {@link peerconnection.iceConnectionState} state except that it
     * will convert "completed" into "connected" where both mean that the ICE has
     * succeeded and is up and running. We never see "completed" state for
     * the JVB connection, but it started appearing for the P2P one. This method
     * allows to adapt old logic to this new situation.
     * @return {string}
     */
    getConnectionState(): string;
    private getDesiredMediaDirection;
    /**
     * Returns the list of RTCRtpReceivers created for the source of the given media type associated with
     * the set of remote endpoints specified.
     * @param {Array<string>} endpoints list of the endpoints
     * @param {string} mediaType 'audio' or 'video'
     * @returns {Array<RTCRtpReceiver>} list of receivers created by the peerconnection.
     */
    _getReceiversByEndpointIds(endpoints: Array<string>, mediaType: string): Array<RTCRtpReceiver>;
    /**
     * Tells whether or not this TPC instance is using Simulcast.
     * @return {boolean} <tt>true</tt> if simulcast is enabled and active or
     * <tt>false</tt> if it's turned off.
     */
    isSimulcastOn(): boolean;
    /**
     * Handles remote source mute and unmute changed events.
     *
     * @param {string} sourceName - The name of the remote source.
     * @param {boolean} isMuted - The new mute state.
     */
    _sourceMutedChanged(sourceName: string, isMuted: boolean): void;
    /**
     * Handles remote source videoType changed events.
     *
     * @param {string} sourceName - The name of the remote source.
     * @param {boolean} isMuted - The new value.
     */
    _sourceVideoTypeChanged(sourceName: string, videoType: any): void;
    /**
     * Obtains audio levels of the remote audio tracks by getting the source information on the RTCRtpReceivers.
     * The information relevant to the ssrc is updated each time a RTP packet constaining the ssrc is received.
     * @param {Array<string>} speakerList list of endpoint ids for which audio levels are to be gathered.
     * @returns {Object} containing ssrc and audio level information as a key-value pair.
     */
    getAudioLevels(speakerList?: Array<string>): any;
    /**
     * Obtains local tracks for given {@link MediaType}. If the <tt>mediaType</tt>
     * argument is omitted the list of all local tracks will be returned.
     * @param {MediaType} [mediaType]
     * @return {Array<JitsiLocalTrack>}
     */
    getLocalTracks(mediaType?: MediaType): Array<any>;
    /**
     * Retrieves the local video tracks.
     *
     * @returns {JitsiLocalTrack|undefined} - local video tracks.
     */
    getLocalVideoTracks(): any | undefined;
    /**
     * Checks whether or not this {@link TraceablePeerConnection} instance contains any local tracks for given
     * <tt>mediaType</tt>.
     *
     * @param {MediaType} mediaType - The media type.
     * @return {boolean}
     */
    hasAnyTracksOfType(mediaType: MediaType): boolean;
    /**
     * Obtains all remote tracks currently known to this PeerConnection instance.
     *
     * @param {string} [endpointId] - The track owner's identifier (MUC nickname)
     * @param {MediaType} [mediaType] - The remote tracks will be filtered by their media type if this argument is
     * specified.
     * @return {Array<JitsiRemoteTrack>}
     */
    getRemoteTracks(endpointId?: string, mediaType?: MediaType): Array<JitsiRemoteTrack>;
    /**
     * Parses the remote description and returns the sdp lines of the sources associated with a remote participant.
     *
     * @param {string} id Endpoint id of the remote participant.
     * @returns {Array<string>} The sdp lines that have the ssrc information.
     */
    getRemoteSourceInfoByParticipant(id: string): Array<string>;
    /**
     * Returns the target bitrates configured for the local video source.
     *
     * @returns {Object}
     */
    getTargetVideoBitrates(): any;
    /**
     * Tries to find {@link JitsiTrack} for given SSRC number. It will search both
     * local and remote tracks bound to this instance.
     * @param {number} ssrc
     * @return {JitsiTrack|null}
     */
    getTrackBySSRC(ssrc: number): any | null;
    /**
     * Tries to find SSRC number for given {@link JitsiTrack} id. It will search
     * both local and remote tracks bound to this instance.
     * @param {string} id
     * @return {number|null}
     */
    getSsrcByTrackId(id: string): number | null;
    /**
     * Called when new remote MediaStream is added to the PeerConnection.
     * @param {MediaStream} stream the WebRTC MediaStream for remote participant
     */
    _remoteStreamAdded(stream: MediaStream): void;
    /**
     * Called on "track added" and "stream added" PeerConnection events (because we
     * handle streams on per track basis). Finds the owner and the SSRC for
     * the track and passes that to ChatRoom for further processing.
     * @param {MediaStream} stream the WebRTC MediaStream instance which is
     * the parent of the track
     * @param {MediaStreamTrack} track the WebRTC MediaStreamTrack added for remote
     * participant.
     * @param {RTCRtpTransceiver} transceiver the WebRTC transceiver that is created
     * for the remote participant in unified plan.
     */
    _remoteTrackAdded(stream: MediaStream, track: MediaStreamTrack, transceiver?: RTCRtpTransceiver): void;
    /**
     * Initializes a new JitsiRemoteTrack instance with the data provided by
     * the signaling layer and SDP.
     *
     * @param {string} ownerEndpointId the owner's endpoint ID (MUC nickname)
     * @param {MediaStream} stream the WebRTC stream instance
     * @param {MediaStreamTrack} track the WebRTC track instance
     * @param {MediaType} mediaType the track's type of the media
     * @param {VideoType} [videoType] the track's type of the video (if applicable)
     * @param {number} ssrc the track's main SSRC number
     * @param {boolean} muted the initial muted status
     * @param {String} sourceName the track's source name
     */
    _createRemoteTrack(ownerEndpointId: string, stream: MediaStream, track: MediaStreamTrack, mediaType: MediaType, videoType?: VideoType, ssrc: number, muted: boolean, sourceName: string): void;
    /**
     * Handles remote stream removal.
     * @param stream the WebRTC MediaStream object which is being removed from the
     * PeerConnection
     */
    _remoteStreamRemoved(stream: any): void;
    /**
     * Handles remote media track removal.
     *
     * @param {MediaStream} stream - WebRTC MediaStream instance which is the parent of the track.
     * @param {MediaStreamTrack} track - WebRTC MediaStreamTrack which has been removed from the PeerConnection.
     * @returns {void}
     */
    _remoteTrackRemoved(stream: MediaStream, track: MediaStreamTrack): void;
    /**
     * Removes all JitsiRemoteTracks associated with given MUC nickname (resource part of the JID).
     *
     * @param {string} owner - The resource part of the MUC JID.
     * @returns {JitsiRemoteTrack[]} - The array of removed tracks.
     */
    removeRemoteTracks(owner: string): JitsiRemoteTrack[];
    /**
     * Removes and disposes given <tt>JitsiRemoteTrack</tt> instance. Emits {@link RTCEvents.REMOTE_TRACK_REMOVED}.
     *
     * @param {JitsiRemoteTrack} toBeRemoved - The remote track to be removed.
     * @returns {void}
     */
    _removeRemoteTrack(toBeRemoved: JitsiRemoteTrack): void;
    /**
     * Returns a map with keys msid/mediaType and <tt>TrackSSRCInfo</tt> values.
     * @param {RTCSessionDescription} desc the local description.
     * @return {Map<string,TrackSSRCInfo>}
     */
    _extractSSRCMap(desc: RTCSessionDescription): Map<string, any>;
    /**
     *
     * @param {JitsiLocalTrack} localTrack
     */
    getLocalSSRC(localTrack: any): number;
    /**
     * When doing unified plan simulcast, we'll have a set of ssrcs but no ssrc-groups on Firefox. Unfortunately, Jicofo
     * will complain if it sees ssrcs with matching msids but no ssrc-group, so a ssrc-group line is injected to make
     * Jicofo happy.
     *
     * @param desc A session description object (with 'type' and 'sdp' fields)
     * @return A session description object with its sdp field modified to contain an inject ssrc-group for simulcast.
     */
    _injectSsrcGroupForUnifiedSimulcast(desc: any): any;
    _getSSRC(rtcId: any): {
        /**
         * an array which holds all track's SSRCs
         */
        ssrcs: Array<number>;
        /**
         * an array stores all track's SSRC
         * groups
         */
        groups: {
            /**
             * the SSRC groups semantics
             */
            semantics: string;
            /**
             * group's SSRCs in order where the first
             * one is group's primary SSRC, the second one is secondary (RTX) and so
             * on...
             */
            ssrcs: Array<number>;
        }[];
    };
    private isSharingLowFpsScreen;
    /**
     * Checks if screensharing is in progress.
     *
     * @returns {boolean}  Returns true if a desktop track has been added to the peerconnection, false otherwise.
     */
    _isSharingScreen(): boolean;
    /**
     * Munges the order of the codecs in the SDP passed based on the preference
     * set through config.js settings. All instances of the specified codec are
     * moved up to the top of the list when it is preferred. The specified codec
     * is deleted from the list if the configuration specifies that the codec be
     * disabled.
     * @param {RTCSessionDescription} description that needs to be munged.
     * @returns {RTCSessionDescription} the munged description.
     */
    _mungeCodecOrder(description: RTCSessionDescription): RTCSessionDescription;
    /**
     * Add {@link JitsiLocalTrack} to this TPC.
     * @param {JitsiLocalTrack} track
     * @param {boolean} isInitiator indicates if the endpoint is the offerer.
     * @returns {Promise<void>} - resolved when done.
     */
    addTrack(track: any, isInitiator?: boolean): Promise<void>;
    /**
     * Adds local track as part of the unmute operation.
     * @param {JitsiLocalTrack} track the track to be added as part of the unmute operation.
     *
     * @return {Promise<boolean>} Promise that resolves to true if the underlying PeerConnection's
     * state has changed and renegotiation is required, false if no renegotiation is needed or
     * Promise is rejected when something goes wrong.
     */
    addTrackUnmute(track: any): Promise<boolean>;
    private _addStream;
    /**
     * Removes WebRTC media stream from the underlying PeerConection
     * @param {MediaStream} mediaStream
     */
    _removeStream(mediaStream: MediaStream): void;
    private _assertTrackBelongs;
    /**
     * Returns the codec that is configured on the client as the preferred video codec.
     * This takes into account the current order of codecs in the local description sdp.
     *
     * @returns {CodecMimeType} The codec that is set as the preferred codec to receive
     * video in the local SDP.
     */
    getConfiguredVideoCodec(): {
        H264: string;
        OPUS: string;
        ULPFEC: string;
        VP8: string;
        VP9: string;
    };
    /**
     * Enables or disables simulcast for screenshare based on the frame rate requested for desktop track capture.
     *
     * @param {number} maxFps framerate to be used for desktop track capture.
     */
    setDesktopSharingFrameRate(maxFps: number): void;
    /**
     * Sets the codec preference on the peerconnection. The codec preference goes into effect when
     * the next renegotiation happens.
     *
     * @param {CodecMimeType} preferredCodec the preferred codec.
     * @param {CodecMimeType} disabledCodec the codec that needs to be disabled.
     * @returns {void}
     */
    setVideoCodecs(preferredCodec?: {
        H264: string;
        OPUS: string;
        ULPFEC: string;
        VP8: string;
        VP9: string;
    }, disabledCodec?: {
        H264: string;
        OPUS: string;
        ULPFEC: string;
        VP8: string;
        VP9: string;
    }): void;
    codecPreference: {
        enable: boolean;
        mediaType: MediaType;
        mimeType: {
            H264: string;
            OPUS: string;
            ULPFEC: string;
            VP8: string;
            VP9: string;
        };
    };
    /**
     * Tells if the given WebRTC <tt>MediaStream</tt> has been added to
     * the underlying WebRTC PeerConnection.
     * @param {MediaStream} mediaStream
     * @returns {boolean}
     */
    isMediaStreamInPc(mediaStream: MediaStream): boolean;
    /**
     * Remove local track from this TPC.
     * @param {JitsiLocalTrack} localTrack the track to be removed from this TPC.
     *
     * FIXME It should probably remove a boolean just like {@link removeTrackMute}
     *       The same applies to addTrack.
     */
    removeTrack(localTrack: any): void;
    /**
     * Returns the sender corresponding to the given media type.
     * @param {MEDIA_TYPE} mediaType - The media type 'audio' or 'video' to be used for the search.
     * @returns {RTPSender|undefined} - The found sender or undefined if no sender
     * was found.
     */
    findSenderByKind(mediaType: any): any | undefined;
    /**
     * Returns the receiver corresponding to the given MediaStreamTrack.
     *
     * @param {MediaSreamTrack} track - The media stream track used for the search.
     * @returns {RTCRtpReceiver|undefined} - The found receiver or undefined if no receiver
     * was found.
     */
    findReceiverForTrack(track: any): RTCRtpReceiver | undefined;
    /**
     * Returns the sender corresponding to the given MediaStreamTrack.
     *
     * @param {MediaSreamTrack} track - The media stream track used for the search.
     * @returns {RTCRtpSender|undefined} - The found sender or undefined if no sender
     * was found.
     */
    findSenderForTrack(track: any): RTCRtpSender | undefined;
    /**
     * Replaces <tt>oldTrack</tt> with <tt>newTrack</tt> from the peer connection.
     * Either <tt>oldTrack</tt> or <tt>newTrack</tt> can be null; replacing a valid
     * <tt>oldTrack</tt> with a null <tt>newTrack</tt> effectively just removes
     * <tt>oldTrack</tt>
     *
     * @param {JitsiLocalTrack|null} oldTrack - The current track in use to be replaced on the pc.
     * @param {JitsiLocalTrack|null} newTrack - The new track to be used.
     *
     * @returns {Promise<boolean>} - If the promise resolves with true, renegotiation will be needed.
     * Otherwise no renegotiation is needed.
     */
    replaceTrack(oldTrack: any | null, newTrack: any | null): Promise<boolean>;
    /**
     * Removes local track as part of the mute operation.
     * @param {JitsiLocalTrack} localTrack the local track to be remove as part of
     * the mute operation.
     * @return {Promise<boolean>} Promise that resolves to true if the underlying PeerConnection's
     * state has changed and renegotiation is required, false if no renegotiation is needed or
     * Promise is rejected when something goes wrong.
     */
    removeTrackMute(localTrack: any): Promise<boolean>;
    createDataChannel(label: any, opts: any): RTCDataChannel;
    private _ensureSimulcastGroupIsLast;
    private _adjustLocalMediaDirection;
    private _adjustRemoteMediaDirection;
    /**
     * Munges the stereo flag as well as the opusMaxAverageBitrate in the SDP, based
     * on values set through config.js, if present.
     *
     * @param {RTCSessionDescription} description that needs to be munged.
     * @returns {RTCSessionDescription} the munged description.
     */
    _mungeOpus(description: RTCSessionDescription): RTCSessionDescription;
    /**
     * Sets up the _dtlsTransport object and initializes callbacks for it.
     */
    _initializeDtlsTransport(): void;
    /**
     * Configures the stream encodings depending on the video type and the bitrates configured.
     *
     * @param {JitsiLocalTrack} - The local track for which the sender encodings have to configured.
     * @returns {Promise} promise that will be resolved when the operation is successful and rejected otherwise.
     */
    configureSenderVideoEncodings(localVideoTrack?: any): Promise<any>;
    setLocalDescription(description: any): Promise<any>;
    /**
     * Enables/disables audio media transmission on this peer connection. When
     * disabled the SDP audio media direction in the local SDP will be adjusted to
     * 'inactive' which means that no data will be sent nor accepted, but
     * the connection should be kept alive.
     * @param {boolean} active <tt>true</tt> to enable audio media transmission or
     * <tt>false</tt> to disable. If the value is not a boolean the call will have
     * no effect.
     * @return {boolean} <tt>true</tt> if the value has changed and sRD/sLD cycle
     * needs to be executed in order for the changes to take effect or
     * <tt>false</tt> if the given value was the same as the previous one.
     * @public
     */
    public setAudioTransferActive(active: boolean): boolean;
    setRemoteDescription(description: any): Promise<any>;
    /**
     * Changes the resolution of the video stream that is sent to the peer based on the resolution requested by the peer
     * and user preference, sets the degradation preference on the sender based on the video type, configures the maximum
     * bitrates on the send stream.
     *
     * @param {number} frameHeight - The max frame height to be imposed on the outgoing video stream.
     * @param {JitsiLocalTrack} - The local track for which the sender constraints have to be applied.
     * @returns {Promise} promise that will be resolved when the operation is successful and rejected otherwise.
     */
    setSenderVideoConstraints(frameHeight: number, localVideoTrack: any): Promise<any>;
    encodingsEnabledState: boolean[];
    /**
     * Enables/disables video media transmission on this peer connection. When
     * disabled the SDP video media direction in the local SDP will be adjusted to
     * 'inactive' which means that no data will be sent nor accepted, but
     * the connection should be kept alive.
     * @param {boolean} active <tt>true</tt> to enable video media transmission or
     * <tt>false</tt> to disable. If the value is not a boolean the call will have
     * no effect.
     * @return {boolean} <tt>true</tt> if the value has changed and sRD/sLD cycle
     * needs to be executed in order for the changes to take effect or
     * <tt>false</tt> if the given value was the same as the previous one.
     * @public
     */
    public setVideoTransferActive(active: boolean): boolean;
    /**
     * Sends DTMF tones if possible.
     *
     * @param {string} tones - The DTMF tones string as defined by {@code RTCDTMFSender.insertDTMF}, 'tones' argument.
     * @param {number} duration - The amount of time in milliseconds that each DTMF should last. It's 200ms by default.
     * @param {number} interToneGap - The length of time in miliseconds to wait between tones. It's 200ms by default.
     *
     * @returns {void}
     */
    sendTones(tones: string, duration?: number, interToneGap?: number): void;
    private _onToneChange;
    /**
     * Makes the underlying TraceablePeerConnection generate new SSRC for
     * the recvonly video stream.
     */
    generateRecvonlySsrc(): void;
    /**
     * Makes the underlying TraceablePeerConnection forget the current primary video
     * SSRC.
     */
    clearRecvonlySsrc(): void;
    /**
     * Closes underlying WebRTC PeerConnection instance and removes all remote
     * tracks by emitting {@link RTCEvents.REMOTE_TRACK_REMOVED} for each one of
     * them.
     */
    close(): void;
    createAnswer(constraints: any): Promise<any>;
    createOffer(constraints: any): Promise<any>;
    _createOfferOrAnswer(isOffer: any, constraints: any): Promise<any>;
    /**
     * Extract primary SSRC from given {@link TrackSSRCInfo} object.
     * @param {TrackSSRCInfo} ssrcObj
     * @return {number|null} the primary SSRC or <tt>null</tt>
     */
    _extractPrimarySSRC(ssrcObj: any): number | null;
    private _processLocalSSRCsMap;
    addIceCandidate(candidate: any): Promise<void>;
    /**
     * Returns the number of simulcast streams that are currently enabled on the peerconnection.
     *
     * @returns {number} The number of simulcast streams currently enabled or 1 when simulcast is disabled.
     */
    getActiveSimulcastStreams(): number;
    /**
     * Obtains call-related stats from the peer connection.
     *
     * @returns {Promise<Object>} Promise which resolves with data providing statistics about
     * the peerconnection.
     */
    getStats(): Promise<any>;
    /**
     * Generates and stores new SSRC info object for given local track.
     * The method should be called only for a video track being added to this TPC
     * in the muted state (given that the current browser uses this strategy).
     * @param {JitsiLocalTrack} track
     * @return {TPCSSRCInfo}
     */
    generateNewStreamSSRCInfo(track: any): {
        /**
         * an array which holds all track's SSRCs
         */
        ssrcs: Array<number>;
        /**
         * an array stores all track's SSRC
         * groups
         */
        groups: {
            /**
             * the SSRC groups semantics
             */
            semantics: string;
            /**
             * group's SSRCs in order where the first
             * one is group's primary SSRC, the second one is secondary (RTX) and so
             * on...
             */
            ssrcs: Array<number>;
        }[];
    };
    /**
     * Returns if the peer connection uses Unified plan implementation.
     *
     * @returns {boolean} True if the pc uses Unified plan, false otherwise.
     */
    usesUnifiedPlan(): boolean;
    /**
     * Creates a text representation of this <tt>TraceablePeerConnection</tt>
     * instance.
     * @return {string}
     */
    toString(): string;
}
import RTC from "./RTC";
import { MediaType } from "../../service/RTC/MediaType";
import JitsiRemoteTrack from "./JitsiRemoteTrack";
import { TPCUtils } from "./TPCUtils";
import SdpConsistency from "../sdp/SdpConsistency";
import LocalSdpMunger from "../sdp/LocalSdpMunger";
import RtxModifier from "../sdp/RtxModifier";
import { VideoType } from "../../service/RTC/VideoType";
