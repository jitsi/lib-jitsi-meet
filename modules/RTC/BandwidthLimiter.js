/* global __filename */

import { getLogger } from 'jitsi-meet-logger';
import transform from 'sdp-transform';

const logger = getLogger(__filename);

/**
 * This will save a bandwidth limit (per mline) that should be used
 * and then, when given an SDP, will enforce that limit.
 * Note that this will affect *outgoing* bandwidth usage, but the SDP
 * it must modify to implement that is the *remote* description
 */
export default class BandwidthLimiter {

    /**
     * Create a new BandwidthLimiter
     */
    constructor() {
        /**
         * @type {Map<String, Number>}
         * Map of mline media type to a bandwidth limit (in kbps).
         * Any mlines present in this map will have the associated
         * bandwidth limit (or 'null' for no limit) enforced, meaning
         * that it will potentially overwrite a limit already set in
         * the given sdp.  However, if an mline is NOT present in
         * this map, any limit in the given sdp will not be touched.
         */
        this._bandwidthLimits = new Map();
    }

    /**
     * Set a bandwidth limit for given mline.  If limitKbps is null,
     * the limit will be removed
     * @param {String} mediaType the mline media type to set the
     * bandwidth limit on
     * @param {Number} limitKbps the bandwidth limit, in kbps
     */
    setBandwidthLimit(mediaType, limitKbps) {
        this._bandwidthLimits.set(mediaType, limitKbps);
    }

    /**
     * Get the current bandwidth limit
     * @param {String} mediaType the mline media type for which to get the
     * bandwidth limit
     * @return {Number} the bandwidth limit in kbps if it exists, undefined
     * otherwise
     */
    getBandwidthLimit(mediaType) {
        return this._bandwidthLimits.get(mediaType);
    }

    /**
     * Enforce any configured bandwidth limits (or lack thereof) in the given
     * sdp
     * @param {String} sdp the session description
     * @returns {String} a potentially modified session description
     * with any configured bandwidth limits set
     */
    enforceBandwithLimit(sdp) {
        logger.debug('Enforcing any configured bandwidth limits');
        const desc = transform.parse(sdp);

        desc.media.forEach(mLine => {
            const limitKbps = this._bandwidthLimits.get(mLine.type);

            if (typeof limitKbps !== 'undefined') {
                if (limitKbps === null) {
                    logger.debug(
                        `Removing bandwidth limit for mline ${mLine.type}`);
                    delete mLine.bandwidth;
                } else {
                    logger.debug(`Enforcing limit ${limitKbps}kbps`
                        + ` for mline ${mLine.type}`);
                    mLine.bandwidth = [
                        {
                            type: 'AS',
                            limit: limitKbps
                        }
                    ];
                }
            }
        });

        return transform.write(desc);
    }
}
