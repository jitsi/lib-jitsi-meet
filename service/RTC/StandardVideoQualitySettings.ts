import browser from '../../modules/browser';

import { CodecMimeType } from './CodecMimeType';

// Default value for assumed downlink bandwidth for the local endpoint which tells the bridge to use its own calculated
// BWE value while determining the number of video streams to route to the endpoint.
export const ASSUMED_BANDWIDTH_BPS = -1;

// Default lastN value to be used while ramping up lastN after a cpu limitation ceases to exist (if -1 or no value is
// passed in config.js for channelLastN).
export const DEFAULT_LAST_N = 25;

// LastN value to be signaled to the bridge when the local endpoint wants to receive all the remote video sources in
// the call.
export const LAST_N_UNLIMITED = -1;

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
 * The ssrc-group semantics for SSRCs related to the video streams.
 */
export enum SSRC_GROUP_SEMANTICS {

    // The semantics for group of SSRCs belonging to the same stream, primary and RTX.
    FID = 'FID',

    // The semantics for group with primary SSRCs for each of the simulcast streams.
    SIM = 'SIM'
}

/**
 * Standard scalability mode settings for different video codecs and the default bitrates.
 */
export const STANDARD_CODEC_SETTINGS = {
    av1: {
        maxBitratesVideo: {
            fullHd: 2000000,
            high: 1000000,
            low: 100000,
            none: 0,
            ssHigh: 2500000,
            standard: 300000,
            ultraHd: 4000000
        },
        scalabilityModeEnabled: browser.supportsScalabilityModeAPI(),
        useKSVC: browser.supportsSVC(),
        useSimulcast: !browser.supportsSVC(),
    },
    h264: {
        maxBitratesVideo: {
            fullHd: 4000000,
            high: 2000000,
            low: 400000,
            none: 0,
            ssHigh: 2500000,
            standard: 800000,
            ultraHd: 8000000,
        },
        scalabilityModeEnabled: browser.supportsScalabilityModeAPI()
    },
    vp8: {
        maxBitratesVideo: {
            fullHd: 3000000,
            high: 1500000,
            low: 200000,
            none: 0,
            ssHigh: 2500000,
            standard: 500000,
            ultraHd: 6000000,
        },
        scalabilityModeEnabled: false
    },
    vp9: {
        maxBitratesVideo: {
            fullHd: 2500000,
            high: 1200000,
            low: 100000,
            none: 0,
            ssHigh: 2500000,
            standard: 300000,
            ultraHd: 5000000
        },
        scalabilityModeEnabled: browser.supportsScalabilityModeAPI(),
        useKSVC: browser.supportsSVC(),
        useSimulcast: !browser.supportsSVC(),
    }
};

/**
 * Video codecs in descending order of complexity for camera and desktop video types based on the results of manual
 * performance tests on different platforms. When a CPU limitation is encountered, client switches the call to use the
 * next codec in the list.
 */
export const VIDEO_CODECS_BY_COMPLEXITY = {
    'camera': [
        CodecMimeType.AV1,
        CodecMimeType.VP9,
        CodecMimeType.VP8
    ],
    'desktop': [
        CodecMimeType.VP9,
        CodecMimeType.VP8,
        CodecMimeType.AV1
    ]
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

    // 1920x1080 or full High Definition.
    FULL = 'fullHd',

    // 1280x720 or High Definition.
    HIGH = 'high',

    // 320x180 or Low Definition.
    LOW = 'low',

    // When the camera is turned off.
    NONE = 'none',

    // 640x360 or Standard Definition.
    STANDARD = 'standard',

    // 3840x2160 or 4k.
    ULTRA = 'ultraHd'
}

// --- NEW CONSTANTS FOR THRESHOLDS ---
const THRESHOLD_SD = 360;
const THRESHOLD_HD = 720;

/**
 * Options for getEffectiveSimulcastLayers function.
 */
export interface ISimulcastLayerOptions {
    /**
     * The video codec being used (e.g., 'vp8', 'vp9', 'h264', 'av1').
     */
    codec?: string;

    /**
     * Browser information for applying browser-specific heuristics.
     */
    browser?: {
        name: string;
        version: string;
    };

    /**
     * Force a specific number of layers (1, 2, or 3). Overrides resolution-based heuristics.
     */
    forceNumLayers?: number;

    /**
     * Configuration object that may contain custom thresholds or overrides from config.js.
     */
    config?: {
        /**
         * Custom threshold for SD (default 360).
         */
        sdThreshold?: number;

        /**
         * Custom threshold for HD (default 720).
         */
        hdThreshold?: number;

        /**
         * Enable/disable browser-specific layer reduction heuristics.
         */
        enableBrowserHeuristics?: boolean;
    };
}

/**
 * Returns the effective simulcast layers based on the capture resolution and optional configuration.
 * This is the canonical function for determining how many simulcast layers to use.
 * 
 * Resolution-based heuristics (default):
 * - < 360p: 1 layer (low quality only)
 * - 360p-719p: 2 layers (low + standard)
 * - >= 720p: 3 layers (low + standard + high)
 * 
 * Layers are returned in ascending quality order (lowest scaleFactor → highest):
 * - Layer 0: scaleFactor 4.0 (lowest resolution)
 * - Layer 1: scaleFactor 2.0 (medium resolution)
 * - Layer 2: scaleFactor 1.0 (highest resolution)
 * 
 * @param {number} captureHeight - The height of the captured video in pixels.
 * @param {ISimulcastLayerOptions} [opts] - Optional configuration for layer determination.
 * @returns {Array<{rid: string, scaleFactor: number}>} The effective simulcast layers to use.
 * 
 * @example
 * // Basic usage - resolution-based
 * getEffectiveSimulcastLayers(720) // Returns all 3 layers
 * getEffectiveSimulcastLayers(360) // Returns 2 layers
 * getEffectiveSimulcastLayers(180) // Returns 1 layer
 * 
 * @example
 * // Force specific number of layers
 * getEffectiveSimulcastLayers(720, { forceNumLayers: 2 }) // Returns only 2 layers
 * 
 * @example
 * // Custom thresholds via config
 * getEffectiveSimulcastLayers(400, {
 *   config: { sdThreshold: 480, hdThreshold: 1080 }
 * }) // Returns 1 layer (400 < 480)
 */
