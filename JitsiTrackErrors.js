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
 * Indicates that the timeout passed to the obtainAudioAndVideoPermissions has expired without GUM resolving.
 */
export const TIMEOUT = 'gum.timeout';

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

/**
 * A map which links errors to appropriate messages.
 */
export const TRACK_ERROR_TO_MESSAGE_MAP = {};

TRACK_ERROR_TO_MESSAGE_MAP[UNSUPPORTED_RESOLUTION]
    = 'Video resolution is not supported: ';
TRACK_ERROR_TO_MESSAGE_MAP[SCREENSHARING_USER_CANCELED]
    = 'User canceled screen sharing prompt';
TRACK_ERROR_TO_MESSAGE_MAP[SCREENSHARING_GENERIC_ERROR]
    = 'Unknown error from screensharing';
TRACK_ERROR_TO_MESSAGE_MAP[ELECTRON_DESKTOP_PICKER_ERROR]
    = 'Unkown error from desktop picker';
TRACK_ERROR_TO_MESSAGE_MAP[ELECTRON_DESKTOP_PICKER_NOT_FOUND]
    = 'Failed to detect desktop picker';
TRACK_ERROR_TO_MESSAGE_MAP[GENERAL]
    = 'Generic getUserMedia error';
TRACK_ERROR_TO_MESSAGE_MAP[PERMISSION_DENIED]
    = 'User denied permission to use device(s): ';
TRACK_ERROR_TO_MESSAGE_MAP[NOT_FOUND]
    = 'Requested device(s) was/were not found: ';
TRACK_ERROR_TO_MESSAGE_MAP[CONSTRAINT_FAILED]
    = 'Constraint could not be satisfied: ';
TRACK_ERROR_TO_MESSAGE_MAP[TIMEOUT]
    = 'Could not start media source. Timeout occured!';
TRACK_ERROR_TO_MESSAGE_MAP[TRACK_IS_DISPOSED]
    = 'Track has been already disposed';
TRACK_ERROR_TO_MESSAGE_MAP[TRACK_NO_STREAM_FOUND]
    = 'Track does not have an associated Media Stream';
