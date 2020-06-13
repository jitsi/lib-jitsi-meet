/* global chrome, $, alert */

import JitsiTrackError from '../../JitsiTrackError';
import * as JitsiTrackErrors from '../../JitsiTrackErrors';
import browser from '../browser';

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

let gumFunction = null;

/**
 * The error message returned by chrome when the extension is installed.
 */
const CHROME_NO_EXTENSION_ERROR_MSG // eslint-disable-line no-unused-vars
    = 'Could not establish connection. Receiving end does not exist.';

/**
 * Handles obtaining a stream from a screen capture on different browsers.
 */
const ScreenObtainer = {
    /**
     * If not <tt>null</tt> it means that the initialization process is still in
     * progress. It is used to make desktop stream request wait and continue
     * after it's done.
     * {@type Promise|null}
     */
    intChromeExtPromise: null,

    obtainStream: null,

    /**
     * Initializes the function used to obtain a screen capture
     * (this.obtainStream).
     *
     * @param {object} options
     * @param {boolean} [options.desktopSharingChromeDisabled]
     * @param {boolean} [options.desktopSharingChromeExtId]
     * @param {boolean} [options.desktopSharingFirefoxDisabled]
     * @param {Function} gum GUM method
     */
    init(options = {
        desktopSharingChromeDisabled: false,
        desktopSharingChromeExtId: null,
        desktopSharingFirefoxDisabled: false
    }, gum) {
        this.options = options;
        gumFunction = gum;

        this.obtainStream = this._createObtainStreamMethod(options);

        if (!this.obtainStream) {
            logger.info('Desktop sharing disabled');
        }
    },

    /**
     * Returns a method which will be used to obtain the screen sharing stream
     * (based on the browser type).
     *
     * @param {object} options passed from {@link init} - check description
     * there
     * @returns {Function}
     * @private
     */
    _createObtainStreamMethod(options) {
        if (browser.isNWJS()) {
            return (_, onSuccess, onFailure) => {
                window.JitsiMeetNW.obtainDesktopStream(
                    onSuccess,
                    (error, constraints) => {
                        let jitsiError;

                        // FIXME:
                        // This is very very dirty fix for recognising that the
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
        } else if (browser.isElectron()) {
            return this.obtainScreenOnElectron;
        } else if (browser.isChrome() || browser.isOpera()) {
            if (browser.supportsGetDisplayMedia()
                    && !options.desktopSharingChromeDisabled) {

                return this.obtainScreenFromGetDisplayMedia;
            } else if (options.desktopSharingChromeDisabled
                || !options.desktopSharingChromeExtId) {

                return null;
            }

            logger.info('Using Chrome extension for desktop sharing');
            this.intChromeExtPromise
                = initChromeExtension(options).then(() => {
                    this.intChromeExtPromise = null;
                });

            return this.obtainScreenFromExtension;
        } else if (browser.isFirefox()) {
            if (options.desktopSharingFirefoxDisabled) {
                return null;
            } else if (browser.supportsGetDisplayMedia()) {
                // Firefox 66 support getDisplayMedia
                return this.obtainScreenFromGetDisplayMedia;
            }

            // Legacy Firefox
            return this.obtainScreenOnFirefox;
        } else if (browser.isSafari() && browser.supportsGetDisplayMedia()) {
            return this.obtainScreenFromGetDisplayMedia;
        }

        logger.log(
            'Screen sharing not supported by the current browser: ',
            browser.getName());

        return null;
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
        obtainWebRTCScreen(options.gumOptions, callback, errorCallback);
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
            const { desktopSharingSources, gumOptions } = options;

            window.JitsiMeetScreenObtainer.openDesktopPicker(
                {
                    desktopSharingSources: desktopSharingSources
                        || this.options.desktopSharingChromeSources
                },
                (streamId, streamType, screenShareAudio = false) =>
                    onGetStreamResponse(
                        {
                            response: {
                                streamId,
                                streamType,
                                screenShareAudio
                            },
                            gumOptions
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
        if (this.intChromeExtPromise !== null) {
            this.intChromeExtPromise.then(() => {
                this.obtainScreenFromExtension(
                    options, streamCallback, failCallback);
            });

            return;
        }

        const {
            desktopSharingChromeExtId,
            desktopSharingChromeSources
        } = this.options;

        const {
            gumOptions
        } = options;

        const doGetStreamFromExtensionOptions = {
            desktopSharingChromeExtId,
            desktopSharingChromeSources:
                options.desktopSharingSources || desktopSharingChromeSources,
            gumOptions
        };

        if (chromeExtInstalled) {
            doGetStreamFromExtension(
                doGetStreamFromExtensionOptions,
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

            this.handleExternalInstall(options, streamCallback,
                failCallback);
        }
    },

    /* eslint-disable max-params */

    handleExternalInstall(options, streamCallback, failCallback, e) {
        const webStoreInstallUrl = getWebStoreInstallUrl(this.options);

        options.listener('waitingForExtension', webStoreInstallUrl);
        this.checkForChromeExtensionOnInterval(options, streamCallback,
            failCallback, e);
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
    },

    /**
     * Obtains a screen capture stream using getDisplayMedia.
     *
     * @param callback - The success callback.
     * @param errorCallback - The error callback.
     */
    obtainScreenFromGetDisplayMedia(options, callback, errorCallback) {
        logger.info('Using getDisplayMedia for screen sharing');

        let getDisplayMedia;

        if (navigator.getDisplayMedia) {
            getDisplayMedia = navigator.getDisplayMedia.bind(navigator);
        } else {
            // eslint-disable-next-line max-len
            getDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
        }

        getDisplayMedia({ video: true,
            audio: true })
            .then(stream => {
                let applyConstraintsPromise;

                if (stream
                    && stream.getTracks()
                    && stream.getTracks().length > 0) {
                    const videoTrack = stream.getVideoTracks()[0];

                    // Apply video track constraint.
                    if (videoTrack) {
                        applyConstraintsPromise = videoTrack.applyConstraints(options.trackOptions);
                    }
                } else {
                    applyConstraintsPromise = Promise.resolve();
                }

                applyConstraintsPromise.then(() =>
                    callback({
                        stream,
                        sourceId: stream.id
                    }));
            })
            .catch(() =>
                errorCallback(new JitsiTrackError(JitsiTrackErrors
                    .CHROME_EXTENSION_USER_CANCELED)));
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
    gumFunction([ 'screen' ], options)
        .then(stream => streamCallback({ stream }), failCallback);
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
    const {
        desktopSharingChromeSources,
        desktopSharingChromeExtId,
        gumOptions
    } = options;

    // Sends 'getStream' msg to the extension.
    // Extension id must be defined in the config.
    chrome.runtime.sendMessage(
        desktopSharingChromeExtId,
        {
            getStream: true,
            sources: desktopSharingChromeSources
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
            onGetStreamResponse(
                {
                    response,
                    gumOptions
                },
                streamCallback,
                failCallback
            );
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
 *
 * @return {Promise} - a Promise resolved once the initialization process is
 * finished.
 */
function initChromeExtension(options) {
    // Initialize Chrome extension inline installs
    initInlineInstalls(options);

    return new Promise(resolve => {
        // Check if extension is installed
        checkChromeExtInstalled((installed, updateRequired) => {
            chromeExtInstalled = installed;
            chromeExtUpdateRequired = updateRequired;
            logger.info(
                `Chrome extension installed: ${
                    chromeExtInstalled} updateRequired: ${
                    chromeExtUpdateRequired}`);
            resolve();
        }, options);
    });
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
 * @param {object} options
 * @param {object} options.response
 * @param {string} options.response.streamId - the streamId for the desktop
 * stream.
 * @param {bool}   options.response.screenShareAudio - Used by electron clients to
 * enable system audio screen sharing.
 * @param {string} options.response.error - error to be reported.
 * @param {object} options.gumOptions - options passed to GUM.
 * @param {Function} onSuccess - callback for success.
 * @param {Function} onFailure - callback for failure.
 * @param {object} gumOptions - options passed to GUM.
 */
function onGetStreamResponse(
        options = {
            response: {},
            gumOptions: {}
        },
        onSuccess,
        onFailure) {
    const { streamId, streamType, screenShareAudio, error } = options.response || {};

    if (streamId) {
        const gumOptions = {
            desktopStream: streamId,
            screenShareAudio,
            ...options.gumOptions
        };

        gumFunction([ 'desktop' ], gumOptions)
            .then(stream => onSuccess({
                stream,
                sourceId: streamId,
                sourceType: streamType
            }), onFailure);
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

export default ScreenObtainer;
