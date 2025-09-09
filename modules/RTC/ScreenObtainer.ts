import { getLogger } from '@jitsi/logger';

import JitsiTrackError from '../../JitsiTrackError';
import * as JitsiTrackErrors from '../../JitsiTrackErrors';
import browser from '../browser';

const logger = getLogger('rtc:ScreenObtainer');

/**
 * Interface for desktop sharing frame rate configuration.
 */
interface IFrameRateConfig {
    max?: number;
    min?: number;
}

/**
 * Interface for desktop sharing resolution configuration.
 */
interface IResolutionConfig {
    height?: {
        max?: number;
        min?: number;
    };
    width?: {
        max?: number;
        min?: number;
    };
}

/**
 * Interface for audio quality configuration.
 */
interface IAudioQuality {
    autogainControl?: boolean;
    channelCount?: number;
    echoCancellation?: boolean;
    noiseSuppression?: boolean;
    stereo?: boolean;
}

/**
 * Interface for screen share settings.
 */
interface IScreenShareSettings {
    desktopDisplaySurface?: string;
    desktopPreferCurrentTab?: boolean;
    desktopSelfBrowserSurface?: string;
    desktopSurfaceSwitching?: string;
    desktopSystemAudio?: string;
}


/**
 * Interface for options parameter in obtainScreen methods.
 */
interface IObtainScreenOptions {
    desktopSharingFrameRate?: IFrameRateConfig;
    desktopSharingSources?: string[];
    resolution?: number;
    screenShareSettings?: IScreenShareSettings;
}

/**
 * Interface for audio constraints.
 */
interface IAudioConstraints {
    mandatory?: {
        chromeMediaSource?: string;
        chromeMediaSourceId?: string;
    };
    optional?: {
        autoGainControl?: boolean;
        channelCount?: number;
        echoCancellation?: boolean;
        noiseSuppression?: boolean;
    };
}

/**
 * Interface for legacy video constraints.
 */
interface ILegacyVideoConstraints {
    mandatory: {
        chromeMediaSource: string;
        chromeMediaSourceId: string;
        maxFrameRate: number;
        maxHeight: number;
        maxWidth: number;
        minFrameRate: number;
        minHeight?: number;
        minWidth?: number;
    };
}

/**
 * Interface for modern video constraints.
 */
interface IVideoConstraints {
    displaySurface?: string;
    frameRate?: IFrameRateConfig;
    height?: number;
    width?: number;
}

/**
 * Interface for constraint options.
 */
interface IConstraintOptions {
    preferCurrentTab?: boolean;
    selfBrowserSurface?: string;
    surfaceSwitching?: string;
    systemAudio?: string;
}

/**
 * Interface for getDisplayMedia constraints.
 */
interface IDisplayMediaConstraints {
    audio: boolean | object;
    cursor?: string;
    preferCurrentTab?: boolean;
    selfBrowserSurface?: string;
    surfaceSwitching?: string;
    systemAudio?: string;
    video: boolean | IVideoConstraints;
}

/**
 * Interface for screen obtainer options.
 */
interface IScreenObtainerOptions {
    audioQuality?: IAudioQuality;
    desktopSharingFrameRate?: IFrameRateConfig;
    desktopSharingResolution?: IResolutionConfig;
    desktopSharingSources?: string[];
    resolution?: number;
    screenShareSettings?: IScreenShareSettings;
    testing?: {
        testMode?: boolean;
    };
}

/**
 * Interface for screen capture result.
 */
interface IScreenCaptureResult {
    sourceId: string;
    sourceType?: string;
    stream: MediaStream;
}

/**
 * The default frame rate for Screen Sharing.
 */
export const SS_DEFAULT_FRAME_RATE = 5;

/**
 * Handles obtaining a stream from a screen capture on different browsers.
 */
class ScreenObtainer {
    private _electronSkipDisplayMedia: boolean;
    public obtainStream: Nullable<((
        onSuccess: (result: IScreenCaptureResult) => void,
        onFailure: (error: JitsiTrackError) => void,
        options?: any
    ) => void)>;

    /**
     * @internal
     */
    options: IScreenObtainerOptions;

    constructor() {
        this.obtainStream = this._createObtainStreamMethod();
        this.options = {};
        this._electronSkipDisplayMedia = false;
    }

    /**
     * Initializes the function used to obtain a screen capture
     * (this.obtainStream).
     *
     * @param {object} options
     */
    private init(options: IScreenObtainerOptions = {}) {
        this.options = options;

        if (!this.obtainStream) {
            logger.warn('Desktop sharing not supported');
        }
    }

