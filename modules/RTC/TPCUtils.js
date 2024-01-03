import { getLogger } from '@jitsi/logger';
import clonedeep from 'lodash.clonedeep';
import transform from 'sdp-transform';

import CodecMimeType from '../../service/RTC/CodecMimeType';
import { MediaDirection } from '../../service/RTC/MediaDirection';
import { MediaType } from '../../service/RTC/MediaType';
import { getSourceIndexFromSourceName } from '../../service/RTC/SignalingLayer';
import { STANDARD_CODEC_SETTINGS } from '../../service/RTC/StandardVideoSettings';
import VideoEncoderScalabilityMode from '../../service/RTC/VideoEncoderScalabilityMode';
import { VideoType } from '../../service/RTC/VideoType';
import browser from '../browser';
import FeatureFlags from '../flags/FeatureFlags';

const logger = getLogger(__filename);
const DESKTOP_SHARE_RATE = 500000;
const SIM_LAYER_1_RID = '1';
const SIM_LAYER_2_RID = '2';
const SIM_LAYER_3_RID = '3';
const VIDEO_CODECS = [ CodecMimeType.AV1, CodecMimeType.H264, CodecMimeType.VP8, CodecMimeType.VP9 ];

// TODO - need to revisit these settings when 4K is the captured resolution. We can change the LD scale factor to 6
// instead of 4 so that the lowest resolution will be 360p instead of 540p.
export const HD_SCALE_FACTOR = 1.0;
export const LD_SCALE_FACTOR = 4.0;
export const SD_SCALE_FACTOR = 2.0;
export const SIM_LAYER_RIDS = [ SIM_LAYER_1_RID, SIM_LAYER_2_RID, SIM_LAYER_3_RID ];

/**
 * Handles track related operations on TraceablePeerConnection when browser is
 * running in unified plan mode.
 */
export class TPCUtils {
    /**
     * Creates a new instance for a given TraceablePeerConnection
     *
     * @param peerconnection - the tpc instance for which we have utility functions.
     */
    constructor(peerconnection) {
        this.pc = peerconnection;
        this.codecSettings = clonedeep(STANDARD_CODEC_SETTINGS);
        const videoQualitySettings = this.pc.options?.videoQuality;

        if (videoQualitySettings) {
            for (const codec of VIDEO_CODECS) {
                const codecConfig = videoQualitySettings[codec];
                const bitrateSettings = codecConfig?.maxBitratesVideo

                    // Read the deprecated settings for max bitrates.
                    ?? (videoQualitySettings.maxbitratesvideo
                        && videoQualitySettings.maxbitratesvideo[codec.toUpperCase()]);

                if (bitrateSettings) {
                    [ 'low', 'standard', 'high', 'ssHigh' ].forEach(value => {
                        if (bitrateSettings[value]) {
                            this.codecSettings[codec].maxBitratesVideo[value] = bitrateSettings[value];
                        }
                    });
                }

                if (!codecConfig) {
                    continue; // eslint-disable-line no-continue
                }

                const scalabilityModeEnabled = this.codecSettings[codec].scalabilityModeEnabled
                    && (typeof codecConfig.scalabilityModeEnabled === 'undefined'
                        || codecConfig.scalabilityModeEnabled);

                if (scalabilityModeEnabled) {
                    typeof codecConfig.useSimulcast !== 'undefined'
                        && (this.codecSettings[codec].useSimulcast = codecConfig.useSimulcast);
                    typeof codecConfig.useKSVC !== 'undefined'
                        && (this.codecSettings[codec].useKSVC = codecConfig.useKSVC);
                } else {
                    this.codecSettings[codec].scalabilityModeEnabled = false;
                }
            }
        }
    }

