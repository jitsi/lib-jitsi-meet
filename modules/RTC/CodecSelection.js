
import { getLogger } from '@jitsi/logger';

import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import { CodecMimeType, VideoCodecMimeTypes } from '../../service/RTC/CodecMimeType';
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
     * @param {string} options.jvb settings (codec list, preferred and disabled) for the jvb connection.
     * @param {string} options.p2p settings (codec list, preferred and disabled) for the p2p connection.
     */
    constructor(conference, options) {
        this.conference = conference;
        this.options = options;
        this.codecPreferenceOrder = {};

        for (const connectionType of Object.keys(options)) {
            // eslint-disable-next-line prefer-const
            let { disabledCodec, preferredCodec, preferenceOrder } = options[connectionType];
            const supportedCodecs = new Set(this._getSupportedVideoCodecs());
            let selectedOrder;

            if (preferenceOrder) {
                // Select all codecs that are supported by the browser.
                selectedOrder = preferenceOrder
                    .filter(codec => supportedCodecs.has(codec.toLowerCase()));

                // Push VP9 to the end of the list so that the client continues to decode VP9 even if its not
                // preferable to encode VP9 (because of browser bugs on the encoding side or added complexity on mobile
                // devices).
                if (!browser.supportsVP9()) {
                    const index = selectedOrder.findIndex(codec => codec.toLowerCase() === CodecMimeType.VP9);

                    if (index !== -1) {
                        selectedOrder.splice(index, 1);
                        selectedOrder.push(CodecMimeType.VP9);
                    }
                }
            } else {
                // Generate the codec list based on the supported codecs and the preferred/disabled (deprecated)
                // settings from config.js
                disabledCodec = disabledCodec?.toLowerCase();
                preferredCodec = preferredCodec?.toLowerCase();
                selectedOrder = Array.from(supportedCodecs);

                // VP8 cannot be disabled since it the default codec.
                if (disabledCodec && disabledCodec !== CodecMimeType.VP8) {
                    selectedOrder = selectedOrder.filter(codec => codec !== disabledCodec);
                }

                const index = selectedOrder.findIndex(codec => codec === preferredCodec);

                // Move the preferred codec to the top of the list if it is locally supported or move it to the end of
                // the list if encoding is not properly supported. For example, we do not want to encode VP9 on Firefox
                // and Safari since they produce only 180p streams always. However, we do want other Chromium endpoints
                // to continue to encode in VP9 since Firefox/Safari are able to decode VP9 properly.
                if (preferredCodec && index !== -1) {
                    selectedOrder.splice(index, 1);

                    if (preferredCodec !== CodecMimeType.VP9 || browser.supportsVP9()) {
                        selectedOrder.unshift(preferredCodec);
                    } else {
                        selectedOrder.push(preferredCodec);
                    }
                }
            }

            selectedOrder = selectedOrder.map(codec => codec.toLowerCase());

            logger.info(`Codec preference order for ${connectionType} connection is ${selectedOrder}`);
            this.codecPreferenceOrder[connectionType] = selectedOrder;
        }

        this.conference.on(
            JitsiConferenceEvents._MEDIA_SESSION_STARTED,
            session => this._selectPreferredCodec(session));
        this.conference.on(
            JitsiConferenceEvents.USER_JOINED,
            () => this._selectPreferredCodec());
        this.conference.on(
            JitsiConferenceEvents.USER_LEFT,
            () => this._selectPreferredCodec());
    }

    /**
     * Returns a list of video codecs that are supported by the browser.
     *
     * @returns {Array}
     */
    _getSupportedVideoCodecs() {
        return VideoCodecMimeTypes.filter(codec => window.RTCRtpReceiver
                && window.RTCRtpReceiver.getCapabilities
                && window.RTCRtpReceiver.getCapabilities('video').codecs
                    .some(supportedCodec => supportedCodec.mimeType.toLowerCase() === `video/${codec}`));
    }

    /**
     * Sets the codec on the media session based on the codec preference order configured in config.js and the supported
     * codecs published by the remote participants in their presence.
     *
     * @param {JingleSessionPC} mediaSession session for which the codec selection has to be made.
     */
    _selectPreferredCodec(mediaSession) {
        const session = mediaSession ? mediaSession : this.conference.jvbJingleSession;

        if (!session) {
            return;
        }
        const currentCodecOrder = session.peerconnection.getConfiguredVideoCodecs();
        const localPreferredCodecOrder = session === this.conference.jvbJingleSession
            ? this.codecPreferenceOrder.jvb
            : this.codecPreferenceOrder.p2p;

        const remoteParticipants = this.conference.getParticipants().map(participant => participant.getId());
        const remoteCodecsPerParticipant = remoteParticipants?.map(remote => {
            const peerMediaInfo = session._signalingLayer.getPeerMediaInfo(remote, MediaType.VIDEO);

            return peerMediaInfo
                ? peerMediaInfo.codecList ?? [ peerMediaInfo.codecType ]
                : [];
        });

        const selectedCodecOrder = localPreferredCodecOrder.reduce((acc, localCodec) => {
            let codecNotSupportedByRemote = false;

            // Remove any codecs that are not supported by any of the remote endpoints. The order of the supported
            // codecs locally however will remain the same since we want to support asymmetric codecs.
            for (const remoteCodecs of remoteCodecsPerParticipant) {
                codecNotSupportedByRemote = codecNotSupportedByRemote
                    || (remoteCodecs.length && !remoteCodecs.find(participantCodec => participantCodec === localCodec));
            }

            if (!codecNotSupportedByRemote) {
                acc.push(localCodec);
            }

            return acc;
        }, []);

        if (!selectedCodecOrder.length) {
            logger.warn('Invalid codec list generated because of a user joining/leaving the call');

            return;
        }

        // Reconfigure the codecs on the media session.
        if (!selectedCodecOrder.every((val, index) => val === currentCodecOrder[index])) {
            session.setVideoCodecs(selectedCodecOrder);
        }
    }

    /**
     * Returns the current codec preference order for the given connection type.
     *
     * @param {String} connectionType The media connection type, 'p2p' or 'jvb'.
     * @returns {Array<string>}
     */
    getCodecPreferenceList(connectionType) {
        return this.codecPreferenceOrder[connectionType];
    }
}
