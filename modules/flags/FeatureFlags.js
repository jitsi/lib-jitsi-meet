import { getLogger } from '@jitsi/logger';

const logger = getLogger('FeatureFlags');

/**
 * A global module for accessing information about different feature flags state.
 */
class FeatureFlags {
    /**
     * Configures the module.
     *
     * @param {boolean} flags.sourceNameSignaling - Enables source names in the signaling.
     */
    init(flags) {
        this._sourceNameSignaling = Boolean(flags.sourceNameSignaling);
        this._sendMultipleVideoStreams = Boolean(flags.sendMultipleVideoStreams);

        logger.info(`Source name signaling: ${this._sourceNameSignaling},`
            + ` Send multiple video streams: ${this._sendMultipleVideoStreams}`);
    }

    /**
     * Checks if multiple local video streams support is enabled.
     *
     * @returns {boolean}
     */
    isMultiStreamSupportEnabled() {
        return this._sourceNameSignaling && this._sendMultipleVideoStreams;
    }

    /**
     * Checks if the source name signaling is enabled.
     *
     * @returns {boolean}
     */
    isSourceNameSignalingEnabled() {
        return this._sourceNameSignaling;
    }
}

export default new FeatureFlags();