    /**
     * Calculates the configuration of the active encoding when the browser sends only one stream, i,e,, when there is
     * no spatial scalability configure (p2p) or when it is running in full SVC mode.
     *
     * @param {JitsiLocalTrack} localVideoTrack - The local video track.
     * @param {CodecMimeType} codec - The video codec.
     * @param {number} newHeight - The resolution that needs to be configured for the local video track.
     * @returns {Object} configuration.
     */
    _calculateActiveEncodingParams(localVideoTrack, codec, newHeight) {
        const codecBitrates = this.codecSettings[codec].maxBitratesVideo;
        const height = localVideoTrack.getHeight();
        const desktopShareBitrate = this.pc.options?.videoQuality?.desktopbitrate || DESKTOP_SHARE_RATE;
        const isScreenshare = localVideoTrack.getVideoType() === VideoType.DESKTOP;
        let scalabilityMode = this.codecSettings[codec].useKSVC
            ? VideoEncoderScalabilityMode.L3T3_KEY : VideoEncoderScalabilityMode.L3T3;
        let maxBitrate = codecBitrates.high;

        if (this._isScreenshareBitrateCapped(localVideoTrack)) {
            scalabilityMode = VideoEncoderScalabilityMode.L1T3;
            maxBitrate = desktopShareBitrate;
        } else if (localVideoTrack.getVideoType() === VideoType.DESKTOP) {
            maxBitrate = codecBitrates.ssHigh;
        }

        const config = {
            active: newHeight > 0,
            maxBitrate,
            scalabilityMode,
            scaleResolutionDownBy: HD_SCALE_FACTOR
        };

        if (newHeight >= height || newHeight === 0 || isScreenshare) {
            return config;
        }

        if (newHeight >= height / SD_SCALE_FACTOR) {
            config.maxBitrate = codecBitrates.standard;
            config.scalabilityMode = this.codecSettings[codec].useKSVC
                ? VideoEncoderScalabilityMode.L2T3_KEY : VideoEncoderScalabilityMode.L2T3;
            config.scaleResolutionDownBy = SD_SCALE_FACTOR;
        } else {
            config.maxBitrate = codecBitrates.low;
            config.scalabilityMode = VideoEncoderScalabilityMode.L1T3;
            config.scaleResolutionDownBy = LD_SCALE_FACTOR;
        }

        return config;
    }

    /**
     * Obtains stream encodings that need to be configured on the given track based
     * on the track media type and the simulcast setting.
     * @param {JitsiLocalTrack} localTrack
     */
    _getStreamEncodings(localTrack) {
        const codec = this.pc.getConfiguredVideoCodec();
        const encodings = this._getVideoStreamEncodings(localTrack.getVideoType(), codec);

        if (this.pc.isSpatialScalabilityOn() && localTrack.isVideoTrack()) {
            return encodings;
        }

        return localTrack.isVideoTrack()
            ? [ {
                active: this.pc.videoTransferActive,
                maxBitrate: this.codecSettings[codec].maxBitratesVideo.high
            } ]
            : [ { active: this.pc.audioTransferActive } ];
    }

