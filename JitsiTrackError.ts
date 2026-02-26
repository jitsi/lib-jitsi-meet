import * as JitsiTrackErrors from './JitsiTrackErrors';

export interface IGumError {
    constraint?: string;
    constraintName?: string;
    message?: string;
    name?: string;
    stack?: string;
}

export interface IVideoConstraints {
    mandatory?: { [key: string]: string | number; };
}

export interface IGumOptions {
    video?: IVideoConstraints;
}

export interface IGum {
    constraints?: IGumOptions | string;
    devices?: ('audio' | 'video' | 'desktop' | 'screen' | 'audiooutput')[];
    error: IGumError;
}

export type DeviceType = 'audio' | 'video' | 'desktop' | 'screen' | 'audiooutput';

const TRACK_ERROR_TO_MESSAGE_MAP: { [key: string]: string; } = {
    [JitsiTrackErrors.UNSUPPORTED_RESOLUTION]: 'Video resolution is not supported: ',
    [JitsiTrackErrors.SCREENSHARING_USER_CANCELED]: 'User canceled screen sharing prompt',
    [JitsiTrackErrors.SCREENSHARING_GENERIC_ERROR]: 'Unknown error from screensharing',
    [JitsiTrackErrors.SCREENSHARING_NOT_SUPPORTED_ERROR]: 'Not supported',
    [JitsiTrackErrors.ELECTRON_DESKTOP_PICKER_ERROR]: 'Unkown error from desktop picker',
    [JitsiTrackErrors.ELECTRON_DESKTOP_PICKER_NOT_FOUND]: 'Failed to detect desktop picker',
    [JitsiTrackErrors.GENERAL]: 'Generic getUserMedia error',
    [JitsiTrackErrors.PERMISSION_DENIED]: 'User denied permission to use device(s): ',
    [JitsiTrackErrors.NOT_FOUND]: 'Requested device(s) was/were not found: ',
    [JitsiTrackErrors.CONSTRAINT_FAILED]: 'Constraint could not be satisfied: ',
    [JitsiTrackErrors.TIMEOUT]: 'Could not start media source. Timeout occurred!',
    [JitsiTrackErrors.TRACK_IS_DISPOSED]: 'Track has been already disposed',
    [JitsiTrackErrors.TRACK_NO_STREAM_FOUND]: 'Track does not have an associated Media Stream'
};

/**
 *
 * Represents an error that occurred to a JitsiTrack. Can represent various
 * types of errors. For error descriptions (@see JitsiTrackErrors).
 */
export default class JitsiTrackError extends Error {
    public gum?: IGum;

    /**
     * @param {IGumError|string} error - error object or error name
     * @param {IGumOptions|string} [options] - getUserMedia constraints object or error message
     * @param {DeviceType[]} [devices] - list of getUserMedia requested devices
     */
    constructor(
            error: IGumError | string,
            options?: IGumOptions | string,
            devices?: DeviceType[]
    ) {
        super();

        if (typeof error === 'object' && typeof error.name !== 'undefined') {
            /**
             * Additional information about original getUserMedia error
             * and constraints.
             * @type {IGum}
             */
            this.gum = {
                constraints: options,
                devices: devices && Array.isArray(devices) ? devices.slice(0) : undefined,
                error
            };

            switch (error.name) {
            case 'NotAllowedError':
            case 'PermissionDeniedError':
            case 'SecurityError':
                this.name = JitsiTrackErrors.PERMISSION_DENIED;
                this.message = TRACK_ERROR_TO_MESSAGE_MAP[this.name] + (this.gum.devices || []).join(', ');
                break;
            case 'DevicesNotFoundError':
            case 'NotFoundError':
                this.name = JitsiTrackErrors.NOT_FOUND;
                this.message = TRACK_ERROR_TO_MESSAGE_MAP[this.name] + (this.gum.devices || []).join(', ');
                break;
            case 'ConstraintNotSatisfiedError':
            case 'OverconstrainedError': {
                const constraintName = error.constraintName || error.constraint;

                // we treat deviceId as unsupported resolution, as we want to
                // retry and finally if everything fails to remove deviceId from
                // mandatory constraints
                if (typeof options !== 'string'
                        && options?.video
                        && (!devices || devices.indexOf('video') > -1)
                        && (constraintName === 'minWidth'
                            || constraintName === 'maxWidth'
                            || constraintName === 'minHeight'
                            || constraintName === 'maxHeight'
                            || constraintName === 'width'
                            || constraintName === 'height'
                            || constraintName === 'deviceId')) {
                    this.name = JitsiTrackErrors.UNSUPPORTED_RESOLUTION;
                    this.message = TRACK_ERROR_TO_MESSAGE_MAP[this.name]
                            + this.getResolutionFromFailedConstraint(constraintName, options);
                } else {
                    this.name = JitsiTrackErrors.CONSTRAINT_FAILED;
                    this.message = TRACK_ERROR_TO_MESSAGE_MAP[this.name] + error.constraintName;
                }
                break;
            }
            default:
                this.name = JitsiTrackErrors.GENERAL;
                this.message = error.message || TRACK_ERROR_TO_MESSAGE_MAP[this.name];
                break;
            }
        } else if (typeof error === 'string') {
            if (TRACK_ERROR_TO_MESSAGE_MAP[error]) {
                this.name = error;
                this.message = typeof options === 'string' ? options : TRACK_ERROR_TO_MESSAGE_MAP[error];
            } else {
            // this is some generic error that do not fit any of our
            // pre-defined errors, so don't give it any specific name, just
            // store message
                this.message = error;
            }
        } else {
            throw new Error('Invalid arguments');
        }

        this.stack = typeof error === 'string' ? new Error().stack : error.stack;
    }

    /**
     * Gets failed resolution constraint from corresponding object.
     * @param failedConstraintName - The name of the failed constraint
     * @param constraints - The constraints object
     * @returns The resolution value or empty string
     */
    private getResolutionFromFailedConstraint(failedConstraintName: string, constraints: IGumOptions): string | number {
        if (constraints?.video?.mandatory) {
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
}
