import { getLogger } from 'jitsi-meet-logger';
import transform from 'sdp-transform';

import * as JitsiTrackEvents from '../../JitsiTrackEvents';
import browser from '../browser';
import RTCEvents from '../../service/RTC/RTCEvents';
import * as MediaType from '../../service/RTC/MediaType';
import * as VideoType from '../../service/RTC/VideoType';

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
     * @constructor
     */
    constructor(peerconnection) {
        this.pc = peerconnection;

        /**
         * The simulcast encodings that will be configured on the RTCRtpSender
         * for the video tracks in the unified plan mode.
         */
        this.simulcastEncodings = [
            {
                active: true,
                maxBitrate: browser.isFirefox() ? 2500000 : 200000,
                rid: SIM_LAYER_1_RID,
                scaleResolutionDownBy: browser.isFirefox() ? 1.0 : 4.0
            },
            {
                active: true,
                maxBitrate: 700000,
                rid: SIM_LAYER_2_RID,
                scaleResolutionDownBy: 2.0
            },
            {
                active: true,
                maxBitrate: browser.isFirefox() ? 200000 : 2500000,
                rid: SIM_LAYER_3_RID,
                scaleResolutionDownBy: browser.isFirefox() ? 4.0 : 1.0
            }
        ];

        /**
         * Resolution height constraints for the simulcast encodings that
         * are configured for the video tracks.
         */
        this.simulcastStreamConstraints = [];
    }

    /**
     * Ensures that the ssrcs associated with a FID ssrc-group appear in the correct order, i.e.,
     * the primary ssrc first and the secondary rtx ssrc later. This is important for unified
     * plan since we have only one FID group per media description.
     * @param {Object} description the webRTC session description instance for the remote
     * description.
     * @private
     */
    _ensureCorrectOrderOfSsrcs(description) {
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
     * Obtains stream encodings that need to be configured on the given track.
     * @param {JitsiLocalTrack} localTrack
     */
    _getStreamEncodings(localTrack) {
        if (this.pc.isSimulcastOn() && localTrack.isVideoTrack()) {
            return this.simulcastEncodings;
        }

        return [ { active: true } ];
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
    _insertUnifiedPlanSimulcastReceive(desc) {
        // a=simulcast line is not needed on browsers where
        // we munge SDP for turning on simulcast. Remove this check
        // when we move to RID/MID based simulcast on all browsers.
        if (browser.usesSdpMungingForSimulcast()) {
            return desc;
        }
        const sdp = transform.parse(desc.sdp);
        const idx = sdp.media.findIndex(mline => mline.type === 'video');

        if (sdp.media[idx].rids && (sdp.media[idx].simulcast_03 || sdp.media[idx].simulcast)) {
            // Make sure we don't have the simulcast recv line on video descriptions other than the
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
     * Constructs resolution height constraints for the simulcast encodings that are
     * created for a given local video track.
     * @param {MediaStreamTrack} track - the local video track.
     * @returns {void}
     */
    _setSimulcastStreamConstraints(track) {
        if (browser.isReactNative()) {
            return;
        }

        const height = track.getSettings().height;

        for (const encoding in this.simulcastEncodings) {
            if (this.simulcastEncodings.hasOwnProperty(encoding)) {
                this.simulcastStreamConstraints.push({
                    height: height / this.simulcastEncodings[encoding].scaleResolutionDownBy,
                    rid: this.simulcastEncodings[encoding].rid
                });
            }
        }
    }

    /**
    * Adds {@link JitsiLocalTrack} to the WebRTC peerconnection for the first time.
    * @param {JitsiLocalTrack} track - track to be added to the peerconnection.
    * @returns {boolean} Returns true if the operation is successful,
    * false otherwise.
    */
    addTrack(localTrack, isInitiator = true) {
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

        // Construct the simulcast stream constraints for the newly added track.
        if (localTrack.isVideoTrack() && localTrack.videoType === VideoType.CAMERA && this.pc.isSimulcastOn()) {
            this._setSimulcastStreamConstraints(localTrack.getTrack());
        }
    }

    /**
     * Adds a track on the RTCRtpSender as part of the unmute operation.
     * @param {JitsiLocalTrack} localTrack - track to be unmuted.
     * @returns {Promise<boolean>} - Promise that resolves to false if unmute
     * operation is successful, a reject otherwise.
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
                this.setEncodings(localTrack);
                this.pc.localTracks.set(localTrack.rtcId, localTrack);
                transceiver.direction = 'sendrecv';
            }

            return Promise.resolve(false);
        }

        return transceiver.sender.replaceTrack(track)
            .then(() => {
                this.pc.localTracks.set(localTrack.rtcId, localTrack);

                return Promise.resolve(false);
            });
    }

    /**
     * Removes the track from the RTCRtpSender as part of the mute operation.
     * @param {JitsiLocalTrack} localTrack - track to be removed.
     * @returns {Promise<boolean>} - Promise that resolves to false if unmute
     * operation is successful, a reject otherwise.
     */
    removeTrackMute(localTrack) {
        const mediaType = localTrack.getType();
        const transceiver = this.pc.peerconnection.getTransceivers()
            .find(t => t.sender && t.sender.track && t.sender.track.id === localTrack.getTrackId());

        if (!transceiver) {
            return Promise.reject(new Error(`RTCRtpTransceiver for ${mediaType} not found`));
        }

        logger.debug(`Removing ${localTrack} on ${this.pc}`);

        return transceiver.sender.replaceTrack(null)
            .then(() => {
                this.pc.localTracks.delete(localTrack.rtcId);

                return Promise.resolve(false);
            });
    }

    /**
     * Replaces the existing track on a RTCRtpSender with the given track.
     * @param {JitsiLocalTrack} oldTrack - existing track on the sender that needs to be removed.
     * @param {JitsiLocalTrack} newTrack - new track that needs to be added to the sender.
     * @returns {Promise<false>} Promise that resolves with false as we don't want
     * renegotiation to be triggered automatically after this operation. Renegotiation is
     * done when the browser fires the negotiationeeded event.
     */
    replaceTrack(oldTrack, newTrack) {
        if (oldTrack && newTrack) {
            const mediaType = newTrack.getType();
            const stream = newTrack.getOriginalStream();
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
            if (!this.removeTrackMute(oldTrack)) {
                return Promise.reject(new Error('replace track failed'));
            }
            this.pc.localTracks.delete(oldTrack.rtcId);
            this.pc.localSSRCs.delete(oldTrack.rtcId);
        } else if (newTrack && !oldTrack) {
            const ssrc = this.pc.localSSRCs.get(newTrack.rtcId);

            if (!this.addTrackUnmute(newTrack)) {
                return Promise.reject(new Error('replace track failed'));
            }
            newTrack.emit(JitsiTrackEvents.TRACK_MUTE_CHANGED, newTrack);
            this.pc.localTracks.set(newTrack.rtcId, newTrack);
            this.pc.localSSRCs.set(newTrack.rtcId, ssrc);
        }

        return Promise.resolve(false);
    }

    /**
    * Enables/disables audio transmission on the peer connection. When
    * disabled the audio transceiver direction will be set to 'inactive'
    * which means that no data will be sent nor accepted, but
    * the connection should be kept alive.
    * @param {boolean} active - true to enable audio media transmission or
    * false to disable.
    * @returns {false} - returns false always so that renegotiation is not automatically
    * triggered after this operation.
    */
    setAudioTransferActive(active) {
        return this.setMediaTransferActive('audio', active);
    }

    /**
     * Set the simulcast stream encoding properties on the RTCRtpSender.
     * @param {JitsiLocalTrack} track - the current track in use for which
     * the encodings are to be set.
     */
    setEncodings(track) {
        const transceiver = this.pc.peerconnection.getTransceivers()
            .find(t => t.sender && t.sender.track && t.sender.track.kind === track.getType());
        const parameters = transceiver.sender.getParameters();

        parameters.encodings = this._getStreamEncodings(track);
        transceiver.sender.setParameters(parameters);
    }

    /**
     * Enables/disables media transmission on the peerconnection by changing the direction
     * on the transceiver for the specified media type.
     * @param {String} mediaType - 'audio' or 'video'
     * @param {boolean} active - true to enable media transmission or false
     * to disable.
     * @returns {false} - returns false always so that renegotiation is not automatically
     * triggered after this operation
     */
    setMediaTransferActive(mediaType, active) {
        const transceivers = this.pc.peerconnection.getTransceivers()
            .filter(t => t.receiver && t.receiver.track && t.receiver.track.kind === mediaType);
        const localTracks = Array.from(this.pc.localTracks.values())
            .filter(track => track.getType() === mediaType);

        if (active) {
            transceivers.forEach(transceiver => {
                if (localTracks.length) {
                    transceiver.direction = 'sendrecv';
                    const parameters = transceiver.sender.getParameters();

                    if (parameters && parameters.encodings && parameters.encodings.length) {
                        parameters.encodings.forEach(encoding => {
                            encoding.active = true;
                        });
                        transceiver.sender.setParameters(parameters);
                    }
                } else {
                    transceiver.direction = 'recvonly';
                }
            });
        } else {
            transceivers.forEach(transceiver => {
                transceiver.direction = 'inactive';
            });
        }

        return false;
    }

    /**
    * Enables/disables video media transmission on the peer connection. When
    * disabled the SDP video media direction in the local SDP will be adjusted to
    * 'inactive' which means that no data will be sent nor accepted, but
    * the connection should be kept alive.
    * @param {boolean} active - true to enable video media transmission or
    * false to disable.
    * @returns {false} - returns false always so that renegotiation is not automatically
    * triggered after this operation.
    */
    setVideoTransferActive(active) {
        return this.setMediaTransferActive('video', active);
    }
}
