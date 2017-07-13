/* global chrome, $, alert */

import JitsiTrackError from '../../JitsiTrackError';
import * as JitsiTrackErrors from '../../JitsiTrackErrors';
import RTCBrowserType from './RTCBrowserType';

const logger = require('jitsi-meet-logger').getLogger(__filename);
const GlobalOnErrorHandler = require('../util/GlobalOnErrorHandler');

/**
 * Indicates whether the Chrome desktop sharing extension is installed.
 * @type {boolean}
 */
let chromeExtInstalled = false;

/**
 * Indicates whether an update of the Chrome desktop sharing extension is
 * required.
 * @type {boolean}
 */
let chromeExtUpdateRequired = false;

/**
 * Whether the jidesha extension for firefox is installed for the domain on
 * which we are running. Null designates an unknown value.
 * @type {null}
 */
let firefoxExtInstalled = null;

/**
 * If set to true, detection of an installed firefox extension will be started
 * again the next time obtainScreenOnFirefox is called (e.g. next time the
 * user tries to enable screen sharing).
 */
let reDetectFirefoxExtension = false;

let gumFunction = null;

/**
 * The error returned by chrome when trying to start inline installation from
 * popup.
 */
const CHROME_EXTENSION_POPUP_ERROR
    = 'Inline installs can not be initiated from pop-up windows.';

/**
 * The error returned by chrome when trying to start inline installation from
 * iframe.
 */
const CHROME_EXTENSION_IFRAME_ERROR
    = 'Chrome Web Store installations can only be started by the top frame.';

/**
 * The error message returned by chrome when the extension is installed.
 */
const CHROME_NO_EXTENSION_ERROR_MSG // eslint-disable-line no-unused-vars
    = 'Could not establish connection. Receiving end does not exist.';

/**
 * Handles obtaining a stream from a screen capture on different browsers.
 */
