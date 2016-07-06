/* global $, __filename */
var logger = require("jitsi-meet-logger").getLogger(__filename);
var RTCBrowserType = require("./RTCBrowserType");
var RTC = require('./RTC');

var RTCUIHelper = {

    /**
     * Returns the name of 'video' element depending on the browser that we're
     * currently using.
     * @returns {string} 'video' or 'object' string name of WebRTC video element
     */
    getVideoElementName: function () {
        return RTCBrowserType.isTemasysPluginUsed() ? 'object' : 'video';
    },

    /**
     * Finds video element inside of the given container.
     * @param containerElement HTML element node instance which is supposed to
     *        contain the video element.
     * @returns {HTMLElement} video HTML element instance if found inside of the
     *          container or undefined otherwise.
     */
    findVideoElement: function (containerElement) {
        var videoElemName = RTCUIHelper.getVideoElementName();
        if (!RTCBrowserType.isTemasysPluginUsed()) {
            return $(containerElement).find(videoElemName)[0];
        } else {
            var matching = $(containerElement).find(
                ' ' + videoElemName + '>param[value="video"]');
            if (matching.length) {
                if (matching.length > 1) {
                    logger.warn(
                        "Container with more than one video elements: ",
                        containerElement);
                }
                return matching.parent()[0];
            }
        }
        return undefined;
    },
    /**
     * Sets 'volume' property of given HTML element displaying RTC audio or
     * video stream.
     * @param streamElement HTML element to which the RTC stream is attached to.
     * @param volume the volume value to be set.
     */
    setVolume: function (streamElement, volume) {
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
    setAutoPlay: function (streamElement, autoPlay) {
        if (!RTCBrowserType.isIExplorer()) {
            streamElement.autoplay = true;
        }
    }
};

module.exports = RTCUIHelper;
