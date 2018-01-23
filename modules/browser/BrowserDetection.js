import bowser from 'bowser';
import { getLogger } from 'jitsi-meet-logger';

import {
    CHROME,
    OPERA,
    FIREFOX,
    INTERNET_EXPLORER,
    EDGE,
    SAFARI,
    NWJS,
    ELECTRON,
    REACT_NATIVE
} from './browsers';

const logger = getLogger(__filename);

/**
 * Maps the names of the browsers from bowser to the internal names defined in
 * ./browsers.js
 */
const bowserNameToJitsiName = {
    'Chrome': CHROME,
    'Opera': OPERA,
    'Firefox': FIREFOX,
    'Internet Explorer': INTERNET_EXPLORER,
    'Microsoft Edge': EDGE,
    'Safari': SAFARI
};

/**
 * Detects Electron environment.
 *
 * @returns {Object} - The name (ELECTRON) and version.
 */
function _detectElectron() {
    const userAgent = navigator.userAgent;

    if (userAgent.match(/Electron/)) {
        const version = userAgent.match(/Electron\/([\d.]+)/)[1];

        logger.info(`This appears to be Electron, ver: ${version}`);

        return {
            name: ELECTRON,
            version
        };
    }
}

/**
 * Detects NWJS environment.
 *
 * @returns {Object} - The name (NWJS) and version.
 */
function _detectNWJS() {
    const userAgent = navigator.userAgent;

    if (userAgent.match(/JitsiMeetNW/)) {
        const version = userAgent.match(/JitsiMeetNW\/([\d.]+)/)[1];

        logger.info(`This appears to be JitsiMeetNW, ver: ${version}`);

        return {
            name: NWJS,
            version
        };
    }
}

/**
 * Detects React Native environment.
 * @returns {Object} - The name (REACT_NATIVE) and version
 */
function _detectReactNative() {
    const match
        = navigator.userAgent.match(/\b(react[ \t_-]*native)(?:\/(\S+))?/i);
    let version;

    // If we're remote debugging a React Native app, it may be treated as
    // Chrome. Check navigator.product as well and always return some version
    // even if we can't get the real one.

    if (match || navigator.product === 'ReactNative') {
        let name;

        if (match && match.length > 2) {
            name = match[1];
            version = match[2];
        }
        name || (name = 'react-native');
        version || (version = 'unknown');
        logger.info(`This appears to be ${name}, ver: ${version}`);

        return {
            name: REACT_NATIVE,
            version
        };
    }
}

/**
 * Returns information about the current browser.
 *
 * @returns {Object} - The name and version of the browser.
 */
function _detect() {
    let browserInfo;
    const detectors = [
        _detectReactNative,
        _detectElectron,
        _detectNWJS
    ];

    // Try all browser detectors
    for (let i = 0; i < detectors.length; i++) {
        browserInfo = detectors[i]();
        if (browserInfo) {
            return browserInfo;
        }
    }

    const { name, version } = bowser;

    if (name in bowserNameToJitsiName) {
        return {
            name: bowserNameToJitsiName[name],
            version
        };
    }

    logger.warn('Browser type defaults to Safari ver 1');

    return {
        name: SAFARI,
        version: '1'
    };
}

/**
 * Implements browser detection.
 */
export default class BrowserDetection {
    /**
     * Creates new BrowserDetection instance.
     *
     * @param {Object} [browserInfo] - Information about the browser.
     * @param {string} browserInfo.name - The name of the browser.
     * @param {string} browserInfo.version - The version of the browser.
     */
    constructor(browserInfo = _detect()) {
        const { name, version } = browserInfo;

        this._name = name;
        this._version = version;
    }

    /**
     * Gets current browser name.
     * @returns {string}
     */
    getName() {
        return this._name;
    }

    /**
     * Checks if current browser is Chrome.
     * @returns {boolean}
     */
    isChrome() {
        return this._name === CHROME;
    }

    /**
     * Checks if current browser is Opera.
     * @returns {boolean}
     */
    isOpera() {
        return this._name === OPERA;
    }

    /**
     * Checks if current browser is Firefox.
     * @returns {boolean}
     */
    isFirefox() {
        return this._name === FIREFOX;
    }

    /**
     * Checks if current browser is Internet Explorer.
     * @returns {boolean}
     */
    isIExplorer() {
        return this._name === INTERNET_EXPLORER;
    }

    /**
     * Checks if current browser is Microsoft Edge.
     * @returns {boolean}
     */
    isEdge() {
        return this._name === EDGE;
    }

    /**
     * Checks if current browser is Safari.
     * @returns {boolean}
     */
    isSafari() {
        return this._name === SAFARI;
    }

    /**
     * Checks if current environment is NWJS.
     * @returns {boolean}
     */
    isNWJS() {
        return this._name === NWJS;
    }

    /**
     * Checks if current environment is Electron.
     * @returns {boolean}
     */
    isElectron() {
        return this._name === ELECTRON;
    }

    /**
     * Checks if current environment is React Native.
     * @returns {boolean}
     */
    isReactNative() {
        return this._name === REACT_NATIVE;
    }

    /**
     * Returns the version of the current browser.
     * @returns {string}
     */
    getVersion() {
        return this._version;
    }

    /**
     * Compares the passed version with the current browser version.
     * {@see https://github.com/lancedikson/bowser}
     */
    static compareVersions = bowser.compareVersions;

    /**
     * Compares the passed version with the current browser version.
     *
     * @param {string} version - The version to compare with.
     * @returns {number|undefined} - Returns 0 if the version is equal to the
     * current one, 1 if the version is greater than the current one, -1 if the
     * version is lower than the current one and undefined if the current
     * browser version is unknown.
     */
    compareVersion(version) {
        if (this._version) {
            return bowser.compareVersions([ version, this._version ]);
        }
    }

    /**
     * Compares the passed version with the current browser version.
     *
     * @param {string} version - The version to compare with.
     * @returns {boolean|undefined} - Returns true if the current version is
     * greater than the passed version and false otherwise.
     */
    isVersionGreaterThan(version) {
        if (this._version) {
            return this.compareVersion(version) === -1;
        }
    }

    /**
     * Compares the passed version with the current browser version.
     *
     * @param {string} version - The version to compare with.
     * @returns {boolean|undefined} - Returns true if the current version is
     * lower than the passed version and false otherwise.
     */
    isVersionLessThan(version) {
        if (this._version) {
            return this.compareVersion(version) === 1;
        }
    }

    /**
     * Compares the passed version with the current browser version.
     *
     * @param {string} version - The version to compare with.
     * @returns {boolean|undefined} - Returns true if the current version is
     * equal to the passed version and false otherwise.
     */
    isVersionEqualTo(version) {
        if (this._version) {
            return this.compareVersion(version) === 0;
        }
    }
}
