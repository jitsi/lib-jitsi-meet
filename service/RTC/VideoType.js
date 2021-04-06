/* global module */
/**
 * Enumeration of the video types
 * @type {{CAMERA: string, DESKTOP: string, NONE: string}}
 */
const VideoType = {
    /**
     * The camera video type.
     */
    CAMERA: 'camera',

    /**
     * The desktop video type.
     */
    DESKTOP: 'desktop',

    /**
     * No local video source.
     */
    NONE: 'none'
};

module.exports = VideoType;
