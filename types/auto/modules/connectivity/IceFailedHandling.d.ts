/**
 * This class deals with shenanigans around JVB media session's ICE failed status handling.
 *
 * If ICE restarts are NOT explicitly enabled by the {@code enableIceRestart} config option, then the conference will
 * delay emitting the {@JitsiConferenceErrors.ICE_FAILED} event by 15 seconds. If the network info module reports
 * the internet offline status then the time will start counting after the internet comes back online.
 *
 * If ICE restart are enabled, then a delayed ICE failed notification to Jicofo will be sent, only if the ICE connection
 * does not recover soon after or before the XMPP connection is restored (if it was ever broken). If ICE fails while
 * the XMPP connection is not broken then the notifications will be sent after 2 seconds delay.
 */
export default class IceFailedHandling {
    /**
     * Creates new {@code DelayedIceFailed} task.
     * @param {JitsiConference} conference
     */
    constructor(conference: any);
    _conference: any;
    /**
     * After making sure there's no way for the ICE connection to recover this method either sends ICE failed
     * notification to Jicofo or emits the ice failed conference event.
     * @private
     * @returns {void}
     */
    private _actOnIceFailed;
    /**
     * Starts the task.
     */
    start(): void;
    _iceFailedTimeout: any;
    /**
     * Cancels the task.
     */
    cancel(): void;
    _canceled: boolean;
}
