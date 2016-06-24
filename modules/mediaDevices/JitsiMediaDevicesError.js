var MediaDevicesErrors = require("./JitsiMediaDevicesErrors");

var ERROR_TO_MESSAGE_MAP = {};

ERROR_TO_MESSAGE_MAP[MediaDevicesErrors.UNSUPPORTED_RESOLUTION]
    = "Video resolution is not supported: ";
ERROR_TO_MESSAGE_MAP[MediaDevicesErrors.FIREFOX_EXTENSION_NEEDED]
    = "Firefox extension is not installed";
ERROR_TO_MESSAGE_MAP[MediaDevicesErrors.CHROME_EXTENSION_INSTALLATION_ERROR]
    = "Failed to install Chrome extension";
ERROR_TO_MESSAGE_MAP[MediaDevicesErrors.CHROME_EXTENSION_USER_CANCELED]
    = "User canceled Chrome's screen sharing prompt";
ERROR_TO_MESSAGE_MAP[MediaDevicesErrors.CHROME_EXTENSION_GENERIC_ERROR]
    = "Unknown error from Chrome extension";
ERROR_TO_MESSAGE_MAP[MediaDevicesErrors.GENERAL]
    = "Generic getUserMedia error";
ERROR_TO_MESSAGE_MAP[MediaDevicesErrors.PERMISSION_DENIED]
    = "User denied permission to use device(s): ";
ERROR_TO_MESSAGE_MAP[MediaDevicesErrors.NOT_FOUND]
    = "Requested device(s) was/were not found: ";
ERROR_TO_MESSAGE_MAP[MediaDevicesErrors.CONSTRAINT_FAILED]
    = "Constraint could not be satisfied: ";

/**
 * Object representing error that happened while performing a getUserMedia call.
 * Can represent various types of errors. For error descriptions
 * (@see JitsiMediaDevicesErrors).
 * @constructor
 * @extends Error
 * @param {Object|string} error - error object or error name
 * @param {Object|string} (constraints) - getUserMedia constraints object or
 *      error message
 * @param {('audio'|'video'|'desktop'|'screen'|'audiooutput')[]} (devices) -
 *      list of getUserMedia requested devices
 */
function JitsiMediaDevicesError(error, constraints, devices) {
    if (typeof error === "object" && typeof error.name !== "undefined") {
        /**
         * Additional information about original getUserMedia error
         * and constraints.
         * @type {{
         *     error: Object,
         *     constraints: Object,
         *     devices: Array.<'audio'|'video'|'desktop'|'screen'|'audiooutput'>
         * }}
         */
        this.gum = {
            error: error,
            constraints: constraints,
            devices: devices && Array.isArray(devices)
                ? devices.slice(0)
                : undefined
        };

        switch (error.name) {
            case "PermissionDeniedError":
            case "SecurityError":
                this.name = MediaDevicesErrors.PERMISSION_DENIED;
                this.message = ERROR_TO_MESSAGE_MAP[
                        MediaDevicesErrors.PERMISSION_DENIED]
                        + (this.gum.devices || []).join(", ");
                break;
            case "NotFoundError":
                this.name = MediaDevicesErrors.NOT_FOUND;
                this.message = ERROR_TO_MESSAGE_MAP[
                        MediaDevicesErrors.NOT_FOUND]
                        + (this.gum.devices || []).join(", ");
                break;
            case "ConstraintNotSatisfiedError":
            case "OverconstrainedError":
                var constraintName = error.constraintName;

                if (constraints && constraints.video
                    && (devices || []).indexOf('video') > -1 &&
                    (constraintName === "minWidth" ||
                        constraintName === "maxWidth" ||
                        constraintName === "minHeight" ||
                        constraintName === "maxHeight" ||
                        constraintName === "width" ||
                        constraintName === "height")) {
                    this.name = MediaDevicesErrors.UNSUPPORTED_RESOLUTION;
                    this.message = ERROR_TO_MESSAGE_MAP[
                            MediaDevicesErrors.UNSUPPORTED_RESOLUTION] +
                        getResolutionFromFailedConstraint(constraintName,
                            constraints);
                } else {
                    this.name = MediaDevicesErrors.CONSTRAINT_FAILED;
                    this.message = ERROR_TO_MESSAGE_MAP[
                            MediaDevicesErrors.CONSTRAINT_FAILED] +
                        error.constraintName;
                }
                break;
            default:
                this.name = MediaDevicesErrors.GENERAL;
                this.message = error.message ||
                    ERROR_TO_MESSAGE_MAP[MediaDevicesErrors.GENERAL];
                break;
        }
    } else if (typeof error === 'string' && ERROR_TO_MESSAGE_MAP[error]) {
        this.name = error;
        this.message = constraints || ERROR_TO_MESSAGE_MAP[error];
    } else {
        throw new Error("Invalid arguments");
    }

    this.stack = error.stack || (new Error()).stack;
}

JitsiMediaDevicesError.prototype = Object.create(Error.prototype);
JitsiMediaDevicesError.prototype.constructor = JitsiMediaDevicesError;

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

module.exports = JitsiMediaDevicesError;