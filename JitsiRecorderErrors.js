/**
 * Enumeration with the errors for the conference.
 * @type {{string: string}}
 */
var JitsiRecorderErrors = {
    /**
     * Indicates that the recorder is currently unavailable.
     */
    RECORDER_UNAVAILABLE: "recorder.unavailable",

    /**
     * Indicates that the authentication token is missing.
     */
    NO_TOKEN: "recorder.noToken",

    /**
     * Indicates that a state change failed.
     */
    STATE_CHANGE_FAILED: "recorder.stateChangeFailed",

};

module.exports = JitsiRecorderErrors;
