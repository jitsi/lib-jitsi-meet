import * as JitsiTrackErrors from './JitsiTrackErrors';

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
                = JitsiTrackErrors.TRACK_ERROR_TO_MESSAGE_MAP[this.name]
                    + (this.gum.devices || []).join(', ');
            break;
        case 'DevicesNotFoundError':
        case 'NotFoundError':
            this.name = JitsiTrackErrors.NOT_FOUND;
            this.message
                = JitsiTrackErrors.TRACK_ERROR_TO_MESSAGE_MAP[this.name]
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
                    = JitsiTrackErrors.TRACK_ERROR_TO_MESSAGE_MAP[this.name]
                        + getResolutionFromFailedConstraint(
                            constraintName,
                            options);
            } else {
                this.name = JitsiTrackErrors.CONSTRAINT_FAILED;
                this.message
                    = JitsiTrackErrors.TRACK_ERROR_TO_MESSAGE_MAP[this.name]
                        + error.constraintName;
            }
            break;
        }

        default:
            this.name = JitsiTrackErrors.GENERAL;
            this.message
                = error.message || JitsiTrackErrors.TRACK_ERROR_TO_MESSAGE_MAP[this.name];
            break;
        }
    } else if (typeof error === 'string') {
        if (JitsiTrackErrors.TRACK_ERROR_TO_MESSAGE_MAP[error]) {
            this.name = error;
            this.message = options || JitsiTrackErrors.TRACK_ERROR_TO_MESSAGE_MAP[error];
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
