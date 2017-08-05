/**
 * Enumeration with the errors for the conference.
 * @type {{string: string}}
 */
const JitsiRecorderErrors = {
    /**
     * Indicates that the recorder is currently unavailable.
     */
    RECORDER_UNAVAILABLE: 'recorder.unavailable',

    /**
     * Indicates that all available recorders are currently busy.
     */
    RECORDER_BUSY: 'recorder.busy',

    /**
     * Indicates that the authentication token is missing.
     */
    NO_TOKEN: 'recorder.noToken',

    /**
     * Indicates that a state change failed.
     */
    STATE_CHANGE_FAILED: 'recorder.stateChangeFailed',

    /**
     * Indicates an invalid state.
     */
    INVALID_STATE: 'recorder.invalidState'
};

module.exports = JitsiRecorderErrors;
