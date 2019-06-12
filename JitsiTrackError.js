import * as JitsiTrackErrors from './JitsiTrackErrors';

const TRACK_ERROR_TO_MESSAGE_MAP = {};

TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.UNSUPPORTED_RESOLUTION]
    = 'Video resolution is not supported: ';
TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.CHROME_EXTENSION_INSTALLATION_ERROR]
    = 'Failed to install Chrome extension';
TRACK_ERROR_TO_MESSAGE_MAP[
    JitsiTrackErrors.CHROME_EXTENSION_USER_GESTURE_REQUIRED]
    = 'Failed to install Chrome extension - installations can only be initiated'
        + ' by a user gesture.';
TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.CHROME_EXTENSION_USER_CANCELED]
    = 'User canceled Chrome\'s screen sharing prompt';
TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.CHROME_EXTENSION_GENERIC_ERROR]
    = 'Unknown error from Chrome extension';
TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.ELECTRON_DESKTOP_PICKER_ERROR]
    = 'Unkown error from desktop picker';
TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.ELECTRON_DESKTOP_PICKER_NOT_FOUND]
    = 'Failed to detect desktop picker';
TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.GENERAL]
    = 'Generic getUserMedia error';
TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.PERMISSION_DENIED]
    = 'User denied permission to use device(s): ';
TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.NOT_FOUND]
    = 'Requested device(s) was/were not found: ';
TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.CONSTRAINT_FAILED]
    = 'Constraint could not be satisfied: ';
TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.TRACK_IS_DISPOSED]
    = 'Track has been already disposed';
TRACK_ERROR_TO_MESSAGE_MAP[JitsiTrackErrors.TRACK_NO_STREAM_FOUND]
    = 'Track does not have an associated Media Stream';

// FIXME: Using prototype inheritance because otherwise instanceof is not
// working properly (see https://github.com/babel/babel/issues/3083)

/**
 *
 * Represents an error that occurred to a JitsiTrack. Can represent various
 * types of errors. For error descriptions (@see JitsiTrackErrors).
 *
 * @extends Error
 *
 *
 * @constructor
 * @param {Object|string} error - error object or error name
 * @param {Object|string} (options) - getUserMedia constraints object or
 * error message
 * @param {('audio'|'video'|'desktop'|'screen'|'audiooutput')[]} (devices) -
 * list of getUserMedia requested devices
 */
function JitsiTrackError(error, options, devices) {
    if (typeof error === 'object' && typeof error.name !== 'undefined') {
        /**
         * Additional information about original getUserMedia error
         * and constraints.
         * @type {{
         *     error: Object,
         *     constraints: Object,
         *     devices: Array.<'audio'|'video'|'desktop'|'screen'>
         * }}
         */
        this.gum = {
            error,
            constraints: options,
            devices: devices && Array.isArray(devices)
                ? devices.slice(0)
                : undefined
        };

        switch (error.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
        case 'SecurityError':
            this.name = JitsiTrackErrors.PERMISSION_DENIED;
            this.message
                = TRACK_ERROR_TO_MESSAGE_MAP[this.name]
                    + (this.gum.devices || []).join(', ');
            break;
        case 'DevicesNotFoundError':
        case 'NotFoundError':
            this.name = JitsiTrackErrors.NOT_FOUND;
            this.message
                = TRACK_ERROR_TO_MESSAGE_MAP[this.name]
                    + (this.gum.devices || []).join(', ');
            break;
        case 'ConstraintNotSatisfiedError':
        case 'OverconstrainedError': {
            const constraintName = error.constraintName || error.constraint;

            // we treat deviceId as unsupported resolution, as we want to
            // retry and finally if everything fails to remove deviceId from
            // mandatory constraints
            if (options
                    && options.video
                    && (!devices || devices.indexOf('video') > -1)
                    && (constraintName === 'minWidth'
                        || constraintName === 'maxWidth'
                        || constraintName === 'minHeight'
                        || constraintName === 'maxHeight'
                        || constraintName === 'width'
                        || constraintName === 'height'
                        || constraintName === 'deviceId')) {
                this.name = JitsiTrackErrors.UNSUPPORTED_RESOLUTION;
                this.message
                    = TRACK_ERROR_TO_MESSAGE_MAP[this.name]
                        + getResolutionFromFailedConstraint(
                            constraintName,
                            options);
            } else {
                this.name = JitsiTrackErrors.CONSTRAINT_FAILED;
                this.message
                    = TRACK_ERROR_TO_MESSAGE_MAP[this.name]
                        + error.constraintName;
            }
            break;
        }

        default:
            this.name = JitsiTrackErrors.GENERAL;
            this.message
                = error.message || TRACK_ERROR_TO_MESSAGE_MAP[this.name];
            break;
        }
    } else if (typeof error === 'string') {
        if (TRACK_ERROR_TO_MESSAGE_MAP[error]) {
            this.name = error;
            this.message = options || TRACK_ERROR_TO_MESSAGE_MAP[error];
        } else {
            // this is some generic error that do not fit any of our
            // pre-defined errors, so don't give it any specific name, just
            // store message
            this.message = error;
        }
    } else {
        throw new Error('Invalid arguments');
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
        switch (failedConstraintName) {
        case 'width':
            return constraints.video.mandatory.minWidth;
        case 'height':
            return constraints.video.mandatory.minHeight;
        default:
            return constraints.video.mandatory[failedConstraintName] || '';
        }
    }

    return '';
}

export default JitsiTrackError;
