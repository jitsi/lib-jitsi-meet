/**
 * Enumeration with the errors for the JitsiTrack objects.
 * @type {{string: string}}
 */
module.exports = {
    /**
     * An error which indicates that requested video resolution is not supported
     * by a webcam.
     */
    UNSUPPORTED_RESOLUTION: "gum.unsupported_resolution",
    /**
     * An error which indicates that the jidesha extension for Firefox is
     * needed to proceed with screen sharing, and that it is not installed.
     */
    FIREFOX_EXTENSION_NEEDED: "gum.firefox_extension_needed",
    /**
     * An error which indicates that the jidesha extension for Chrome is
     * failed to install.
     */
    CHROME_EXTENSION_INSTALLATION_ERROR:
        "gum.chrome_extension_installation_error",
    /**
     * An error which indicates that user canceled screen sharing window
     * selection dialog in jidesha extension for Chrome.
     */
    CHROME_EXTENSION_USER_CANCELED:
        "gum.chrome_extension_user_canceled",
    /**
     * Generic error for jidesha extension for Chrome.
     */
    CHROME_EXTENSION_GENERIC_ERROR:
        "gum.chrome_extension_generic_error",
    /**
     * Generic getUserMedia error.
     */
    GENERAL: "gum.general",
    /**
     * An error which indicates that user denied permission to share requested
     * device.
     */
    PERMISSION_DENIED: "gum.permission_denied",
    /**
     * An error which indicates that requested device was not found.
     */
    NOT_FOUND: "gum.not_found",
    /**
     * An error which indicates that some of requested constraints in
     * getUserMedia call were not satisfied.
     */
    CONSTRAINT_FAILED: "gum.constraint_failed",
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
