export default ScreenObtainer;
declare namespace ScreenObtainer {
    const obtainStream: any;
    /**
     * Initializes the function used to obtain a screen capture
     * (this.obtainStream).
     *
     * @param {object} options
     * @param {Function} gum GUM method
     */
    function init(options: any, gum: Function): void;
    /**
     * Initializes the function used to obtain a screen capture
     * (this.obtainStream).
     *
     * @param {object} options
     * @param {Function} gum GUM method
     */
    function init(options: any, gum: Function): void;
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
     * @param {Object} [options] - Screen sharing options.
     * @param {Array<string>} [options.desktopSharingSources] - Array with the
     * sources that have to be displayed in the desktop picker window ('screen',
     * 'window', etc.).
     * @param onSuccess - Success callback.
     * @param onFailure - Failure callback.
     */
    function obtainScreenOnElectron(options?: {
        desktopSharingSources?: string[];
    }, onSuccess: any, onFailure: any): void;
    /**
     * Obtains a screen capture stream on Electron.
     *
     * @param {Object} [options] - Screen sharing options.
     * @param {Array<string>} [options.desktopSharingSources] - Array with the
     * sources that have to be displayed in the desktop picker window ('screen',
     * 'window', etc.).
     * @param onSuccess - Success callback.
     * @param onFailure - Failure callback.
     */
    function obtainScreenOnElectron(options?: {
        desktopSharingSources?: string[];
    }, onSuccess: any, onFailure: any): void;
    /**
     * Obtains a screen capture stream using getDisplayMedia.
     *
     * @param callback - The success callback.
     * @param errorCallback - The error callback.
     */
    function obtainScreenFromGetDisplayMedia(options: any, callback: any, errorCallback: any): void;
    /**
     * Obtains a screen capture stream using getDisplayMedia.
     *
     * @param callback - The success callback.
     * @param errorCallback - The error callback.
     */
    function obtainScreenFromGetDisplayMedia(options: any, callback: any, errorCallback: any): void;
    /**
     * Obtains a screen capture stream using getDisplayMedia.
     *
     * @param callback - The success callback.
     * @param errorCallback - The error callback.
     */
    function obtainScreenFromGetDisplayMediaRN(options: any, callback: any, errorCallback: any): void;
    /**
     * Obtains a screen capture stream using getDisplayMedia.
     *
     * @param callback - The success callback.
     * @param errorCallback - The error callback.
     */
    function obtainScreenFromGetDisplayMediaRN(options: any, callback: any, errorCallback: any): void;
}
