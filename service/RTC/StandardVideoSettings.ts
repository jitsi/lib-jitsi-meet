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
            fullHd: 1200000,
            ultraHd: 1500000,
            ssHigh: 2500000
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
            fullHd: 1800000,
            ultraHd: 2000000,
            ssHigh: 2500000
        },
        scalabilityModeEnabled: browser.supportsScalabilityModeAPI()
    },
    vp8: {
        maxBitratesVideo: {
            low: 200000,
            standard: 500000,
            high: 1500000,
            fullHd: 1800000,
            ultraHd: 2000000,
            ssHigh: 2500000
        },
        scalabilityModeEnabled: false
    },
    vp9: {
        maxBitratesVideo: {
            low: 100000,
            standard: 300000,
            high: 1200000,
            fullHd: 1500000,
            ultraHd: 1800000,
            ssHigh: 2500000
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
 * In all the above cases, each of the layers will again have 3 temporal layers.
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
    }
];