const ScreenObtainer = {
    obtainStream: null,

    /**
     * Initializes the function used to obtain a screen capture
     * (this.obtainStream).
     *
     * @param options {object}
     * @param gum {Function} GUM method
     */
    init(options, gum) {
        let obtainDesktopStream = null;

        // eslint-disable-next-line no-param-reassign
        this.options = options = options || {};
        gumFunction = gum;

        if (this.options.disableDesktopSharing) {
            // Do not initialize any of the methods below
        } else if (RTCBrowserType.isNWJS()) {
            obtainDesktopStream = (_, onSuccess, onFailure) => {
                window.JitsiMeetNW.obtainDesktopStream(
                    onSuccess,
                    (error, constraints) => {
                        let jitsiError;

                        // FIXME:
                        // This is very very durty fix for recognising that the
                        // user have clicked the cancel button from the Desktop
                        // sharing pick window. The proper solution would be to
                        // detect this in the NWJS application by checking the
                        // streamId === "". Even better solution would be to
                        // stop calling GUM from the NWJS app and just pass the
                        // streamId to lib-jitsi-meet. This way the desktop
                        // sharing implementation for NWJS and chrome extension
                        // will be the same and lib-jitsi-meet will be able to
                        // control the constraints, check the streamId, etc.
                        //
                        // I cannot find documentation about "InvalidStateError"
                        // but this is what we are receiving from GUM when the
                        // streamId for the desktop sharing is "".

                        if (error && error.name === 'InvalidStateError') {
                            jitsiError = new JitsiTrackError(
                                JitsiTrackErrors.CHROME_EXTENSION_USER_CANCELED
                            );
                        } else {
                            jitsiError = new JitsiTrackError(
                                error, constraints, [ 'desktop' ]);
                        }
                        (typeof onFailure === 'function')
                            && onFailure(jitsiError);
                    });
            };
        } else if (RTCBrowserType.isElectron()) {
            obtainDesktopStream = this.obtainScreenOnElectron;
        } else if (RTCBrowserType.isTemasysPluginUsed()) {
            // XXX Don't require Temasys unless it's to be used because it
            // doesn't run on React Native, for example.
            const plugin
                = require('./adapter.screenshare').WebRTCPlugin.plugin;

            if (plugin.HasScreensharingFeature) {
                if (plugin.isScreensharingAvailable) {
                    obtainDesktopStream = obtainWebRTCScreen;
                    logger.info('Using Temasys plugin for desktop sharing');
                } else {
                    logger.info(
                        'Screensharing not available with Temasys plugin on'
                            + ' this site');
                }
            } else {
                logger.info(
                    'Screensharing not supported by this plugin version');
            }
        } else if (RTCBrowserType.isChrome()) {
            if (options.desktopSharingChromeDisabled
                || options.desktopSharingChromeMethod === false
                || !options.desktopSharingChromeExtId) {
                // TODO: desktopSharingChromeMethod is deprecated, remove.
                obtainDesktopStream = null;
            } else if (RTCBrowserType.getChromeVersion() >= 34) {
                obtainDesktopStream
                    = this.obtainScreenFromExtension;
                logger.info('Using Chrome extension for desktop sharing');
                initChromeExtension(options);
            } else {
                logger.info('Chrome extension not supported until ver 34');
            }
        } else if (RTCBrowserType.isFirefox()) {
            if (options.desktopSharingFirefoxDisabled) {
                obtainDesktopStream = null;
            } else if (window.location.protocol === 'http:') {
                logger.log('Screen sharing is not supported over HTTP. '
                    + 'Use of HTTPS is required.');
                obtainDesktopStream = null;
            } else {
                initFirefoxExtensionDetection(options);
                obtainDesktopStream = this.obtainScreenOnFirefox;
            }
        }

        if (!obtainDesktopStream) {
            logger.info('Desktop sharing disabled');
        }

        this.obtainStream = obtainDesktopStream;
    },

    /**
     * Checks whether obtaining a screen capture is supported in the current
     * environment.
     * @returns {boolean}
     */
    isSupported() {
        return this.obtainStream !== null;
    },

    /**
     * Obtains a screen capture stream on Firefox.
     * @param callback
     * @param errorCallback
     */
    obtainScreenOnFirefox(options, callback, errorCallback) {
        let extensionRequired = false;
        const { desktopSharingFirefoxMaxVersionExtRequired } = this.options;

        if (desktopSharingFirefoxMaxVersionExtRequired === -1
            || (desktopSharingFirefoxMaxVersionExtRequired >= 0
                && RTCBrowserType.getFirefoxVersion()
                    <= desktopSharingFirefoxMaxVersionExtRequired)) {
            extensionRequired = true;
            logger.log(
                `Jidesha extension required on firefox version ${
                    RTCBrowserType.getFirefoxVersion()}`);
        }

        if (!extensionRequired || firefoxExtInstalled === true) {
            obtainWebRTCScreen(options, callback, errorCallback);

            return;
        }

        if (reDetectFirefoxExtension) {
            reDetectFirefoxExtension = false;
            initFirefoxExtensionDetection(this.options);
        }

        // Give it some (more) time to initialize, and assume lack of
        // extension if it hasn't.
        if (firefoxExtInstalled === null) {
            window.setTimeout(
                () => {
                    if (firefoxExtInstalled === null) {
                        firefoxExtInstalled = false;
                    }
                    this.obtainScreenOnFirefox(callback, errorCallback);
                },
                300);
            logger.log(
                'Waiting for detection of jidesha on firefox to finish.');

            return;
        }

        // We need an extension and it isn't installed.

        // Make sure we check for the extension when the user clicks again.
        firefoxExtInstalled = null;
        reDetectFirefoxExtension = true;

        // Make sure desktopsharing knows that we failed, so that it doesn't get
        // stuck in 'switching' mode.
        errorCallback(
            new JitsiTrackError(JitsiTrackErrors.FIREFOX_EXTENSION_NEEDED));
    },

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
    obtainScreenOnElectron(options = {}, onSuccess, onFailure) {
        if (window.JitsiMeetScreenObtainer
            && window.JitsiMeetScreenObtainer.openDesktopPicker) {
            window.JitsiMeetScreenObtainer.openDesktopPicker(
                {
                    desktopSharingSources:
                        options.desktopSharingSources
                            || this.options.desktopSharingChromeSources
                },
                (streamId, streamType) =>
                    onGetStreamResponse(
                        {
                            streamId,
                            streamType
                        },
                        onSuccess,
                        onFailure
                    ),
                err => onFailure(new JitsiTrackError(
                    JitsiTrackErrors.ELECTRON_DESKTOP_PICKER_ERROR,
                    err
                ))
            );
        } else {
            onFailure(new JitsiTrackError(
                JitsiTrackErrors.ELECTRON_DESKTOP_PICKER_NOT_FOUND));
        }
    },

    /**
     * Asks Chrome extension to call chooseDesktopMedia and gets chrome
     * 'desktop' stream for returned stream token.
     */
    obtainScreenFromExtension(options, streamCallback, failCallback) {
        const {
            desktopSharingChromeExtId,
            desktopSharingChromeSources
        } = this.options;

        const gumOptions = {
            desktopSharingChromeExtId,
            desktopSharingChromeSources:
                options.desktopSharingSources
                    || desktopSharingChromeSources
        };

        if (chromeExtInstalled) {
            doGetStreamFromExtension(
                gumOptions,
                streamCallback,
                failCallback);
        } else {
            if (chromeExtUpdateRequired) {
                /* eslint-disable no-alert */
                alert(
                    'Jitsi Desktop Streamer requires update. '
                    + 'Changes will take effect after next Chrome restart.');

                /* eslint-enable no-alert */
            }

            try {
                chrome.webstore.install(
                    getWebStoreInstallUrl(this.options),
                    arg => {
                        logger.log('Extension installed successfully', arg);
                        chromeExtInstalled = true;

                        // We need to give a moment to the endpoint to become
                        // available.
                        waitForExtensionAfterInstall(this.options, 200, 10)
                            .then(() => {
                                doGetStreamFromExtension(
                                    gumOptions,
                                    streamCallback,
                                    failCallback);
                            })
                            .catch(() => {
                                this.handleExtensionInstallationError(options,
                                    streamCallback, failCallback);
                            });
                    },
                    this.handleExtensionInstallationError.bind(this,
                        options, streamCallback, failCallback)
                );
            } catch (e) {
                this.handleExtensionInstallationError(options, streamCallback,
                    failCallback, e);
            }
        }
    },

    /* eslint-disable max-params */

    handleExtensionInstallationError(options, streamCallback, failCallback, e) {
        const webStoreInstallUrl = getWebStoreInstallUrl(this.options);

        if ((CHROME_EXTENSION_POPUP_ERROR === e
             || CHROME_EXTENSION_IFRAME_ERROR === e)
                && options.interval > 0
                && typeof options.checkAgain === 'function'
                && typeof options.listener === 'function') {
            options.listener('waitingForExtension', webStoreInstallUrl);
            this.checkForChromeExtensionOnInterval(options, streamCallback,
                failCallback, e);

            return;
        }

        const msg
            = `Failed to install the extension from ${webStoreInstallUrl}`;

        logger.log(msg, e);
        failCallback(new JitsiTrackError(
            JitsiTrackErrors.CHROME_EXTENSION_INSTALLATION_ERROR,
            msg));
    },

    /* eslint-enable max-params */

    checkForChromeExtensionOnInterval(options, streamCallback, failCallback) {
        if (options.checkAgain() === false) {
            failCallback(new JitsiTrackError(
                JitsiTrackErrors.CHROME_EXTENSION_INSTALLATION_ERROR));

            return;
        }
        waitForExtensionAfterInstall(this.options, options.interval, 1)
            .then(() => {
                chromeExtInstalled = true;
                options.listener('extensionFound');
                this.obtainScreenFromExtension(options,
                    streamCallback, failCallback);
            })
            .catch(() => {
                this.checkForChromeExtensionOnInterval(options,
                    streamCallback, failCallback);
            });
    }
};