    /**
     * Returns a method which will be used to obtain the screen sharing stream
     * (based on the browser type).
     *
     * @returns {Function}
     * @private
     */
    private _createObtainStreamMethod() {
        const supportsGetDisplayMedia = browser.supportsGetDisplayMedia();

        if (browser.isElectron()) {
            return this._obtainScreenOnElectron;
        } else if (browser.isReactNative() && supportsGetDisplayMedia) {
            return this.obtainScreenFromGetDisplayMediaRN;
        } else if (supportsGetDisplayMedia) {
            return this._obtainScreenFromGetDisplayMedia;
        }
        logger.warn('Screen sharing not supported on ', browser.getName());

        return null;
    }

    /**
     * Gets the appropriate constraints for audio sharing.
     *
     * @returns {IAudioQuality | boolean}
     */
    private _getAudioConstraints(): boolean | IAudioQuality {
        const { audioQuality } = this.options;
        const audio = audioQuality?.stereo ? {
            autoGainControl: false,
            channelCount: 2,
            echoCancellation: false,
            noiseSuppression: false
        } : true;

        return audio;
    }

    /**
     * Obtains a screen capture stream on Electron.
     *
     * @param onSuccess - Success callback.
     * @param onFailure - Failure callback.
     * @param {Object} options - Optional parameters.
     */
    private _obtainScreenOnElectron(onSuccess: (result: IScreenCaptureResult) => void, onFailure: (error: JitsiTrackError) => void, options: IObtainScreenOptions = {}) {
        if (!this._electronSkipDisplayMedia) {
            // Fall-back to the old API in case of not supported error. This can happen if
            // an old Electron SDK is used with a new Jitsi Meet + lib-jitsi-meet version.
            this._obtainScreenFromGetDisplayMedia(onSuccess, err => {
                if (err.name === JitsiTrackErrors.SCREENSHARING_NOT_SUPPORTED_ERROR) {
                    // Make sure we don't recurse infinitely.
                    this._electronSkipDisplayMedia = true;
                    this._obtainScreenOnElectron(onSuccess, onFailure);
                } else {
                    onFailure(err);
                }
            });

            return;
        }

        // @ts-ignore TODO: legacy flow, remove after the Electron SDK supporting gDM has been out for a while.
        if (typeof window.JitsiMeetScreenObtainer?.openDesktopPicker === 'function') {
            const { desktopSharingFrameRate, desktopSharingResolution, desktopSharingSources } = this.options;

            // @ts-ignore TODO: legacy flow, remove after the Electron SDK supporting gDM has been out for a while.
            window.JitsiMeetScreenObtainer.openDesktopPicker(
                {
                    desktopSharingSources:
                        options.desktopSharingSources || desktopSharingSources || [ 'screen', 'window' ]
                },
                (streamId: string, streamType: string, screenShareAudio = false) => {
                    if (streamId) {
                        let audioConstraints: boolean | IAudioConstraints = false;

                        if (screenShareAudio) {
                            audioConstraints = {};
                            const optionalConstraints = this._getAudioConstraints();

                            if (typeof optionalConstraints !== 'boolean') {
                                audioConstraints = {
                                    optional: optionalConstraints
                                };
                            }

                            // Audio screen sharing for electron only works for screen type devices.
                            // i.e. when the user shares the whole desktop.
                            // Note. The documentation specifies that chromeMediaSourceId should not be present
                            // which, in the case a users has multiple monitors, leads to them being shared all
                            // at once. However we tested with chromeMediaSourceId present and it seems to be
                            // working properly.
                            if (streamType === 'screen') {
                                (audioConstraints as IAudioConstraints).mandatory = {
                                    chromeMediaSource: 'desktop'
                                };
                            }
                        }

                        const constraints: any = {
                            audio: audioConstraints,
                            video: {
                                mandatory: {
                                    chromeMediaSource: 'desktop',
                                    chromeMediaSourceId: streamId,
                                    maxFrameRate: desktopSharingFrameRate?.max ?? SS_DEFAULT_FRAME_RATE,
                                    maxHeight: desktopSharingResolution?.height?.max ?? window.screen.height,
                                    maxWidth: desktopSharingResolution?.width?.max ?? window.screen.width,
                                    minFrameRate: desktopSharingFrameRate?.min ?? SS_DEFAULT_FRAME_RATE,
                                    minHeight: desktopSharingResolution?.height?.min,
                                    minWidth: desktopSharingResolution?.width?.min
                                }
                            } as ILegacyVideoConstraints
                        };

                        // We have to use the old API on Electron to get a desktop stream.
                        navigator.mediaDevices.getUserMedia(constraints)
                            .then(stream => {
                                this.setContentHint(stream);
                                onSuccess({
                                    sourceId: streamId,
                                    sourceType: streamType,
                                    stream
                                });
                            })
                            .catch(err => onFailure(err));
                    } else {
                        // As noted in Chrome Desktop Capture API:
                        // If user didn't select any source (i.e. canceled the prompt)
                        // then the callback is called with an empty streamId.
                        onFailure(new JitsiTrackError(JitsiTrackErrors.SCREENSHARING_USER_CANCELED));
                    }
                },
                err => onFailure(new JitsiTrackError(
                    JitsiTrackErrors.ELECTRON_DESKTOP_PICKER_ERROR,
                    err
                ))
            );
        } else {
            onFailure(new JitsiTrackError(JitsiTrackErrors.ELECTRON_DESKTOP_PICKER_NOT_FOUND));
        }
    }

