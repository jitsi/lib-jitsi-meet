/**
 * Enumeration with the errors for the JitsiTrack objects.
 * @type {{string: string}}
 */
module.exports = {
    /**
     * An error which indicates that track has been already disposed and cannot
     * be longer used.
     */
    TRACK_IS_DISPOSED: "track.track_is_disposed",
    /**
     * An error which indicates that track is currently in progress of muting or
     * unmuting itself.
     */
    TRACK_MUTE_UNMUTE_IN_PROGRESS: "track.mute_unmute_inprogress"
};