export function getEffectiveSimulcastLayers(
    captureHeight: number,
    opts?: ISimulcastLayerOptions
): Array<{ rid: string; scaleFactor: number }> {
    const options = opts || {};
    const config = options.config || {};
    
    // Use custom thresholds if provided, otherwise use defaults
    const sdThreshold = config.sdThreshold ?? THRESHOLD_SD;
    const hdThreshold = config.hdThreshold ?? THRESHOLD_HD;
    
    let numLayers: number;
    
    // If forceNumLayers is specified, use it (with bounds checking)
    if (typeof options.forceNumLayers === 'number') {
        numLayers = Math.max(1, Math.min(3, Math.floor(options.forceNumLayers)));
        
        if (numLayers !== options.forceNumLayers) {
            console.warn(
                `[StandardVideoQualitySettings] forceNumLayers=${options.forceNumLayers} out of range. ` +
                `Clamped to ${numLayers}.`
            );
        }
    } else {
        // Determine layers based on resolution thresholds
        if (captureHeight < sdThreshold) {
            numLayers = 1;
        } else if (captureHeight < hdThreshold) {
            numLayers = 2;
        } else {
            numLayers = 3;
        }
        
        // Apply browser-specific heuristics if enabled
        if (config.enableBrowserHeuristics !== false && options.browser) {
            const browserName = options.browser.name.toLowerCase();
            
            // Chromium-based browsers may collapse simulcast layers at low resolutions
            // Log this for observability
            if ((browserName.includes('chrome') || browserName.includes('chromium') || browserName.includes('edge'))
                && options.codec === 'vp8'
                && captureHeight < 640
                && numLayers > 1) {
                console.info(
                    `[StandardVideoQualitySettings] Chromium + VP8 + low resolution (${captureHeight}p). ` +
                    `Keeping ${numLayers} layers but Chromium may collapse to fewer at runtime.`
                );
            }
        }
    }
    
    // Return the first N layers from SIM_LAYERS in canonical order (lowest to highest quality)
    const effectiveLayers = SIM_LAYERS.slice(0, numLayers);
    
    // Log layer reduction for debugging
    if (numLayers < 3) {
        console.debug(
            `[StandardVideoQualitySettings] getEffectiveSimulcastLayers: ` +
            `captureHeight=${captureHeight}, numLayers=${numLayers}, ` +
            `codec=${options.codec || 'unknown'}, forceNumLayers=${options.forceNumLayers}`
        );
    }
    
    return effectiveLayers;
}

/**
 * Returns the preferred order of encodings for the browser/codec combination.
 * **This function is non-mutating**: it returns a new array and does not modify the input.
 * 
 * For most cases, we want encodings in ascending quality order (low → high).
 * However, Chromium with VP8 at low resolutions benefits from reversed order
 * (high → low) because Chromium picks the first encoding when collapsing layers.
 * 
 * This is a defensive shim for Chromium's simulcast layer collapse behavior at low
 * resolutions. See: https://github.com/jitsi/lib-jitsi-meet/issues/2939
 * 
 * @param {Array<any>} encodings - Array of encoding objects (not mutated).
 * @param {ISimulcastLayerOptions} [opts] - Browser and codec information.
 * @returns {Array<any>} A **new array** with encodings in the preferred order for the platform.
 * 
 * @example
 * const encodings = [{scaleResolutionDownBy: 4}, {scaleResolutionDownBy: 2}, {scaleResolutionDownBy: 1}];
 * const ordered = getPreferredEncodingsOrder(encodings, {
 *   codec: 'vp8',
 *   browser: { name: 'Chrome' },
 *   captureHeight: 480
 * });
 * // On Chrome + VP8 at low res, returns NEW reversed array: [{...1}, {...2}, {...4}]
 * // Original encodings array is unchanged
 */
export function getPreferredEncodingsOrder<T>(
    encodings: T[],
    opts?: ISimulcastLayerOptions & { captureHeight?: number }
): T[] {
    if (!encodings || encodings.length <= 1) {
        return encodings;
    }
    
    const options = opts || {};
    const browserName = options.browser?.name?.toLowerCase() || '';
    const isChromium = browserName.includes('chrome') || browserName.includes('chromium') || browserName.includes('edge');
    const captureHeight = options.captureHeight ?? 720;
    
    // Reverse order for Chromium + VP8 + low resolution
    // This ensures the highest-quality encoding is first when Chromium collapses layers
    const shouldReverse = isChromium
        && options.codec === 'vp8'
        && captureHeight < 640
        && encodings.length > 1;
    
    if (shouldReverse) {
        console.debug(
            `[StandardVideoQualitySettings] Reversing encoding order for Chromium VP8 ` +
            `at ${captureHeight}p to prefer high-quality layer. (github.com/jitsi/lib-jitsi-meet/issues/2939)`
        );
        return encodings.slice().reverse(); // Non-mutating: creates new reversed array
    }
    
    // Return a shallow copy to guarantee non-mutating behavior
    return encodings.slice();
}