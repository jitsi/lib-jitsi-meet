
import { getLogger } from '@jitsi/logger';

import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import CodecMimeType from '../../service/RTC/CodecMimeType';
import { MediaType } from '../../service/RTC/MediaType';
import browser from '../browser';

const logger = getLogger(__filename);

/**
 * This class handles the codec selection mechanism for the conference based on the config.js settings.
 * The preferred codec is selected based on the settings and the list of codecs supported by the browser.
 * The preferred codec is published in presence which is then used by the other endpoints in the
 * conference to pick a supported codec at join time and when the call transitions between p2p and jvb
 * connections.
 */
export class CodecSelection {
    /**
     * Creates a new instance for a given conference.
     *
     * @param {JitsiConference} conference the conference instance
     * @param {*} options
     * @param {string} options.disabledCodec the codec that needs to be disabled.
     * @param {boolean} options.enforcePreferredCodec whether codec preference has to be
     * enforced even when an endpoints that doesn't support the preferred codec joins the call.
     * Falling back to the standard codec will be skipped when this option is true, endpoints
     * that do not support the preferred codec may not be able to encode/decode video when this happens.
     * @param {string} options.jvbCodec the codec that is preferred on jvb connection.
     * @param {string} options.p2pCodec the codec that is preferred on p2p connection.
     */
    constructor(conference, options) {
        this.conference = conference;
        this.options = options;
        this.enforcePreferredCodec = options.enforcePreferredCodec;

        // VP8 cannot be disabled since it the default codec.
        this.p2pDisabledCodec = options.p2pDisabledCodec !== CodecMimeType.VP8
            && this._isCodecSupported(options.p2pDisabledCodec)
            && options.p2pDisabledCodec;
        this.jvbDisabledCodec = options.jvbDisabledCodec !== CodecMimeType.VP8
            && this._isCodecSupported(options.jvbDisabledCodec)
            && options.jvbDisabledCodec;

        // Determine the preferred codecs.
        this.p2pPreferredCodec = this._isCodecSupported(options.p2pPreferredCodec)
            && options.p2pPreferredCodec !== options.p2pDisabledCodec
            ? options.p2pPreferredCodec
            : CodecMimeType.VP8;
        this.jvbPreferredCodec = this._isCodecSupported(options.jvbPreferredCodec)
            && options.jvbPreferredCodec !== options.jvbDisabledCodec
            ? options.jvbPreferredCodec
            : CodecMimeType.VP8;

        logger.debug(`Codec preferences for the conference are JVB: preferred=${this.jvbPreferredCodec},`
            + `disabled=${this.jvbDisabledCodec} P2P: preferred=${this.p2pPreferredCodec},`
            + `disabled=${this.p2pDisabledCodec}`);

        this.conference.on(
            JitsiConferenceEvents.USER_JOINED,
            () => this._selectPreferredCodec());
        this.conference.on(
            JitsiConferenceEvents.USER_LEFT,
            () => this._selectPreferredCodec());
    }

    /**
     * Checks if the given codec is supported by the browser.
     *
     * @param {CodecMimeType} preferredCodec codec to be checked.
     * @returns {boolean} true if the given codec is supported, false otherwise.
     * @private
     */
    _isCodecSupported(preferredCodec) {
        if (!preferredCodec) {
            return false;
        }

        if (preferredCodec === CodecMimeType.VP9 && !this.enforcePreferredCodec && !browser.supportsVP9()) {
            return false;
        }

        // Skip the check on FF because it does not support the getCapabilities API.
        // It is safe to assume that Firefox supports all the codecs supported by Chrome.
        if (browser.isFirefox()) {
            return true;
        }

        return window.RTCRtpReceiver
            && window.RTCRtpReceiver.getCapabilities
            && window.RTCRtpReceiver.getCapabilities('video').codecs
            .some(codec => codec.mimeType.toLowerCase() === `video/${preferredCodec}`);
    }

    /**
     * Sets the codec on the media session based on the preferred/disabled codec setting and the supported codecs
     * published by the remote participants in their presence.
     *
     * @param {JingleSessionPC} mediaSession session for which the codec selection has to be made.
     */
    _selectPreferredCodec(mediaSession) {
        const session = mediaSession ? mediaSession : this.conference.jvbJingleSession;

        if (!session) {
            return;
        }
        const preferredCodec = session.isP2P ? this.p2pPreferredCodec : this.jvbPreferredCodec;
        const disabledCodec = session.isP2P ? this.p2pDisabledCodec : this.jvbDisabledCodec;
        const currentCodec = session?.peerconnection.getConfiguredVideoCodec();
        let selectedCodec = preferredCodec ?? currentCodec;

        if (!this.enforcePreferredCodec) {
            const remoteParticipants = this.conference.getParticipants().map(participant => participant.getId());
            const remoteCodecs = remoteParticipants?.map(remote => {
                const peerMediaInfo = session._signalingLayer.getPeerMediaInfo(remote, MediaType.VIDEO);

                return peerMediaInfo?.codecType;
            });

            const nonPreferredCodecs = remoteCodecs.filter(codec => codec !== selectedCodec && codec !== disabledCodec);

            // Find the fallback codec when there are endpoints in the call that don't have the same preferred codec
            // set.
            if (nonPreferredCodecs.length) {
                // Always prefer VP8 as that is the default codec supported on all client types.
                selectedCodec = nonPreferredCodecs.find(codec => codec === CodecMimeType.VP8)
                    ?? nonPreferredCodecs.find(codec => this._isCodecSupported(codec));
            }
        }
        if (selectedCodec !== currentCodec || !session?.peerconnection.isVideoCodecDisabled(disabledCodec)) {
            session.setVideoCodecs(selectedCodec, disabledCodec);
        }
    }

    /**
     * Returns the preferred codec for the conference. The preferred codec for the JVB media session
     * is the one that gets published in presence and a comparision is made whenever a participant joins
     * or leaves the call.
     *
     * @returns {CodecMimeType} preferred codec.
     */
    getPreferredCodec() {
        return this.jvbPreferredCodec;
    }
}
