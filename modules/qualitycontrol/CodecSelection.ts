import { getLogger } from '@jitsi/logger';

import JitsiConference from '../../JitsiConference';
import { CodecMimeType } from '../../service/RTC/CodecMimeType';
import { MediaType } from '../../service/RTC/MediaType';
import { VIDEO_CODECS_BY_COMPLEXITY } from '../../service/RTC/StandardVideoQualitySettings';
import { VideoType } from '../../service/RTC/VideoType';
import JitsiLocalTrack from '../RTC/JitsiLocalTrack';
import browser from '../browser';
import JingleSessionPC from '../xmpp/JingleSessionPC';

const logger = getLogger('qc:CodecSelection');

// Default video codec preferences on mobile and desktop endpoints.
const DESKTOP_VIDEO_CODEC_ORDER = [ CodecMimeType.AV1, CodecMimeType.VP9, CodecMimeType.VP8, CodecMimeType.H264 ];
const MOBILE_P2P_VIDEO_CODEC_ORDER = [ CodecMimeType.H264, CodecMimeType.VP8, CodecMimeType.VP9, CodecMimeType.AV1 ];
const MOBILE_VIDEO_CODEC_ORDER = [ CodecMimeType.VP8, CodecMimeType.VP9, CodecMimeType.H264, CodecMimeType.AV1 ];

export interface ICodecSelectionOptions {
    [connectionType: string]: {
        disabledCodec?: string;
        enableAV1ForFF?: boolean;
        preferenceOrder?: string[];
        preferredCodec?: string;
        screenshareCodec?: string;
    };
}

export type CodecPreferenceOrder = { [connectionType: string]: string[]; };
export type ScreenshareCodec = { [connectionType: string]: string; };

/**
 * This class handles the codec selection mechanism for the conference based on the config.js settings.
 * The preferred codec is selected based on the settings and the list of codecs supported by the browser.
 * The preferred codec is published in presence which is then used by the other endpoints in the
 * conference to pick a supported codec at join time and when the call transitions between p2p and jvb
 * connections.
 */
export class CodecSelection {
    private codecPreferenceOrder: CodecPreferenceOrder;
    private conference: JitsiConference;
    private encodeTimeStats: Map<string, unknown>;
    private options: ICodecSelectionOptions;
    private screenshareCodec: ScreenshareCodec;
    private visitorCodecs: string[];

