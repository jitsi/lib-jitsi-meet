import { getLogger } from 'jitsi-meet-logger';

import * as ConferenceEvents from '../../JitsiConferenceEvents';
import CodecMimeType from '../../service/RTC/CodecMimeType';
import * as RTCEvents from '../../service/RTC/RTCEvents';
import * as ConnectionQualityEvents from '../../service/connectivity/ConnectionQualityEvents';
import browser from '../browser';

const Resolutions = require('../../service/RTC/Resolutions');
const VideoType = require('../../service/RTC/VideoType');
const XMPPEvents = require('../../service/xmpp/XMPPEvents');

const logger = getLogger(__filename);

/**
 * The value to use for the "type" field for messages sent by ConnectionQuality
 * over the data channel.
 */
const STATS_MESSAGE_TYPE = 'stats';

const kSimulcastFormats = [
    { width: 1920,
        height: 1080,
        layers: 3,
        target: 'high',
        targetRN: 4000000 },
    { width: 1280,
        height: 720,
        layers: 3,
        target: 'high',
        targetRN: 2500000 },
    { width: 960,
        height: 540,
        layers: 3,
        target: 'standard',
        targetRN: 900000 },
    { width: 640,
        height: 360,
        layers: 2,
        target: 'standard',
        targetRN: 500000 },
    { width: 480,
        height: 270,
        layers: 2,
        target: 'low',
        targetRN: 350000 },
    { width: 320,
        height: 180,
        layers: 1,
        target: 'low',
        targetRN: 150000 }
];

/**
 * The maximum bitrate to use as a measurement against the participant's current
 * bitrate. This cap helps in the cases where the participant's bitrate is high
 * but not enough to fulfill high targets, such as with 1080p.
 */
const MAX_TARGET_BITRATE = 2500;

/**
 * The initial bitrate for video in kbps.
 */
let startBitrate = 800;

/**
 * Gets the expected bitrate (in kbps) in perfect network conditions.
 * @param simulcast {boolean} whether simulcast is enabled or not.
 * @param resolution {Resolution} the resolution.
 * @param millisSinceStart {number} the number of milliseconds since sending video started.
 * @param videoQualitySettings {Object} the bitrate and codec settings for the local video source.
 */
