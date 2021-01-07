
import { getLogger } from 'jitsi-meet-logger';

import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import CodecMimeType from '../../service/RTC/CodecMimeType';
import * as MediaType from '../../service/RTC/MediaType';
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

        // VP8 cannot be disabled and it will be the default codec when no preference is set.
        this.disabledCodec = options.disabledCodec === CodecMimeType.VP8
            ? undefined
            : this._getCodecMimeType(options.disabledCodec);

        // Check if the codec values passed are valid.
        const jvbCodec = this._getCodecMimeType(options.jvbCodec);
        const p2pCodec = this._getCodecMimeType(options.p2pCodec);

        this.jvbPreferredCodec = jvbCodec && this._isCodecSupported(jvbCodec) ? jvbCodec : CodecMimeType.VP8;
        this.p2pPreferredCodec = p2pCodec && this._isCodecSupported(p2pCodec) ? p2pCodec : CodecMimeType.VP8;
        logger.debug(`Codec preferences for the conference are JVB: ${this.jvbPreferredCodec},
            P2P: ${this.p2pPreferredCodec}`);

        // Do not prefer VP9 on Firefox because of the following bug.
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1633876
        if (browser.isFirefox() && this.jvbPreferredCodec === CodecMimeType.VP9) {
            this.jvbPreferredCodec = CodecMimeType.VP8;
        }

        // Keep a list of participants that join the call with a non-preferred codec.
        // The call is upgraded to the preferred codec once that list is empty.
        this.nonPreferredParticipants = [];

        this.conference.on(
            JitsiConferenceEvents.USER_JOINED,
            this._onParticipantJoined.bind(this));
        this.conference.on(
            JitsiConferenceEvents.USER_LEFT,
            this._onParticipantLeft.bind(this));
        this.conference.on(
            JitsiConferenceEvents._MEDIA_SESSION_STARTED,
            session => this._onMediaSessionStared(session));
    }

    /**
     * Checks if a given string is a valid video codec mime type.
     *
     * @param {string} codec the codec string that needs to be validated.
     * @returns {CodecMimeType|null} mime type if valid, null otherwise.
     * @private
     */
    _getCodecMimeType(codec) {
        if (typeof codec === 'string') {
            return Object.values(CodecMimeType).find(value => value === codec.toLowerCase());
        }

        return null;
    }

    /**
     * Checks if the given codec is supported by the browser.
     *
     * @param {CodecMimeType} preferredCodec codec to be checked.
     * @returns {boolean} true if the given codec is supported, false otherwise.
     * @private
     */
    _isCodecSupported(preferredCodec) {
        // Skip the check on FF and RN because they do not support the getCapabilities API.
        // It is safe to assume both of them support all the codecs supported by Chrome.
        if (browser.isFirefox() || browser.isReactNative()) {
            return true;
        }

        return window.RTCRtpReceiver
            && window.RTCRtpReceiver.getCapabilities('video').codecs
            .some(codec => codec.mimeType.toLowerCase() === `video/${preferredCodec}`);
    }

    /**
     * Handles the {@link JitsiConferenceEvents._MEDIA_SESSION_STARTED} event. Codecs need to be
     * configured on the media session that is newly created.
     *
     * @param {JingleSessionPC} mediaSession media session that started.
     * @returns {void}
     * @private
     */
    _onMediaSessionStared(mediaSession) {
        const preferredCodec = mediaSession.isP2P ? this.p2pPreferredCodec : this.jvbPreferredCodec;
        const disabledCodec = this.disabledCodec && this._isCodecSupported(this.disabledCodec)
            ? this.disabledCodec
            : null;

        mediaSession.setVideoCodecs(preferredCodec, disabledCodec);
    }

    /**
     * Handles the {@link JitsiConferenceEvents.USER_JOINED} event. When a new user joins the call,
     * the codec types are compared and the codec configued on the peerconnection is updated when
     * needed.
     *
     * @param {string} id endpoint id of the newly joined user.
     * @returns {void}
     * @private
     */
    _onParticipantJoined(id) {
        const session = this.conference.jvbJingleSession;

        if (session && !this.options.enforcePreferredCodec) {
            const peerMediaInfo = session.signalingLayer.getPeerMediaInfo(id, MediaType.VIDEO);

            if (!peerMediaInfo) {
                return;
            }
            const newCodec = peerMediaInfo.codecType;
            const currentCodec = session.getConfiguredVideoCodec();

            if (newCodec
                && newCodec !== this.jvbPreferredCodec
                && newCodec !== currentCodec
                && this._isCodecSupported(newCodec)) {

                // Add the participant to the list of participants that don't support the preferred codec.
                this.nonPreferredParticipants.push(id);
                session.setVideoCodecs(newCodec);
            }
        }
    }

    /**
     * Handles the {@link JitsiConferenceEvents.USER_LEFT} event. When a user leaves the call,
     * the codec configured on the peerconnection is updated to the preferred codec if all the
     * users that do not support the preferred codec have left the call.
     *
     * @param {string} id endpoint id of the user that has left the call.
     * @returns {void}
     * @private
     */
    _onParticipantLeft(id) {
        const session = this.conference.jvbJingleSession;

        if (session && !this.options.enforcePreferredCodec) {
            const index = this.nonPreferredParticipants.findIndex(participantId => participantId === id);

            if (index > -1) {
                this.nonPreferredParticipants.splice(index, 1);
            }

            // If all the participants that have joined the conference with a
            // non-preferred codec have left, switch to the preferred codec.
            if (!this.nonPreferredParticipants.length) {
                session.setVideoCodecs(this.jvbPreferredCodec);
            }
        }
    }

    /**
     * Returns the preferred codec for the conference.
     *
     * @returns {CodecMimeType} preferred codec.
     */
    getPreferredCodec() {
        return this.conference.isP2PActive() ? this.p2pPreferredCodec : this.jvbPreferredCodec;
    }
}
