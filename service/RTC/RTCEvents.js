var RTCEvents = {
    /**
     * Indicates error while create answer call.
     */
    CREATE_ANSWER_FAILED: 'rtc.create_answer_failed',
    /**
     * Indicates error while create offer call.
     * FIXME not used (yet), but hook up with create offer failure once added
     */
    CREATE_OFFER_FAILED: 'rtc.create_offer_failed',
    RTC_READY: 'rtc.ready',
    /**
     * FIXME: rename to something closer to "local streams SDP changed"
     * Indicates that the local sendrecv streams in local SDP are changed.
     */
    SENDRECV_STREAMS_CHANGED: 'rtc.sendrecv_streams_changed',
    DATA_CHANNEL_OPEN: 'rtc.data_channel_open',
    ENDPOINT_CONN_STATUS_CHANGED: 'rtc.endpoint_conn_status_changed',
    LASTN_CHANGED: 'rtc.lastn_changed',
    DOMINANT_SPEAKER_CHANGED: 'rtc.dominant_speaker_changed',
    LASTN_ENDPOINT_CHANGED: 'rtc.lastn_endpoint_changed',
    AVAILABLE_DEVICES_CHANGED: 'rtc.available_devices_changed',
    TRACK_ATTACHED: 'rtc.track_attached',
    /**
     * Event fired when we remote track is added to the conference.
     * The following structure is passed as an argument:
     * {
     *   stream: the WebRTC MediaStream instance
     *   track: the WebRTC MediaStreamTrack
     *   mediaType: the MediaType instance
     *   owner: the MUC JID of the stream owner
     *   muted: a boolean indicating initial 'muted' status of the track or
      *         'null' if unknown
     **/
    REMOTE_TRACK_ADDED: 'rtc.remote_track_added',
    // FIXME get rid of this event in favour of NO_DATA_FROM_SOURCE event
    // (currently implemented for local tracks only)
    REMOTE_TRACK_MUTE: 'rtc.remote_track_mute',
    /**
     * Indicates that the remote track has been removed from the conference.
     * 1st event argument is the ID of the parent WebRTC stream to which
     * the track being removed belongs to.
     * 2nd event argument is the ID of the removed track.
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
    DEVICE_LIST_AVAILABLE: 'rtc.device_list_available',
    /**
     * Indicates that a message from another participant is received on
     * data channel.
     */
    ENDPOINT_MESSAGE_RECEIVED:
        'rtc.endpoint_message_received'
};

module.exports = RTCEvents;