    /**
     * The startup configuration for the stream encodings that are applicable to
     * the video stream when a new sender is created on the peerconnection. The initial
     * config takes into account the differences in browser's simulcast implementation.
     *
     * Encoding parameters:
     * active - determine the on/off state of a particular encoding.
     * maxBitrate - max. bitrate value to be applied to that particular encoding
     *  based on the encoding's resolution and config.js videoQuality settings if applicable.
     * rid - Rtp Stream ID that is configured for a particular simulcast stream.
     * scaleResolutionDownBy - the factor by which the encoding is scaled down from the
     *  original resolution of the captured video.
     *
     * @param {VideoType} videoType
     * @param {String} codec
     */
    _getVideoStreamEncodings(videoType, codec) {
        const codecBitrates = this.codecSettings[codec].maxBitratesVideo;
        const maxVideoBitrate = videoType === VideoType.DESKTOP
            ? codecBitrates.ssHigh : codecBitrates.high;

        // The SSRCs on older versions of Firefox are reversed in SDP, i.e., they have resolution order of 1:2:4 as
        // opposed to Chromium and other browsers. This has been reverted in Firefox 117 as part of the below commit.
        // https://hg.mozilla.org/mozilla-central/rev/b0348f1f8d7197fb87158ba74542d28d46133997
        // This revert seems to be applied only to camera tracks, the desktop stream encodings still have the
        // resolution order of 4:2:1.
        const reversedEncodings = browser.isFirefox()
            && (videoType === VideoType.DESKTOP || browser.isVersionLessThan(117));

        const standardSimulcastEncodings = [
            {
                active: this.pc.videoTransferActive,
                maxBitrate: reversedEncodings ? maxVideoBitrate : codecBitrates.low,
                rid: SIM_LAYER_1_RID,
                scaleResolutionDownBy: reversedEncodings ? HD_SCALE_FACTOR : LD_SCALE_FACTOR
            },
            {
                active: this.pc.videoTransferActive,
                maxBitrate: codecBitrates.standard,
                rid: SIM_LAYER_2_RID,
                scaleResolutionDownBy: SD_SCALE_FACTOR
            },
            {
                active: this.pc.videoTransferActive,
                maxBitrate: reversedEncodings ? codecBitrates.low : maxVideoBitrate,
                rid: SIM_LAYER_3_RID,
                scaleResolutionDownBy: reversedEncodings ? LD_SCALE_FACTOR : HD_SCALE_FACTOR
            }
        ];

        if (this.codecSettings[codec].scalabilityModeEnabled) {
            // Configure all 3 encodings when simulcast is requested through config.js for AV1 and VP9 and for H.264
            // always since that is the only supported mode when DD header extension is negotiated for H.264.
            if (this.codecSettings[codec].useSimulcast || codec === CodecMimeType.H264) {
                for (const encoding of standardSimulcastEncodings) {
                    encoding.scalabilityMode = VideoEncoderScalabilityMode.L1T3;
                }

                return standardSimulcastEncodings;
            }

            // Configure only one encoding for the SVC mode.
            return [
                {
                    active: this.pc.videoTransferActive,
                    maxBitrate: maxVideoBitrate,
                    rid: SIM_LAYER_1_RID,
                    scaleResolutionDownBy: HD_SCALE_FACTOR,
                    scalabilityMode: this.codecSettings[codec].useKSVC
                        ? VideoEncoderScalabilityMode.L3T3_KEY : VideoEncoderScalabilityMode.L3T3
                },
                {
                    active: false,
                    maxBitrate: 0
                },
                {
                    active: false,
                    maxBitrate: 0
                }
            ];
        }

        return standardSimulcastEncodings;
    }

    /**
     * Returns a boolean indicating whether the video encoder is running in full SVC mode, i.e., it sends only one
     * video stream that has both temporal and spatial scalability.
     *
     * @param {CodecMimeType} codec
     * @returns boolean
     */
    _isRunningInFullSvcMode(codec) {
        return (codec === CodecMimeType.VP9 || codec === CodecMimeType.AV1)
            && this.codecSettings[codec].scalabilityModeEnabled
            && !this.codecSettings[codec].useSimulcast;
    }

    /**
     * Returns a boolean indicating whether the bitrate needs to be capped for the local video track if it happens to
     * be a screenshare track. The lower spatial layers for screensharing are disabled when low fps screensharing is in
     * progress. Sending all three streams often results in the browser suspending the high resolution in low b/w and
     * and low cpu conditions, especially on the low end machines. Suspending the low resolution streams ensures that
     * the highest resolution stream is available always. Safari is an exception here since it does not send the
     * desktop stream at all if only the high resolution stream is enabled.
     *
     * @param {JitsiLocalTrack} localVideoTrack - The local video track.
     * @returns {boolean}
     */
    _isScreenshareBitrateCapped(localVideoTrack) {
        return localVideoTrack.getVideoType() === VideoType.DESKTOP
            && this.pc._capScreenshareBitrate
            && !browser.isWebKitBased();
    }

    /**
     * Updates the sender parameters in the stream encodings.
     *
     * @param {RTCRtpSender} sender - the sender associated with a MediaStreamTrack.
     * @param {boolean} enable - whether the streams needs to be enabled or disabled.
     * @returns {Promise} - A promise that resolves when the operation is successful, rejected otherwise.
     */
    _updateSenderEncodings(sender, enable) {
        const parameters = sender.getParameters();

        if (parameters?.encodings?.length) {
            for (const encoding of parameters.encodings) {
                encoding.active = enable;
            }
        }

        return sender.setParameters(parameters);
    }