    /**
     * Obtains a screen capture stream using getDisplayMedia.
     *
     * @param callback - The success callback.
     * @param errorCallback - The error callback.
     * @param {Object} options - Optional parameters.
     */
    private _obtainScreenFromGetDisplayMedia(callback: (result: IScreenCaptureResult) => void, errorCallback: (error: JitsiTrackError) => void, options: IObtainScreenOptions = {}) {
        let getDisplayMedia;

        // @ts-ignore Property 'getDisplayMedia' does not exist on type 'Navigator'
        if (navigator.getDisplayMedia) {
            // @ts-ignore Property 'getDisplayMedia' does not exist on type 'Navigator'
            getDisplayMedia = navigator.getDisplayMedia.bind(navigator);
        } else {
            // eslint-disable-next-line max-len
            getDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
        }

        const audio = this._getAudioConstraints();
        let video: boolean | IVideoConstraints = {};
        const constraintOpts: IConstraintOptions = {};

        // The options passed to this method should take precedence over the global settings.
        const {
            desktopSharingFrameRate = this.options?.desktopSharingFrameRate,
            resolution = this.options?.resolution,
            screenShareSettings = this.options?.screenShareSettings
        } = options;

        if (typeof desktopSharingFrameRate === 'object') {
            video.frameRate = desktopSharingFrameRate;
        }

        // At the time of this writing 'min' constraint for fps is not supported by getDisplayMedia on any of the
        // browsers. getDisplayMedia will fail with an error "invalid constraints" in this case.
        video.frameRate && delete video.frameRate.min;

        if (browser.isChromiumBased()) {
            // Show users the current tab is the preferred capture source, default: false.
            browser.isEngineVersionGreaterThan(93)
                && (constraintOpts.preferCurrentTab = screenShareSettings?.desktopPreferCurrentTab || false);

            // Allow users to select system audio, default: include.
            browser.isEngineVersionGreaterThan(104)
                && (constraintOpts.systemAudio = screenShareSettings?.desktopSystemAudio || 'include');

            // Allow users to seamlessly switch which tab they are sharing without having to select the tab again.
            browser.isEngineVersionGreaterThan(106)
                && (constraintOpts.surfaceSwitching = screenShareSettings?.desktopSurfaceSwitching || 'include');

            // Allow a user to be shown a preference for what screen is to be captured, default: unset.
            browser.isEngineVersionGreaterThan(106) && screenShareSettings?.desktopDisplaySurface
                && (video.displaySurface = screenShareSettings?.desktopDisplaySurface);

            // Allow users to select the current tab as a capture source, default: exclude.
            browser.isEngineVersionGreaterThan(111)
                && (constraintOpts.selfBrowserSurface = screenShareSettings?.desktopSelfBrowserSurface || 'exclude');

            // Set bogus resolution constraints to work around
            // https://bugs.chromium.org/p/chromium/issues/detail?id=1056311 for low fps screenshare. Capturing SS at
            // very high resolutions restricts the framerate. Therefore, skip this hack when capture fps > 5 fps.
            if (!(desktopSharingFrameRate?.max > SS_DEFAULT_FRAME_RATE)) {
                video.height = 99999;
                video.width = 99999;
            }
        }

        // Allow a user to be shown a preference for what screen is to be captured.
        if (browser.isSafari() && screenShareSettings?.desktopDisplaySurface) {
            video.displaySurface = screenShareSettings?.desktopDisplaySurface;
        }

        if (Object.keys(video).length === 0) {
            video = true;
        }

        const constraints = {
            audio,
            video,
            ...constraintOpts,
            cursor: 'always'
        } as IDisplayMediaConstraints;

        logger.info('Using getDisplayMedia for screen sharing', constraints);

        getDisplayMedia(constraints)
            .then(stream => {
                this.setContentHint(stream);

                // Apply min fps constraints to the track so that 0Hz mode doesn't kick in.
                // https://bugs.chromium.org/p/webrtc/issues/detail?id=15539
                if (browser.isChromiumBased()) {
                    const track = stream.getVideoTracks()[0];
                    let minFps = SS_DEFAULT_FRAME_RATE;

                    if (typeof desktopSharingFrameRate?.min === 'number' && desktopSharingFrameRate.min > 0) {
                        minFps = desktopSharingFrameRate.min;
                    }

                    const trackConstraints: any = {
                        frameRate: {
                            min: minFps
                        }
                    };

                    // Set the resolution if it is specified in the options. This is currently only enabled for testing.
                    // Note that this may result in browser crashes if the shared window is resized due to browser bugs
                    // like https://issues.chromium.org/issues/40672396
                    if (resolution && this.options.testing?.testMode) {
                        trackConstraints.height = resolution;
                        trackConstraints.width = Math.floor(resolution * 16 / 9);
                    }

                    try {
                        track.applyConstraints(trackConstraints);
                    } catch (err) {
                        logger.warn(`Min fps=${minFps} constraint could not be applied on the desktop track,`
                            + `${err.message}`);
                    }
                }

                const videoTracks = stream?.getVideoTracks();
                const track = videoTracks?.length > 0 ? videoTracks[0] : undefined;
                const { deviceId } = track?.getSettings() ?? {};

                callback({
                    // Used by remote-control to identify the display that is currently shared.
                    sourceId: deviceId ?? stream.id,
                    stream
                });
            })
            .catch(error => {
                const errorDetails = {
                    errorCode: error.code,
                    errorMsg: error.message,
                    errorName: error.name,
                    errorStack: error.stack
                };

                logger.warn('getDisplayMedia error', JSON.stringify(constraints), JSON.stringify(errorDetails));

                if (errorDetails.errorCode === DOMException.NOT_SUPPORTED_ERR) {
                    // This error is thrown when an Electron client has not set a permissions handler.
                    errorCallback(new JitsiTrackError(JitsiTrackErrors.SCREENSHARING_NOT_SUPPORTED_ERROR));
                } else if (errorDetails.errorMsg?.indexOf('denied by system') !== -1) {
                    // On Chrome this is the only thing different between error returned when user cancels
                    // and when no permission was given on the OS level.
                    errorCallback(new JitsiTrackError(JitsiTrackErrors.PERMISSION_DENIED));
                } else if (errorDetails.errorMsg === 'NotReadableError') {
                    // This can happen under some weird conditions:
                    //  - https://issues.chromium.org/issues/369103607
                    //  - https://issues.chromium.org/issues/353555347
                    errorCallback(new JitsiTrackError(JitsiTrackErrors.SCREENSHARING_GENERIC_ERROR));
                } else {
                    errorCallback(new JitsiTrackError(JitsiTrackErrors.SCREENSHARING_USER_CANCELED));
                }
            });
    }

