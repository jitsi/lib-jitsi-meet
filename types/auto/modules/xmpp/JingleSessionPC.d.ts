/**
 * @typedef {Object} JingleSessionPCOptions
 * @property {Object} abTesting - A/B testing related options (ask George).
 * @property {boolean} abTesting.enableSuspendVideoTest - enables the suspend
 * video test ?(ask George).
 * @property {boolean} disableH264 - Described in the config.js[1].
 * @property {boolean} disableRtx - Described in the config.js[1].
 * @property {boolean} disableSimulcast - Described in the config.js[1].
 * @property {boolean} enableInsertableStreams - Set to true when the insertable streams constraints is to be enabled
 * on the PeerConnection.
 * @property {boolean} enableLayerSuspension - Described in the config.js[1].
 * @property {boolean} failICE - it's an option used in the tests. Set to
 * <tt>true</tt> to block any real candidates and make the ICE fail.
 * @property {boolean} gatherStats - Described in the config.js[1].
 * @property {object} p2p - Peer to peer related options (FIXME those could be
 * fetched from config.p2p on the upper level).
 * @property {boolean} preferH264 - Described in the config.js[1].
 * @property {Object} testing - Testing and/or experimental options.
 * @property {boolean} webrtcIceUdpDisable - Described in the config.js[1].
 * @property {boolean} webrtcIceTcpDisable - Described in the config.js[1].
 *
 * [1]: https://github.com/jitsi/jitsi-meet/blob/master/config.js
 */
/**
 *
 */
