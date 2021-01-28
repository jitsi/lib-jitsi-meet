const RTCEvents = {
    /**
     * Indicates error while create answer call.
     */
    CREATE_ANSWER_FAILED: 'rtc.create_answer_failed',

    /**
     * Indicates error while create offer call.
     */
    CREATE_OFFER_FAILED: 'rtc.create_offer_failed',
    DATA_CHANNEL_OPEN: 'rtc.data_channel_open',
    ENDPOINT_CONN_STATUS_CHANGED: 'rtc.endpoint_conn_status_changed',
    DOMINANT_SPEAKER_CHANGED: 'rtc.dominant_speaker_changed',
    LASTN_ENDPOINT_CHANGED: 'rtc.lastn_endpoint_changed',

    /**
     * Event emitted when the user granted/blocked a permission for the camera / mic.
     * Used to keep track of the granted permissions on browsers which don't
     * support the Permissions API.
     */
    PERMISSIONS_CHANGED: 'rtc.permissions_changed',

    SENDER_VIDEO_CONSTRAINTS_CHANGED: 'rtc.sender_video_constraints_changed',

    /**
     * Event emitted when {@link RTC.setLastN} method is called to update with
     * the new value set.
     * The first argument is the value passed to {@link RTC.setLastN}.
     */
    LASTN_VALUE_CHANGED: 'rtc.lastn_value_changed',

    /**
     * Event emitted when ssrc for a local track is extracted and stored
     * in {@link TraceablePeerConnection}.
     * @param {JitsiLocalTrack} track which ssrc was updated
     * @param {string} ssrc that was stored
     */
    LOCAL_TRACK_SSRC_UPDATED: 'rtc.local_track_ssrc_updated',

    /**
     * The max enabled resolution of a local video track was changed.
     */
    LOCAL_TRACK_MAX_ENABLED_RESOLUTION_CHANGED: 'rtc.local_track_max_enabled_resolution_changed',

    TRACK_ATTACHED: 'rtc.track_attached',

    /**
     * Event fired when we remote track is added to the conference.
     * 1st event argument is the added <tt>JitsiRemoteTrack</tt> instance.
     **/
    REMOTE_TRACK_ADDED: 'rtc.remote_track_added',

    // FIXME get rid of this event in favour of NO_DATA_FROM_SOURCE event
    // (currently implemented for local tracks only)
    REMOTE_TRACK_MUTE: 'rtc.remote_track_mute',

    /**
     * Indicates that the remote track has been removed from the conference.
     * 1st event argument is the removed {@link JitsiRemoteTrack} instance.
     */
    REMOTE_TRACK_REMOVED: 'rtc.remote_track_removed',

    // FIXME get rid of this event in favour of NO_DATA_FROM_SOURCE event
    // (currently implemented for local tracks only)
    REMOTE_TRACK_UNMUTE: 'rtc.remote_track_unmute',

    /**
     * Indicates error while set local description.
     */
    SET_LOCAL_DESCRIPTION_FAILED: 'rtc.set_local_description_failed',

    /**
     * Indicates error while set remote description.
     */
    SET_REMOTE_DESCRIPTION_FAILED: 'rtc.set_remote_description_failed',
    AUDIO_OUTPUT_DEVICE_CHANGED: 'rtc.audio_output_device_changed',
    DEVICE_LIST_CHANGED: 'rtc.device_list_changed',

    /**
     * Indicates that the list with available devices will change.
     */
    DEVICE_LIST_WILL_CHANGE: 'rtc.device_list_will_change',
    DEVICE_LIST_AVAILABLE: 'rtc.device_list_available',

    /**
     * Indicates that a message from another participant is received on
     * data channel.
     */
    ENDPOINT_MESSAGE_RECEIVED: 'rtc.endpoint_message_received',

    /**
     * Designates an event indicating that the local ICE username fragment of
     * the jingle session has changed.
     * The first argument of the vent is <tt>TraceablePeerConnection</tt> which
     * is the source of the event.
     * The second argument is the actual "ufrag" string.
     */
    LOCAL_UFRAG_CHANGED: 'rtc.local_ufrag_changed',

    /**
     * Designates an event indicating that the local ICE username fragment of
     * the jingle session has changed.
     * The first argument of the vent is <tt>TraceablePeerConnection</tt> which
     * is the source of the event.
     * The second argument is the actual "ufrag" string.
     */
    REMOTE_UFRAG_CHANGED: 'rtc.remote_ufrag_changed'
};

module.exports = RTCEvents;
