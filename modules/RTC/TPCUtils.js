import { getLogger } from 'jitsi-meet-logger';
import transform from 'sdp-transform';

import * as MediaType from '../../service/RTC/MediaType';
import RTCEvents from '../../service/RTC/RTCEvents';
import browser from '../browser';

const logger = getLogger(__filename);
const SIM_LAYER_1_RID = '1';
const SIM_LAYER_2_RID = '2';
const SIM_LAYER_3_RID = '3';

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
     * @param videoBitrates - the bitrates to be configured on the video senders for
     * different resolutions both in unicast and simulcast mode.
     */
    constructor(peerconnection, videoBitrates) {
        this.pc = peerconnection;
        this.videoBitrates = videoBitrates.VP8 || videoBitrates;

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
                maxBitrate: browser.isFirefox() ? this.videoBitrates.high : this.videoBitrates.low,
                rid: SIM_LAYER_1_RID,
                scaleResolutionDownBy: browser.isFirefox() ? 1.0 : 4.0
            },
            {
                active: true,
                maxBitrate: this.videoBitrates.standard,
                rid: SIM_LAYER_2_RID,
                scaleResolutionDownBy: 2.0
            },
            {
                active: true,
                maxBitrate: browser.isFirefox() ? this.videoBitrates.low : this.videoBitrates.high,
                rid: SIM_LAYER_3_RID,
                scaleResolutionDownBy: browser.isFirefox() ? 4.0 : 1.0
            }
        ];
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
            if (mLine.type === 'audio') {
                return;
            }
            if (!mLine.ssrcGroups || !mLine.ssrcGroups.length) {
                return;
            }
            let reorderedSsrcs = [];

            mLine.ssrcGroups[0].ssrcs.split(' ').forEach(ssrc => {
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
        // a=simulcast line is not needed on browsers where
        // we munge SDP for turning on simulcast. Remove this check
        // when we move to RID/MID based simulcast on all browsers.
        if (browser.usesSdpMungingForSimulcast()) {
            return desc;
        }
        const sdp = transform.parse(desc.sdp);
        const idx = sdp.media.findIndex(mline => mline.type === 'video');

        if (sdp.media[idx].rids && (sdp.media[idx].simulcast_03 || sdp.media[idx].simulcast)) {
            // Make sure we don't have the simulcast recv line on video descriptions other than
            // the first video description.
            sdp.media.forEach((mline, i) => {
                if (mline.type === 'video' && i !== idx) {
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
    * @param {boolean} isInitiator - boolean that indicates if the endpoint is offerer
    * in a p2p connection.
    * @returns {void}
    */
    addTrack(localTrack, isInitiator) {
        const track = localTrack.getTrack();

        if (isInitiator) {
            // Use pc.addTransceiver() for the initiator case when local tracks are getting added
            // to the peerconnection before a session-initiate is sent over to the peer.
            const transceiverInit = {
                direction: 'sendrecv',
                streams: [ localTrack.getOriginalStream() ],
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
     * Adds a track on the RTCRtpSender as part of the unmute operation.
     * @param {JitsiLocalTrack} localTrack - track to be unmuted.
     * @returns {Promise<void>} - resolved when done.
     */
    addTrackUnmute(localTrack) {
        const mediaType = localTrack.getType();
        const track = localTrack.getTrack();

        // The assumption here is that the first transceiver of the specified
        // media type is that of the local track.
        const transceiver = this.pc.peerconnection.getTransceivers()
            .find(t => t.receiver && t.receiver.track && t.receiver.track.kind === mediaType);

        if (!transceiver) {
            return Promise.reject(new Error(`RTCRtpTransceiver for ${mediaType} not found`));
        }
        logger.debug(`Adding ${localTrack} on ${this.pc}`);

        // If the client starts with audio/video muted setting, the transceiver direction
        // will be set to 'recvonly'. Use addStream here so that a MSID is generated for the stream.
        if (transceiver.direction === 'recvonly') {
            const stream = localTrack.getOriginalStream();

            if (stream) {
                this.pc.peerconnection.addStream(localTrack.getOriginalStream());

                return this.setEncodings(localTrack).then(() => {
                    this.pc.localTracks.set(localTrack.rtcId, localTrack);
                    transceiver.direction = 'sendrecv';
                });
            }

            return Promise.resolve();
        }

        return transceiver.sender.replaceTrack(track);
    }

    /**
     * Obtains the current local video track's height constraints based on the
     * initial stream encodings configuration on the sender and the resolution
     * of the current local track added to the peerconnection.
     * @param {MediaStreamTrack} localTrack local video track
     * @returns {Array[number]} an array containing the resolution heights of
     * simulcast streams configured on the video sender.
     */
    getLocalStreamHeightConstraints(localTrack) {
        // React-native hasn't implemented MediaStreamTrack getSettings yet.
        if (browser.isReactNative()) {
            return null;
        }

        const localVideoHeightConstraints = [];

        // Firefox doesn't return the height of the desktop track, assume a min. height of 720.
        const { height = 720 } = localTrack.getSettings();

        for (const encoding of this.localStreamEncodingsConfig) {
            localVideoHeightConstraints.push(height / encoding.scaleResolutionDownBy);
        }

        return localVideoHeightConstraints;
    }

    /**
     * Removes the track from the RTCRtpSender as part of the mute operation.
     * @param {JitsiLocalTrack} localTrack - track to be removed.
     * @returns {Promise<void>} - resolved when done.
     */
    removeTrackMute(localTrack) {
        const mediaType = localTrack.getType();
        const transceiver = this.pc.peerconnection.getTransceivers()
            .find(t => t.sender && t.sender.track && t.sender.track.id === localTrack.getTrackId());

        if (!transceiver) {
            return Promise.reject(new Error(`RTCRtpTransceiver for ${mediaType} not found`));
        }

        logger.debug(`Removing ${localTrack} on ${this.pc}`);

        return transceiver.sender.replaceTrack(null);
    }

    /**
     * Replaces the existing track on a RTCRtpSender with the given track.
     * @param {JitsiLocalTrack} oldTrack - existing track on the sender that needs to be removed.
     * @param {JitsiLocalTrack} newTrack - new track that needs to be added to the sender.
     * @returns {Promise<void>} - resolved when done.
     */
    replaceTrack(oldTrack, newTrack) {
        if (oldTrack && newTrack) {
            const mediaType = newTrack.getType();
            const stream = newTrack.getOriginalStream();

            // Ignore cases when the track is replaced while the device is in a muted state,like
            // replacing camera when video muted or replacing mic when audio muted. These JitsiLocalTracks
            // do not have a mediastream attached. Replace track will be called again when the device is
            // unmuted and the track will be replaced on the peerconnection then.
            if (!stream) {
                this.pc.localTracks.delete(oldTrack.rtcId);
                this.pc.localTracks.set(newTrack.rtcId, newTrack);

                return Promise.resolve();
            }
            const track = mediaType === MediaType.AUDIO
                ? stream.getAudioTracks()[0]
                : stream.getVideoTracks()[0];
            const transceiver = this.pc.peerconnection.getTransceivers()
                .find(t => t.receiver.track.kind === mediaType && !t.stopped);

            if (!transceiver) {
                return Promise.reject(new Error('replace track failed'));
            }
            logger.debug(`Replacing ${oldTrack} with ${newTrack} on ${this.pc}`);

            return transceiver.sender.replaceTrack(track)
                .then(() => {
                    const ssrc = this.pc.localSSRCs.get(oldTrack.rtcId);

                    this.pc.localTracks.delete(oldTrack.rtcId);
                    this.pc.localSSRCs.delete(oldTrack.rtcId);
                    this.pc._addedStreams = this.pc._addedStreams.filter(s => s !== stream);
                    this.pc.localTracks.set(newTrack.rtcId, newTrack);

                    this.pc._addedStreams.push(stream);
                    this.pc.localSSRCs.set(newTrack.rtcId, ssrc);
                    this.pc.eventEmitter.emit(RTCEvents.LOCAL_TRACK_SSRC_UPDATED,
                        newTrack,
                        this.pc._extractPrimarySSRC(ssrc));
                });
        } else if (oldTrack && !newTrack) {
            return this.removeTrackMute(oldTrack)
                .then(() => {
                    this.pc.localTracks.delete(oldTrack.rtcId);
                    this.pc.localSSRCs.delete(oldTrack.rtcId);
                });
        } else if (newTrack && !oldTrack) {
            const ssrc = this.pc.localSSRCs.get(newTrack.rtcId);

            return this.addTrackUnmute(newTrack)
                .then(() => {
                    this.pc.localTracks.set(newTrack.rtcId, newTrack);
                    this.pc.localSSRCs.set(newTrack.rtcId, ssrc);
                });
        }
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
        const transceiver = this.pc.peerconnection.getTransceivers()
            .find(t => t.sender && t.sender.track && t.sender.track.kind === track.getType());
        const parameters = transceiver.sender.getParameters();

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

        logger.info(`${active ? 'Enabling' : 'Suspending'} ${mediaType} media transfer on ${this.pc}`);
        transceivers.forEach((transceiver, idx) => {
            if (active) {
                // The first transceiver is for the local track and only this one can be set to 'sendrecv'
                if (idx === 0 && localTracks.length) {
                    transceiver.direction = 'sendrecv';
                } else {
                    transceiver.direction = 'recvonly';
                }
            } else {
                transceiver.direction = 'inactive';
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
        if (!(browser.isSafari() && parameters.encodings && Array.isArray(parameters.encodings))) {
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
