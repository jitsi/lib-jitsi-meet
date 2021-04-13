/* global module */
/**
 * Enumeration of the codec mime types
 * @type {{H264: string, OPUS: string, VP8: string, VP9: string}}
 */
const CodecMimeType = {
    /**
     * The h264 codec mime type.
     */
    H264: 'h264',

    /**
     * The opus codec mime type.
     */
    OPUS: 'opus',

    /**
     * The vp8 codec mime type.
     */
    VP8: 'vp8',

    /**
     * The vp9 codec mime type.
     */
    VP9: 'vp9'

};

module.exports = CodecMimeType;
