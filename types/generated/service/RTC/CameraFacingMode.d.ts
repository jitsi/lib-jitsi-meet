export = CameraFacingMode;
/**
 * The possible camera facing modes. For now support only 'user' and
 * 'environment' because 'left' and 'right' are not used anywhere in our
 * projects at the time of this writing. For more information please refer to
 * https://w3c.github.io/mediacapture-main/getusermedia.html
 * #def-constraint-facingMode.
 */
type CameraFacingMode = string;
declare namespace CameraFacingMode {
    const ENVIRONMENT: string;
    const USER: string;
}
