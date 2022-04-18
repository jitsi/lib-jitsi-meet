import { getLogger } from '@jitsi/logger';
import transform from 'sdp-transform';

import { MediaDirection } from '../../service/RTC/MediaDirection';
import { MediaType } from '../../service/RTC/MediaType';
import { VideoType } from '../../service/RTC/VideoType';
import browser from '../browser';
import FeatureFlags from '../flags/FeatureFlags';

const logger = getLogger(__filename);
const DESKTOP_SHARE_RATE = 500000;
const LD_BITRATE = 200000;
const SD_BITRATE = 700000;
const SIM_LAYER_1_RID = '1';
const SIM_LAYER_2_RID = '2';
const SIM_LAYER_3_RID = '3';

export const HD_BITRATE = 2500000;
export const HD_SCALE_FACTOR = 1;
export const LD_SCALE_FACTOR = 4;
export const SD_SCALE_FACTOR = 2;
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
        const bitrateSettings = this.pc.options?.videoQuality?.maxBitratesVideo;
        const standardBitrates = {
            low: LD_BITRATE,
            standard: SD_BITRATE,
            high: HD_BITRATE
        };

        // Check if the max. bitrates for video are specified through config.js videoQuality settings.
        // Right now only VP8 bitrates are configured on the simulcast encodings, VP9 bitrates have to be
        // configured on the SDP using b:AS line.
        this.videoBitrates = bitrateSettings ?? standardBitrates;
        const encodingBitrates = this.videoBitrates.VP8 ?? this.videoBitrates;

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
         */
        this.localStreamEncodingsConfig = [
            {
                active: true,
                maxBitrate: browser.isFirefox() ? encodingBitrates.high : encodingBitrates.low,
                rid: SIM_LAYER_1_RID,
                scaleResolutionDownBy: browser.isFirefox() ? HD_SCALE_FACTOR : LD_SCALE_FACTOR
            },
            {
                active: true,
                maxBitrate: encodingBitrates.standard,
                rid: SIM_LAYER_2_RID,
                scaleResolutionDownBy: SD_SCALE_FACTOR
            },
            {
                active: true,
                maxBitrate: browser.isFirefox() ? encodingBitrates.low : encodingBitrates.high,
                rid: SIM_LAYER_3_RID,
                scaleResolutionDownBy: browser.isFirefox() ? LD_SCALE_FACTOR : HD_SCALE_FACTOR
            }
        ];
    }

    /**
     * Obtains stream encodings that need to be configured on the given track based
     * on the track media type and the simulcast setting.
     * @param {JitsiLocalTrack} localTrack
     */
    _getStreamEncodings(localTrack) {
        if (this.pc.isSimulcastOn() && localTrack.isVideoTrack()) {
            return this.localStreamEncodingsConfig;
        }

        return localTrack.isVideoTrack()
            ? [ {
                active: true,
                maxBitrate: this.videoBitrates.high
            } ]
            : [ { active: true } ];
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
     * Returns the transceiver associated with a given RTCRtpSender/RTCRtpReceiver.
     *
     * @param {string} mediaType - type of track associated with the transceiver 'audio' or 'video'.
     * @param {JitsiLocalTrack} localTrack - local track to be used for lookup.
     * @returns {RTCRtpTransceiver}
     */
    findTransceiver(mediaType, localTrack = null) {
        const transceiver = localTrack?.track && localTrack.getOriginalStream()
            ? this.pc.peerconnection.getTransceivers().find(t => t.sender?.track?.id === localTrack.getTrackId())
            : this.pc.peerconnection.getTransceivers().find(t => t.receiver?.track?.kind === mediaType);

        return transceiver;
    }

    /**
     * Takes in a *unified plan* offer and inserts the appropriate
     * parameters for adding simulcast receive support.
     * @param {Object} desc - A session description object
     * @param {String} desc.type - the type (offer/answer)
     * @param {String} desc.sdp - the sdp content
     *
     * @return {Object} A session description (same format as above) object
     * with its sdp field modified to advertise simulcast receive support
     */
    insertUnifiedPlanSimulcastReceive(desc) {
        // a=simulcast line is not needed on browsers where we SDP munging is used for enabling on simulcast.
        // Remove this check when the client switches to RID/MID based simulcast on all browsers.
        if (browser.usesSdpMungingForSimulcast()) {
            return desc;
        }
        const sdp = transform.parse(desc.sdp);
        const idx = sdp.media.findIndex(mline => mline.type === MediaType.VIDEO);

        if (sdp.media[idx].rids && (sdp.media[idx].simulcast_03 || sdp.media[idx].simulcast)) {
            // Make sure we don't have the simulcast recv line on video descriptions other than
            // the first video description.
            sdp.media.forEach((mline, i) => {
                if (mline.type === MediaType.VIDEO && i !== idx) {
                    sdp.media[i].rids = undefined;
                    sdp.media[i].simulcast = undefined;

                    // eslint-disable-next-line camelcase
                    sdp.media[i].simulcast_03 = undefined;
                }
            });

            return new RTCSessionDescription({
                type: desc.type,
                sdp: transform.write(sdp)
            });
        }

        // In order of highest to lowest spatial quality
        sdp.media[idx].rids = [
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

        // eslint-disable-next-line camelcase
        sdp.media[idx].simulcast_03 = {
            value: simulcastLine
        };

        return new RTCSessionDescription({
            type: desc.type,
            sdp: transform.write(sdp)
        });
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
     * Returns the calculated active state of the simulcast encodings based on the frame height requested for the send
     * stream. All the encodings that have a resolution lower than the frame height requested will be enabled.
     *
     * @param {JitsiLocalTrack} localVideoTrack The local video track.
     * @param {number} newHeight The resolution requested for the video track.
     * @returns {Array<boolean>}
     */
    calculateEncodingsActiveState(localVideoTrack, newHeight) {
        const localTrack = localVideoTrack.getTrack();
        const { height } = localTrack.getSettings();
        const encodingsState = this.localStreamEncodingsConfig
        .map(encoding => height / encoding.scaleResolutionDownBy)
        .map((frameHeight, idx) => {
            let active = localVideoTrack.getVideoType() === VideoType.CAMERA

                // Keep the LD stream enabled even when the LD stream's resolution is higher than of the requested
                // resolution. This can happen when camera is captured at resolutions higher than 720p but the
                // requested resolution is 180. Since getParameters doesn't give us information about the resolutions
                // of the simulcast encodings, we have to rely on our initial config for the simulcast streams.
                ? newHeight > 0 && this.localStreamEncodingsConfig[idx]?.scaleResolutionDownBy === LD_SCALE_FACTOR
                    ? true
                    : frameHeight <= newHeight

                // Keep all the encodings for desktop track active.
                : true;

            // Disable the lower spatial layers for screensharing in Unified plan when low fps screensharing is in
            // progress. Sending all three streams often results in the browser suspending the high resolution in low
            // b/w and cpu cases, especially on the low end machines. Suspending the low resolution streams ensures
            // that the highest resolution stream is available always. Safari is an exception here since it does not
            // send the desktop stream at all if only the high resolution stream is enabled.
            if (this.pc.isSharingLowFpsScreen()
                && localVideoTrack.getVideoType() === VideoType.DESKTOP
                && this.pc.usesUnifiedPlan()
                && !browser.isWebKitBased()
                && this.localStreamEncodingsConfig[idx].scaleResolutionDownBy !== HD_SCALE_FACTOR) {
                active = false;
            }

            return active;
        });

        return encodingsState;
    }

    /**
     * Returns the calculates max bitrates that need to be configured on the simulcast encodings based on the video
     * type and other considerations associated with screenshare.
     *
     * @param {JitsiLocalTrack} localVideoTrack The local video track.
     * @returns {Array<number>}
     */
    calculateEncodingsBitrates(localVideoTrack) {
        const videoType = localVideoTrack.getVideoType();
        const desktopShareBitrate = this.pc.options?.videoQuality?.desktopBitrate || DESKTOP_SHARE_RATE;
        const presenterEnabled = localVideoTrack._originalStream
            && localVideoTrack._originalStream.id !== localVideoTrack.getStreamId();

        const encodingsBitrates = this.localStreamEncodingsConfig
        .map(encoding => {
            const bitrate = this.pc.isSharingLowFpsScreen() && !browser.isWebKitBased()

                // For low fps screensharing, set a max bitrate of 500 Kbps when presenter is not turned on, 2500 Kbps
                // otherwise.
                ? presenterEnabled ? HD_BITRATE : desktopShareBitrate

                // For high fps screenshare, 'maxBitrate' setting must be cleared on Chrome in plan-b, because
                // if simulcast is enabled for screen and maxBitrates are set then Chrome will not send the
                // desktop stream.
                : videoType === VideoType.DESKTOP && browser.isChromiumBased() && !this.pc.usesUnifiedPlan()
                    ? undefined
                    : encoding.maxBitrate;

            return bitrate;
        });

        return encodingsBitrates;
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
        const isNewLocalSource = FeatureFlags.isMultiStreamSupportEnabled()
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
                && t.currentDirection === MediaDirection.INACTIVE);

        // For mute/unmute operations, find the transceiver based on the track index in the source name if present,
        // otherwise it is assumed to be the first local track that was added to the peerconnection.
        } else {
            transceiver = this.pc.peerconnection.getTransceivers().find(t => t.receiver.track.kind === mediaType);
            const sourceName = newTrack?.getSourceName() ?? oldTrack?.getSourceName();

            if (sourceName) {
                const trackIndex = Number(sourceName.split('-')[1].substring(1));

                if (trackIndex) {
                    transceiver = this.pc.peerconnection.getTransceivers()
                        .filter(t => t.receiver.track.kind === mediaType
                            && t.direction !== MediaDirection.RECVONLY)[trackIndex];
                }
            }
        }

        if (!transceiver) {
            return Promise.reject(new Error('replace track failed'));
        }
        logger.debug(`${this.pc} Replacing ${oldTrack} with ${newTrack}`);

        return transceiver.sender.replaceTrack(track)
            .then(() => Promise.resolve(transceiver));
    }

    /**
    * Enables/disables audio transmission on the peer connection. When
    * disabled the audio transceiver direction will be set to 'inactive'
    * which means that no data will be sent nor accepted, but
    * the connection should be kept alive.
    * @param {boolean} active - true to enable audio media transmission or
    * false to disable.
    * @returns {void}
    */
    setAudioTransferActive(active) {
        this.setMediaTransferActive(MediaType.AUDIO, active);
    }

    /**
     * Set the simulcast stream encoding properties on the RTCRtpSender.
     * @param {JitsiLocalTrack} track - the current track in use for which
     * the encodings are to be set.
     * @returns {Promise<void>} - resolved when done.
     */
    setEncodings(track) {
        const mediaType = track.getType();
        const transceiver = this.findTransceiver(mediaType, track);
        const parameters = transceiver?.sender?.getParameters();

        // Resolve if the encodings are not available yet. This happens immediately after the track is added to the
        // peerconnection on chrome in unified-plan. It is ok to ignore and not report the error here since the
        // action that triggers 'addTrack' (like unmute) will also configure the encodings and set bitrates after that.
        if (!parameters?.encodings?.length) {
            return Promise.resolve();
        }
        parameters.encodings = this._getStreamEncodings(track);

        return transceiver.sender.setParameters(parameters);
    }

    /**
     * Enables/disables media transmission on the peerconnection by changing the direction
     * on the transceiver for the specified media type.
     * @param {String} mediaType - 'audio' or 'video'
     * @param {boolean} active - true to enable media transmission or false
     * to disable.
     * @returns {void}
     */
    setMediaTransferActive(mediaType, active) {
        const transceivers = this.pc.peerconnection.getTransceivers()
            .filter(t => t.receiver && t.receiver.track && t.receiver.track.kind === mediaType);
        const localTracks = this.pc.getLocalTracks(mediaType);

        logger.info(`${this.pc} ${active ? 'Enabling' : 'Suspending'} ${mediaType} media transfer.`);
        transceivers.forEach((transceiver, idx) => {
            if (active) {
                // The first transceiver is for the local track and only this one can be set to 'sendrecv'.
                // When multi-stream is enabled, there can be multiple transceivers with outbound streams.
                if (idx < localTracks.length) {
                    transceiver.direction = MediaDirection.SENDRECV;
                } else {
                    transceiver.direction = MediaDirection.RECVONLY;
                }
            } else {
                transceiver.direction = MediaDirection.INACTIVE;
            }
        });
    }

    /**
    * Enables/disables video media transmission on the peer connection. When
    * disabled the SDP video media direction in the local SDP will be adjusted to
    * 'inactive' which means that no data will be sent nor accepted, but
    * the connection should be kept alive.
    * @param {boolean} active - true to enable video media transmission or
    * false to disable.
    * @returns {void}
    */
    setVideoTransferActive(active) {
        this.setMediaTransferActive(MediaType.VIDEO, active);
    }

    /**
     * Ensures that the resolution of the stream encodings are consistent with the values
     * that were configured on the RTCRtpSender when the source was added to the peerconnection.
     * This should prevent us from overriding the default values if the browser returns
     * erroneous values when RTCRtpSender.getParameters is used for getting the encodings info.
     * @param {Object} parameters - the RTCRtpEncodingParameters obtained from the browser.
     * @returns {void}
     */
    updateEncodingsResolution(parameters) {
        if (!(browser.isWebKitBased() && parameters.encodings && Array.isArray(parameters.encodings))) {
            return;
        }
        const allEqualEncodings
            = encodings => encodings.every(encoding => typeof encoding.scaleResolutionDownBy !== 'undefined'
                && encoding.scaleResolutionDownBy === encodings[0].scaleResolutionDownBy);

        // Implement the workaround only when all the encodings report the same resolution.
        if (allEqualEncodings(parameters.encodings)) {
            parameters.encodings.forEach((encoding, idx) => {
                encoding.scaleResolutionDownBy = this.localStreamEncodingsConfig[idx].scaleResolutionDownBy;
            });
        }
    }
}
