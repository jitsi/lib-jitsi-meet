import JitsiConference from '../../types/hand-crafted/JitsiConference';
import JitsiRemoteTrack from '../../types/hand-crafted/modules/RTC/JitsiRemoteTrack';
import RTC from '../../types/hand-crafted/modules/RTC/RTC';
import { VideoType } from '../../types/hand-crafted/service/RTC/VideoType';
/** Track streaming statuses. */
export declare enum TrackStreamingStatus {
    /**
     * Status indicating that streaming is currently active.
     */
    ACTIVE = "active",
    /**
     * Status indicating that streaming is currently inactive.
     * Inactive means the streaming was stopped on purpose from the bridge, like exiting forwarded sources or
     * adaptivity decided to drop video because of not enough bandwidth.
     */
    INACTIVE = "inactive",
    /**
     * Status indicating that streaming is currently interrupted.
     */
    INTERRUPTED = "interrupted",
    /**
     * Status indicating that streaming is currently restoring.
     */
    RESTORING = "restoring"
}
declare type StreamingStatusMap = {
    videoType?: VideoType;
    startedMs?: number;
    p2p?: boolean;
    streamingStatus?: string;
    value?: number;
};
/**
 * Class is responsible for emitting JitsiTrackEvents.TRACK_STREAMING_STATUS_CHANGED events.
 */
