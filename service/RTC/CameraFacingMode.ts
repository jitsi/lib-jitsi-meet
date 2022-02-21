/**
 * The possible camera facing modes. For now support only 'user' and
 * 'environment' because 'left' and 'right' are not used anywhere in our
 * projects at the time of this writing. For more information please refer to
 * https://w3c.github.io/mediacapture-main/getusermedia.html
 * #def-constraint-facingMode.
 *
 * @enum {string}
 */
export enum CameraFacingMode {
    /**
     * The mode which specifies the environment-facing camera.
     */
    ENVIRONMENT = 'environment',

    /**
     * The mode which specifies the user-facing camera.
     */
    USER = 'user'
};

export const ENVIRONMENT = CameraFacingMode.ENVIRONMENT;
export const USER = CameraFacingMode.USER;

// TODO: this was a pre-ES6 module using module.exports = CameraFacingMode which doesn't translate well
// it is used in a number of places and should be updated to use the named export

export default CameraFacingMode;
