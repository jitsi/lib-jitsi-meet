var JitsiTrackErrors = require("./JitsiTrackErrors");

var TRACK_ERROR_TO_MESSAGE_MAP = {};

TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.UNSUPPORTED_RESOLUTION]
    = "Video resolution is not supported: ";
TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.FIREFOX_EXTENSION_NEEDED]
    = "Firefox extension is not installed";
TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.CHROME_EXTENSION_INSTALLATION_ERROR]
    = "Failed to install Chrome extension";
TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.CHROME_EXTENSION_USER_CANCELED]
    = "User canceled Chrome's screen sharing prompt";
TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.CHROME_EXTENSION_GENERIC_ERROR]
    = "Unknown error from Chrome extension";
TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.GENERAL]
    = "Generic getUserMedia error";
TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.PERMISSION_DENIED]
    = "User denied permission to use device(s): ";
TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.NOT_FOUND]
    = "Requested device(s) was/were not found: ";
TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.CONSTRAINT_FAILED]
    = "Constraint could not be satisfied: ";
TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.TRACK_IS_DISPOSED]
    = "Track has been already disposed";
TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.TRACK_MUTE_UNMUTE_IN_PROGRESS]
    = "Track mute/unmute process is currently in progress";

/**
 * Object representing error that happened to a JitsiTrack. Can represent
 * various types of errors. For error descriptions (@see JitsiTrackErrors).
 * @constructor
 * @extends Error
 * @param {Object|string} error - error object or error name
 * @param {Object|string} (options) - getUserMedia constraints object or error
 *      message
 */
function JitsiTrackError(error, options) {
    if (typeof error === "object" && typeof error.name !== "undefined") {
        /**
         * Additional information about original getUserMedia error
         * and constraints.
         * @type {{error: Object, constraints: Object }}
         */
        this.gum = {
            error: error,
            constraints: options
        };

        switch (error.name) {
            case "PermissionDeniedError":
            case "SecurityError":
                this.name = JitsiTrackErrors.PERMISSION_DENIED;
                this.message = error.message
                    || TRACK_ERROR_TO_MESSAGE_MAP[
                        JitsiTrackErrors.PERMISSION_DENIED]
                        + Object.keys(options || {}).filter(function (k) {
                            return !!options[k];
                        }).join(", ");
                break;
            case "NotFoundError":
                this.name = JitsiTrackErrors.NOT_FOUND;
                this.message = error.message
                    || TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.NOT_FOUND]
                        + Object.keys(options || {}).filter(function (k) {
                            return !!options[k];
                        }).join(", ");
                break;
            case "ConstraintNotSatisfiedError":
            case "OverconstrainedError":
                var constraintName = error.constraintName;

                if (options && options.video
                    &&
                    (constraintName === "minWidth" ||
                        constraintName === "maxWidth" ||
                        constraintName === "minHeight" ||
                        constraintName === "maxHeight" ||
                        constraintName === "width" ||
                        constraintName === "height")) {
                    this.name = JitsiTrackErrors.UNSUPPORTED_RESOLUTION;
                    this.message = error.message ||
                        TRACK_ERROR_TO_MESSAGE_MAP[
                            JitsiTrackErrors.UNSUPPORTED_RESOLUTION] +
                        getResolutionFromFailedConstraint(constraintName,
                            options);
                } else {
                    this.name = JitsiTrackErrors.CONSTRAINT_FAILED;
                    this.message = error.message ||
                        TRACK_ERROR_TO_MESSAGE_MAP[
                            JitsiTrackErrors.CONSTRAINT_FAILED] +
                        error.constraintName;
                }
                break;
            default:
                this.name = JitsiTrackErrors.GENERAL;
                this.message = error.message ||
                    TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.GENERAL];
                break;
        }
    } else if (typeof error === "string") {
        if (TRACK_ERROR_TO_MESSAGE_MAP[error]) {
            this.name = error;
            this.message = options || TRACK_ERROR_TO_MESSAGE_MAP[error];
        } else {
            // this is some generic error that do not fit any of our pre-defined
            // errors, so don't give it any specific name, just store message
            this.message = error;
        }
    } else {
        throw new Error("Invalid arguments");
    }

    this.stack = error.stack || (new Error()).stack;
}

JitsiTrackError.prototype = Object.create(Error.prototype);
JitsiTrackError.prototype.constructor = JitsiTrackError;

/**
 * Gets failed resolution constraint from corresponding object.
 * @param {string} failedConstraintName
 * @param {Object} constraints
 * @returns {string|number}
 */
function getResolutionFromFailedConstraint(failedConstraintName, constraints) {
    if (constraints && constraints.video && constraints.video.mandatory) {
        if (failedConstraintName === "width") {
            return constraints.video.mandatory.minWidth;
        } else if (failedConstraintName === "height") {
            return constraints.video.mandatory.minHeight;
        } else {
            return constraints.video.mandatory[failedConstraintName] || "";
        }
    }

    return "";
}

module.exports = JitsiTrackError;
