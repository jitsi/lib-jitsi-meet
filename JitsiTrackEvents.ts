export enum JitsiTrackEvents {

    /**
     * The media track was removed to the conference.
     */
    LOCAL_TRACK_STOPPED = 'track.stopped',

    /**
     * Indicates that the local audio track is not receiving any audio input from
     * the microphone that is currently selected.
     */
    NO_AUDIO_INPUT = 'track.no_audio_input',

    /**
     * Indicates that the track is not receiving any data even though we expect it
     * to receive data (i.e. the stream is not stopped).
     */
    NO_DATA_FROM_SOURCE = 'track.no_data_from_source',

    /**
     * Audio levels of a this track was changed.
     * The first argument is a number with audio level value in range [0, 1].
     * The second argument is a <tt>TraceablePeerConnection</tt> which is the peer
     * connection which measured the audio level (one audio track can be added
     * to multiple peer connection at the same time). This argument is optional for
     * local tracks for which we can measure audio level without the peer
     * connection (the value will be <tt>undefined</tt>).
     *
     * NOTE The second argument should be treated as library internal and can be
     * removed at any time.
     */
    TRACK_AUDIO_LEVEL_CHANGED = 'track.audioLevelsChanged',

    /**
     * The audio output of the track was changed.
     */
    TRACK_AUDIO_OUTPUT_CHANGED = 'track.audioOutputChanged',

    /**
     * A media track mute status was changed.
     */
    TRACK_MUTE_CHANGED = 'track.trackMuteChanged',

    /**
     * Indicates that a new owner has been assigned to a remote track when SSRC rewriting is enabled.
     */
    TRACK_OWNER_SET = 'track.owner_set',

    /**
     * Event fired whenever video track's streaming changes.
     * First argument is the sourceName of the track and the second is a string indicating if the connection is
     * currently
     * - active - the connection is active.
     * - inactive - the connection is inactive, was intentionally interrupted by the bridge because of low BWE or
     *   because of the endpoint falling out of last N.
     * - interrupted - a network problem occurred.
     * - restoring - the connection was inactive and is restoring now.
     *
     * The current status value can be obtained by calling JitsiRemoteTrack.getTrackStreamingStatus().
     */
    TRACK_STREAMING_STATUS_CHANGED = 'track.streaming_status_changed',

    /**
     * The video type("camera" or "desktop") of the track was changed.
     */
    TRACK_VIDEOTYPE_CHANGED = 'track.videoTypeChanged'
}
