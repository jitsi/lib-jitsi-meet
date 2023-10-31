import browser from '../../modules/browser';

/**
 * Standard scalability mode settings for different video codecs and the default bitrates.
 */
export const STANDARD_CODEC_SETTINGS = {
    av1: {
        maxBitratesVideo: {
            low: 100000,
            standard: 300000,
            high: 1000000,
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
            ssHigh: 2500000
        },
        scalabilityModeEnabled: browser.supportsScalabilityModeAPI()
    },
    vp8: {
        maxBitratesVideo: {
            low: 200000,
            standard: 500000,
            high: 1500000,
            ssHigh: 2500000
        },
        scalabilityModeEnabled: false
    },
    vp9: {
        maxBitratesVideo: {
            low: 100000,
            standard: 300000,
            high: 1200000,
            ssHigh: 2500000
        },
        scalabilityModeEnabled: browser.supportsScalabilityModeAPI(),
        useSimulcast: false, // defaults to SVC.
        useKSVC: true // defaults to L3T3_KEY for SVC mode.
    }
};
