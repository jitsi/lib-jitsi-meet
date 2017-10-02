/* global $ */

import RTCBrowserType from './RTCBrowserType';

const logger = require('jitsi-meet-logger').getLogger(__filename);

const RTCUIHelper = {

    /**
     * Returns the name of 'video' element depending on the browser that we're
     * currently using.
     * @returns {string} 'video' or 'object' string name of WebRTC video element
     */
    getVideoElementName() {
        return RTCBrowserType.isTemasysPluginUsed() ? 'object' : 'video';
    },

    /**
     * Finds video element inside of the given container.
     * @param containerElement HTML element node instance which is supposed to
     *        contain the video element.
     * @returns {HTMLElement} video HTML element instance if found inside of the
     *          container or undefined otherwise.
     */
    findVideoElement(containerElement) {
        const videoElemName = RTCUIHelper.getVideoElementName();

        if (!RTCBrowserType.isTemasysPluginUsed()) {
            return $(containerElement).find(videoElemName)[0];
        }
        const matching
            = $(containerElement).find(
                ` ${videoElemName}>param[value="video"]`);

        if (matching.length) {
            if (matching.length > 1) {
                logger.warn(
                    'Container with more than one video elements: ',
                    containerElement);
            }

            return matching.parent()[0];
        }

        return undefined;
    },

    /**
     * Returns whether or not the video element fires resize events.
     *
     * @returns {boolean}
     */
    isResizeEventSupported() {
        return !RTCBrowserType.isTemasysPluginUsed();
    },

    /**
     * Sets 'volume' property of given HTML element displaying RTC audio or
     * video stream.
     * @param streamElement HTML element to which the RTC stream is attached to.
     * @param volume the volume value to be set.
     */
    setVolume(streamElement, volume) {
        if (!RTCBrowserType.isIExplorer()) {
            streamElement.volume = volume;
        }
    },

    /**
     * Sets 'autoplay' property of given HTML element displaying RTC audio or
     * video stream.
     * @param streamElement HTML element to which the RTC stream is attached to.
     * @param autoPlay 'true' or 'false'
     */
    setAutoPlay(streamElement, autoPlay) {
        if (!RTCBrowserType.isIExplorer()) {
            streamElement.autoplay = autoPlay;
        }
    }
};

export default RTCUIHelper;
