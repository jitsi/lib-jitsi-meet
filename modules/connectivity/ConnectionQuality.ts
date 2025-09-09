import { getLogger } from '@jitsi/logger';

import JitsiConference, { IConferenceOptions } from '../../JitsiConference';
import { JitsiConferenceEvents as ConferenceEvents } from '../../JitsiConferenceEvents';
import JitsiParticipant from '../../JitsiParticipant';
import { RTCEvents } from '../../service/RTC/RTCEvents';
import Resolutions from '../../service/RTC/Resolutions';
import { VIDEO_QUALITY_LEVELS } from '../../service/RTC/StandardVideoQualitySettings';
import { VideoType } from '../../service/RTC/VideoType';
import { ConnectionQualityEvents } from '../../service/connectivity/ConnectionQualityEvents';
import { XMPPEvents } from '../../service/xmpp/XMPPEvents';
import TraceablePeerConnection from '../RTC/TraceablePeerConnection';
import EventEmitter from '../util/EventEmitter';

const logger = getLogger('connectivity:ConnectionQuality');

/**
 * The value to use for the "type" field for messages sent by ConnectionQuality
 * over the data channel.
 */
const STATS_MESSAGE_TYPE = 'stats';

/**
 * The maximum bitrate to use as a measurement against the participant's current
 * bitrate. This cap helps in the cases where the participant's bitrate is high
 * but not enough to fulfill high targets, such as with 1080p.
 */
const MAX_TARGET_BITRATE = 2500;

/**
 * The initial bitrate for video in kbps.
 */
const startBitrate = 800;

/**
 * Gets the expected bitrate (in kbps) in perfect network conditions.
 * @param simulcast {boolean} whether simulcast is enabled or not.
 * @param resolution {Resolution} the resolution.
 * @param millisSinceStart {number} the number of milliseconds since sending video started.
 * @param bitrates {Object} the bitrates for the local video source.
 */
function getTarget(simulcast: boolean, resolution: { height: number; width: number; }, millisSinceStart: number, bitrates?: { download: number; upload: number; }): number {
    let target = 0;
    let height = Math.min(resolution.height, resolution.width);

    // Find the first format with height no bigger than ours.
    let qualityLevel = VIDEO_QUALITY_LEVELS.find(f => f.height <= height);

    if (qualityLevel && simulcast) {
        // Sum the target fields from all simulcast layers for the given
        // resolution (e.g. 720p + 360p + 180p) for VP8 simulcast.
        for (height = qualityLevel.height; height >= 180; height /= 2) {
            const targetHeight = height;

            qualityLevel = VIDEO_QUALITY_LEVELS.find(f => f.height === targetHeight);
            if (qualityLevel) {
                target += bitrates[qualityLevel.level];
            } else {
                break;
            }
        }
    } else if (qualityLevel) {
        // For VP9 SVC, H.264 (simulcast automatically disabled) and p2p, target bitrate will be
        // same as that of the individual stream bitrate.
        target = bitrates[qualityLevel.level];
    }

    // Allow for an additional 1 second for ramp up -- delay any initial drop
    // of connection quality by 1 second. Convert target from bps to kbps.
    return Math.min(target / 1000, rampUp(Math.max(0, millisSinceStart - 1000)));
}

/**
 * Gets the bitrate to which GCC would have ramped up in perfect network
 * conditions after millisSinceStart milliseconds.
 * @param millisSinceStart {number} the number of milliseconds since sending
 * video was enabled.
 */
function rampUp(millisSinceStart: number): number {
    if (millisSinceStart > 60000) {
        return Number.MAX_SAFE_INTEGER;
    }

    // According to GCC the send side bandwidth estimation grows with at most
    // 8% per second.
    // https://tools.ietf.org/html/draft-ietf-rmcat-gcc-02#section-5.5
    return startBitrate * Math.pow(1.08, millisSinceStart / 1000);
}

export interface ILocalStats {
    bandwidth?: {
        download?: number;
        upload?: number;
    };
    bitrate?: {
        upload: number;
    };
    bridgeCount?: number;
    connectionQuality: number;
    jvbRTT?: number;
    maxEnabledResolution?: { height: number; width: number; };
    packetLoss?: {
        upload?: number;
    };
    serverRegion?: string;
}

export interface IConnectionQualityOptions {
    config: {
        disableLocalStats: boolean;
        disableLocalStatsBroadcast: boolean;
        pcStatsInterval: number;
    };
}