/**
 * Obtains a desktop stream using getUserMedia.
 * For this to work on Chrome, the
 * 'chrome://flags/#enable-usermedia-screen-capture' flag must be enabled.
 *
 * On firefox, the document's domain must be white-listed in the
 * 'media.getusermedia.screensharing.allowed_domains' preference in
 * 'about:config'.
 */
function obtainWebRTCScreen(options, streamCallback, failCallback) {
    gumFunction(
        [ 'screen' ],
        stream => streamCallback({ stream }),
        failCallback
    );
}

/**
 * Constructs inline install URL for Chrome desktop streaming extension.
 * The 'chromeExtensionId' must be defined in options parameter.
 * @param options supports "desktopSharingChromeExtId"
 * @returns {string}
 */
function getWebStoreInstallUrl(options) {
    return (
        `https://chrome.google.com/webstore/detail/${
            options.desktopSharingChromeExtId}`);
}

/**
 * Checks whether an update of the Chrome extension is required.
 * @param minVersion minimal required version
 * @param extVersion current extension version
 * @returns {boolean}
 */
function isUpdateRequired(minVersion, extVersion) {
    try {
        const s1 = minVersion.split('.');
        const s2 = extVersion.split('.');

        const len = Math.max(s1.length, s2.length);

        for (let i = 0; i < len; i++) {
            let n1 = 0,
                n2 = 0;

            if (i < s1.length) {
                n1 = parseInt(s1[i], 10);
            }
            if (i < s2.length) {
                n2 = parseInt(s2[i], 10);
            }

            if (isNaN(n1) || isNaN(n2)) {
                return true;
            } else if (n1 !== n2) {
                return n1 > n2;
            }
        }

        // will happen if both versions have identical numbers in
        // their components (even if one of them is longer, has more components)
        return false;
    } catch (e) {
        GlobalOnErrorHandler.callErrorHandler(e);
        logger.error('Failed to parse extension version', e);

        return true;
    }
}

