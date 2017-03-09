var logger = require("jitsi-meet-logger").getLogger(__filename);
var RTCBrowserType = require("./RTCBrowserType");

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
        if (!containerElement)
            return undefined;

        var videoElName = RTCUIHelper.getVideoElementName();
        var selector
            = !RTCBrowserType.isTemasysPluginUsed()
                ? videoElName : ' ' + videoElName + '>param[value="video"]';

        var videoElements = containerElement.querySelectorAll(selector);
        if (videoElements.length) {
            if (videoElements.length > 1) {
                logger.warn(
                    "Container with more than one video elements: "
                        + containerElement.id);
            }
            return !RTCBrowserType.isTemasysPluginUsed()
                ? videoElements[0] : videoElements[0].parentNode;
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
            streamElement.autoplay = autoPlay;
        }
    }
};

module.exports = RTCUIHelper;