function getTarget(simulcast, resolution, millisSinceStart, videoQualitySettings) {
    let target = 0;
    let height = Math.min(resolution.height, resolution.width);

    // Find the first format with height no bigger than ours.
    let simulcastFormat = kSimulcastFormats.find(f => f.height <= height);

    if (simulcastFormat && simulcast && videoQualitySettings.codec === CodecMimeType.VP8) {
        // Sum the target fields from all simulcast layers for the given
        // resolution (e.g. 720p + 360p + 180p) for VP8 simulcast.
        for (height = simulcastFormat.height; height >= 180; height /= 2) {
            const targetHeight = height;

            simulcastFormat = kSimulcastFormats.find(f => f.height === targetHeight);
            if (simulcastFormat) {
                target += browser.isReactNative()
                    ? simulcastFormat.targetRN
                    : videoQualitySettings[simulcastFormat.target];
            } else {
                break;
            }
        }
    } else if (simulcastFormat) {
        // For VP9 SVC, H.264 (simulcast automatically disabled) and p2p, target bitrate will be
        // same as that of the individual stream bitrate.
        target = browser.isReactNative()
            ? simulcastFormat.targetRN
            : videoQualitySettings[simulcastFormat.target];
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
function rampUp(millisSinceStart) {
    if (millisSinceStart > 60000) {
        return Number.MAX_SAFE_INTEGER;
    }

    // According to GCC the send side bandwidth estimation grows with at most
    // 8% per second.
    // https://tools.ietf.org/html/draft-ietf-rmcat-gcc-02#section-5.5
    return startBitrate * Math.pow(1.08, millisSinceStart / 1000);
}

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
    constructor(conference, eventEmitter, options) {
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

        // We assume a global startBitrate value for the sake of simplicity.
        if (this._options.config?.startBitrate > 0) {
            startBitrate = this._options.config.startBitrate;
        }

        // TODO: consider ignoring these events and letting the user of
        // lib-jitsi-meet handle these separately.
        conference.on(
            ConferenceEvents.CONNECTION_INTERRUPTED,
            () => {
                this._updateLocalConnectionQuality(0);
                this.eventEmitter.emit(
                    ConnectionQualityEvents.LOCAL_STATS_UPDATED,
                    this._localStats);
                this._broadcastLocalStats();
            });

        conference.room.addListener(
            XMPPEvents.ICE_CONNECTION_STATE_CHANGED,
            (jingleSession, newState) => {
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
            (participant, payload) => {
                if (payload.type === STATS_MESSAGE_TYPE) {
                    this._updateRemoteStats(
                        participant.getId(), payload.values);
                }
            });

        conference.on(
            ConferenceEvents.ENDPOINT_STATS_RECEIVED,
            (participant, payload) => {
                this._updateRemoteStats(participant.getId(), payload);
            });

        // Listen to local statistics events originating from the RTC module and update the _localStats field.
        conference.statistics.addConnectionStatsListener(this._updateLocalStats.bind(this));

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
                    = Number((properties || {})['bridge-count']);
            }
        );
    }

    /**
     * Sets _timeVideoUnmuted if it was previously unset. If it was already set,
     * doesn't change it.
     */
    _maybeUpdateUnmuteTime() {
        if (this._timeVideoUnmuted < 0) {
            this._timeVideoUnmuted = window.performance.now();
        }
    }

    /**
     * Calculates a new "connection quality" value.
     * @param videoType {VideoType} the type of the video source (camera or a screen capture).
     * @param isMuted {boolean} whether the local video is muted.
     * @param resolutionName {Resolution} the input resolution used by the camera.
     * @returns {*} the newly calculated connection quality.
     */
    _calculateConnectionQuality(videoType, isMuted, resolutionName) {

        // resolutionName is an index into Resolutions (where "720" is
        // "1280x720" and "960" is "960x720" ...).
        const resolution = Resolutions[resolutionName];

        let quality = 100;
        let packetLoss;

        // TODO: take into account packet loss for received streams

        if (this._localStats.packetLoss) {
            packetLoss = this._localStats.packetLoss.upload;

            // Ugly Hack Alert (UHA):
            // The packet loss for the upload direction is calculated based on
            // incoming RTCP Receiver Reports. Since we don't have RTCP
            // termination for audio, these reports come from the actual
            // receivers in the conference and therefore the reported packet
            // loss includes loss from the bridge to the receiver.
            // When we are sending video this effect is small, because the
            // number of video packets is much larger than the number of audio
            // packets (and our calculation is based on the total number of
            // received and lost packets).
            // When video is muted, however, the effect might be significant,
            // but we don't know what it is. We do know that it is positive, so
            // as a temporary solution, until RTCP termination is implemented
            // for the audio streams, we relax the packet loss checks here.
            if (isMuted) {
                packetLoss *= 0.5;
            }
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
                const isSimulcastOn = activeTPC.isSimulcastOn();
                const videoQualitySettings = activeTPC.getTargetVideoBitrates();

                // Add the codec info as well.
                videoQualitySettings.codec = activeTPC.getConfiguredVideoCodec();

                // Time since sending of video was enabled.
                const millisSinceStart = window.performance.now()
                    - Math.max(this._timeVideoUnmuted, this._timeIceConnected);
                const statsInterval = this._options.config?.pcStatsInterval ?? 10000;

                // Expected sending bitrate in perfect conditions.
                let target = getTarget(isSimulcastOn, resolution, millisSinceStart, videoQualitySettings);

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
     * Updates the localConnectionQuality value
     * @param values {number} the new value. Should be in [0, 100].
     */
    _updateLocalConnectionQuality(value) {
        this._localStats.connectionQuality = value;
        this._lastConnectionQualityUpdate = window.performance.now();
    }

    /**
     * Broadcasts the local statistics to all other participants in the
     * conference.
     */
    _broadcastLocalStats() {
        // Send only the data that remote participants care about.
        const data = {
            bitrate: this._localStats.bitrate,
            packetLoss: this._localStats.packetLoss,
            connectionQuality: this._localStats.connectionQuality,
            jvbRTT: this._localStats.jvbRTT,
            serverRegion: this._localStats.serverRegion,
            maxEnabledResolution: this._localStats.maxEnabledResolution,
            avgAudioLevels: this._localStats.localAvgAudioLevels
        };

        try {
            this._conference.sendEndpointStatsMessage(data);
        } catch (err) {
            // Ignore the error as we might hit it in the beginning of the call before the channel is ready.
            // The statistics will be sent again after few seconds and error is logged elseware as well.
        }
    }

    /**
     * Updates the local statistics
     * @param {TraceablePeerConnection} tpc the peerconnection which emitted
     * the stats
     * @param data new statistics
     */
    _updateLocalStats(tpc, data) {
        // Update jvbRTT
        if (!tpc.isP2P) {
            const jvbRTT
                = data.transport
                    && data.transport.length && data.transport[0].rtt;

            this._localStats.jvbRTT = jvbRTT ? jvbRTT : undefined;
        }

        // Do not continue with processing of other stats if they do not
        // originate from the active peerconnection
        if (tpc !== this._conference.getActivePeerConnection()) {
            return;
        }

        let key;
        const updateLocalConnectionQuality
            = !this._conference.isConnectionInterrupted();
        const localVideoTrack
            = this._conference.getLocalVideoTrack();
        const videoType
            = localVideoTrack ? localVideoTrack.videoType : undefined;
        const isMuted = localVideoTrack ? localVideoTrack.isMuted() : true;
        const resolution = localVideoTrack
            ? Math.min(localVideoTrack.resolution, localVideoTrack.maxEnabledResolution) : null;

        if (!isMuted) {
            this._maybeUpdateUnmuteTime();
        }

        // Copy the fields already in 'data'.
        for (key in data) {
            if (data.hasOwnProperty(key)) {
                this._localStats[key] = data[key];
            }
        }

        // And re-calculate the connectionQuality field.
        if (updateLocalConnectionQuality) {
            this._updateLocalConnectionQuality(
                this._calculateConnectionQuality(
                    videoType,
                    isMuted,
                    resolution));
        }

        this.eventEmitter.emit(
            ConnectionQualityEvents.LOCAL_STATS_UPDATED,
            this._localStats);
        this._broadcastLocalStats();
    }

    /**
     * Updates remote statistics
     * @param id the id of the remote participant
     * @param data the statistics received
     */
    _updateRemoteStats(id, data) {
        // Use only the fields we need
        this._remoteStats[id] = {
            bitrate: data.bitrate,
            packetLoss: data.packetLoss,
            connectionQuality: data.connectionQuality,
            jvbRTT: data.jvbRTT,
            serverRegion: data.serverRegion,
            maxEnabledResolution: data.maxEnabledResolution,
            avgAudioLevels: data.avgAudioLevels
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
    getStats() {
        return this._localStats;
    }
}
