import { getLogger } from '@jitsi/logger';
import clonedeep from 'lodash.clonedeep';
import transform from 'sdp-transform';

import { CodecMimeType } from '../../service/RTC/CodecMimeType';
import { MediaDirection } from '../../service/RTC/MediaDirection';
import { MediaType } from '../../service/RTC/MediaType';
import { getSourceIndexFromSourceName } from '../../service/RTC/SignalingLayer';
import {
    SIM_LAYERS,
    STANDARD_CODEC_SETTINGS,
    VIDEO_QUALITY_LEVELS,
    VIDEO_QUALITY_SETTINGS
} from '../../service/RTC/StandardVideoSettings';
import { VideoEncoderScalabilityMode } from '../../service/RTC/VideoEncoderScalabilityMode';
import { VideoType } from '../../service/RTC/VideoType';
import browser from '../browser';

const logger = getLogger(__filename);
const VIDEO_CODECS = [ CodecMimeType.AV1, CodecMimeType.H264, CodecMimeType.VP8, CodecMimeType.VP9 ];

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
     */
    _calculateActiveEncodingParams(localVideoTrack, codec, newHeight) {
        const codecBitrates = this.codecSettings[codec].maxBitratesVideo;
        const trackCaptureHeight = localVideoTrack.getCaptureResolution();
        const effectiveNewHeight = newHeight > trackCaptureHeight ? trackCaptureHeight : newHeight;
        const desktopShareBitrate = this.pc.options?.videoQuality?.desktopbitrate || codecBitrates.ssHigh;
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
     * Configures the RTCRtpEncodingParameters of the outbound rtp stream associated with the given track.
     *
     * @param {JitsiLocalTracj} localTrack - The local track whose outbound stream needs to be configured.
     * @returns {Promise} - A promise that resolves when the operation is successful, rejected otherwise.
     */
    _configureSenderEncodings(localTrack) {
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

        return transceiver.sender.setParameters(parameters);
    }

    /**
     * Enables/disables the streams by changing the active field on RTCRtpEncodingParameters for a given RTCRtpSender.
     *
     * @param {RTCRtpSender} sender - the sender associated with a MediaStreamTrack.
     * @param {boolean} enable - whether the streams needs to be enabled or disabled.
     * @returns {Promise} - A promise that resolves when the operation is successful, rejected otherwise.
     */
    _enableSenderEncodings(sender, enable) {
        const parameters = sender.getParameters();

        if (parameters?.encodings?.length) {
            for (const encoding of parameters.encodings) {
                encoding.active = enable;
            }
        }

        return sender.setParameters(parameters);
    }

    /**
     * Obtains stream encodings that need to be configured on the given track based
     * on the track media type and the simulcast setting.
     * @param {JitsiLocalTrack} localTrack
     */
    _getStreamEncodings(localTrack) {
        if (localTrack.isAudioTrack()) {
            return [ { active: this.pc.audioTransferActive } ];
        }
        const codec = this.pc.getConfiguredVideoCodec();

        if (this.pc.isSpatialScalabilityOn()) {
            return this._getVideoStreamEncodings(localTrack, codec);
        }

        return [ {
            active: this.pc.videoTransferActive,
            maxBitrate: this.codecSettings[codec].maxBitratesVideo.high
        } ];
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
     * @param {JitsiLocalTrack} localTrack
     * @param {String} codec
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
        const desktopShareBitrate = this.pc.options?.videoQuality?.desktopbitrate || codecBitrates.ssHigh;
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
        const isNewLocalSource = localTracks?.length
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
        if (localTrack.getType() === MediaType.VIDEO) {
            return this.pc._updateVideoSenderParameters(() => this._configureSenderEncodings(localTrack));
        }

        return this._configureSenderEncodings(localTrack);
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
                promises.push(this.pc._updateVideoSenderParameters(() => this._enableSenderEncodings(sender, enable)));
            } else {
                promises.push(this._enableSenderEncodings(sender, enable));
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
}