export default class JingleSessionPC extends JingleSession {
    /**
     * Parses 'senders' attribute of the video content.
     * @param {jQuery} jingleContents
     * @return {string|null} one of the values of content "senders" attribute
     * defined by Jingle. If there is no "senders" attribute or if the value is
     * invalid then <tt>null</tt> will be returned.
     * @private
     */
    private static parseVideoSenders;
    /**
     * Parses the video max frame height value out of the 'content-modify' IQ.
     *
     * @param {jQuery} jingleContents - A jQuery selector pointing to the '>jingle' element.
     * @returns {Number|null}
     */
    static parseMaxFrameHeight(jingleContents: any): number | null;
    /**
     * Parses the source-name and max frame height value of the 'content-modify' IQ when source-name signaling
     * is enabled.
     *
     * @param {jQuery} jingleContents - A jQuery selector pointing to the '>jingle' element.
     * @returns {Object|null}
     */
    static parseSourceMaxFrameHeight(jingleContents: any): any | null;
    /**
     * Creates new <tt>JingleSessionPC</tt>
     * @param {string} sid the Jingle Session ID - random string which identifies the session
     * @param {string} localJid our JID
     * @param {string} remoteJid remote peer JID
     * @param {XmppConnection} connection - The XMPP connection instance.
     * @param mediaConstraints the media constraints object passed to createOffer/Answer, as defined
     * by the WebRTC standard
     * @param pcConfig The {@code RTCConfiguration} to use for the WebRTC peer connection.
     * @param {boolean} isP2P indicates whether this instance is meant to be used in a direct, peer to
     * peer connection or <tt>false</tt> if it's a JVB connection.
     * @param {boolean} isInitiator indicates if it will be the side which initiates the session.
     * @constructor
     *
     * @implements {SignalingLayer}
     */
    constructor(sid: string, localJid: string, remoteJid: string, connection: XmppConnection, mediaConstraints: any, pcConfig: any, isP2P: boolean, isInitiator: boolean);
    /**
     * The bridge session's identifier. One Jingle session can during
     * it's lifetime participate in multiple bridge sessions managed by
     * Jicofo. A new bridge session is started whenever Jicofo sends
     * 'session-initiate' or 'transport-replace'.
     *
     * @type {?string}
     * @private
     */
    private _bridgeSessionId;
    /**
     * The oldest SDP passed to {@link notifyMySSRCUpdate} while the XMPP connection was offline that will be
     * used to update Jicofo once the XMPP connection goes back online.
     * @type {SDP|undefined}
     * @private
     */
    private _cachedOldLocalSdp;
    /**
     * The latest SDP passed to {@link notifyMySSRCUpdate} while the XMPP connection was offline that will be
     * used to update Jicofo once the XMPP connection goes back online.
     * @type {SDP|undefined}
     * @private
     */
    private _cachedNewLocalSdp;
    /**
     * Stores result of {@link window.performance.now()} at the time when
     * ICE enters 'checking' state.
     * @type {number|null} null if no value has been stored yet
     * @private
     */
    private _iceCheckingStartedTimestamp;
    /**
     * Stores result of {@link window.performance.now()} at the time when
     * first ICE candidate is spawned by the peerconnection to mark when
     * ICE gathering started. That's, because ICE gathering state changed
     * events are not supported by most of the browsers, so we try something
     * that will work everywhere. It may not be as accurate, but given that
     * 'host' candidate usually comes first, the delay should be minimal.
     * @type {number|null} null if no value has been stored yet
     * @private
     */
    private _gatheringStartedTimestamp;
    /**
     * Local preference for the receive video max frame height.
     *
     * @type {Number|undefined}
     */
    localRecvMaxFrameHeight: number | undefined;
    /**
     * Receiver constraints (max height) set by the application per remote source. Will be used for p2p connection
     * in lieu of localRecvMaxFrameHeight when source-name signaling is enabled.
     *
     * @type {Map<string, number>}
     */
    _sourceReceiverConstraints: Map<string, number>;
    /**
     * Indicates whether or not this session is willing to send/receive
     * video media. When set to <tt>false</tt> the underlying peer
     * connection will disable local video transfer and the remote peer will
     * be will be asked to stop sending video via 'content-modify' IQ
     * (the senders attribute of video contents will be adjusted
     * accordingly). Note that this notification is sent only in P2P
     * session, because Jicofo does not support it yet. Obviously when
     * the value is changed from <tt>false</tt> to <tt>true</tt> another
     * notification will be sent to resume video transfer on the remote
     * side.
     * @type {boolean}
     * @private
     */
    private _localVideoActive;
    /**
     * Indicates whether or not the remote peer has video transfer active.
     * When set to <tt>true</tt> it means that remote peer is neither
     * sending nor willing to receive video. In such case we'll ask
     * our peerconnection to stop sending video by calling
     * {@link TraceablePeerConnection.setVideoTransferActive} with
     * <tt>false</tt>.
     * @type {boolean}
     * @private
     */
    private _remoteVideoActive;
    /**
     * Marks that ICE gathering duration has been reported already. That
     * prevents reporting it again, after eventual 'transport-replace' (JVB
     * conference migration/ICE restart).
     * @type {boolean}
     * @private
     */
    private _gatheringReported;
    lasticecandidate: boolean;
    closed: boolean;
    /**
     * Indicates whether or not this <tt>JingleSessionPC</tt> is used in
     * a peer to peer type of session.
     * @type {boolean} <tt>true</tt> if it's a peer to peer
     * session or <tt>false</tt> if it's a JVB session
     */
    isP2P: boolean;
    /**
     * Remote preference for the receive video max frame height.
     *
     * @type {Number|undefined}
     */
    remoteRecvMaxFrameHeight: number | undefined;
    /**
     * Remote preference for the receive video max frame heights when source-name signaling is enabled.
     *
     * @type {Map<string, number>|undefined}
     */
    remoteSourceMaxFrameHeights: Map<string, number> | undefined;
    /**
     * The queue used to serialize operations done on the peerconnection.
     *
     * @type {AsyncQueue}
     */
    modificationQueue: AsyncQueue;
    /**
     * Flag used to guarantee that the connection established event is
     * triggered just once.
     * @type {boolean}
     */
    wasConnected: boolean;
    /**
     * Keeps track of how long (in ms) it took from ICE start to ICE
     * connect.
     *
     * @type {number}
     */
    establishmentDuration: number;
    _xmppListeners: Function[];
    _removeSenderVideoConstraintsChangeListener: any;
    /**
     * Checks whether or not this session instance is still operational.
     * @private
     * @returns {boolean} {@code true} if operation or {@code false} otherwise.
     */
    private _assertNotEnded;
    failICE: boolean;
    options: JingleSessionPCOptions;
    /**
     * {@code true} if reconnect is in progress.
     * @type {boolean}
     */
    isReconnect: boolean;
    /**
     * Set to {@code true} if the connection was ever stable
     * @type {boolean}
     */
    wasstable: boolean;
    webrtcIceUdpDisable: boolean;
    webrtcIceTcpDisable: boolean;
    usesUnifiedPlan: any;
    peerconnection: any;
    /**
     * Remote preference for receive video max frame height.
     *
     * @returns {Number|undefined}
     */
    getRemoteRecvMaxFrameHeight(): number | undefined;
    /**
     * Remote preference for receive video max frame heights when source-name signaling is enabled.
     *
     * @returns {Map<string, number>|undefined}
     */
    getRemoteSourcesRecvMaxFrameHeight(): Map<string, number> | undefined;
    /**
     * Sends given candidate in Jingle 'transport-info' message.
     * @param {RTCIceCandidate} candidate the WebRTC ICE candidate instance
     * @private
     */
    private sendIceCandidate;
    /**
     * Sends given candidates in Jingle 'transport-info' message.
     * @param {Array<RTCIceCandidate>} candidates an array of the WebRTC ICE
     * candidate instances
     * @private
     */
    private sendIceCandidates;
    /**
     * Sends Jingle 'session-info' message which includes custom Jitsi Meet
     * 'ice-state' element with the text value 'failed' to let Jicofo know
     * that the ICE connection has entered the failed state. It can then
     * choose to re-create JVB channels and send 'transport-replace' to
     * retry the connection.
     */
    sendIceFailedNotification(): void;
    /**
     *
     * @param contents
     */
    readSsrcInfo(contents: any): void;
    /**
     * Makes the underlying TraceablePeerConnection generate new SSRC for
     * the recvonly video stream.
     * @deprecated
     */
    generateRecvonlySsrc(): void;
    /**
     * Returns the video codec configured as the preferred codec on the peerconnection.
     */
    getConfiguredVideoCodec(): any;
    /**
     * Creates an offer and sends Jingle 'session-initiate' to the remote peer.
     * @param {Array<JitsiLocalTrack>} localTracks the local tracks that will be
     * added, before the offer/answer cycle executes (for the local track
     * addition to be an atomic operation together with the offer/answer).
     */
    invite(localTracks?: Array<any>): void;
    /**
     * Sends 'session-initiate' to the remote peer.
     *
     * NOTE this method is synchronous and we're not waiting for the RESULT
     * response which would delay the startup process.
     *
     * @param {string} offerSdp  - The local session description which will be
     * used to generate an offer.
     * @private
     */
    private sendSessionInitiate;
    /**
     * Sets the answer received from the remote peer.
     * @param jingleAnswer
     */
    setAnswer(jingleAnswer: any): void;
    /**
     * This is a setRemoteDescription/setLocalDescription cycle which starts at
     * converting Strophe Jingle IQ into remote offer SDP. Once converted
     * setRemoteDescription, createAnswer and setLocalDescription calls follow.
     * @param jingleOfferAnswerIq jQuery selector pointing to the jingle element
     *        of the offer (or answer) IQ
     * @param success callback called when sRD/sLD cycle finishes successfully.
     * @param failure callback called with an error object as an argument if we
     *        fail at any point during setRD, createAnswer, setLD.
     * @param {Array<JitsiLocalTrack>} [localTracks] the optional list of
     * the local tracks that will be added, before the offer/answer cycle
     * executes (for the local track addition to be an atomic operation together
     * with the offer/answer).
     */
    setOfferAnswerCycle(jingleOfferAnswerIq: any, success: any, failure: any, localTracks?: Array<any>): void;
    /**
     * Updates the codecs on the peerconnection and initiates a renegotiation for the
     * new codec config to take effect.
     *
     * @param {CodecMimeType} preferred the preferred codec.
     * @param {CodecMimeType} disabled the codec that needs to be disabled.
     */
    setVideoCodecs(preferred?: {
        H264: string;
        OPUS: string;
        ULPFEC: string;
        VP8: string;
        VP9: string;
    }, disabled?: {
        H264: string;
        OPUS: string;
        ULPFEC: string;
        VP8: string;
        VP9: string;
    }): void;
    /**
     * Although it states "replace transport" it does accept full Jingle offer
     * which should contain new ICE transport details.
     * @param jingleOfferElem an element Jingle IQ that contains new offer and
     *        transport info.
     * @param success callback called when we succeed to accept new offer.
     * @param failure function(error) called when we fail to accept new offer.
     */
    replaceTransport(jingleOfferElem: any, success: any, failure: any): void;
    /**
     * Sends Jingle 'session-accept' message.
     * @param {function()} success callback called when we receive 'RESULT'
     *        packet for the 'session-accept'
     * @param {function(error)} failure called when we receive an error response
     *        or when the request has timed out.
     * @private
     */
    private sendSessionAccept;
    /**
     * Will send 'content-modify' IQ in order to ask the remote peer to
     * either stop or resume sending video media or to adjust sender's video constraints.
     * @private
     */
    private sendContentModify;
    /**
     * Adjust the preference for max video frame height that the local party is willing to receive. Signals
     * the remote party.
     *
     * @param {Number} maxFrameHeight - the new value to set.
     * @param {Map<string, number>} sourceReceiverConstraints - The receiver constraints per source.
     */
    setReceiverVideoConstraint(maxFrameHeight: number, sourceReceiverConstraints: Map<string, number>): void;
    /**
     * Sends Jingle 'transport-accept' message which is a response to
     * 'transport-replace'.
     * @param localSDP the 'SDP' object with local session description
     * @param success callback called when we receive 'RESULT' packet for
     *        'transport-replace'
     * @param failure function(error) called when we receive an error response
     *        or when the request has timed out.
     * @private
     */
    private sendTransportAccept;
    /**
     * Sends Jingle 'transport-reject' message which is a response to
     * 'transport-replace'.
     * @param success callback called when we receive 'RESULT' packet for
     *        'transport-replace'
     * @param failure function(error) called when we receive an error response
     *        or when the request has timed out.
     *
     * FIXME method should be marked as private, but there's some spaghetti that
     *       needs to be fixed prior doing that
     */
    sendTransportReject(success: any, failure: any): void;
    /**
     * Sets the resolution constraint on the local camera track.
     * @param {number} maxFrameHeight - The user preferred max frame height.
     * @param {string} sourceName - The source name of the track.
     * @returns {Promise} promise that will be resolved when the operation is
     * successful and rejected otherwise.
     */
    setSenderVideoConstraint(maxFrameHeight: number, sourceName?: string): Promise<any>;
    /**
     *
     * @param reasonCondition
     * @param reasonText
     */
    onTerminated(reasonCondition: any, reasonText: any): void;
    /**
     * Handles XMPP connection state changes.
     *
     * @param {XmppConnection.Status} status - The new status.
     */
    onXmppStatusChanged(status: any): void;
    /**
     * Parse the information from the xml sourceAddElem and translate it
     *  into sdp lines
     * @param {jquery xml element} sourceAddElem the source-add
     *  element from jingle
     * @param {SDP object} currentRemoteSdp the current remote
     *  sdp (as of this new source-add)
     * @returns {list} a list of SDP line strings that should
     *  be added to the remote SDP
     */
    _parseSsrcInfoFromSourceAdd(sourceAddElem: any, currentRemoteSdp: any): any;
    /**
     * Handles a Jingle source-add message for this Jingle session.
     * @param elem An array of Jingle "content" elements.
     */
    addRemoteStream(elem: any): void;
    /**
     * Handles a Jingle source-remove message for this Jingle session.
     * @param elem An array of Jingle "content" elements.
     */
    removeRemoteStream(elem: any): void;
    /**
     * Handles the deletion of SSRCs associated with a remote user from the remote description when the user leaves.
     *
     * @param {string} id Endpoint id of the participant that has left the call.
     * @returns {void}
     */
    removeRemoteStreamsOnLeave(id: string): void;
    /**
     * Handles either Jingle 'source-add' or 'source-remove' message for this
     * Jingle session.
     * @param {boolean} isAdd <tt>true</tt> for 'source-add' or <tt>false</tt>
     * otherwise.
     * @param {Array<Element>} elem an array of Jingle "content" elements.
     * @private
     */
    private _addOrRemoveRemoteStream;
    /**
     * Takes in a jingle offer iq, returns the new sdp offer
     * @param {jquery xml element} offerIq the incoming offer
     * @returns {SDP object} the jingle offer translated to SDP
     */
    _processNewJingleOfferIq(offerIq: any): SDP;
    /**
     * Remove the given ssrc lines from the current remote sdp
     * @param {list} removeSsrcInfo a list of SDP line strings that
     *  should be removed from the remote SDP
     * @returns type {SDP Object} the new remote SDP (after removing the lines
     *  in removeSsrcInfo
     */
    _processRemoteRemoveSource(removeSsrcInfo: any): SDP;
    /**
     * Add the given ssrc lines to the current remote sdp
     * @param {list} addSsrcInfo a list of SDP line strings that
     *  should be added to the remote SDP
     * @returns type {SDP Object} the new remote SDP (after removing the lines
     *  in removeSsrcInfo
     */
    _processRemoteAddSource(addSsrcInfo: any): SDP;
    /**
     * Do a new o/a flow using the existing remote description
     * @param {string} [optionalRemoteSdp] optional, raw remote sdp
     *  to use.  If not provided, the remote sdp from the
     *  peerconnection will be used
     * @returns {Promise} promise which resolves when the
     *  o/a flow is complete with no arguments or
     *  rejects with an error {string}
     */
    _renegotiate(optionalRemoteSdp?: string): Promise<any>;
    /**
     * Renegotiate cycle implementation for the responder case.
     * @param {object} remoteDescription the SDP object as defined by the WebRTC
     * which will be used as remote description in the cycle.
     * @private
     */
    private _responderRenegotiate;
    /**
     * Renegotiate cycle implementation for the initiator's case.
     * @param {object} remoteDescription the SDP object as defined by the WebRTC
     * which will be used as remote description in the cycle.
     * @private
     */
    private _initiatorRenegotiate;
    /**
     * Adds a new track to the peerconnection. This method needs to be called only when a secondary JitsiLocalTrack is
     * being added to the peerconnection for the first time.
     *
     * @param {Array<JitsiLocalTrack>} localTracks - Tracks to be added to the peer connection.
     * @returns {Promise<void>} that resolves when the track is successfully added to the peerconnection, rejected
     * otherwise.
     */
    addTracks(localTracks?: Array<any>): Promise<void>;
    /**
     * Replaces <tt>oldTrack</tt> with <tt>newTrack</tt> and performs a single
     * offer/answer cycle after both operations are done. Either
     * <tt>oldTrack</tt> or <tt>newTrack</tt> can be null; replacing a valid
     * <tt>oldTrack</tt> with a null <tt>newTrack</tt> effectively just removes
     * <tt>oldTrack</tt>
     * @param {JitsiLocalTrack|null} oldTrack the current track in use to be
     * replaced
     * @param {JitsiLocalTrack|null} newTrack the new track to use
     * @returns {Promise} which resolves once the replacement is complete
     *  with no arguments or rejects with an error {string}
     */
    replaceTrack(oldTrack: any | null, newTrack: any | null): Promise<any>;
    /**
     * Parse the information from the xml sourceRemoveElem and translate it
     *  into sdp lines
     * @param {jquery xml element} sourceRemoveElem the source-remove
     *  element from jingle
     * @param {SDP object} currentRemoteSdp the current remote
     *  sdp (as of this new source-remove)
     * @returns {list} a list of SDP line strings that should
     *  be removed from the remote SDP
     */
    _parseSsrcInfoFromSourceRemove(sourceRemoveElem: any, currentRemoteSdp: any): any;
    /**
     * Will print an error if there is any difference, between the SSRCs given
     * in the <tt>oldSDP</tt> and the ones currently described in
     * the peerconnection's local description.
     * @param {string} operationName the operation's name which will be printed
     * in the error message.
     * @param {SDP} oldSDP the old local SDP which will be compared with
     * the current one.
     * @return {boolean} <tt>true</tt> if there was any change or <tt>false</tt>
     * otherwise.
     * @private
     */
    private _verifyNoSSRCChanged;
    /**
     * Adds local track back to this session, as part of the unmute operation.
     * @param {JitsiLocalTrack} track
     * @return {Promise} a promise that will resolve once the local track is
     * added back to this session and renegotiation succeeds. Will be rejected
     * with a <tt>string</tt> that provides some error details in case something
     * goes wrong.
     */
    addTrackAsUnmute(track: any): Promise<any>;
    /**
     * Remove local track as part of the mute operation.
     * @param {JitsiLocalTrack} track the local track to be removed
     * @return {Promise} a promise which will be resolved once the local track
     * is removed from this session and the renegotiation is performed.
     * The promise will be rejected with a <tt>string</tt> that the describes
     * the error if anything goes wrong.
     */
    removeTrackAsMute(track: any): Promise<any>;
    /**
     * See {@link addTrackAsUnmute} and {@link removeTrackAsMute}.
     * @param {boolean} isMute <tt>true</tt> for "remove as mute" or
     * <tt>false</tt> for "add as unmute".
     * @param {JitsiLocalTrack} track the track that will be added/removed
     * @private
     */
    private _addRemoveTrackAsMuteUnmute;
    /**
     * Resumes or suspends media transfer over the underlying peer connection.
     * @param {boolean} audioActive <tt>true</tt> to enable audio media
     * transfer or <tt>false</tt> to suspend audio media transmission.
     * @param {boolean} videoActive <tt>true</tt> to enable video media
     * transfer or <tt>false</tt> to suspend video media transmission.
     * @return {Promise} a <tt>Promise</tt> which will resolve once
     * the operation is done. It will be rejected with an error description as
     * a string in case anything goes wrong.
     */
    setMediaTransferActive(audioActive: boolean, videoActive: boolean): Promise<any>;
    /**
     * Will put and execute on the queue a session modify task. Currently it
     * only checks the senders attribute of the video content in order to figure
     * out if the remote peer has video in the inactive state (stored locally
     * in {@link _remoteVideoActive} - see field description for more info).
     * @param {jQuery} jingleContents jQuery selector pointing to the jingle
     * element of the session modify IQ.
     * @see {@link _remoteVideoActive}
     * @see {@link _localVideoActive}
     */
    modifyContents(jingleContents: any): void;
    /**
     * Processes new value of remote video "senders" Jingle attribute and tries
     * to apply it for {@link _remoteVideoActive}.
     * @param {string} remoteVideoSenders the value of "senders" attribute of
     * Jingle video content element advertised by remote peer.
     * @return {boolean} <tt>true</tt> if the change affected state of
     * the underlying peerconnection and renegotiation is required for
     * the changes to take effect.
     * @private
     */
    private _modifyRemoteVideoActive;
    /**
     * Figures out added/removed ssrcs and send update IQs.
     * @param oldSDP SDP object for old description.
     * @param newSDP SDP object for new description.
     */
    notifyMySSRCUpdate(oldSDP: any, newSDP: any): void;
    /**
     * Method returns function(errorResponse) which is a callback to be passed
     * to Strophe connection.sendIQ method. An 'error' structure is created that
     * is passed as 1st argument to given <tt>failureCb</tt>. The format of this
     * structure is as follows:
     * {
     *  code: {XMPP error response code}
     *  reason: {the name of XMPP error reason element or 'timeout' if the
      *          request has timed out within <tt>IQ_TIMEOUT</tt> milliseconds}
     *  source: {request.tree() that provides original request}
     *  session: {this JingleSessionPC.toString()}
     * }
     * @param request Strophe IQ instance which is the request to be dumped into
     *        the error structure
     * @param failureCb function(error) called when error response was returned
     *        or when a timeout has occurred.
     * @returns {function(this:JingleSessionPC)}
     */
    newJingleErrorHandler(request: any, failureCb: any): (this: JingleSessionPC) => any;
    /**
     * Returns the ice connection state for the peer connection.
     * @returns the ice connection state for the peer connection.
     */
    getIceConnectionState(): any;
    /**
     * Closes the peerconnection.
     */
    close(): void;
    /**
     * If the A/B test for suspend video is disabled according to the room's
     * configuration, returns undefined. Otherwise returns a boolean which
     * indicates whether the suspend video option should be enabled or disabled.
     * @param {JingleSessionPCOptions} options - The config options.
     */
    _abtestSuspendVideoEnabled({ abTesting }: JingleSessionPCOptions): boolean;
}
export type JingleSessionPCOptions = {
    /**
     * - A/B testing related options (ask George).
     */
    abTesting: {
        enableSuspendVideoTest: boolean;
    };
    /**
     * - Described in the config.js[1].
     */
    disableH264: boolean;
    /**
     * - Described in the config.js[1].
     */
    disableRtx: boolean;
    /**
     * - Described in the config.js[1].
     */
    disableSimulcast: boolean;
    /**
     * - Set to true when the insertable streams constraints is to be enabled
     * on the PeerConnection.
     */
    enableInsertableStreams: boolean;
    /**
     * - Described in the config.js[1].
     */
    enableLayerSuspension: boolean;
    /**
     * - it's an option used in the tests. Set to
     * <tt>true</tt> to block any real candidates and make the ICE fail.
     */
    failICE: boolean;
    /**
     * - Described in the config.js[1].
     */
    gatherStats: boolean;
    /**
     * - Peer to peer related options (FIXME those could be
     * fetched from config.p2p on the upper level).
     */
    p2p: object;
    /**
     * - Described in the config.js[1].
     */
    preferH264: boolean;
    /**
     * - Testing and/or experimental options.
     */
    testing: any;
    /**
     * - Described in the config.js[1].
     */
    webrtcIceUdpDisable: boolean;
    /**
     * - Described in the config.js[1].
     *
     * [1]: https://github.com/jitsi/jitsi-meet/blob/master/config.js
     */
    webrtcIceTcpDisable: boolean;
};
import JingleSession from "./JingleSession";
import AsyncQueue from "../util/AsyncQueue";
import SDP from "../sdp/SDP";
import XmppConnection from "./XmppConnection";
