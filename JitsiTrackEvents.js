var JitsiTrackEvents = {
    /**
     * A media track mute status was changed.
     */
    TRACK_MUTE_CHANGED: "track.trackMuteChanged",
    /**
     * Audio levels of a this track was changed.
     */
    TRACK_AUDIO_LEVEL_CHANGED: "track.audioLevelsChanged",
    /**
     * The media track was removed to the conference.
     */
    LOCAL_TRACK_STOPPED: "track.stopped",
    /**
     * The video type("camera" or "desktop") of the track was changed.
     */
     TRACK_VIDEOTYPE_CHANGED: "track.videoTypeChanged"
};

module.exports = JitsiTrackEvents;