    /**
     * Creates a new instance for a given conference.
     *
     * @param {JitsiConference} conference the conference instance
     * @param {*} options
     * @param {string} options.jvb settings (codec list, preferred and disabled) for the jvb connection.
     * @param {string} options.p2p settings (codec list, preferred and disabled) for the p2p connection.
     */
    constructor(conference: JitsiConference, options: ICodecSelectionOptions) {
        this.codecPreferenceOrder = {};
        this.conference = conference;
        this.encodeTimeStats = new Map();
        this.options = options;
        this.screenshareCodec = {};
        this.visitorCodecs = [];

        for (const connectionType of Object.keys(options)) {
            let { disabledCodec, preferredCodec, preferenceOrder } = options[connectionType];
            const { enableAV1ForFF = false, screenshareCodec } = options[connectionType];
            const supportedCodecs = new Set(this._getSupportedVideoCodecs(connectionType));

            // Default preference codec order when no codec preferences are set in config.js
            let selectedOrder = Array.from(supportedCodecs);

            if (preferenceOrder) {
                preferenceOrder = preferenceOrder.map(codec => codec.toLowerCase());

                // Select all codecs that are supported by the browser.
                selectedOrder = preferenceOrder.filter(codec => supportedCodecs.has(codec));

            // Generate the codec list based on the supported codecs and the preferred/disabled (deprecated) settings
            } else if (preferredCodec || disabledCodec) {
                disabledCodec = disabledCodec?.toLowerCase();
                preferredCodec = preferredCodec?.toLowerCase();

                // VP8 cannot be disabled since it the default codec.
                if (disabledCodec && disabledCodec !== CodecMimeType.VP8) {
                    selectedOrder = selectedOrder.filter(codec => codec !== disabledCodec);
                }

                const index = selectedOrder.findIndex(codec => codec === preferredCodec);

                // Move the preferred codec to the top of the list.
                if (preferredCodec && index !== -1) {
                    selectedOrder.splice(index, 1);
                    selectedOrder.unshift(preferredCodec);
                }
            }

            // Push AV1 and VP9 to the end of the list if they are supported by the browser but has implementation bugs
            // For example, 136 and newer versions of Firefox supports AV1 but only simulcast and not SVC. Even with
            // simulcast, temporal scalability is not supported. This way Firefox will continue to decode AV1 from
            // other endpoints but will use VP8 for encoding. Similar issues exist with VP9 on Safari and Firefox.
            const isVp9EncodeSupported = browser.supportsVP9() || (browser.isWebKitBased() && connectionType === 'p2p');

            [ CodecMimeType.AV1, CodecMimeType.VP9 ].forEach(codec => {
                if ((codec === CodecMimeType.AV1 && browser.isFirefox() && !enableAV1ForFF)
                    || (codec === CodecMimeType.VP9 && !isVp9EncodeSupported)) {
                    const index = selectedOrder.findIndex(selectedCodec => selectedCodec === codec);

                    if (index !== -1) {
                        selectedOrder.splice(index, 1);

                        selectedOrder.push(codec);
                    }
                }
            });

            // Safari retports AV1 as supported on M3+ macs. Because of some decoder/encoder issues reported AV1 should
            // be disabled until all issues are resolved.
            if (browser.isWebKitBased()) {
                selectedOrder = selectedOrder.filter(codec => codec !== CodecMimeType.AV1);
            }

            logger.info(`Codec preference order for ${connectionType} connection is ${selectedOrder}`);
            this.codecPreferenceOrder[connectionType] = selectedOrder;

            // Set the preferred screenshare codec.
            if (screenshareCodec && supportedCodecs.has(screenshareCodec.toLowerCase())) {
                this.screenshareCodec[connectionType] = screenshareCodec.toLowerCase();
            }
        }
    }

    /**
     * Returns a list of video codecs that are supported by the browser.
     *
     * @param {string} connectionType - media connection type, p2p or jvb.
     * @returns {Array}
     */
    _getSupportedVideoCodecs(connectionType: string): string[] {
        const videoCodecMimeTypes = browser.isMobileDevice() && connectionType === 'p2p'
            ? MOBILE_P2P_VIDEO_CODEC_ORDER
            : browser.isMobileDevice() ? MOBILE_VIDEO_CODEC_ORDER : DESKTOP_VIDEO_CODEC_ORDER;

        const supportedCodecs = videoCodecMimeTypes.filter(codec =>
            (window.RTCRtpReceiver?.getCapabilities?.(MediaType.VIDEO)?.codecs ?? [])
                .some(supportedCodec => supportedCodec.mimeType.toLowerCase() === `${MediaType.VIDEO}/${codec}`));

        // Select VP8 as the default codec if RTCRtpReceiver.getCapabilities() is not supported by the browser or if it
        // returns an empty set.
        !supportedCodecs.length && supportedCodecs.push(CodecMimeType.VP8);

        return supportedCodecs;
    }

    /**
     * Returns the current codec preference order for the given connection type.
     *
     * @param {String} connectionType The media connection type, 'p2p' or 'jvb'.
     * @returns {Array<string>}
     */
    getCodecPreferenceList(connectionType: string): string[] {
        return this.codecPreferenceOrder[connectionType];
    }

    /**
     * Returns the preferred screenshare codec for the given connection type.
     *
     * @param {Optional} connectionType The media connection type, 'p2p' or 'jvb'.
     * @returns CodecMimeType
     */
    getScreenshareCodec(connectionType: string): Optional<string> {
        return this.screenshareCodec[connectionType];
    }

