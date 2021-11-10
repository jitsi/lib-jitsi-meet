import { getLogger } from '@jitsi/logger';

import SDPUtil from './SDPUtil';
import { parseSecondarySSRC, SdpTransformWrap } from './SdpTransformUtil';

const logger = getLogger(__filename);

/**
 * Begin helper functions
 */
/**
 * Updates or inserts the appropriate rtx information for primarySsrc with
 *  the given rtxSsrc.  If no rtx ssrc for primarySsrc currently exists, it will
 *  add the appropriate ssrc and ssrc group lines.  If primarySsrc already has
 *  an rtx ssrc, the appropriate ssrc and group lines will be updated
 * @param {MLineWrap} mLine
 * @param {object} primarySsrcInfo the info (ssrc, msid & cname) for the
 *  primary ssrc
 * @param {number} rtxSsrc the rtx ssrc to associate with the primary ssrc
 */
function updateAssociatedRtxStream(mLine, primarySsrcInfo, rtxSsrc) {
    const primarySsrc = primarySsrcInfo.id;
    const primarySsrcMsid = primarySsrcInfo.msid;
    const primarySsrcCname = primarySsrcInfo.cname;

    const previousRtxSSRC = mLine.getRtxSSRC(primarySsrc);

    if (previousRtxSSRC === rtxSsrc) {
        return;
    }
    if (previousRtxSSRC) {
        // Stream already had an rtx ssrc that is different than the one given,
        //  remove all trace of the old one
        mLine.removeSSRC(previousRtxSSRC);
        mLine.removeGroupsWithSSRC(previousRtxSSRC);
    }
    mLine.addSSRCAttribute({
        id: rtxSsrc,
        attribute: 'cname',
        value: primarySsrcCname
    });
    mLine.addSSRCAttribute({
        id: rtxSsrc,
        attribute: 'msid',
        value: primarySsrcMsid
    });
    mLine.addSSRCGroup({
        semantics: 'FID',
        ssrcs: `${primarySsrc} ${rtxSsrc}`
    });
}

/**
 * End helper functions
 */

/**
 * Adds any missing RTX streams for video streams
 *  and makes sure that they remain consistent
 */
export default class RtxModifier {
    /**
     * Constructor
     */
    constructor() {
        /**
         * Map of video ssrc to corresponding RTX
         *  ssrc
         */
        this.correspondingRtxSsrcs = new Map();
    }

    /**
     * Clear the cached map of primary video ssrcs to
     *  their corresponding rtx ssrcs so that they will
     *  not be used for the next call to modifyRtxSsrcs
     */
    clearSsrcCache() {
        this.correspondingRtxSsrcs.clear();
    }

    /**
     * Explicitly set the primary video ssrc -> rtx ssrc
     *  mapping to be used in modifyRtxSsrcs
     * @param {Map} ssrcMapping a mapping of primary video
     *  ssrcs to their corresponding rtx ssrcs
     */
    setSsrcCache(ssrcMapping) {
        logger.debug('Setting ssrc cache to ', ssrcMapping);
        this.correspondingRtxSsrcs = ssrcMapping;
    }

    /**
     * Adds RTX ssrcs for any video ssrcs that don't
     *  already have them.  If the video ssrc has been
     *  seen before, and already had an RTX ssrc generated,
     *  the same RTX ssrc will be used again.
     * @param {string} sdpStr sdp in raw string format
     */
    modifyRtxSsrcs(sdpStr) {
        const sdpTransformer = new SdpTransformWrap(sdpStr);
        const videoMLine = sdpTransformer.selectMedia('video');

        if (!videoMLine) {
            logger.debug(`No 'video' media found in the sdp: ${sdpStr}`);

            return sdpStr;
        }

        return this.modifyRtxSsrcs2(videoMLine)
            ? sdpTransformer.toRawSDP() : sdpStr;
    }

    /**
     * Does the same thing as {@link modifyRtxSsrcs}, but takes the
     *  {@link MLineWrap} instance wrapping video media as an argument.
     * @param {MLineWrap} videoMLine
     * @return {boolean} <tt>true</tt> if the SDP wrapped by
     *  {@link SdpTransformWrap} has been modified or <tt>false</tt> otherwise.
     */
    modifyRtxSsrcs2(videoMLine) {
        if (videoMLine.direction === 'recvonly') {

            return false;
        }
        if (videoMLine.getSSRCCount() < 1) {

            return false;
        }
        const primaryVideoSsrcs = videoMLine.getPrimaryVideoSSRCs();

        for (const ssrc of primaryVideoSsrcs) {
            const msid = videoMLine.getSSRCAttrValue(ssrc, 'msid');
            const cname = videoMLine.getSSRCAttrValue(ssrc, 'cname');
            let correspondingRtxSsrc = this.correspondingRtxSsrcs.get(ssrc);

            if (!correspondingRtxSsrc) {
                // If there's one in the sdp already for it, we'll just set
                //  that as the corresponding one
                const previousAssociatedRtxStream = videoMLine.getRtxSSRC(ssrc);

                if (previousAssociatedRtxStream) {
                    correspondingRtxSsrc = previousAssociatedRtxStream;
                } else {
                    correspondingRtxSsrc = SDPUtil.generateSsrc();
                }
                this.correspondingRtxSsrcs.set(ssrc, correspondingRtxSsrc);
            }
            updateAssociatedRtxStream(
                videoMLine,
                {
                    id: ssrc,
                    cname,
                    msid
                },
                correspondingRtxSsrc);
        }

        // FIXME we're not looking into much details whether the SDP has been
        // modified or not once the precondition requirements are met.
        return true;
    }

    /**
     * Strip all rtx streams from the given sdp
     * @param {string} sdpStr sdp in raw string format
     * @returns {string} sdp string with all rtx streams stripped
     */
    stripRtx(sdpStr) {
        const sdpTransformer = new SdpTransformWrap(sdpStr);
        const videoMLine = sdpTransformer.selectMedia('video');

        if (!videoMLine) {
            logger.debug(`No 'video' media found in the sdp: ${sdpStr}`);

            return sdpStr;
        }
        if (videoMLine.direction === 'recvonly') {
            logger.debug('RtxModifier doing nothing, video m line is recvonly');

            return sdpStr;
        }
        if (videoMLine.getSSRCCount() < 1) {
            logger.debug('RtxModifier doing nothing, no video ssrcs present');

            return sdpStr;
        }
        if (!videoMLine.containsAnySSRCGroups()) {
            logger.debug('RtxModifier doing nothing, '
              + 'no video ssrcGroups present');

            return sdpStr;
        }
        const fidGroups = videoMLine.findGroups('FID');

        // Remove the fid groups from the mline

        videoMLine.removeGroupsBySemantics('FID');

        // Get the rtx ssrcs and remove them from the mline
        for (const fidGroup of fidGroups) {
            const rtxSsrc = parseSecondarySSRC(fidGroup);

            videoMLine.removeSSRC(rtxSsrc);
        }

        return sdpTransformer.toRawSDP();
    }
}
