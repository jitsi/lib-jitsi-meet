/* global module */
/**
 * Possible camera facing modes. For now support only 'user' and 'environment'
 * modes as 'left' and 'right' and not used anywhere right at the moment.
 * For more info see
 * https://w3c.github.io/mediacapture-main/getusermedia.html#def-constraint-facingMode
 *
 * @enum {string}
 */
var CameraFacingMode = {
    /**
     * The user facing camera mode.
     */
    USER: "user",
    /**
     * The environment facing camera mode.
     */
    ENVIRONMENT: "environment"
};

module.exports = CameraFacingMode;