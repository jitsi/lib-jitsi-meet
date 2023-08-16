/**
 * Standard video bitrates for different codecs supported by the clients. These bitrates will be applied by to the
 * client if they are not overwritten by the videoQuality settings in config.js.
 */
export const STANDARD_VIDEO_BITRATES = {
    av1: {
        low: 100000,
        standard: 300000,
        high: 1000000,
        ssHigh: 2500000
    },
    h264: {
        low: 200000,
        standard: 500000,
        high: 1500000,
        ssHigh: 2500000
    },
    vp8: {
        low: 200000,
        standard: 500000,
        high: 1500000,
        ssHigh: 2500000
    },
    vp9: {
        low: 100000,
        standard: 300000,
        high: 1200000,
        ssHigh: 2500000
    }
};
