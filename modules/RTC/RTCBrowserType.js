import { getLogger } from 'jitsi-meet-logger';

let browserVersion; // eslint-disable-line prefer-const

let currentBrowser;

const logger = getLogger(__filename);

const RTCBrowserType = {

    RTC_BROWSER_CHROME: 'rtc_browser.chrome',

    RTC_BROWSER_OPERA: 'rtc_browser.opera',

    RTC_BROWSER_FIREFOX: 'rtc_browser.firefox',

    RTC_BROWSER_IEXPLORER: 'rtc_browser.iexplorer',

    RTC_BROWSER_SAFARI: 'rtc_browser.safari',

    RTC_BROWSER_NWJS: 'rtc_browser.nwjs',

    RTC_BROWSER_ELECTRON: 'rtc_browser.electron',

    RTC_BROWSER_REACT_NATIVE: 'rtc_browser.react-native',

    /**
     * Tells whether or not the <tt>MediaStream/tt> is removed from
     * the <tt>PeerConnection</tt> and disposed on video mute (in order to turn
     * off the camera device).
     * @return {boolean} <tt>true</tt> if the current browser supports this
     * strategy or <tt>false</tt> otherwise.
     */
    doesVideoMuteByStreamRemove() {
        return !RTCBrowserType.isFirefox();
    },

    /**
     * Gets current browser type.
     * @returns {string}
     */
    getBrowserType() {
        return currentBrowser;
    },

    /**
     * Gets current browser name, split from the type.
     * @returns {string}
     */
    getBrowserName() {
        const isAndroid = navigator.userAgent.indexOf('Android') !== -1;

        if (isAndroid) {
            return 'android';
        }

        return currentBrowser.split('rtc_browser.')[1];
    },

    /**
     * Checks if current browser is Chrome.
     * @returns {boolean}
     */
    isChrome() {
        return currentBrowser === RTCBrowserType.RTC_BROWSER_CHROME;
    },

    /**
     * Checks if current browser is Opera.
     * @returns {boolean}
     */
    isOpera() {
        return currentBrowser === RTCBrowserType.RTC_BROWSER_OPERA;
    },

    /**
     * Checks if current browser is Firefox.
     * @returns {boolean}
     */
    isFirefox() {
        return currentBrowser === RTCBrowserType.RTC_BROWSER_FIREFOX;
    },

    /**
     * Checks if current browser is Internet Explorer.
     * @returns {boolean}
     */
    isIExplorer() {
        return currentBrowser === RTCBrowserType.RTC_BROWSER_IEXPLORER;
    },

    /**
     * Checks if current browser is Safari.
     * @returns {boolean}
     */
    isSafari() {
        return currentBrowser === RTCBrowserType.RTC_BROWSER_SAFARI;
    },

    /**
     * Checks if current environment is NWJS.
     * @returns {boolean}
     */
    isNWJS() {
        return currentBrowser === RTCBrowserType.RTC_BROWSER_NWJS;
    },

    /**
     * Checks if current environment is Electron.
     * @returns {boolean}
     */
    isElectron() {
        return currentBrowser === RTCBrowserType.RTC_BROWSER_ELECTRON;
    },

    /**
     * Check whether or not the current browser support peer to peer connections
     * @return {boolean} <tt>true</tt> if p2p is supported or <tt>false</tt>
     * otherwise.
     */
    isP2PSupported() {
        return !RTCBrowserType.isFirefox() && !RTCBrowserType.isReactNative();
    },

    /**
     * Checks if current environment is React Native.
     * @returns {boolean}
     */
    isReactNative() {
        return currentBrowser === RTCBrowserType.RTC_BROWSER_REACT_NATIVE;
    },

    /**
     * Checks if Temasys RTC plugin is used.
     * @returns {boolean}
     */
    isTemasysPluginUsed() {
        // Temasys do not support Microsoft Edge:
        // http://support.temasys.com.sg/support/solutions/articles/
        // 5000654345-can-the-temasys-webrtc-plugin-be-used-with-microsoft-edge-
        return (
            RTCBrowserType.isSafari()
            || (RTCBrowserType.isIExplorer()
                && RTCBrowserType.getIExplorerVersion() < 12)
        );
    },

    /**
     * Checks if the current browser triggers 'onmute'/'onunmute' events when
     * user's connection is interrupted and the video stops playback.
     * @returns {*|boolean} 'true' if the event is supported or 'false'
     * otherwise.
     */
    isVideoMuteOnConnInterruptedSupported() {
        return RTCBrowserType.isChrome();
    },

    /**
     * Returns Firefox version.
     * @returns {number|null}
     */
    getFirefoxVersion() {
        return RTCBrowserType.isFirefox() ? browserVersion : null;
    },

    /**
     * Returns Chrome version.
     * @returns {number|null}
     */
    getChromeVersion() {
        return RTCBrowserType.isChrome() ? browserVersion : null;
    },

    /**
     * Returns Internet Explorer version.
     *
     * @returns {number|null}
     */
    getIExplorerVersion() {
        return RTCBrowserType.isIExplorer() ? browserVersion : null;
    },

    usesPlanB() {
        return !RTCBrowserType.usesUnifiedPlan();
    },

    usesUnifiedPlan() {
        return RTCBrowserType.isFirefox();
    },

    /**
     * Whether jitsi-meet supports simulcast on the current browser.
     * @returns {boolean}
     */
    supportsSimulcast() {
        // This mirrors what sdp-simulcast uses (which is used when deciding
        // whether to actually enable simulcast or not).
        // TODO: the logic should be in one single place.
        return window.chrome !== undefined;
    },

    supportsRtx() {
        return !RTCBrowserType.isFirefox();
    }

    // Add version getters for other browsers when needed
};