    /**
    * Adds {@link JitsiLocalTrack} to the WebRTC peerconnection for the first time.
    * @param {JitsiLocalTrack} track - track to be added to the peerconnection.
    * @param {boolean} isInitiator - boolean that indicates if the endpoint is offerer in a p2p connection.
    * @returns {void}
    */
    addTrack(localTrack, isInitiator) {
        const track = localTrack.getTrack();

        if (isInitiator) {
            const streams = [];

            if (localTrack.getOriginalStream()) {
                streams.push(localTrack.getOriginalStream());
            }

            // Use pc.addTransceiver() for the initiator case when local tracks are getting added
            // to the peerconnection before a session-initiate is sent over to the peer.
            const transceiverInit = {
                direction: MediaDirection.SENDRECV,
                streams,
                sendEncodings: []
            };

            if (!browser.isFirefox()) {
                transceiverInit.sendEncodings = this._getStreamEncodings(localTrack);
            }
            this.pc.peerconnection.addTransceiver(track, transceiverInit);
        } else {
            // Use pc.addTrack() for responder case so that we can re-use the m-lines that were created
            // when setRemoteDescription was called. pc.addTrack() automatically  attaches to any existing
            // unused "recv-only" transceiver.
            this.pc.peerconnection.addTrack(track);
        }
    }

    /**
     * Returns the calculated active state of the stream encodings based on the frame height requested for the send
     * stream. All the encodings that have a resolution lower than the frame height requested will be enabled.
     *
     * @param {JitsiLocalTrack} localVideoTrack The local video track.
     * @param {CodecMimeType} codec - The codec currently in use.
     * @param {number} newHeight The resolution requested for the video track.
     * @returns {Array<boolean>}
     */
    calculateEncodingsActiveState(localVideoTrack, codec, newHeight) {
        const height = localVideoTrack.getHeight();
        const videoStreamEncodings = this._getVideoStreamEncodings(localVideoTrack.getVideoType(), codec);
        const encodingsState = videoStreamEncodings
        .map(encoding => height / encoding.scaleResolutionDownBy)
        .map((frameHeight, idx) => {
            // Single video stream.
            if (!this.pc.isSpatialScalabilityOn() || this._isRunningInFullSvcMode(codec)) {
                const { active } = this._calculateActiveEncodingParams(localVideoTrack, codec, newHeight);

                return idx === 0 ? active : false;
            }

            // Multiple video streams.
            let active = false;

            if (newHeight > 0) {
                if (localVideoTrack.getVideoType() === VideoType.CAMERA) {

                    active = frameHeight <= newHeight

                        // Keep the LD stream enabled even when the LD stream's resolution is higher than of the
                        // requested resolution. This can happen when camera is captured at high resolutions like 4k
                        // but the requested resolution is 180. Since getParameters doesn't give us information about
                        // the resolutions of the simulcast encodings, we have to rely on our initial config for the
                        // simulcast streams.
                        || videoStreamEncodings[idx]?.scaleResolutionDownBy === LD_SCALE_FACTOR;
                } else {
                    // For screenshare, keep the HD layer enabled always and the lower layers only for high fps
                    // screensharing.
                    active = videoStreamEncodings[idx].scaleResolutionDownBy === HD_SCALE_FACTOR
                        || !this._isScreenshareBitrateCapped(localVideoTrack);
                }
            }

            return active;
        });

        return encodingsState;
    }

    /**
     * Returns the calculated max bitrates that need to be configured on the stream encodings based on the video
     * type and other considerations associated with screenshare.
     *
     * @param {JitsiLocalTrack} localVideoTrack The local video track.
     * @param {CodecMimeType} codec - The codec currently in use.
     * @param {number} newHeight The resolution requested for the video track.
     * @returns {Array<number>}
     */
    calculateEncodingsBitrates(localVideoTrack, codec, newHeight) {
        const videoType = localVideoTrack.getVideoType();
        const desktopShareBitrate = this.pc.options?.videoQuality?.desktopbitrate || DESKTOP_SHARE_RATE;
        const encodingsBitrates = this._getVideoStreamEncodings(localVideoTrack.getVideoType(), codec)
        .map((encoding, idx) => {
            let bitrate = encoding.maxBitrate;

            // Single video stream.
            if (!this.pc.isSpatialScalabilityOn() || this._isRunningInFullSvcMode(codec)) {
                const { maxBitrate } = this._calculateActiveEncodingParams(localVideoTrack, codec, newHeight);

                return idx === 0 ? maxBitrate : 0;
            }

            // Multiple video streams.
            if (this._isScreenshareBitrateCapped(localVideoTrack)) {
                bitrate = desktopShareBitrate;
            } else if (videoType === VideoType.DESKTOP && browser.isChromiumBased() && !this.pc.usesUnifiedPlan()) {
                // For high fps screenshare, 'maxBitrate' setting must be cleared on Chrome in plan-b, because
                // if simulcast is enabled for screen and maxBitrates are set then Chrome will not send the
                // desktop stream.
                bitrate = undefined;
            }

            return bitrate;
        });

        return encodingsBitrates;
    }

