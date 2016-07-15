var logger = require("jitsi-meet-logger").getLogger(__filename);

var currentBrowser;

var browserVersion;

var isAndroid;

var RTCBrowserType = {

    RTC_BROWSER_CHROME: "rtc_browser.chrome",

    RTC_BROWSER_OPERA: "rtc_browser.opera",

    RTC_BROWSER_FIREFOX: "rtc_browser.firefox",

    RTC_BROWSER_IEXPLORER: "rtc_browser.iexplorer",

    RTC_BROWSER_SAFARI: "rtc_browser.safari",

    RTC_BROWSER_NWJS: "rtc_browser.nwjs",

    RTC_BROWSER_REACT_NATIVE: "rtc_browser.react-native",

    /**
     * Gets current browser type.
     * @returns {string}
     */
    getBrowserType: function () {
        return currentBrowser;
    },

    /**
     * Checks if current browser is Chrome.
     * @returns {boolean}
     */
    isChrome: function () {
        return currentBrowser === RTCBrowserType.RTC_BROWSER_CHROME;
    },

    /**
     * Checks if current browser is Opera.
     * @returns {boolean}
     */
    isOpera: function () {
        return currentBrowser === RTCBrowserType.RTC_BROWSER_OPERA;
    },

    /**
     * Checks if current browser is Firefox.
     * @returns {boolean}
     */
    isFirefox: function () {
        return currentBrowser === RTCBrowserType.RTC_BROWSER_FIREFOX;
    },

    /**
     * Checks if current browser is Internet Explorer.
     * @returns {boolean}
     */
    isIExplorer: function () {
        return currentBrowser === RTCBrowserType.RTC_BROWSER_IEXPLORER;
    },

    /**
     * Checks if current browser is Safari.
     * @returns {boolean}
     */
    isSafari: function () {
        return currentBrowser === RTCBrowserType.RTC_BROWSER_SAFARI;
    },

    /**
     * Checks if current environment is NWJS.
     * @returns {boolean}
     */
    isNWJS: function () {
        return currentBrowser === RTCBrowserType.RTC_BROWSER_NWJS;
    },

    /**
     * Checks if current environment is React Native.
     * @returns {boolean}
     */
    isReactNative: function () {
        return currentBrowser === RTCBrowserType.RTC_BROWSER_REACT_NATIVE;
    },

    /**
     * Checks if Temasys RTC plugin is used.
     * @returns {boolean}
     */
    isTemasysPluginUsed: function () {
        return RTCBrowserType.isIExplorer() || RTCBrowserType.isSafari();
    },

    /**
     * Returns Firefox version.
     * @returns {number|null}
     */
    getFirefoxVersion: function () {
        return RTCBrowserType.isFirefox() ? browserVersion : null;
    },

    /**
     * Returns Chrome version.
     * @returns {number|null}
     */
    getChromeVersion: function () {
        return RTCBrowserType.isChrome() ? browserVersion : null;
    },

    usesPlanB: function() {
        return RTCBrowserType.isChrome() || RTCBrowserType.isOpera() ||
            RTCBrowserType.isTemasysPluginUsed();
    },

    usesUnifiedPlan: function() {
        return RTCBrowserType.isFirefox();
    },

    /**
     * Whether the browser is running on an android device.
     * @returns {boolean}
     */
    isAndroid: function() {
        return isAndroid;
    }

    // Add version getters for other browsers when needed
};

// detectOpera() must be called before detectChrome() !!!
// otherwise Opera wil be detected as Chrome
function detectChrome() {
    if (navigator.webkitGetUserMedia) {
        currentBrowser = RTCBrowserType.RTC_BROWSER_CHROME;
        var userAgent = navigator.userAgent.toLowerCase();
        // We can assume that user agent is chrome, because it's
        // enforced when 'ext' streaming method is set
        var ver = parseInt(userAgent.match(/chrome\/(\d+)\./)[1], 10);
        logger.log("This appears to be Chrome, ver: " + ver);
        return ver;
    }
    return null;
}

