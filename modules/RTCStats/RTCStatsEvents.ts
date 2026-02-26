/**
 * Events emitted by the RTCStats module.
 */
export enum RTCStatsEvents {
    /**
     * Event that indicates that the microphone has been muted or unmuted.
     *
     * @param {boolean} muted - Whether microphone was muted.
     */
    AUDIO_MUTE_CHANGED_EVENT = 'audioMutedChanged',

    /**
     * Event that indicates that the video codec on the sender has changed.
     *
     * @param {object} data - The data.
     * @param {CodecMimeType} data.camera - The codec used for camera source.
     * @param {CodecMimeType} data.screenshare - The codec used for screenshare.
     */
    CODEC_CHANGED_EVENT = 'codecChanged',

    /**
     * Event that indicates that the conference start timestamp has been received from MUC.
     */
    CONFERENCE_START_TIMESTAMP_EVENT = 'conferenceStartTimestamp',

    /**
     * Event that indicates that the current user has become the dominant speaker for the conference.
     */
    DOMINANT_SPEAKER_CHANGED_EVENT = 'dominantSpeakerChanged',

    /**
     * Event that indicates that the encode resolution is being restricted by CPU.
     *
     * @param {boolean} restricted - Whether CPU restriction was detected or removed.
     */
    ENCODER_CPU_RESTRICTED_EVENT = 'cpuRestricted',

    /**
     * Event that indicates that the JVB media session is restarted because of ICE failure.
     */
    JVB_ICE_RESTARTED_EVENT = 'jvbIceRestarted',

    /**
     * Event for logging.
     */
    LOG_EVENT = 'logs',

    /**
     * Event that indicates that a remote video source's media stream has been interrupted.
     */
    REMOTE_SOURCE_INTERRUPTED_EVENT = 'remoteSourceInterrupted',

    /**
     * Event that indicates that a remote video source is suspended by the JVB because of BWE issues.
     */
    REMOTE_SOURCE_SUSPENDED_EVENT = 'remoteSourceSuspended',

    /**
     * Event emitted when any PeerConnection event is triggered.
     *
     * @param {object} event - The PeerConnection event.
     * @param {string} event.type - The event type.
     * @param {object} event.body - Event body.
     * @param {string} event.body.isP2P - PeerConnection type.
     * @param {string} event.body.state - PeerConnection state change which triggered the event.
     */
    RTC_STATS_PC_EVENT = 'rtstats_pc_event',

    /**
     * Event emitted when the websocket connection to the rtcstats server is disconnected.
     */
    RTC_STATS_WC_DISCONNECTED = 'rtcstats_ws_disconnected',

    /**
     * Event that indicates that the screenshare has started or stopped.
     *
     * @param {object} data - The data.
     * @param {boolean} data.muted - Whether screenshare was toggled off or on.
     */
    SCREENSHARE_MUTE_CHANGED_EVENT = 'screenshareToggled',

    /**
     * Event that indicates that the strophe connection has disconnected.
     */
    STROPHE_DISCONNECTED_EVENT = 'stropheDisconnected',

    /**
     * Event that indicates that a strophe error has occurred.
     *
     * @param {object} data - The data.
     */
    STROPHE_ERROR_EVENT = 'strophe.error',

    /**
     * Event that indicates that the strophe connection has been re-established.
     */
    STROPHE_RECONNECTED_EVENT = 'stropheReconnected',

    /**
     * Event that indicates that the camera has been muted or unmuted.
     *
     * @param {boolean} muted - Whether camera was muted.
     */
    VIDEO_MUTE_CHANGED_EVENT = 'videoMutedChanged'
}