    /**
     * Returns the calculated scalability modes for the video encodings when scalability modes are supported.
     *
     * @param {JitsiLocalTrack} localVideoTrack The local video track.
     * @param {CodecMimeType} codec - The codec currently in use.
     * @param {number} maxHeight The resolution requested for the video track.
     * @returns {Array<VideoEncoderScalabilityMode> | undefined}
     */
    calculateEncodingsScalabilityMode(localVideoTrack, codec, maxHeight) {
        if (!this.pc.isSpatialScalabilityOn() || !this.codecSettings[codec].scalabilityModeEnabled) {
            return;
        }

        // Default modes for simulcast.
        const scalabilityModes = [
            VideoEncoderScalabilityMode.L1T3,
            VideoEncoderScalabilityMode.L1T3,
            VideoEncoderScalabilityMode.L1T3
        ];

        // Full SVC mode.
        if (this._isRunningInFullSvcMode(codec)) {
            const { scalabilityMode }
                = this._calculateActiveEncodingParams(localVideoTrack, codec, maxHeight);

            scalabilityModes[0] = scalabilityMode;
            scalabilityModes[1] = undefined;
            scalabilityModes[2] = undefined;

            return scalabilityModes;
        }

        return scalabilityModes;
    }

    /**
     * Returns the scale factor that needs to be applied on the local video stream based on the desired resolution
     * and the codec in use.
     *
     * @param {JitsiLocalTrack} localVideoTrack The local video track.
     * @param {CodecMimeType} codec - The codec currently in use.
     * @param {number} maxHeight The resolution requested for the video track.
     * @returns {Array<float>}
     */
    calculateEncodingsScaleFactor(localVideoTrack, codec, maxHeight) {
        if (this.pc.isSpatialScalabilityOn() && this.isRunningInSimulcastMode(codec)) {
            return this._getVideoStreamEncodings(localVideoTrack.getVideoType(), codec)
                .map(encoding => encoding.scaleResolutionDownBy);
        }

        // Single video stream.
        const { scaleResolutionDownBy }
            = this._calculateActiveEncodingParams(localVideoTrack, codec, maxHeight);

        return [ scaleResolutionDownBy, undefined, undefined ];
    }

    /**
     * Ensures that the ssrcs associated with a FID ssrc-group appear in the correct order, i.e.,
     * the primary ssrc first and the secondary rtx ssrc later. This is important for unified
     * plan since we have only one FID group per media description.
     * @param {Object} description the webRTC session description instance for the remote
     * description.
     * @private
     */
    ensureCorrectOrderOfSsrcs(description) {
        const parsedSdp = transform.parse(description.sdp);

        parsedSdp.media.forEach(mLine => {
            if (mLine.type === MediaType.AUDIO) {
                return;
            }
            if (!mLine.ssrcGroups || !mLine.ssrcGroups.length) {
                return;
            }
            let reorderedSsrcs = [];

            const ssrcs = new Set();

            mLine.ssrcGroups.map(group =>
                group.ssrcs
                    .split(' ')
                    .filter(Boolean)
                    .forEach(ssrc => ssrcs.add(ssrc))
            );

            ssrcs.forEach(ssrc => {
                const sources = mLine.ssrcs.filter(source => source.id.toString() === ssrc);

                reorderedSsrcs = reorderedSsrcs.concat(sources);
            });
            mLine.ssrcs = reorderedSsrcs;
        });

        return new RTCSessionDescription({
            type: description.type,
            sdp: transform.write(parsedSdp)
        });
    }

