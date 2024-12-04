import { getLogger } from '@jitsi/logger';
import { cloneDeep } from 'lodash-es';
import transform from 'sdp-transform';

import { CodecMimeType } from '../../service/RTC/CodecMimeType';
import { MediaDirection } from '../../service/RTC/MediaDirection';
import { MediaType } from '../../service/RTC/MediaType';
import {
    SIM_LAYERS,
    SSRC_GROUP_SEMANTICS,
    STANDARD_CODEC_SETTINGS,
    VIDEO_QUALITY_LEVELS,
    VIDEO_QUALITY_SETTINGS
} from '../../service/RTC/StandardVideoQualitySettings';
import { VideoEncoderScalabilityMode } from '../../service/RTC/VideoEncoderScalabilityMode';
import { VideoType } from '../../service/RTC/VideoType';
import browser from '../browser';
import SDPUtil from '../sdp/SDPUtil';

const logger = getLogger(__filename);
const DD_HEADER_EXT_URI
    = 'https://aomediacodec.github.io/av1-rtp-spec/#dependency-descriptor-rtp-header-extension';
const DD_HEADER_EXT_ID = 11;
const VIDEO_CODECS = [ CodecMimeType.AV1, CodecMimeType.H264, CodecMimeType.VP8, CodecMimeType.VP9 ];

/**
 * Handles all the utility functions for the TraceablePeerConnection class, like calculating the encoding parameters,
 * determining the media direction, calculating bitrates based on the current codec settings, etc.
 */
