/**
 * A class which monitors the local statistics coming from the RTC modules, and
 * calculates a "connection quality" value, in percent, for the media
 * connection. A value of 100% indicates a very good network connection, and a
 * value of 0% indicates a poor connection.
 */
export default class ConnectionQuality {
    /**
     *
     * @param conference
     * @param eventEmitter
     * @param options
     */
    constructor(conference: any, eventEmitter: any, options: any);
    eventEmitter: any;
    /**
     * The owning JitsiConference.
     */
    _conference: any;
    /**
     * Holds statistics about the local connection quality.
     */
    _localStats: {
        connectionQuality: number;
        jvbRTT: any;
    };
    /**
     * The time this._localStats.connectionQuality was last updated.
     */
    _lastConnectionQualityUpdate: number;
    /**
     * Conference options.
     */
    _options: any;
    /**
     * Maps a participant ID to an object holding connection quality
     * statistics received from this participant.
     */
    _remoteStats: {};
    /**
     * The time that the ICE state last changed to CONNECTED. We use this
     * to calculate how much time we as a sender have had to ramp-up.
     */
    _timeIceConnected: number;
    /**
     * The time that local video was unmuted. We use this to calculate how
     * much time we as a sender have had to ramp-up.
     */
    _timeVideoUnmuted: number;
    /**
     * Sets _timeVideoUnmuted if it was previously unset. If it was already set,
     * doesn't change it.
     */
    _maybeUpdateUnmuteTime(): void;
    /**
     * Calculates a new "connection quality" value.
     * @param videoType {VideoType} the type of the video source (camera or a screen capture).
     * @param isMuted {boolean} whether the local video is muted.
     * @param resolutionName {Resolution} the input resolution used by the camera.
     * @returns {*} the newly calculated connection quality.
     */
    _calculateConnectionQuality(videoType: VideoType, isMuted: boolean, resolutionName: any): any;
    /**
     * Updates the localConnectionQuality value
     * @param values {number} the new value. Should be in [0, 100].
     */
    _updateLocalConnectionQuality(value: any): void;
    /**
     * Broadcasts the local statistics to all other participants in the
     * conference.
     */
    _broadcastLocalStats(): void;
    /**
     * Updates the local statistics
     * @param {TraceablePeerConnection} tpc the peerconnection which emitted
     * the stats
     * @param data new statistics
     */
    _updateLocalStats(tpc: any, data: any): void;
    /**
     * Updates remote statistics
     * @param id the id of the remote participant
     * @param data the statistics received
     */
    _updateRemoteStats(id: any, data: any): void;
    /**
     * Returns the local statistics.
     * Exported only for use in jitsi-meet-torture.
     */
    getStats(): {
        connectionQuality: number;
        jvbRTT: any;
    };
}
import { VideoType } from "../../service/RTC/VideoType";