    /**
     * Returns the max resolution that the client is configured to encode for a given local video track. The actual
     * send resolution might be downscaled based on cpu and bandwidth constraints.
     *
     * @param {JitsiLocalTrack} localVideoTrack - The local video track.
     * @param {CodecMimeType} codec - The codec currently in use.
     * @returns {number|null} The max encoded resolution for the given video track.
     */
    getConfiguredEncodeResolution(localVideoTrack, codec) {
        const height = localVideoTrack.getHeight();
        const videoSender = this.pc.findSenderForTrack(localVideoTrack.getTrack());
        let maxHeight = 0;

        if (!videoSender) {
            return null;
        }
        const parameters = videoSender.getParameters();

        if (!parameters?.encodings?.length) {
            return null;
        }

        // SVC mode for VP9 and AV1 codecs.
        if (this._isRunningInFullSvcMode(codec)) {
            const activeEncoding = parameters.encodings[0];

            if (activeEncoding.active) {
                return height / activeEncoding.scaleResolutionDownBy;
            }

            return null;
        }

        const hasIncorrectConfig = this.pc._capScreenshareBitrate
            ? parameters.encodings.every(encoding => encoding.active)
            : parameters.encodings.some(encoding => !encoding.active);
        const videoType = localVideoTrack.getVideoType();

        // Check if every encoding is active for screenshare track when low fps screenshare is configured or some
        // of the encodings are disabled when high fps screenshare is configured. In both these cases, the track
        // encodings need to be reconfigured. This is needed when p2p->jvb switch happens and new sender constraints
        // are not received by the client.
        if (videoType === VideoType.DESKTOP && hasIncorrectConfig) {
            return null;
        }

        for (const encoding in parameters.encodings) {
            if (parameters.encodings[encoding].active) {
                const encodingConfig = this._getVideoStreamEncodings(videoType, codec);
                const scaleResolutionDownBy
                    = this.pc.isSpatialScalabilityOn()
                        ? encodingConfig[encoding].scaleResolutionDownBy
                        : parameters.encodings[encoding].scaleResolutionDownBy;

                maxHeight = Math.max(maxHeight, height / scaleResolutionDownBy);
            }
        }

        return maxHeight;
    }

    /**
     * Takes in a *unified plan* offer and inserts the appropriate parameters for adding simulcast receive support.
     * @param {Object} desc - A session description object
     * @param {String} desc.type - the type (offer/answer)
     * @param {String} desc.sdp - the sdp content
     *
     * @return {Object} A session description (same format as above) object with its sdp field modified to advertise
     * simulcast receive support.
     */
    insertUnifiedPlanSimulcastReceive(desc) {
        // a=simulcast line is not needed on browsers where we SDP munging is used for enabling on simulcast.
        // Remove this check when the client switches to RID/MID based simulcast on all browsers.
        if (browser.usesSdpMungingForSimulcast()) {
            return desc;
        }
        const rids = [
            {
                id: SIM_LAYER_1_RID,
                direction: 'recv'
            },
            {
                id: SIM_LAYER_2_RID,
                direction: 'recv'
            },
            {
                id: SIM_LAYER_3_RID,
                direction: 'recv'
            }
        ];

        // Firefox 72 has stopped parsing the legacy rid= parameters in simulcast attributes.
        // eslint-disable-next-line max-len
        // https://www.fxsitecompat.dev/en-CA/docs/2019/pt-and-rid-in-webrtc-simulcast-attributes-are-no-longer-supported/
        const simulcastLine = browser.isFirefox() && browser.isVersionGreaterThan(71)
            ? `recv ${SIM_LAYER_RIDS.join(';')}`
            : `recv rid=${SIM_LAYER_RIDS.join(';')}`;
        const sdp = transform.parse(desc.sdp);
        const mLines = sdp.media.filter(m => m.type === MediaType.VIDEO);
        const senderMids = Array.from(this.pc._localTrackTransceiverMids.values());

        mLines.forEach((mLine, idx) => {
            // Make sure the simulcast recv line is only set on video descriptions that are associated with senders.
            if (senderMids.find(sender => mLine.mid.toString() === sender.toString()) || idx === 0) {
                if (!mLine.simulcast_03 || !mLine.simulcast) {
                    mLine.rids = rids;

                    // eslint-disable-next-line camelcase
                    mLine.simulcast_03 = {
                        value: simulcastLine
                    };
                }
            } else {
                mLine.rids = undefined;
                mLine.simulcast = undefined;

                // eslint-disable-next-line camelcase
                mLine.simulcast_03 = undefined;
            }
        });

        return new RTCSessionDescription({
            type: desc.type,
            sdp: transform.write(sdp)
        });
    }

