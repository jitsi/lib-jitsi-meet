import BrowserCapabilities from './BrowserCapabilities';

/**
 * API for checking the capabilities for Jitsi Meet for the current or passed
 * browser.
 */
export default class ExternalBrowserCapabilities {
    /**
     * Creates new ExternalBrowserCapabilities instance.
     *
     * @param {boolean} [isUsingIFrame] - True if Jitsi Meet is loaded in iframe
     * and false otherwise.
     * @param {Object} [browserInfo] - Information about the browser.
     * @param {string} browserInfo.name - The name of the browser.
     * @param {string} browserInfo.version - The version of the browser.
     */
    constructor(isUsingIFrame, browserInfo) {
        this._capabilities
            = new BrowserCapabilities(isUsingIFrame, browserInfo);
    }

    /**
     * Checks whether the browser is supported by Jitsi Meet.
     *
     * @returns {boolean}
     */
    isSupported() {
        return this._capabilities.isSupported();
    }

    /**
     * Checks whether the browser supports incoming audio.
     *
     * @returns {boolean}
     */
    supportsAudioIn() {
        return this._capabilities.supportsAudioIn();
    }

    /**
     * Checks whether the browser supports outgoing audio.
     *
     * @returns {boolean}
     */
    supportsAudioOut() {
        return this._capabilities.supportsAudioOut();
    }

    /**
     * Checks whether the browser supports video.
     *
     * @returns {boolean}
     */
    supportsVideo() {
        return this._capabilities.supportsVideo();
    }

    /**
     * Checks whether the browser supports screen sharing.
     *
     * @returns {boolean}
     */
    supportsScreenSharing() {
        return this._capabilities.supportsScreenSharing();
    }
}
