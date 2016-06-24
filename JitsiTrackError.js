var JitsiTrackErrors = require("./JitsiTrackErrors");

var TRACK_ERROR_TO_MESSAGE_MAP = {};

TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.TRACK_IS_DISPOSED]
    = "Track has been already disposed";
TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.TRACK_MUTE_UNMUTE_IN_PROGRESS]
    = "Track mute/unmute process is currently in progress";

/**
 * Object representing error that happened to a JitsiTrack. Can represent
 * various types of errors. For error descriptions (@see JitsiTrackErrors).
 * @constructor
 * @extends Error
 * @param {Error|string} error - error name
 * @param {string} (message) - error message
 */
function JitsiTrackError(error, message) {
    if (typeof error === "string") {
        if (TRACK_ERROR_TO_MESSAGE_MAP[error]) {
            this.name = error;
            this.message = message || TRACK_ERROR_TO_MESSAGE_MAP[error];
        } else {
            // this is some generic error that do not fit any of our pre-defined
            // errors, so don't give it any specific name, just store message
            this.message = error;
        }

        this.stack = (new Error()).stack;
    } else if (error instanceof Error) {
        this.name = error.name;
        this.message = error.message;
        this.stack = error.stack;
    } else {
        throw new Error("Invalid arguments");
    }
}

JitsiTrackError.prototype = Object.create(Error.prototype);
JitsiTrackError.prototype.constructor = JitsiTrackError;

module.exports = JitsiTrackError;