/**
 *
 * @param callback
 * @param options
 */
function checkChromeExtInstalled(callback, options) {
    if (typeof chrome === 'undefined' || !chrome || !chrome.runtime) {
        // No API, so no extension for sure
        callback(false, false);

        return;
    }
    chrome.runtime.sendMessage(
        options.desktopSharingChromeExtId,
        { getVersion: true },
        response => {
            if (!response || !response.version) {
                // Communication failure - assume that no endpoint exists
                logger.warn(
                    'Extension not installed?: ', chrome.runtime.lastError);
                callback(false, false);

                return;
            }

            // Check installed extension version
            const extVersion = response.version;

            logger.log(`Extension version is: ${extVersion}`);
            const updateRequired
                = isUpdateRequired(
                    options.desktopSharingChromeMinExtVersion,
                    extVersion);

            callback(!updateRequired, updateRequired);
        }
    );
}

/**
 *
 * @param options
 * @param streamCallback
 * @param failCallback
 */
function doGetStreamFromExtension(options, streamCallback, failCallback) {
    // Sends 'getStream' msg to the extension.
    // Extension id must be defined in the config.
    chrome.runtime.sendMessage(
        options.desktopSharingChromeExtId,
        {
            getStream: true,
            sources: options.desktopSharingChromeSources
        },
        response => {
            if (!response) {
                // possibly re-wraping error message to make code consistent
                const lastError = chrome.runtime.lastError;

                failCallback(lastError instanceof Error
                    ? lastError
                    : new JitsiTrackError(
                        JitsiTrackErrors.CHROME_EXTENSION_GENERIC_ERROR,
                        lastError));

                return;
            }
            logger.log('Response from extension: ', response);
            onGetStreamResponse(response, streamCallback, failCallback);
        }
    );
}

/**
 * Initializes <link rel=chrome-webstore-item /> with extension id set in
 * config.js to support inline installs. Host site must be selected as main
 * website of published extension.
 * @param options supports "desktopSharingChromeExtId"
 */
