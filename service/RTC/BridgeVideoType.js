/**
 * Enumeration of the video types that are signaled to the bridge
 * @type {{CAMERA: string, DESKTOP: string, DESKTOP_HIGH_FPS: string, NONE: string}}
 */
const BridgeVideoType = {
    /**
     * The camera video type.
     */
    CAMERA: 'camera',

    /**
     * The low fps desktop video type.
     */
    DESKTOP: 'desktop',

    /**
     * The high fps desktop video type.
     */
    DESKTOP_HIGH_FPS: 'desktop_high_fps',

    /**
     * Video type when no local source is present.
     */
    NONE: 'none'
};

module.exports = BridgeVideoType;
