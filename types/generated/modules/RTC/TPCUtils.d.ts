export const SIM_LAYER_RIDS: string[];
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
    constructor(peerconnection: any, videoBitrates: any);
    pc: any;
    videoBitrates: any;
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
    localStreamEncodingsConfig: {
        active: boolean;
        maxBitrate: any;
        rid: string;
        scaleResolutionDownBy: number;
    }[];
    /**
     * Ensures that the ssrcs associated with a FID ssrc-group appear in the correct order, i.e.,
     * the primary ssrc first and the secondary rtx ssrc later. This is important for unified
     * plan since we have only one FID group per media description.
     * @param {Object} description the webRTC session description instance for the remote
     * description.
     * @private
     */
    private ensureCorrectOrderOfSsrcs;
    /**
     * Obtains stream encodings that need to be configured on the given track based
     * on the track media type and the simulcast setting.
     * @param {JitsiLocalTrack} localTrack
     */
    _getStreamEncodings(localTrack: any): {
        active: boolean;
        maxBitrate: any;
        rid: string;
        scaleResolutionDownBy: number;
    }[] | {
        active: boolean;
        maxBitrate: any;
    }[] | {
        active: boolean;
    }[];
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
    insertUnifiedPlanSimulcastReceive(desc: {
        type: string;
        sdp: string;
    }): any;
    /**
    * Adds {@link JitsiLocalTrack} to the WebRTC peerconnection for the first time.
    * @param {JitsiLocalTrack} track - track to be added to the peerconnection.
    * @param {boolean} isInitiator - boolean that indicates if the endpoint is offerer
    * in a p2p connection.
    * @returns {void}
    */
    addTrack(localTrack: any, isInitiator: boolean): void;
    /**
     * Adds a track on the RTCRtpSender as part of the unmute operation.
     * @param {JitsiLocalTrack} localTrack - track to be unmuted.
     * @returns {Promise<void>} - resolved when done.
     */
    addTrackUnmute(localTrack: any): Promise<void>;
    /**
     * Obtains the current local video track's height constraints based on the
     * initial stream encodings configuration on the sender and the resolution
     * of the current local track added to the peerconnection.
     * @param {MediaStreamTrack} localTrack local video track
     * @returns {Array[number]} an array containing the resolution heights of
     * simulcast streams configured on the video sender.
     */
    getLocalStreamHeightConstraints(localTrack: MediaStreamTrack): any[][number];
    /**
     * Removes the track from the RTCRtpSender as part of the mute operation.
     * @param {JitsiLocalTrack} localTrack - track to be removed.
     * @returns {Promise<void>} - resolved when done.
     */
    removeTrackMute(localTrack: any): Promise<void>;
    /**
     * Replaces the existing track on a RTCRtpSender with the given track.
     * @param {JitsiLocalTrack} oldTrack - existing track on the sender that needs to be removed.
     * @param {JitsiLocalTrack} newTrack - new track that needs to be added to the sender.
     * @returns {Promise<void>} - resolved when done.
     */
    replaceTrack(oldTrack: any, newTrack: any): Promise<void>;
    /**
    * Enables/disables audio transmission on the peer connection. When
    * disabled the audio transceiver direction will be set to 'inactive'
    * which means that no data will be sent nor accepted, but
    * the connection should be kept alive.
    * @param {boolean} active - true to enable audio media transmission or
    * false to disable.
    * @returns {void}
    */
    setAudioTransferActive(active: boolean): void;
    /**
     * Set the simulcast stream encoding properties on the RTCRtpSender.
     * @param {JitsiLocalTrack} track - the current track in use for which
     * the encodings are to be set.
     * @returns {Promise<void>} - resolved when done.
     */
    setEncodings(track: any): Promise<void>;
    /**
     * Enables/disables media transmission on the peerconnection by changing the direction
     * on the transceiver for the specified media type.
     * @param {String} mediaType - 'audio' or 'video'
     * @param {boolean} active - true to enable media transmission or false
     * to disable.
     * @returns {void}
     */
    setMediaTransferActive(mediaType: string, active: boolean): void;
    /**
    * Enables/disables video media transmission on the peer connection. When
    * disabled the SDP video media direction in the local SDP will be adjusted to
    * 'inactive' which means that no data will be sent nor accepted, but
    * the connection should be kept alive.
    * @param {boolean} active - true to enable video media transmission or
    * false to disable.
    * @returns {void}
    */
    setVideoTransferActive(active: boolean): void;
    /**
     * Ensures that the resolution of the stream encodings are consistent with the values
     * that were configured on the RTCRtpSender when the source was added to the peerconnection.
     * This should prevent us from overriding the default values if the browser returns
     * erroneous values when RTCRtpSender.getParameters is used for getting the encodings info.
     * @param {Object} parameters - the RTCRtpEncodingParameters obtained from the browser.
     * @returns {void}
     */
    updateEncodingsResolution(parameters: any): void;
}