    /**
     * Returns a boolean indicating whether the video encoder is running in Simulcast mode, i.e., three encodings need
     * to be configured in 4:2:1 resolution order with temporal scalability.
     *
     * @param {CodecMimeType} codec - The video codec in use.
     * @returns {boolean}
     */
    isRunningInSimulcastMode(codec) {
        return codec === CodecMimeType.VP8 // VP8 always

            // K-SVC mode for VP9 when no scalability mode is set. Though only one outbound-rtp stream is present,
            // three separate encodings have to be configured.
            || (!this.codecSettings[codec].scalabilityModeEnabled && codec === CodecMimeType.VP9)

            // When scalability is enabled, always for H.264, and only when simulcast is explicitly enabled via
            // config.js for VP9 and AV1 since full SVC is the default mode for these 2 codecs.
            || (this.codecSettings[codec].scalabilityModeEnabled
                && (codec === CodecMimeType.H264 || this.codecSettings[codec].useSimulcast));
    }

    /**
     * Replaces the existing track on a RTCRtpSender with the given track.
     *
     * @param {JitsiLocalTrack} oldTrack - existing track on the sender that needs to be removed.
     * @param {JitsiLocalTrack} newTrack - new track that needs to be added to the sender.
     * @returns {Promise<RTCRtpTransceiver>} - resolved with the associated transceiver when done, rejected otherwise.
     */
    replaceTrack(oldTrack, newTrack) {
        const mediaType = newTrack?.getType() ?? oldTrack?.getType();
        const localTracks = this.pc.getLocalTracks(mediaType);
        const track = newTrack?.getTrack() ?? null;
        const isNewLocalSource = FeatureFlags.isMultiStreamSendSupportEnabled()
            && localTracks?.length
            && !oldTrack
            && newTrack
            && !localTracks.find(t => t === newTrack);
        let transceiver;

        // If old track exists, replace the track on the corresponding sender.
        if (oldTrack && !oldTrack.isMuted()) {
            transceiver = this.pc.peerconnection.getTransceivers().find(t => t.sender.track === oldTrack.getTrack());

        // Find the first recvonly transceiver when more than one track of the same media type is being added to the pc.
        // As part of the track addition, a new m-line was added to the remote description with direction set to
        // recvonly.
        } else if (isNewLocalSource) {
            transceiver = this.pc.peerconnection.getTransceivers().find(
                t => t.receiver.track.kind === mediaType
                && t.direction === MediaDirection.RECVONLY

                // Re-use any existing recvonly transceiver (if available) for p2p case.
                && ((this.pc.isP2P && t.currentDirection === MediaDirection.RECVONLY)
                    || (t.currentDirection === MediaDirection.INACTIVE && !t.stopped)));

        // For mute/unmute operations, find the transceiver based on the track index in the source name if present,
        // otherwise it is assumed to be the first local track that was added to the peerconnection.
        } else {
            transceiver = this.pc.peerconnection.getTransceivers().find(t => t.receiver.track.kind === mediaType);
            const sourceName = newTrack?.getSourceName() ?? oldTrack?.getSourceName();

            if (sourceName) {
                const trackIndex = getSourceIndexFromSourceName(sourceName);

                if (this.pc.isP2P) {
                    transceiver = this.pc.peerconnection.getTransceivers()
                        .filter(t => t.receiver.track.kind === mediaType)[trackIndex];
                } else if (oldTrack) {
                    const transceiverMid = this.pc._localTrackTransceiverMids.get(oldTrack.rtcId);

                    transceiver = this.pc.peerconnection.getTransceivers().find(t => t.mid === transceiverMid);
                } else if (trackIndex) {
                    transceiver = this.pc.peerconnection.getTransceivers()
                            .filter(t => t.receiver.track.kind === mediaType
                                && t.direction !== MediaDirection.RECVONLY)[trackIndex];
                }
            }
        }
        if (!transceiver) {
            return Promise.reject(
                new Error(`Replace track failed - no transceiver for old: ${oldTrack}, new: ${newTrack}`));
        }
        logger.debug(`${this.pc} Replacing ${oldTrack} with ${newTrack}`);

        return transceiver.sender.replaceTrack(track)
            .then(() => Promise.resolve(transceiver));
    }

