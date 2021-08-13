/**
 * The class manages send video constraints across media sessions({@link JingleSessionPC}) which belong to
 * {@link JitsiConference}. It finds the lowest common value, between the local user's send preference and
 * the remote party's receive preference. Also this module will consider only the active session's receive value,
 * because local tracks are shared and while JVB may have no preference, the remote p2p may have and they may be totally
 * different.
 */
export class SendVideoController {
    /**
     * Creates new instance for a given conference.
     *
     * @param {JitsiConference} conference - the conference instance for which the new instance will be managing
     * the send video quality constraints.
     * @param {RTC} rtc - the rtc instance that is responsible for sending the messages on the bridge channel.
     */
    constructor(conference: any, rtc: any);
    conference: any;
    layerSuspensionEnabled: any;
    rtc: any;
    _senderVideoConstraints: any;
    /**
     * Handles the {@link JitsiConferenceEvents.MEDIA_SESSION_STARTED}, that is when the conference creates new media
     * session. It doesn't mean it's already active though. For example the JVB connection may be created after
     * the conference has entered the p2p mode already.
     *
     * @param {JingleSessionPC} mediaSession - the started media session.
     * @private
     */
    private _onMediaSessionStarted;
    /**
     * Figures out the send video constraint as specified by {@link selectSendMaxFrameHeight} and sets it on all media
     * sessions for the reasons mentioned in this class description.
     *
     * @returns {Promise<void[]>}
     * @private
     */
    private _propagateSendMaxFrameHeight;
    /**
     * Selects the lowest common value for the local video send constraint by looking at local user's preference and
     * the active media session's receive preference set by the remote party.
     *
     * @returns {number|undefined}
     */
    selectSendMaxFrameHeight(): number | undefined;
    /**
     * Sets local preference for max send video frame height.
     *
     * @param {number} maxFrameHeight - the new value to set.
     * @returns {Promise<void[]>} - resolved when the operation is complete.
     */
    setPreferredSendMaxFrameHeight(maxFrameHeight: number): Promise<void[]>;
    preferredSendMaxFrameHeight: number;
}
