/**
 * Enumeration of the codec mime types
 */
export enum CodecMimeType {
    /**
     * The h264 codec mime type.
     */
    H264 = 'h264',

    /**
     * The opus codec mime type.
     */
    OPUS = 'opus',

    /**
     * The ulpfec codec mime type.
     */
    ULPFEC = 'ulpfec',

    /**
     * The vp8 codec mime type.
     */
    VP8 = 'vp8',

    /**
     * The vp9 codec mime type.
     */
    VP9 = 'vp9'

};

export const H264 = CodecMimeType.H264;
export const OPUS = CodecMimeType.OPUS;
export const ULPFEC = CodecMimeType.ULPFEC;
export const VP8 = CodecMimeType.VP8;
export const VP9 = CodecMimeType.VP9;

// TODO: this was a pre-ES6 module using module.exports = CodecMimeType which doesn't translate well
// it is used in a number of places and should be updated to use the named export

export default CodecMimeType;
