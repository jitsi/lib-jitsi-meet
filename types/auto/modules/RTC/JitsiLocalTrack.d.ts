/**
 * Represents a single media track(either audio or video).
 * One <tt>JitsiLocalTrack</tt> corresponds to one WebRTC MediaStreamTrack.
 */
export default class JitsiLocalTrack extends JitsiTrack {
    /**
     * Constructs a new JitsiLocalTrack instance.
     *
     * @constructor
     * @param {Object} trackInfo
     * @param {number} trackInfo.rtcId - The ID assigned by the RTC module.
     * @param {Object} trackInfo.stream - The WebRTC MediaStream, parent of the track.
     * @param {Object} trackInfo.track - The underlying WebRTC MediaStreamTrack for new JitsiLocalTrack.
     * @param {string} trackInfo.mediaType - The MediaType of the JitsiLocalTrack.
     * @param {string} trackInfo.videoType - The VideoType of the JitsiLocalTrack.
     * @param {Array<Object>} trackInfo.effects - The effects to be applied to the JitsiLocalTrack.
     * @param {number} trackInfo.resolution - The the video resolution if it's a video track
     * @param {string} trackInfo.deviceId - The ID of the local device for this track.
     * @param {string} trackInfo.facingMode - Thehe camera facing mode used in getUserMedia call (for mobile only).
     * @param {sourceId} trackInfo.sourceId - The id of the desktop sharing source. NOTE: defined for desktop sharing
     * tracks only.
     */
    constructor({ deviceId, facingMode, mediaType, resolution, rtcId, sourceId, sourceType, stream, track, videoType, effects }: {
        rtcId: number;
        stream: any;
        track: any;
        mediaType: string;
        videoType: string;
        effects: Array<any>;
        resolution: number;
        deviceId: string;
        facingMode: string;
        sourceId: any;
    });
    _setEffectInProgress: boolean;
    /**
     * Track metadata.
     */
    metadata: {
        displaySurface?: any;
        timestamp: number;
    };
    /**
     * The ID assigned by the RTC module on instance creation.
     *
     * @type {number}
     */
    rtcId: number;
    sourceId: any;
    sourceType: any;
    resolution: any;
    maxEnabledResolution: number;
    _constraints: any;
    deviceId: string;
    /**
     * The <tt>Promise</tt> which represents the progress of a previously
     * queued/scheduled {@link _setMuted} (from the point of view of
     * {@link _queueSetMuted}).
     *
     * @private
     * @type {Promise}
     */
    private _prevSetMuted;
    /**
     * The facing mode of the camera from which this JitsiLocalTrack
     * instance was obtained.
     *
     * @private
     * @type {CameraFacingMode|undefined}
     */
    private _facingMode;
    _trackEnded: boolean;
    /**
     * Indicates whether data has been sent or not.
     */
    _hasSentData: boolean;
    /**
     * Used only for detection of audio problems. We want to check only once
     * whether the track is sending data ot not. This flag is set to false
     * after the check.
     */
    _testDataSent: boolean;
    _realDeviceId: string;
    _sourceName: string;
    _trackMutedTS: number;
    _onDeviceListWillChange: (devices: any) => void;
    _onAudioOutputDeviceChanged: any;
    /**
     * Adds stream to conference and marks it as "unmute" operation.
     *
     * @private
     * @returns {Promise}
     */
    private _addStreamToConferenceAsUnmute;
    /**
     * Fires NO_DATA_FROM_SOURCE event and logs it to analytics and callstats.
     *
     * @private
     * @returns {void}
     */
    private _fireNoDataFromSourceEvent;
    /**
     * Sets handlers to the MediaStreamTrack object that will detect camera issues.
     *
     * @private
     * @returns {void}
     */
    private _initNoDataFromSourceHandlers;
    /**
     * Returns true if no data from source events are enabled for this JitsiLocalTrack and false otherwise.
     *
     * @private
     * @returns {boolean} - True if no data from source events are enabled for this JitsiLocalTrack and false otherwise.
     */
    private _isNoDataFromSourceEventsEnabled;
    /**
     * Initializes a new Promise to execute {@link #_setMuted}. May be called multiple times in a row and the
     * invocations of {@link #_setMuted} and, consequently, {@link #mute} and/or {@link #unmute} will be resolved in a
     * serialized fashion.
     *
     * @param {boolean} muted - The value to invoke <tt>_setMuted</tt> with.
     * @private
     * @returns {Promise}
     */
    private _queueSetMuted;
    /**
     * Removes stream from conference and marks it as "mute" operation.
     *
     * @param {Function} successCallback - Callback that will be called when the operation is successful.
     * @param {Function} errorCallback - Callback that will be called when the operation fails.
     * @private
     * @returns {Promise}
     */
    private _removeStreamFromConferenceAsMute;
    /**
     * Sends mute status for a track to conference if any.
     *
     * @param {boolean} mute - If track is muted.
     * @private
     * @returns {void}
     */
    private _sendMuteStatus;
    /**
     * Mutes / unmutes this track.
     *
     * @param {boolean} muted - If <tt>true</tt>, this track will be muted; otherwise, this track will be unmuted.
     * @private
     * @returns {Promise}
     */
    private _setMuted;
    /**
     * Sets real device ID by comparing track information with device information. This is temporary solution until
     * getConstraints() method will be implemented in browsers.
     *
     * @param {MediaDeviceInfo[]} devices - The list of devices obtained from enumerateDevices() call.
     * @private
     * @returns {void}
     */
    private _setRealDeviceIdFromDeviceList;
    storedMSID: string;
    /**
     * Starts the effect process and returns the modified stream.
     *
     * @param {Object} effect - Represents effect instance
     * @private
     * @returns {void}
     */
    private _startStreamEffect;
    _streamEffect: any;
    _originalStream: any;
    /**
     * Stops the effect process and returns the original stream.
     *
     * @private
     * @returns {void}
     */
    private _stopStreamEffect;
    /**
     * Switches the camera facing mode if the WebRTC implementation supports the custom MediaStreamTrack._switchCamera
     * method. Currently, the method in question is implemented in react-native-webrtc only. When such a WebRTC
     * implementation is executing, the method is the preferred way to switch between the front/user-facing and the
     * back/environment-facing cameras because it will likely be (as is the case of react-native-webrtc) noticeably
     * faster that creating a new MediaStreamTrack via a new getUserMedia call with the switched facingMode constraint
     * value. Moreover, the approach with a new getUserMedia call may not even work: WebRTC on Android and iOS is
     * either very slow to open the camera a second time or plainly freezes attempting to do that.
     *
     * @returns {void}
     */
    _switchCamera(): void;
    /**
     * Stops the currently used effect (if there is one) and starts the passed effect (if there is one).
     *
     * @param {Object|undefined} effect - The new effect to be set.
     * @private
     * @returns {void}
     */
    private _switchStreamEffect;
    /**
     * Returns facing mode for video track from camera. For other cases (e.g. audio track or 'desktop' video track)
     * returns undefined.
     *
     * @returns {CameraFacingMode|undefined}
     */
    getCameraFacingMode(): CameraFacingMode | undefined;
    /**
     * Returns device id associated with track.
     *
     * @returns {string}
     */
    getDeviceId(): string;
    /**
     * Get the duration of the track.
     *
     * @returns {Number} the duration of the track in seconds
     */
    getDuration(): number;
    /**
     * Returns the participant id which owns the track.
     *
     * @returns {string} the id of the participants. It corresponds to the
     * Colibri endpoint id/MUC nickname in case of Jitsi-meet.
     */
    getParticipantId(): string;
    /**
     * Returns the source name associated with the jitsi track.
     *
     * @returns {string | null} source name
     */
    getSourceName(): string | null;
    /**
     * Returns if associated MediaStreamTrack is in the 'ended' state
     *
     * @returns {boolean}
     */
    isEnded(): boolean;
    /**
     * Returns <tt>true</tt> - if the stream is muted and <tt>false</tt> otherwise.
     *
     * @returns {boolean} <tt>true</tt> - if the stream is muted and <tt>false</tt> otherwise.
     */
    isMuted(): boolean;
    /**
     * Checks whether the attached MediaStream is receiving data from source or not. If the stream property is null
     * (because of mute or another reason) this method will return false.
     * NOTE: This method doesn't indicate problem with the streams directly. For example in case of video mute the
     * method will return false or if the user has disposed the track.
     *
     * @returns {boolean} true if the stream is receiving data and false this otherwise.
     */
    isReceivingData(): boolean;
    /**
     * Asynchronously mutes this track.
     *
     * @returns {Promise}
     */
    mute(): Promise<any>;
    /**
     * Handles bytes sent statistics. NOTE: used only for audio tracks to detect audio issues.
     *
     * @param {TraceablePeerConnection} tpc - The peerconnection that is reporting the bytes sent stat.
     * @param {number} bytesSent - The new value.
     * @returns {void}
     */
    onByteSentStatsReceived(tpc: any, bytesSent: number): void;
    /**
     * Sets the JitsiConference object associated with the track. This is temp solution.
     *
     * @param conference - JitsiConference object.
     * @returns {void}
     */
    setConference(conference: any): void;
    /**
     * Sets the effect and switches between the modified stream and original one.
     *
     * @param {Object} effect - Represents the effect instance to be used.
     * @returns {Promise}
     */
    setEffect(effect: any): Promise<any>;
    /**
     * Sets the source name to be used for signaling the jitsi track.
     *
     * @param {string} name The source name.
     */
    setSourceName(name: string): void;
    /**
     * Stops the associated MediaStream.
     *
     * @returns {void}
     */
    stopStream(): void;
    /**
     * Indicates that we are executing {@link #stopStream} i.e.
     * {@link RTCUtils#stopMediaStream} for the <tt>MediaStream</tt>
     * associated with this <tt>JitsiTrack</tt> instance.
     *
     * @private
     * @type {boolean}
     */
    private _stopStreamInProgress;
    /**
     * Asynchronously unmutes this track.
     *
     * @returns {Promise}
     */
    unmute(): Promise<any>;
}
import JitsiTrack from "./JitsiTrack";
import CameraFacingMode from "../../service/RTC/CameraFacingMode";