/**
 * detectOpera() must be called before detectChrome() !!!
 * otherwise Opera wil be detected as Chrome
 */
function detectChrome() {
    if (navigator.webkitGetUserMedia) {
        currentBrowser = RTCBrowserType.RTC_BROWSER_CHROME;
        const userAgent = navigator.userAgent.toLowerCase();

        // We can assume that user agent is chrome, because it's
        // enforced when 'ext' streaming method is set
        const ver = parseInt(userAgent.match(/chrome\/(\d+)\./)[1], 10);

        logger.log(`This appears to be Chrome, ver: ${ver}`);

        return ver;
    }

    return null;
}

/**
 *
 */
function detectOpera() {
    const userAgent = navigator.userAgent;

    if (userAgent.match(/Opera|OPR/)) {
        currentBrowser = RTCBrowserType.RTC_BROWSER_OPERA;
        const version = userAgent.match(/(Opera|OPR) ?\/?(\d+)\.?/)[2];

        logger.info(`This appears to be Opera, ver: ${version}`);

        return version;
    }

    return null;
}

/**
 *
 */
function detectFirefox() {
    if (navigator.mozGetUserMedia) {
        currentBrowser = RTCBrowserType.RTC_BROWSER_FIREFOX;
        const version = parseInt(
            navigator.userAgent.match(/Firefox\/([0-9]+)\./)[1], 10);

        logger.log(`This appears to be Firefox, ver: ${version}`);

        return version;
    }

    return null;
}

/**
 *
 */
function detectSafari() {
    if (/^((?!chrome).)*safari/i.test(navigator.userAgent)) {
        currentBrowser = RTCBrowserType.RTC_BROWSER_SAFARI;
        logger.info('This appears to be Safari');

        // FIXME detect Safari version when needed
        return 1;
    }

    return null;
}

/**
 *
 */
function detectIE() {
    let version;
    const ua = window.navigator.userAgent;

    const msie = ua.indexOf('MSIE ');

    if (msie > 0) {
        // IE 10 or older => return version number
        version = parseInt(ua.substring(msie + 5, ua.indexOf('.', msie)), 10);
    }

    const trident = ua.indexOf('Trident/');

    if (!version && trident > 0) {
        // IE 11 => return version number
        const rv = ua.indexOf('rv:');

        version = parseInt(ua.substring(rv + 3, ua.indexOf('.', rv)), 10);
    }

    const edge = ua.indexOf('Edge/');

    if (!version && edge > 0) {
        // IE 12 => return version number
        version = parseInt(ua.substring(edge + 5, ua.indexOf('.', edge)), 10);
    }

    if (version) {
        currentBrowser = RTCBrowserType.RTC_BROWSER_IEXPLORER;
        logger.info(`This appears to be IExplorer, ver: ${version}`);
    }

    return version;
}

/**
 * Detects Electron environment.
 */
function detectElectron() {
    const userAgent = navigator.userAgent;

    if (userAgent.match(/Electron/)) {
        currentBrowser = RTCBrowserType.RTC_BROWSER_ELECTRON;
        const version = userAgent.match(/Electron\/([\d.]+)/)[1];

        logger.info(`This appears to be Electron, ver: ${version}`);

        return version;
    }

    return null;
}

/**
 *
 */
function detectNWJS() {
    const userAgent = navigator.userAgent;

    if (userAgent.match(/JitsiMeetNW/)) {
        currentBrowser = RTCBrowserType.RTC_BROWSER_NWJS;
        const version = userAgent.match(/JitsiMeetNW\/([\d.]+)/)[1];

        logger.info(`This appears to be JitsiMeetNW, ver: ${version}`);

        return version;
    }

    return null;
}

/**
 *
 */
function detectReactNative() {
    const match
        = navigator.userAgent.match(/\b(react[ \t_-]*native)(?:\/(\S+))?/i);
    let version;

    // If we're remote debugging a React Native app, it may be treated as
    // Chrome. Check navigator.product as well and always return some version
    // even if we can't get the real one.

    if (match || navigator.product === 'ReactNative') {
        currentBrowser = RTCBrowserType.RTC_BROWSER_REACT_NATIVE;
        let name;

        if (match && match.length > 2) {
            name = match[1];
            version = match[2];
        }
        name || (name = 'react-native');
        version || (version = 'unknown');
        console.info(`This appears to be ${name}, ver: ${version}`);
    } else {
        // We're not running in a React Native environment.
        version = null;
    }

    return version;
}

/**
 *
 */
function detectBrowser() {
    let version;
    const detectors = [
        detectReactNative,
        detectElectron,
        detectNWJS,
        detectOpera,
        detectChrome,
        detectFirefox,
        detectIE,
        detectSafari
    ];

    // Try all browser detectors

    for (let i = 0; i < detectors.length; i++) {
        version = detectors[i]();
        if (version) {
            return version;
        }
    }
    logger.warn('Browser type defaults to Safari ver 1');
    currentBrowser = RTCBrowserType.RTC_BROWSER_SAFARI;

    return 1;
}

browserVersion = detectBrowser();

module.exports = RTCBrowserType;