function detectOpera() {
    var userAgent = navigator.userAgent;
    if (userAgent.match(/Opera|OPR/)) {
        currentBrowser = RTCBrowserType.RTC_BROWSER_OPERA;
        var version = userAgent.match(/(Opera|OPR) ?\/?(\d+)\.?/)[2];
        logger.info("This appears to be Opera, ver: " + version);
        return version;
    }
    return null;
}

function detectFirefox() {
    if (navigator.mozGetUserMedia) {
        currentBrowser = RTCBrowserType.RTC_BROWSER_FIREFOX;
        var version = parseInt(
            navigator.userAgent.match(/Firefox\/([0-9]+)\./)[1], 10);
        logger.log('This appears to be Firefox, ver: ' + version);
        return version;
    }
    return null;
}

function detectSafari() {
    if ((/^((?!chrome).)*safari/i.test(navigator.userAgent))) {
        currentBrowser = RTCBrowserType.RTC_BROWSER_SAFARI;
        logger.info("This appears to be Safari");
        // FIXME detect Safari version when needed
        return 1;
    }
    return null;
}

function detectIE() {
    var version;
    var ua = window.navigator.userAgent;

    var msie = ua.indexOf('MSIE ');
    if (msie > 0) {
        // IE 10 or older => return version number
        version = parseInt(ua.substring(msie + 5, ua.indexOf('.', msie)), 10);
    }

    var trident = ua.indexOf('Trident/');
    if (!version && trident > 0) {
        // IE 11 => return version number
        var rv = ua.indexOf('rv:');
        version = parseInt(ua.substring(rv + 3, ua.indexOf('.', rv)), 10);
    }

    var edge = ua.indexOf('Edge/');
    if (!version && edge > 0) {
        // IE 12 => return version number
        version = parseInt(ua.substring(edge + 5, ua.indexOf('.', edge)), 10);
    }

    if (version) {
        currentBrowser = RTCBrowserType.RTC_BROWSER_IEXPLORER;
        logger.info("This appears to be IExplorer, ver: " + version);
    }
    return version;
}

function detectNWJS (){
    var userAgent = navigator.userAgent;
    if (userAgent.match(/JitsiMeetNW/)) {
        currentBrowser = RTCBrowserType.RTC_BROWSER_NWJS;
        var version = userAgent.match(/JitsiMeetNW\/([\d.]+)/)[1];
        logger.info("This appears to be JitsiMeetNW, ver: " + version);
        return version;
    }
    return null;
}

function detectReactNative() {
    var match
        = navigator.userAgent.match(/\b(react[ \t_-]*native)(?:\/(\S+))?/i);
    var version;
    // If we're debugging React-Native app, it may be treated as Chrome, which
    // leads to some bugs.
    // So we need to check navigator.product and always return some version
    // even if can't get the real one.
    if (match || navigator.product === "ReactNative") {
        currentBrowser = RTCBrowserType.RTC_BROWSER_REACT_NATIVE;
        if (match && match[2]) {
            version = match[2];
        } else {
            version = "react_native";
        }
        console.info(
            "This appears to be React-Native, ver: " + version);
    }
    return version;
}

function detectBrowser() {
    var version;
    var detectors = [
        detectReactNative,
        detectNWJS,
        detectOpera,
        detectChrome,
        detectFirefox,
        detectIE,
        detectSafari
    ];
    // Try all browser detectors
    for (var i = 0; i < detectors.length; i++) {
        version = detectors[i]();
        if (version)
            return version;
    }
    logger.warn("Browser type defaults to Safari ver 1");
    currentBrowser = RTCBrowserType.RTC_BROWSER_SAFARI;
    return 1;
}

browserVersion = detectBrowser();
isAndroid = navigator.userAgent.indexOf('Android') != -1;

module.exports = RTCBrowserType;
