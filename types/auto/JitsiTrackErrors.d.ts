/**
 * The errors for the JitsiTrack objects.
 */
export declare enum JitsiTrackErrors {
    /**
     * An error which indicates that some of requested constraints in
     * getUserMedia call were not satisfied.
     */
    CONSTRAINT_FAILED = "gum.constraint_failed",
    /**
     * A generic error which indicates an error occurred while selecting
     * a DesktopCapturerSource from the electron app.
     */
    ELECTRON_DESKTOP_PICKER_ERROR = "gum.electron_desktop_picker_error",
    /**
     * An error which indicates a custom desktop picker could not be detected
     * for the electron app.
     */
    ELECTRON_DESKTOP_PICKER_NOT_FOUND = "gum.electron_desktop_picker_not_found",
    /**
     * Generic getUserMedia error.
     */
    GENERAL = "gum.general",
    /**
     * An error which indicates that requested device was not found.
     */
    NOT_FOUND = "gum.not_found",
    /**
     * An error which indicates that user denied permission to share requested
     * device.
     */
    PERMISSION_DENIED = "gum.permission_denied",
    /**
     * Generic error for screensharing failure.
     */
    SCREENSHARING_GENERIC_ERROR = "gum.screensharing_generic_error",
    /**
     * An error which indicates that user canceled screen sharing window
     * selection dialog.
     */
    SCREENSHARING_USER_CANCELED = "gum.screensharing_user_canceled",
    /**
     * Indicates that the timeout passed to the obtainAudioAndVideoPermissions has expired without GUM resolving.
     */
    TIMEOUT = "gum.timeout",
    /**
     * An error which indicates that track has been already disposed and cannot
     * be longer used.
     */
    TRACK_IS_DISPOSED = "track.track_is_disposed",
    /**
     * An error which indicates that track has no MediaStream associated.
     */
    TRACK_NO_STREAM_FOUND = "track.no_stream_found",
    /**
     * An error which indicates that requested video resolution is not supported
     * by a webcam.
     */
    UNSUPPORTED_RESOLUTION = "gum.unsupported_resolution"
}
export declare const CONSTRAINT_FAILED = JitsiTrackErrors.CONSTRAINT_FAILED;
export declare const ELECTRON_DESKTOP_PICKER_ERROR = JitsiTrackErrors.ELECTRON_DESKTOP_PICKER_ERROR;
export declare const ELECTRON_DESKTOP_PICKER_NOT_FOUND = JitsiTrackErrors.ELECTRON_DESKTOP_PICKER_NOT_FOUND;
export declare const GENERAL = JitsiTrackErrors.GENERAL;
export declare const NOT_FOUND = JitsiTrackErrors.NOT_FOUND;
export declare const PERMISSION_DENIED = JitsiTrackErrors.PERMISSION_DENIED;
export declare const SCREENSHARING_GENERIC_ERROR = JitsiTrackErrors.SCREENSHARING_GENERIC_ERROR;
export declare const SCREENSHARING_USER_CANCELED = JitsiTrackErrors.SCREENSHARING_USER_CANCELED;
export declare const TIMEOUT = JitsiTrackErrors.TIMEOUT;
export declare const TRACK_IS_DISPOSED = JitsiTrackErrors.TRACK_IS_DISPOSED;
export declare const TRACK_NO_STREAM_FOUND = JitsiTrackErrors.TRACK_NO_STREAM_FOUND;
export declare const UNSUPPORTED_RESOLUTION = JitsiTrackErrors.UNSUPPORTED_RESOLUTION;