export type IRemoteStats = Pick<
    ILocalStats,
    'bitrate' | 'connectionQuality' | 'jvbRTT' | 'maxEnabledResolution' | 'packetLoss' | 'serverRegion'
>;

/**
 * A class which monitors the local statistics coming from the RTC modules, and
 * calculates a "connection quality" value, in percent, for the media
 * connection. A value of 100% indicates a very good network connection, and a
 * value of 0% indicates a poor connection.
 */
export default class ConnectionQuality {
    private eventEmitter: EventEmitter;
    private _conference: JitsiConference;
    private _localStats: ILocalStats;
    private _lastConnectionQualityUpdate: number;
    private _options: any;
    private _remoteStats: { [key: string]: any; };
    private _timeIceConnected: number;
    private _timeVideoUnmuted: number;

    /**
     *
     * @param conference
     * @param eventEmitter
     * @param options
     */
    constructor(conference: JitsiConference, eventEmitter: EventEmitter, options: IConferenceOptions | IConnectionQualityOptions) {
        this.eventEmitter = eventEmitter;

        /**
         * The owning JitsiConference.
         */
        this._conference = conference;

        /**
         * Holds statistics about the local connection quality.
         */
        this._localStats = {
            connectionQuality: 100,
            jvbRTT: undefined
        };

        /**
         * The time this._localStats.connectionQuality was last updated.
         */
        this._lastConnectionQualityUpdate = -1;

        /**
         * Conference options.
         */
        this._options = options;

        /**
         * Maps a participant ID to an object holding connection quality
         * statistics received from this participant.
         */
        this._remoteStats = {};

        /**
         * The time that the ICE state last changed to CONNECTED. We use this
         * to calculate how much time we as a sender have had to ramp-up.
         */
        this._timeIceConnected = -1;

        /**
         * The time that local video was unmuted. We use this to calculate how
         * much time we as a sender have had to ramp-up.
         */
        this._timeVideoUnmuted = -1;

        conference.on(
            ConferenceEvents.BRIDGE_BWE_STATS_RECEIVED,
            bwe => {
                if (bwe && this._localStats?.bandwidth) {
                    this._localStats.bandwidth.download = Math.floor(bwe / 1000);
                }
            });

        // TODO: consider ignoring these events and letting the user of
        // lib-jitsi-meet handle these separately.
        conference.on(
            ConferenceEvents.CONNECTION_INTERRUPTED,
            () => {
                this._updateLocalConnectionQuality(0);
                this.eventEmitter.emit(ConnectionQualityEvents.LOCAL_STATS_UPDATED, this._localStats);
                this._broadcastLocalStats();
            });

        conference.room.addListener(
            XMPPEvents.ICE_CONNECTION_STATE_CHANGED,
            (jingleSession: any, newState: string) => {
                if (!jingleSession.isP2P && newState === 'connected') {
                    this._timeIceConnected = window.performance.now();
                }
            });

        // Listen to DataChannel message from other participants in the
        // conference, and update the _remoteStats field accordingly.
        // TODO - Delete this when all the mobile endpoints switch to using the new Colibri
        // message format for sending the endpoint stats.
        conference.on(
            ConferenceEvents.ENDPOINT_MESSAGE_RECEIVED,
            (participant: JitsiParticipant, payload: { type: string; values: any; }) => {
                if (payload.type === STATS_MESSAGE_TYPE) {
                    this._updateRemoteStats(participant.getId(), payload.values);
                }
            });

        conference.on(
            ConferenceEvents.ENDPOINT_STATS_RECEIVED,
            (participant: JitsiParticipant, payload: IRemoteStats) => {
                this._updateRemoteStats(participant.getId(), payload);
            });

        if (!this._options.config.disableLocalStats) {
            // Listen to local statistics events originating from the RTC module and update the _localStats field.
            conference.statistics.addConnectionStatsListener(this._updateLocalStats.bind(this));
        }

        // Save the last time we were unmuted.
        conference.on(
            ConferenceEvents.TRACK_MUTE_CHANGED,
            track => {
                if (track.isVideoTrack()) {
                    if (track.isMuted()) {
                        this._timeVideoUnmuted = -1;
                    } else {
                        this._maybeUpdateUnmuteTime();
                    }
                }
            });
        conference.on(
            ConferenceEvents.TRACK_ADDED,
            track => {
                if (track.isVideoTrack() && !track.isMuted()) {
                    this._maybeUpdateUnmuteTime();
                }
            });

        conference.on(ConferenceEvents.VIDEO_CODEC_CHANGED, this._resetVideoUnmuteTime.bind(this));

        conference.on(ConferenceEvents._MEDIA_SESSION_ACTIVE_CHANGED, this._resetVideoUnmuteTime.bind(this));

        conference.rtc.on(
            RTCEvents.LOCAL_TRACK_MAX_ENABLED_RESOLUTION_CHANGED,
            track => {
                this._localStats.maxEnabledResolution = track.maxEnabledResolution;
            });

        conference.on(
            ConferenceEvents.SERVER_REGION_CHANGED,
            serverRegion => {
                this._localStats.serverRegion = serverRegion;
            });

        conference.on(
            ConferenceEvents.PROPERTIES_CHANGED,
            properties => {
                this._localStats.bridgeCount
                    = Number(properties?.['bridge-count']);
            }
        );
    }

