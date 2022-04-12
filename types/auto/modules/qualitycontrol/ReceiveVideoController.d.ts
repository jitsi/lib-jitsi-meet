/**
 * This class manages the receive video contraints for a given {@link JitsiConference}. These constraints are
 * determined by the application based on how the remote video streams need to be displayed. This class is responsible
 * for communicating these constraints to the bridge over the bridge channel.
 */
export default class ReceiveVideoController {
    /**
     * Creates a new instance for a given conference.
     *
     * @param {JitsiConference} conference the conference instance for which the new instance will be managing
     * the receive video quality constraints.
     * @param {RTC} rtc the rtc instance which is responsible for initializing the bridge channel.
     */
    constructor(conference: any, rtc: any);
    _conference: any;
    _rtc: any;
    _lastN: any;
    _maxFrameHeight: number;
    /**
     * The map that holds the max frame height requested for each remote source when source-name signaling is
     * enabled.
     *
     * @type Map<string, number>
     */
    _sourceReceiverConstraints: Map<string, number>;
    _receiverVideoConstraints: ReceiverVideoConstraints;
    _selectedEndpoints: any[];
    /**
     * Returns a map of all the remote source names and the corresponding max frame heights.
     *
     * @param {number} maxFrameHeight
     * @returns
     */
    _getDefaultSourceReceiverConstraints(mediaSession: any, maxFrameHeight: number): Map<any, any>;
    /**
     * Handles the {@link JitsiConferenceEvents.MEDIA_SESSION_STARTED}, that is when the conference creates new media
     * session. The preferred receive frameHeight is applied on the media session.
     *
     * @param {JingleSessionPC} mediaSession - the started media session.
     * @returns {void}
     * @private
     */
    private _onMediaSessionStarted;
    /**
     * Returns the lastN value for the conference.
     *
     * @returns {number}
     */
    getLastN(): number;
    /**
     * Elects the participants with the given ids to be the selected participants in order to always receive video
     * for this participant (even when last n is enabled).
     *
     * @param {Array<string>} ids - The user ids.
     * @returns {void}
     */
    selectEndpoints(ids: Array<string>): void;
    /**
     * Selects a new value for "lastN". The requested amount of videos are going to be delivered after the value is
     * in effect. Set to -1 for unlimited or all available videos.
     *
     * @param {number} value the new value for lastN.
     * @returns {void}
     */
    setLastN(value: number): void;
    /**
     * Sets the maximum video resolution the local participant should receive from remote participants.
     *
     * @param {number|undefined} maxFrameHeight - the new value.
     * @returns {void}
     */
    setPreferredReceiveMaxFrameHeight(maxFrameHeight: number | undefined): void;
    /**
     * Sets the receiver constraints for the conference.
     *
     * @param {Object} constraints The video constraints.
     */
    setReceiverConstraints(constraints: any): void;
}
/**
 * This class translates the legacy signaling format between the client and the bridge (that affects bandwidth
 * allocation) to the new format described here https://github.com/jitsi/jitsi-videobridge/blob/master/doc/allocation.md
 */
declare class ReceiverVideoConstraints {
    _defaultConstraints: {
        maxHeight: number;
    };
    _lastN: number;
    _maxFrameHeight: number;
    _selectedEndpoints: any[];
    _receiverVideoConstraints: {
        constraints: {};
        defaultConstraints: any;
        lastN: number;
        onStageEndpoints: any[];
        selectedEndpoints: any[];
    };
    /**
     * Returns the receiver video constraints that need to be sent on the bridge channel.
     */
    get constraints(): {
        constraints: {};
        defaultConstraints: any;
        lastN: number;
        onStageEndpoints: any[];
        selectedEndpoints: any[];
    };
    /**
     * Updates the lastN field of the ReceiverVideoConstraints sent to the bridge.
     *
     * @param {number} value
     * @returns {boolean} Returns true if the the value has been updated, false otherwise.
     */
    updateLastN(value: number): boolean;
    /**
     * Updates the resolution (height requested) in the contraints field of the ReceiverVideoConstraints
     * sent to the bridge.
     *
     * @param {number} maxFrameHeight
     * @requires {boolean} Returns true if the the value has been updated, false otherwise.
     */
    updateReceiveResolution(maxFrameHeight: number): boolean;
    /**
     * Updates the receiver constraints sent to the bridge.
     *
     * @param {Object} videoConstraints
     * @returns {boolean} Returns true if the the value has been updated, false otherwise.
     */
    updateReceiverVideoConstraints(videoConstraints: any): boolean;
    /**
     * Updates the list of selected endpoints.
     *
     * @param {Array<string>} ids
     * @returns {void}
     */
    updateSelectedEndpoints(ids: Array<string>): void;
}
export {};