export declare class TrackStreamingStatusImpl {
    rtc: RTC;
    conference: JitsiConference;
    track: JitsiRemoteTrack;
    /**  This holds the timeout callback ID scheduled using window.setTimeout. */
    trackTimer: number | null;
    /**
     * If video track frozen detection through RTC mute event is supported, we wait some time until video track is
     * considered frozen. But because when the track falls out of forwarded sources it is expected for the video to
     * freeze this timeout must be significantly reduced in "out of forwarded sources" case.
     *
     * Basically this value is used instead of {@link rtcMuteTimeout} when track is not in forwarded sources.
     */
    outOfForwardedSourcesTimeout: number;
    /**
     * How long we are going to wait for the corresponding signaling mute event after the RTC video track muted
     * event is fired on the Media stream, before the connection interrupted is fired. The default value is
     * {@link DEFAULT_P2P_RTC_MUTE_TIMEOUT}.
     */
    p2pRtcMuteTimeout: number;
    /**
     * How long we're going to wait after the RTC video track muted event for the corresponding signalling mute
     * event, before the connection interrupted is fired. The default value is {@link DEFAULT_RTC_MUTE_TIMEOUT}.
     *
     * @returns amount of time in milliseconds
     */
    rtcMuteTimeout: number;
    /**
     * This holds a timestamp indicating  when remote video track was RTC muted. The purpose of storing the
     * timestamp is to avoid the transition to disconnected status in case of legitimate video mute operation where
     * the signalling video muted event can arrive shortly after RTC muted event.
     *
     * The timestamp is measured in milliseconds obtained with <tt>Date.now()</tt>.
     *
     * FIXME merge this logic with NO_DATA_FROM_SOURCE event implemented in JitsiLocalTrack by extending the event
     * to the remote track and allowing to set different timeout for local and remote tracks.
     */
    rtcMutedTimestamp: number | null;
    /** This holds the restoring timeout callback ID scheduled using window.setTimeout. */
    restoringTimer: ReturnType<typeof setTimeout> | null;
    /**
     * This holds the current streaming status (along with all the internal events that happen while in that
     * state).
     *
     * The goal is to send this information to the analytics backend for post-mortem analysis.
     */
    streamingStatusMap: StreamingStatusMap;
    _onP2PStatus: () => void;
    _onUserLeft: () => void;
    _onTrackRtcMuted: () => void;
    _onTrackRtcUnmuted: () => void;
    _onSignallingMuteChanged: () => void;
    _onTrackVideoTypeChanged: () => void;
    _onLastNValueChanged: () => void;
    _onForwardedSourcesChanged: () => void;
    /**
     * Calculates the new {@link TrackStreamingStatus} based on the values given for some specific remote track. It is
     * assumed that the conference is currently in the JVB mode (in contrary to the P2P mode)
     * @param isInForwardedSources - indicates whether the track is in the forwarded sources set. When set to
     * false it means that JVB is not sending any video for the track.
     * @param isRestoringTimedout - if true it means that the track has been outside of forwarded sources too
     * long to be considered {@link TrackStreamingStatus.RESTORING}.
     * @param isVideoMuted - true if the track is video muted and we should not expect to receive any video.
     * @param isVideoTrackFrozen - if the current browser support video frozen detection then it will be set to
     * true when the video track is frozen. If the current browser does not support frozen detection the it's always
     * false.
     * @return {TrackStreamingStatus} the new streaming status for the track for whom the values above were provided.
     * @private
     */
    static _getNewStateForJvbMode(isInForwardedSources: boolean, isRestoringTimedout: boolean, isVideoMuted: boolean, isVideoTrackFrozen: boolean): TrackStreamingStatus;
    /**
     * In P2P mode we don't care about any values coming from the JVB and the streaming status can be only active or
     * interrupted.
     * @param isVideoMuted - true if video muted
     * @param isVideoTrackFrozen - true if the video track for the remote track is currently frozen. If the
     * current browser does not support video frozen detection then it's always false.
     * @return {TrackStreamingStatus}
     * @private
     */
    static _getNewStateForP2PMode(isVideoMuted: boolean, isVideoTrackFrozen: boolean): TrackStreamingStatus;
    /**
     * Creates new instance of <tt>TrackStreamingStatus</tt>.
     *
     * @constructor
     * @param rtc - the RTC service instance
     * @param conference - parent conference instance
     * @param {Object} options
     * @param {number} [options.p2pRtcMuteTimeout=2500] custom value for
     * {@link TrackStreamingStatusImpl.p2pRtcMuteTimeout}.
     * @param {number} [options.rtcMuteTimeout=2000] custom value for
     * {@link TrackStreamingStatusImpl.rtcMuteTimeout}.
     * @param {number} [options.outOfForwardedSourcesTimeout=500] custom value for
     * {@link TrackStreamingStatusImpl.outOfForwardedSourcesTimeout}.
     */
    constructor(rtc: RTC, conference: JitsiConference, track: JitsiRemoteTrack, options: {
        outOfForwardedSourcesTimeout: number;
        p2pRtcMuteTimeout: number;
        rtcMuteTimeout: number;
    });
    /**
     * Gets the video frozen timeout for given source name.
     * @return how long are we going to wait since RTC video muted even, before a video track is considered
     * frozen.
     * @private
     */
    _getVideoFrozenTimeout(): number;
    /**
     * Initializes <tt>TrackStreamingStatus</tt> and bind required event listeners.
     */
    init(): void;
    /**
     * Removes all event listeners and disposes of all resources held by this instance.
     */
    dispose(): void;
    /**
     * Changes streaming status.
     * @param newStatus
     */
    _changeStreamingStatus(newStatus: TrackStreamingStatus): void;
    /**
     * Reset the postponed "streaming interrupted" event which was previously scheduled as a timeout on RTC 'onmute'
     * event.
     */
    clearTimeout(): void;
    /**
     * Clears the timestamp of the RTC muted event for remote video track.
     */
    clearRtcMutedTimestamp(): void;
    /**
     * Checks if track is considered frozen.
     * @return <tt>true</tt> if the video has frozen or <tt>false</tt> when it's either not considered frozen
     * (yet) or if freeze detection is not supported by the current browser.
     *
     * FIXME merge this logic with NO_DATA_FROM_SOURCE event implemented in JitsiLocalTrack by extending the event to
     *       the remote track and allowing to set different timeout for local and remote tracks.
     */
    isVideoTrackFrozen(): boolean;
    /**
     * Figures out (and updates) the current streaming status for the track identified by the source name.
     */
    figureOutStreamingStatus(): void;
    /**
     * Computes the duration of the current streaming status for the track (i.e. 15 seconds in the INTERRUPTED state)
     * and sends a track streaming status event.
     * @param nowMs - The current time (in millis).
     */
    maybeSendTrackStreamingStatusEvent(nowMs: number): void;
    /**
     * On change in forwarded sources set check all leaving and entering track to change their corresponding statuses.
     *
     * @param leavingForwardedSources - The array of sourceName leaving forwarded sources.
     * @param enteringForwardedSources - The array of sourceName entering forwarded sources.
     * @param timestamp - The time in millis
     * @private
     */
    onForwardedSourcesChanged(leavingForwardedSources: string[], enteringForwardedSources: string[], timestamp: number): void;
    /**
     * Clears the restoring timer for video track and the timestamp for entering forwarded sources.
     */
    _clearRestoringTimer(): void;
    /**
     * Checks whether a track had stayed enough in restoring state, compares current time and the time the track
     * entered in forwarded sources. If it hasn't timedout and there is no timer added, add new timer in order to give
     * it more time to become active or mark it as interrupted on next check.
     *
     * @returns <tt>true</tt> if the track was in restoring state more than the timeout
     * ({@link DEFAULT_RESTORING_TIMEOUT}.) in order to set its status to interrupted.
     * @private
     */
    _isRestoringTimedout(): boolean;
    /** Checks whether a track is the current track. */
    _isCurrentTrack(track: JitsiRemoteTrack): boolean;
    /**
     * Sends a last/final track streaming status event for the track of the user that left the conference.
     * @param id - The id of the participant that left the conference.
     */
    onUserLeft(id: string): void;
    /**
     * Handles RTC 'onmute' event for the video track.
     *
     * @param track - The video track for which 'onmute' event will be processed.
     */
    onTrackRtcMuted(track: JitsiRemoteTrack): void;
    /**
     * Handles RTC 'onunmute' event for the video track.
     *
     * @param track - The video track for which 'onunmute' event will be processed.
     */
    onTrackRtcUnmuted(track: JitsiRemoteTrack): void;
    /**
     * Here the signalling "mute"/"unmute" events are processed.
     *
     * @param track - The remote video track for which the signalling mute/unmute event will be
     * processed.
     */
    onSignallingMuteChanged(track: JitsiRemoteTrack): void;
    /**
     * Sends a track streaming status event as a result of the video type changing.
     * @deprecated this will go away with full multiple streams support
     * @param type - The video type.
     */
    onTrackVideoTypeChanged(type: VideoType): void;
}
export default TrackStreamingStatusImpl;