    /**
     * Broadcasts the local statistics to all other participants in the
     * conference.
     */
    private _broadcastLocalStats(): void {
        // broadcasting local stats is disabled
        if (this._options.config.disableLocalStatsBroadcast) {
            return;
        }

        // Send only the data that remote participants care about.
        const data = {
            bitrate: this._localStats.bitrate,
            connectionQuality: this._localStats.connectionQuality,
            jvbRTT: this._localStats.jvbRTT,
            maxEnabledResolution: this._localStats.maxEnabledResolution,
            packetLoss: this._localStats.packetLoss,
            serverRegion: this._localStats.serverRegion
        };

        try {
            this._conference.sendEndpointStatsMessage(data);
        } catch (err) {
            // Ignore the error as we might hit it in the beginning of the call before the channel is ready.
            // The statistics will be sent again after few seconds and error is logged elseware as well.
        }
    }

    /**
     * Calculates a new "connection quality" value.
     * @param videoType {VideoType} the type of the video source (camera or a screen capture).
     * @param isMuted {boolean} whether the local video is muted.
     * @param resolutionName {Resolution} the input resolution used by the camera.
     * @returns {*} the newly calculated connection quality.
     */
    private _calculateConnectionQuality(videoType: VideoType, isMuted: boolean, resolutionName: keyof typeof Resolutions): number {

        // resolutionName is an index into Resolutions (where "720" is
        // "1280x720" and "960" is "960x720" ...).
        const resolution = Resolutions[resolutionName];

        let quality = 100;
        let packetLoss;

        // TODO: take into account packet loss for received streams
        if (this._localStats.packetLoss) {
            packetLoss = this._localStats.packetLoss.upload;
        }

        if (isMuted || !resolution || videoType === VideoType.DESKTOP
            || this._timeIceConnected < 0
            || this._timeVideoUnmuted < 0) {

            // Calculate a value based on packet loss only.
            if (packetLoss === undefined) {
                logger.error('Cannot calculate connection quality, unknown '
                    + 'packet loss.');
                quality = 100;
            } else if (packetLoss <= 2) {
                quality = 100; // Full 5 bars.
            } else if (packetLoss <= 4) {
                quality = 70; // 4 bars
            } else if (packetLoss <= 6) {
                quality = 50; // 3 bars
            } else if (packetLoss <= 8) {
                quality = 30; // 2 bars
            } else if (packetLoss <= 12) {
                quality = 10; // 1 bars
            } else {
                quality = 0; // Still 1 bar, but slower climb-up.
            }
        } else {
            // Calculate a value based on the send video bitrate on the active TPC.
            const activeTPC = this._conference.getActivePeerConnection();

            if (activeTPC) {
                // Time since sending of video was enabled.
                const millisSinceStart = window.performance.now()
                    - Math.max(this._timeVideoUnmuted, this._timeIceConnected);
                const statsInterval = this._options.config?.pcStatsInterval ?? 10000;

                // Expected sending bitrate in perfect conditions.
                let target = getTarget(
                    activeTPC.doesTrueSimulcast(undefined),
                    resolution,
                    millisSinceStart,
                    activeTPC.getTargetVideoBitrates(undefined));

                target = Math.min(target, MAX_TARGET_BITRATE);

                // Calculate the quality only after the stats are available (after video was enabled).
                if (millisSinceStart > statsInterval) {
                    quality = 100 * this._localStats.bitrate.upload / target;
                }
            }

            // Whatever the bitrate, drop early if there is significant loss
            if (packetLoss && packetLoss >= 10) {
                quality = Math.min(quality, 30);
            }
        }

        // Make sure that the quality doesn't climb quickly
        if (this._lastConnectionQualityUpdate > 0) {
            const maxIncreasePerSecond = 2;
            const prevConnectionQuality = this._localStats.connectionQuality;
            const diffSeconds = (window.performance.now() - this._lastConnectionQualityUpdate) / 1000;

            quality = Math.min(quality, prevConnectionQuality + (diffSeconds * maxIncreasePerSecond));
        }

        return Math.min(100, quality);
    }

