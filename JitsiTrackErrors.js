/**
 * The errors for the JitsiTrack objects.
 */

/**
 * Generic error for jidesha extension for Chrome.
 * @type {string}
 * @const
 */
export const CHROME_EXTENSION_GENERIC_ERROR
    = 'gum.chrome_extension_generic_error';

/**
 * An error which indicates that the jidesha extension for Chrome is
 * failed to install.
 * @type {string}
 * @const
 */
export const CHROME_EXTENSION_INSTALLATION_ERROR
    = 'gum.chrome_extension_installation_error';

/**
 * This error indicates that the attempt to start screensharing was initiated by
 * a script which did not originate in user gesture handler. It means that
 * you should to trigger the action again in response to a button click for
 * example.
 * @type {string}
 * @const
 */
export const CHROME_EXTENSION_USER_GESTURE_REQUIRED
    = 'gum.chrome_extension_user_gesture_required';

/**
 * An error which indicates that user canceled screen sharing window
 * selection dialog in jidesha extension for Chrome.
 * @type {string}
 * @const
 */
export const CHROME_EXTENSION_USER_CANCELED
    = 'gum.chrome_extension_user_canceled';

/**
 * An error which indicates that some of requested constraints in
 * getUserMedia call were not satisfied.
 * @type {string}
 * @const
 */
export const CONSTRAINT_FAILED = 'gum.constraint_failed';

/**
 * A generic error which indicates an error occurred while selecting
 * a DesktopCapturerSource from the electron app.
 * @type {string}
 * @const
 */
export const ELECTRON_DESKTOP_PICKER_ERROR
    = 'gum.electron_desktop_picker_error';

/**
 * An error which indicates a custom desktop picker could not be detected
 * for the electron app.
 * @type {string}
 * @const
 */
export const ELECTRON_DESKTOP_PICKER_NOT_FOUND
    = 'gum.electron_desktop_picker_not_found';

/**
 * An error which indicates that the jidesha extension for Firefox is
 * needed to proceed with screen sharing, and that it is not installed.
 * @type {string}
 * @const
 */
export const FIREFOX_EXTENSION_NEEDED = 'gum.firefox_extension_needed';

/**
 * Generic getUserMedia error.
 * @type {string}
 * @const
 */
export const GENERAL = 'gum.general';

/**
 * An error which indicates that requested device was not found.
 * @type {string}
 * @const
 */
export const NOT_FOUND = 'gum.not_found';

/**
 * An error which indicates that user denied permission to share requested
 * device.
 * @type {string}
 * @const
 */
export const PERMISSION_DENIED = 'gum.permission_denied';

/**
 * An error which indicates that track has been already disposed and cannot
 * be longer used.
 * @type {string}
 * @const
 */
export const TRACK_IS_DISPOSED = 'track.track_is_disposed';

/**
 * An error which indicates that track has no MediaStream associated.
 * @type {string}
 * @const
 */
export const TRACK_NO_STREAM_FOUND = 'track.no_stream_found';

/**
 * An error which indicates that requested video resolution is not supported
 * by a webcam.
 * @type {string}
 * @const
 */
export const UNSUPPORTED_RESOLUTION = 'gum.unsupported_resolution';
