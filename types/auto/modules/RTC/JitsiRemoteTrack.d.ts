/**
 * Represents a single media track (either audio or video).
 */
export default class JitsiRemoteTrack extends JitsiTrack {
    /**
     * Creates new JitsiRemoteTrack instance.
     * @param {RTC} rtc the RTC service instance.
     * @param {JitsiConference} conference the conference to which this track
     *        belongs to
     * @param {string} ownerEndpointId the endpoint ID of the track owner
     * @param {MediaStream} stream WebRTC MediaStream, parent of the track
     * @param {MediaStreamTrack} track underlying WebRTC MediaStreamTrack for
     *        the new JitsiRemoteTrack
     * @param {MediaType} mediaType the type of the media
     * @param {VideoType} videoType the type of the video if applicable
     * @param {number} ssrc the SSRC number of the Media Stream
     * @param {boolean} muted the initial muted state
     * @param {boolean} isP2P indicates whether or not this track belongs to a
     * P2P session
     * @param {String} sourceName the source name signaled for the track
     * @throws {TypeError} if <tt>ssrc</tt> is not a number.
     * @constructor
     */
    constructor(rtc: any, conference: any, ownerEndpointId: string, stream: MediaStream, track: MediaStreamTrack, mediaType: any, videoType: any, ssrc: number, muted: boolean, isP2P: boolean, sourceName: string);
    rtc: any;
    ssrc: number;
    ownerEndpointId: string;
    muted: boolean;
    isP2P: boolean;
    _sourceName: string;
    hasBeenMuted: boolean;
    _containerHandlers: {};
    /**
     * Attaches the track handlers.
     *
     * @returns {void}
     */
    _bindTrackHandlers(): void;
    /**
     * Callback invoked when the track is muted. Emits an event notifying
     * listeners of the mute event.
     *
     * @private
     * @returns {void}
     */
    private _onTrackMute;
    /**
     * Callback invoked when the track is unmuted. Emits an event notifying
     * listeners of the mute event.
     *
     * @private
     * @returns {void}
     */
    private _onTrackUnmute;
    /**
     * Sets current muted status and fires an events for the change.
     * @param value the muted status.
     */
    setMute(value: any): void;
    /**
     * Returns the current muted status of the track.
     * @returns {boolean|*|JitsiRemoteTrack.muted} <tt>true</tt> if the track is
     * muted and <tt>false</tt> otherwise.
     */
    isMuted(): boolean | any | any;
    /**
     * Returns the participant id which owns the track.
     *
     * @returns {string} the id of the participants. It corresponds to the
     * Colibri endpoint id/MUC nickname in case of Jitsi-meet.
     */
    getParticipantId(): string;
    /**
     * Returns the synchronization source identifier (SSRC) of this remote
     * track.
     *
     * @returns {number} the SSRC of this remote track.
     */
    getSSRC(): number;
    /**
     * Returns the tracks source name
     *
     * @returns {string} the track's source name
     */
    getSourceName(): string;
    /**
     * Changes the video type of the track.
     *
     * @param {string} type - The new video type("camera", "desktop").
     */
    _setVideoType(type: string): void;
    /**
     * Handles track play events.
     */
    _playCallback(): void;
    /**
     * An event handler for events triggered by the attached container.
     *
     * @param {string} type - The type of the event.
     */
    _containerEventHandler(type: string): void;
    /**
     * Returns a string with a description of the current status of the track.
     *
     * @returns {string}
     */
    _getStatus(): string;
}
import JitsiTrack from "./JitsiTrack";
