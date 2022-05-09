/**
 * An instance of this class is a wrapper for the CallStats API fabric. A fabric
 * reports one peer connection to the CallStats backend and is allocated with
 * {@link callstats.addNewFabric}. It has a bunch of instance methods for
 * reporting various events. A fabric is considered disposed when
 * {@link CallStats.sendTerminateEvent} is executed.
 *
 * Currently only one backend instance can be created ever and it's done using
 * {@link CallStats.initBackend}. At the time of this writing there is no way to
 * explicitly shutdown the backend, but it's supposed to close it's connection
 * automatically, after all fabrics have been terminated.
 */
declare class CallStats {
    /**
     * A callback passed to {@link callstats.addNewFabric}.
     * @param {string} error 'success' means ok
     * @param {string} msg some more details
     * @private
     */
    private static _addNewFabricCallback;
    /**
     * Callback passed to {@link callstats.initialize} (backend initialization)
     * @param {string} error 'success' means ok
     * @param {String} msg
     * @private
     */
    private static _initCallback;
    /**
     * Empties report queue.
     *
     * @param {CallStats} csInstance - The callstats instance.
     * @private
     */
    private static _emptyReportQueue;
    /**
     * Reports an error to callstats.
     *
     * @param {CallStats} [cs]
     * @param type the type of the error, which will be one of the wrtcFuncNames
     * @param error the error
     * @param pc the peerconnection
     * @private
     */
    private static _reportError;
    /**
     * Reports an error to callstats.
     *
     * @param {CallStats} cs
     * @param event the type of the event, which will be one of the fabricEvent
     * @param eventData additional data to pass to event
     * @private
     */
    private static _reportEvent;
    /**
     * Wraps some of the CallStats API method and logs their calls with
     * arguments on the debug logging level. Also wraps some of the backend
     * methods execution into try catch blocks to not crash the app in case
     * there is a problem with the backend itself.
     * @param {callstats} theBackend
     * @private
     */
    private static _traceAndCatchBackendCalls;
    /**
     * Returns the Set with the currently existing {@link CallStats} instances.
     * Lazily initializes the Set to allow any Set polyfills to be applied.
     * @type {Set<CallStats>}
     */
    static get fabrics(): Set<CallStats>;
    /**
     * Initializes the CallStats backend. Should be called only if
     * {@link CallStats.isBackendInitialized} returns <tt>false</tt>.
     * @param {object} options
     * @param {String} options.callStatsID CallStats credentials - ID
     * @param {String} options.callStatsSecret CallStats credentials - secret
     * @param {string} options.aliasName the <tt>aliasName</tt> part of
     * the <tt>userID</tt> aka endpoint ID, see CallStats docs for more info.
     * @param {string} options.userName the <tt>userName</tt> part of
     * the <tt>userID</tt> aka display name, see CallStats docs for more info.
     * @param {object} options.configParams the set of parameters
     * to enable/disable certain features in the library. See CallStats docs for more info.
     *
     */
    static initBackend(options: {
        callStatsID: string;
        callStatsSecret: string;
        aliasName: string;
        userName: string;
        configParams: object;
    }): boolean;
    /**
     * Checks if the CallStats backend has been created. It does not mean that
     * it has been initialized, but only that the API instance has been
     * allocated successfully.
     * @return {boolean} <tt>true</tt> if backend exists or <tt>false</tt>
     * otherwise
     */
    static isBackendInitialized(): boolean;
    /**
     * Notifies CallStats about active device.
     * @param {{deviceList: {String:String}}} devicesData list of devices with
     * their data
     * @param {CallStats} cs callstats instance related to the event
     */
    static sendActiveDeviceListEvent(devicesData: {
        deviceList: {
            String: string;
        };
    }, cs: CallStats): void;
    /**
     * Notifies CallStats that there is a log we want to report.
     *
     * @param {Error} e error to send or {String} message
     * @param {CallStats} cs callstats instance related to the error (optional)
     */
    static sendApplicationLog(e: Error, cs: CallStats): void;
    /**
     * Sends the given feedback through CallStats.
     *
     * @param {string} conferenceID the conference ID for which the feedback
     * will be reported.
     * @param overall an integer between 1 and 5 indicating the
     * user feedback
     * @param comment detailed feedback from the user.
     */
    static sendFeedback(conferenceID: string, overall: any, comment: any): Promise<any>;
    /**
     * Notifies CallStats that getUserMedia failed.
     *
     * @param {Error} e error to send
     * @param {CallStats} cs callstats instance related to the error (optional)
     */
    static sendGetUserMediaFailed(e: Error, cs: CallStats): void;
    /**
     * Notifies CallStats for mute events
     * @param mute {boolean} true for muted and false for not muted
     * @param type {String} "audio"/"video"
     * @param {CallStats} cs callstats instance related to the event
     */
    static sendMuteEvent(mute: boolean, type: string, cs: CallStats): void;
    /**
     * Creates new CallStats instance that handles all callstats API calls for
     * given {@link TraceablePeerConnection}. Each instance is meant to handle
     * one CallStats fabric added with 'addFabric' API method for the
     * {@link TraceablePeerConnection} instance passed in the constructor.
     * @param {TraceablePeerConnection} tpc
     * @param {Object} options
     * @param {string} options.confID the conference ID that wil be used to
     * report the session.
     * @param {string} [options.remoteUserID='jitsi'] the remote user ID to
     * which given <tt>tpc</tt> is connected.
     */
    constructor(tpc: any, options: {
        confID: string;
        remoteUserID?: string;
    });
    confID: string;
    tpc: any;
    peerconnection: any;
    remoteUserID: string;
    hasFabric: boolean;
    /**
     * Initializes CallStats fabric by calling "addNewFabric" for
     * the peer connection associated with this instance.
     * @return {boolean} true if the call was successful or false otherwise.
     */
    _addNewFabric(): boolean;
    /**
     * Lets CallStats module know where is given SSRC rendered by providing
     * renderer tag ID.
     * If the lib is not initialized yet queue the call for later, when it's
     * ready.
     * @param {number} ssrc the SSRC of the stream
     * @param {boolean} isLocal indicates whether this the stream is local
     * @param {string|null} streamEndpointId if the stream is not local the it
     * needs to contain the stream owner's ID
     * @param {string} usageLabel meaningful usage label of this stream like
     *        'microphone', 'camera' or 'screen'.
     * @param {string} containerId  the id of media 'audio' or 'video' tag which
     *        renders the stream.
     */
    associateStreamWithVideoTag(ssrc: number, isLocal: boolean, streamEndpointId: string | null, usageLabel: string, containerId: string): void;
    /**
     * Notifies CallStats that we are the new dominant speaker in the
     * conference.
     */
    sendDominantSpeakerEvent(): void;
    /**
     * Notifies CallStats that the fabric for the underlying peerconnection was
     * closed and no evens should be reported, after this call.
     */
    sendTerminateEvent(): void;
    /**
     * Notifies CallStats for ice connection failed
     */
    sendIceConnectionFailedEvent(): void;
    /**
     * Notifies CallStats that peer connection failed to create offer.
     *
     * @param {Error} e error to send
     */
    sendCreateOfferFailed(e: Error): void;
    /**
     * Notifies CallStats that peer connection failed to create answer.
     *
     * @param {Error} e error to send
     */
    sendCreateAnswerFailed(e: Error): void;
    /**
     * Sends either resume or hold event for the fabric associated with
     * the underlying peerconnection.
     * @param {boolean} isResume true to resume or false to hold
     */
    sendResumeOrHoldEvent(isResume: boolean): void;
    /**
     * Notifies CallStats for screen sharing events
     * @param {boolean} start true for starting screen sharing and
     * false for not stopping
     * @param {string|null} ssrc - optional ssrc value, used only when
     * starting screen sharing.
     */
    sendScreenSharingEvent(start: boolean, ssrc: string | null): void;
    /**
     * Notifies CallStats that peer connection failed to set local description.
     *
     * @param {Error} e error to send
     */
    sendSetLocalDescFailed(e: Error): void;
    /**
     * Notifies CallStats that peer connection failed to set remote description.
     *
     * @param {Error} e error to send
     */
    sendSetRemoteDescFailed(e: Error): void;
    /**
     * Notifies CallStats that peer connection failed to add ICE candidate.
     *
     * @param {Error} e error to send
     */
    sendAddIceCandidateFailed(e: Error): void;
}
declare namespace CallStats {
    const backend: any;
    const reportsQueue: any[];
    const backendInitialized: boolean;
    const callStatsID: string;
    const callStatsSecret: string;
    const userID: object;
}
export default CallStats;
