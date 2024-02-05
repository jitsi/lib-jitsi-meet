/**
 * Enumeration of the codec mime types
 * @type {{AV1: string, H264: string, OPUS: string, RED: string, ULPFEC: string, VP8: string, VP9: string}}
 */
export enum CodecMimeType {
    /**
     * AV1 codec mime type.
     */
    AV1 = 'av1',

    /**
     * The h264 codec mime type.
     */
    H264 = 'h264',

    /**
     * The opus codec mime type.
     */
    OPUS = 'opus',

    /**
     * The red codec mime type.
     */
    RED = 'red',

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
}