export class TPCUtils {
    /**
     * Creates a new instance for a given TraceablePeerConnection
     *
     * @param peerconnection - the tpc instance for which we have utility functions.
     * @param options - additional options that can be passed to the utility functions.
     * @param options.audioQuality - the audio quality settings that are used to calculate the audio codec parameters.
     * @param options.isP2P - whether the connection is a P2P connection.
     * @param options.videoQuality - the video quality settings that are used to calculate the encoding parameters.
     */
    constructor(peerconnection, options = {}) {
        this.pc = peerconnection;
        this.options = options;
        this.codecSettings = cloneDeep(STANDARD_CODEC_SETTINGS);

        /**
         * Flag indicating bridge support for AV1 codec. On the bridge connection, it is supported only when support for
         * Dependency Descriptor header extensions is offered by Jicofo. H.264 simulcast is also possible when these
         * header extensions are negotiated.
         */
        this.supportsDDHeaderExt = false;

        /**
         * Reads videoQuality settings from config.js and overrides the code defaults for video codecs.
         */
        const videoQualitySettings = this.options.videoQuality;

        if (videoQualitySettings) {
            for (const codec of VIDEO_CODECS) {
                const codecConfig = videoQualitySettings[codec];
                const bitrateSettings = codecConfig?.maxBitratesVideo

                    // Read the deprecated settings for max bitrates.
                    ?? (videoQualitySettings.maxbitratesvideo
                        && videoQualitySettings.maxbitratesvideo[codec.toUpperCase()]);

                if (bitrateSettings) {
                    const settings = Object.values(VIDEO_QUALITY_SETTINGS);

                    [ ...settings, 'ssHigh' ].forEach(value => {
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
     * @private
     */
    _calculateActiveEncodingParams(localVideoTrack, codec, newHeight) {
        const codecBitrates = this.codecSettings[codec].maxBitratesVideo;
        const trackCaptureHeight = localVideoTrack.getCaptureResolution();
        const effectiveNewHeight = newHeight > trackCaptureHeight ? trackCaptureHeight : newHeight;
        const desktopShareBitrate = this.options.videoQuality?.desktopbitrate || codecBitrates.ssHigh;
        const isScreenshare = localVideoTrack.getVideoType() === VideoType.DESKTOP;
        let scalabilityMode = this.codecSettings[codec].useKSVC
            ? VideoEncoderScalabilityMode.L3T3_KEY : VideoEncoderScalabilityMode.L3T3;
        const { height, level } = VIDEO_QUALITY_LEVELS.find(lvl => lvl.height <= effectiveNewHeight);
        let maxBitrate;
        let scaleResolutionDownBy = SIM_LAYERS[2].scaleFactor;

        if (this._isScreenshareBitrateCapped(localVideoTrack)) {
            scalabilityMode = VideoEncoderScalabilityMode.L1T3;
            maxBitrate = desktopShareBitrate;
        } else if (isScreenshare) {
            maxBitrate = codecBitrates.ssHigh;
        } else {
            maxBitrate = codecBitrates[level];
            effectiveNewHeight && (scaleResolutionDownBy = trackCaptureHeight / effectiveNewHeight);

            if (height !== effectiveNewHeight) {
                logger.debug(`Quality level with height=${height} was picked when requested height=${newHeight} for`
                    + `track with capture height=${trackCaptureHeight}`);
            }
        }

        const config = {
            active: effectiveNewHeight > 0,
            maxBitrate,
            scalabilityMode,
            scaleResolutionDownBy
        };

        if (!config.active || isScreenshare) {
            return config;
        }

        // Configure the sender to send all 3 spatial layers for resolutions 720p and higher.
        switch (level) {
        case VIDEO_QUALITY_SETTINGS.ULTRA:
        case VIDEO_QUALITY_SETTINGS.FULL:
        case VIDEO_QUALITY_SETTINGS.HIGH:
            config.scalabilityMode = this.codecSettings[codec].useKSVC
                ? VideoEncoderScalabilityMode.L3T3_KEY : VideoEncoderScalabilityMode.L3T3;
            break;
        case VIDEO_QUALITY_SETTINGS.STANDARD:
            config.scalabilityMode = this.codecSettings[codec].useKSVC
                ? VideoEncoderScalabilityMode.L2T3_KEY : VideoEncoderScalabilityMode.L2T3;
            break;
        default:
            config.scalabilityMode = VideoEncoderScalabilityMode.L1T3;
        }

        return config;
    }

    /**
     * Returns the codecs in the current order of preference in the SDP provided.
     *
     * @param {transform.SessionDescription} parsedSdp the parsed SDP object.
     * @returns {Array<CodecMimeType>}
     * @private
     */
    _getConfiguredVideoCodecsImpl(parsedSdp) {
        const mLine = parsedSdp.media.find(m => m.type === MediaType.VIDEO);
        const codecs = new Set(mLine.rtp
            .filter(pt => pt.codec.toLowerCase() !== 'rtx')
            .map(pt => pt.codec.toLowerCase()));

        return Array.from(codecs);
    }

    /**
     * The startup configuration for the stream encodings that are applicable to the video stream when a new sender is
     * created on the peerconnection. The initial config takes into account the differences in browser's simulcast
     * implementation.
     *
     * Encoding parameters:
     * active - determine the on/off state of a particular encoding.
     * maxBitrate - max. bitrate value to be applied to that particular encoding based on the encoding's resolution and
     *  config.js videoQuality settings if applicable.
     * rid - Rtp Stream ID that is configured for a particular simulcast stream.
     * scaleResolutionDownBy - the factor by which the encoding is scaled down from the original resolution of the
     *  captured video.
     *
     * @param {JitsiLocalTrack} localTrack - The local video track.
     * @param {String} codec - The codec currently in use.
     * @returns {Array<Object>} - The initial configuration for the stream encodings.
     * @private
     */
    _getVideoStreamEncodings(localTrack, codec) {
        const captureResolution = localTrack.getCaptureResolution();
        const codecBitrates = this.codecSettings[codec].maxBitratesVideo;
        const videoType = localTrack.getVideoType();
        let effectiveScaleFactors = SIM_LAYERS.map(sim => sim.scaleFactor);
        let cameraMaxbitrate;

        if (videoType === VideoType.CAMERA) {
            const { level } = VIDEO_QUALITY_LEVELS.find(lvl => lvl.height <= captureResolution);

            cameraMaxbitrate = codecBitrates[level];
            if (level === VIDEO_QUALITY_SETTINGS.ULTRA) {
                effectiveScaleFactors[1] = 6.0; // 360p
                effectiveScaleFactors[0] = 12.0; // 180p
            } else if (level === VIDEO_QUALITY_SETTINGS.FULL) {
                effectiveScaleFactors[1] = 3.0; // 360p
                effectiveScaleFactors[0] = 6.0; // 180p
            }
        }
        const maxBitrate = videoType === VideoType.DESKTOP
            ? codecBitrates.ssHigh : cameraMaxbitrate;
        let effectiveBitrates = [ codecBitrates.low, codecBitrates.standard, maxBitrate ];

        // The SSRCs on older versions of Firefox are reversed in SDP, i.e., they have resolution order of 1:2:4 as
        // opposed to Chromium and other browsers. This has been reverted in Firefox 117 as part of the below commit.
        // https://hg.mozilla.org/mozilla-central/rev/b0348f1f8d7197fb87158ba74542d28d46133997
        // This revert seems to be applied only to camera tracks, the desktop stream encodings still have the
        // resolution order of 4:2:1.
        if (browser.isFirefox() && (videoType === VideoType.DESKTOP || browser.isVersionLessThan(117))) {
            effectiveBitrates = effectiveBitrates.reverse();
            effectiveScaleFactors = effectiveScaleFactors.reverse();
        }

        const standardSimulcastEncodings = [
            {
                active: this.pc.videoTransferActive,
                maxBitrate: effectiveBitrates[0],
                rid: SIM_LAYERS[0].rid,
                scaleResolutionDownBy: effectiveScaleFactors[0]
            },
            {
                active: this.pc.videoTransferActive,
                maxBitrate: effectiveBitrates[1],
                rid: SIM_LAYERS[1].rid,
                scaleResolutionDownBy: effectiveScaleFactors[1]
            },
            {
                active: this.pc.videoTransferActive,
                maxBitrate: effectiveBitrates[2],
                rid: SIM_LAYERS[2].rid,
                scaleResolutionDownBy: effectiveScaleFactors[2]
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
                    maxBitrate: effectiveBitrates[2],
                    rid: SIM_LAYERS[0].rid,
                    scaleResolutionDownBy: effectiveScaleFactors[2],
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
     * @param {CodecMimeType} codec - The video codec in use.
     * @returns boolean - true if the video encoder is running in full SVC mode, false otherwise.
     * @private
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
     * @returns {boolean} - true if the bitrate needs to be capped for the screenshare track, false otherwise.
     * @private
     */
    _isScreenshareBitrateCapped(localVideoTrack) {
        return localVideoTrack.getVideoType() === VideoType.DESKTOP
            && this.pc._capScreenshareBitrate
            && !browser.isWebKitBased();
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
        const height = localVideoTrack.getCaptureResolution();
        const videoStreamEncodings = this._getVideoStreamEncodings(localVideoTrack, codec);
        const encodingsState = videoStreamEncodings
        .map(encoding => height / encoding.scaleResolutionDownBy)
        .map((frameHeight, idx) => {
            let activeState = false;

            // When video is suspended on the media session.
            if (!this.pc.videoTransferActive) {
                return activeState;
            }

            // Single video stream.
            if (!this.pc.isSpatialScalabilityOn() || this._isRunningInFullSvcMode(codec)) {
                const { active } = this._calculateActiveEncodingParams(localVideoTrack, codec, newHeight);

                return idx === 0 ? active : activeState;
            }

            if (newHeight > 0) {
                if (localVideoTrack.getVideoType() === VideoType.CAMERA) {
                    activeState = frameHeight <= newHeight

                        // Keep the LD stream enabled even when the LD stream's resolution is higher than of the
                        // requested resolution. This can happen when camera is captured at high resolutions like 4k
                        // but the requested resolution is 180. Since getParameters doesn't give us information about
                        // the resolutions of the simulcast encodings, we have to rely on our initial config for the
                        // simulcast streams.
                        || videoStreamEncodings[idx]?.scaleResolutionDownBy === SIM_LAYERS[0].scaleFactor;
                } else {
                    // For screenshare, keep the HD layer enabled always and the lower layers only for high fps
                    // screensharing.
                    activeState = videoStreamEncodings[idx].scaleResolutionDownBy === SIM_LAYERS[2].scaleFactor
                        || !this._isScreenshareBitrateCapped(localVideoTrack);
                }
            }

            return activeState;
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
        const codecBitrates = this.codecSettings[codec].maxBitratesVideo;
        const desktopShareBitrate = this.options.videoQuality?.desktopbitrate || codecBitrates.ssHigh;
        const encodingsBitrates = this._getVideoStreamEncodings(localVideoTrack, codec)
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
            return this._getVideoStreamEncodings(localVideoTrack, codec)
                .map(encoding => encoding.scaleResolutionDownBy);
        }

        // Single video stream.
        const { scaleResolutionDownBy }
            = this._calculateActiveEncodingParams(localVideoTrack, codec, maxHeight);

        return [ scaleResolutionDownBy, undefined, undefined ];
    }

    /**
     * Ensures that the ssrcs associated with a FID ssrc-group appear in the correct order, i.e., the primary ssrc
     * first and the secondary rtx ssrc later. This is important for unified plan since we have only one FID group per
     * media description.
     * @param {Object} description the webRTC session description instance for the remote description.
     * @returns {Object} the modified webRTC session description instance.
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

        return {
            type: description.type,
            sdp: transform.write(parsedSdp)
        };
    }

    /**
     * Returns the codec that is configured on the client as the preferred video codec for the given local video track.
     *
     * @param {JitsiLocalTrack} localTrack - The local video track.
     * @returns {CodecMimeType} The codec that is set as the preferred codec for the given local video track.
     */
    getConfiguredVideoCodec(localTrack) {
        const localVideoTrack = localTrack ?? this.pc.getLocalVideoTracks()[0];
        const rtpSender = this.pc.findSenderForTrack(localVideoTrack.getTrack());

        if (this.pc.usesCodecSelectionAPI() && rtpSender) {
            const { codecs } = rtpSender.getParameters();

            if (codecs?.length) {
                return codecs[0].mimeType.split('/')[1].toLowerCase();
            }
        }

        const sdp = this.pc.remoteDescription?.sdp;

        if (!sdp) {
            return CodecMimeType.VP8;
        }
        const parsedSdp = transform.parse(sdp);
        const mLine = parsedSdp.media
            .find(m => m.mid.toString() === this.pc.localTrackTransceiverMids.get(localVideoTrack.rtcId));
        const payload = mLine.payloads.split(' ')[0];
        const { codec } = mLine.rtp.find(rtp => rtp.payload === Number(payload));

        if (codec) {
            return Object.values(CodecMimeType).find(value => value === codec.toLowerCase());
        }

        return CodecMimeType.VP8;
    }

    /**
     * Returns the codecs in the current order of preference as configured on the peerconnection.
     *
     * @param {string} - The local SDP to be used.
     * @returns {Array}
     */
    getConfiguredVideoCodecs(sdp) {
        const currentSdp = sdp ?? this.pc.localDescription?.sdp;

        if (!currentSdp) {
            return [];
        }
        const parsedSdp = transform.parse(currentSdp);

        return this._getConfiguredVideoCodecsImpl(parsedSdp);
    }

    /**
     * Returns the desired media direction for the given media type based on the current state of the peerconnection.
     *
     * @param {MediaType} mediaType - The media type for which the desired media direction is to be obtained.
     * @param {boolean} isAddOperation - Whether the direction is being set for a source add operation.
     * @returns {MediaDirection} - The desired media direction for the given media type.
     */
    getDesiredMediaDirection(mediaType, isAddOperation = false) {
        const hasLocalSource = this.pc.getLocalTracks(mediaType).length > 0;

        if (isAddOperation) {
            return hasLocalSource ? MediaDirection.SENDRECV : MediaDirection.SENDONLY;
        }

        return hasLocalSource ? MediaDirection.RECVONLY : MediaDirection.INACTIVE;
    }

    /**
     * Obtains stream encodings that need to be configured on the given track based
     * on the track media type and the simulcast setting.
     * @param {JitsiLocalTrack} localTrack
     */
    getStreamEncodings(localTrack) {
        if (localTrack.isAudioTrack()) {
            return [ { active: this.pc.audioTransferActive } ];
        }
        const codec = this.getConfiguredVideoCodec(localTrack);

        if (this.pc.isSpatialScalabilityOn()) {
            return this._getVideoStreamEncodings(localTrack, codec);
        }

        return [ {
            active: this.pc.videoTransferActive,
            maxBitrate: this.codecSettings[codec].maxBitratesVideo.high
        } ];
    }

    /**
     * Injects a 'SIM' ssrc-group line for simulcast into the given session description object to make Jicofo happy.
     * This is needed only for Firefox since it does not generate it when simulcast is enabled but we run the check
     * on all browsers just in case as it would break the functionality otherwise.
     *
     * @param desc A session description object (with 'type' and 'sdp' fields)
     * @return A session description object with its sdp field modified to contain an inject ssrc-group for simulcast.
     */
    injectSsrcGroupForSimulcast(desc) {
        const sdp = transform.parse(desc.sdp);
        const video = sdp.media.find(mline => mline.type === 'video');

        // Check if the browser supports RTX, add only the primary ssrcs to the SIM group if that is the case.
        video.ssrcGroups = video.ssrcGroups || [];
        const fidGroups = video.ssrcGroups.filter(group => group.semantics === SSRC_GROUP_SEMANTICS.FID);

        if (video.simulcast || video.simulcast_03) {
            const ssrcs = [];

            if (fidGroups && fidGroups.length) {
                fidGroups.forEach(group => {
                    ssrcs.push(group.ssrcs.split(' ')[0]);
                });
            } else {
                video.ssrcs.forEach(ssrc => {
                    if (ssrc.attribute === 'msid') {
                        ssrcs.push(ssrc.id);
                    }
                });
            }
            if (video.ssrcGroups.find(group => group.semantics === SSRC_GROUP_SEMANTICS.SIM)) {
                // Group already exists, no need to do anything
                return desc;
            }

            // Add a SIM group for every 3 FID groups.
            for (let i = 0; i < ssrcs.length; i += 3) {
                const simSsrcs = ssrcs.slice(i, i + 3);

                video.ssrcGroups.push({
                    semantics: SSRC_GROUP_SEMANTICS.SIM,
                    ssrcs: simSsrcs.join(' ')
                });
            }
        }

        return {
            type: desc.type,
            sdp: transform.write(sdp)
        };
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
                id: SIM_LAYERS[0].rid,
                direction: 'recv'
            },
            {
                id: SIM_LAYERS[1].rid,
                direction: 'recv'
            },
            {
                id: SIM_LAYERS[2].rid,
                direction: 'recv'
            }
        ];

        const ridLine = rids.map(val => val.id).join(';');
        const simulcastLine = `recv ${ridLine}`;
        const sdp = transform.parse(desc.sdp);
        const mLines = sdp.media.filter(m => m.type === MediaType.VIDEO);
        const senderMids = Array.from(this.pc.localTrackTransceiverMids.values());

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

        return {
            type: desc.type,
            sdp: transform.write(sdp)
        };
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
     * Munges the session description to ensure that the codec order is as per the preferred codec settings.
     *
     * @param {transform.SessionDescription} parsedSdp that needs to be munged
     * @returns {transform.SessionDescription} the munged SDP.
     */
    mungeCodecOrder(parsedSdp) {
        const codecSettings = this.pc.codecSettings;

        if (!codecSettings) {
            return parsedSdp;
        }

        const mungedSdp = parsedSdp;
        const { isP2P } = this.options;
        const mLines = mungedSdp.media.filter(m => m.type === codecSettings.mediaType);

        for (const mLine of mLines) {
            const currentCodecs = this._getConfiguredVideoCodecsImpl(mungedSdp);

            for (const codec of currentCodecs) {
                if (isP2P) {
                    // 1. Strip the high profile H264 codecs on all clients. macOS started offering encoder for H.264
                    //   level 5.2 but a decoder only for level 3.1. Therfore, strip all main and high level codecs for
                    //   H.264.
                    // 2. There are multiple VP9 payload types generated by the browser, more payload types are added
                    //   if the endpoint doesn't have a local video source. Therefore, strip all the high profile codec
                    //   variants for VP9 so that only one payload type for VP9 is negotiated between the peers.
                    if (codec === CodecMimeType.H264 || codec === CodecMimeType.VP9) {
                        SDPUtil.stripCodec(mLine, codec, true /* high profile */);
                    }

                    // Do not negotiate ULPFEC and RED either.
                    if (codec === CodecMimeType.ULPFEC || codec === CodecMimeType.RED) {
                        SDPUtil.stripCodec(mLine, codec, false);
                    }
                }
            }

            // Reorder the codecs based on the preferred settings.
            if (!this.pc.usesCodecSelectionAPI()) {
                for (const codec of codecSettings.codecList.slice().reverse()) {
                    SDPUtil.preferCodec(mLine, codec, isP2P);
                }
            }
        }

        return mungedSdp;
    }

    /**
     * Munges the stereo flag as well as the opusMaxAverageBitrate in the SDP, based on values set through config.js,
     * if present.
     *
     * @param {transform.SessionDescription} parsedSdp that needs to be munged.
     * @returns {transform.SessionDescription} the munged SDP.
     */
    mungeOpus(parsedSdp) {
        const { audioQuality } = this.options;

        if (!audioQuality?.enableOpusDtx && !audioQuality?.stereo && !audioQuality?.opusMaxAverageBitrate) {
            return parsedSdp;
        }

        const mungedSdp = parsedSdp;
        const mLines = mungedSdp.media.filter(m => m.type === MediaType.AUDIO);

        for (const mLine of mLines) {
            const { payload } = mLine.rtp.find(protocol => protocol.codec === CodecMimeType.OPUS);

            if (!payload) {
                // eslint-disable-next-line no-continue
                continue;
            }

            let fmtpOpus = mLine.fmtp.find(protocol => protocol.payload === payload);

            if (!fmtpOpus) {
                fmtpOpus = {
                    payload,
                    config: ''
                };
            }

            const fmtpConfig = transform.parseParams(fmtpOpus.config);
            let sdpChanged = false;

            if (audioQuality?.stereo) {
                fmtpConfig.stereo = 1;
                sdpChanged = true;
            }

            if (audioQuality?.opusMaxAverageBitrate) {
                fmtpConfig.maxaveragebitrate = audioQuality.opusMaxAverageBitrate;
                sdpChanged = true;
            }

            // On Firefox, the OpusDtx enablement has no effect
            if (!browser.isFirefox() && audioQuality?.enableOpusDtx) {
                fmtpConfig.usedtx = 1;
                sdpChanged = true;
            }

            if (!sdpChanged) {
                // eslint-disable-next-line no-continue
                continue;
            }

            let mungedConfig = '';

            for (const key of Object.keys(fmtpConfig)) {
                mungedConfig += `${key}=${fmtpConfig[key]}; `;
            }

            fmtpOpus.config = mungedConfig.trim();
        }

        return mungedSdp;
    }

    /**
     * Munges the session SDP by setting the max bitrates on the video m-lines when VP9 K-SVC codec is in use.
     *
     * @param {transform.SessionDescription} parsedSdp that needs to be munged.
     * @param {boolean} isLocalSdp - Whether the max bitrate (via b=AS line in SDP) is set on local SDP.
     * @returns {transform.SessionDescription} The munged SDP.
     */
    setMaxBitrates(parsedSdp, isLocalSdp = false) {
        const pcCodecSettings = this.pc.codecSettings;

        if (!pcCodecSettings) {
            return parsedSdp;
        }

        // Find all the m-lines associated with the local sources.
        const mungedSdp = parsedSdp;
        const direction = isLocalSdp ? MediaDirection.RECVONLY : MediaDirection.SENDONLY;
        const mLines = mungedSdp.media.filter(m => m.type === MediaType.VIDEO && m.direction !== direction);
        const currentCodec = pcCodecSettings.codecList[0];
        const codecScalabilityModeSettings = this.codecSettings[currentCodec];

        for (const mLine of mLines) {
            const isDoingVp9KSvc = currentCodec === CodecMimeType.VP9
                && !codecScalabilityModeSettings.scalabilityModeEnabled;
            const localTrack = this.pc.getLocalVideoTracks()
                .find(track => this.pc.localTrackTransceiverMids.get(track.rtcId) === mLine.mid.toString());

            if (localTrack
                && (isDoingVp9KSvc

                    // Setting bitrates in the SDP for SVC codecs is no longer needed in the newer versions where
                    // maxBitrates from the RTCRtpEncodingParameters directly affect the target bitrate for the encoder.
                    || (this._isRunningInFullSvcMode(currentCodec) && !this.pc.usesCodecSelectionAPI()))) {
                let maxBitrate;

                if (localTrack.getVideoType() === VideoType.DESKTOP) {
                    maxBitrate = codecScalabilityModeSettings.maxBitratesVideo.ssHigh;
                } else {
                    const { level } = VIDEO_QUALITY_LEVELS.find(lvl => lvl.height <= localTrack.getCaptureResolution());

                    maxBitrate = codecScalabilityModeSettings.maxBitratesVideo[level];
                }

                const limit = Math.floor(maxBitrate / 1000);

                // Use only the highest spatial layer bitrates for now as there is no API available yet for configuring
                // the bitrates on the individual SVC layers.
                mLine.bandwidth = [ {
                    type: 'AS',
                    limit
                } ];
            } else {
                // Clear the bandwidth limit in SDP when VP9 is no longer the preferred codec.
                // This is needed on react native clients as react-native-webrtc returns the
                // SDP that the application passed instead of returning the SDP off the native side.
                // This line automatically gets cleared on web on every renegotiation.
                mLine.bandwidth = undefined;
            }
        }

        return mungedSdp;
    }

    /**
     * Checks if the AV1 Dependency descriptors are negotiated on the bridge peerconnection and removes them from the
     * SDP when codec selected is VP8 or VP9.
     *
     * @param {transform.SessionDescription} parsedSdp that needs to be munged.
     * @returns {string} the munged SDP.
     */
    updateAv1DdHeaders(parsedSdp) {
        if (!browser.supportsDDExtHeaders()) {
            return parsedSdp;
        }
        const mungedSdp = parsedSdp;
        const mLines = mungedSdp.media.filter(m => m.type === MediaType.VIDEO);

        mLines.forEach((mLine, idx) => {
            const senderMids = Array.from(this.pc.localTrackTransceiverMids.values());
            const isSender = senderMids.length
                ? senderMids.find(mid => mLine.mid.toString() === mid.toString())
                : idx === 0;
            const payload = mLine.payloads.split(' ')[0];
            let { codec } = mLine.rtp.find(rtp => rtp.payload === Number(payload));

            codec = codec.toLowerCase();

            if (isSender && mLine.ext?.length) {
                const headerIndex = mLine.ext.findIndex(ext => ext.uri === DD_HEADER_EXT_URI);
                const shouldNegotiateHeaderExts = codec === CodecMimeType.AV1 || codec === CodecMimeType.H264;

                if (!this.supportsDDHeaderExt && headerIndex >= 0) {
                    this.supportsDDHeaderExt = true;
                }

                if (this.supportsDDHeaderExt && shouldNegotiateHeaderExts && headerIndex < 0) {
                    mLine.ext.push({
                        value: DD_HEADER_EXT_ID,
                        uri: DD_HEADER_EXT_URI
                    });
                } else if (!shouldNegotiateHeaderExts && headerIndex >= 0) {
                    mLine.ext.splice(headerIndex, 1);
                }
            }
        });

        return mungedSdp;
    }
}
