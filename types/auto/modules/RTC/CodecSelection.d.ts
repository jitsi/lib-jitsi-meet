/**
 * This class handles the codec selection mechanism for the conference based on the config.js settings.
 * The preferred codec is selected based on the settings and the list of codecs supported by the browser.
 * The preferred codec is published in presence which is then used by the other endpoints in the
 * conference to pick a supported codec at join time and when the call transitions between p2p and jvb
 * connections.
 */
export class CodecSelection {
    /**
     * Creates a new instance for a given conference.
     *
     * @param {JitsiConference} conference the conference instance
     * @param {*} options
     * @param {string} options.disabledCodec the codec that needs to be disabled.
     * @param {boolean} options.enforcePreferredCodec whether codec preference has to be
     * enforced even when an endpoints that doesn't support the preferred codec joins the call.
     * Falling back to the standard codec will be skipped when this option is true, endpoints
     * that do not support the preferred codec may not be able to encode/decode video when this happens.
     * @param {string} options.jvbCodec the codec that is preferred on jvb connection.
     * @param {string} options.p2pCodec the codec that is preferred on p2p connection.
     */
    constructor(conference: any, options: any);
    conference: any;
    options: any;
    disabledCodec: {
        H264: string;
        OPUS: string;
        ULPFEC: string;
        VP8: string;
        VP9: string;
    };
    jvbPreferredCodec: string | {
        H264: string;
        OPUS: string;
        ULPFEC: string;
        VP8: string;
        VP9: string;
    };
    p2pPreferredCodec: string | {
        H264: string;
        OPUS: string;
        ULPFEC: string;
        VP8: string;
        VP9: string;
    };
    /**
     * Checks if a given string is a valid video codec mime type.
     *
     * @param {string} codec the codec string that needs to be validated.
     * @returns {CodecMimeType|null} mime type if valid, null otherwise.
     * @private
     */
    private _getCodecMimeType;
    /**
     * Checks if the given codec is supported by the browser.
     *
     * @param {CodecMimeType} preferredCodec codec to be checked.
     * @returns {boolean} true if the given codec is supported, false otherwise.
     * @private
     */
    private _isCodecSupported;
    /**
     * Handles the {@link JitsiConferenceEvents._MEDIA_SESSION_STARTED} event. Codecs need to be
     * configured on the media session that is newly created.
     *
     * @param {JingleSessionPC} mediaSession media session that started.
     * @returns {void}
     * @private
     */
    private _onMediaSessionStarted;
    /**
     * Sets the codec on the media session based on the preferred codec setting and the supported codecs
     * published by the remote participants in their presence.
     *
     * @param {JingleSessionPC} mediaSession session for which the codec selection has to be made.
     * @param {CodecMimeType} preferredCodec preferred codec.
     * @param {CodecMimeType} disabledCodec codec that needs to be disabled.
     */
    _selectPreferredCodec(mediaSession?: any, preferredCodec?: {
        H264: string;
        OPUS: string;
        ULPFEC: string;
        VP8: string;
        VP9: string;
    }, disabledCodec?: {
        H264: string;
        OPUS: string;
        ULPFEC: string;
        VP8: string;
        VP9: string;
    }): void;
    /**
     * Returns the preferred codec for the conference. The preferred codec for the JVB media session
     * is the one that gets published in presence and a comparision is made whenever a participant joins
     * or leaves the call.
     *
     * @returns {CodecMimeType} preferred codec.
     */
    getPreferredCodec(): {
        H264: string;
        OPUS: string;
        ULPFEC: string;
        VP8: string;
        VP9: string;
    };
}