function initInlineInstalls(options) {
    if ($('link[rel=chrome-webstore-item]').length === 0) {
        $('head').append('<link rel="chrome-webstore-item">');
    }
    $('link[rel=chrome-webstore-item]').attr('href',
        getWebStoreInstallUrl(options));
}

/**
 *
 * @param options
 */
function initChromeExtension(options) {
    // Initialize Chrome extension inline installs
    initInlineInstalls(options);

    // Check if extension is installed
    checkChromeExtInstalled((installed, updateRequired) => {
        chromeExtInstalled = installed;
        chromeExtUpdateRequired = updateRequired;
        logger.info(
            `Chrome extension installed: ${chromeExtInstalled
                } updateRequired: ${chromeExtUpdateRequired}`);
    }, options);
}

/**
 * Checks "retries" times on every "waitInterval"ms whether the ext is alive.
 * @param {Object} options the options passed to ScreanObtainer.obtainStream
 * @param {int} waitInterval the number of ms between retries
 * @param {int} retries the number of retries
 * @returns {Promise} returns promise that will be resolved when the extension
 * is alive and rejected if the extension is not alive even after "retries"
 * checks
 */
function waitForExtensionAfterInstall(options, waitInterval, retries) {
    if (retries === 0) {
        return Promise.reject();
    }

    return new Promise((resolve, reject) => {
        let currentRetries = retries;
        const interval = window.setInterval(() => {
            checkChromeExtInstalled(installed => {
                if (installed) {
                    window.clearInterval(interval);
                    resolve();
                } else {
                    currentRetries--;
                    if (currentRetries === 0) {
                        reject();
                        window.clearInterval(interval);
                    }
                }
            }, options);
        }, waitInterval);
    });
}

/**
 * Handles response from external application / extension and calls GUM to
 * receive the desktop streams or reports error.
 * @param {object} response
 * @param {string} response.streamId - the streamId for the desktop stream
 * @param {string} response.error - error to be reported.
 * @param {Function} onSuccess - callback for success.
 * @param {Function} onFailure - callback for failure.
 */
function onGetStreamResponse(
        { streamId, streamType, error },
        onSuccess,
        onFailure) {
    if (streamId) {
        gumFunction(
            [ 'desktop' ],
            stream => onSuccess({
                stream,
                sourceId: streamId,
                sourceType: streamType
            }),
            onFailure,
            { desktopStream: streamId });
    } else {
        // As noted in Chrome Desktop Capture API:
        // If user didn't select any source (i.e. canceled the prompt)
        // then the callback is called with an empty streamId.
        if (streamId === '') {
            onFailure(new JitsiTrackError(
                JitsiTrackErrors.CHROME_EXTENSION_USER_CANCELED));

            return;
        }

        onFailure(new JitsiTrackError(
            JitsiTrackErrors.CHROME_EXTENSION_GENERIC_ERROR,
            error));
    }
}

/**
 * Starts the detection of an installed jidesha extension for firefox.
 * @param options supports "desktopSharingFirefoxDisabled",
 * "desktopSharingFirefoxExtId"
 */
function initFirefoxExtensionDetection(options) {
    if (options.desktopSharingFirefoxDisabled) {
        return;
    }
    if (firefoxExtInstalled === false || firefoxExtInstalled === true) {
        return;
    }
    if (!options.desktopSharingFirefoxExtId) {
        firefoxExtInstalled = false;

        return;
    }

    const img = document.createElement('img');

    img.onload = () => {
        logger.log('Detected firefox screen sharing extension.');
        firefoxExtInstalled = true;
    };
    img.onerror = () => {
        logger.log('Detected lack of firefox screen sharing extension.');
        firefoxExtInstalled = false;
    };

    // The jidesha extension exposes an empty image file under the url:
    // "chrome://EXT_ID/content/DOMAIN.png"
    // Where EXT_ID is the ID of the extension with "@" replaced by ".", and
    // DOMAIN is a domain whitelisted by the extension.
    const src
        = `chrome://${options.desktopSharingFirefoxExtId.replace('@', '.')
            }/content/${document.location.hostname}.png`;

    img.setAttribute('src', src);
}

export default ScreenObtainer;
