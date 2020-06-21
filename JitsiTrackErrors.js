/**
 * The errors for the JitsiTrack objects.
 */

/**
 * An error which indicates that some of requested constraints in
 * getUserMedia call were not satisfied.
 */
export const CONSTRAINT_FAILED = 'gum.constraint_failed';

/**
 * A generic error which indicates an error occurred while selecting
 * a DesktopCapturerSource from the electron app.
 */
export const ELECTRON_DESKTOP_PICKER_ERROR
    = 'gum.electron_desktop_picker_error';

/**
 * An error which indicates a custom desktop picker could not be detected
 * for the electron app.
 */
export const ELECTRON_DESKTOP_PICKER_NOT_FOUND
    = 'gum.electron_desktop_picker_not_found';

/**
 * Generic getUserMedia error.
 */
export const GENERAL = 'gum.general';

/**
 * An error which indicates that requested device was not found.
 */
export const NOT_FOUND = 'gum.not_found';

/**
 * An error which indicates that user denied permission to share requested
 * device.
 */
export const PERMISSION_DENIED = 'gum.permission_denied';

/**
 * Generic error for screensharing failure.
 */
export const SCREENSHARING_GENERIC_ERROR
    = 'gum.screensharing_generic_error';

/**
 * An error which indicates that user canceled screen sharing window
 * selection dialog.
 */
export const SCREENSHARING_USER_CANCELED
    = 'gum.screensharing_user_canceled';

/**
 * An error which indicates that track has been already disposed and cannot
 * be longer used.
 */
export const TRACK_IS_DISPOSED = 'track.track_is_disposed';

/**
 * An error which indicates that track has no MediaStream associated.
 */
export const TRACK_NO_STREAM_FOUND = 'track.no_stream_found';

/**
 * An error which indicates that requested video resolution is not supported
 * by a webcam.
 */
export const UNSUPPORTED_RESOLUTION = 'gum.unsupported_resolution';
