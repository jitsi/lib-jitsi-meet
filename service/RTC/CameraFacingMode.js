/**
 * The possible camera facing modes. For now support only 'user' and
 * 'environment' because 'left' and 'right' are not used anywhere in our
 * projects at the time of this writing. For more information please refer to
 * https://w3c.github.io/mediacapture-main/getusermedia.html
 * #def-constraint-facingMode.
 *
 * @enum {string}
 */
const CameraFacingMode = {
    /**
     * The mode which specifies the environment-facing camera.
     */
    ENVIRONMENT: 'environment',

    /**
     * The mode which specifies the user-facing camera.
     */
    USER: 'user'
};

module.exports = CameraFacingMode;