    /**
     * Sets the codec on the media session based on the codec preference order configured in config.js and the supported
     * codecs published by the remote participants in their presence.
     *
     * @param {JingleSessionPC} mediaSession session for which the codec selection has to be made.
     */
    selectPreferredCodec(mediaSession?: JingleSessionPC): void {
        const session = mediaSession ? mediaSession : this.conference.jvbJingleSession;

        if (!session) {
            return;
        }

        let localPreferredCodecOrder = this.codecPreferenceOrder.jvb;

        // E2EE is curently supported only for VP8 codec.
        if (this.conference.isE2EEEnabled()) {
            localPreferredCodecOrder = [ CodecMimeType.VP8 ];
        }

        const remoteParticipants = this.conference.getParticipants().map(participant => participant.getId());
        const remoteCodecsPerParticipant = remoteParticipants?.map(remote => {
            const peerMediaInfo = session._signalingLayer.getPeerMediaInfo(remote, MediaType.VIDEO);

            if (peerMediaInfo?.codecList) {
                return peerMediaInfo.codecList;
            } else if (peerMediaInfo?.codecType) {
                return [ peerMediaInfo.codecType ];
            }

            return [];
        }) ?? [];

        // Include the visitor codecs.
        this.visitorCodecs.length && remoteCodecsPerParticipant.push(this.visitorCodecs);

        const selectedCodecOrder = localPreferredCodecOrder.reduce<CodecMimeType[]>((acc, localCodec) => {
            let codecNotSupportedByRemote = false;

            // Remove any codecs that are not supported by any of the remote endpoints. The order of the supported
            // codecs locally however will remain the same since we want to support asymmetric codecs.
            for (const remoteCodecs of remoteCodecsPerParticipant) {
                // Ignore remote participants that do not publish codec preference in presence (transcriber).
                if (remoteCodecs.length) {
                    codecNotSupportedByRemote = codecNotSupportedByRemote
                    || !remoteCodecs.find(participantCodec => participantCodec === localCodec);
                }
            }
            if (!codecNotSupportedByRemote) {
                acc.push(localCodec as CodecMimeType);
            }

            return acc;
        }, []);

        if (!selectedCodecOrder.length) {
            logger.warn('Invalid codec list generated because of a user joining/leaving the call');

            return;
        }

        session.setVideoCodecs(selectedCodecOrder, this.screenshareCodec?.jvb as CodecMimeType);
    }

    /**
     * Changes the codec preference order.
     *
     * @param {JitsiLocalTrack} localTrack - The local video track.
     * @param {CodecMimeType} codec - The codec used for encoding the given local video track.
     * @returns boolean - Returns true if the codec order has been updated, false otherwise.
     */
    changeCodecPreferenceOrder(localTrack: JitsiLocalTrack, codec: string): boolean {
        const session = this.conference.getActiveMediaSession();
        const connectionType = session.isP2P ? 'p2p' : 'jvb';
        const codecOrder = this.codecPreferenceOrder[connectionType];
        const videoType = localTrack.getVideoType();
        const codecsByVideoType = VIDEO_CODECS_BY_COMPLEXITY[videoType]
            .filter(val => Boolean(codecOrder.find(supportedCodec => supportedCodec === val)));
        const codecIndex = codecsByVideoType.findIndex(val => val === codec.toLowerCase());

        // Do nothing if we are using the lowest complexity codec already.
        if (codecIndex === codecsByVideoType.length - 1) {
            return false;
        }

        const newCodec = codecsByVideoType[codecIndex + 1];

        if (videoType === VideoType.CAMERA) {
            const idx = codecOrder.findIndex(val => val === newCodec);

            codecOrder.splice(idx, 1);
            codecOrder.unshift(newCodec);
            logger.info(`QualityController - switching camera codec to ${newCodec} because of cpu restriction`);
        } else {
            this.screenshareCodec[connectionType] = newCodec;
            logger.info(`QualityController - switching screenshare codec to ${newCodec} because of cpu restriction`);
        }

        this.selectPreferredCodec(session);

        return true;
    }

    /**
     * Updates the aggregate list of the codecs supported by all the visitors in the call and calculates the
     * selected codec if needed.
     * @param {Array} codecList - visitor codecs.
     * @returns {void}
     */
    updateVisitorCodecs(codecList: string[]): void {
        if (this.visitorCodecs === codecList) {
            return;
        }

        this.visitorCodecs = codecList;
        this.selectPreferredCodec();
    }
}