    /**
     * Set the simulcast stream encoding properties on the RTCRtpSender.
     *
     * @param {JitsiLocalTrack} localTrack - the current track in use for which the encodings are to be set.
     * @returns {Promise<void>} - resolved when done.
     */
    setEncodings(localTrack) {
        const mediaType = localTrack.getType();
        const transceiver = localTrack?.track && localTrack.getOriginalStream()
            ? this.pc.peerconnection.getTransceivers().find(t => t.sender?.track?.id === localTrack.getTrackId())
            : this.pc.peerconnection.getTransceivers().find(t => t.receiver?.track?.kind === mediaType);
        const parameters = transceiver?.sender?.getParameters();

        // Resolve if the encodings are not available yet. This happens immediately after the track is added to the
        // peerconnection on chrome in unified-plan. It is ok to ignore and not report the error here since the
        // action that triggers 'addTrack' (like unmute) will also configure the encodings and set bitrates after that.
        if (!parameters?.encodings?.length) {
            return Promise.resolve();
        }
        parameters.encodings = this._getStreamEncodings(localTrack);

        if (mediaType === MediaType.VIDEO) {
            return this.pc._updateVideoSenderParameters(() => transceiver.sender.setParameters(parameters));
        }

        return transceiver.sender.setParameters(parameters);
    }

    /**
     * Resumes or suspends media on the peerconnection by setting the active state on RTCRtpEncodingParameters
     * associated with all the senders that have a track attached to it.
     *
     * @param {boolean} enable - whether outgoing media needs to be enabled or disabled.
     * @param {string} mediaType - media type, 'audio' or 'video', if neither is passed, all outgoing media will either
     * be enabled or disabled.
     * @returns {Promise} - A promise that is resolved when the change is succesful on all the senders, rejected
     * otherwise.
     */
    setMediaTransferActive(enable, mediaType) {
        logger.info(`${this.pc} ${enable ? 'Resuming' : 'Suspending'} media transfer.`);

        const senders = this.pc.peerconnection.getSenders()
            .filter(s => Boolean(s.track) && (!mediaType || s.track.kind === mediaType));
        const promises = [];

        for (const sender of senders) {
            if (sender.track.kind === MediaType.VIDEO) {
                promises.push(this.pc._updateVideoSenderParameters(() => this._updateSenderEncodings(sender, enable)));
            } else {
                promises.push(this._updateSenderEncodings(sender, enable));
            }
        }

        return Promise.allSettled(promises)
            .then(settledResult => {
                const errors = settledResult
                    .filter(result => result.status === 'rejected')
                    .map(result => result.reason);

                if (errors.length) {
                    return Promise.reject(new Error('Failed to change encodings on the RTCRtpSenders'
                        + `${errors.join(' ')}`));
                }

                return Promise.resolve();
            });
    }

    /**
     * Ensures that the resolution of the stream encodings are consistent with the values
     * that were configured on the RTCRtpSender when the source was added to the peerconnection.
     * This should prevent us from overriding the default values if the browser returns
     * erroneous values when RTCRtpSender.getParameters is used for getting the encodings info.
     * @param {JitsiLocalTrack} localVideoTrack The local video track.
     * @param {Object} parameters - the RTCRtpEncodingParameters obtained from the browser.
     * @returns {void}
     */
    updateEncodingsResolution(localVideoTrack, parameters) {
        if (!(browser.isWebKitBased() && parameters.encodings && Array.isArray(parameters.encodings))) {
            return;
        }
        const allEqualEncodings
            = encodings => encodings.every(encoding => typeof encoding.scaleResolutionDownBy !== 'undefined'
                && encoding.scaleResolutionDownBy === encodings[0].scaleResolutionDownBy);

        // Implement the workaround only when all the encodings report the same resolution.
        if (allEqualEncodings(parameters.encodings)) {
            const videoStreamEncodings = this._getVideoStreamEncodings(
                localVideoTrack.getVideoType(),
                this.pc.getConfiguredVideoCodec());

            parameters.encodings.forEach((encoding, idx) => {
                encoding.scaleResolutionDownBy = videoStreamEncodings[idx].scaleResolutionDownBy;
            });
        }
    }
}
