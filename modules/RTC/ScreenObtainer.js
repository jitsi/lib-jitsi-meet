
import JitsiTrackError from '../../JitsiTrackError';
import * as JitsiTrackErrors from '../../JitsiTrackErrors';
import browser from '../browser';

const logger = require('jitsi-meet-logger').getLogger(__filename);

let gumFunction = null;

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

    obtainStream: null,

    /**
     * Initializes the function used to obtain a screen capture
     * (this.obtainStream).
     *
     * @param {object} options
     * @param {Function} gum GUM method
     */
    init(options = {}, gum) {
        this.options = options;
        gumFunction = gum;

        this.obtainStream = this._createObtainStreamMethod();

        if (!this.obtainStream) {
            logger.info('Desktop sharing disabled');
        }
    },

    /**
     * Returns a method which will be used to obtain the screen sharing stream
     * (based on the browser type).
     *
     * @returns {Function}
     * @private
     */
    _createObtainStreamMethod() {
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
                                JitsiTrackErrors.SCREENSHARING_USER_CANCELED
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
        } else if (browser.isReactNative() && browser.supportsGetDisplayMedia()) {
            return this.obtainScreenFromGetDisplayMediaRN;
        } else if (browser.supportsGetDisplayMedia()) {
            return this.obtainScreenFromGetDisplayMedia;
        }
        logger.log('Screen sharing not supported on ', browser.getName());

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
                    desktopSharingSources: desktopSharingSources || [ 'screen', 'window' ]
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

        const { audioQuality } = this.options;
        const audio = audioQuality?.stereo ? {
            autoGainControl: false,
            channelCount: 2,
            echoCancellation: false,
            noiseSuppression: false
        } : true;

        getDisplayMedia({
            video: true,
            audio,
            cursor: 'always'
        })
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
            .catch(error => {
                const errorDetails = {
                    errorName: error && error.name,
                    errorMsg: error && error.message,
                    errorStack: error && error.stack
                };

                logger.error('getDisplayMedia error', errorDetails);

                if (errorDetails.errorMsg && errorDetails.errorMsg.indexOf('denied by system') !== -1) {
                    // On Chrome this is the only thing different between error returned when user cancels
                    // and when no permission was given on the OS level.
                    errorCallback(new JitsiTrackError(JitsiTrackErrors.PERMISSION_DENIED));

                    return;
                }

                errorCallback(new JitsiTrackError(JitsiTrackErrors.SCREENSHARING_USER_CANCELED));
            });
    },

    /**
     * Obtains a screen capture stream using getDisplayMedia.
     *
     * @param callback - The success callback.
     * @param errorCallback - The error callback.
     */
    obtainScreenFromGetDisplayMediaRN(options, callback, errorCallback) {
        logger.info('Using getDisplayMedia for screen sharing');

        navigator.mediaDevices.getDisplayMedia({ video: true })
            .then(stream => {
                callback({
                    stream,
                    sourceId: stream.id });
            })
            .catch(() => {
                errorCallback(new JitsiTrackError(JitsiTrackErrors
                    .SCREENSHARING_USER_CANCELED));
            });
    }
};

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
                JitsiTrackErrors.SCREENSHARING_USER_CANCELED));

            return;
        }

        onFailure(new JitsiTrackError(
            JitsiTrackErrors.SCREENSHARING_GENERIC_ERROR,
            error));
    }
}

export default ScreenObtainer;
