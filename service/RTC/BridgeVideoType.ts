/**
 * Enumeration of the video types that are signaled to the bridge
 * @type {{CAMERA: string, DESKTOP: string, DESKTOP_HIGH_FPS: string, NONE: string}}
 */
export enum BridgeVideoType {
    /**
     * The camera video type.
     */
    CAMERA = 'camera',

    /**
     * The low fps desktop video type.
     */
    DESKTOP = 'desktop',

    /**
     * The high fps desktop video type.
     */
    DESKTOP_HIGH_FPS = 'desktop_high_fps',

    /**
     * Video type when no local source is present.
     */
    NONE = 'none'
};

export const CAMERA = BridgeVideoType.CAMERA;
export const DESKTOP = BridgeVideoType.DESKTOP;
export const DESKTOP_HIGH_FPS = BridgeVideoType.DESKTOP_HIGH_FPS;
export const NONE = BridgeVideoType.NONE;

// TODO: this was a pre-ES6 module using module.exports = BridgeVideoType which doesn't translate well
// it is used in a number of places and should be updated to use the named export

export default BridgeVideoType;