    /**
     * Sets _timeVideoUnmuted if it was previously unset. If it was already set,
     * doesn't change it.
     */
    private _maybeUpdateUnmuteTime(): void {
        if (this._timeVideoUnmuted < 0) {
            this._timeVideoUnmuted = window.performance.now();
        }
    }

    /**
     * Resets the time video was unmuted and triggers a new ramp-up.
     *
     * @private
     * @returns {void}
     */
    private _resetVideoUnmuteTime(): void {
        this._timeVideoUnmuted = -1;
        this._maybeUpdateUnmuteTime();
    }

    /**
     * Updates the localConnectionQuality value
     * @param values {number} the new value. Should be in [0, 100].
     */
    private _updateLocalConnectionQuality(value: number): void {
        this._localStats.connectionQuality = value;
        this._lastConnectionQualityUpdate = window.performance.now();
    }

    /**
     * Updates the local statistics
     * @param {TraceablePeerConnection} tpc the peerconnection which emitted
     * the stats
     * @param data new statistics
     */
    private _updateLocalStats(tpc: TraceablePeerConnection, data: { transport: { rtt: number; }[]; }): void {
        // Update jvbRTT
        if (!tpc.isP2P) {
            const jvbRTT
                = data.transport?.length && data.transport[0].rtt;

            this._localStats.jvbRTT = jvbRTT ? jvbRTT : undefined;
        }

        // Do not continue with processing of other stats if they do not
        // originate from the active peerconnection
        if (tpc !== this._conference.getActivePeerConnection()) {
            return;
        }

        let key;
        const updateLocalConnectionQuality = !this._conference.isConnectionInterrupted();
        const localVideoTrack = this._conference.getLocalVideoTrack();
        const videoType = localVideoTrack?.videoType;
        const isMuted = localVideoTrack ? localVideoTrack.isMuted() : true;
        const resolutionName = localVideoTrack
            ? Math.min(localVideoTrack.resolution, localVideoTrack.maxEnabledResolution).toString() as keyof typeof Resolutions : null;

        if (!isMuted) {
            this._maybeUpdateUnmuteTime();
        }

        // Copy the fields already in 'data'.
        for (key in data) {
            if (data.hasOwnProperty(key)) {
                // Prevent overwriting available download bandwidth as this statistic is provided by the bridge.
                if (key === 'bandwidth' && data[key].hasOwnProperty('download') && !tpc.isP2P) {
                    if (!this._localStats[key]) {
                        this._localStats[key] = {};
                    }
                    this._localStats[key].download = this._localStats[key].download || data[key].download;
                    this._localStats[key].upload = data[key].upload;
                } else {
                    this._localStats[key] = data[key];
                }
            }
        }

        // And re-calculate the connectionQuality field.
        if (updateLocalConnectionQuality) {
            this._updateLocalConnectionQuality(
                this._calculateConnectionQuality(
                    videoType,
                    isMuted,
                    resolutionName));
        }

        this.eventEmitter.emit(ConnectionQualityEvents.LOCAL_STATS_UPDATED, this._localStats);
        this._broadcastLocalStats();
    }

    /**
     * Updates remote statistics
     * @param id the id of the remote participant
     * @param data the statistics received
     */
    private _updateRemoteStats(id: string, data: IRemoteStats): void {
        // Use only the fields we need
        this._remoteStats[id] = {
            bitrate: data.bitrate,
            connectionQuality: data.connectionQuality,
            jvbRTT: data.jvbRTT,
            maxEnabledResolution: data.maxEnabledResolution,
            packetLoss: data.packetLoss,
            serverRegion: data.serverRegion
        };

        this.eventEmitter.emit(
            ConnectionQualityEvents.REMOTE_STATS_UPDATED,
            id,
            this._remoteStats[id]);
    }

    /**
     * Returns the local statistics.
     * Exported only for use in jitsi-meet-torture.
     */
    public getStats(): ILocalStats {
        return this._localStats;
    }
}
