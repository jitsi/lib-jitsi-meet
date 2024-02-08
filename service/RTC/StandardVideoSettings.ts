import browser from '../../modules/browser';

// Default simulcast encodings config.
export const SIM_LAYERS = [
    {
        rid: '1',
        scaleFactor: 4.0
    },
    {
        rid: '2',
        scaleFactor: 2.0
    },
    {
        rid: '3',
        scaleFactor: 1.0
    }
];

/**
 * Standard scalability mode settings for different video codecs and the default bitrates.
 */
export const STANDARD_CODEC_SETTINGS = {
    av1: {
        maxBitratesVideo: {
            low: 100000,
            standard: 300000,
            high: 1000000,
            fullHd: 2000000,
            ultraHd: 4000000,
            ssHigh: 2500000,
            none: 0
        },
        scalabilityModeEnabled: browser.supportsScalabilityModeAPI(),
        useSimulcast: false, // defaults to SVC.
        useKSVC: true // defaults to L3T3_KEY for SVC mode.
    },
    h264: {
        maxBitratesVideo: {
            low: 200000,
            standard: 500000,
            high: 1500000,
            fullHd: 3000000,
            ultraHd: 6000000,
            ssHigh: 2500000,
            none: 0
        },
        scalabilityModeEnabled: browser.supportsScalabilityModeAPI()
    },
    vp8: {
        maxBitratesVideo: {
            low: 200000,
            standard: 500000,
            high: 1500000,
            fullHd: 3000000,
            ultraHd: 6000000,
            ssHigh: 2500000,
            none: 0
        },
        scalabilityModeEnabled: false
    },
    vp9: {
        maxBitratesVideo: {
            low: 100000,
            standard: 300000,
            high: 1200000,
            fullHd: 2500000,
            ultraHd: 5000000,
            ssHigh: 2500000,
            none: 0
        },
        scalabilityModeEnabled: browser.supportsScalabilityModeAPI(),
        useSimulcast: false, // defaults to SVC.
        useKSVC: true // defaults to L3T3_KEY for SVC mode.
    }
};

/**
 * Standard video resolutions and the corresponding quality level that will be picked for the given resolution.
 * For quality levels:
 * 'high' and above - the encoder will be configured to encode 3 spatial layers.
 * 'standard' - the encoder will be configured to encode 2 spatial laters.
 * 'low' - the encoder will be configured to encode only 1 spatial layer.
 * In all the above cases, each of the layers will again have 3 temporal layers, except for VP8 codec for which only
 * 2 temporal layers are configured by default.
 */
export const VIDEO_QUALITY_LEVELS = [
    {
        height: 2160,
        level: 'ultraHd'
    },
    {
        height: 1080,
        level: 'fullHd'
    },
    {
        height: 720,
        level: 'high'
    },
    {
        height: 540,
        level: 'standard'
    },
    {
        height: 480,
        level: 'standard'
    },
    {
        height: 360,
        level: 'standard'
    },
    {
        height: 270,
        level: 'low'
    },
    {
        height: 180,
        level: 'low'
    },
    {
        height: 90,
        level: 'low'
    },
    {
        height: 0,
        level: 'none'
    }
];

/**
 * Enumerate the supported video resolutions.
 */
export enum VIDEO_QUALITY_SETTINGS {
    // 3840x2160 or 4k.
    ULTRA = 'ultraHd',

    // 1920x1080 or full High Definition.
    FULL = 'fullHd',

    // 1280x720 or High Definition.
    HIGH = 'high',

    // 640x360 or Standard Definition.
    STANDARD = 'standard',

    // 320x180 or Low Definition.
    LOW = 'low',

    // When the camera is turned off.
    NONE = 'none'
}