    /**
     * Obtains a screen capture stream using getDisplayMedia.
     *
     * @param callback - The success callback.
     * @param errorCallback - The error callback.
     * @internal
     */
    obtainScreenFromGetDisplayMediaRN(callback: (result: IScreenCaptureResult) => void, errorCallback: (error: JitsiTrackError) => void) {
        logger.info('Using getDisplayMedia for screen sharing');

        navigator.mediaDevices.getDisplayMedia({ video: true })
            .then(stream => {
                this.setContentHint(stream);
                callback({
                    sourceId: stream.id,
                    stream
                });
            })
            .catch(() => {
                errorCallback(new JitsiTrackError(JitsiTrackErrors
                    .SCREENSHARING_USER_CANCELED));
            });
    }

    /** Sets the contentHint on the transmitted MediaStreamTrack to indicate charaterstics in the video stream, which
     * informs RTCPeerConnection on how to encode the track (to prefer motion or individual frame detail).
     *
     * @param {MediaStream} stream - The captured desktop stream.
     * @returns {void}
     */
    public setContentHint(stream: MediaStream): void {
        const { desktopSharingFrameRate } = this.options;
        const desktopTrack = stream.getVideoTracks()[0];

        // Set contentHint on the desktop track based on the fps requested.
        if ('contentHint' in desktopTrack) {
            desktopTrack.contentHint = desktopSharingFrameRate?.max > SS_DEFAULT_FRAME_RATE ? 'motion' : 'detail';
        } else {
            logger.warn('MediaStreamTrack contentHint attribute not supported');
        }
    }

    /**
     * Checks whether obtaining a screen capture is supported in the current
     * environment.
     * @returns {boolean}
     */
    public isSupported(): boolean {
        return this.obtainStream !== null;
    }

    /**
     * Sets the max frame rate to be used for a desktop track capture.
     *
     * @param {number} maxFps capture frame rate to be used for desktop tracks.
     * @returns {void}
     */
    public setDesktopSharingFrameRate(maxFps: number): void {
        logger.info(`Setting the desktop capture rate to ${maxFps}`);

        this.options.desktopSharingFrameRate = {
            max: maxFps,
            min: SS_DEFAULT_FRAME_RATE
        };
    }
}

export default new ScreenObtainer();
