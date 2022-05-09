/**
 * The default frame rate for Screen Sharing.
 */
export const SS_DEFAULT_FRAME_RATE: 5;
export default ScreenObtainer;
declare namespace ScreenObtainer {
    const obtainStream: any;
    /**
     * Initializes the function used to obtain a screen capture
     * (this.obtainStream).
     *
     * @param {object} options
     */
    function init(options?: any): void;
    /**
     * Initializes the function used to obtain a screen capture
     * (this.obtainStream).
     *
     * @param {object} options
     */
    function init(options?: any): void;
    /**
     * Returns a method which will be used to obtain the screen sharing stream
     * (based on the browser type).
     *
     * @returns {Function}
     * @private
     */
    function _createObtainStreamMethod(): Function;
    /**
     * Returns a method which will be used to obtain the screen sharing stream
     * (based on the browser type).
     *
     * @returns {Function}
     * @private
     */
    function _createObtainStreamMethod(): Function;
    /**
     * Gets the appropriate constraints for audio sharing.
     *
     * @returns {Object|boolean}
     */
    function _getAudioConstraints(): any;
    /**
     * Gets the appropriate constraints for audio sharing.
     *
     * @returns {Object|boolean}
     */
    function _getAudioConstraints(): any;
    /**
     * Checks whether obtaining a screen capture is supported in the current
     * environment.
     * @returns {boolean}
     */
    function isSupported(): boolean;
    /**
     * Checks whether obtaining a screen capture is supported in the current
     * environment.
     * @returns {boolean}
     */
    function isSupported(): boolean;
    /**
     * Obtains a screen capture stream on Electron.
     *
     * @param onSuccess - Success callback.
     * @param onFailure - Failure callback.
     */
    function obtainScreenOnElectron(onSuccess: any, onFailure: any): void;
    /**
     * Obtains a screen capture stream on Electron.
     *
     * @param onSuccess - Success callback.
     * @param onFailure - Failure callback.
     */
    function obtainScreenOnElectron(onSuccess: any, onFailure: any): void;
    /**
     * Obtains a screen capture stream using getDisplayMedia.
     *
     * @param callback - The success callback.
     * @param errorCallback - The error callback.
     */
    function obtainScreenFromGetDisplayMedia(callback: any, errorCallback: any): void;
    /**
     * Obtains a screen capture stream using getDisplayMedia.
     *
     * @param callback - The success callback.
     * @param errorCallback - The error callback.
     */
    function obtainScreenFromGetDisplayMedia(callback: any, errorCallback: any): void;
    /**
     * Obtains a screen capture stream using getDisplayMedia.
     *
     * @param callback - The success callback.
     * @param errorCallback - The error callback.
     */
    function obtainScreenFromGetDisplayMediaRN(callback: any, errorCallback: any): void;
    /**
     * Obtains a screen capture stream using getDisplayMedia.
     *
     * @param callback - The success callback.
     * @param errorCallback - The error callback.
     */
    function obtainScreenFromGetDisplayMediaRN(callback: any, errorCallback: any): void;
    /**
     * Sets the max frame rate to be used for a desktop track capture.
     *
     * @param {number} maxFps capture frame rate to be used for desktop tracks.
     * @returns {void}
     */
    function setDesktopSharingFrameRate(maxFps: number): void;
    /**
     * Sets the max frame rate to be used for a desktop track capture.
     *
     * @param {number} maxFps capture frame rate to be used for desktop tracks.
     * @returns {void}
     */
    function setDesktopSharingFrameRate(maxFps: number): void;
}
